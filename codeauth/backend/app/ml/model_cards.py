"""
Model card — the measured facts about every engine, in one place.

Assembled from the JSON artifacts the ml_training scripts write, so what the API
reports is whatever was actually measured, not a hand-maintained claim that can
drift from reality:

    training_report.json     dataset, protocol, candidate comparison, held-out metrics
    engine_comparison.json   both engines scored over identical samples
    calibration_report.json  false-positive rate on known-human real-world code

The calibration file is the important one. In-distribution accuracy is 0.968, but
the false-positive rate on mature library code is an order of magnitude worse, and
a tool that reports authorship without saying so is misleading by omission.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

TRAINING_DIR = Path(__file__).resolve().parents[2] / "ml_training"


def _read(name: str) -> Optional[dict]:
    path = TRAINING_DIR / name
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except Exception as exc:
        logger.warning("Could not read %s: %s", name, exc)
        return None


class ModelCard:
    """Lazily loaded, cached view over the measurement artifacts."""

    def __init__(self) -> None:
        self._cache: Optional[dict] = None

    def refresh(self) -> None:
        self._cache = None

    def get(self) -> dict[str, Any]:
        if self._cache is not None:
            return self._cache

        training = _read("training_report.json")
        comparison = _read("engine_comparison.json")
        calibration = _read("calibration_report.json")

        card: dict[str, Any] = {
            "training": training,
            "engine_comparison": comparison,
            "calibration": calibration,
            "warnings": [],
            "headline": {},
        }

        if training:
            tm = training.get("test_metrics", {})
            card["headline"]["in_distribution_accuracy"] = tm.get("accuracy")
            card["headline"]["in_distribution_f1_macro"] = tm.get("f1_macro")
            card["headline"]["in_distribution_roc_auc"] = tm.get("roc_auc")
            card["headline"]["selected_model"] = training.get("selected_model")
            card["headline"]["dataset"] = (training.get("dataset") or {}).get("source")
            card["headline"]["per_language"] = {
                lang: m.get("accuracy") for lang, m in (training.get("per_language") or {}).items()
            }
            card["headline"]["group_importance_share"] = training.get("group_importance_share")

        # The domain-shift warning, with the number attached.
        if calibration:
            worst = None
            for result in calibration.get("results", []):
                if not result.get("n"):
                    continue
                fpr = result.get("false_positive_rate")
                if fpr is not None and (worst is None or fpr > worst["false_positive_rate"]):
                    worst = result
            if worst:
                card["headline"]["real_world_false_positive_rate"] = worst["false_positive_rate"]
                card["headline"]["calibration_source"] = worst["source"]
                card["warnings"].append({
                    "severity": "high",
                    "title": "Verdicts on production code are unreliable",
                    "detail": (
                        f"Measured on {worst['n']} files of known-human code from "
                        f"{worst['source']}, {worst['false_positive_rate']:.0%} were labelled "
                        f"AI — {worst['high_confidence_fp_rate']:.0%} of them at 90%+ "
                        f"confidence. The training corpus is short contest-style submissions "
                        f"where 'human' correlates with terse, loosely formatted code, so "
                        f"consistently formatted library code reads as AI. Do not use a verdict "
                        f"on real project code as evidence of anything."
                    ),
                    "measured_by": "ml_training/calibration_check.py",
                })

        if training:
            per_lang = (training.get("per_language") or {})
            weak = {
                lang: m["accuracy"]
                for lang, m in per_lang.items()
                if lang != "python" and m.get("accuracy", 1) < 0.9
            }
            if weak:
                card["warnings"].append({
                    "severity": "medium",
                    "title": "Non-Python accuracy is materially lower",
                    "detail": (
                        "Held-out accuracy by language: "
                        + ", ".join(f"{k} {v:.1%}" for k, v in sorted(weak.items()))
                        + ". These languages use regex-based structure extraction rather than a "
                        "real AST, and are under-represented in the training data."
                    ),
                    "measured_by": "ml_training/train_stylometric.py",
                })

            share = training.get("group_importance_share") or {}
            if share.get("formatting", 0) >= 50:
                card["warnings"].append({
                    "severity": "medium",
                    "title": "The model leans heavily on formatting",
                    "detail": (
                        f"Formatting features account for {share['formatting']:.0f}% of measured "
                        "permutation importance. Running a formatter over a file can therefore "
                        "move its verdict without any authorship change."
                    ),
                    "measured_by": "ml_training/train_stylometric.py",
                })

        if comparison:
            engines = comparison.get("engines", {})
            hybrid = engines.get("hybrid", {})
            claim = comparison.get("checkpoint_metadata_claim")
            if hybrid and claim and hybrid.get("accuracy") is not None:
                if hybrid["accuracy"] < claim - 0.05:
                    card["warnings"].append({
                        "severity": "high",
                        "title": "The supplied checkpoint does not reproduce its claimed accuracy",
                        "detail": (
                            f"metadata.json asserts test accuracy {claim:.4f}, but measured over "
                            f"{hybrid['n']} held-out samples the hybrid checkpoint reaches "
                            f"{hybrid['accuracy']:.4f} (ROC-AUC {hybrid.get('roc_auc')}). It is "
                            f"therefore used only as a second opinion; the stylometric model decides."
                        ),
                        "measured_by": "ml_training/evaluate_engines.py",
                    })

        if not training and not calibration:
            card["warnings"].append({
                "severity": "medium",
                "title": "No evaluation artifacts found",
                "detail": (
                    "Run ml_training/train_stylometric.py, evaluate_engines.py, and "
                    "calibration_check.py to populate measured metrics."
                ),
                "measured_by": None,
            })

        self._cache = card
        return card


model_card = ModelCard()
