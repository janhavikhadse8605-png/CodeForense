"""Code evolution analysis API endpoints."""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.ml.inference import run_inference
from app.ml.model import model_manager
from app.schemas.analysis import EvolutionRequest

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/evolution/analyze")
async def analyze_evolution(request: EvolutionRequest, db: Session = Depends(get_db)):
    """Analyze code evolution across multiple versions."""
    if not model_manager.is_ready:
        raise HTTPException(status_code=503, detail="ML model is currently unavailable.")

    if len(request.versions) < 2:
        raise HTTPException(status_code=400, detail="At least 2 versions are required for evolution analysis.")

    version_results = []
    previous_evidence = None
    style_shifts = []

    for i, version in enumerate(request.versions):
        code = version.get("code", "")
        label = version.get("label", f"Version {i + 1}")
        timestamp = version.get("timestamp", "")

        if not code.strip():
            continue

        try:
            result = run_inference(code, request.language)
            version_results.append({
                "label": label,
                "prediction": result["prediction"],
                "confidence": result["confidence"],
                "ai_probability": result["ai_probability"],
                "human_probability": result["human_probability"],
                "evidence": result["evidence"],
                "timestamp": timestamp,
            })

            # Detect style shifts
            if previous_evidence is not None:
                shift_magnitude = _compute_style_shift(previous_evidence, result["evidence"])
                if shift_magnitude > 20:
                    style_shifts.append({
                        "from_version": request.versions[i - 1].get("label", f"Version {i}"),
                        "to_version": label,
                        "magnitude": round(shift_magnitude, 1),
                        "description": f"Significant authorship-style shift detected between {request.versions[i - 1].get('label', f'Version {i}')} and {label}.",
                        "details": _get_shift_details(previous_evidence, result["evidence"]),
                    })

            previous_evidence = result["evidence"]

        except Exception as e:
            logger.warning(f"Evolution analysis failed for version {label}: {e}")
            version_results.append({
                "label": label,
                "prediction": "UNKNOWN",
                "confidence": 0,
                "ai_probability": 0,
                "human_probability": 0,
                "timestamp": timestamp,
                "error": str(e),
            })

    return {
        "id": str(hash(str(request.versions)))[:16],
        "versions": version_results,
        "style_shifts": style_shifts,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


def _compute_style_shift(prev_evidence: dict, curr_evidence: dict) -> float:
    """Compute the magnitude of style shift between two versions."""
    total_shift = 0
    count = 0
    for key in prev_evidence:
        if key in curr_evidence:
            total_shift += abs(prev_evidence[key] - curr_evidence[key])
            count += 1
    return total_shift / max(count, 1)


def _get_shift_details(prev_evidence: dict, curr_evidence: dict) -> list[dict]:
    """Get detailed breakdown of which features shifted most."""
    details = []
    for key in prev_evidence:
        if key in curr_evidence:
            diff = curr_evidence[key] - prev_evidence[key]
            if abs(diff) > 5:
                details.append({
                    "feature": key,
                    "previous": prev_evidence[key],
                    "current": curr_evidence[key],
                    "change": round(diff, 1),
                    "direction": "increased" if diff > 0 else "decreased",
                })
    details.sort(key=lambda x: abs(x["change"]), reverse=True)
    return details
