import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Sun, Moon, Laptop, Cpu, Shield, CircleCheck, CircleX, Settings as SettingsIcon,
} from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { getModelInfo, getHealth } from '../api/client';
import type { ModelInfo } from '../types';
import PageHeader from '../components/PageHeader';
import { loadPreferences, savePreferences, type Preferences } from '../hooks/usePreferences';

interface ValidationStep {
  step: string;
  status: string;
  detail: string;
}

interface HealthInfo {
  status?: string;
  model_status?: string;
  model_device?: string;
  model_error?: string | null;
  validation_steps?: ValidationStep[];
}

const languages = [
  ['python', 'Python — the model’s validated target'],
  ['javascript', 'JavaScript'],
  ['typescript', 'TypeScript'],
  ['java', 'Java'],
  ['cpp', 'C++'],
  ['c', 'C'],
  ['csharp', 'C#'],
  ['go', 'Go'],
  ['rust', 'Rust'],
  ['php', 'PHP'],
  ['ruby', 'Ruby'],
];

const depths: Array<[Preferences['analysisDepth'], string]> = [
  ['quick', 'Quick — transformer and fusion head only'],
  ['standard', 'Standard — full 41-feature ablation and section heatmap'],
  ['deep', 'Deep — adds cross-version stylometry and reference matching'],
];

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [prefs, setPrefs] = useState<Preferences>(loadPreferences);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getModelInfo().then(setModelInfo).catch(() => {});
    getHealth().then(setHealth).catch(() => {});
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    savePreferences(prefs);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const ready = modelInfo?.is_ready ?? health?.model_status === 'ready';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        eyebrowIcon={<SettingsIcon className="w-[15px] h-[15px]" />}
        title="System & model settings"
        description="Set your analysis defaults and inspect exactly what the backend loaded at startup."
      />

      <div className="grid lg:grid-cols-2 gap-6">
        {/* ── Preferences ── */}
        <form onSubmit={handleSave} className="card p-6 space-y-6 h-fit">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Analysis preferences
          </h3>

          <div>
            <label className="text-xs font-semibold block mb-2">Interface theme</label>
            <div className="grid grid-cols-3 gap-2">
              {([['light', Sun, 'Light'], ['dark', Moon, 'Dark'], ['system', Laptop, 'System']] as const).map(
                ([value, Icon, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTheme(value)}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                      theme === value
                        ? 'bg-coral-50 border-coral-400 text-coral-600'
                        : 'border-[var(--line-strong)] text-[var(--text-body)] hover:bg-[var(--surface-soft)]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" /> {label}
                  </button>
                ),
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold block mb-1.5" htmlFor="pref-lang">
              Default source language
            </label>
            <select
              id="pref-lang"
              value={prefs.defaultLanguage}
              onChange={e => setPrefs({ ...prefs, defaultLanguage: e.target.value })}
              className="field !text-xs cursor-pointer"
            >
              {languages.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold block mb-1.5" htmlFor="pref-depth">
              Default analysis depth
            </label>
            <select
              id="pref-depth"
              value={prefs.analysisDepth}
              onChange={e => setPrefs({ ...prefs, analysisDepth: e.target.value as Preferences['analysisDepth'] })}
              className="field !text-xs cursor-pointer"
            >
              {depths.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold block mb-1.5" htmlFor="pref-ignored">
              Repository scanner ignore list
            </label>
            <input
              id="pref-ignored"
              type="text"
              value={prefs.ignoredDirs}
              onChange={e => setPrefs({ ...prefs, ignoredDirs: e.target.value })}
              className="field !text-xs font-mono"
            />
            <p className="text-[0.68rem] text-[var(--text-muted)] mt-1.5">
              Comma-separated. Stored in this browser; the backend applies its own built-in ignore list during scans.
            </p>
          </div>

          {saved && (
            <p className="p-2.5 rounded-xl bg-green-50 border border-green-200 text-green-700 text-xs flex items-center gap-1.5">
              <CircleCheck className="w-4 h-4" /> Preferences saved to this browser.
            </p>
          )}

          <button type="submit" className="btn-primary btn-block !text-xs">
            Save preferences
          </button>
        </form>

        {/* ── Model spec + diagnostics ── */}
        <div className="space-y-6">
          <div className="card p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
                <Cpu className="w-4 h-4 text-coral-500" /> Active model
              </h3>
              <span className={ready ? 'badge-human !text-[0.6rem]' : 'badge-ai !text-[0.6rem]'}>
                {ready ? 'READY' : 'NOT LOADED'}
              </span>
            </div>

            <dl className="space-y-0 text-xs">
              <Row label="Model name" value={modelInfo?.model_name} />
              <Row label="Base transformer" value={modelInfo?.base_model} mono />
              <Row label="Compute device" value={modelInfo?.device ?? health?.model_device} mono />
              <Row label="Target classes" value={modelInfo?.classes?.length ? modelInfo.classes.join(' / ') : undefined} />
              <Row label="Max token length" value={modelInfo?.max_length ? String(modelInfo.max_length) : undefined} />
              <Row
                label="Reported test accuracy"
                value={typeof modelInfo?.test_accuracy === 'number'
                  ? `${(modelInfo.test_accuracy * 100).toFixed(2)}%`
                  : undefined}
              />
              <Row label="Training timestamp" value={modelInfo?.trained_timestamp} mono />
              <Row label="Mixed-authorship logic" value={modelInfo?.mixed_methodology} />
            </dl>

            <div className="p-3.5 rounded-xl bg-[var(--surface-sunken)] border border-[var(--line)] text-[0.7rem] text-[var(--text-body)] space-y-1">
              <p className="font-semibold text-[var(--text-strong)]">Feature dimensions</p>
              {modelInfo?.feature_dimensions && Object.keys(modelInfo.feature_dimensions).length > 0 ? (
                <p>
                  {Object.entries(modelInfo.feature_dimensions)
                    .map(([g, d]) => `${g}: ${d}`)
                    .join(' · ')}
                </p>
              ) : (
                <p className="text-[var(--text-muted)]">Unavailable until the model loads.</p>
              )}
              {modelInfo?.architecture?.fusion && <p className="font-mono">{modelInfo.architecture.fusion}</p>}
              {modelInfo?.architecture?.classifier && <p className="font-mono">{modelInfo.architecture.classifier}</p>}
            </div>

            <p className="text-[0.68rem] leading-relaxed text-[var(--text-muted)]">
              Test accuracy is the figure recorded in the checkpoint metadata at training time. It describes that
              held-out split only — re-measure on your own labelled data under Model Evaluation before relying on it.
            </p>
          </div>

          {/* Startup validation */}
          <div className="card p-6 space-y-3">
            <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
              <Shield className={`w-4 h-4 ${ready ? 'text-green-600' : 'text-amber-600'}`} />
              Startup model validation
            </h3>

            {health?.model_error && (
              <p className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-600 break-words">
                {health.model_error}
              </p>
            )}

            {health?.validation_steps && health.validation_steps.length > 0 ? (
              <div className="space-y-1.5 text-xs">
                {health.validation_steps.map((step, i) => {
                  const passed = step.status === 'passed';
                  return (
                    <div
                      key={`${step.step}-${i}`}
                      className="flex items-start justify-between gap-3 py-1.5 border-b border-[var(--line)] last:border-0"
                    >
                      <span className="flex items-start gap-1.5 min-w-0">
                        {passed
                          ? <CircleCheck className="w-3.5 h-3.5 text-green-600 shrink-0 mt-0.5" />
                          : <CircleX className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />}
                        <span className={passed ? 'text-[var(--text-body)]' : 'text-red-600 font-medium'}>
                          {step.step}
                        </span>
                      </span>
                      {step.detail && (
                        <span className="font-mono text-[0.65rem] text-[var(--text-muted)] text-right max-w-[45%] truncate" title={step.detail}>
                          {step.detail}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-[var(--text-muted)]">
                No validation steps reported. The backend may be unreachable.
              </p>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function Row({ label, value, mono = false }: { label: string; value?: string | null; mono?: boolean }) {
  const missing = value === undefined || value === null || value === '';
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-[var(--line)] last:border-0">
      <dt className="text-[var(--text-muted)] shrink-0">{label}</dt>
      <dd className={`text-right break-words ${mono ? 'font-mono' : ''} ${
        missing ? 'text-[var(--text-muted)] italic' : 'font-semibold text-[var(--text-strong)]'
      }`}>
        {missing ? 'unavailable' : value}
      </dd>
    </div>
  );
}
