"""
GitHub repository analysis endpoints.

  POST /api/github/inspect     repository metadata + recent commits, no analysis
  POST /api/github/analyze     download a ref and score every supported file
  POST /api/github/evolution   score one file across its commit history
  GET  /api/github/status      whether a token is configured, rate limit headroom

Handlers are sync `def` on purpose: inference and HTTP here are both blocking, so
FastAPI runs them in its threadpool instead of stalling the event loop.
"""
from __future__ import annotations

import logging
import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.repository import _analyze_directory
from app.database.models import Repository
from app.database.session import get_db
from app.ml.inference import any_engine_ready, run_inference
from app.schemas.analysis import (
    GitHubAnalyzeRequest,
    GitHubEvolutionRequest,
    GitHubInspectRequest,
)
from app.services.github_client import GitHubClient, GitHubError, parse_repo_reference

logger = logging.getLogger(__name__)
router = APIRouter()


def _client(token: str | None) -> GitHubClient:
    return GitHubClient(token=token)


def _fail(exc: GitHubError) -> HTTPException:
    return HTTPException(status_code=exc.status, detail=str(exc))


@router.get("/github/status")
def github_status():
    """Report whether GitHub access is usable before the user pastes a URL."""
    client = GitHubClient()
    try:
        rate = client._get("/rate_limit")
        core = (rate or {}).get("resources", {}).get("core", {})
        return {
            "reachable": True,
            "token_configured": bool(client.token),
            "rate_limit": core.get("limit"),
            "rate_remaining": core.get("remaining"),
            "note": (
                "Authenticated: 5000 requests/hour."
                if client.token
                else "Unauthenticated: 60 requests/hour. Set GITHUB_TOKEN on the backend "
                     "for more headroom and private repository access."
            ),
        }
    except GitHubError as exc:
        return {
            "reachable": False,
            "token_configured": bool(client.token),
            "error": str(exc),
        }


@router.post("/github/inspect")
def inspect_repository(request: GitHubInspectRequest):
    """Metadata and commit history only — cheap, and no inference."""
    try:
        ref = parse_repo_reference(request.repository_url)
        client = _client(request.token)
        meta = client.get_repository(ref)
        branch = ref.ref or meta.get("default_branch") or "HEAD"
        commits = client.list_commits(ref, limit=request.commit_limit)
    except GitHubError as exc:
        raise _fail(exc)

    authors: dict[str, int] = {}
    for c in commits:
        name = c.get("author_name") or "unknown"
        authors[name] = authors.get(name, 0) + 1

    return {
        "repository": meta,
        "ref": branch,
        "commits": commits,
        "commit_count_sampled": len(commits),
        "distinct_authors": len(authors),
        "commits_per_author": dict(sorted(authors.items(), key=lambda kv: -kv[1])),
        "rate_remaining": client.rate_limit_remaining,
    }


@router.post("/github/analyze")
def analyze_github_repository(request: GitHubAnalyzeRequest, db: Session = Depends(get_db)):
    """Download a ref as an archive and run authorship analysis over every file."""
    if not any_engine_ready():
        raise HTTPException(status_code=503, detail="No inference engine is loaded. Check /api/health.")

    extracted: Path | None = None
    try:
        ref = parse_repo_reference(request.repository_url)
        client = _client(request.token)
        meta = client.get_repository(ref)
        branch = ref.ref or meta.get("default_branch") or "HEAD"

        extracted = client.download_archive(ref, branch)

        # GitHub archives wrap everything in one owner-repo-sha/ directory.
        children = [p for p in extracted.iterdir() if p.is_dir()]
        root = children[0] if len(children) == 1 else extracted

        result = _analyze_directory(str(root), max_files=request.max_files)

        repo_row = Repository(
            name=meta.get("full_name") or ref.slug,
            source_type="github",
            path=f"{ref.slug}@{branch}",
            files_analyzed=result["files_analyzed"],
            functions_analyzed=result["functions_analyzed"],
            human_ratio=result["human_ratio"],
            ai_ratio=result["ai_ratio"],
            mixed_ratio=result["mixed_ratio"],
            results=result["file_results"],
            file_tree=result["file_tree"],
        )
        db.add(repo_row)
        db.commit()
        db.refresh(repo_row)

        commits = []
        if request.include_commits:
            try:
                commits = client.list_commits(ref, limit=request.commit_limit)
            except GitHubError:
                commits = []

        return {
            "id": repo_row.id,
            "name": repo_row.name,
            "source": "github",
            "repository": meta,
            "ref": branch,
            "files_analyzed": result["files_analyzed"],
            "files_skipped": result.get("files_skipped", 0),
            "truncated": result.get("truncated", False),
            "functions_analyzed": result["functions_analyzed"],
            "human_ratio": result["human_ratio"],
            "ai_ratio": result["ai_ratio"],
            "mixed_ratio": result["mixed_ratio"],
            "file_results": result["file_results"],
            "file_tree": result["file_tree"],
            "commits": commits,
            "created_at": repo_row.created_at.isoformat(),
        }
    except GitHubError as exc:
        raise _fail(exc)
    finally:
        if extracted is not None:
            # download_archive puts `extracted` inside its own temp dir.
            shutil.rmtree(extracted.parent, ignore_errors=True)


@router.post("/github/evolution")
def analyze_github_evolution(request: GitHubEvolutionRequest):
    """
    Score one file at each of its recent commits.

    This is the authorship-drift view over real project history: for every commit
    that touched the path, fetch that revision and run inference on it, then flag
    the transitions where the verdict or the evidence profile moves sharply.
    """
    if not any_engine_ready():
        raise HTTPException(status_code=503, detail="No inference engine is loaded. Check /api/health.")

    try:
        ref = parse_repo_reference(request.repository_url)
        client = _client(request.token)
        meta = client.get_repository(ref)
        commits = client.list_commits(ref, path=request.file_path, limit=request.commit_limit)
    except GitHubError as exc:
        raise _fail(exc)

    if not commits:
        raise HTTPException(
            status_code=404,
            detail=f"No commits found touching '{request.file_path}'.",
        )

    language = request.language or _language_for(request.file_path)

    # Oldest first, so the timeline reads left to right.
    points: list[dict] = []
    for commit in reversed(commits):
        try:
            content = client.get_file_at_commit(ref, request.file_path, commit["sha"])
        except GitHubError:
            continue
        if not content or len(content.strip()) < 20:
            continue

        try:
            result = run_inference(content[:50_000], language)
        except Exception as exc:
            logger.warning("Inference failed at %s: %s", commit["short_sha"], exc)
            continue

        points.append({
            "sha": commit["sha"],
            "short_sha": commit["short_sha"],
            "author_name": commit.get("author_name"),
            "date": commit.get("date"),
            "message": commit.get("message"),
            "html_url": commit.get("html_url"),
            "prediction": result["prediction"],
            "confidence": result["confidence"],
            "ai_probability": result["ai_probability"],
            "human_probability": result["human_probability"],
            "evidence": result["evidence"],
            "lines": result["statistics"].get("lines", 0),
            "engine": result.get("engine"),
        })

    if not points:
        raise HTTPException(
            status_code=422,
            detail="Could not analyze any revision of that file (empty, binary, or too small).",
        )

    shifts = []
    for prev, curr in zip(points, points[1:]):
        magnitude = abs(curr["ai_probability"] - prev["ai_probability"])
        verdict_flip = prev["prediction"] != curr["prediction"]
        evidence_shift = _evidence_distance(prev["evidence"], curr["evidence"])
        if verdict_flip or magnitude >= 25 or evidence_shift >= 20:
            shifts.append({
                "from_sha": prev["short_sha"],
                "to_sha": curr["short_sha"],
                "from_author": prev.get("author_name"),
                "to_author": curr.get("author_name"),
                "date": curr.get("date"),
                "verdict_changed": verdict_flip,
                "from_prediction": prev["prediction"],
                "to_prediction": curr["prediction"],
                "ai_probability_delta": round(curr["ai_probability"] - prev["ai_probability"], 1),
                "evidence_shift": round(evidence_shift, 1),
                "description": _describe_shift(prev, curr, verdict_flip, magnitude),
            })

    return {
        "repository": meta,
        "file_path": request.file_path,
        "language": language,
        "revisions_analyzed": len(points),
        "commits_examined": len(commits),
        "timeline": points,
        "style_shifts": shifts,
        "rate_remaining": client.rate_limit_remaining,
    }


# ─── helpers ──────────────────────────────────────────────────────────

EXTENSION_LANGUAGE = {
    ".py": "python", ".js": "javascript", ".jsx": "javascript",
    ".ts": "typescript", ".tsx": "typescript", ".java": "java",
    ".c": "c", ".h": "c", ".cpp": "cpp", ".cc": "cpp", ".hpp": "cpp",
    ".cs": "csharp", ".go": "go", ".rs": "rust", ".php": "php", ".rb": "ruby",
}


def _language_for(path: str) -> str:
    return EXTENSION_LANGUAGE.get(Path(path).suffix.lower(), "python")


def _evidence_distance(a: dict, b: dict) -> float:
    """Mean absolute difference across shared feature groups."""
    shared = set(a) & set(b)
    if not shared:
        return 0.0
    return sum(abs(a[k] - b[k]) for k in shared) / len(shared)


def _describe_shift(prev: dict, curr: dict, verdict_flip: bool, magnitude: float) -> str:
    who = ""
    if prev.get("author_name") and curr.get("author_name") and prev["author_name"] != curr["author_name"]:
        who = f" Authorship of the commit also changed hands ({prev['author_name']} → {curr['author_name']})."
    if verdict_flip:
        return (
            f"Verdict moved from {prev['prediction']} to {curr['prediction']} between "
            f"{prev['short_sha']} and {curr['short_sha']}.{who}"
        )
    return (
        f"AI-associated probability moved {magnitude:.0f} points between "
        f"{prev['short_sha']} and {curr['short_sha']} without flipping the verdict.{who}"
    )
