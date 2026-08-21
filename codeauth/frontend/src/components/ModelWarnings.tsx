import { useEffect, useState } from 'react';
import { TriangleAlert, Info, ChevronDown } from 'lucide-react';
import { getModelCard } from '../api/client';
import type { ModelCard, ModelWarning } from '../types';

/**
 * Surfaces the measured limitations of the loaded model.
 *
 * These come from /api/model/card, which the backend assembles from the JSON the
 * ml_training scripts write — so what renders here is what was measured, not a
 * hand-written disclaimer that can drift from the numbers.
 */
export default function ModelWarnings({
  compact = false,
  severity = 'all',
}: {
  compact?: boolean;
  severity?: 'all' | 'high';
}) {
  const [card, setCard] = useState<ModelCard | null>(null);
  const [expanded, setExpanded] = useState(!compact);

  useEffect(() => {
    getModelCard().then(setCard).catch(() => {});
  }, []);

  const warnings: ModelWarning[] = (card?.warnings ?? []).filter(
    w => severity === 'all' || w.severity === 'high',
  );
  if (warnings.length === 0) return null;

  const high = warnings.filter(w => w.severity === 'high');
  const fpr = card?.headline?.real_world_false_positive_rate;

  return (
    <section
      className={`rounded-2xl border px-4 py-3 ${
        high.length > 0
          ? 'border-red-300/70 bg-red-50/70'
          : 'border-amber-300/70 bg-amber-50/70'
      }`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-start gap-3 text-left"
        aria-expanded={expanded}
      >
        <TriangleAlert
          className={`w-[18px] h-[18px] shrink-0 mt-0.5 ${
            high.length > 0 ? 'text-red-600' : 'text-amber-600'
          }`}
        />
        <span className="min-w-0 flex-1">
          <span className={`block text-sm font-semibold ${high.length > 0 ? 'text-red-800' : 'text-amber-800'}`}>
            {high.length > 0 ? 'Measured reliability problem' : 'Measured limitations'}
            {fpr !== undefined && high.length > 0 && (
              <> — {Math.round(fpr * 100)}% false positives on known-human code</>
            )}
          </span>
          {!expanded && (
            <span className="block text-xs mt-0.5 text-[var(--text-body)]">
              {warnings.length} finding{warnings.length === 1 ? '' : 's'} from the evaluation
              scripts. Tap to read.
            </span>
          )}
        </span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 mt-0.5 text-[var(--text-muted)] transition-transform ${
            expanded ? 'rotate-180' : ''
          }`}
        />
      </button>

      {expanded && (
        <ul className="mt-3 space-y-3 pl-[30px]">
          {warnings.map(w => (
            <li key={w.title}>
              <p className={`text-xs font-semibold ${w.severity === 'high' ? 'text-red-800' : 'text-amber-800'}`}>
                {w.severity === 'high' ? '🔴' : '🟠'} {w.title}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-body)]">{w.detail}</p>
              {w.measured_by && (
                <p className="mt-0.5 text-[0.65rem] text-[var(--text-muted)] font-mono">
                  measured by {w.measured_by}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Compact inline note for result panels. */
export function CalibrationNote() {
  const [fpr, setFpr] = useState<number | null>(null);
  const [source, setSource] = useState<string>('');

  useEffect(() => {
    getModelCard()
      .then((c: ModelCard) => {
        if (c?.headline?.real_world_false_positive_rate !== undefined) {
          setFpr(c.headline.real_world_false_positive_rate!);
          setSource(c.headline.calibration_source || '');
        }
      })
      .catch(() => {});
  }, []);

  if (fpr === null) return null;

  return (
    <p className="flex items-start gap-2 text-[0.7rem] leading-relaxed text-[var(--text-muted)]">
      <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <span>
        On {source || 'known-human code'} this model labels{' '}
        <strong className="text-red-600">{Math.round(fpr * 100)}%</strong> of human files as AI.
        A verdict here describes surface style, not authorship.
      </span>
    </p>
  );
}
