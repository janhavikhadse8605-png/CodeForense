import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ThumbsUp, ThumbsDown, CheckCircle2, Clock } from 'lucide-react';
import { getFeedback, submitFeedback } from '../api/client';
import type { FeedbackData } from '../types';

export default function FeedbackPage() {
  const [feedbackData, setFeedbackData] = useState<FeedbackData | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewerLabel, setReviewerLabel] = useState<'correct' | 'incorrect'>('correct');
  const [actualAuthorship, setActualAuthorship] = useState('human');
  const [prediction] = useState('AI-LIKELY');
  const [confidence] = useState(88);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const fetchFeedback = () => {
    getFeedback()
      .then(res => setFeedbackData(res))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchFeedback();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await submitFeedback({
        prediction,
        confidence,
        reviewer_label: reviewerLabel,
        actual_authorship: actualAuthorship,
        comment,
      });
      setSubmitted(true);
      setComment('');
      setTimeout(() => setSubmitted(false), 3000);
      fetchFeedback();
    } catch {}
    finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Reviewer Feedback Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">
          Collect human-in-the-loop validation, track model accuracy against expert reviews, and curate active learning datasets.
        </p>
      </div>

      {/* Stats row */}
      {feedbackData?.stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card p-4 text-center">
            <p className="text-xs text-slate-400 font-semibold uppercase">Total Reviewed</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{feedbackData.stats.total_reviewed}</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-xs text-slate-400 font-semibold uppercase">Correct Predictions</p>
            <p className="text-2xl font-bold text-green-600 mt-1">{feedbackData.stats.correct_predictions}</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-xs text-slate-400 font-semibold uppercase">Incorrect Predictions</p>
            <p className="text-2xl font-bold text-red-500 mt-1">{feedbackData.stats.incorrect_predictions}</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-xs text-slate-400 font-semibold uppercase">Expert Agreement Rate</p>
            <p className="text-2xl font-bold text-coral-600 mt-1">{feedbackData.stats.agreement_rate}%</p>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Submit feedback form */}
        <div className="card p-6 space-y-4">
          <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
            Submit Expert Review
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">Was Model Prediction Accurate?</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setReviewerLabel('correct')}
                  className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                    reviewerLabel === 'correct'
                      ? 'bg-green-50 border-green-500 text-green-700'
                      : 'border-cream-200 text-slate-600 hover:bg-cream-50'
                  }`}
                >
                  <ThumbsUp className="w-3.5 h-3.5" /> Correct
                </button>
                <button
                  type="button"
                  onClick={() => setReviewerLabel('incorrect')}
                  className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                    reviewerLabel === 'incorrect'
                      ? 'bg-red-50 border-red-500 text-red-700'
                      : 'border-cream-200 text-slate-600 hover:bg-cream-50'
                  }`}
                >
                  <ThumbsDown className="w-3.5 h-3.5" /> Incorrect
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">True Ground Truth Authorship</label>
              <select
                value={actualAuthorship}
                onChange={e => setActualAuthorship(e.target.value)}
                className="w-full text-xs p-2.5 rounded-xl border border-cream-200 bg-cream-50 focus:outline-none focus:ring-2 focus:ring-coral-400"
              >
                <option value="human">Human Authored</option>
                <option value="ai">AI Generated</option>
                <option value="mixed">Mixed Authorship</option>
                <option value="unknown">Unknown / Ambiguous</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Auditor Notes & Observations</label>
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Details regarding why this prediction was confirmed or rejected..."
                rows={4}
                className="w-full text-xs p-2.5 rounded-xl border border-cream-200 bg-cream-50 focus:outline-none focus:ring-2 focus:ring-coral-400 resize-none"
              />
            </div>

            {submitted && (
              <div className="p-2.5 rounded-xl bg-green-50 border border-green-200 text-green-700 text-xs flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Feedback saved successfully.
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="btn-primary w-full justify-center text-xs py-2.5"
            >
              {submitting ? 'Submitting...' : 'Record Review'}
            </button>
          </form>
        </div>

        {/* Feedback log */}
        <div className="lg:col-span-2 space-y-3">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Review History & Audit Trail
          </h3>
          {loading ? (
            <div className="text-center py-10 text-xs text-slate-400">Loading feedback log...</div>
          ) : !feedbackData?.items || feedbackData.items.length === 0 ? (
            <div className="card p-10 text-center text-slate-500 text-xs">
              No human reviews recorded yet. Submit reviews to establish an empirical benchmark log.
            </div>
          ) : (
            <div className="space-y-3">
              {feedbackData.items.map((item, idx) => (
                <div key={item.id || idx} className="card p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                        item.reviewer_label === 'correct'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {item.reviewer_label.toUpperCase()}
                      </span>
                      <span className="text-xs font-semibold text-slate-700">
                        Target: {item.prediction} ({item.confidence}%)
                      </span>
                    </div>
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(item.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  {item.comment && (
                    <p className="text-xs text-slate-600 bg-cream-50 p-2.5 rounded-lg border border-cream-100">
                      "{item.comment}"
                    </p>
                  )}

                  <div className="text-[11px] text-slate-400">
                    Assessed Ground Truth: <span className="font-medium text-slate-700 capitalize">{item.actual_authorship}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
