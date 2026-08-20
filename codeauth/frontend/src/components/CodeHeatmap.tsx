import { motion } from 'framer-motion';
import type { SegmentResult } from '../types';

interface CodeHeatmapProps {
  segments: SegmentResult[];
  code?: string;
}

export default function CodeHeatmap({ segments }: CodeHeatmapProps) {
  if (!segments || segments.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
        Function-Level Authorship Heatmap
      </h3>
      <div className="space-y-2">
        {segments.map((seg, i) => (
          <motion.div
            key={`${seg.name}-${i}`}
            className={`p-4 rounded-xl heatmap-${seg.heatmap_color} cursor-pointer hover:shadow-md transition-shadow`}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 * i }}
            title={`${seg.prediction} — Confidence: ${seg.confidence}%`}
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="font-mono text-sm font-semibold text-slate-800">
                  {seg.name}
                </span>
                <span className="text-xs text-slate-500 ml-2">
                  ({seg.segment_type}) Lines {seg.start_line}–{seg.end_line}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                  seg.heatmap_color === 'red' ? 'bg-red-100 text-red-600' :
                  seg.heatmap_color === 'green' ? 'bg-green-100 text-green-600' :
                  'bg-amber-100 text-amber-600'
                }`}>
                  {seg.prediction}
                </span>
                <span className="text-sm font-bold text-slate-700">{seg.confidence}%</span>
              </div>
            </div>
            {seg.evidence && Object.keys(seg.evidence).length > 0 && (
              <div className="mt-2 flex gap-2 flex-wrap">
                {Object.entries(seg.evidence).slice(0, 3).map(([key, val]) => (
                  <span key={key} className="text-[10px] text-slate-500 bg-white/60 px-2 py-0.5 rounded-full">
                    {key}: {Math.round(val as number)}%
                  </span>
                ))}
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Mixed authorship summary */}
      {segments.length > 1 && (
        <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200">
          <p className="text-sm font-medium text-amber-700">
            {(() => {
              const human = segments.filter(s => s.prediction.includes('HUMAN')).length;
              const ai = segments.filter(s => s.prediction.includes('AI')).length;
              const total = segments.length;
              return `Human sections: ${Math.round(human / total * 100)}% · AI-associated sections: ${Math.round(ai / total * 100)}%`;
            })()}
          </p>
        </div>
      )}
    </div>
  );
}
