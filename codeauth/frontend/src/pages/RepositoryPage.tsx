import { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Upload, GitBranch, TriangleAlert, FolderTree, Search, FileCode2,
  ChevronRight, Folder, FolderOpen, Loader2,
} from 'lucide-react';
import { uploadRepository } from '../api/client';
import type { RepositoryResult, FileTreeNode } from '../types';
import PageHeader from '../components/PageHeader';
import ModelWarnings from '../components/ModelWarnings';

const statusDot: Record<string, string> = {
  green: 'bg-green-500',
  red: 'bg-red-500',
  yellow: 'bg-amber-500',
  neutral: 'bg-[var(--line-strong)]',
};

export default function RepositoryPage() {
  const [result, setResult] = useState<RepositoryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const runUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setError('Only ZIP archives are supported.');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await uploadRepository(file));
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Upload failed.');
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    if (!result) return [];
    const q = query.trim().toLowerCase();
    return q ? result.file_results.filter(f => f.file_path.toLowerCase().includes(q)) : result.file_results;
  }, [result, query]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <PageHeader
        eyebrow="Repository Analysis"
        eyebrowIcon={<GitBranch className="w-[15px] h-[15px]" />}
        title="Analyze a whole repository"
        description="Upload a ZIP archive to scan every supported source file, then browse per-file verdicts through an annotated directory tree."
        actions={
          result && (
            <button onClick={() => { setResult(null); setQuery(''); setSelected(null); }} className="btn-secondary text-xs !py-2 !px-3">
              Analyze another
            </button>
          )
        }
      />

      <ModelWarnings compact severity="high" />

      {/* ── Upload ── */}
      {!result && !loading && (
        <div className="grid md:grid-cols-2 gap-6">
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) runUpload(f);
            }}
            onClick={() => inputRef.current?.click()}
            className={`card p-10 text-center cursor-pointer transition-colors ${
              dragging ? 'border-coral-400 bg-coral-50' : 'hover:border-coral-200'
            }`}
          >
            <span className="w-14 h-14 rounded-2xl bg-coral-100 text-coral-500 flex items-center justify-center mx-auto mb-4">
              <Upload className="w-6 h-6" />
            </span>
            <h3 className="font-semibold mb-1">Upload ZIP archive</h3>
            <p className="text-sm text-[var(--text-body)]">
              Drop a file here or click to browse. Up to 100 MB.
            </p>
            <input ref={inputRef} type="file" accept=".zip" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) runUpload(f); }} />
          </div>

          <div className="card p-10 text-center opacity-70">
            <span className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-4">
              <GitBranch className="w-6 h-6" />
            </span>
            <h3 className="font-semibold mb-1">Clone from Git URL</h3>
            <p className="text-sm text-[var(--text-body)]">
              Requires Git credentials on the backend. Not configured in this deployment.
            </p>
          </div>
        </div>
      )}

      {loading && (
        <div className="card p-14 text-center">
          <Loader2 className="w-8 h-8 text-coral-500 mx-auto mb-3 animate-spin" />
          <p className="font-semibold">Scanning repository</p>
          <p className="text-sm text-[var(--text-body)] mt-1">
            Every supported file is analyzed individually, so large archives take a while.
          </p>
        </div>
      )}

      {error && (
        <div className="card p-4 border-red-200 flex items-start gap-2.5 text-red-600">
          <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {result && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {/* ── Summary ── */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Metric label="Files analyzed" value={result.files_analyzed} />
            <Metric label="Functions found" value={result.functions_analyzed} />
            <Metric label="Human-associated" value={`${result.human_ratio}%`} tone="text-green-600" />
            <Metric label="AI-associated" value={`${result.ai_ratio}%`} tone="text-red-500" />
            <Metric label="Mixed" value={`${result.mixed_ratio}%`} tone="text-amber-600" />
          </div>

          <div className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2.5">
              Authorship distribution across {result.files_analyzed} files
            </p>
            <div className="flex h-3 rounded-full overflow-hidden bg-[var(--line)]">
              <div style={{ width: `${result.human_ratio}%` }} className="bg-green-500" />
              <div style={{ width: `${result.ai_ratio}%` }} className="bg-red-500" />
              <div style={{ width: `${result.mixed_ratio}%` }} className="bg-amber-500" />
            </div>
            <p className="mt-2.5 text-xs text-[var(--text-muted)]">
              Ratios count files by their dominant verdict; they are not a measure of how much of each file was AI-written.
            </p>
          </div>

          <div className="grid lg:grid-cols-5 gap-6">
            {/* ── File table ── */}
            <div className="lg:col-span-3 card overflow-hidden">
              <div className="p-4 border-b border-[var(--line)] flex flex-wrap items-center gap-3">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <FileCode2 className="w-4 h-4 text-coral-500" /> File results
                </h3>
                <div className="relative ml-auto">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
                  <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Filter by path..."
                    className="field !py-2 !pl-9 !text-xs w-52"
                  />
                </div>
              </div>
              <div className="overflow-x-auto max-h-[520px]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-[var(--surface-sunken)]">
                    <tr className="text-left">
                      {['File', 'Language', 'Verdict', 'Conf.', 'Lines'].map(h => (
                        <th key={h} className="p-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(f => (
                      <tr
                        key={f.file_path}
                        onClick={() => setSelected(f.file_path)}
                        className={`border-t border-[var(--line)] cursor-pointer transition-colors ${
                          selected === f.file_path ? 'bg-coral-50' : 'hover:bg-[var(--surface-soft)]'
                        }`}
                      >
                        <td className="p-3 font-mono text-xs max-w-[260px] truncate" title={f.file_path}>{f.file_path}</td>
                        <td className="p-3 capitalize text-xs">{f.language}</td>
                        <td className="p-3">
                          <span className={
                            f.prediction.includes('MIXED') ? 'badge-mixed !text-[0.65rem] !px-2 !py-0.5'
                              : f.prediction.includes('AI') ? 'badge-ai !text-[0.65rem] !px-2 !py-0.5'
                                : 'badge-human !text-[0.65rem] !px-2 !py-0.5'
                          }>
                            {f.prediction}
                          </span>
                        </td>
                        <td className="p-3 font-medium text-xs">{f.confidence}%</td>
                        <td className="p-3 text-xs">{f.lines}</td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-sm text-[var(--text-muted)]">
                          No files match “{query}”.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Directory tree ── */}
            <div className="lg:col-span-2 card p-4">
              <h3 className="font-semibold text-sm flex items-center gap-2 mb-3">
                <FolderTree className="w-4 h-4 text-coral-500" /> Repository tree
              </h3>
              <div className="flex flex-wrap gap-3 mb-3 pb-3 border-b border-[var(--line)]">
                {[['green', 'Human'], ['red', 'AI'], ['yellow', 'Uncertain']].map(([k, label]) => (
                  <span key={k} className="flex items-center gap-1.5 text-[0.7rem] text-[var(--text-body)]">
                    <span className={`w-2 h-2 rounded-full ${statusDot[k]}`} /> {label}
                  </span>
                ))}
              </div>
              <div className="max-h-[460px] overflow-auto -mx-1 px-1">
                {result.file_tree
                  ? <TreeNode node={result.file_tree} depth={0} selected={selected} onSelect={setSelected} />
                  : <p className="text-sm text-[var(--text-muted)]">No tree returned.</p>}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

function Metric({ label, value, tone = 'text-[var(--text-strong)]' }: {
  label: string; value: string | number; tone?: string;
}) {
  return (
    <div className="card p-4">
      <p className="text-[0.72rem] text-[var(--text-muted)] mb-1">{label}</p>
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}

function TreeNode({ node, depth, selected, onSelect }: {
  node: FileTreeNode; depth: number; selected: string | null; onSelect: (p: string) => void;
}) {
  const [open, setOpen] = useState(depth < 2);

  if (node.type === 'file') {
    const isSelected = selected !== null && selected.endsWith(node.name);
    return (
      <button
        onClick={() => onSelect(node.name)}
        className={`flex items-center gap-2 py-1 w-full text-left rounded-lg pr-2 transition-colors ${
          isSelected ? 'bg-coral-50' : 'hover:bg-[var(--surface-soft)]'
        }`}
        style={{ paddingLeft: `${depth * 14 + 6}px` }}
        title={node.prediction ? `${node.prediction} · ${node.confidence}%` : node.name}
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot[node.status || 'neutral'] || statusDot.neutral}`} />
        <span className="font-mono text-[0.72rem] truncate">{node.name}</span>
      </button>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 py-1 w-full text-left rounded-lg hover:bg-[var(--surface-soft)]"
        style={{ paddingLeft: `${depth * 14}px` }}
      >
        <ChevronRight className={`w-3.5 h-3.5 shrink-0 text-[var(--text-muted)] transition-transform ${open ? 'rotate-90' : ''}`} />
        {open
          ? <FolderOpen className="w-3.5 h-3.5 shrink-0 text-coral-500" />
          : <Folder className="w-3.5 h-3.5 shrink-0 text-coral-400" />}
        <span className="font-mono text-[0.72rem] font-medium truncate">{node.name}</span>
      </button>
      {open && node.children?.map((child, i) => (
        <TreeNode key={`${child.name}-${i}`} node={child} depth={depth + 1} selected={selected} onSelect={onSelect} />
      ))}
    </div>
  );
}
