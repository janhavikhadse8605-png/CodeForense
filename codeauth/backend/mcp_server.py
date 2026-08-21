#!/usr/bin/env python3
"""
CodeAuth as an MCP server (stdio transport).

Exposes the authorship-analysis tools over the Model Context Protocol so any MCP
client — Claude Desktop, Claude Code, or CodeAuth's own investigation agent — can
call them. Speaks JSON-RPC 2.0 over newline-delimited stdin/stdout.

Register it with a client:

    {
      "mcpServers": {
        "codeauth": {
          "command": "python3",
          "args": ["/abs/path/to/codeauth/backend/mcp_server.py"]
        }
      }
    }

Run it directly to sanity-check the handshake:

    echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | python3 mcp_server.py

Notes on behaviour:
  * Models load lazily on first use, so `initialize` and `tools/list` stay fast
    and a client can enumerate tools without paying for a 500 MB checkpoint.
  * Every tool returns JSON as a single text block, so clients get structured
    data rather than prose to re-parse.
  * stdout carries protocol traffic only. All logging goes to stderr, because a
    stray print on stdout corrupts the stream.
"""
from __future__ import annotations

import json
import logging
import os
import sys
from pathlib import Path
from typing import Any, Callable

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

# stderr only: stdout is the protocol channel.
logging.basicConfig(
    level=logging.INFO,
    stream=sys.stderr,
    format="%(asctime)s [mcp_server] %(levelname)s: %(message)s",
)
logger = logging.getLogger(__name__)

PROTOCOL_VERSION = "2024-11-05"
SERVER_INFO = {"name": "codeauth", "version": "2.0.0"}

_loaded = False


def _ensure_models() -> None:
    """Load the engines on first tool call, not at start-up."""
    global _loaded
    if _loaded:
        return
    from app.config import settings
    from app.ml.model import model_manager
    from app.ml.stylometric import stylometric_model

    stylometric_model.load(settings.model_path / "stylometric_model.pkl")

    # The stylometric model is the deciding engine, so the 500 MB transformer
    # checkpoint is opt-in: loading it costs ~5s and a lot of resident memory in
    # a child process that mostly serves quick calls. Set MCP_LOAD_HYBRID=1 to
    # get the second-opinion field in results.
    if os.getenv("MCP_LOAD_HYBRID", "").strip() in ("1", "true", "yes"):
        try:
            model_manager.load(settings.model_dir, settings.device)
        except Exception as exc:  # a missing checkpoint must not break the server
            logger.warning("Hybrid checkpoint unavailable: %s", exc)
    else:
        logger.info("Hybrid checkpoint skipped (set MCP_LOAD_HYBRID=1 to enable)")
    _loaded = True


def _db():
    from app.database.session import SessionLocal, init_db
    init_db()
    return SessionLocal()


# ─── Tool implementations ─────────────────────────────────────────────


def tool_analyze_code(code: str, language: str = "python") -> dict:
    _ensure_models()
    from app.ml.inference import run_inference
    result = run_inference(code, language)
    return {
        "prediction": result["prediction"],
        "confidence": result["confidence"],
        "human_probability": result["human_probability"],
        "ai_probability": result["ai_probability"],
        "evidence": result["evidence"],
        "statistics": result["statistics"],
        "engine": result.get("engine"),
        "engine_agreement": result.get("engine_agreement"),
        "caveats": result.get("caveats", []),
    }


def tool_analyze_functions(code: str, language: str = "python") -> dict:
    _ensure_models()
    from app.ml.inference import run_inference_for_segment
    from app.ml.segmentation import analyze_mixed_authorship, segment_code

    segments = segment_code(code, language)
    scored = []
    for seg in segments:
        inf = run_inference_for_segment(seg["code"], language)
        scored.append({
            "name": seg["name"],
            "type": seg["type"],
            "start_line": seg["start_line"],
            "end_line": seg["end_line"],
            "prediction": inf.get("prediction"),
            "confidence": inf.get("confidence"),
            "ai_probability": inf.get("ai_probability"),
        })
    return {"segments": scored, "mixed_authorship": analyze_mixed_authorship(scored)}


def tool_get_model_card() -> dict:
    from app.ml.model_cards import model_card
    card = model_card.get()
    return {"headline": card.get("headline"), "warnings": card.get("warnings")}


def tool_list_analyses(limit: int = 20) -> dict:
    from app.database.models import Analysis
    db = _db()
    try:
        rows = db.query(Analysis).order_by(Analysis.created_at.desc()).limit(min(limit, 100)).all()
        return {"count": len(rows), "analyses": [
            {
                "id": r.id, "prediction": r.prediction, "confidence": r.confidence,
                "language": r.language,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]}
    finally:
        db.close()


def tool_get_analysis(analysis_id: str) -> dict:
    from app.database.models import Analysis
    db = _db()
    try:
        row = db.query(Analysis).filter(Analysis.id == analysis_id).first()
        if not row:
            return {"error": f"No analysis with id {analysis_id}"}
        return {
            "id": row.id, "prediction": row.prediction, "confidence": row.confidence,
            "human_probability": row.human_probability, "ai_probability": row.ai_probability,
            "language": row.language, "evidence": row.evidence,
            "statistics": row.statistics, "feature_details": row.feature_details,
        }
    finally:
        db.close()


def tool_list_repositories() -> dict:
    from app.database.models import Repository
    db = _db()
    try:
        rows = db.query(Repository).order_by(Repository.created_at.desc()).limit(50).all()
        return {"count": len(rows), "repositories": [
            {
                "id": r.id, "name": r.name, "source_type": r.source_type,
                "files_analyzed": r.files_analyzed, "human_ratio": r.human_ratio,
                "ai_ratio": r.ai_ratio, "mixed_ratio": r.mixed_ratio,
            }
            for r in rows
        ]}
    finally:
        db.close()


def tool_get_repository(repository_id: str) -> dict:
    from app.database.models import Repository
    db = _db()
    try:
        row = db.query(Repository).filter(Repository.id == repository_id).first()
        if not row:
            return {"error": f"No repository with id {repository_id}"}
        results = row.results or []
        flagged = sorted(
            (f for f in results if "AI" in (f.get("prediction") or "")),
            key=lambda f: -(f.get("confidence") or 0),
        )[:20]
        return {
            "id": row.id, "name": row.name, "source_type": row.source_type,
            "files_analyzed": row.files_analyzed, "functions_analyzed": row.functions_analyzed,
            "human_ratio": row.human_ratio, "ai_ratio": row.ai_ratio,
            "mixed_ratio": row.mixed_ratio, "top_ai_files": flagged,
        }
    finally:
        db.close()


def tool_inspect_github_repository(repository_url: str, commit_limit: int = 20) -> dict:
    from app.services.github_client import GitHubClient, parse_repo_reference
    ref = parse_repo_reference(repository_url)
    client = GitHubClient()
    meta = client.get_repository(ref)
    commits = client.list_commits(ref, limit=commit_limit)
    authors: dict[str, int] = {}
    for c in commits:
        authors[c.get("author_name") or "unknown"] = authors.get(c.get("author_name") or "unknown", 0) + 1
    return {
        "repository": meta,
        "commits_sampled": len(commits),
        "distinct_authors": len(authors),
        "commits_per_author": authors,
        "recent_commits": commits[:10],
    }


def tool_github_file_history(repository_url: str, file_path: str, commit_limit: int = 8) -> dict:
    _ensure_models()
    from app.ml.inference import run_inference
    from app.services.github_client import GitHubClient, parse_repo_reference

    ref = parse_repo_reference(repository_url)
    client = GitHubClient()
    commits = client.list_commits(ref, path=file_path, limit=commit_limit)

    timeline = []
    for commit in reversed(commits):
        content = client.get_file_at_commit(ref, file_path, commit["sha"])
        if not content or len(content.strip()) < 20:
            continue
        result = run_inference(content[:50_000], _language_for(file_path))
        timeline.append({
            "sha": commit["short_sha"],
            "date": commit.get("date"),
            "author_name": commit.get("author_name"),
            "prediction": result["prediction"],
            "ai_probability": result["ai_probability"],
            "lines": result["statistics"].get("lines"),
        })
    return {"file_path": file_path, "revisions_analyzed": len(timeline), "timeline": timeline}


def _language_for(path: str) -> str:
    mapping = {
        ".py": "python", ".js": "javascript", ".jsx": "javascript", ".ts": "typescript",
        ".tsx": "typescript", ".java": "java", ".c": "c", ".cpp": "cpp", ".cc": "cpp",
        ".cs": "csharp", ".go": "go", ".rs": "rust", ".php": "php", ".rb": "ruby",
    }
    return mapping.get(Path(path).suffix.lower(), "python")


# ─── Tool registry ────────────────────────────────────────────────────

STRING = {"type": "string"}


def _tool(name: str, description: str, properties: dict, required: list[str]) -> dict:
    return {
        "name": name,
        "description": description,
        "inputSchema": {"type": "object", "properties": properties, "required": required},
    }


TOOLS: list[dict] = [
    _tool(
        "analyze_code",
        "Score a code snippet for human vs AI authorship. Returns the verdict, confidence, "
        "per-feature-group ablation evidence, and any reliability caveats. Read the caveats: "
        "this model false-positives heavily on well-formatted production code.",
        {"code": {**STRING, "description": "Source code to score"},
         "language": {**STRING, "description": "python, cpp, java, javascript, go, rust, …",
                      "default": "python"}},
        ["code"],
    ),
    _tool(
        "analyze_functions",
        "Segment code into functions/classes and score each one separately, to locate sections "
        "whose authorship characteristics differ from the rest of the file.",
        {"code": STRING, "language": {**STRING, "default": "python"}},
        ["code"],
    ),
    _tool(
        "get_model_card",
        "Measured performance and known limitations of the loaded model, including the "
        "false-positive rate on known-human code. Call this before trusting any verdict.",
        {}, [],
    ),
    _tool(
        "list_analyses",
        "List recent stored analyses with their verdicts.",
        {"limit": {"type": "integer", "default": 20, "maximum": 100}}, [],
    ),
    _tool(
        "get_analysis",
        "Full stored detail for one analysis: evidence, statistics and all 41 feature values.",
        {"analysis_id": STRING}, ["analysis_id"],
    ),
    _tool(
        "list_repositories",
        "List repositories that have been scanned, with their human/AI file ratios.",
        {}, [],
    ),
    _tool(
        "get_repository",
        "Detail for one scanned repository, including its highest-confidence AI-flagged files.",
        {"repository_id": STRING}, ["repository_id"],
    ),
    _tool(
        "inspect_github_repository",
        "Fetch GitHub metadata and commit history for a repository without running inference. "
        "Accepts owner/repo or a github.com URL.",
        {"repository_url": STRING,
         "commit_limit": {"type": "integer", "default": 20, "maximum": 100}},
        ["repository_url"],
    ),
    _tool(
        "github_file_history",
        "Score one file at each of its recent commits to trace authorship drift through real "
        "project history.",
        {"repository_url": STRING, "file_path": STRING,
         "commit_limit": {"type": "integer", "default": 8, "maximum": 30}},
        ["repository_url", "file_path"],
    ),
]

HANDLERS: dict[str, Callable[..., dict]] = {
    "analyze_code": tool_analyze_code,
    "analyze_functions": tool_analyze_functions,
    "get_model_card": tool_get_model_card,
    "list_analyses": tool_list_analyses,
    "get_analysis": tool_get_analysis,
    "list_repositories": tool_list_repositories,
    "get_repository": tool_get_repository,
    "inspect_github_repository": tool_inspect_github_repository,
    "github_file_history": tool_github_file_history,
}


# ─── JSON-RPC dispatch ────────────────────────────────────────────────


def handle(message: dict) -> Any:
    """Return a response dict, or None for notifications."""
    method = message.get("method")
    request_id = message.get("id")
    params = message.get("params") or {}

    def ok(result: dict) -> dict:
        return {"jsonrpc": "2.0", "id": request_id, "result": result}

    def err(code: int, msg: str) -> dict:
        return {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": msg}}

    if method == "initialize":
        return ok({
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {"tools": {"listChanged": False}},
            "serverInfo": SERVER_INFO,
            "instructions": (
                "CodeAuth scores code for human vs AI authorship. Call get_model_card first: "
                "the model is accurate in-distribution but false-positives on roughly two "
                "thirds of real human library code, so verdicts are evidence of style, not "
                "of authorship."
            ),
        })

    if method in ("notifications/initialized", "notifications/cancelled", "initialized"):
        return None

    if method == "ping":
        return ok({})

    if method == "tools/list":
        return ok({"tools": TOOLS})

    if method == "tools/call":
        name = params.get("name")
        arguments = params.get("arguments") or {}
        handler = HANDLERS.get(name)
        if handler is None:
            return err(-32601, f"Unknown tool: {name}")
        try:
            payload = handler(**arguments)
            is_error = isinstance(payload, dict) and "error" in payload
        except TypeError as exc:
            return err(-32602, f"Invalid arguments for {name}: {exc}")
        except Exception as exc:
            logger.exception("Tool %s failed", name)
            payload, is_error = {"error": f"{exc.__class__.__name__}: {exc}"}, True

        return ok({
            "content": [{"type": "text", "text": json.dumps(payload, indent=2, default=str)}],
            "isError": is_error,
        })

    # Advertised as unsupported rather than silently empty.
    if method in ("resources/list", "prompts/list"):
        return ok({"resources": [], "prompts": []})

    if request_id is None:
        return None
    return err(-32601, f"Method not found: {method}")


def main() -> None:
    logger.info("CodeAuth MCP server ready on stdio (%d tools)", len(TOOLS))
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            sys.stdout.write(json.dumps({
                "jsonrpc": "2.0", "id": None,
                "error": {"code": -32700, "message": "Parse error"},
            }) + "\n")
            sys.stdout.flush()
            continue

        try:
            response = handle(message)
        except Exception as exc:
            logger.exception("Dispatch failed")
            response = {
                "jsonrpc": "2.0", "id": message.get("id"),
                "error": {"code": -32603, "message": f"Internal error: {exc}"},
            }

        if response is not None:
            sys.stdout.write(json.dumps(response, default=str) + "\n")
            sys.stdout.flush()

    logger.info("stdin closed; shutting down")


if __name__ == "__main__":
    main()
