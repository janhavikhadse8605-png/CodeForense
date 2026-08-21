import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  FileText, Clock, Printer, Table, FileJson,
  ChevronDown, TriangleAlert,
} from 'lucide-react';
import { getReports, generateReport, getHistory } from '../api/client';
import type { ReportData, HistoryItem } from '../types';
import PageHeader from '../components/PageHeader';

export default function ReportsPage() {
  const [reports, setReports] = useState<ReportData[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selected, setSelected] = useState<ReportData | null>(null);
  const [sourceId, setSourceId] = useState('');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReports = () =>
    getReports()
      .then(res => {
        const items: ReportData[] = res.items || [];
        setReports(items);
        setSelected(prev => prev ?? items[0] ?? null);
      })
      .catch(() => setError('Could not load reports.'))
      .finally(() => setLoading(false));

  useEffect(() => {
    fetchReports();
    getHistory(50, 0)
      .then(res => {
        const items: HistoryItem[] = res.items || [];
        setHistory(items);
        if (items.length > 0) setSourceId(items[0].id);
      })
      .catch(() => {});
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const source = history.find(h => h.id === sourceId);
      const rep = await generateReport({
        analysis_id: sourceId || undefined,
        title: source
          ? `Audit Report — ${source.language} · ${source.prediction}`
          : `Audit Report — ${new Date().toLocaleDateString()}`,
        format: 'json',
      });
      setSelected(rep);
      await fetchReports();
    } catch {
      setError('Report generation failed.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <PageHeader
        eyebrow="Formal Audit Reports"
        eyebrowIcon={<FileText className="w-[15px] h-[15px]" />}
        title="Audit dossiers"
        description="Build a shareable record of an analysis — verdict, evidence breakdown, feature values, methodology, and stated limitations — then export it as JSON, CSV, or PDF."
      />

      {/* ── Generator ── */}
      <div className="card p-5 flex flex-col md:flex-row md:items-end gap-4">
        <label className="flex-1 min-w-0">
          <span className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
            Source analysis
          </span>
          <div className="relative">
            <select
              value={sourceId}
              onChange={e => setSourceId(e.target.value)}
              className="field appearance-none pr-9 cursor-pointer"
              disabled={history.length === 0}
            >
              {history.length === 0 && <option value="">No analyses yet — run one first</option>}
              {history.map(h => (
                <option key={h.id} value={h.id}>
                  {h.prediction} · {h.language} · {h.lines} lines · {new Date(h.created_at).toLocaleString()}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
          </div>
        </label>
        <button onClick={handleGenerate} disabled={generating || !sourceId} className="btn-primary shrink-0">
          <FileText className="w-4 h-4" />
          {generating ? 'Generating...' : 'Generate report'}
        </button>
      </div>

      {error && (
        <div className="card p-4 border-red-200 flex items-center gap-2.5 text-red-600">
          <TriangleAlert className="w-4 h-4 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* ── List ── */}
        <div className="space-y-3 print:hidden">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Generated reports
          </h3>
          {loading ? (
            <p className="text-xs text-[var(--text-muted)] py-6 text-center">Loading…</p>
          ) : reports.length === 0 ? (
            <div className="card p-6 text-center text-xs text-[var(--text-body)]">
              No reports yet. Pick an analysis above and generate your first dossier.
            </div>
          ) : (
            reports.map(r => (
              <button
                key={r.id}
                onClick={() => setSelected(r)}
                className={`card p-4 w-full text-left transition-all ${
                  selected?.id === r.id ? '!border-coral-400 bg-coral-50' : 'hover:bg-[var(--surface-soft)]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm truncate">{r.title}</span>
                  <span className="text-[0.6rem] uppercase font-bold px-2 py-0.5 rounded bg-[var(--surface-sunken)] text-[var(--text-muted)] shrink-0">
                    {r.format}
                  </span>
                </div>
                <span className="flex items-center gap-1.5 mt-2 text-xs text-[var(--text-muted)]">
                  <Clock className="w-3 h-3" />
                  {new Date(r.created_at).toLocaleString()}
                </span>
              </button>
            ))
          )}
        </div>

        {/* ── Preview ── */}
        <div className="lg:col-span-2">
          {selected ? <ReportPreview report={selected} /> : (
            <div className="card p-12 text-center text-sm text-[var(--text-muted)]">
              Select or generate a report to preview it here.
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Preview + exports ────────────────────────────── */

interface Content {
  prediction?: string;
  confidence?: number;
  human_probability?: number;
  ai_probability?: number;
  language?: string;
  evidence?: Record<string, number>;
  statistics?: Record<string, number>;
  feature_details?: Record<string, Record<string, number | string>>;
  segments?: Array<{ name: string; prediction: string; confidence: number }>;
  methodology?: string;
  limitations?: string;
}

function ReportPreview({ report }: { report: ReportData }) {
  const c = (report.content || {}) as Content;
  const isEmpty = Object.keys(c).length === 0;

  const csv = useMemo(() => buildCsv(report, (report.content || {}) as Content), [report]);

  const download = (data: string, mime: string, ext: string) => {
    const url = URL.createObjectURL(new Blob([data], { type: mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `CodeAuth_Report_${report.id || 'export'}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="card p-6 md:p-8 space-y-6 print-sheet">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-[var(--line)]">
        <div className="min-w-0">
          <span className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-coral-500" />
            <span className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-coral-600">
              CodeAuth audit record
            </span>
          </span>
          <h2 className="text-xl font-bold">{report.title}</h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Report {report.id} · generated {new Date(report.created_at).toLocaleString()}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0 print:hidden">
          <button onClick={() => window.print()} className="btn-secondary text-xs !py-2 !px-3">
            <Printer className="w-3.5 h-3.5" /> PDF
          </button>
          <button onClick={() => download(csv, 'text/csv;charset=utf-8', 'csv')} className="btn-secondary text-xs !py-2 !px-3">
            <Table className="w-3.5 h-3.5" /> CSV
          </button>
          <button
            onClick={() => download(JSON.stringify(report, null, 2), 'application/json', 'json')}
            className="btn-primary text-xs !py-2 !px-3"
          >
            <FileJson className="w-3.5 h-3.5" /> JSON
          </button>
        </div>
      </div>

      {isEmpty ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-300/70 bg-amber-50 p-4">
          <TriangleAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-700">
            This report was generated without a source analysis, so it carries no findings. Generate a new
            one with an analysis selected.
          </p>
        </div>
      ) : (
        <>
          {/* Verdict */}
          <div className="grid sm:grid-cols-3 gap-4">
            <Panel label="Classification" value={c.prediction ?? '—'} />
            <Panel label="Confidence" value={c.confidence !== undefined ? `${c.confidence}%` : '—'} />
            <Panel label="Language" value={c.language ?? '—'} capitalize />
          </div>

          {(c.human_probability !== undefined || c.ai_probability !== undefined) && (
            <div className="grid sm:grid-cols-2 gap-4">
              <Panel label="Human probability" value={`${c.human_probability ?? 0}%`} />
              <Panel label="AI probability" value={`${c.ai_probability ?? 0}%`} />
            </div>
          )}

          {/* Evidence */}
          {c.evidence && Object.keys(c.evidence).length > 0 && (
            <Section title="Feature-group evidence (ablation)">
              <div className="space-y-2">
                {Object.entries(c.evidence).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                  <div key={k}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="capitalize text-[var(--text-body)]">{k}</span>
                      <span className="font-semibold">{Math.round(v)}%</span>
                    </div>
                    <div className="evidence-bar">
                      <div className="evidence-bar-fill" style={{ width: `${Math.min(v, 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[0.7rem] text-[var(--text-muted)]">
                Relative contributions normalised to 100%, not probabilities.
              </p>
            </Section>
          )}

          {/* Statistics */}
          {c.statistics && Object.keys(c.statistics).length > 0 && (
            <Section title="Code statistics">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5 text-xs">
                {Object.entries(c.statistics).map(([k, v]) => (
                  <span key={k} className="flex justify-between border-b border-[var(--line)] py-1">
                    <span className="text-[var(--text-muted)] capitalize">{k.replace(/_/g, ' ')}</span>
                    <span className="font-semibold">{typeof v === 'number' ? Math.round(v * 100) / 100 : v}</span>
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* Segments */}
          {c.segments && c.segments.length > 0 && (
            <Section title={`Section-level findings (${c.segments.length})`}>
              <div className="space-y-1">
                {c.segments.map((s, i) => (
                  <div key={`${s.name}-${i}`} className="flex items-center justify-between gap-3 text-xs py-1.5 border-b border-[var(--line)] last:border-0">
                    <span className="font-mono truncate">{s.name}</span>
                    <span className="flex items-center gap-3 shrink-0">
                      <span className={
                        s.prediction.includes('AI') ? 'badge-ai !text-[0.6rem] !px-2 !py-0.5'
                          : s.prediction.includes('HUMAN') ? 'badge-human !text-[0.6rem] !px-2 !py-0.5'
                            : 'badge-neutral !text-[0.6rem] !px-2 !py-0.5'
                      }>
                        {s.prediction}
                      </span>
                      <span className="font-semibold w-10 text-right">{s.confidence}%</span>
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {c.methodology && (
            <Section title="Methodology">
              <p className="text-xs leading-relaxed text-[var(--text-body)]">{c.methodology}</p>
            </Section>
          )}

          {c.limitations && (
            <div className="rounded-xl border border-amber-300/60 bg-amber-50/60 p-4">
              <p className="text-[0.65rem] font-bold uppercase tracking-wider text-amber-700 mb-1.5">
                Limitations
              </p>
              <p className="text-xs leading-relaxed text-amber-800">{c.limitations}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[0.65rem] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2.5">
        {title}
      </h4>
      {children}
    </div>
  );
}

function Panel({ label, value, capitalize = false }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div className="rounded-xl bg-[var(--surface-sunken)] border border-[var(--line)] p-4">
      <p className="text-[0.7rem] text-[var(--text-muted)] mb-1">{label}</p>
      <p className={`text-lg font-bold ${capitalize ? 'capitalize' : ''}`}>{value}</p>
    </div>
  );
}

/** Flatten a report into a two-column CSV so it opens cleanly in a spreadsheet. */
function buildCsv(report: ReportData, c: Content): string {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows: string[][] = [
    ['section', 'field', 'value'],
    ['report', 'id', report.id],
    ['report', 'title', report.title],
    ['report', 'created_at', report.created_at],
    ['verdict', 'prediction', c.prediction ?? ''],
    ['verdict', 'confidence_pct', String(c.confidence ?? '')],
    ['verdict', 'human_probability_pct', String(c.human_probability ?? '')],
    ['verdict', 'ai_probability_pct', String(c.ai_probability ?? '')],
    ['verdict', 'language', c.language ?? ''],
  ];

  for (const [k, v] of Object.entries(c.evidence || {})) rows.push(['evidence', k, String(v)]);
  for (const [k, v] of Object.entries(c.statistics || {})) rows.push(['statistics', k, String(v)]);
  for (const [group, values] of Object.entries(c.feature_details || {})) {
    for (const [k, v] of Object.entries(values)) rows.push([`features:${group}`, k, String(v)]);
  }
  for (const s of c.segments || []) rows.push(['segment', s.name, `${s.prediction} (${s.confidence}%)`]);
  if (c.methodology) rows.push(['notes', 'methodology', c.methodology]);
  if (c.limitations) rows.push(['notes', 'limitations', c.limitations]);

  return rows.map(r => r.map(esc).join(',')).join('\r\n');
}
