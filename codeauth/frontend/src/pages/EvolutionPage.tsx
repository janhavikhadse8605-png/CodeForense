import { useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Plus, Trash2, AlertTriangle, Clock } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { analyzeEvolution } from '../api/client';
import PageHeader from '../components/PageHeader';
import LanguageSelect, { LanguageCaveat } from '../components/LanguageSelect';

interface VersionInput {
  label: string;
  code: string;
  timestamp: string;
}

const SAMPLE_V1 = `def process_user_data(users):
    # Process user records
    results = []
    for u in users:
        if u.get('is_active'):
            results.append({
                'id': u['id'],
                'name': u['name'].strip(),
                'email': u['email'].lower()
            })
    return results`;

const SAMPLE_V2 = `def process_user_data(users: list[dict]) -> list[dict]:
    """
    Process and sanitize active user records from raw input dictionary list.
    Filters out inactive accounts and standardizes name and email fields.
    """
    sanitized_records = []
    for user in users:
        if not user.get("is_active", False):
            continue
        sanitized_records.append({
            "id": user.get("id"),
            "name": str(user.get("name", "")).strip().title(),
            "email": str(user.get("email", "")).strip().lower(),
            "processed_at": "auto"
        })
    return sanitized_records`;

export default function EvolutionPage() {
  const [versions, setVersions] = useState<VersionInput[]>([
    { label: 'Commit v1.0 (Initial)', code: SAMPLE_V1, timestamp: '2026-08-01' },
    { label: 'Commit v2.0 (Refactor)', code: SAMPLE_V2, timestamp: '2026-08-15' },
  ]);
  const [language, setLanguage] = useState('python');
  const [loading, setLoading] = useState(false);
  const [evolutionResult, setEvolutionResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const addVersion = () => {
    setVersions(prev => [
      ...prev,
      { label: `Commit v${prev.length + 1}.0`, code: '', timestamp: new Date().toISOString().split('T')[0] },
    ]);
  };

  const updateVersion = (index: number, field: keyof VersionInput, val: string) => {
    setVersions(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: val };
      return next;
    });
  };

  const removeVersion = (index: number) => {
    if (versions.length <= 2) return;
    setVersions(prev => prev.filter((_, i) => i !== index));
  };

  const handleAnalyze = async () => {
    const valid = versions.filter(v => v.code.trim().length > 0);
    if (valid.length < 2) {
      setError('Please provide code for at least 2 versions to analyze evolution.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await analyzeEvolution(valid, language);
      setEvolutionResult(res);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Evolution analysis failed.');
    } finally {
      setLoading(false);
    }
  };

  const chartData = evolutionResult?.versions?.map((v: any) => ({
    label: v.label,
    AI_Probability: v.ai_probability,
    Human_Probability: v.human_probability,
    Confidence: v.confidence,
  })) || [];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <PageHeader
        eyebrow="Code Evolution"
        eyebrowIcon={<TrendingUp className="w-[15px] h-[15px]" />}
        title="Authorship drift across versions"
        description="Compare successive revisions of the same file to see how its stylometric profile moves, and where it shifts abruptly."
        actions={
          <>
            <LanguageSelect value={language} onChange={setLanguage} />
            <button onClick={addVersion} className="btn-secondary text-xs !py-2 !px-3">
              <Plus className="w-3.5 h-3.5" /> Add version
            </button>
            <button onClick={handleAnalyze} disabled={loading} className="btn-primary text-xs !py-2.5 !px-4">
              <TrendingUp className="w-3.5 h-3.5" /> {loading ? 'Analyzing...' : 'Run analysis'}
            </button>
          </>
        }
      />

      <LanguageCaveat language={language} />

      {error && (
        <div className="card p-4 border-red-200 flex items-center gap-2 text-red-500 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Version Inputs */}
      <div className="grid md:grid-cols-2 gap-4">
        {versions.map((v, i) => (
          <div key={i} className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <input
                type="text"
                value={v.label}
                onChange={e => updateVersion(i, 'label', e.target.value)}
                aria-label={`Label for version ${i + 1}`}
                className="font-semibold text-sm bg-transparent border-b border-[var(--line-strong)] focus:border-coral-500 focus:outline-none px-1 py-0.5 min-w-0 flex-1 mr-2"
              />
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--text-muted)] shrink-0">Step {i + 1}</span>
                {versions.length > 2 && (
                  <button
                    onClick={() => removeVersion(i)}
                    className="p-1 text-slate-400 hover:text-red-500"
                    title="Remove version"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            <textarea
              value={v.code}
              onChange={e => updateVersion(i, 'code', e.target.value)}
              placeholder={`Paste source code for ${v.label}...`}
              rows={8}
              className="field font-mono !text-xs resize-none"
            />
          </div>
        ))}
      </div>

      {/* Evolution Results */}
      {evolutionResult && (
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {/* Timeline Chart */}
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4">
              Authorship Trajectory Over Versions
            </h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                  <XAxis dataKey="label" stroke="var(--text-muted)" fontSize={12} />
                  <YAxis stroke="var(--text-muted)" fontSize={12} unit="%" domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--surface)',
                      borderRadius: '12px',
                      border: '1px solid var(--line)',
                      color: 'var(--text-strong)',
                      boxShadow: 'var(--shadow-soft)',
                    }}
                  />
                  <Line type="monotone" dataKey="AI_Probability" stroke="#EF4444" strokeWidth={2.5} dot={{ r: 5 }} />
                  <Line type="monotone" dataKey="Human_Probability" stroke="#22C55E" strokeWidth={2.5} dot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Style Shift Detection Alerts */}
          {evolutionResult.style_shifts?.length > 0 ? (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
                Detected Stylometric Shifts
              </h3>
              {evolutionResult.style_shifts.map((shift: any, idx: number) => (
                <div key={idx} className="card p-5 border-amber-200 bg-amber-50/50 space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <h4 className="text-sm font-bold text-amber-900">{shift.description}</h4>
                  </div>
                  <p className="text-xs text-amber-700">
                    Shift magnitude metric: <span className="font-semibold">{shift.magnitude}%</span> variance across stylistic features.
                  </p>
                  {shift.details?.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {shift.details.map((d: any, di: number) => (
                        <span key={di} className="text-[11px] px-2.5 py-1 rounded-lg bg-white border border-amber-200 text-amber-800">
                          {d.feature}: {d.direction} by {Math.abs(d.change)}%
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="card p-4 bg-green-50/60 border-green-200 text-green-800 text-sm flex items-center gap-2">
              <Clock className="w-4 h-4 text-green-600" />
              <span>Consistent authorship patterns observed across submitted revisions. No jarring stylometric shifts detected.</span>
            </div>
          )}

          {/* Version Breakdown Cards */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {evolutionResult.versions.map((v: any, idx: number) => (
              <div key={idx} className="card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-slate-800">{v.label}</span>
                  <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                    v.prediction.includes('AI') ? 'badge-ai' : v.prediction.includes('HUMAN') ? 'badge-human' : 'badge-mixed'
                  }`}>
                    {v.prediction}
                  </span>
                </div>
                <div className="space-y-1.5 text-xs text-slate-500">
                  <div className="flex justify-between">
                    <span>Confidence:</span>
                    <span className="font-semibold text-slate-700">{v.confidence}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>AI Contribution:</span>
                    <span className="font-semibold text-red-500">{v.ai_probability}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Human Contribution:</span>
                    <span className="font-semibold text-green-600">{v.human_probability}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
