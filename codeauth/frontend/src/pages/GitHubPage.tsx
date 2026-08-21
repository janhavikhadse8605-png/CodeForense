import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Search, Loader2, TriangleAlert, Star, GitFork, Scale, Clock,
  FileCode2, ChevronRight, ExternalLink, Users, KeyRound, History,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts';
import {
  githubStatus, githubInspect, githubAnalyze, githubEvolution,
} from '../api/client';
import type {
  GitHubStatus, GitHubInspectResult, GitHubAnalyzeResult, GitHubEvolutionResult,
} from '../types';
import PageHeader from '../components/PageHeader';
import GithubMark from '../components/GithubMark';
import ModelWarnings from '../components/ModelWarnings';

type Tab = 'inspect' | 'scan' | 'history';

const TABS: Array<{ id: Tab; label: string; hint: string }> = [
  { id: 'inspect', label: 'Inspect', hint: 'Metadata and commits. No inference, one API call.' },
  { id: 'scan', label: 'Scan files', hint: 'Download the ref and score every source file.' },
  { id: 'history', label: 'Commit history', hint: 'Score one file across its commits.' },
];

export default function GitHubPage() {
  const [tab, setTab] = useState<Tab>('inspect');
  const [url, setUrl] = useState('psf/requests');
  const [token, setToken] = useState('');
  const [filePath, setFilePath] = useState('src/requests/sessions.py');
  const [maxFiles, setMaxFiles] = useState(100);
  const [commitLimit, setCommitLimit] = useState(10);

  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [inspectResult, setInspectResult] = useState<GitHubInspectResult | null>(null);
  const [scanResult, setScanResult] = useState<GitHubAnalyzeResult | null>(null);
  const [historyResult, setHistoryResult] = useState<GitHubEvolutionResult | null>(null);

  useEffect(() => {
    githubStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

  const run = async () => {
    setBusy(true);
    setError(null);
    const payload = { repository_url: url.trim(), token: token.trim() || undefined };
    try {
      if (tab === 'inspect') {
        setInspectResult(await githubInspect({ ...payload, commit_limit: 30 }));
      } else if (tab === 'scan') {
        setScanResult(await githubAnalyze({
          ...payload, max_files: maxFiles, include_commits: true, commit_limit: 10,
        }));
      } else {
        setHistoryResult(await githubEvolution({
          ...payload, file_path: filePath.trim(), commit_limit: commitLimit,
        }));
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Request failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <PageHeader
        eyebrow="GitHub"
        eyebrowIcon={<GithubMark className="w-[15px] h-[15px]" />}
        title="Analyze a GitHub repository"
        description="Fetched over the GitHub REST API — no clone, no shell. Paste a URL, owner/repo, or a /tree/branch link."
      />

      <ModelWarnings compact severity="high" />

      {/* ── Access status ── */}
      {status && (
        <div className={`card p-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs ${
          status.reachable ? '' : 'border-red-200'
        }`}>
          <span className="flex items-center gap-2 font-semibold">
            <span className={`w-2 h-2 rounded-full ${status.reachable ? 'bg-green-500' : 'bg-red-500'}`} />
            {status.reachable ? 'GitHub reachable' : 'GitHub unreachable'}
          </span>
          <span className="flex items-center gap-1.5 text-[var(--text-body)]">
            <KeyRound className="w-3.5 h-3.5" />
            {status.token_configured ? 'Backend token configured' : 'No backend token'}
          </span>
          {status.rate_remaining !== undefined && (
            <span className="text-[var(--text-body)]">
              Rate limit: <strong>{status.rate_remaining}</strong>/{status.rate_limit} remaining
            </span>
          )}
          {status.note && <span className="text-[var(--text-muted)]">{status.note}</span>}
        </div>
      )}

      {/* ── Controls ── */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--surface-sunken)] border border-[var(--line)] w-fit">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
                tab === t.id
                  ? 'bg-[var(--surface)] text-coral-600 shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-body)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-[var(--text-muted)]">{TABS.find(t => t.id === tab)!.hint}</p>

        <div className="grid md:grid-cols-2 gap-4">
          <label className="block">
            <span className="block text-xs font-semibold mb-1.5">Repository</span>
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="owner/repo or https://github.com/owner/repo"
              className="field font-mono !text-xs"
            />
          </label>

          <label className="block">
            <span className="block text-xs font-semibold mb-1.5">
              Personal access token <span className="font-normal text-[var(--text-muted)]">(optional)</span>
            </span>
            <input
              type="password"
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="only needed for private repos"
              autoComplete="off"
              className="field font-mono !text-xs"
            />
            <span className="block text-[0.65rem] text-[var(--text-muted)] mt-1">
              Sent as a bearer header for this one request. Never stored or logged. Prefer setting
              <code className="mx-1">GITHUB_TOKEN</code> on the backend.
            </span>
          </label>

          {tab === 'scan' && (
            <label className="block">
              <span className="block text-xs font-semibold mb-1.5">Max files to score</span>
              <input
                type="number" min={1} max={2000} value={maxFiles}
                onChange={e => setMaxFiles(Number(e.target.value))}
                className="field !text-xs"
              />
            </label>
          )}

          {tab === 'history' && (
            <>
              <label className="block">
                <span className="block text-xs font-semibold mb-1.5">File path in repository</span>
                <input
                  value={filePath}
                  onChange={e => setFilePath(e.target.value)}
                  placeholder="src/module/file.py"
                  className="field font-mono !text-xs"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold mb-1.5">Commits to score</span>
                <input
                  type="number" min={2} max={50} value={commitLimit}
                  onChange={e => setCommitLimit(Number(e.target.value))}
                  className="field !text-xs"
                />
              </label>
            </>
          )}
        </div>

        <button onClick={run} disabled={busy || !url.trim()} className="btn-primary">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          {busy ? 'Working…' : TABS.find(t => t.id === tab)!.label}
        </button>
      </div>

      {error && (
        <div className="card p-4 border-red-200 flex items-start gap-2.5 text-red-600">
          <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {tab === 'inspect' && inspectResult && <InspectView data={inspectResult} />}
      {tab === 'scan' && scanResult && <ScanView data={scanResult} />}
      {tab === 'history' && historyResult && <HistoryView data={historyResult} />}
    </motion.div>
  );
}

/* ─── Inspect ─────────────────────────────────────── */

function InspectView({ data }: { data: GitHubInspectResult }) {
  const r = data.repository;
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <a href={r.html_url} target="_blank" rel="noreferrer"
               className="text-lg font-bold hover:text-coral-600 inline-flex items-center gap-1.5">
              {r.full_name} <ExternalLink className="w-3.5 h-3.5" />
            </a>
            {r.description && (
              <p className="mt-1 text-sm text-[var(--text-body)] max-w-2xl">{r.description}</p>
            )}
          </div>
          <span className="chip">{data.ref}</span>
        </div>

        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-[var(--text-body)]">
          <span className="flex items-center gap-1.5"><Star className="w-3.5 h-3.5" /> {r.stars?.toLocaleString()}</span>
          <span className="flex items-center gap-1.5"><GitFork className="w-3.5 h-3.5" /> {r.forks?.toLocaleString()}</span>
          {r.license && <span className="flex items-center gap-1.5"><Scale className="w-3.5 h-3.5" /> {r.license}</span>}
          {r.language && <span className="flex items-center gap-1.5"><FileCode2 className="w-3.5 h-3.5" /> {r.language}</span>}
          <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> {data.distinct_authors} authors in sample</span>
          {r.pushed_at && (
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> pushed {new Date(r.pushed_at).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="card p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
            Commits per author
          </h3>
          <div className="space-y-2">
            {Object.entries(data.commits_per_author).slice(0, 10).map(([name, count]) => (
              <div key={name} className="flex items-center gap-2 text-xs">
                <span className="truncate flex-1">{name}</span>
                <span className="font-semibold">{count}</span>
                <span className="h-1.5 rounded-full bg-coral-400"
                      style={{ width: `${Math.max(6, (count / data.commit_count_sampled) * 80)}px` }} />
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 card p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
            Recent commits ({data.commit_count_sampled})
          </h3>
          <div className="space-y-1 max-h-[340px] overflow-auto">
            {data.commits.map(c => (
              <a key={c.sha} href={c.html_url} target="_blank" rel="noreferrer"
                 className="flex items-start gap-3 p-2 rounded-lg hover:bg-[var(--surface-soft)] transition-colors">
                <code className="text-[0.68rem] text-coral-600 shrink-0 mt-0.5">{c.short_sha}</code>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs truncate">{c.message}</span>
                  <span className="block text-[0.65rem] text-[var(--text-muted)]">
                    {c.author_name || 'unknown'} · {c.date ? new Date(c.date).toLocaleDateString() : ''}
                  </span>
                </span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Scan ────────────────────────────────────────── */

function ScanView({ data }: { data: GitHubAnalyzeResult }) {
  const [query, setQuery] = useState('');
  const files = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q ? data.file_results.filter(f => f.file_path.toLowerCase().includes(q)) : data.file_results;
    return [...rows].sort((a, b) => b.confidence - a.confidence);
  }, [data, query]);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Metric label="Files scored" value={data.files_analyzed} />
        <Metric label="Functions" value={data.functions_analyzed} />
        <Metric label="Human-assoc." value={`${data.human_ratio}%`} tone="text-green-600" />
        <Metric label="AI-assoc." value={`${data.ai_ratio}%`} tone="text-red-500" />
        <Metric label="Skipped" value={data.files_skipped} />
      </div>

      {data.truncated && (
        <p className="card p-3 text-xs text-amber-700 border-amber-300/70 bg-amber-50/60">
          Scan stopped at the file cap, so these ratios cover only the files scored — raise
          “Max files” for full coverage.
        </p>
      )}

      <div className="card p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2.5">
          {data.repository.full_name} @ {data.ref}
        </p>
        <div className="flex h-3 rounded-full overflow-hidden bg-[var(--line)]">
          <div style={{ width: `${data.human_ratio}%` }} className="bg-green-500" />
          <div style={{ width: `${data.ai_ratio}%` }} className="bg-red-500" />
          <div style={{ width: `${data.mixed_ratio}%` }} className="bg-amber-500" />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="p-4 border-b border-[var(--line)] flex flex-wrap items-center gap-3">
          <h3 className="text-sm font-semibold">Per-file verdicts</h3>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Filter by path…"
            className="field !py-2 !text-xs w-52 ml-auto"
          />
        </div>
        <div className="max-h-[460px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--surface-sunken)]">
              <tr className="text-left">
                {['File', 'Lang', 'Verdict', 'Conf.', 'Lines'].map(h => (
                  <th key={h} className="p-3 text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {files.map(f => (
                <tr key={f.file_path} className="border-t border-[var(--line)] hover:bg-[var(--surface-soft)]">
                  <td className="p-3 font-mono text-[0.7rem] max-w-[320px] truncate" title={f.file_path}>
                    {f.file_path}
                  </td>
                  <td className="p-3 text-xs capitalize">{f.language}</td>
                  <td className="p-3">
                    <span className={
                      f.prediction.includes('AI') ? 'badge-ai !text-[0.6rem] !px-2 !py-0.5'
                        : f.prediction.includes('HUMAN') ? 'badge-human !text-[0.6rem] !px-2 !py-0.5'
                          : 'badge-neutral !text-[0.6rem] !px-2 !py-0.5'
                    }>{f.prediction}</span>
                  </td>
                  <td className="p-3 text-xs font-medium">{f.confidence}%</td>
                  <td className="p-3 text-xs">{f.lines}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[0.7rem] text-[var(--text-muted)]">
        Repository id <code>{data.id}</code> — paste it into Investigation for a forensic summary,
        or ask the assistant to summarise this scan.
      </p>
    </motion.div>
  );
}

/* ─── Commit history ─────────────────────────────── */

function HistoryView({ data }: { data: GitHubEvolutionResult }) {
  const chart = data.timeline.map(p => ({
    label: p.short_sha,
    ai: p.ai_probability,
    human: p.human_probability,
    author: p.author_name || 'unknown',
    date: p.date ? new Date(p.date).toLocaleDateString() : '',
  }));

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      <div className="card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <History className="w-4 h-4 text-coral-500" />
            <code className="text-xs">{data.file_path}</code>
          </h3>
          <span className="text-xs text-[var(--text-muted)]">
            {data.revisions_analyzed} revisions scored of {data.commits_examined} commits examined
          </span>
        </div>
        <div className="h-64 w-full mt-3">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
              <XAxis dataKey="label" stroke="var(--text-muted)" fontSize={11} />
              <YAxis stroke="var(--text-muted)" fontSize={11} unit="%" domain={[0, 100]} />
              <ReferenceLine y={50} stroke="var(--line-strong)" strokeDasharray="4 4" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--surface)',
                  border: '1px solid var(--line)',
                  borderRadius: 12,
                  color: 'var(--text-strong)',
                }}
                labelFormatter={(label) => {
                  const sha = String(label ?? '');
                  const p = chart.find(c => c.label === sha);
                  return p ? `${sha} · ${p.author} · ${p.date}` : sha;
                }}
              />
              <Line type="monotone" dataKey="ai" name="P(AI)" stroke="#EF4444" strokeWidth={2.5} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="human" name="P(human)" stroke="#22C55E" strokeWidth={2.5} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[0.7rem] text-[var(--text-muted)] mt-2">
          Oldest commit on the left. The dashed line is the decision boundary.
        </p>
      </div>

      {data.style_shifts.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Detected shifts ({data.style_shifts.length})</h3>
          {data.style_shifts.map(s => (
            <div key={`${s.from_sha}-${s.to_sha}`}
                 className="card p-4 border-amber-300/60 bg-amber-50/40 space-y-1.5">
              <p className="text-xs font-semibold text-amber-900 flex items-center gap-1.5">
                <code>{s.from_sha}</code> <ChevronRight className="w-3 h-3" /> <code>{s.to_sha}</code>
                {s.verdict_changed && <span className="badge-mixed !text-[0.6rem] ml-1">verdict flipped</span>}
              </p>
              <p className="text-xs text-amber-800">{s.description}</p>
              <p className="text-[0.68rem] text-amber-700">
                ΔP(AI) {s.ai_probability_delta > 0 ? '+' : ''}{s.ai_probability_delta} pts ·
                evidence shift {s.evidence_shift}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="card p-4 text-sm text-[var(--text-body)]">
          No abrupt style shifts across these revisions — the file's stylometric profile is stable.
        </p>
      )}

      <div className="card overflow-hidden">
        <div className="p-4 border-b border-[var(--line)]">
          <h3 className="text-sm font-semibold">Revision timeline</h3>
        </div>
        <div className="max-h-[380px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--surface-sunken)]">
              <tr className="text-left">
                {['Commit', 'Date', 'Commit author', 'Verdict', 'P(AI)', 'Lines'].map(h => (
                  <th key={h} className="p-3 text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.timeline.map(p => (
                <tr key={p.sha} className="border-t border-[var(--line)] hover:bg-[var(--surface-soft)]">
                  <td className="p-3">
                    <a href={p.html_url} target="_blank" rel="noreferrer"
                       className="font-mono text-[0.7rem] text-coral-600 hover:underline">
                      {p.short_sha}
                    </a>
                  </td>
                  <td className="p-3 text-xs">{p.date ? new Date(p.date).toLocaleDateString() : '—'}</td>
                  <td className="p-3 text-xs truncate max-w-[160px]">{p.author_name || '—'}</td>
                  <td className="p-3">
                    <span className={
                      p.prediction.includes('AI') ? 'badge-ai !text-[0.6rem] !px-2 !py-0.5'
                        : p.prediction.includes('HUMAN') ? 'badge-human !text-[0.6rem] !px-2 !py-0.5'
                          : 'badge-neutral !text-[0.6rem] !px-2 !py-0.5'
                    }>{p.prediction}</span>
                  </td>
                  <td className="p-3 text-xs font-medium">{p.ai_probability}%</td>
                  <td className="p-3 text-xs">{p.lines}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[0.7rem] text-[var(--text-muted)]">
        “Commit author” is who authored the commit, taken from public git metadata. It is not a
        claim about who wrote any particular line.
      </p>
    </motion.div>
  );
}

function Metric({ label, value, tone = 'text-[var(--text-strong)]' }: {
  label: string; value: string | number; tone?: string;
}) {
  return (
    <div className="card p-4">
      <p className="text-[0.7rem] text-[var(--text-muted)] mb-1">{label}</p>
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}
