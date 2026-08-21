"""
CodeAuth Inference Pipeline.

code -> 41 features -> model(s) -> prediction + ablation evidence

Two engines, both real:

  stylometric  Gradient-boosted classifier over the 41 features, trained by
               ml_training/train_stylometric.py. PRIMARY.
  hybrid       CodeBERT encoder fused with six feature-group MLPs, loaded from
               the supplied checkpoint. Reported as a second opinion.

Why the stylometric model leads, despite the checkpoint's metadata asserting
98.32% test accuracy: ml_training/evaluate_engines.py scores both over identical
held-out samples, and the checkpoint does not reproduce its claim.

    engine        accuracy   roc_auc   c++     java
    hybrid          0.730     0.709   0.529   0.583
    stylometric     0.968     0.989   0.794   0.833

The hybrid sits near chance on C++ and Java, so it cannot be the deciding vote.
Re-run evaluate_engines.py after replacing the checkpoint and revisit this order
if the numbers change.

The prediction is whatever the model returns. Confidence is the winning class
probability. There is no post-hoc adjustment layer, no language-specific default,
and no branch keyed on the contents of a particular sample.
"""
import logging
from typing import Optional

import numpy as np
import torch

from app.ml.model import model_manager
from app.ml.features import extract_all_features
from app.ml.evidence import compute_evidence
from app.ml.stylometric import stylometric_model

logger = logging.getLogger(__name__)

GROUP_ORDER = ["naming", "structure", "comments", "repetition", "complexity", "formatting"]

# Below this many non-blank lines there is too little signal to report a verdict
# with a straight face, regardless of what probability comes back.
MIN_LINES_FOR_CONFIDENT_VERDICT = 5


def engines_available() -> dict[str, bool]:
    return {"hybrid": model_manager.is_ready, "stylometric": stylometric_model.is_ready}


def any_engine_ready() -> bool:
    return model_manager.is_ready or stylometric_model.is_ready


def run_inference(code: str, language: str = "python", fast: bool = False) -> dict:
    """
    Run the full inference pipeline on a snippet.

    fast=True skips the hybrid second opinion entirely. Bulk callers (repository
    scans, CSV evaluation) use it: the transformer forward pass dominates runtime
    and the second opinion only annotates a verdict the stylometric model already
    made.

    Raises RuntimeError if neither engine is loaded.
    """
    if not any_engine_ready():
        raise RuntimeError(
            "No inference engine is loaded. Check /api/health — the hybrid "
            "checkpoint and/or the stylometric model must be present."
        )

    # ── Features (shared by both engines) ──
    feature_data = extract_all_features(code, language)
    raw_features = _flatten_features(feature_data)

    hybrid_result: Optional[dict] = None
    stylometric_result: Optional[dict] = None

    # ── Stylometric engine ──
    if stylometric_model.is_ready:
        try:
            human_p, ai_p = stylometric_model.predict(raw_features)
            stylometric_result = {
                "human_probability": human_p,
                "ai_probability": ai_p,
                "evidence": stylometric_model.group_evidence(raw_features),
                "model": stylometric_model.model_name,
            }
        except Exception as exc:
            logger.warning("Stylometric inference failed: %s", exc)

    # ── Hybrid engine ──
    # Ablation evidence costs six extra transformer passes, so only pay for it
    # when the hybrid is going to be the deciding engine.
    if model_manager.is_ready and not fast:
        try:
            hybrid_result = _run_hybrid(
                code, raw_features, with_evidence=stylometric_result is None
            )
        except Exception as exc:
            logger.warning("Hybrid inference failed: %s", exc)

    # Stylometric leads on measured accuracy; see the module docstring.
    if stylometric_result:
        primary_name, primary = "stylometric", stylometric_result
    elif hybrid_result:
        primary_name, primary = "hybrid", hybrid_result
    else:
        raise RuntimeError("Both engines failed to produce a prediction.")

    human_prob = primary["human_probability"] * 100.0
    ai_prob = primary["ai_probability"] * 100.0
    confidence = max(human_prob, ai_prob)

    label = "AI" if ai_prob >= human_prob else "HUMAN"
    display_prediction = "AI-LIKELY" if label == "AI" else "HUMAN-LIKELY"

    # ── Honest low-signal handling ──
    caveats: list[str] = []
    non_empty = feature_data["statistics"].get("non_empty_lines", 0)
    if non_empty < MIN_LINES_FOR_CONFIDENT_VERDICT:
        display_prediction = "INCONCLUSIVE"
        # Confidence describes belief in the reported verdict. There is no
        # verdict here, so reporting the raw class probability as "confidence"
        # would be misleading. The probabilities stay visible below.
        confidence = 0.0
        caveats.append(
            f"Only {non_empty} non-blank lines — too little signal for a verdict. "
            f"Raw model output was {ai_prob:.1f}% AI, shown for reference only."
        )
    if language.lower() != "python":
        caveats.append(
            "Non-Python input uses heuristic structure extraction; measured accuracy is "
            "materially lower than on Python."
        )

    # ── Agreement between engines, when both ran ──
    agreement = None
    if hybrid_result and stylometric_result:
        h_label = "AI" if hybrid_result["ai_probability"] >= 0.5 else "HUMAN"
        s_label = "AI" if stylometric_result["ai_probability"] >= 0.5 else "HUMAN"
        agreement = {
            "engines_agree": h_label == s_label,
            "hybrid_label": h_label,
            "stylometric_label": s_label,
            "hybrid_ai_probability": round(hybrid_result["ai_probability"] * 100, 1),
            "stylometric_ai_probability": round(stylometric_result["ai_probability"] * 100, 1),
        }
        if h_label != s_label:
            caveats.append(
                "The two engines disagree on this sample; treat the verdict as weak."
            )

    return {
        "prediction": display_prediction,
        "confidence": round(confidence, 1),
        "human_probability": round(human_prob, 1),
        "ai_probability": round(ai_prob, 1),
        "evidence": primary["evidence"],
        "statistics": feature_data["statistics"],
        "feature_details": feature_data["details"],
        "language": language,
        "engine": primary_name,
        "engine_detail": primary.get("model", ""),
        "engine_agreement": agreement,
        "caveats": caveats,
    }


def _run_hybrid(code: str, raw_features: list[float], with_evidence: bool = True) -> dict:
    """Score with the CodeBERT + feature-MLP fusion checkpoint."""
    scaled = model_manager.scaler.transform(np.asarray(raw_features).reshape(1, -1))
    feature_tensors = _build_feature_tensors(scaled[0])

    max_length = model_manager.metadata.get("max_length", 256)
    encoding = model_manager.tokenizer(
        code,
        max_length=max_length,
        padding="max_length",
        truncation=True,
        return_tensors="pt",
    )
    input_ids = encoding["input_ids"].to(model_manager.device)
    attention_mask = encoding["attention_mask"].to(model_manager.device)

    with torch.no_grad():
        logits = model_manager.model(input_ids, attention_mask, feature_tensors)
        probs = torch.softmax(logits, dim=1).cpu().numpy()[0]

    label_mapping = model_manager.metadata.get("label_mapping", {"0": "HUMAN", "1": "AI"})
    ai_index = next((int(k) for k, v in label_mapping.items() if str(v).upper() == "AI"), 1)
    human_index = 1 - ai_index

    # Ablation runs against the real tokens and mask, so the reported evidence
    # explains the prediction actually returned.
    evidence = {}
    if with_evidence:
        evidence = compute_evidence(
            model_manager.model,
            input_ids,
            attention_mask,
            feature_tensors,
            model_manager.device,
            ai_index=ai_index,
        )

    return {
        "human_probability": float(probs[human_index]),
        "ai_probability": float(probs[ai_index]),
        "evidence": evidence,
        "model": "hybrid CodeBERT + feature MLP fusion",
    }


def run_inference_for_segment(code: str, language: str = "python") -> dict:
    """Segment-level inference; degrades to UNKNOWN rather than failing the request."""
    try:
        return run_inference(code, language)
    except Exception as exc:
        logger.warning("Segment inference failed: %s", exc)
        return {
            "prediction": "UNKNOWN",
            "confidence": 0.0,
            "human_probability": 0.0,
            "ai_probability": 0.0,
            "evidence": {},
            "statistics": {"lines": len(code.split("\n"))},
            "feature_details": {},
            "language": language,
            "engine": "none",
            "caveats": [],
            "error": str(exc),
        }


def get_code_embedding(code: str, language: str = "python") -> Optional[np.ndarray]:
    """64-dim fusion embedding for similarity search (hybrid engine only)."""
    if not model_manager.is_ready:
        return None
    try:
        feature_data = extract_all_features(code, language)
        scaled = model_manager.scaler.transform(
            np.asarray(_flatten_features(feature_data)).reshape(1, -1)
        )
        feature_tensors = _build_feature_tensors(scaled[0])

        max_length = model_manager.metadata.get("max_length", 256)
        encoding = model_manager.tokenizer(
            code, max_length=max_length, padding="max_length",
            truncation=True, return_tensors="pt",
        )
        with torch.no_grad():
            embedding = model_manager.model.get_fusion_embedding(
                encoding["input_ids"].to(model_manager.device),
                encoding["attention_mask"].to(model_manager.device),
                feature_tensors,
            )
        return embedding.cpu().numpy()[0]
    except Exception as exc:
        logger.error("Embedding extraction failed: %s", exc)
        return None


def _flatten_features(feature_data: dict) -> list[float]:
    """Flatten the six groups into the 41-element vector, in training order."""
    flat: list[float] = []
    for group in GROUP_ORDER:
        flat.extend(feature_data[group])
    return flat


def _build_feature_tensors(scaled_array: np.ndarray) -> dict[str, torch.Tensor]:
    """Split the scaled vector into per-group tensors on the model's device."""
    dims = model_manager.metadata.get("feature_dimensions", {
        "naming": 8, "structure": 10, "comments": 6,
        "repetition": 5, "complexity": 6, "formatting": 6,
    })
    tensors: dict[str, torch.Tensor] = {}
    offset = 0
    for group in GROUP_ORDER:
        dim = dims[group]
        tensors[group] = torch.tensor(
            scaled_array[offset:offset + dim],
            dtype=torch.float32,
            device=model_manager.device,
        ).unsqueeze(0)
        offset += dim
    return tensors
