import { useState } from 'react';
import { motion } from 'framer-motion';
import { Fingerprint, Search, AlertCircle, Info, FileCode } from 'lucide-react';
import { analyzeSimilarity } from '../api/client';

const SAMPLE_QUERY = `def binary_search(array, target):
    low = 0
    high = len(array) - 1
    while low <= high:
        mid = (low + high) // 2
        if array[mid] == target:
            return mid
        elif array[mid] < target:
            low = mid + 1
        else:
            high = mid - 1
    return -1`;

export default function SimilarityPage() {
  const [code, setCode] = useState(SAMPLE_QUERY);
  const [language] = useState('python');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!code.trim()) {
      setError('Please provide code to search for similar reference snippets.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await analyzeSimilarity(code, language);
      setResults(res);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Similarity search failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Code Embedding & Similarity Analysis</h1>
        <p className="text-sm text-slate-500 mt-1">
          Compare submitted code embeddings against reference samples in latent representation space.
        </p>
      </div>

      <div className="card p-4 bg-amber-50/50 border-amber-200 flex items-start gap-2.5 text-xs text-amber-800">
        <Info className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
        <p>
          <span className="font-semibold">Methodological Disclaimer:</span> Similarity indicates structural and semantic resemblance in CodeBERT fusion embedding space, not definitive proof of common authorship.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Input area */}
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Query Code</h3>
            <button
              onClick={() => setCode(SAMPLE_QUERY)}
              className="text-xs text-coral-600 hover:text-coral-700 font-medium"
            >
              Load Sample
            </button>
          </div>
          <textarea
            value={code}
            onChange={e => setCode(e.target.value)}
            rows={14}
            className="w-full font-mono text-xs p-3.5 rounded-xl bg-cream-50 border border-cream-200 focus:ring-2 focus:ring-coral-400 focus:outline-none resize-none"
            placeholder="Paste code snippet to compute 64-dim fusion embedding..."
          />
          <button
            onClick={handleSearch}
            disabled={loading || !code.trim()}
            className="btn-primary w-full justify-center disabled:opacity-50"
          >
            <Search className="w-4 h-4" /> {loading ? 'Extracting Embeddings & Comparing...' : 'Compute Similarity'}
          </button>
        </div>

        {/* Results area */}
        <div className="space-y-4">
          {error && (
            <div className="card p-4 border-red-200 text-red-600 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> {error}
            </div>
          )}

          {results ? (
            <div className="space-y-4">
              <div className="card p-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-700">Similarity Results</h3>
                  <p className="text-xs text-slate-400">Database has {results.reference_count} reference samples</p>
                </div>
                <span className="text-xs bg-cream-100 text-slate-600 px-3 py-1 rounded-full font-medium">
                  {results.matches?.length || 0} Matches Found
                </span>
              </div>

              {results.matches && results.matches.length > 0 ? (
                <div className="space-y-3">
                  {results.matches.map((m: any, idx: number) => (
                    <div key={idx} className="card p-4 space-y-2 hover:shadow-md transition-shadow">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FileCode className="w-4 h-4 text-slate-400" />
                          <span className="text-xs font-mono text-slate-700">Sample #{idx + 1} ({m.language || 'python'})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-coral-600">{m.similarity}% Match</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-cream-200 text-slate-700 uppercase font-semibold">
                            {m.label}
                          </span>
                        </div>
                      </div>
                      {m.snippet && (
                        <pre className="font-mono text-[11px] p-2.5 rounded-lg bg-cream-50 text-slate-600 overflow-x-auto">
                          {m.snippet}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="card p-8 text-center text-slate-500 text-sm">
                  No other reference samples available in database yet. Analyzing code automatically saves embeddings for future cross-comparisons.
                </div>
              )}
            </div>
          ) : (
            <div className="card p-12 text-center text-slate-400 space-y-2">
              <Fingerprint className="w-10 h-10 mx-auto text-slate-300" />
              <p className="text-sm">Click "Compute Similarity" to analyze vector distance.</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
