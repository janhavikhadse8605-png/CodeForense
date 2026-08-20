"""Model evaluation API endpoints."""
import io
import logging
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.database.models import EvaluationRun
from app.ml.inference import run_inference
from app.ml.model import model_manager

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/evaluation/run")
async def run_evaluation(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    Upload a CSV evaluation dataset and run model evaluation.

    Expected columns: code_content, language (optional), authorship_class (HUMAN/AI)
    """
    if not model_manager.is_ready:
        raise HTTPException(status_code=503, detail="ML model is currently unavailable.")

    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported.")

    try:
        content = await file.read()
        df = pd.read_csv(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {e}")

    # Validate columns
    if "code_content" not in df.columns:
        raise HTTPException(status_code=400, detail="CSV must contain a 'code_content' column.")
    if "authorship_class" not in df.columns:
        raise HTTPException(status_code=400, detail="CSV must contain an 'authorship_class' column.")

    # Clean data
    df = df.dropna(subset=["code_content", "authorship_class"])
    df = df[df["code_content"].str.strip().str.len() > 10]

    if len(df) == 0:
        raise HTTPException(status_code=400, detail="No valid samples found in CSV after cleaning.")

    # Warnings
    warnings = []
    class_counts = df["authorship_class"].value_counts().to_dict()
    if len(class_counts) < 2:
        warnings.append("Dataset contains only one class.")
    elif min(class_counts.values()) / max(class_counts.values()) < 0.3:
        warnings.append(f"Class imbalance detected: {class_counts}")

    duplicates = df.duplicated(subset=["code_content"]).sum()
    if duplicates > 0:
        warnings.append(f"{duplicates} duplicate samples found.")

    # Run predictions
    y_true = []
    y_pred = []
    y_prob = []

    for _, row in df.iterrows():
        try:
            code = str(row["code_content"])
            language = str(row.get("language", "python"))
            true_label = str(row["authorship_class"]).upper().strip()

            if true_label in ("HUMAN", "0"):
                y_true.append(0)
            elif true_label in ("AI", "1"):
                y_true.append(1)
            else:
                continue

            result = run_inference(code, language)

            if "HUMAN" in result["prediction"]:
                y_pred.append(0)
            else:
                y_pred.append(1)

            y_prob.append(result["ai_probability"] / 100.0)

        except Exception as e:
            logger.warning(f"Evaluation inference failed for sample: {e}")
            continue

    if len(y_true) < 2:
        raise HTTPException(status_code=400, detail="Not enough valid predictions for evaluation.")

    # Calculate metrics
    from sklearn.metrics import (
        accuracy_score, precision_score, recall_score, f1_score,
        confusion_matrix as calc_confusion_matrix, roc_auc_score,
    )

    accuracy = accuracy_score(y_true, y_pred)
    precision = precision_score(y_true, y_pred, zero_division=0)
    recall = recall_score(y_true, y_pred, zero_division=0)
    f1_macro = f1_score(y_true, y_pred, average="macro", zero_division=0)
    f1_weighted = f1_score(y_true, y_pred, average="weighted", zero_division=0)

    cm = calc_confusion_matrix(y_true, y_pred).tolist()

    try:
        roc_auc = roc_auc_score(y_true, y_prob)
    except ValueError:
        roc_auc = None

    # Save to DB
    eval_run = EvaluationRun(
        dataset_size=len(y_true),
        accuracy=round(accuracy, 4),
        precision=round(precision, 4),
        recall=round(recall, 4),
        f1_macro=round(f1_macro, 4),
        f1_weighted=round(f1_weighted, 4),
        roc_auc=round(roc_auc, 4) if roc_auc is not None else None,
        confusion_matrix={"matrix": cm, "labels": ["HUMAN", "AI"]},
        class_distribution=class_counts,
        metrics_detail={"warnings": warnings, "samples_evaluated": len(y_true)},
    )
    db.add(eval_run)
    db.commit()
    db.refresh(eval_run)

    return {
        "id": eval_run.id,
        "dataset_size": len(y_true),
        "accuracy": round(accuracy, 4),
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1_macro": round(f1_macro, 4),
        "f1_weighted": round(f1_weighted, 4),
        "roc_auc": round(roc_auc, 4) if roc_auc is not None else None,
        "confusion_matrix": {"matrix": cm, "labels": ["HUMAN", "AI"]},
        "class_distribution": class_counts,
        "warnings": warnings,
        "created_at": eval_run.created_at.isoformat(),
    }


@router.get("/evaluation/latest")
async def get_latest_evaluation(db: Session = Depends(get_db)):
    """Get the most recent evaluation run results."""
    eval_run = db.query(EvaluationRun).order_by(EvaluationRun.created_at.desc()).first()

    if not eval_run:
        return {
            "message": "Evaluation metrics have not been persisted for this model.",
            "available": False,
        }

    return {
        "available": True,
        "id": eval_run.id,
        "dataset_size": eval_run.dataset_size,
        "accuracy": eval_run.accuracy,
        "precision": eval_run.precision,
        "recall": eval_run.recall,
        "f1_macro": eval_run.f1_macro,
        "f1_weighted": eval_run.f1_weighted,
        "roc_auc": eval_run.roc_auc,
        "confusion_matrix": eval_run.confusion_matrix,
        "class_distribution": eval_run.class_distribution,
        "metrics_detail": eval_run.metrics_detail,
        "created_at": eval_run.created_at.isoformat(),
    }
