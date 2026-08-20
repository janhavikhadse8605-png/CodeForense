"""Code analysis API endpoints."""
import hashlib
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.database.models import Analysis, AnalysisSegment
from app.schemas.analysis import (
    AnalyzeRequest, AnalysisResponse, SegmentResult,
    FunctionLevelRequest,
)
from app.ml.inference import run_inference, run_inference_for_segment
from app.ml.segmentation import segment_code, analyze_mixed_authorship
from app.ml.model import model_manager

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/analyze", response_model=AnalysisResponse)
async def analyze_code(request: AnalyzeRequest, db: Session = Depends(get_db)):
    """
    Analyze a code snippet for authorship.

    Returns prediction, confidence, evidence, statistics, and function-level results.
    """
    if not model_manager.is_ready:
        raise HTTPException(status_code=503, detail="ML model is currently unavailable. Check /api/health for details.")

    if not request.code.strip():
        raise HTTPException(status_code=400, detail="Please enter source code before analysis.")

    if len(request.code) > 500_000:
        raise HTTPException(status_code=400, detail="Code exceeds maximum size limit (500KB).")

    try:
        # Run inference
        result = run_inference(request.code, request.language)

        # Segment and run function-level analysis
        segments = segment_code(request.code, request.language)
        segment_results = []

        for seg in segments:
            if seg["type"] == "block" and len(segments) == 1:
                # Single block = same as full analysis
                seg_result = {
                    "name": seg["name"],
                    "segment_type": seg["type"],
                    "start_line": seg["start_line"],
                    "end_line": seg["end_line"],
                    "prediction": result["prediction"],
                    "confidence": result["confidence"],
                    "human_probability": result["human_probability"],
                    "ai_probability": result["ai_probability"],
                    "evidence": result["evidence"],
                    "heatmap_color": _get_heatmap_color(result["prediction"], result["confidence"]),
                }
            else:
                # Run inference on individual segment
                seg_inf = run_inference_for_segment(seg["code"], request.language)
                seg_result = {
                    "name": seg["name"],
                    "segment_type": seg["type"],
                    "start_line": seg["start_line"],
                    "end_line": seg["end_line"],
                    "prediction": seg_inf.get("prediction", "UNKNOWN"),
                    "confidence": seg_inf.get("confidence", 0),
                    "human_probability": seg_inf.get("human_probability", 0),
                    "ai_probability": seg_inf.get("ai_probability", 0),
                    "evidence": seg_inf.get("evidence", {}),
                    "heatmap_color": _get_heatmap_color(
                        seg_inf.get("prediction", "UNKNOWN"),
                        seg_inf.get("confidence", 0)
                    ),
                }
            segment_results.append(seg_result)

        # Mixed authorship analysis
        mixed = analyze_mixed_authorship(segment_results)

        # Persist to database
        code_hash = hashlib.sha256(request.code.encode()).hexdigest()[:16]
        analysis_id = str(hashlib.sha256((request.code + str(datetime.now(timezone.utc).timestamp())).encode()).hexdigest()[:32])
        analysis = Analysis(
            id=analysis_id,
            code_hash=code_hash,
            code_snippet=request.code[:10000],
            language=request.language,
            prediction=result["prediction"],
            confidence=result["confidence"],
            human_probability=result["human_probability"],
            ai_probability=result["ai_probability"],
            evidence=result["evidence"],
            statistics=result["statistics"],
            feature_details=result.get("feature_details", {}),
        )
        db.add(analysis)

        for seg in segment_results:
            seg_id = str(hashlib.sha256((analysis_id + seg["name"] + str(seg["start_line"])).encode()).hexdigest()[:32])
            db_seg = AnalysisSegment(
                id=seg_id,
                analysis_id=analysis_id,
                name=seg["name"],
                segment_type=seg["segment_type"],
                code=request.code[0:5000],
                start_line=seg["start_line"],
                end_line=seg["end_line"],
                prediction=seg["prediction"],
                confidence=seg["confidence"],
                human_probability=seg.get("human_probability", 0),
                ai_probability=seg.get("ai_probability", 0),
                evidence=seg.get("evidence", {}),
            )
            db.add(db_seg)

        db.commit()
        db.refresh(analysis)

        return AnalysisResponse(
            id=analysis.id,
            prediction=result["prediction"],
            confidence=result["confidence"],
            human_probability=result["human_probability"],
            ai_probability=result["ai_probability"],
            evidence=result["evidence"],
            statistics=result["statistics"],
            feature_details=result.get("feature_details", {}),
            segments=[SegmentResult(**s) for s in segment_results],
            mixed_authorship=mixed,
            language=request.language,
            created_at=analysis.created_at.isoformat(),
        )

    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"Analysis failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.post("/analyze/function-level")
async def analyze_function_level(request: FunctionLevelRequest, db: Session = Depends(get_db)):
    """Analyze code at function/segment level only."""
    if not model_manager.is_ready:
        raise HTTPException(status_code=503, detail="ML model is currently unavailable.")

    segments = segment_code(request.code, request.language)
    segment_results = []

    for seg in segments:
        seg_inf = run_inference_for_segment(seg["code"], request.language)
        seg_result = {
            "name": seg["name"],
            "segment_type": seg["type"],
            "start_line": seg["start_line"],
            "end_line": seg["end_line"],
            "prediction": seg_inf.get("prediction", "UNKNOWN"),
            "confidence": seg_inf.get("confidence", 0),
            "human_probability": seg_inf.get("human_probability", 0),
            "ai_probability": seg_inf.get("ai_probability", 0),
            "evidence": seg_inf.get("evidence", {}),
            "heatmap_color": _get_heatmap_color(
                seg_inf.get("prediction", "UNKNOWN"),
                seg_inf.get("confidence", 0)
            ),
        }
        segment_results.append(seg_result)

    mixed = analyze_mixed_authorship(segment_results)
    return {"segments": segment_results, "mixed_authorship": mixed}


def _get_heatmap_color(prediction: str, confidence: float) -> str:
    """Determine heatmap color based on prediction and confidence."""
    if confidence < 60:
        return "yellow"
    if "AI" in prediction:
        return "red"
    if "HUMAN" in prediction:
        return "green"
    return "yellow"
