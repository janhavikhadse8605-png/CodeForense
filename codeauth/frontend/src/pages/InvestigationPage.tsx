import { useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, Terminal, ShieldAlert, Play, Wrench } from 'lucide-react';
import { runInvestigation } from '../api/client';

export default function InvestigationPage() {
  const [task, setTask] = useState('full_investigation');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRunInvestigation = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await runInvestigation({ task });
      setResult(res);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Agentic investigation run failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Agentic Repository Investigation</h1>
        <p className="text-sm text-slate-500 mt-1">
          Autonomous orchestration layer synthesizing ML predictions, AST statistics, Git commits, and stylometric shifts.
        </p>
      </div>

      {/* Orchestration Architecture Notice */}
      <div className="card p-4 bg-coral-50/40 border-coral-200/60 flex items-start gap-2.5 text-xs text-slate-700">
        <Bot className="w-5 h-5 text-coral-600 mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-semibold text-slate-900">Architectural Note: Real ML Engine + Agentic Tool Orchestration</p>
          <p className="text-slate-600 mt-0.5">
            The trained PyTorch hybrid neural network executes all core classification and feature ablation. The agent acts as an autonomous forensic investigator executing tools (<code className="font-mono text-coral-700">inspect_repository()</code>, <code className="font-mono text-coral-700">inspect_analyses()</code>, <code className="font-mono text-coral-700">get_model_prediction()</code>) to compose multi-file investigative syntheses.
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Run Controls */}
        <div className="card p-6 space-y-4">
          <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
            Investigation Scope
          </h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Select Analysis Directive</label>
              <select
                value={task}
                onChange={e => setTask(e.target.value)}
                className="w-full text-xs p-2.5 rounded-xl border border-cream-200 bg-cream-50 focus:outline-none focus:ring-2 focus:ring-coral-400"
              >
                <option value="full_investigation">Full Repository & Audit Synthesis</option>
                <option value="anomaly_scan">Stylometric Anomaly & AI Pattern Hunt</option>
                <option value="commit_forensics">Commit & Code Shift Inspection</option>
              </select>
            </div>

            <div className="p-3 bg-cream-50 rounded-xl border border-cream-200 text-xs text-slate-600 space-y-1.5">
              <p className="font-medium text-slate-800">Available Investigation Tools:</p>
              <ul className="space-y-1 text-slate-500 font-mono text-[11px]">
                <li>• inspect_repository()</li>
                <li>• inspect_analyses()</li>
                <li>• get_model_prediction()</li>
                <li>• compare_versions()</li>
              </ul>
            </div>

            <button
              onClick={handleRunInvestigation}
              disabled={loading}
              className="btn-primary w-full justify-center text-xs py-2.5 flex items-center gap-2 disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{loading ? 'Orchestrating Tools...' : 'Launch Investigation'}</span>
            </button>
          </div>
        </div>

        {/* Output Area */}
        <div className="lg:col-span-2 space-y-4">
          {error && (
            <div className="card p-4 border-red-200 text-red-600 text-xs flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" /> {error}
            </div>
          )}

          {result ? (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              {/* Investigation Executive Summary */}
              <div className="card p-6 space-y-3 bg-white">
                <div className="flex items-center gap-2 text-coral-600">
                  <Bot className="w-4 h-4" />
                  <h3 className="text-sm font-bold uppercase tracking-wider">Forensic Investigation Summary</h3>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed bg-cream-50/60 p-4 rounded-xl border border-cream-200">
                  {result.summary}
                </p>
                {result.mcp_status && (
                  <p className="text-[11px] text-slate-400 italic">
                    Connector State: {result.mcp_status}
                  </p>
                )}
              </div>

              {/* Specific Findings */}
              {result.findings && result.findings.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Key Evidence Findings</h4>
                  {result.findings.map((f: any, idx: number) => (
                    <div key={idx} className="card p-4 space-y-1 border-amber-200 bg-amber-50/30">
                      <p className="text-xs font-bold text-amber-900">{f.title}</p>
                      <p className="text-xs text-amber-700">{f.description}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Tool Execution Log */}
              {result.tool_log && result.tool_log.length > 0 && (
                <div className="card p-5 space-y-3">
                  <div className="flex items-center gap-2 text-slate-700">
                    <Terminal className="w-4 h-4 text-slate-500" />
                    <h4 className="text-xs font-bold uppercase tracking-wider">Orchestration Tool Audit Trail</h4>
                  </div>
                  <div className="space-y-2">
                    {result.tool_log.map((t: any, idx: number) => (
                      <div key={idx} className="font-mono text-xs p-2.5 rounded-lg bg-slate-900 text-emerald-400 flex items-center justify-between">
                        <span>{t.tool}({JSON.stringify(t.parameters)})</span>
                        <span className="text-[10px] text-slate-500">{new Date(t.timestamp).toLocaleTimeString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          ) : (
            <div className="card p-12 text-center text-slate-400 space-y-2">
              <Wrench className="w-10 h-10 mx-auto text-slate-300" />
              <p className="text-sm">Click "Launch Investigation" to run the agentic inspection pipeline.</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
