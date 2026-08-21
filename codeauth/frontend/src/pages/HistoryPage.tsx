import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Code2, Clock, Search, X, Loader2, History as HistoryIcon } from 'lucide-react';
import { getHistory, getAnalysisDetail } from '../api/client';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/PageHeader';
import EvidenceBars from '../components/EvidenceBars';
import CodeHeatmap from '../components/CodeHeatmap';
import FeatureDetails from '../components/FeatureDetails';
import type { HistoryItem, AnalysisDetail, SegmentResult } from '../types';

type Filter = 'all' | 'ai' | 'human';

/** The history detail endpoint omits heatmap_color, so derive it the same way the analyze route does. */
function withHeatmapColor(segments: AnalysisDetail['segments']): SegmentResult[] {
  return segments.map(s => ({
    ...s,
    heatmap_color: s.confidence < 60
      ? 'yellow'
      : s.prediction.includes('AI')
        ? 'red'
        : s.prediction.includes('HUMAN')
          ? 'green'
          : 'yellow',
  }));
}

export default function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState<AnalysisDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    getHistory(100, 0)
      .then(data => setItems(data.items || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      setDetail(await getAnalysisDetail(id));
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(i => {
      const matchesFilter =
        filter === 'all' ||
        (filter === 'ai' && i.prediction.includes('AI')) ||
        (filter === 'human' && i.prediction.includes('HUMAN'));
      const matchesQuery =
        !q ||
        i.language.toLowerCase().includes(q) ||
        (i.code_snippet || '').toLowerCase().includes(q);
      return matchesFilter && matchesQuery;
    });
  }, [items, filter, query]);

  if (loading) {
    return (
      <div className="py-24 text-center">
        <Loader2 className="w-7 h-7 text-coral-500 mx-auto animate-spin" />
        <p className="mt-3 text-sm text-[var(--text-muted)]">Loading history…</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title="No analyses yet"
        description="Paste a code snippet to start your first authorship analysis."
        actionLabel="Analyze Code"
        onAction={() => navigate('/analyze')}
      />
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <PageHeader
        eyebrow="Analysis History"
        eyebrowIcon={<HistoryIcon className="w-[15px] h-[15px]" />}
        title="Past analyses"
        description={`${items.length} analys${items.length === 1 ? 'is' : 'es'} recorded. Select one to reopen its full evidence breakdown.`}
      />

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--surface-sunken)] border border-[var(--line)]">
          {(['all', 'human', 'ai'] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
                filter === f ? 'bg-[var(--surface)] text-coral-600 shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-body)]'
              }`}
            >
              {f === 'all' ? 'All' : f === 'ai' ? 'AI-associated' : 'Human-associated'}
            </button>
          ))}
        </div>
        <div className="relative ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search language or snippet..."
            className="field !py-2 !pl-9 !text-xs w-full sm:w-64"
          />
        </div>
      </div>

      {/* ── List ── */}
      <div className="space-y-3">
        {filtered.map((item, i) => (
          <motion.button
            key={item.id}
            className="card p-4 w-full text-left"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(0.03 * i, 0.3) }}
            onClick={() => openDetail(item.id)}
          >
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-3 min-w-0">
                <Code2 className="w-5 h-5 text-[var(--text-muted)] shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium truncate">
                    {item.code_snippet || 'Code snippet'}
                  </span>
                  <span className="flex items-center gap-2 mt-0.5 text-xs text-[var(--text-muted)]">
                    <span className="capitalize">{item.language}</span>
                    <span>·</span>
                    <span>{item.lines} lines</span>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(item.created_at).toLocaleString()}
                    </span>
                  </span>
                </span>
              </span>
              <span className="flex items-center gap-3 shrink-0">
                <span className={
                  item.prediction.includes('MIXED') ? 'badge-mixed !text-[0.68rem]'
                    : item.prediction.includes('AI') ? 'badge-ai !text-[0.68rem]'
                      : 'badge-human !text-[0.68rem]'
                }>
                  {item.prediction}
                </span>
                <span className="text-sm font-bold w-12 text-right">{item.confidence}%</span>
              </span>
            </div>
          </motion.button>
        ))}
        {filtered.length === 0 && (
          <div className="card p-10 text-center text-sm text-[var(--text-muted)]">
            No analyses match these filters.
          </div>
        )}
      </div>

      {/* ── Detail drawer ── */}
      <AnimatePresence>
        {(detail || detailLoading) && (
          <motion.div
            className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { setDetail(null); setDetailLoading(false); }}
          >
            <motion.aside
              className="w-full max-w-2xl h-full overflow-y-auto bg-[var(--surface-soft)] p-6 space-y-5"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 260 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold">Analysis detail</h2>
                  {detail && (
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      {detail.language} · {new Date(detail.created_at).toLocaleString()}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => { setDetail(null); setDetailLoading(false); }}
                  className="icon-btn shrink-0"
                  aria-label="Close detail"
                >
                  <X className="w-[18px] h-[18px]" />
                </button>
              </div>

              {detailLoading && (
                <div className="py-20 text-center">
                  <Loader2 className="w-7 h-7 text-coral-500 mx-auto animate-spin" />
                </div>
              )}

              {detail && (
                <>
                  <div className="card p-5 text-center">
                    <span className={
                      detail.prediction.includes('MIXED') ? 'badge-mixed'
                        : detail.prediction.includes('AI') ? 'badge-ai' : 'badge-human'
                    }>
                      {detail.prediction}
                    </span>
                    <p className="mt-3 text-3xl font-bold">{detail.confidence}%</p>
                    <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Confidence</p>
                    <div className="grid grid-cols-2 gap-3 mt-4">
                      <div className="rounded-xl bg-green-50 p-3">
                        <p className="text-[0.7rem] text-[var(--text-muted)]">Human</p>
                        <p className="text-lg font-bold text-green-600">{detail.human_probability}%</p>
                      </div>
                      <div className="rounded-xl bg-red-50 p-3">
                        <p className="text-[0.7rem] text-[var(--text-muted)]">AI</p>
                        <p className="text-lg font-bold text-red-500">{detail.ai_probability}%</p>
                      </div>
                    </div>
                  </div>

                  {detail.evidence && Object.keys(detail.evidence).length > 0 && (
                    <div className="card p-5">
                      <EvidenceBars evidence={detail.evidence} prediction={detail.prediction} />
                    </div>
                  )}

                  {detail.segments?.length > 0 && (
                    <div className="card p-5">
                      <CodeHeatmap segments={withHeatmapColor(detail.segments)} code={detail.code_snippet} />
                    </div>
                  )}

                  {detail.feature_details && Object.keys(detail.feature_details).length > 0 && (
                    <div className="card p-5">
                      <FeatureDetails details={detail.feature_details} />
                    </div>
                  )}

                  <p className="text-[0.7rem] leading-relaxed text-[var(--text-muted)] italic">
                    Stored snippets are truncated to the first 10,000 characters, so a long file's heatmap may
                    end early.
                  </p>
                </>
              )}
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
