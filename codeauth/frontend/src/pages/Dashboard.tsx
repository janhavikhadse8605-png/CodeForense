import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight, FolderOpen, FileCode2, Folder, Timer, Activity,
  Zap, Globe, Sparkles, Code2, Users, Layers, TrendingUp, ShieldCheck,
} from 'lucide-react';
import { getDashboardStats } from '../api/client';
import type { DashboardStats } from '../types';
import HeroArt from '../components/HeroArt';
import GithubMark from '../components/GithubMark';

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
};
const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    getDashboardStats().then(setStats).catch(() => {});
  }, []);

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-10">
      {/* ─── Hero ─────────────────────────────────────── */}
      <motion.section variants={item} className="relative grid lg:grid-cols-[1fr_auto] items-center gap-6">
        <div className="max-w-xl pt-2">
          <h1 className="text-[2rem] md:text-[2.6rem] font-bold leading-[1.15] tracking-tight">
            Welcome back, <span className="text-coral-500">Developer!</span>{' '}
            <span className="inline-block animate-pulse-gentle">👋</span>
          </h1>
          <p className="mt-4 text-[1.02rem] leading-relaxed text-[var(--text-body)]">
            Analyze code authorship and detect AI-generated patterns
            <br className="hidden sm:block" /> with explainable insights and advanced analysis.
          </p>
        </div>
        <HeroArt className="hidden lg:block w-[440px] h-[300px] shrink-0 animate-float" />
      </motion.section>

      {/* ─── Section divider ──────────────────────────── */}
      <motion.div variants={item} className="divider-dashed">
        <span className="whitespace-nowrap px-1">Choose your analysis method</span>
      </motion.div>

      {/* ─── Analysis methods ─────────────────────────── */}
      <motion.section variants={item} className="grid md:grid-cols-2 gap-7">
        <MethodCard
          accent="coral"
          eyebrowIcon={<Folder className="w-[15px] h-[15px]" />}
          eyebrow="Repository Analysis"
          medallion={<GithubMark className="w-11 h-11 text-coral-500" />}
          title="Analyze Repository"
          description="Connect your Git repository to analyze entire projects, commit history, and authorship patterns."
          features={[
            { icon: <FolderOpen className="w-4 h-4" />, label: 'Full repository analysis' },
            { icon: <Timer className="w-4 h-4" />, label: 'Commit-by-commit insights' },
            { icon: <Activity className="w-4 h-4" />, label: 'Authorship evolution tracking' },
          ]}
          cta="Connect Repository"
          onClick={() => navigate('/repository')}
        />

        <MethodCard
          accent="amber"
          eyebrowIcon={<FileCode2 className="w-[15px] h-[15px]" />}
          eyebrow="Code Analysis"
          medallion={<Code2 className="w-11 h-11 text-amber-500" strokeWidth={2.3} />}
          title="Analyze Code Snippet"
          description="Paste your code snippet or upload a file to analyze authorship patterns and AI-generated characteristics."
          features={[
            { icon: <Zap className="w-4 h-4" />, label: 'Quick snippet analysis' },
            { icon: <Globe className="w-4 h-4" />, label: 'Multi-language support' },
            { icon: <Sparkles className="w-4 h-4" />, label: 'Instant results & insights' },
          ]}
          cta="Paste or Upload Code"
          onClick={() => navigate('/analyze')}
        />
      </motion.section>

      {/* ─── Activity overview ────────────────────────── */}
      {stats && stats.total_analyses > 0 && (
        <motion.section variants={item} className="space-y-4">
          <h2 className="text-base font-semibold">Your activity</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatTile icon={<Activity className="w-4 h-4" />} label="Total analyses" value={stats.total_analyses} tone="coral" />
            <StatTile icon={<ShieldCheck className="w-4 h-4" />} label="AI-associated" value={stats.ai_associated} tone="red" />
            <StatTile icon={<Users className="w-4 h-4" />} label="Human-associated" value={stats.human_associated} tone="green" />
            <StatTile icon={<Layers className="w-4 h-4" />} label="Mixed" value={stats.mixed} tone="amber" />
            <StatTile icon={<TrendingUp className="w-4 h-4" />} label="Avg confidence" value={`${stats.avg_confidence}%`} tone="blue" />
          </div>

          {stats.recent_analyses.length > 0 && (
            <div className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Recent analyses
                </h3>
                <button
                  onClick={() => navigate('/history')}
                  className="text-xs font-semibold text-coral-500 hover:text-coral-600 inline-flex items-center gap-1"
                >
                  View all <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-1">
                {stats.recent_analyses.map(a => (
                  <button
                    key={a.id}
                    onClick={() => navigate('/history')}
                    className="w-full flex items-center justify-between gap-3 p-3 rounded-xl hover:bg-[var(--surface-soft)] transition-colors text-left"
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <Code2 className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                      <span className="text-sm font-medium capitalize truncate">{a.language}</span>
                    </span>
                    <span className="flex items-center gap-3 shrink-0">
                      <PredictionPill prediction={a.prediction} />
                      <span className="text-xs text-[var(--text-muted)] w-12 text-right">{a.confidence}%</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </motion.section>
      )}
    </motion.div>
  );
}

/* ─── Method card ──────────────────────────────────── */

interface MethodCardProps {
  accent: 'coral' | 'amber';
  eyebrow: string;
  eyebrowIcon: React.ReactNode;
  medallion: React.ReactNode;
  title: string;
  description: string;
  features: Array<{ icon: React.ReactNode; label: string }>;
  cta: string;
  onClick: () => void;
}

function MethodCard({
  accent, eyebrow, eyebrowIcon, medallion, title, description, features, cta, onClick,
}: MethodCardProps) {
  const isCoral = accent === 'coral';
  return (
    <motion.div className="method-card" whileHover={{ y: -4 }} onClick={onClick} role="button" tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
    >
      <CardDecor />
      <div className="relative">
        <div className="medallion">{medallion}</div>

        <p className={`eyebrow justify-center ${isCoral ? 'text-coral-500' : 'text-amber-500'}`}>
          {eyebrowIcon} {eyebrow}
        </p>

        <h3 className="mt-2 text-[1.35rem] font-bold tracking-tight">{title}</h3>
        <p className="mt-2.5 text-[0.92rem] leading-relaxed text-[var(--text-body)] max-w-[19rem] mx-auto">
          {description}
        </p>

        <div className="my-5 border-t border-[var(--line)]" />

        <ul className="space-y-0.5 mb-6">
          {features.map(f => (
            <li key={f.label} className="feature-row">
              <span className={`feature-tile ${isCoral ? 'bg-coral-100 text-coral-500' : 'bg-amber-100 text-amber-600'}`}>
                {f.icon}
              </span>
              {f.label}
            </li>
          ))}
        </ul>

        <button className={`${isCoral ? 'btn-coral' : 'btn-amber'} btn-block`}>
          {cta} <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}

/** Dotted swirls and sparkles behind each method card. */
function CardDecor() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 400 300"
      preserveAspectRatio="none"
      aria-hidden="true"
      fill="none"
    >
      <g stroke="#F3C9A9" strokeWidth="2" strokeDasharray="4 7" strokeLinecap="round" opacity="0.75">
        <path d="M24 96 C60 60 96 132 140 92" />
        <path d="M260 92 C302 130 338 62 376 98" />
        <path d="M18 150 C48 168 62 140 92 156" />
      </g>
      <g fill="#F2A87C" opacity="0.7">
        <circle cx="150" cy="128" r="3.5" />
        <circle cx="252" cy="120" r="3" />
        <circle cx="34" cy="196" r="3" />
        <circle cx="366" cy="176" r="3.5" />
      </g>
      <g fill="#FBC96E" opacity="0.85">
        <path d="M304 44 l2.6 6.4 6.4 2.6 -6.4 2.6 -2.6 6.4 -2.6 -6.4 -6.4 -2.6 6.4 -2.6 Z" />
        <path d="M92 60 l2.2 5.4 5.4 2.2 -5.4 2.2 -2.2 5.4 -2.2 -5.4 -5.4 -2.2 5.4 -2.2 Z" />
        <path d="M340 138 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 Z" />
      </g>
    </svg>
  );
}

/* ─── Small pieces ─────────────────────────────────── */

function StatTile({ icon, label, value, tone }: {
  icon: React.ReactNode; label: string; value: number | string; tone: string;
}) {
  const tones: Record<string, string> = {
    coral: 'text-coral-500 bg-coral-100',
    red: 'text-red-500 bg-red-100',
    green: 'text-green-600 bg-green-100',
    amber: 'text-amber-600 bg-amber-100',
    blue: 'text-blue-500 bg-blue-100',
  };
  return (
    <div className="card p-4">
      <span className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2.5 ${tones[tone] || tones.coral}`}>
        {icon}
      </span>
      <p className="text-[0.72rem] text-[var(--text-muted)]">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}

export function PredictionPill({ prediction }: { prediction: string }) {
  const cls = prediction.includes('MIXED')
    ? 'badge-mixed'
    : prediction.includes('AI')
      ? 'badge-ai'
      : prediction.includes('HUMAN')
        ? 'badge-human'
        : 'badge-neutral';
  return <span className={`${cls} !text-[0.68rem] !px-2.5 !py-1`}>{prediction}</span>;
}
