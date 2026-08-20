"""Reviewer feedback API endpoints."""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.database.models import Feedback
from app.schemas.analysis import FeedbackRequest, FeedbackStats

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/feedback")
async def submit_feedback(request: FeedbackRequest, db: Session = Depends(get_db)):
    """Submit reviewer feedback for an analysis."""
    feedback = Feedback(
        analysis_id=request.analysis_id,
        code_hash=request.code_hash,
        prediction=request.prediction,
        confidence=request.confidence,
        reviewer_label=request.reviewer_label,
        actual_authorship=request.actual_authorship,
        comment=request.comment,
    )
    db.add(feedback)
    db.commit()
    db.refresh(feedback)

    return {
        "id": feedback.id,
        "reviewer_label": feedback.reviewer_label,
        "actual_authorship": feedback.actual_authorship,
        "comment": feedback.comment,
        "created_at": feedback.created_at.isoformat(),
    }


@router.get("/feedback")
async def get_feedback(db: Session = Depends(get_db)):
    """Get all feedback and statistics."""
    all_feedback = db.query(Feedback).order_by(Feedback.created_at.desc()).all()

    total = len(all_feedback)
    correct = sum(1 for f in all_feedback if f.reviewer_label == "correct")
    incorrect = sum(1 for f in all_feedback if f.reviewer_label == "incorrect")

    return {
        "stats": {
            "total_reviewed": total,
            "correct_predictions": correct,
            "incorrect_predictions": incorrect,
            "agreement_rate": round(correct / max(total, 1) * 100, 1),
        },
        "items": [
            {
                "id": f.id,
                "analysis_id": f.analysis_id,
                "prediction": f.prediction,
                "confidence": f.confidence,
                "reviewer_label": f.reviewer_label,
                "actual_authorship": f.actual_authorship,
                "comment": f.comment,
                "created_at": f.created_at.isoformat(),
            }
            for f in all_feedback
        ],
    }
