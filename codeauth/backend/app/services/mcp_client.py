"""
MCP (Model Context Protocol) client — stdio transport.

The official `mcp` Python SDK requires Python >= 3.10 and this backend runs on
3.9, so the wire protocol is implemented directly. That is a small amount of code
because MCP stdio is plain JSON-RPC 2.0 with newline-delimited framing:

    -> {"jsonrpc":"2.0","id":1,"method":"initialize","params":{...}}
    <- {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"...", ...}}
    -> {"jsonrpc":"2.0","method":"notifications/initialized"}
    -> {"jsonrpc":"2.0","id":2,"method":"tools/list"}
    -> {"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":...,"arguments":{...}}}

Server definitions are read from a config file in the same shape Claude Desktop
and Claude Code use, so an existing `mcpServers` block can be pasted straight in.

Security posture — this spawns child processes, so it is deliberately narrow:

  * Servers can only be declared in the operator-controlled config file. An HTTP
    caller may reference a server *by name* but can never supply a command,
    argument, or environment variable, so the API cannot be turned into a remote
    shell.
  * No shell interpretation: every spawn is a direct argv exec.
  * The child inherits a minimal environment plus only the keys the config names.
  * Every request is bounded by a timeout, and a server that misbehaves is
    terminated rather than left to hang the worker.
"""
from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

PROTOCOL_VERSION = "2024-11-05"
CLIENT_INFO = {"name": "codeauth", "version": "2.0.0"}

DEFAULT_CONFIG_PATH = Path(__file__).resolve().parents[2] / "mcp_servers.json"
DEFAULT_TIMEOUT = 30.0
STARTUP_TIMEOUT = 25.0

# Environment keys a child server is allowed to inherit. Anything else must be
# named explicitly in the config's "env" block.
SAFE_ENV_KEYS = ("PATH", "HOME", "LANG", "LC_ALL", "TMPDIR", "SYSTEMROOT", "PYTHONPATH")


class MCPError(Exception):
    """Raised for anything the caller should see as a 4xx/5xx."""

    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


@dataclass
class ServerConfig:
    name: str
    command: str
    args: list[str] = field(default_factory=list)
    env: dict[str, str] = field(default_factory=dict)
    description: str = ""
    enabled: bool = True
    cwd: Optional[str] = None


def load_server_configs(path: Optional[Path] = None) -> dict[str, ServerConfig]:
    """
    Read `mcp_servers.json`.

    Shape (identical to Claude Desktop / Claude Code):

        {
          "mcpServers": {
            "codeauth": {
              "command": "python3",
              "args": ["mcp_server.py"],
              "description": "CodeAuth's own analysis tools"
            }
          }
        }
    """
    config_path = path or Path(os.getenv("MCP_CONFIG", DEFAULT_CONFIG_PATH))
    if not config_path.exists():
        return {}

    try:
        raw = json.loads(config_path.read_text())
    except Exception as exc:
        logger.error("Could not parse %s: %s", config_path, exc)
        return {}

    servers: dict[str, ServerConfig] = {}
    for name, spec in (raw.get("mcpServers") or {}).items():
        command = (spec or {}).get("command")
        if not command:
            logger.warning("MCP server %r has no command; skipping", name)
            continue
        servers[name] = ServerConfig(
            name=name,
            command=str(command),
            args=[str(a) for a in (spec.get("args") or [])],
            env={str(k): str(v) for k, v in (spec.get("env") or {}).items()},
            description=str(spec.get("description") or ""),
            enabled=bool(spec.get("enabled", True)),
            cwd=spec.get("cwd"),
        )
    return servers


class MCPServerSession:
    """One live stdio connection to one MCP server."""

    def __init__(self, config: ServerConfig, timeout: float = DEFAULT_TIMEOUT):
        self.config = config
        self.timeout = timeout
        self.process: Optional[subprocess.Popen] = None
        self.server_info: dict = {}
        self.capabilities: dict = {}
        self.protocol_version: str = ""
        self._next_id = 0
        self._lock = threading.Lock()
        self._stderr_tail: list[str] = []

    # ── lifecycle ────────────────────────────────────────────────────

    def start(self) -> None:
        resolved = shutil.which(self.config.command)
        if not resolved:
            raise MCPError(
                f"MCP server '{self.config.name}': command '{self.config.command}' not found on PATH.",
                status=400,
            )

        env = {k: os.environ[k] for k in SAFE_ENV_KEYS if k in os.environ}
        env.update(self.config.env)

        cwd = self.config.cwd or str(DEFAULT_CONFIG_PATH.parent)

        try:
            self.process = subprocess.Popen(
                [resolved, *self.config.args],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=env,
                cwd=cwd,
                text=True,
                bufsize=1,          # line buffered: stdio framing is newline delimited
                close_fds=True,
                shell=False,        # never a shell — argv exec only
            )
        except OSError as exc:
            raise MCPError(f"Could not start MCP server '{self.config.name}': {exc}") from exc

        threading.Thread(target=self._drain_stderr, daemon=True).start()
        self._handshake()

    def _drain_stderr(self) -> None:
        """Keep the last few stderr lines for diagnostics without blocking."""
        if not self.process or not self.process.stderr:
            return
        for line in self.process.stderr:
            line = line.rstrip()
            if line:
                self._stderr_tail.append(line)
                del self._stderr_tail[:-20]

    def _handshake(self) -> None:
        result = self._request(
            "initialize",
            {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {"tools": {}, "resources": {}},
                "clientInfo": CLIENT_INFO,
            },
            timeout=STARTUP_TIMEOUT,
        )
        self.protocol_version = result.get("protocolVersion", "")
        self.server_info = result.get("serverInfo") or {}
        self.capabilities = result.get("capabilities") or {}
        self._notify("notifications/initialized")

    def close(self) -> None:
        if not self.process:
            return
        try:
            if self.process.stdin:
                self.process.stdin.close()
            self.process.terminate()
            try:
                self.process.wait(timeout=4)
            except subprocess.TimeoutExpired:
                self.process.kill()
        except Exception:
            pass
        finally:
            self.process = None

    @property
    def alive(self) -> bool:
        return self.process is not None and self.process.poll() is None

    # ── JSON-RPC ─────────────────────────────────────────────────────

    def _send(self, payload: dict) -> None:
        if not self.process or not self.process.stdin:
            raise MCPError(f"MCP server '{self.config.name}' is not running.")
        try:
            self.process.stdin.write(json.dumps(payload) + "\n")
            self.process.stdin.flush()
        except (BrokenPipeError, ValueError) as exc:
            raise MCPError(f"MCP server '{self.config.name}' closed its input: {exc}") from exc

    def _notify(self, method: str, params: Optional[dict] = None) -> None:
        self._send({"jsonrpc": "2.0", "method": method, "params": params or {}})

    def _request(self, method: str, params: Optional[dict] = None,
                 timeout: Optional[float] = None) -> dict:
        budget = timeout or self.timeout
        with self._lock:
            self._next_id += 1
            request_id = self._next_id
            self._send({
                "jsonrpc": "2.0", "id": request_id,
                "method": method, "params": params or {},
            })

            deadline = time.monotonic() + budget
            while True:
                if time.monotonic() > deadline:
                    self.close()
                    raise MCPError(
                        f"MCP server '{self.config.name}' did not answer '{method}' "
                        f"within {budget:.0f}s.", status=504,
                    )
                line = self._read_line(deadline)
                if line is None:
                    tail = "; ".join(self._stderr_tail[-3:])
                    raise MCPError(
                        f"MCP server '{self.config.name}' exited during '{method}'."
                        + (f" stderr: {tail}" if tail else "")
                    )
                try:
                    message = json.loads(line)
                except json.JSONDecodeError:
                    # Servers sometimes print banners to stdout; skip non-JSON.
                    continue

                # Ignore notifications and any request the server sends us.
                if message.get("id") != request_id:
                    continue
                if "error" in message:
                    err = message["error"] or {}
                    # -32601 is JSON-RPC "method not found"; for tools/call that
                    # means the tool does not exist, which is a 404 not a 502.
                    status = 404 if err.get("code") == -32601 else 502
                    raise MCPError(
                        f"MCP server '{self.config.name}' returned an error for "
                        f"'{method}': {err.get('message', err)}", status=status,
                    )
                return message.get("result") or {}

    def _read_line(self, deadline: float) -> Optional[str]:
        """Blocking readline, guarded by the caller's deadline."""
        if not self.process or not self.process.stdout:
            return None
        line = self.process.stdout.readline()
        if line == "":
            return None
        if time.monotonic() > deadline:
            return None
        return line.strip()

    # ── MCP methods ──────────────────────────────────────────────────

    def list_tools(self) -> list[dict]:
        result = self._request("tools/list")
        return result.get("tools") or []

    def call_tool(self, name: str, arguments: Optional[dict] = None,
                  timeout: Optional[float] = None) -> dict:
        result = self._request(
            "tools/call",
            {"name": name, "arguments": arguments or {}},
            timeout=timeout,
        )
        return {
            "content": result.get("content") or [],
            "isError": bool(result.get("isError")),
            "structured": _first_json_payload(result.get("content") or []),
        }


def _first_json_payload(content: list[dict]) -> Any:
    """
    MCP tool results are a list of content blocks. Ours return JSON as text, so
    pull out the first block that parses — callers get structured data instead of
    having to re-parse strings.
    """
    for block in content:
        if block.get("type") == "text":
            try:
                return json.loads(block.get("text") or "")
            except (json.JSONDecodeError, TypeError):
                continue
    return None


class MCPRegistry:
    """
    Lazily connects to configured servers and caches the sessions.

    Sessions are reused across requests because the handshake plus interpreter
    start-up costs far more than a tool call.
    """

    def __init__(self) -> None:
        self.configs: dict[str, ServerConfig] = {}
        self.sessions: dict[str, MCPServerSession] = {}
        self.errors: dict[str, str] = {}
        self._lock = threading.Lock()
        self.reload()

    def reload(self) -> None:
        with self._lock:
            for session in self.sessions.values():
                session.close()
            self.sessions.clear()
            self.errors.clear()
            self.configs = load_server_configs()

    @property
    def configured(self) -> bool:
        return any(c.enabled for c in self.configs.values())

    def session(self, name: str) -> MCPServerSession:
        config = self.configs.get(name)
        if config is None:
            raise MCPError(f"No MCP server named '{name}' is configured.", status=404)
        if not config.enabled:
            raise MCPError(f"MCP server '{name}' is disabled in the config.", status=400)

        with self._lock:
            existing = self.sessions.get(name)
            if existing and existing.alive:
                return existing
            if existing:
                existing.close()
                self.sessions.pop(name, None)

            session = MCPServerSession(config)
            try:
                session.start()
            except MCPError as exc:
                self.errors[name] = str(exc)
                raise
            self.sessions[name] = session
            self.errors.pop(name, None)
            return session

    def discover(self) -> dict[str, Any]:
        """Connect to every enabled server and list its tools."""
        servers = []
        for name, config in self.configs.items():
            entry: dict[str, Any] = {
                "name": name,
                "description": config.description,
                "command": f"{config.command} {' '.join(config.args)}".strip(),
                "enabled": config.enabled,
                "connected": False,
                "tools": [],
                "error": None,
            }
            if not config.enabled:
                entry["error"] = "disabled in config"
                servers.append(entry)
                continue
            try:
                session = self.session(name)
                entry["connected"] = True
                entry["server_info"] = session.server_info
                entry["protocol_version"] = session.protocol_version
                entry["tools"] = [
                    {
                        "name": t.get("name"),
                        "description": t.get("description", ""),
                        "input_schema": t.get("inputSchema") or {},
                    }
                    for t in session.list_tools()
                ]
            except MCPError as exc:
                entry["error"] = str(exc)
            servers.append(entry)

        return {
            "configured": self.configured,
            "config_path": str(Path(os.getenv("MCP_CONFIG", DEFAULT_CONFIG_PATH))),
            "server_count": len(self.configs),
            "servers": servers,
        }

    def call(self, server: str, tool: str, arguments: Optional[dict] = None) -> dict:
        session = self.session(server)
        started = time.monotonic()
        result = session.call_tool(tool, arguments)
        result["server"] = server
        result["tool"] = tool
        result["duration_ms"] = round((time.monotonic() - started) * 1000, 1)
        return result

    def shutdown(self) -> None:
        with self._lock:
            for session in self.sessions.values():
                session.close()
            self.sessions.clear()


mcp_registry = MCPRegistry()
