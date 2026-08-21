"""
Train and evaluate a stylometric human/AI code classifier on CodeAuth's 41 features.

Why this exists alongside the CodeBERT hybrid checkpoint:
  * It is fully reproducible from source — dataset fetch, training, and metrics
    all run from this repository with no opaque artifact.
  * It runs on CPU in seconds, so repository-scale scans stay usable.
  * Its decisions are directly attributable to named features, which is what the
    explainability requirement actually asks for.

Features come from app.ml.features.extract_all_features — the *same* code path
used at inference time, so trained and served representations cannot drift.

Protocol:
  train.csv       -> fit candidates
  validation.csv  -> select the model (macro F1)
  test.csv        -> reported once, never used for any decision

Usage:
    python train_stylometric.py
    python train_stylometric.py --max-rows 1500
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

HERE = Path(__file__).parent
BACKEND = HERE.parent
sys.path.insert(0, str(BACKEND))

import logging  # noqa: E402

from app.ml.features import extract_all_features  # noqa: E402

# Dataset rows are often snippets rather than whole modules, so AST parse
# failures are expected and the heuristic path handles them. Keep the log quiet.
logging.getLogger("app.ml.features").setLevel(logging.ERROR)

from sklearn.ensemble import (  # noqa: E402
    HistGradientBoostingClassifier,
    RandomForestClassifier,
)
from sklearn.inspection import permutation_importance  # noqa: E402
from sklearn.linear_model import LogisticRegression  # noqa: E402
from sklearn.metrics import (  # noqa: E402
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import StratifiedKFold, cross_val_score  # noqa: E402
from sklearn.pipeline import Pipeline  # noqa: E402
from sklearn.preprocessing import StandardScaler  # noqa: E402

DATA = HERE / "data"
OUT_MODEL = BACKEND / "model_files" / "stylometric_model.pkl"
OUT_REPORT = HERE / "training_report.json"

FEATURE_GROUPS: dict[str, list[str]] = {
    "naming": [
        "identifier_count", "avg_identifier_length", "identifier_length_variance",
        "snake_case_ratio", "camel_case_ratio", "uppercase_ratio",
        "single_char_ratio", "naming_consistency",
    ],
    "structure": [
        "ast_node_count", "function_count", "class_count", "loop_count",
        "conditional_count", "branch_count", "return_count",
        "exception_handling_count", "max_nesting_depth", "lines_of_code",
    ],
    "comments": [
        "comment_count", "comment_code_ratio", "avg_comment_length",
        "docstring_count", "comment_words", "comments_per_function",
    ],
    "repetition": [
        "duplicate_line_ratio", "repeated_token_ratio", "repeated_statement_count",
        "repeated_block_count", "repetition_score",
    ],
    "complexity": [
        "avg_complexity", "max_complexity", "cx_branch_count", "cx_loop_count",
        "boolean_expression_count", "avg_nesting_depth",
    ],
    "formatting": [
        "avg_line_length", "line_length_variance", "indentation_consistency",
        "blank_line_ratio", "whitespace_consistency", "formatting_score",
    ],
}
GROUP_ORDER = list(FEATURE_GROUPS)
FEATURE_NAMES = [name for g in GROUP_ORDER for name in FEATURE_GROUPS[g]]


def featurise(df: pd.DataFrame, label: str) -> tuple[np.ndarray, np.ndarray, pd.DataFrame]:
    """Extract the 41-dim vector for every row, dropping rows that fail to parse."""
    vectors, labels, keep = [], [], []
    t0 = time.time()
    for i, row in enumerate(df.itertuples(index=False)):
        try:
            fd = extract_all_features(str(row.code_content), str(row.language))
            vec = [v for g in GROUP_ORDER for v in fd[g]]
            if len(vec) != len(FEATURE_NAMES):
                continue
            if not all(np.isfinite(vec)):
                continue
            vectors.append(vec)
            labels.append(1 if str(row.authorship_class).upper() == "AI" else 0)
            keep.append(i)
        except Exception:
            continue
        if (i + 1) % 500 == 0:
            print(f"    {label}: {i + 1}/{len(df)} extracted", flush=True)
    print(f"  {label}: kept {len(vectors)}/{len(df)} rows in {time.time() - t0:.1f}s")
    return np.asarray(vectors, dtype=np.float64), np.asarray(labels), df.iloc[keep].reset_index(drop=True)


def metrics_for(y_true: np.ndarray, y_pred: np.ndarray, y_prob: np.ndarray | None) -> dict:
    out = {
        "n": int(len(y_true)),
        "accuracy": round(float(accuracy_score(y_true, y_pred)), 4),
        "precision_ai": round(float(precision_score(y_true, y_pred, zero_division=0)), 4),
        "recall_ai": round(float(recall_score(y_true, y_pred, zero_division=0)), 4),
        "f1_macro": round(float(f1_score(y_true, y_pred, average="macro", zero_division=0)), 4),
        "f1_weighted": round(float(f1_score(y_true, y_pred, average="weighted", zero_division=0)), 4),
        "confusion_matrix": confusion_matrix(y_true, y_pred).tolist(),
        "confusion_labels": ["HUMAN", "AI"],
    }
    if y_prob is not None and len(set(y_true.tolist())) > 1:
        out["roc_auc"] = round(float(roc_auc_score(y_true, y_prob)), 4)
    return out


def candidates() -> dict[str, Pipeline]:
    return {
        "logistic_regression": Pipeline([
            ("scale", StandardScaler()),
            ("clf", LogisticRegression(max_iter=2000, C=1.0, class_weight="balanced")),
        ]),
        "random_forest": Pipeline([
            ("scale", StandardScaler()),
            ("clf", RandomForestClassifier(
                n_estimators=300, min_samples_leaf=2, class_weight="balanced",
                random_state=42, n_jobs=1)),
        ]),
        "hist_gradient_boosting": Pipeline([
            ("scale", StandardScaler()),
            ("clf", HistGradientBoostingClassifier(
                max_iter=400, learning_rate=0.08, max_leaf_nodes=31, random_state=42)),
        ]),
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--max-rows", type=int, default=None, help="cap rows per split (fast runs)")
    args = ap.parse_args()

    frames = {}
    for split in ("train", "validation", "test"):
        path = DATA / f"{split}.csv"
        if not path.exists():
            raise SystemExit(f"missing {path} — run fetch_dataset.py first")
        df = pd.read_csv(path).dropna(subset=["code_content", "authorship_class"])
        if args.max_rows:
            df = df.head(args.max_rows)
        frames[split] = df

    print("Extracting features (same extractor the API serves)…", flush=True)
    X, y, meta = {}, {}, {}
    for split, df in frames.items():
        X[split], y[split], meta[split] = featurise(df, split)

    print("\nCross-validating candidates on train, selecting on validation…", flush=True)
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    results = {}
    for name, pipe in candidates().items():
        cv_scores = cross_val_score(pipe, X["train"], y["train"], cv=cv, scoring="f1_macro", n_jobs=4)
        pipe.fit(X["train"], y["train"])
        val_pred = pipe.predict(X["validation"])
        val_prob = pipe.predict_proba(X["validation"])[:, 1]
        val = metrics_for(y["validation"], val_pred, val_prob)
        results[name] = {
            "cv_f1_macro_mean": round(float(cv_scores.mean()), 4),
            "cv_f1_macro_std": round(float(cv_scores.std()), 4),
            "validation": val,
            "_pipe": pipe,
        }
        print(f"  {name:24s} cv={cv_scores.mean():.4f}±{cv_scores.std():.4f}  val_f1={val['f1_macro']:.4f}", flush=True)

    best_name = max(results, key=lambda k: results[k]["validation"]["f1_macro"])
    best = results[best_name]["_pipe"]
    print(f"\nSelected: {best_name}")

    # ── Held-out test set: touched exactly once ──
    test_pred = best.predict(X["test"])
    test_prob = best.predict_proba(X["test"])[:, 1]
    test_metrics = metrics_for(y["test"], test_pred, test_prob)
    print(f"TEST  accuracy={test_metrics['accuracy']:.4f}  f1_macro={test_metrics['f1_macro']:.4f}  "
          f"roc_auc={test_metrics.get('roc_auc', float('nan')):.4f}")

    # ── Per-language generalisation ──
    per_language = {}
    for lang in sorted(meta["test"]["language"].unique()):
        mask = (meta["test"]["language"] == lang).to_numpy()
        if mask.sum() >= 20:
            per_language[str(lang)] = metrics_for(y["test"][mask], test_pred[mask], test_prob[mask])
            print(f"  {lang:12s} n={mask.sum():<5} acc={per_language[str(lang)]['accuracy']:.3f}")

    # ── Per-generator recall: does it catch every model's output, or just some? ──
    per_generator = {}
    if "generator" in meta["test"].columns:
        for gen in meta["test"]["generator"].unique():
            mask = ((meta["test"]["generator"] == gen) & (y["test"] == 1)).to_numpy()
            if mask.sum() >= 10:
                per_generator[str(gen)] = {
                    "n": int(mask.sum()),
                    "recall": round(float((test_pred[mask] == 1).mean()), 4),
                }

    # ── Explainability: permutation importance, aggregated per feature group ──
    print("\nComputing permutation importance…")
    perm = permutation_importance(
        best, X["test"], y["test"], n_repeats=5, random_state=42, scoring="f1_macro", n_jobs=1
    )
    feature_importance = {
        FEATURE_NAMES[i]: round(float(perm.importances_mean[i]), 5)
        for i in np.argsort(perm.importances_mean)[::-1]
    }
    group_importance, cursor = {}, 0
    for g in GROUP_ORDER:
        size = len(FEATURE_GROUPS[g])
        group_importance[g] = round(float(perm.importances_mean[cursor:cursor + size].sum()), 5)
        cursor += size
    total = sum(max(v, 0) for v in group_importance.values()) or 1.0
    group_share = {g: round(max(v, 0) / total * 100, 1) for g, v in group_importance.items()}

    print("  top features:", ", ".join(list(feature_importance)[:6]))
    print("  group share:", group_share)

    # ── Persist ──
    OUT_MODEL.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({
        "pipeline": best,
        "model_name": best_name,
        "feature_names": FEATURE_NAMES,
        "feature_groups": FEATURE_GROUPS,
        "group_order": GROUP_ORDER,
        "label_mapping": {"0": "HUMAN", "1": "AI"},
        "group_importance_share": group_share,
        "test_metrics": test_metrics,
        "trained_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }, OUT_MODEL)

    report = {
        "dataset": {
            "source": "LTPhong/CSC15011_Detecting_AI-Generated_Code (Hugging Face)",
            "note": "test.csv is a disjoint slice of the official validation split; "
                    "the dataset's own test split returns HTTP 500 from datasets-server.",
            "splits": {
                s: {
                    "rows_used": int(len(y[s])),
                    "human": int((y[s] == 0).sum()),
                    "ai": int((y[s] == 1).sum()),
                    "languages": {k: int(v) for k, v in meta[s]["language"].value_counts().items()},
                }
                for s in ("train", "validation", "test")
            },
        },
        "protocol": {
            "features": f"{len(FEATURE_NAMES)} stylometric features via app.ml.features",
            "selection": "5-fold StratifiedKFold CV on train, model chosen by validation macro F1",
            "test_usage": "evaluated once after selection",
        },
        "candidates": {
            k: {kk: vv for kk, vv in v.items() if kk != "_pipe"} for k, v in results.items()
        },
        "selected_model": best_name,
        "test_metrics": test_metrics,
        "per_language": per_language,
        "per_generator_recall": per_generator,
        "feature_importance": feature_importance,
        "group_importance_share": group_share,
        "artifact": str(OUT_MODEL.relative_to(BACKEND)),
    }
    OUT_REPORT.write_text(json.dumps(report, indent=2))
    print(f"\nSaved model  -> {OUT_MODEL}")
    print(f"Saved report -> {OUT_REPORT}")


if __name__ == "__main__":
    main()
