"""
Agentic investigation.

The agent runs a real loop rather than a canned script:

  1. Discover — enumerate the tools every configured MCP server advertises.
  2. Plan     — pick tools by capability, matched against the requested task.
  3. Act      — call them over MCP (JSON-RPC/stdio) and record every call.
  4. Synthesize — build findings from what came back, then caveat the whole
                  assessment with the model's measured false-positive rate.

Local DB reads remain available as a fallback so the endpoint still works with no
MCP server configured; the response says which path produced each fact, and the
tool log marks every entry with its transport.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database.models import Analysis, Repository
from app.database.session import get_db
from app.ml.model_cards import model_card
from app.schemas.analysis import InvestigationRequest
from app.services.mcp_client import MCPError, mcp_registry

logger = logging.getLogger(__name__)
router = APIRouter()

# Which MCP tools serve which investigation task. Tools are only called if a
# connected server actually advertises them, so an unknown server is harmless.
TASK_PLAN: dict[str, list[str]] = {
    "full_investigation": [
        "get_model_card", "list_repositories", "get_repository", "list_analyses",
    ],
    "anomaly_scan": ["get_model_card", "get_repository", "list_analyses"],
    "commit_forensics": ["inspect_github_repository", "github_file_history", "get_model_card"],
}


class ToolLog:
    """Records every call the agent makes, with its transport."""

    def __init__(self) -> None:
        self.entries: list[dict] = []

    def add(self, tool: str, params: dict, transport: str,
            server: Optional[str] = None, duration_ms: Optional[float] = None,
            error: Optional[str] = None) -> None:
        self.entries.append({
            "tool": tool,
            "parameters": params,
            "transport": transport,          # "mcp" or "local"
            "server": server,
            "duration_ms": duration_ms,
            "error": error,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })


class Investigator:
    def __init__(self, db: Session, request: InvestigationRequest):
        self.db = db
        self.request = request
        self.log = ToolLog()
        self.facts: dict[str, Any] = {}
        self.mcp_servers: list[dict] = []
        self.available: dict[str, str] = {}   # tool name -> server name

    # ── 1. discover ──────────────────────────────────────────────────

    def discover(self) -> None:
        if not mcp_registry.configured:
            return
        try:
            discovery = mcp_registry.discover()
        except Exception as exc:
            logger.warning("MCP discovery failed: %s", exc)
            return

        self.mcp_servers = discovery.get("servers", [])
        for server in self.mcp_servers:
            if not server.get("connected"):
                continue
            for tool in server.get("tools", []):
                name = tool.get("name")
                # First server to advertise a tool wins, so ordering in the
                # config file is the precedence rule.
                if name and name not in self.available:
                    self.available[name] = server["name"]

    # ── 2/3. plan and act ────────────────────────────────────────────

    def call_mcp(self, tool: str, arguments: dict) -> Optional[Any]:
        server = self.available.get(tool)
        if not server:
            return None
        try:
            result = mcp_registry.call(server, tool, arguments)
        except MCPError as exc:
            self.log.add(tool, arguments, "mcp", server=server, error=str(exc))
            return None
        except Exception as exc:
            self.log.add(tool, arguments, "mcp", server=server, error=str(exc))
            return None

        self.log.add(tool, arguments, "mcp", server=server,
                     duration_ms=result.get("duration_ms"))
        if result.get("isError"):
            return None
        return result.get("structured")

    def run(self) -> None:
        self.discover()
        plan = TASK_PLAN.get(self.request.task, TASK_PLAN["full_investigation"])

        # ── model card: needed to caveat everything else ──
        if "get_model_card" in plan:
            card = self.call_mcp("get_model_card", {})
            if card is None:
                card = {"headline": model_card.get().get("headline"),
                        "warnings": model_card.get().get("warnings")}
                self.log.add("get_model_card", {}, "local")
            self.facts["model_card"] = card

        # ── repository under investigation ──
        repo_id = self.request.repository_id
        if repo_id and "get_repository" in plan:
            repo = self.call_mcp("get_repository", {"repository_id": repo_id})
            if repo is None:
                repo = self._local_repository(repo_id)
            if repo and not repo.get("error"):
                self.facts["repository"] = repo

        if not repo_id and "list_repositories" in plan:
            listing = self.call_mcp("list_repositories", {})
            if listing is None:
                listing = self._local_repositories()
            repos = (listing or {}).get("repositories") or []
            self.facts["repositories"] = repos
            # Fall back to the most recent scan when none was named.
            if repos and "repository" not in self.facts:
                latest = repos[0]
                detail = self.call_mcp("get_repository", {"repository_id": latest["id"]})
                if detail is None:
                    detail = self._local_repository(latest["id"])
                if detail and not detail.get("error"):
                    self.facts["repository"] = detail

        # ── recent snippet analyses ──
        if "list_analyses" in plan:
            listing = self.call_mcp("list_analyses", {"limit": 20})
            if listing is None:
                listing = self._local_analyses(20)
            self.facts["analyses"] = (listing or {}).get("analyses") or []

        # ── commit forensics on a live GitHub repo ──
        url = self.request.parameters.get("repository_url")
        if url and "inspect_github_repository" in plan:
            meta = self.call_mcp("inspect_github_repository",
                                 {"repository_url": url, "commit_limit": 20})
            if meta:
                self.facts["github"] = meta
            path = self.request.parameters.get("file_path")
            if path and "github_file_history" in plan:
                history = self.call_mcp("github_file_history", {
                    "repository_url": url, "file_path": path, "commit_limit": 8,
                })
                if history:
                    self.facts["file_history"] = history

    # ── local fallbacks ──────────────────────────────────────────────

    def _local_repository(self, repo_id: str) -> Optional[dict]:
        self.log.add("get_repository", {"repository_id": repo_id}, "local")
        row = self.db.query(Repository).filter(Repository.id == repo_id).first()
        if not row:
            return {"error": "Repository not found"}
        results = row.results or []
        return {
            "id": row.id, "name": row.name, "source_type": row.source_type,
            "files_analyzed": row.files_analyzed, "functions_analyzed": row.functions_analyzed,
            "human_ratio": row.human_ratio, "ai_ratio": row.ai_ratio,
            "mixed_ratio": row.mixed_ratio,
            "top_ai_files": sorted(
                (f for f in results if "AI" in (f.get("prediction") or "")),
                key=lambda f: -(f.get("confidence") or 0),
            )[:20],
        }

    def _local_repositories(self) -> dict:
        self.log.add("list_repositories", {}, "local")
        rows = self.db.query(Repository).order_by(Repository.created_at.desc()).limit(50).all()
        return {"repositories": [
            {"id": r.id, "name": r.name, "source_type": r.source_type,
             "files_analyzed": r.files_analyzed, "human_ratio": r.human_ratio,
             "ai_ratio": r.ai_ratio, "mixed_ratio": r.mixed_ratio}
            for r in rows
        ]}

    def _local_analyses(self, limit: int) -> dict:
        self.log.add("list_analyses", {"limit": limit}, "local")
        rows = self.db.query(Analysis).order_by(Analysis.created_at.desc()).limit(limit).all()
        return {"analyses": [
            {"id": r.id, "prediction": r.prediction, "confidence": r.confidence,
             "language": r.language}
            for r in rows
        ]}

    # ── 4. synthesize ────────────────────────────────────────────────

    def synthesize(self) -> tuple[str, list[dict]]:
        parts: list[str] = []
        findings: list[dict] = []

        repo = self.facts.get("repository")
        if repo:
            parts.append(
                f"Repository '{repo['name']}' ({repo.get('source_type', 'unknown')} source): "
                f"{repo['files_analyzed']} files scored, {repo.get('functions_analyzed', 0)} "
                f"functions found. {repo['human_ratio']:.1f}% of files read as human-associated "
                f"and {repo['ai_ratio']:.1f}% as AI-associated."
            )
            if repo["ai_ratio"] > 30:
                findings.append({
                    "type": "warning",
                    "title": "Large share of AI-associated files",
                    "description": (
                        f"{repo['ai_ratio']:.1f}% of scored files were labelled AI-associated. "
                        f"Read this against the model's false-positive rate before drawing a "
                        f"conclusion."
                    ),
                })
            if repo.get("mixed_ratio", 0) > 10:
                findings.append({
                    "type": "info",
                    "title": "Mixed authorship present",
                    "description": f"{repo['mixed_ratio']:.1f}% of files show mixed characteristics.",
                })
            top = repo.get("top_ai_files") or []
            if top:
                names = ", ".join(f"{f['file_path']} ({f['confidence']}%)" for f in top[:3])
                findings.append({
                    "type": "info",
                    "title": "Highest-confidence AI-associated files",
                    "description": names,
                })
        elif self.facts.get("repositories") is not None:
            parts.append("No repository scans are on record yet.")

        analyses = self.facts.get("analyses") or []
        if analyses:
            ai = sum(1 for a in analyses if "AI" in (a.get("prediction") or ""))
            human = sum(1 for a in analyses if "HUMAN" in (a.get("prediction") or ""))
            parts.append(
                f"Across the {len(analyses)} most recent snippet analyses: {human} "
                f"human-associated, {ai} AI-associated."
            )

        gh = self.facts.get("github")
        if gh:
            meta = gh.get("repository") or {}
            parts.append(
                f"GitHub history for {meta.get('full_name')}: {gh.get('commits_sampled')} "
                f"commits sampled across {gh.get('distinct_authors')} distinct commit authors."
            )
            if (gh.get("distinct_authors") or 0) == 1 and (gh.get("commits_sampled") or 0) > 5:
                findings.append({
                    "type": "info",
                    "title": "Single commit author in the sampled window",
                    "description": (
                        f"All {gh['commits_sampled']} sampled commits share one author, so "
                        f"commit metadata offers no authorship contrast here."
                    ),
                })

        history = self.facts.get("file_history")
        if history and history.get("timeline"):
            timeline = history["timeline"]
            probs = [p["ai_probability"] for p in timeline]
            swing = max(probs) - min(probs)
            parts.append(
                f"'{history['file_path']}' was scored across {history['revisions_analyzed']} "
                f"revisions; AI-associated probability moved {swing:.1f} points end to end."
            )
            if swing >= 25:
                findings.append({
                    "type": "warning",
                    "title": "Authorship style shifted across commits",
                    "description": (
                        f"P(AI) ranged {min(probs):.1f}%–{max(probs):.1f}% over "
                        f"{history['revisions_analyzed']} revisions of {history['file_path']}."
                    ),
                })

        # The assessment is not allowed to end without its own reliability caveat.
        card = self.facts.get("model_card") or {}
        headline = card.get("headline") or {}
        fpr = headline.get("real_world_false_positive_rate")
        if fpr is not None:
            findings.append({
                "type": "critical",
                "title": "Reliability bound on every finding above",
                "description": (
                    f"On known-human code from {headline.get('calibration_source')} this model "
                    f"labels {fpr * 100:.0f}% of files AI. A high AI ratio on real project code "
                    f"is the expected failure mode, not a finding. Nothing here is evidence of "
                    f"authorship."
                ),
            })
            parts.append(
                f"Reliability bound: {fpr * 100:.0f}% false-positive rate on known-human code."
            )

        summary = " ".join(parts) if parts else "No investigation data available."
        return summary, findings


@router.post("/investigation/run")
def run_investigation(request: InvestigationRequest, db: Session = Depends(get_db)):
    """Run the discover → plan → act → synthesize loop over MCP tools."""
    agent = Investigator(db, request)
    agent.run()
    summary, findings = agent.synthesize()

    mcp_calls = [e for e in agent.log.entries if e["transport"] == "mcp"]
    connected = [s["name"] for s in agent.mcp_servers if s.get("connected")]

    return {
        "id": f"inv-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
        "task": request.task,
        "summary": summary,
        "findings": findings,
        "tool_log": agent.log.entries,
        "mcp": {
            "configured": mcp_registry.configured,
            "connected_servers": connected,
            "tools_discovered": sorted(agent.available),
            "calls_made": len(mcp_calls),
            "status": (
                f"{len(mcp_calls)} tool call(s) over MCP to {', '.join(connected)}"
                if mcp_calls else
                "No MCP servers reachable; used local database reads."
            ),
        },
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
