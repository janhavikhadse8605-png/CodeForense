"""
CodeAuth — AI Code Authorship Analyzer

Main FastAPI application entry point.
"""
import hashlib
import json
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database.session import get_db, init_db
from app.database.models import Analysis, Project, Report
from app.ml.model import model_manager
from app.api import analyze, repository, evolution, evaluation, feedback, similarity, investigation

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown."""
    logger.info("=" * 60)
    logger.info("CodeAuth — AI Code Authorship Analyzer")
    logger.info("=" * 60)

    # Initialize database
    init_db()
    logger.info("Database initialized")

    # Load ML model
    logger.info(f"Loading model from: {settings.model_dir}")
    success = model_manager.load(settings.model_dir, settings.device)

    if success:
        logger.info("MODEL VALIDATION PASSED — Model ready for inference")
    else:
        logger.error(f"MODEL LOADING FAILED: {model_manager.load_error}")
        logger.error("The backend will start but /api/analyze will return 503")

    yield

    logger.info("CodeAuth shutting down")


app = FastAPI(
    title="CodeAuth API",
    description="AI Code Authorship Analysis Platform",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(analyze.router, prefix="/api", tags=["Analysis"])
app.include_router(repository.router, prefix="/api", tags=["Repository"])
app.include_router(evolution.router, prefix="/api", tags=["Evolution"])
app.include_router(evaluation.router, prefix="/api", tags=["Evaluation"])
app.include_router(feedback.router, prefix="/api", tags=["Feedback"])
app.include_router(similarity.router, prefix="/api", tags=["Similarity"])
app.include_router(investigation.router, prefix="/api", tags=["Investigation"])


# ─── Health ────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health_check():
    """Health check with model status."""
    status = model_manager.get_status()
    return {
        "status": "ok" if status["is_ready"] else "degraded",
        "model_status": "ready" if status["is_ready"] else "error",
        "model_device": status["device"],
        "model_error": status["error"],
        "database_status": "ok",
        "version": "1.0.0",
        "validation_steps": status["validation_steps"],
        "model_metadata": status["metadata"],
    }


# ─── History ───────────────────────────────────────────────────────────

@app.get("/api/history")
async def get_history(
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    """Get analysis history."""
    analyses = (
        db.query(Analysis)
        .order_by(Analysis.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    total = db.query(Analysis).count()

    return {
        "total": total,
        "items": [
            {
                "id": a.id,
                "code_snippet": (a.code_snippet or "")[:100] + "..." if a.code_snippet and len(a.code_snippet) > 100 else a.code_snippet,
                "language": a.language,
                "prediction": a.prediction,
                "confidence": a.confidence,
                "human_probability": a.human_probability,
                "ai_probability": a.ai_probability,
                "lines": a.statistics.get("lines", 0) if a.statistics else 0,
                "created_at": a.created_at.isoformat() if a.created_at else "",
            }
            for a in analyses
        ],
    }


@app.get("/api/history/{analysis_id}")
async def get_analysis_detail(analysis_id: str, db: Session = Depends(get_db)):
    """Get detailed analysis results."""
    analysis = db.query(Analysis).filter(Analysis.id == analysis_id).first()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found.")

    segments = [
        {
            "name": s.name,
            "segment_type": s.segment_type,
            "start_line": s.start_line,
            "end_line": s.end_line,
            "prediction": s.prediction,
            "confidence": s.confidence,
            "human_probability": s.human_probability,
            "ai_probability": s.ai_probability,
            "evidence": s.evidence or {},
        }
        for s in analysis.segments
    ]

    return {
        "id": analysis.id,
        "code_snippet": analysis.code_snippet,
        "language": analysis.language,
        "prediction": analysis.prediction,
        "confidence": analysis.confidence,
        "human_probability": analysis.human_probability,
        "ai_probability": analysis.ai_probability,
        "evidence": analysis.evidence,
        "statistics": analysis.statistics,
        "feature_details": analysis.feature_details,
        "segments": segments,
        "created_at": analysis.created_at.isoformat() if analysis.created_at else "",
    }


# ─── Projects ─────────────────────────────────────────────────────────

@app.get("/api/projects")
async def get_projects(db: Session = Depends(get_db)):
    """Get all saved projects."""
    projects = db.query(Project).order_by(Project.updated_at.desc()).all()
    return {
        "items": [
            {
                "id": p.id,
                "name": p.name,
                "description": p.description,
                "repository_url": p.repository_url,
                "overall_prediction": p.overall_prediction,
                "last_analyzed": p.last_analyzed.isoformat() if p.last_analyzed else None,
                "file_count": p.file_count,
                "created_at": p.created_at.isoformat() if p.created_at else "",
            }
            for p in projects
        ],
    }


@app.post("/api/projects")
async def create_project(data: dict, db: Session = Depends(get_db)):
    """Create a saved project."""
    project = Project(
        name=data.get("name", "Untitled Project"),
        description=data.get("description", ""),
        repository_url=data.get("repository_url", ""),
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    return {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "created_at": project.created_at.isoformat(),
    }


# ─── Reports ───────────────────────────────────────────────────────────

@app.post("/api/reports/generate")
async def generate_report(data: dict, db: Session = Depends(get_db)):
    """Generate an analysis report."""
    analysis_id = data.get("analysis_id")

    content = {}
    report_type = "analysis"
    title = data.get("title", "CodeAuth Analysis Report")

    if analysis_id:
        analysis = db.query(Analysis).filter(Analysis.id == analysis_id).first()
        if analysis:
            content = {
                "prediction": analysis.prediction,
                "confidence": analysis.confidence,
                "human_probability": analysis.human_probability,
                "ai_probability": analysis.ai_probability,
                "evidence": analysis.evidence,
                "statistics": analysis.statistics,
                "feature_details": analysis.feature_details,
                "language": analysis.language,
                "segments": [
                    {
                        "name": s.name,
                        "prediction": s.prediction,
                        "confidence": s.confidence,
                    }
                    for s in analysis.segments
                ],
                "methodology": (
                    "This analysis uses a hybrid CodeBERT + Feature MLP Fusion model. "
                    "The model combines transformer-based code embeddings with handcrafted "
                    "feature analysis across 6 categories: naming, structure, comments, "
                    "repetition, complexity, and formatting. Evidence values represent "
                    "feature group contributions measured via ablation, not probabilities."
                ),
                "limitations": (
                    "Authorship analysis is probabilistic. Results indicate model-associated "
                    "patterns and should not be treated as definitive proof of authorship."
                ),
            }

    report = Report(
        analysis_id=analysis_id,
        title=title,
        report_type=report_type,
        content=content,
        format=data.get("format", "json"),
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    return {
        "id": report.id,
        "title": report.title,
        "report_type": report.report_type,
        "format": report.format,
        "content": content,
        "created_at": report.created_at.isoformat(),
    }


@app.get("/api/reports/{report_id}")
async def get_report(report_id: str, db: Session = Depends(get_db)):
    """Get a generated report."""
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found.")

    return {
        "id": report.id,
        "title": report.title,
        "report_type": report.report_type,
        "format": report.format,
        "content": report.content,
        "created_at": report.created_at.isoformat(),
    }


@app.get("/api/reports")
async def list_reports(db: Session = Depends(get_db)):
    """List all reports."""
    reports = db.query(Report).order_by(Report.created_at.desc()).all()
    return {
        "items": [
            {
                "id": r.id,
                "title": r.title,
                "report_type": r.report_type,
                "format": r.format,
                "created_at": r.created_at.isoformat(),
            }
            for r in reports
        ],
    }


# ─── Dashboard Stats ──────────────────────────────────────────────────

@app.get("/api/dashboard/stats")
async def get_dashboard_stats(db: Session = Depends(get_db)):
    """Get dashboard analytics."""
    total = db.query(Analysis).count()
    ai_count = db.query(Analysis).filter(Analysis.prediction.contains("AI")).count()
    human_count = db.query(Analysis).filter(Analysis.prediction.contains("HUMAN")).count()
    mixed_count = total - ai_count - human_count

    analyses = db.query(Analysis).order_by(Analysis.created_at.desc()).limit(10).all()
    avg_confidence = (
        sum(a.confidence for a in analyses) / len(analyses)
        if analyses else 0
    )

    return {
        "total_analyses": total,
        "ai_associated": ai_count,
        "human_associated": human_count,
        "mixed": mixed_count,
        "avg_confidence": round(avg_confidence, 1),
        "recent_analyses": [
            {
                "id": a.id,
                "prediction": a.prediction,
                "confidence": a.confidence,
                "language": a.language,
                "created_at": a.created_at.isoformat() if a.created_at else "",
            }
            for a in analyses
        ],
    }


# ─── Model Info ────────────────────────────────────────────────────────

@app.get("/api/model/info")
async def get_model_info():
    """Get model architecture and metadata information."""
    metadata = model_manager.metadata
    return {
        "model_name": "Hybrid CodeBERT Authorship Model",
        "base_model": metadata.get("model_name", "microsoft/codebert-base"),
        "architecture": {
            "encoder": "CodeBERT (RoBERTa-base)",
            "feature_mlps": [
                f"{group} MLP ({dim}→32→16)"
                for group, dim in metadata.get("feature_dimensions", {}).items()
            ],
            "fusion": "Linear(864→256) → ReLU → Dropout → Linear(256→64)",
            "classifier": "Linear(64→2)",
        },
        "classes": list(metadata.get("label_mapping", {}).values()),
        "mixed_methodology": "Derived through section-level analysis of binary predictions",
        "feature_groups": metadata.get("feature_groups", []),
        "feature_dimensions": metadata.get("feature_dimensions", {}),
        "max_length": metadata.get("max_length", 256),
        "test_accuracy": metadata.get("test_accuracy"),
        "trained_timestamp": metadata.get("timestamp"),
        "is_ready": model_manager.is_ready,
        "device": str(model_manager.device),
    }
