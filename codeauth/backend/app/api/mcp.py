"""
MCP control endpoints.

  GET  /api/mcp/status    configured servers, connection state, discovered tools
  POST /api/mcp/reload    re-read mcp_servers.json without a restart
  POST /api/mcp/call      invoke one tool on one configured server

Handlers are sync `def` so FastAPI runs them in its threadpool — the MCP client
does blocking stdio, which would otherwise stall the event loop.

The call endpoint takes a *server name*, never a command. Servers can only be
declared in the operator-controlled config file, so this cannot be used to spawn
an arbitrary process.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from app.schemas.analysis import MCPCallRequest
from app.services.mcp_client import MCPError, mcp_registry

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/mcp/status")
def mcp_status():
    """Connect to each enabled server and report what it offers."""
    try:
        discovery = mcp_registry.discover()
    except Exception as exc:
        logger.error("MCP discovery failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"MCP discovery failed: {exc}")

    tool_total = sum(len(s["tools"]) for s in discovery["servers"])
    connected = [s["name"] for s in discovery["servers"] if s["connected"]]

    return {
        **discovery,
        "tool_count": tool_total,
        "connected_servers": connected,
        "summary": (
            f"{len(connected)}/{discovery['server_count']} server(s) connected, "
            f"{tool_total} tool(s) available"
            if discovery["configured"]
            else "No MCP servers configured. Add an mcpServers block to mcp_servers.json."
        ),
    }


@router.post("/mcp/reload")
def mcp_reload():
    """Drop cached sessions and re-read the config file."""
    mcp_registry.reload()
    return {"reloaded": True, "server_count": len(mcp_registry.configs)}


@router.post("/mcp/call")
def mcp_call(request: MCPCallRequest):
    """Invoke a tool on a configured server and return its structured result."""
    try:
        result = mcp_registry.call(request.server, request.tool, request.arguments)
    except MCPError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc))
    except Exception as exc:
        logger.error("MCP call failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=502, detail=f"MCP call failed: {exc}")

    return {
        "server": result["server"],
        "tool": result["tool"],
        "is_error": result["isError"],
        "duration_ms": result["duration_ms"],
        "result": result["structured"],
        # Raw blocks kept so a client can see exactly what came back over the wire.
        "content": result["content"],
    }
