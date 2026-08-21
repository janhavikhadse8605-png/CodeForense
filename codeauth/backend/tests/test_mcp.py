"""
Tests for the MCP layer: protocol, client, HTTP surface, and the agent loop.

The server is exercised over real pipes rather than by calling handlers directly,
so a framing or handshake regression is caught rather than skipped.
"""
import json
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.mcp_client import (
    MCPError,
    ServerConfig,
    load_server_configs,
    mcp_registry,
)

BACKEND = Path(__file__).resolve().parents[1]
SERVER = BACKEND / "mcp_server.py"

# Tests that need a live server are skipped rather than failed when no
# mcp_servers.json is present, so a fresh clone still gets a green suite.
needs_mcp = pytest.mark.skipif(
    not mcp_registry.configured,
    reason="no MCP servers configured (copy mcp_servers.example.json to mcp_servers.json)",
)


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


# ─── Protocol, over real pipes ────────────────────────────────────────

def _speak(messages: list[dict], timeout: int = 120) -> list[dict]:
    """Send newline-delimited JSON-RPC to the server and collect replies."""
    payload = "".join(json.dumps(m) + "\n" for m in messages)
    proc = subprocess.run(
        [sys.executable, str(SERVER)],
        input=payload, capture_output=True, text=True,
        cwd=str(BACKEND), timeout=timeout,
    )
    out = []
    for line in proc.stdout.splitlines():
        line = line.strip()
        if line:
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                pytest.fail(f"server wrote non-JSON to stdout: {line[:200]}")
    return out


def test_initialize_handshake():
    replies = _speak([{
        "jsonrpc": "2.0", "id": 1, "method": "initialize",
        "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                   "clientInfo": {"name": "t", "version": "1"}},
    }])
    assert len(replies) == 1
    result = replies[0]["result"]
    assert result["protocolVersion"] == "2024-11-05"
    assert result["serverInfo"]["name"] == "codeauth"
    assert "tools" in result["capabilities"]
    # The instructions must carry the reliability caveat, so a client that only
    # reads the handshake still learns the model over-flags real code.
    assert "false-positive" in result["instructions"].lower()


def test_notifications_get_no_reply():
    """A JSON-RPC notification has no id and must not produce a response."""
    replies = _speak([{"jsonrpc": "2.0", "method": "notifications/initialized"}])
    assert replies == []


def test_tools_list_is_well_formed():
    replies = _speak([{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}])
    tools = replies[0]["result"]["tools"]
    assert len(tools) >= 9
    names = {t["name"] for t in tools}
    assert {"analyze_code", "get_model_card", "inspect_github_repository",
            "github_file_history"} <= names
    for tool in tools:
        assert tool["description"], f"{tool['name']} has no description"
        schema = tool["inputSchema"]
        assert schema["type"] == "object"
        # Every declared required field must exist in properties.
        for field in schema.get("required", []):
            assert field in schema["properties"], f"{tool['name']}: {field} not in properties"


def test_tools_call_returns_structured_json():
    replies = _speak([{
        "jsonrpc": "2.0", "id": 1, "method": "tools/call",
        "params": {"name": "get_model_card", "arguments": {}},
    }])
    result = replies[0]["result"]
    assert result["isError"] is False
    payload = json.loads(result["content"][0]["text"])
    assert "headline" in payload and "warnings" in payload


def test_unknown_tool_is_method_not_found():
    replies = _speak([{
        "jsonrpc": "2.0", "id": 1, "method": "tools/call",
        "params": {"name": "definitely_not_a_tool", "arguments": {}},
    }])
    assert replies[0]["error"]["code"] == -32601


def test_bad_arguments_are_invalid_params():
    replies = _speak([{
        "jsonrpc": "2.0", "id": 1, "method": "tools/call",
        "params": {"name": "analyze_code", "arguments": {"wrong_kwarg": 1}},
    }])
    assert replies[0]["error"]["code"] == -32602


def test_malformed_json_is_parse_error():
    proc = subprocess.run(
        [sys.executable, str(SERVER)],
        input="{not json at all\n", capture_output=True, text=True,
        cwd=str(BACKEND), timeout=60,
    )
    reply = json.loads(proc.stdout.strip().splitlines()[0])
    assert reply["error"]["code"] == -32700


def test_stdout_carries_protocol_only():
    """Logging must go to stderr; a stray stdout print corrupts the stream."""
    proc = subprocess.run(
        [sys.executable, str(SERVER)],
        input=json.dumps({"jsonrpc": "2.0", "id": 1, "method": "ping"}) + "\n",
        capture_output=True, text=True, cwd=str(BACKEND), timeout=60,
    )
    for line in proc.stdout.splitlines():
        if line.strip():
            json.loads(line)  # raises if anything non-JSON reached stdout
    assert "mcp_server" in proc.stderr  # log line went where it belongs


# ─── Config loading ───────────────────────────────────────────────────

def test_config_uses_the_claude_desktop_shape(tmp_path):
    path = tmp_path / "mcp_servers.json"
    path.write_text(json.dumps({"mcpServers": {
        "alpha": {"command": "python3", "args": ["x.py"], "description": "d"},
        "beta": {"command": "node", "args": [], "enabled": False},
        "broken": {"args": ["no command"]},
    }}))
    configs = load_server_configs(path)
    assert set(configs) == {"alpha", "beta"}       # "broken" has no command
    assert configs["alpha"].args == ["x.py"]
    assert configs["beta"].enabled is False


def test_missing_config_is_not_an_error(tmp_path):
    assert load_server_configs(tmp_path / "absent.json") == {}


def test_malformed_config_is_not_an_error(tmp_path):
    path = tmp_path / "bad.json"
    path.write_text("{ not json")
    assert load_server_configs(path) == {}


def test_unknown_command_fails_clearly():
    from app.services.mcp_client import MCPServerSession
    session = MCPServerSession(ServerConfig(name="nope", command="definitely-not-on-path"))
    with pytest.raises(MCPError) as exc:
        session.start()
    assert "not found on PATH" in str(exc.value)
    assert exc.value.status == 400


# ─── HTTP surface ─────────────────────────────────────────────────────

@needs_mcp
def test_status_lists_servers_and_tools(client):
    body = client.get("/api/mcp/status").json()
    assert body["configured"] is True
    assert body["server_count"] >= 1
    codeauth = next((s for s in body["servers"] if s["name"] == "codeauth"), None)
    assert codeauth is not None
    assert codeauth["connected"] is True, codeauth.get("error")
    assert len(codeauth["tools"]) >= 9
    assert body["tool_count"] >= 9


@needs_mcp
def test_call_over_http_runs_real_inference(client):
    resp = client.post("/api/mcp/call", json={
        "server": "codeauth", "tool": "analyze_code",
        "arguments": {
            "code": "def total(items):\n    out = 0\n    for i in items:\n"
                    "        out += i\n    return out\n",
            "language": "python",
        },
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body["is_error"] is False
    assert body["result"]["prediction"] in {"AI-LIKELY", "HUMAN-LIKELY", "INCONCLUSIVE"}
    assert body["result"]["engine"] in {"stylometric", "hybrid"}
    assert body["duration_ms"] > 0


def test_unconfigured_server_is_404(client):
    resp = client.post("/api/mcp/call", json={"server": "not-configured", "tool": "x"})
    assert resp.status_code == 404


@needs_mcp
def test_unknown_tool_is_404(client):
    resp = client.post("/api/mcp/call", json={"server": "codeauth", "tool": "nope"})
    assert resp.status_code == 404


@needs_mcp
def test_call_cannot_smuggle_a_command(client):
    """
    The request body has no command field by design. Extra keys must be ignored
    rather than influencing the spawn, so this endpoint can never become a shell.
    """
    resp = client.post("/api/mcp/call", json={
        "server": "codeauth", "tool": "get_model_card", "arguments": {},
        "command": "/bin/sh", "args": ["-c", "echo pwned"],
    })
    assert resp.status_code == 200
    assert "pwned" not in json.dumps(resp.json())


@needs_mcp
def test_reload_rereads_config(client):
    body = client.post("/api/mcp/reload").json()
    assert body["reloaded"] is True
    assert body["server_count"] >= 1


# ─── Agent loop ───────────────────────────────────────────────────────

@needs_mcp
def test_investigation_uses_mcp_and_logs_transport(client):
    body = client.post("/api/investigation/run", json={"task": "full_investigation"}).json()

    assert body["mcp"]["configured"] is True
    assert "codeauth" in body["mcp"]["connected_servers"]
    assert body["mcp"]["calls_made"] >= 1
    assert "get_model_card" in body["mcp"]["tools_discovered"]

    # Every logged call must declare how it was made.
    assert body["tool_log"]
    for entry in body["tool_log"]:
        assert entry["transport"] in {"mcp", "local"}
        if entry["transport"] == "mcp":
            assert entry["server"], "an MCP call must name its server"

    assert body["summary"]


def test_investigation_always_states_its_reliability_bound(client):
    """An assessment must not ship without its reliability caveat attached."""
    body = client.post("/api/investigation/run", json={"task": "full_investigation"}).json()
    critical = [f for f in body["findings"] if f["type"] == "critical"]
    assert critical, "no reliability bound was attached to the assessment"

    description = critical[0]["description"].lower()
    # Substance, not exact phrasing: it must name the measured error rate and
    # disclaim authorship, so the caveat cannot be reduced to a vague hedge.
    assert "known-human" in description
    assert "%" in description
    assert "evidence of authorship" in description

    # And the same bound must appear in the prose summary, not just the findings.
    assert "false-positive rate" in body["summary"].lower()


def test_investigation_tasks_all_run(client):
    for task in ("full_investigation", "anomaly_scan", "commit_forensics"):
        body = client.post("/api/investigation/run", json={"task": task}).json()
        assert body["task"] == task
        assert "summary" in body


@needs_mcp
def test_registry_reports_configuration():
    assert mcp_registry.configured is True
    assert "codeauth" in mcp_registry.configs
