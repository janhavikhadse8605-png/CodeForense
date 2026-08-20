import { motion } from 'framer-motion';
import { Shield, Clock, Code2, Layers } from 'lucide-react';
import type { AnalysisResult } from '../types';

interface ResultCardProps {
  result: AnalysisResult;
}

export default function ResultCard({ result }: ResultCardProps) {
  const isAI = result.prediction.includes('AI');
  const isMixed = result.prediction.includes('MIXED');

  const badgeClass = isMixed ? 'badge-mixed' : isAI ? 'badge-ai' : 'badge-human';
  const accentColor = isMixed ? '#D97706' : isAI ? '#EF4444' : '#22C55E';

  return (
    <motion.div
      className="card p-6"
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      {/* Prediction */}
      <div className="text-center mb-6">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
        >
          <span className={`${badgeClass} text-lg inline-block px-6 py-2`}>
            {result.prediction}
          </span>
        </motion.div>

        {/* Confidence */}
        <motion.div
          className="mt-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Confidence</p>
          <CountUp value={result.confidence} suffix="%" className="text-4xl font-bold" style={{ color: accentColor }} />
        </motion.div>
      </div>

      {/* Probabilities */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="text-center p-3 rounded-xl bg-green-50">
          <p className="text-xs text-slate-500 mb-1">Human Probability</p>
          <p className="text-xl font-bold text-green-600">{result.human_probability}%</p>
        </div>
        <div className="text-center p-3 rounded-xl bg-red-50">
          <p className="text-xs text-slate-500 mb-1">AI Probability</p>
          <p className="text-xl font-bold text-red-500">{result.ai_probability}%</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <StatItem icon={<Code2 className="w-4 h-4" />} label="Language" value={result.language} />
        <StatItem icon={<Layers className="w-4 h-4" />} label="Lines" value={String(result.statistics.lines)} />
        <StatItem icon={<Shield className="w-4 h-4" />} label="Functions" value={String(result.statistics.functions)} />
        <StatItem icon={<Clock className="w-4 h-4" />} label="Analyzed" value={new Date(result.created_at).toLocaleTimeString()} />
      </div>

      {/* Methodology note */}
      <p className="mt-4 text-[11px] text-slate-400 italic text-center leading-relaxed">
        Authorship analysis is probabilistic. Results indicate model-associated patterns and should not be treated as definitive proof of authorship.
      </p>
    </motion.div>
  );
}

function StatItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-slate-600">
      {icon}
      <div>
        <p className="text-[10px] text-slate-400">{label}</p>
        <p className="font-medium capitalize">{value}</p>
      </div>
    </div>
  );
}

function CountUp({ value, suffix = '', className = '', style = {} }: { value: number; suffix?: string; className?: string; style?: React.CSSProperties }) {
  return (
    <motion.span
      className={className}
      style={style}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.3 }}
    >
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.5 }}
      >
        {value.toFixed(1)}{suffix}
      </motion.span>
    </motion.span>
  );
}
