import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Code2, GitBranch, BarChart3, Shield, TrendingUp, Users,
  Zap, Brain, Globe, Layers, ArrowRight, Activity,
} from 'lucide-react';
import { getDashboardStats } from '../api/client';
import type { DashboardStats } from '../types';

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    getDashboardStats().then(setStats).catch(() => {});
  }, []);

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.08 } },
  };
  const item = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-8">
      {/* Hero */}
      <motion.div variants={item} className="card-lg card p-8 md:p-10 overflow-hidden relative">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="max-w-lg">
            <h1 className="text-2xl md:text-3xl font-bold text-slate-800 mb-2">
              Welcome back, Developer! 👋
            </h1>
            <p className="text-slate-500 leading-relaxed">
              Analyze code authorship and detect AI-generated patterns with explainable insights.
            </p>
          </div>
          {/* Hero illustration */}
          <div className="hidden md:flex items-center gap-3">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-coral-400/20 to-amber-400/20 flex items-center justify-center">
              <Shield className="w-10 h-10 text-coral-500" />
            </div>
            <div className="space-y-2">
              <div className="w-24 h-3 rounded-full bg-coral-200/50" />
              <div className="w-16 h-3 rounded-full bg-amber-200/50" />
              <div className="w-20 h-3 rounded-full bg-coral-200/30" />
            </div>
          </div>
        </div>
        {/* Decorative shapes */}
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-gradient-to-br from-coral-400/5 to-amber-400/5 -translate-y-1/2 translate-x-1/3" />
      </motion.div>

      {/* Stats Cards */}
      {stats && (
        <motion.div variants={item} className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatsCard icon={<Activity />} label="Total Analyses" value={stats.total_analyses} color="coral" />
          <StatsCard icon={<Shield />} label="AI-associated" value={stats.ai_associated} color="red" />
          <StatsCard icon={<Users />} label="Human-associated" value={stats.human_associated} color="green" />
          <StatsCard icon={<Layers />} label="Mixed" value={stats.mixed} color="amber" />
          <StatsCard icon={<TrendingUp />} label="Avg Confidence" value={`${stats.avg_confidence}%`} color="blue" />
        </motion.div>
      )}

      {/* Analysis Methods */}
      <motion.div variants={item}>
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Choose your analysis method</h2>
        <div className="grid md:grid-cols-2 gap-6">
          {/* Analyze Code */}
          <motion.div
            className="card p-6 cursor-pointer group"
            whileHover={{ y: -4, boxShadow: '0 8px 30px rgba(249,115,22,0.12)' }}
            onClick={() => navigate('/analyze')}
          >
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-coral-400/10 to-coral-500/10 flex items-center justify-center mb-4">
              <Code2 className="w-6 h-6 text-coral-500" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">Analyze Code Snippet</h3>
            <p className="text-sm text-slate-500 mb-4 leading-relaxed">
              Paste source code or upload a file to analyze authorship characteristics.
            </p>
            <div className="flex flex-wrap gap-2 mb-5">
              <Feature icon={<Zap className="w-3 h-3" />} label="Quick analysis" />
              <Feature icon={<Brain className="w-3 h-3" />} label="Explainable AI" />
              <Feature icon={<Globe className="w-3 h-3" />} label="Multi-language" />
              <Feature icon={<Layers className="w-3 h-3" />} label="Function-level" />
            </div>
            <button className="btn-primary group-hover:shadow-lg transition-shadow">
              Analyze Code <ArrowRight className="w-4 h-4" />
            </button>
          </motion.div>

          {/* Repository */}
          <motion.div
            className="card p-6 cursor-pointer group"
            whileHover={{ y: -4, boxShadow: '0 8px 30px rgba(249,115,22,0.12)' }}
            onClick={() => navigate('/repository')}
          >
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400/10 to-amber-500/10 flex items-center justify-center mb-4">
              <GitBranch className="w-6 h-6 text-amber-500" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">Analyze Repository</h3>
            <p className="text-sm text-slate-500 mb-4 leading-relaxed">
              Analyze entire projects, files, commits and authorship evolution.
            </p>
            <div className="flex flex-wrap gap-2 mb-5">
              <Feature icon={<GitBranch className="w-3 h-3" />} label="Repository analysis" />
              <Feature icon={<Layers className="w-3 h-3" />} label="Mixed-authorship" />
              <Feature icon={<BarChart3 className="w-3 h-3" />} label="Commit history" />
              <Feature icon={<TrendingUp className="w-3 h-3" />} label="Evolution" />
            </div>
            <button className="btn-secondary group-hover:border-amber-300 transition-colors">
              Connect Repository <ArrowRight className="w-4 h-4 inline ml-1" />
            </button>
          </motion.div>
        </div>
      </motion.div>

      {/* Recent Activity */}
      {stats && stats.recent_analyses.length > 0 && (
        <motion.div variants={item} className="card p-6">
          <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4">Recent Activity</h3>
          <div className="space-y-3">
            {stats.recent_analyses.map((a, i) => (
              <motion.div
                key={a.id}
                className="flex items-center justify-between p-3 rounded-xl hover:bg-cream-100 cursor-pointer transition-colors"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 * i }}
                onClick={() => navigate(`/history`)}
              >
                <div className="flex items-center gap-3">
                  <Code2 className="w-4 h-4 text-slate-400" />
                  <span className="text-sm font-medium text-slate-700">{a.language}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                    a.prediction.includes('AI') ? 'bg-red-50 text-red-500' :
                    a.prediction.includes('HUMAN') ? 'bg-green-50 text-green-500' :
                    'bg-amber-50 text-amber-500'
                  }`}>
                    {a.prediction}
                  </span>
                  <span className="text-xs text-slate-400">{a.confidence}%</span>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

function StatsCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number | string; color: string }) {
  const colorMap: Record<string, string> = {
    coral: 'text-coral-500 bg-coral-500/10',
    red: 'text-red-500 bg-red-500/10',
    green: 'text-green-500 bg-green-500/10',
    amber: 'text-amber-500 bg-amber-500/10',
    blue: 'text-blue-500 bg-blue-500/10',
  };

  return (
    <div className="card p-4">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${colorMap[color] || colorMap.coral}`}>
        <div className="w-4 h-4">{icon}</div>
      </div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-bold text-slate-800">{value}</p>
    </div>
  );
}

function Feature({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 bg-cream-100 px-2.5 py-1 rounded-full">
      {icon} {label}
    </span>
  );
}
