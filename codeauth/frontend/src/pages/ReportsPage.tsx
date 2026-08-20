import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FileText, Download, Clock, Printer } from 'lucide-react';
import { getReports, generateReport } from '../api/client';
import type { ReportData } from '../types';

export default function ReportsPage() {
  const [reports, setReports] = useState<ReportData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<ReportData | null>(null);
  const [generating, setGenerating] = useState(false);

  const fetchReports = () => {
    getReports()
      .then(res => {
        setReports(res.items || []);
        if (res.items && res.items.length > 0 && !selectedReport) {
          setSelectedReport(res.items[0]);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const handleGenerateFresh = async () => {
    setGenerating(true);
    try {
      const rep = await generateReport({ title: `Audit Report — ${new Date().toLocaleDateString()}`, format: 'json' });
      setSelectedReport(rep);
      fetchReports();
    } catch {}
    finally {
      setGenerating(false);
    }
  };

  const handleExportJSON = (report: ReportData) => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(report, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `CodeAuth_Report_${report.id || 'export'}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Formal Audit Reports</h1>
          <p className="text-sm text-slate-500 mt-1">
            Export comprehensive AI authorship compliance dossiers, feature evidence summaries, and methodology notes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleGenerateFresh}
            disabled={generating}
            className="btn-primary text-xs py-2.5 px-4 flex items-center gap-1.5 disabled:opacity-50"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{generating ? 'Generating...' : 'Generate New Audit Report'}</span>
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Reports list */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Generated Reports</h3>
          {loading ? (
            <div className="text-center py-8 text-xs text-slate-400">Loading reports...</div>
          ) : reports.length === 0 ? (
            <div className="card p-6 text-center text-xs text-slate-500">
              No reports generated yet. Click above to create your first report dossier.
            </div>
          ) : (
            reports.map(r => (
              <div
                key={r.id}
                onClick={() => setSelectedReport(r)}
                className={`card p-4 cursor-pointer transition-all ${
                  selectedReport?.id === r.id ? 'border-coral-500 shadow-sm bg-coral-50/20' : 'hover:bg-cream-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-slate-800 truncate">{r.title}</span>
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-cream-200 text-slate-600">
                    {r.format}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-2 text-xs text-slate-400">
                  <Clock className="w-3 h-3" />
                  <span>{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Report Preview */}
        <div className="lg:col-span-2">
          {selectedReport ? (
            <div className="card p-6 md:p-8 space-y-6 bg-white print:p-0">
              {/* Header */}
              <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-cream-200 gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-coral-500"></span>
                    <span className="text-xs font-bold uppercase tracking-widest text-coral-600">CODEAUTH VERIFIED REPORT</span>
                  </div>
                  <h2 className="text-xl font-bold text-slate-900">{selectedReport.title}</h2>
                  <p className="text-xs text-slate-500 mt-1">Generated on {new Date(selectedReport.created_at).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => window.print()}
                    className="btn-secondary text-xs py-2 px-3 flex items-center gap-1.5"
                  >
                    <Printer className="w-3.5 h-3.5" /> Print / PDF
                  </button>
                  <button
                    onClick={() => handleExportJSON(selectedReport)}
                    className="btn-primary text-xs py-2 px-3 flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" /> Export JSON
                  </button>
                </div>
              </div>

              {/* Assessment Section */}
              {selectedReport.content && Object.keys(selectedReport.content).length > 0 ? (
                <div className="space-y-6">
                  {/* High level outcome */}
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="p-4 rounded-xl bg-cream-50 border border-cream-200">
                      <p className="text-xs text-slate-500 mb-1 font-medium">Model Classification</p>
                      <p className="text-lg font-bold text-slate-800">
                        {String(selectedReport.content.prediction || 'AI/Human Hybrid Assessment')}
                      </p>
                    </div>
                    <div className="p-4 rounded-xl bg-cream-50 border border-cream-200">
                      <p className="text-xs text-slate-500 mb-1 font-medium">Classification Confidence</p>
                      <p className="text-lg font-bold text-slate-800">
                        {selectedReport.content.confidence ? `${selectedReport.content.confidence}%` : 'High (Ensemble)'}
                      </p>
                    </div>
                    <div className="p-4 rounded-xl bg-cream-50 border border-cream-200">
                      <p className="text-xs text-slate-500 mb-1 font-medium">Target Language</p>
                      <p className="text-lg font-bold text-slate-800 capitalize">
                        {String(selectedReport.content.language || 'Python')}
                      </p>
                    </div>
                  </div>

                  {/* Methodology */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Methodology & Inference Pipeline</h4>
                    <p className="text-xs text-slate-600 leading-relaxed bg-cream-50/50 p-4 rounded-xl border border-cream-200">
                      {String(selectedReport.content.methodology || 'This analysis uses a hybrid CodeBERT + Feature MLP Fusion model. The model combines transformer-based code embeddings with handcrafted feature analysis across 6 categories: naming, structure, comments, repetition, complexity, and formatting.')}
                    </p>
                  </div>

                  {/* Limitations */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Ethical & Forensic Limitations</h4>
                    <p className="text-xs text-slate-500 leading-relaxed italic bg-amber-50/40 p-3.5 rounded-xl border border-amber-200/60">
                      {String(selectedReport.content.limitations || 'Authorship analysis is probabilistic. Results indicate model-associated patterns and should not be treated as definitive proof of authorship.')}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-xs text-slate-400">
                  Select an audit report to inspect verified details.
                </div>
              )}
            </div>
          ) : (
            <div className="card p-12 text-center text-slate-400 text-sm">
              Select or generate a report from the list to preview.
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
