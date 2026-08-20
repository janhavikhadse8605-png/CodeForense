import { motion } from 'framer-motion';

interface EvidenceBarsProps {
  evidence: Record<string, number>;
  prediction: string;
}

const labels: Record<string, string> = {
  naming: 'Naming Regularity',
  structure: 'Structural Consistency',
  comments: 'Comment Pattern',
  repetition: 'Repetition',
  complexity: 'Complexity Pattern',
  formatting: 'Formatting Consistency',
};

const icons: Record<string, string> = {
  naming: '🏷️',
  structure: '🏗️',
  comments: '💬',
  repetition: '🔁',
  complexity: '📊',
  formatting: '📐',
};

export default function EvidenceBars({ evidence, prediction }: EvidenceBarsProps) {
  const isAI = prediction.includes('AI');
  const sorted = Object.entries(evidence).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
        {isAI ? 'Why AI-Likely?' : 'Why Human-Likely?'}
      </h3>
      <p className="text-xs text-slate-500 mb-4">
        AI-associated evidence (feature contribution via ablation)
      </p>

      <div className="space-y-3">
        {sorted.map(([key, value], i) => (
          <motion.div
            key={key}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 * i, duration: 0.4 }}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-medium text-slate-700 flex items-center gap-2">
                <span>{icons[key] || '📋'}</span>
                {labels[key] || key}
              </span>
              <span className="text-sm font-bold text-slate-800">{Math.round(value)}%</span>
            </div>
            <div className="evidence-bar">
              <motion.div
                className="evidence-bar-fill"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(value, 100)}%` }}
                transition={{ delay: 0.2 + 0.1 * i, duration: 0.8, ease: 'easeOut' }}
                style={{
                  background: isAI
                    ? `linear-gradient(90deg, #FB923C, #F97316)`
                    : `linear-gradient(90deg, #4ADE80, #22C55E)`,
                }}
              />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
