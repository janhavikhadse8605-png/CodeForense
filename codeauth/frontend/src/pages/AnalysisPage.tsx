import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Editor from '@monaco-editor/react';
import {
  Play, Upload, Trash2, Code2, ChevronDown, Sparkles, AlertTriangle,
} from 'lucide-react';
import { analyzeCode } from '../api/client';
import ResultCard from '../components/ResultCard';
import EvidenceBars from '../components/EvidenceBars';
import CodeHeatmap from '../components/CodeHeatmap';
import AnalysisLoading from '../components/AnalysisLoading';
import FeatureDetails from '../components/FeatureDetails';
import type { AnalysisResult } from '../types';
import { useTheme } from '../hooks/useTheme';

const languages = [
  { value: 'python', label: 'Python' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'java', label: 'Java' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'php', label: 'PHP' },
  { value: 'ruby', label: 'Ruby' },
];

const DEMO_CODE = `def calculate_fibonacci(n):
    """Calculate the nth Fibonacci number using dynamic programming."""
    if n <= 0:
        return 0
    elif n == 1:
        return 1

    dp = [0] * (n + 1)
    dp[1] = 1

    for i in range(2, n + 1):
        dp[i] = dp[i - 1] + dp[i - 2]

    return dp[n]


def find_prime_factors(number):
    """Find all prime factors of a given number."""
    factors = []
    divisor = 2

    while divisor * divisor <= number:
        while number % divisor == 0:
            factors.append(divisor)
            number //= divisor
        divisor += 1

    if number > 1:
        factors.append(number)

    return factors


def merge_sorted_arrays(arr1, arr2):
    """Merge two sorted arrays into a single sorted array."""
    result = []
    i = j = 0

    while i < len(arr1) and j < len(arr2):
        if arr1[i] <= arr2[j]:
            result.append(arr1[i])
            i += 1
        else:
            result.append(arr2[j])
            j += 1

    result.extend(arr1[i:])
    result.extend(arr2[j:])
    return result
`;

const monacoLanguageMap: Record<string, string> = {
  python: 'python', javascript: 'javascript', typescript: 'typescript',
  java: 'java', c: 'c', cpp: 'cpp', csharp: 'csharp',
  go: 'go', rust: 'rust', php: 'php', ruby: 'ruby',
};

export default function AnalysisPage() {
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('python');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingStep, setLoadingStep] = useState(-1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isDark } = useTheme();

  const handleAnalyze = useCallback(async () => {
    if (!code.trim()) {
      setError('Please enter source code before analysis.');
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setResult(null);

    // Animate loading steps
    const stepInterval = setInterval(() => {
      setLoadingStep(prev => {
        if (prev >= 10) { clearInterval(stepInterval); return 10; }
        return prev + 1;
      });
    }, 200);

    try {
      const data = await analyzeCode(code, language);
      clearInterval(stepInterval);
      setLoadingStep(-1);
      setResult(data);
    } catch (err: any) {
      clearInterval(stepInterval);
      setLoadingStep(-1);
      const msg = err?.response?.data?.detail || err?.message || 'Analysis failed. Please try again.';
      setError(msg);
    } finally {
      setIsAnalyzing(false);
    }
  }, [code, language]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setError('File exceeds 10MB limit.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      setCode(ev.target?.result as string);
      // Auto-detect language from extension
      const ext = file.name.split('.').pop()?.toLowerCase();
      const langMap: Record<string, string> = {
        py: 'python', js: 'javascript', ts: 'typescript', jsx: 'javascript',
        tsx: 'typescript', java: 'java', c: 'c', cpp: 'cpp', cs: 'csharp',
        go: 'go', rs: 'rust', php: 'php', rb: 'ruby',
      };
      if (ext && langMap[ext]) setLanguage(langMap[ext]);
    };
    reader.readAsText(file);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Code Analysis</h1>
        <p className="text-sm text-slate-500 mt-1">Paste source code to analyze authorship characteristics</p>
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Left: Editor */}
        <div className="lg:col-span-3 space-y-4">
          {/* Toolbar */}
          <div className="card p-3 flex flex-wrap items-center gap-3">
            <div className="relative">
              <select
                value={language}
                onChange={e => setLanguage(e.target.value)}
                className="appearance-none bg-cream-100 border border-cream-200 text-sm rounded-xl px-4 py-2 pr-8 text-slate-700 font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-coral-400"
              >
                {languages.map(l => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            </div>

            <button onClick={() => fileInputRef.current?.click()} className="btn-secondary text-xs py-2 px-3 flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5" /> Upload
            </button>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} accept=".py,.js,.ts,.jsx,.tsx,.java,.c,.cpp,.cs,.go,.rs,.php,.rb" />

            <button onClick={() => { setCode(DEMO_CODE); setLanguage('python'); }} className="btn-secondary text-xs py-2 px-3 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Load Demo
            </button>

            {code && (
              <button onClick={() => { setCode(''); setResult(null); setError(null); }} className="btn-secondary text-xs py-2 px-3 flex items-center gap-1.5 text-red-500">
                <Trash2 className="w-3.5 h-3.5" /> Clear
              </button>
            )}

            <div className="flex-1" />

            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing || !code.trim()}
              className="btn-primary text-xs py-2.5 px-5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="w-3.5 h-3.5" /> Analyze Code
            </button>
          </div>

          {/* Editor */}
          <div className="card overflow-hidden" style={{ height: '520px' }}>
            <Editor
              height="100%"
              language={monacoLanguageMap[language] || 'plaintext'}
              value={code}
              onChange={(v) => setCode(v || '')}
              theme={isDark ? 'vs-dark' : 'vs'}
              options={{
                fontSize: 14,
                lineNumbers: 'on',
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                padding: { top: 16 },
                renderLineHighlight: 'all',
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                fontLigatures: true,
                bracketPairColorization: { enabled: true },
              }}
            />
          </div>

          {/* Language warning */}
          {language !== 'python' && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-700">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p>Language available for interface support, but current trained model has not been validated for this language. Results may be less reliable.</p>
            </div>
          )}
        </div>

        {/* Right: Results */}
        <div className="lg:col-span-2 space-y-4">
          <AnimatePresence mode="wait">
            {isAnalyzing && (
              <AnalysisLoading key="loading" currentStep={loadingStep} />
            )}

            {error && !isAnalyzing && (
              <motion.div
                key="error"
                className="card p-6 border-red-200"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-red-600 mb-1">Analysis Error</h3>
                    <p className="text-sm text-red-500">{error}</p>
                  </div>
                </div>
              </motion.div>
            )}

            {result && !isAnalyzing && (
              <motion.div
                key="results"
                className="space-y-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <ResultCard result={result} />
                <div className="card p-6">
                  <EvidenceBars evidence={result.evidence} prediction={result.prediction} />
                </div>
                {result.segments && result.segments.length > 0 && (
                  <div className="card p-6">
                    <CodeHeatmap segments={result.segments} code={code} />
                  </div>
                )}
                {result.feature_details && Object.keys(result.feature_details).length > 0 && (
                  <div className="card p-6">
                    <FeatureDetails details={result.feature_details} />
                  </div>
                )}
              </motion.div>
            )}

            {!isAnalyzing && !result && !error && (
              <motion.div
                key="placeholder"
                className="card p-8 text-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <div className="w-16 h-16 rounded-2xl bg-cream-200 flex items-center justify-center mx-auto mb-4">
                  <Code2 className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="font-semibold text-slate-700 mb-2">Ready to Analyze</h3>
                <p className="text-sm text-slate-500">Paste code or upload a file, then click "Analyze Code" to start.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
