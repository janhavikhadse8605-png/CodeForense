import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, Upload, AlertCircle, FileSpreadsheet, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { runEvaluation, getLatestEvaluation, getModelInfo } from '../api/client';
import type { EvaluationResult, ModelInfo } from '../types';
import PageHeader from '../components/PageHeader';
import ModelWarnings from '../components/ModelWarnings';

export default function EvaluationPage() {
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getLatestEvaluation().catch(() => null),
      getModelInfo().catch(() => null),
    ]).then(([evalRes, infoRes]) => {
      if (evalRes) setEvaluation(evalRes);
      if (infoRes) setModelInfo(infoRes);
    }).finally(() => setFetching(false));
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const res = await runEvaluation(file);
      setEvaluation({ ...res, available: true });
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Evaluation failed. Please check CSV format.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <PageHeader
        eyebrow="Model Evaluation"
        eyebrowIcon={<BarChart3 className="w-[15px] h-[15px]" />}
        title="Measure the model on your own data"
        description="Upload a labelled CSV to compute accuracy, precision, recall, F1, and a confusion matrix. Every row is scored by the live model — nothing here is estimated."
        actions={
          <label className="btn-primary text-xs !py-2.5 !px-4 cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            <span>Upload evaluation CSV</span>
            <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} disabled={loading} />
          </label>
        }
      />

      <ModelWarnings />

      {loading && (
        <div className="card p-12 text-center">
          <div className="animate-pulse-gentle text-slate-600 font-medium">
            Evaluating model against uploaded dataset... This executes real model inference across all rows.
          </div>
        </div>
      )}

      {error && (
        <div className="card p-4 border-red-200 flex items-start gap-2.5 text-red-600 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold">Evaluation Error</p>
            <p className="text-xs text-red-500 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Dataset Requirements Card */}
      <div className="card p-5 bg-cream-50/70 border-cream-200">
        <div className="flex items-start gap-3">
          <FileSpreadsheet className="w-5 h-5 text-coral-500 mt-0.5 flex-shrink-0" />
          <div className="space-y-1 text-xs text-slate-600">
            <p className="font-semibold text-slate-800 text-sm">Expected CSV Format for Benchmarking</p>
            <p>
              Your CSV file should contain at least two columns: <code className="bg-white px-1.5 py-0.5 rounded border border-cream-200 text-coral-600">code_content</code> (the raw code string) and <code className="bg-white px-1.5 py-0.5 rounded border border-cream-200 text-coral-600">authorship_class</code> (either <code className="text-slate-800">HUMAN</code> or <code className="text-slate-800">AI</code>).
            </p>
            <p className="text-slate-500">Optional column: <code className="bg-white px-1.5 py-0.5 rounded border border-cream-200">language</code> (default: python).</p>
          </div>
        </div>
      </div>

      {/* Evaluation Results */}
      {!loading && evaluation && evaluation.available && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <MetricCard label="Accuracy" value={`${(evaluation.accuracy! * 100).toFixed(1)}%`} sub="Overall accuracy" color="coral" />
            <MetricCard label="Precision" value={`${(evaluation.precision! * 100).toFixed(1)}%`} sub="Positive precision" color="blue" />
            <MetricCard label="Recall" value={`${(evaluation.recall! * 100).toFixed(1)}%`} sub="True positive rate" color="green" />
            <MetricCard label="Macro F1" value={`${(evaluation.f1_macro! * 100).toFixed(1)}%`} sub="Unweighted mean F1" color="amber" />
            <MetricCard label="Weighted F1" value={`${(evaluation.f1_weighted! * 100).toFixed(1)}%`} sub="Support weighted" color="purple" />
            <MetricCard label="ROC-AUC" value={evaluation.roc_auc !== null && evaluation.roc_auc !== undefined ? `${(evaluation.roc_auc * 100).toFixed(1)}%` : 'N/A'} sub="Area under curve" color="teal" />
          </div>

          {/* Warnings if any */}
          {evaluation.warnings && evaluation.warnings.length > 0 && (
            <div className="space-y-2">
              {evaluation.warnings.map((w, idx) => (
                <div key={idx} className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-6">
            {/* Confusion Matrix */}
            <div className="card p-6 space-y-4">
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
                Empirical Confusion Matrix
              </h3>
              {evaluation.confusion_matrix && (
                <div className="overflow-x-auto">
                  <table className="w-full text-center border-collapse">
                    <thead>
                      <tr>
                        <th className="p-2"></th>
                        <th colSpan={2} className="p-2 text-xs font-semibold text-slate-500 uppercase bg-cream-50 rounded-t-lg">
                          Predicted Label
                        </th>
                      </tr>
                      <tr className="text-xs text-slate-600 border-b border-cream-200">
                        <th className="p-2 text-left font-medium text-slate-500">Actual Label</th>
                        <th className="p-3 font-semibold text-green-700 bg-green-50/50">HUMAN</th>
                        <th className="p-3 font-semibold text-red-600 bg-red-50/50">AI</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-cream-100">
                        <td className="p-3 font-semibold text-xs text-left text-green-700 bg-green-50/30">HUMAN</td>
                        <td className="p-4 font-bold text-lg text-slate-800 bg-cream-50/30">
                          {evaluation.confusion_matrix.matrix[0]?.[0] ?? 0}
                          <span className="block text-[10px] text-slate-400 font-normal">True Human</span>
                        </td>
                        <td className="p-4 font-bold text-lg text-slate-800 bg-cream-50/30">
                          {evaluation.confusion_matrix.matrix[0]?.[1] ?? 0}
                          <span className="block text-[10px] text-slate-400 font-normal">False AI</span>
                        </td>
                      </tr>
                      <tr>
                        <td className="p-3 font-semibold text-xs text-left text-red-600 bg-red-50/30">AI</td>
                        <td className="p-4 font-bold text-lg text-slate-800 bg-cream-50/30">
                          {evaluation.confusion_matrix.matrix[1]?.[0] ?? 0}
                          <span className="block text-[10px] text-slate-400 font-normal">False Human</span>
                        </td>
                        <td className="p-4 font-bold text-lg text-slate-800 bg-cream-50/30">
                          {evaluation.confusion_matrix.matrix[1]?.[1] ?? 0}
                          <span className="block text-[10px] text-slate-400 font-normal">True AI</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Dataset Information */}
            <div className="card p-6 space-y-4">
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
                Evaluated Dataset Attributes
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between py-2 border-b border-cream-100">
                  <span className="text-slate-500">Total Valid Samples:</span>
                  <span className="font-semibold text-slate-800">{evaluation.dataset_size}</span>
                </div>
                {evaluation.class_distribution && Object.entries(evaluation.class_distribution).map(([k, v]) => (
                  <div key={k} className="flex justify-between py-2 border-b border-cream-100">
                    <span className="text-slate-500 capitalize">{k} Class Samples:</span>
                    <span className="font-semibold text-slate-800">{v}</span>
                  </div>
                ))}
                <div className="flex justify-between py-2 border-b border-cream-100">
                  <span className="text-slate-500">Evaluated Timestamp:</span>
                  <span className="font-mono text-xs text-slate-600">
                    {evaluation.created_at ? new Date(evaluation.created_at).toLocaleString() : 'N/A'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {!loading && !fetching && (!evaluation || !evaluation.available) && (
        <div className="space-y-6">
          {modelInfo?.test_accuracy && (
            <div className="card p-6 bg-gradient-to-br from-white to-amber-50/40 border-amber-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">Reported checkpoint metadata</h3>
                  <p className="text-xs text-slate-500">
                    Metadata from <span className="font-mono text-coral-600">authorship_final_model</span> checkpoint
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <MetricCard
                  label="Recorded accuracy"
                  value={`${(modelInfo.test_accuracy * 100).toFixed(2)}%`}
                  sub="From checkpoint metadata"
                />
                <MetricCard
                  label="Base model"
                  value="CodeBERT"
                  sub={modelInfo.base_model || 'microsoft/codebert-base'}
                />
                <MetricCard
                  label="Device"
                  value={modelInfo.device ? modelInfo.device.toUpperCase() : 'UNKNOWN'}
                  sub="Reported by backend"
                />
                <MetricCard
                  label="Model state"
                  value={modelInfo.is_ready ? 'Loaded' : 'Not loaded'}
                  sub={modelInfo.trained_timestamp || 'No training timestamp'}
                />
              </div>

              <p className="mt-4 text-[0.7rem] leading-relaxed text-slate-500">
                This figure was written into the checkpoint at training time and describes that held-out split only.
                It is not a measurement on your data — upload a CSV above for that.
              </p>
            </div>
          )}

          <div className="card p-10 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-cream-200 flex items-center justify-center mx-auto text-slate-400">
              <BarChart3 className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-slate-700">Custom Dataset Benchmarking</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Upload a labelled CSV above with a <code className="bg-cream-200 px-1 py-0.5 rounded text-coral-600">code_content</code> column and an
              {' '}<code className="bg-cream-200 px-1 py-0.5 rounded text-coral-600">authorship_class</code> column
              (<code className="text-slate-800">HUMAN</code> or <code className="text-slate-800">AI</code>) to compute a
              confusion matrix, precision, recall, and ROC-AUC.
            </p>
          </div>
        </div>
      )}
    </motion.div>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub: string; color?: string }) {
  return (
    <div className="card p-4 text-center">
      <p className="text-[11px] font-semibold text-slate-400 uppercase">{label}</p>
      <p className="text-2xl font-bold text-slate-800 my-1">{value}</p>
      <p className="text-[10px] text-slate-400">{sub}</p>
    </div>
  );
}
