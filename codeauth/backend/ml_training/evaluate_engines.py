"""
Measure both inference engines on the same held-out split.

The checkpoint's metadata.json asserts test_accuracy = 0.9832, but that number
was written by whoever trained it and describes a split this repository has no
copy of. This script does not take it on faith: it scores the hybrid checkpoint
and the stylometric model over identical samples and prints what each actually
achieves, including per-language breakdowns and the rate at which each engine
predicts AI versus the true base rate.

Usage:
    python evaluate_engines.py --n 600
    python evaluate_engines.py --n 2500 --device cpu
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from pathlib import Path

HERE = Path(__file__).parent
BACKEND = HERE.parent
sys.path.insert(0, str(BACKEND))

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
import torch  # noqa: E402

logging.getLogger("app.ml.features").setLevel(logging.ERROR)

from app.ml.features import extract_all_features  # noqa: E402
from app.ml.inference import _build_feature_tensors, _flatten_features  # noqa: E402
from app.ml.model import model_manager  # noqa: E402
from app.ml.stylometric import stylometric_model  # noqa: E402

from sklearn.metrics import (  # noqa: E402
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)

MODEL_DIR = BACKEND / "model_files"
TEST_CSV = HERE / "data" / "test.csv"
OUT = HERE / "engine_comparison.json"


def summarise(name: str, y: np.ndarray, prob: np.ndarray, langs: np.ndarray) -> dict:
    pred = (prob >= 0.5).astype(int)
    out = {
        "engine": name,
        "n": int(len(y)),
        "accuracy": round(float(accuracy_score(y, pred)), 4),
        "precision_ai": round(float(precision_score(y, pred, zero_division=0)), 4),
        "recall_ai": round(float(recall_score(y, pred, zero_division=0)), 4),
        "f1_macro": round(float(f1_score(y, pred, average="macro", zero_division=0)), 4),
        "confusion_matrix": confusion_matrix(y, pred).tolist(),
        "predicts_ai_rate": round(float(pred.mean()), 4),
        "true_ai_rate": round(float(y.mean()), 4),
        "mean_ai_prob_on_human_truth": round(float(prob[y == 0].mean()), 4) if (y == 0).any() else None,
        "mean_ai_prob_on_ai_truth": round(float(prob[y == 1].mean()), 4) if (y == 1).any() else None,
        "per_language": {},
    }
    try:
        out["roc_auc"] = round(float(roc_auc_score(y, prob)), 4)
    except ValueError:
        out["roc_auc"] = None

    for lang in sorted(set(langs.tolist())):
        mask = langs == lang
        if mask.sum() >= 15:
            out["per_language"][str(lang)] = {
                "n": int(mask.sum()),
                "accuracy": round(float(accuracy_score(y[mask], pred[mask])), 4),
                "f1_macro": round(float(f1_score(y[mask], pred[mask], average="macro", zero_division=0)), 4),
            }
    return out


def print_summary(s: dict) -> None:
    print(f"\n{s['engine']}  (n={s['n']})")
    print(f"  accuracy {s['accuracy']:.4f}   f1_macro {s['f1_macro']:.4f}   "
          f"roc_auc {s['roc_auc'] if s['roc_auc'] is not None else float('nan')}")
    print(f"  precision(AI) {s['precision_ai']:.4f}   recall(AI) {s['recall_ai']:.4f}")
    print(f"  confusion {s['confusion_matrix']}  [[TN,FP],[FN,TP]]")
    print(f"  predicts AI on {s['predicts_ai_rate']:.1%} of samples (true rate {s['true_ai_rate']:.1%})")
    print(f"  mean P(AI): on human-truth {s['mean_ai_prob_on_human_truth']}  "
          f"on ai-truth {s['mean_ai_prob_on_ai_truth']}")
    for lang, m in s["per_language"].items():
        print(f"    {lang:10s} n={m['n']:<5} acc={m['accuracy']:.3f}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--n", type=int, default=600, help="samples to score")
    ap.add_argument("--device", default="cpu", help="device for the hybrid encoder")
    args = ap.parse_args()

    model_manager.load(str(MODEL_DIR), args.device)
    stylometric_model.load(MODEL_DIR / "stylometric_model.pkl")
    print(f"hybrid ready={model_manager.is_ready}  stylometric ready={stylometric_model.is_ready}")
    if not (model_manager.is_ready or stylometric_model.is_ready):
        raise SystemExit("no engine available")

    df = pd.read_csv(TEST_CSV)
    if args.n < len(df):
        df = df.sample(n=args.n, random_state=7)

    y, hybrid_p, stylo_p, langs = [], [], [], []
    t0 = time.time()
    for i, row in enumerate(df.itertuples(index=False)):
        code, lang = str(row.code_content), str(row.language)
        try:
            vector = _flatten_features(extract_all_features(code, lang))

            hp = np.nan
            if model_manager.is_ready:
                scaled = model_manager.scaler.transform(np.asarray(vector).reshape(1, -1))
                tensors = _build_feature_tensors(scaled[0])
                enc = model_manager.tokenizer(
                    code, max_length=model_manager.metadata.get("max_length", 256),
                    padding="max_length", truncation=True, return_tensors="pt",
                )
                with torch.no_grad():
                    logits = model_manager.model(
                        enc["input_ids"].to(model_manager.device),
                        enc["attention_mask"].to(model_manager.device),
                        tensors,
                    )
                    hp = float(torch.softmax(logits, dim=1).cpu().numpy()[0][1])

            sp = float(stylometric_model.predict(vector)[1]) if stylometric_model.is_ready else np.nan
        except Exception:
            continue

        y.append(1 if str(row.authorship_class).upper() == "AI" else 0)
        hybrid_p.append(hp)
        stylo_p.append(sp)
        langs.append(lang)
        if (i + 1) % 150 == 0:
            print(f"  {i + 1}/{len(df)} scored ({time.time() - t0:.0f}s)", flush=True)

    y = np.asarray(y)
    langs = np.asarray(langs)
    print(f"\nscored {len(y)} samples in {time.time() - t0:.0f}s")

    report = {"samples": int(len(y)), "engines": {}}
    if model_manager.is_ready:
        s = summarise("HYBRID CodeBERT + feature MLP fusion", y, np.asarray(hybrid_p), langs)
        print_summary(s)
        report["engines"]["hybrid"] = s
    if stylometric_model.is_ready:
        s = summarise("STYLOMETRIC gradient boosting", y, np.asarray(stylo_p), langs)
        print_summary(s)
        report["engines"]["stylometric"] = s

    report["checkpoint_metadata_claim"] = model_manager.metadata.get("test_accuracy")
    OUT.write_text(json.dumps(report, indent=2))
    print(f"\nclaimed in checkpoint metadata: {report['checkpoint_metadata_claim']}")
    print(f"saved -> {OUT}")


if __name__ == "__main__":
    main()
