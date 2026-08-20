"""Agentic investigation API endpoints."""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.database.models import Analysis, Repository
from app.schemas.analysis import InvestigationRequest

logger = logging.getLogger(__name__)
router = APIRouter()


# Tool abstractions for agentic investigation
class InvestigationTools:
    """Local tool implementations for code investigation."""

    def __init__(self, db: Session):
        self.db = db
        self.log = []

    def inspect_repository(self, repo_id: str) -> dict:
        """Inspect repository analysis results."""
        self._log_tool("inspect_repository", {"repo_id": repo_id})
        repo = self.db.query(Repository).filter(Repository.id == repo_id).first()
        if not repo:
            return {"error": "Repository not found"}
        return {
            "name": repo.name,
            "files_analyzed": repo.files_analyzed,
            "functions_analyzed": repo.functions_analyzed,
            "human_ratio": repo.human_ratio,
            "ai_ratio": repo.ai_ratio,
            "mixed_ratio": repo.mixed_ratio,
        }

    def inspect_analyses(self, limit: int = 20) -> list:
        """Get recent analysis results."""
        self._log_tool("inspect_analyses", {"limit": limit})
        analyses = self.db.query(Analysis).order_by(Analysis.created_at.desc()).limit(limit).all()
        return [
            {
                "id": a.id,
                "prediction": a.prediction,
                "confidence": a.confidence,
                "language": a.language,
                "lines": a.statistics.get("lines", 0) if a.statistics else 0,
            }
            for a in analyses
        ]

    def get_model_prediction(self, analysis_id: str) -> dict:
        """Get detailed prediction for a specific analysis."""
        self._log_tool("get_model_prediction", {"analysis_id": analysis_id})
        analysis = self.db.query(Analysis).filter(Analysis.id == analysis_id).first()
        if not analysis:
            return {"error": "Analysis not found"}
        return {
            "prediction": analysis.prediction,
            "confidence": analysis.confidence,
            "evidence": analysis.evidence,
            "statistics": analysis.statistics,
        }

    def _log_tool(self, tool_name: str, params: dict):
        self.log.append({
            "tool": tool_name,
            "parameters": params,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })


@router.post("/investigation/run")
async def run_investigation(request: InvestigationRequest, db: Session = Depends(get_db)):
    """Run an agentic investigation on analysis data."""
    tools = InvestigationTools(db)

    findings = []
    summary_parts = []

    # Investigate based on task
    if request.repository_id:
        repo_data = tools.inspect_repository(request.repository_id)
        if "error" not in repo_data:
            summary_parts.append(
                f"The repository '{repo_data['name']}' contains {repo_data['files_analyzed']} analyzed files. "
                f"{repo_data['human_ratio']:.1f}% show human-associated characteristics and "
                f"{repo_data['ai_ratio']:.1f}% show AI-associated patterns."
            )

            if repo_data["ai_ratio"] > 30:
                findings.append({
                    "type": "warning",
                    "title": "Significant AI-associated content detected",
                    "description": f"{repo_data['ai_ratio']:.1f}% of files show AI-associated patterns.",
                })

            if repo_data["mixed_ratio"] > 10:
                findings.append({
                    "type": "info",
                    "title": "Mixed authorship detected",
                    "description": f"{repo_data['mixed_ratio']:.1f}% of files show mixed authorship characteristics.",
                })
        else:
            summary_parts.append("Repository not found.")

    # Always check recent analyses
    recent = tools.inspect_analyses(10)
    if recent:
        ai_count = sum(1 for a in recent if "AI" in a.get("prediction", ""))
        human_count = sum(1 for a in recent if "HUMAN" in a.get("prediction", ""))
        summary_parts.append(
            f"Recent analyses: {len(recent)} total, {human_count} human-associated, {ai_count} AI-associated."
        )
    else:
        summary_parts.append("No previous analyses found.")

    summary = " ".join(summary_parts) if summary_parts else "No investigation data available."

    return {
        "id": str(hash(summary))[:16],
        "summary": summary,
        "findings": findings,
        "tool_log": tools.log,
        "mcp_status": "MCP investigation connectors are not configured. Using local investigation tools.",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
