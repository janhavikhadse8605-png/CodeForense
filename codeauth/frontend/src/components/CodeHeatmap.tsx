import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Rows3, Code2 } from 'lucide-react';
import type { SegmentResult } from '../types';

interface CodeHeatmapProps {
  segments: SegmentResult[];
  code?: string;
}

type Tone = 'green' | 'red' | 'yellow';

const tones: Record<Tone, { line: string; border: string; label: string; pill: string }> = {
  green: { line: 'rgba(34, 197, 94, 0.10)', border: '#22C55E', label: 'Human-associated', pill: 'bg-green-100 text-green-700' },
  red: { line: 'rgba(239, 68, 68, 0.10)', border: '#EF4444', label: 'AI-associated', pill: 'bg-red-100 text-red-600' },
  yellow: { line: 'rgba(245, 158, 11, 0.12)', border: '#F59E0B', label: 'Uncertain', pill: 'bg-amber-100 text-amber-700' },
};

const toneOf = (s: SegmentResult): Tone =>
  s.heatmap_color === 'green' || s.heatmap_color === 'red' ? s.heatmap_color : 'yellow';

export default function CodeHeatmap({ segments, code }: CodeHeatmapProps) {
  const [view, setView] = useState<'code' | 'list'>(code ? 'code' : 'list');
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const lines = useMemo(() => (code ? code.replace(/\n$/, '').split('\n') : []), [code]);

  /**
   * Map every 1-indexed line to the segment that covers it. Segments nest
   * (a class contains its methods), so the narrowest range wins — that way a
   * method's own verdict is what shows on its lines.
   */
  const lineOwner = useMemo(() => {
    const owner = new Map<number, number>();
    const ranked = segments
      .map((s, i) => ({ s, i, span: s.end_line - s.start_line }))
      .sort((a, b) => b.span - a.span);
    for (const { s, i } of ranked) {
      for (let ln = s.start_line; ln <= s.end_line; ln++) owner.set(ln, i);
    }
    return owner;
  }, [segments]);

  const distribution = useMemo(() => {
    const valid = segments.filter(s => s.prediction !== 'UNKNOWN');
    const total = valid.length || 1;
    const human = valid.filter(s => s.prediction.includes('HUMAN')).length;
    const ai = valid.filter(s => s.prediction.includes('AI')).length;
    return {
      human: Math.round((human / total) * 100),
      ai: Math.round((ai / total) * 100),
      other: Math.round(((total - human - ai) / total) * 100),
      counted: valid.length,
    };
  }, [segments]);

  if (!segments || segments.length === 0) return null;

  const active = activeIdx !== null ? segments[activeIdx] : null;

  return (
    <div className="space-y-4">
      {/* ── Header + view switch ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Function-level authorship heatmap
        </h3>
        {lines.length > 0 && (
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--surface-sunken)] border border-[var(--line)]">
            <SwitchBtn active={view === 'code'} onClick={() => setView('code')} icon={<Code2 className="w-3.5 h-3.5" />} label="Code" />
            <SwitchBtn active={view === 'list'} onClick={() => setView('list')} icon={<Rows3 className="w-3.5 h-3.5" />} label="Sections" />
          </div>
        )}
      </div>

      {/* ── Legend ── */}
      <div className="flex flex-wrap items-center gap-4">
        {(Object.keys(tones) as Tone[]).map(t => (
          <span key={t} className="flex items-center gap-2 text-xs text-[var(--text-body)]">
            <span className="w-3 h-3 rounded-[4px]" style={{ background: tones[t].line, border: `1.5px solid ${tones[t].border}` }} />
            {tones[t].label}
          </span>
        ))}
        <span className="text-xs text-[var(--text-muted)] ml-auto">
          {segments.length} section{segments.length === 1 ? '' : 's'} analyzed
        </span>
      </div>

      {/* ── Code view ── */}
      {view === 'code' && lines.length > 0 && (
        <>
          <div className="rounded-xl border border-[var(--line)] overflow-hidden">
            <div className="max-h-[420px] overflow-auto font-mono text-[12.5px] leading-[1.65]">
              {lines.map((text, i) => {
                const ln = i + 1;
                const idx = lineOwner.get(ln);
                const seg = idx !== undefined ? segments[idx] : undefined;
                const tone = seg ? toneOf(seg) : undefined;
                const isActive = idx !== undefined && idx === activeIdx;
                return (
                  <div
                    key={ln}
                    onClick={() => idx !== undefined && setActiveIdx(isActive ? null : idx)}
                    title={seg ? `${seg.name} — ${seg.prediction} (${seg.confidence}%)` : undefined}
                    className={`flex ${seg ? 'cursor-pointer' : ''} ${isActive ? 'ring-1 ring-inset ring-coral-300' : ''}`}
                    style={{
                      background: tone ? tones[tone].line : 'transparent',
                      borderLeft: `3px solid ${tone ? tones[tone].border : 'transparent'}`,
                    }}
                  >
                    <span className="select-none w-11 shrink-0 pr-3 text-right text-[var(--text-muted)] opacity-70">
                      {ln}
                    </span>
                    <code className="whitespace-pre pr-4 text-[var(--text-strong)]">{text || ' '}</code>
                  </div>
                );
              })}
            </div>
          </div>

          {active ? (
            <SegmentDetail segment={active} />
          ) : (
            <p className="text-xs text-[var(--text-muted)]">
              Select a highlighted line to inspect that section's verdict and evidence.
            </p>
          )}
        </>
      )}

      {/* ── Section list ── */}
      {(view === 'list' || lines.length === 0) && (
        <div className="space-y-2">
          {segments.map((seg, i) => {
            const tone = toneOf(seg);
            return (
              <motion.button
                key={`${seg.name}-${i}`}
                onClick={() => setActiveIdx(activeIdx === i ? null : i)}
                className={`w-full text-left p-4 rounded-xl heatmap-${tone} transition-shadow hover:shadow-md ${
                  activeIdx === i ? 'ring-1 ring-coral-300' : ''
                }`}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(0.05 * i, 0.4) }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="font-mono text-sm font-semibold text-[var(--text-strong)]">{seg.name}</span>
                    <span className="text-xs text-[var(--text-muted)] ml-2">
                      ({seg.segment_type}) lines {seg.start_line}–{seg.end_line}
                    </span>
                  </span>
                  <span className="flex items-center gap-3 shrink-0">
                    <span className={`text-xs font-bold px-3 py-1 rounded-full ${tones[tone].pill}`}>
                      {seg.prediction}
                    </span>
                    <span className="text-sm font-bold text-[var(--text-body)]">{seg.confidence}%</span>
                  </span>
                </div>
                {activeIdx === i && <SegmentDetail segment={seg} inline />}
              </motion.button>
            );
          })}
        </div>
      )}

      {/* ── Mixed-authorship distribution ── */}
      {distribution.counted > 1 && (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Section distribution
            </p>
            <p className="text-xs text-[var(--text-body)]">
              {distribution.human}% human-associated · {distribution.ai}% AI-associated
            </p>
          </div>
          <div className="flex h-2.5 rounded-full overflow-hidden bg-[var(--line)]">
            <div style={{ width: `${distribution.human}%`, background: tones.green.border }} />
            <div style={{ width: `${distribution.ai}%`, background: tones.red.border }} />
            <div style={{ width: `${distribution.other}%`, background: tones.yellow.border }} />
          </div>
        </div>
      )}
    </div>
  );
}

function SwitchBtn({ active, onClick, icon, label }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
        active ? 'bg-[var(--surface)] text-coral-600 shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-body)]'
      }`}
    >
      {icon} {label}
    </button>
  );
}

function SegmentDetail({ segment, inline = false }: { segment: SegmentResult; inline?: boolean }) {
  const entries = Object.entries(segment.evidence || {}).sort((a, b) => b[1] - a[1]);
  return (
    <div className={inline ? 'mt-3 pt-3 border-t border-black/5' : 'rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] p-4'}>
      {!inline && (
        <p className="text-sm font-semibold mb-2">
          <span className="font-mono">{segment.name}</span>
          <span className="text-xs font-normal text-[var(--text-muted)] ml-2">
            {segment.prediction} · {segment.confidence}% · lines {segment.start_line}–{segment.end_line}
          </span>
        </p>
      )}
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
        <Stat label="Human probability" value={`${segment.human_probability}%`} />
        <Stat label="AI probability" value={`${segment.ai_probability}%`} />
      </div>
      {entries.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {entries.map(([k, v]) => (
            <span key={k} className="chip !text-[0.68rem] !py-0.5">
              {k} {Math.round(v)}%
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex justify-between text-xs">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="font-semibold text-[var(--text-strong)]">{value}</span>
    </span>
  );
}
