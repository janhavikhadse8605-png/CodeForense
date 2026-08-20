import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Code2, Clock } from 'lucide-react';
import { getHistory } from '../api/client';
import EmptyState from '../components/EmptyState';
import type { HistoryItem } from '../types';

export default function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    getHistory().then(data => { setItems(data.items); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="animate-pulse-gentle text-center py-20 text-slate-500">Loading history...</div>;

  if (items.length === 0) {
    return <EmptyState title="No analyses yet" description="Paste a code snippet to start your first authorship analysis." actionLabel="Analyze Code" onAction={() => navigate('/analyze')} />;
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Analysis History</h1>
        <p className="text-sm text-slate-500 mt-1">{items.length} analyses recorded</p>
      </div>

      <div className="space-y-3">
        {items.map((item, i) => (
          <motion.div
            key={item.id}
            className="card p-4 cursor-pointer hover:shadow-md transition-shadow"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.03 * i }}
            onClick={() => navigate(`/analyze`)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <Code2 className="w-5 h-5 text-slate-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">{item.code_snippet || 'Code snippet'}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-slate-400 capitalize">{item.language}</span>
                    <span className="text-xs text-slate-300">·</span>
                    <span className="text-xs text-slate-400">{item.lines} lines</span>
                    <span className="text-xs text-slate-300">·</span>
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(item.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                  item.prediction.includes('AI') ? 'badge-ai' : item.prediction.includes('HUMAN') ? 'badge-human' : 'badge-mixed'
                }`}>
                  {item.prediction}
                </span>
                <span className="text-sm font-bold text-slate-600">{item.confidence}%</span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
