import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Bot, Terminal, Play, Wrench, Loader2, TriangleAlert, Plug, RefreshCw,
  ChevronDown, ChevronRight, Zap, Database, CircleCheck, CircleX,
} from 'lucide-react';
import { runInvestigation, mcpStatus, mcpReload, mcpCall } from '../api/client';
import type {
  InvestigationResult, MCPStatus, MCPServerEntry, MCPCallResult,
} from '../types';
import PageHeader from '../components/PageHeader';
import ModelWarnings from '../components/ModelWarnings';

const TASKS = [
  { value: 'full_investigation', label: 'Full audit synthesis' },
  { value: 'anomaly_scan', label: 'Stylometric anomaly scan' },
  { value: 'commit_forensics', label: 'Commit & history forensics' },
];

export default function InvestigationPage() {
  const [task, setTask] = useState('full_investigation');
  const [repositoryId, setRepositoryId] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [filePath, setFilePath] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<InvestigationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [mcp, setMcp] = useState<MCPStatus | null>(null);
  const [mcpLoading, setMcpLoading] = useState(true);

  // Kept separate from the reload handler so the mount effect does not call
  // setState synchronously — mcpLoading already starts true.
  const fetchMcp = () =>
    mcpStatus()
      .then(setMcp)
      .catch(() => setMcp(null))
      .finally(() => setMcpLoading(false));

  useEffect(() => { void fetchMcp(); }, []);

  const reloadMcp = () => {
    setMcpLoading(true);
    mcpReload().catch(() => {}).finally(fetchMcp);
  };

  const launch = async () => {
    setRunning(true);
    setError(null);
    try {
      const parameters: Record<string, string> = {};
      if (repoUrl.trim()) parameters.repository_url = repoUrl.trim();
      if (filePath.trim()) parameters.file_path = filePath.trim();
      setResult(await runInvestigation({
        task,
        repository_id: repositoryId.trim() || undefined,
        parameters,
      }));
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Investigation failed.');
    } finally {
      setRunning(false);
    }
  };

  const commitMode = task === 'commit_forensics';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <PageHeader
        eyebrow="Investigation"
        eyebrowIcon={<Bot className="w-[15px] h-[15px]" />}
        title="Agentic investigation over MCP"
        description="The agent discovers tools from connected MCP servers, calls them over JSON-RPC/stdio, and synthesizes an assessment. Every call is logged with its transport."
      />

      <ModelWarnings compact severity="high" />

      <MCPPanel status={mcp} loading={mcpLoading} onReload={reloadMcp} />

      <div className="grid lg:grid-cols-3 gap-6">
        {/* ── Controls ── */}
        <div className="card p-5 space-y-4 h-fit">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Investigation scope
          </h3>

          <label className="block">
            <span className="block text-xs font-semibold mb-1.5">Directive</span>
            <select value={task} onChange={e => setTask(e.target.value)} className="field !text-xs cursor-pointer">
              {TASKS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>

          {!commitMode && (
            <label className="block">
              <span className="block text-xs font-semibold mb-1.5">
                Repository ID <span className="font-normal text-[var(--text-muted)]">(optional)</span>
              </span>
              <input
                value={repositoryId}
                onChange={e => setRepositoryId(e.target.value)}
                placeholder="from a scan, or leave blank for the latest"
                className="field font-mono !text-xs"
              />
            </label>
          )}

          {commitMode && (
            <>
              <label className="block">
                <span className="block text-xs font-semibold mb-1.5">GitHub repository</span>
                <input
                  value={repoUrl}
                  onChange={e => setRepoUrl(e.target.value)}
                  placeholder="owner/repo"
                  className="field font-mono !text-xs"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold mb-1.5">
                  File path <span className="font-normal text-[var(--text-muted)]">(optional)</span>
                </span>
                <input
                  value={filePath}
                  onChange={e => setFilePath(e.target.value)}
                  placeholder="src/module/file.py"
                  className="field font-mono !text-xs"
                />
              </label>
            </>
          )}

          <button onClick={launch} disabled={running} className="btn-primary btn-block !text-xs">
            {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            {running ? 'Orchestrating…' : 'Launch investigation'}
          </button>

          <p className="text-[0.65rem] leading-relaxed text-[var(--text-muted)]">
            When no MCP server is reachable the agent falls back to direct database reads, and the
            tool log marks each call <code>mcp</code> or <code>local</code> so the provenance is
            never ambiguous.
          </p>
        </div>

        {/* ── Output ── */}
        <div className="lg:col-span-2 space-y-4">
          {error && (
            <div className="card p-4 border-red-200 flex items-start gap-2.5 text-red-600">
              <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {result ? (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="card p-5 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Bot className="w-4 h-4 text-coral-500" />
                  <h3 className="text-sm font-bold uppercase tracking-wider">Assessment</h3>
                  <span className="chip !text-[0.65rem] ml-auto">{result.task}</span>
                </div>
                <p className="text-sm leading-relaxed rounded-xl bg-[var(--surface-sunken)] border border-[var(--line)] p-4">
                  {result.summary}
                </p>
                <p className="flex items-center gap-1.5 text-[0.7rem] text-[var(--text-muted)]">
                  <Plug className="w-3 h-3" /> {result.mcp.status}
                </p>
              </div>

              {result.findings.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Findings
                  </h4>
                  {result.findings.map(f => {
                    const tone = f.type === 'critical'
                      ? 'border-red-300/70 bg-red-50/70 text-red-800'
                      : f.type === 'warning'
                        ? 'border-amber-300/60 bg-amber-50/50 text-amber-900'
                        : 'border-[var(--line)] bg-[var(--surface-sunken)]';
                    return (
                      <div key={f.title} className={`card p-4 space-y-1 ${tone}`}>
                        <p className="text-xs font-bold">
                          {f.type === 'critical' ? '🔴' : f.type === 'warning' ? '🟠' : 'ℹ️'} {f.title}
                        </p>
                        <p className="text-xs leading-relaxed opacity-90">{f.description}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              {result.mcp.tools_discovered.length > 0 && (
                <div className="card p-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">
                    Tools discovered ({result.mcp.tools_discovered.length})
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {result.mcp.tools_discovered.map(t => (
                      <span key={t} className="chip !text-[0.65rem] font-mono">{t}</span>
                    ))}
                  </div>
                </div>
              )}

              <div className="card p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-[var(--text-muted)]" />
                  <h4 className="text-xs font-bold uppercase tracking-wider">Tool audit trail</h4>
                  <span className="text-[0.65rem] text-[var(--text-muted)] ml-auto">
                    {result.tool_log.filter(e => e.transport === 'mcp').length} over MCP ·{' '}
                    {result.tool_log.filter(e => e.transport === 'local').length} local
                  </span>
                </div>
                <div className="space-y-1.5">
                  {result.tool_log.map((e, i) => (
                    <div
                      key={i}
                      className="font-mono text-[0.68rem] p-2.5 rounded-lg bg-slate-900 text-emerald-300 flex flex-wrap items-center gap-x-3 gap-y-1"
                    >
                      <span className={`px-1.5 py-0.5 rounded text-[0.6rem] font-bold not-italic ${
                        e.transport === 'mcp' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-600/40 text-slate-300'
                      }`}>
                        {e.transport.toUpperCase()}
                      </span>
                      <span className="flex-1 min-w-0 truncate">
                        {e.server ? `${e.server}::` : ''}{e.tool}({
                          Object.entries(e.parameters).map(([k, v]) => `${k}=${String(v)}`).join(', ')
                        })
                      </span>
                      {e.duration_ms !== null && (
                        <span className="text-slate-400">{e.duration_ms}ms</span>
                      )}
                      {e.error && <span className="text-red-400 w-full">{e.error}</span>}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="card p-12 text-center space-y-2">
              <Wrench className="w-10 h-10 mx-auto text-[var(--text-muted)]" />
              <p className="text-sm text-[var(--text-body)]">
                Launch an investigation to see the discover → plan → act → synthesize loop.
              </p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ─── MCP panel ───────────────────────────────────── */

function MCPPanel({ status, loading, onReload }: {
  status: MCPStatus | null; loading: boolean; onReload: () => void;
}) {
  const [open, setOpen] = useState(false);

  if (loading) {
    return (
      <div className="card p-4 flex items-center gap-2.5 text-sm text-[var(--text-body)]">
        <Loader2 className="w-4 h-4 animate-spin text-coral-500" />
        Connecting to MCP servers…
      </div>
    );
  }

  if (!status?.configured) {
    return (
      <div className="card p-4 border-amber-300/60 bg-amber-50/50">
        <p className="text-sm font-semibold text-amber-800 flex items-center gap-2">
          <Plug className="w-4 h-4" /> No MCP servers configured
        </p>
        <p className="mt-1 text-xs text-amber-800/90">
          Add an <code>mcpServers</code> block to <code>{status?.config_path || 'mcp_servers.json'}</code>.
          The agent will fall back to direct database reads until then.
        </p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full p-4 flex items-center gap-3 text-left hover:bg-[var(--surface-soft)] transition-colors">
        <Plug className={`w-[18px] h-[18px] shrink-0 ${status.connected_servers.length ? 'text-green-600' : 'text-red-500'}`} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">MCP — {status.summary}</span>
          <span className="block text-[0.68rem] text-[var(--text-muted)] font-mono truncate">
            {status.config_path}
          </span>
        </span>
        <button
          onClick={e => { e.stopPropagation(); onReload(); }}
          className="icon-btn !w-8 !h-8 !rounded-lg shrink-0"
          title="Reload config and reconnect"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        <ChevronDown className={`w-4 h-4 shrink-0 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-[var(--line)] divide-y divide-[var(--line)]">
          {status.servers.map(server => <ServerRow key={server.name} server={server} />)}
        </div>
      )}
    </div>
  );
}

function ServerRow({ server }: { server: MCPServerEntry }) {
  const [expanded, setExpanded] = useState(false);
  const [tool, setTool] = useState<string | null>(null);
  const [callResult, setCallResult] = useState<MCPCallResult | null>(null);
  const [calling, setCalling] = useState(false);

  const invoke = async (name: string) => {
    setTool(name);
    setCalling(true);
    setCallResult(null);
    try {
      // Only zero-argument tools are safe to fire from a one-click probe.
      setCallResult(await mcpCall({ server: server.name, tool: name, arguments: {} }));
    } catch (err: any) {
      setCallResult({
        server: server.name, tool: name, is_error: true, duration_ms: 0,
        result: err?.response?.data?.detail || 'call failed', content: [],
      });
    } finally {
      setCalling(false);
    }
  };

  const noArgTools = server.tools.filter(t => (t.input_schema?.required?.length ?? 0) === 0);

  return (
    <div className="p-4">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center gap-2.5 text-left">
        <ChevronRight className={`w-3.5 h-3.5 shrink-0 text-[var(--text-muted)] transition-transform ${expanded ? 'rotate-90' : ''}`} />
        {server.connected
          ? <CircleCheck className="w-4 h-4 shrink-0 text-green-600" />
          : <CircleX className="w-4 h-4 shrink-0 text-red-500" />}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">
            {server.name}
            {server.server_info?.version && (
              <span className="ml-2 font-normal text-[0.68rem] text-[var(--text-muted)]">
                v{server.server_info.version} · MCP {server.protocol_version}
              </span>
            )}
          </span>
          <span className="block text-[0.68rem] text-[var(--text-muted)]">
            {server.description || server.command}
          </span>
        </span>
        <span className="chip !text-[0.65rem] shrink-0">{server.tools.length} tools</span>
      </button>

      {server.error && (
        <p className="mt-2 ml-6 text-xs text-red-600">{server.error}</p>
      )}

      {expanded && server.tools.length > 0 && (
        <div className="mt-3 ml-6 space-y-2">
          {server.tools.map(t => {
            const required = t.input_schema?.required || [];
            return (
              <div key={t.name} className="rounded-xl border border-[var(--line)] p-3">
                <div className="flex items-start gap-2">
                  <Zap className="w-3.5 h-3.5 shrink-0 mt-0.5 text-coral-500" />
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs font-semibold">{t.name}</p>
                    <p className="mt-0.5 text-[0.7rem] leading-relaxed text-[var(--text-body)]">
                      {t.description}
                    </p>
                    {required.length > 0 && (
                      <p className="mt-1 text-[0.65rem] text-[var(--text-muted)]">
                        requires: {required.join(', ')}
                      </p>
                    )}
                  </div>
                  {required.length === 0 && (
                    <button
                      onClick={() => invoke(t.name)}
                      disabled={calling}
                      className="btn-secondary !text-[0.65rem] !py-1 !px-2 shrink-0"
                    >
                      {calling && tool === t.name ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Run'}
                    </button>
                  )}
                </div>

                {callResult && tool === t.name && (
                  <div className="mt-2 rounded-lg bg-[var(--surface-sunken)] border border-[var(--line)] p-2.5">
                    <p className="flex items-center gap-1.5 text-[0.65rem] text-[var(--text-muted)] mb-1">
                      <Database className="w-3 h-3" />
                      {callResult.is_error ? 'error' : 'ok'} · {callResult.duration_ms}ms over MCP
                    </p>
                    <pre className="text-[0.65rem] font-mono overflow-x-auto max-h-40 whitespace-pre-wrap">
                      {JSON.stringify(callResult.result, null, 2)?.slice(0, 1400)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
          {noArgTools.length === 0 && (
            <p className="text-[0.65rem] text-[var(--text-muted)]">
              All tools on this server take required arguments; run them from the Investigation
              directive or the API.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
