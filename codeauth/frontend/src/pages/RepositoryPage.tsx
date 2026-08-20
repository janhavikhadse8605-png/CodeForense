import { useState } from 'react';
import { motion } from 'framer-motion';
import { Upload, GitBranch, AlertTriangle } from 'lucide-react';
import { uploadRepository } from '../api/client';
import type { RepositoryResult, FileTreeNode } from '../types';

export default function RepositoryPage() {
  const [result, setResult] = useState<RepositoryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const data = await uploadRepository(file);
      setResult(data);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Upload failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Repository Analysis</h1>
        <p className="text-sm text-slate-500 mt-1">Analyze entire projects for authorship patterns</p>
      </div>

      {!result && !loading && (
        <div className="grid md:grid-cols-2 gap-6">
          <label className="card p-8 text-center cursor-pointer hover:shadow-md transition-shadow">
            <Upload className="w-10 h-10 text-coral-500 mx-auto mb-3" />
            <h3 className="font-semibold text-slate-700 mb-1">Upload ZIP</h3>
            <p className="text-sm text-slate-500">Upload a ZIP archive of your project</p>
            <input type="file" accept=".zip" className="hidden" onChange={handleUpload} />
          </label>
          <div className="card p-8 text-center opacity-60">
            <GitBranch className="w-10 h-10 text-amber-500 mx-auto mb-3" />
            <h3 className="font-semibold text-slate-700 mb-1">Git URL</h3>
            <p className="text-sm text-slate-500">Git repository cloning requires configuration</p>
          </div>
        </div>
      )}

      {loading && <div className="card p-12 text-center"><div className="animate-pulse-gentle text-slate-500">Analyzing repository...</div></div>}
      {error && <div className="card p-4 border-red-200 flex items-center gap-2 text-red-500"><AlertTriangle className="w-4 h-4" />{error}</div>}

      {result && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard label="Files Analyzed" value={result.files_analyzed} />
            <SummaryCard label="Human-associated" value={`${result.human_ratio}%`} color="green" />
            <SummaryCard label="AI-associated" value={`${result.ai_ratio}%`} color="red" />
            <SummaryCard label="Mixed" value={`${result.mixed_ratio}%`} color="amber" />
          </div>

          {/* File results table */}
          <div className="card overflow-hidden">
            <div className="p-4 border-b border-cream-200">
              <h3 className="font-semibold text-slate-700">File Results</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-cream-50 text-left">
                    <th className="p-3 font-medium text-slate-500">File</th>
                    <th className="p-3 font-medium text-slate-500">Language</th>
                    <th className="p-3 font-medium text-slate-500">Prediction</th>
                    <th className="p-3 font-medium text-slate-500">Confidence</th>
                    <th className="p-3 font-medium text-slate-500">Lines</th>
                  </tr>
                </thead>
                <tbody>
                  {result.file_results.map((f, i) => (
                    <tr key={i} className="border-t border-cream-100 hover:bg-cream-50">
                      <td className="p-3 font-mono text-xs">{f.file_path}</td>
                      <td className="p-3 capitalize">{f.language}</td>
                      <td className="p-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          f.prediction.includes('AI') ? 'badge-ai' : f.prediction.includes('HUMAN') ? 'badge-human' : 'badge-mixed'
                        }`}>{f.prediction}</span>
                      </td>
                      <td className="p-3 font-medium">{f.confidence}%</td>
                      <td className="p-3">{f.lines}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* File tree */}
          {result.file_tree && (
            <div className="card p-4">
              <h3 className="font-semibold text-slate-700 mb-3">Repository Tree</h3>
              <TreeNode node={result.file_tree} depth={0} />
            </div>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}

function SummaryCard({ label, value, color = 'slate' }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="card p-4 text-center">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold text-${color}-600`}>{value}</p>
    </div>
  );
}

function TreeNode({ node, depth }: { node: FileTreeNode; depth: number }) {
  const [open, setOpen] = useState(depth < 2);
  const statusColors: Record<string, string> = { green: '🟢', red: '🔴', yellow: '🟡', neutral: '📁' };

  if (node.type === 'file') {
    return (
      <div className="flex items-center gap-2 py-1 text-sm" style={{ paddingLeft: `${depth * 20}px` }}>
        <span>{statusColors[node.status || 'neutral'] || '📄'}</span>
        <span className="font-mono text-xs text-slate-600">{node.name}</span>
        {node.prediction && <span className="text-[10px] text-slate-400 ml-1">{node.prediction}</span>}
      </div>
    );
  }

  return (
    <div>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 py-1 hover:bg-cream-50 w-full text-left text-sm" style={{ paddingLeft: `${depth * 20}px` }}>
        <span>{open ? '📂' : '📁'}</span>
        <span className="font-mono text-xs font-medium text-slate-700">{node.name}/</span>
      </button>
      {open && node.children?.map((child, i) => <TreeNode key={i} node={child} depth={depth + 1} />)}
    </div>
  );
}
