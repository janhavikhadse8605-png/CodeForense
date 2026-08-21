import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  CircleHelp, Code2, GitBranch, TrendingUp, Fingerprint, BarChart3,
  Search, MessageSquare, FileText, FolderOpen, Clock, Settings,
  ChevronRight, Cpu, ShieldCheck, TriangleAlert, BookOpen, Mail,
} from 'lucide-react';
import { getModelInfo } from '../api/client';
import ModelWarnings from '../components/ModelWarnings';
import type { ModelInfo } from '../types';

const capabilities = [
  { path: '/analyze', icon: Code2, title: 'Code analysis', text: 'Paste or upload a snippet for a full authorship assessment with ablation-based evidence, a function-level heatmap, and the 41 extracted features.' },
  { path: '/repository', icon: GitBranch, title: 'Repository analysis', text: 'Upload a ZIP archive to scan every supported source file and browse results through an annotated file tree.' },
  { path: '/evolution', icon: TrendingUp, title: 'Code evolution', text: 'Compare two or more versions of the same file to track authorship drift and flag sudden stylometric shifts.' },
  { path: '/similarity', icon: Fingerprint, title: 'Similarity search', text: 'Compare code in the 64-dimensional fusion embedding space to find structurally similar samples.' },
  { path: '/evaluation', icon: BarChart3, title: 'Model evaluation', text: 'Upload a labelled CSV to measure accuracy, precision, recall, F1, and the confusion matrix on your own data.' },
  { path: '/investigation', icon: Search, title: 'Investigation', text: 'Run an orchestrated pass over stored analyses and repositories to produce a forensic summary with a tool log.' },
  { path: '/feedback', icon: MessageSquare, title: 'Reviewer feedback', text: 'Record expert agreement or disagreement with a prediction and track the running agreement rate.' },
  { path: '/reports', icon: FileText, title: 'Audit reports', text: 'Generate a formal dossier for any analysis and export it as JSON, CSV, or a printable PDF.' },
  { path: '/projects', icon: FolderOpen, title: 'Saved projects', text: 'Group related codebases so repeated reviews stay organised.' },
  { path: '/history', icon: Clock, title: 'Analysis history', text: 'Revisit every previous analysis with its full evidence breakdown.' },
  { path: '/settings', icon: Settings, title: 'Settings', text: 'Inspect the loaded model, switch appearance, and review the backend connection.' },
];

const quickStart = [
  { step: '1', text: 'Start the backend: uvicorn app.main:app --reload --port 8000' },
  { step: '2', text: 'Confirm /api/health reports model_status: ready.' },
  { step: '3', text: 'Open Analyze Code, paste a snippet, and pick its language.' },
  { step: '4', text: 'Read the verdict alongside its evidence bars — not in isolation.' },
];

const faqs = [
  {
    q: 'Why does a page say the model is unavailable?',
    a: 'The backend loads its checkpoint from MODEL_DIR (default ./model_files). If authorship_hybrid_model.pt or feature_scaler.pkl is missing there, analysis endpoints return 503. Copy both artifacts into backend/model_files and restart. Note that the checkpoint is tracked with Git LFS, so git lfs pull is required to fetch the real weights rather than the pointer file.',
  },
  {
    q: 'How should a confidence score be read?',
    a: 'As a strength-of-pattern signal, never as proof. A high score means the input closely matches patterns the model associates with one class, which is not the same as knowing who wrote it.',
  },
  {
    q: 'What do the evidence bars mean?',
    a: 'Each bar shows how much the prediction moves when one feature group is zeroed out, normalised across the six groups. They are relative contributions, not probabilities, and they always sum to 100%.',
  },
  {
    q: 'Is submitted code ever executed?',
    a: 'No. Input is parsed statically with the Python AST and tokenizers. Nothing you upload is run.',
  },
  {
    q: 'Which languages are supported?',
    a: 'Python gets full AST analysis. C, C++, C#, Java, JavaScript, TypeScript, Go, Rust, PHP, and Ruby use heuristic extraction, which is less precise for structure and nesting.',
  },
];

export default function HelpPage() {
  const navigate = useNavigate();
  const [model, setModel] = useState<ModelInfo | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    getModelInfo().then(setModel).catch(() => {});
  }, []);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <header>
        <p className="eyebrow text-coral-500"><CircleHelp className="w-[15px] h-[15px]" /> Help & Support</p>
        <h1 className="mt-1.5 text-2xl md:text-3xl font-bold tracking-tight">How CodeAuth works</h1>
        <p className="mt-2 text-[var(--text-body)] max-w-2xl leading-relaxed">
          A guide to every analysis surface, how to read a result responsibly, and what to do when
          something is not working.
        </p>
      </header>

      {/* ── Quick start ── */}
      <section className="card p-6">
        <h2 className="flex items-center gap-2 text-base font-semibold mb-4">
          <BookOpen className="w-[18px] h-[18px] text-coral-500" /> Quick start
        </h2>
        <ol className="space-y-3">
          {quickStart.map(s => (
            <li key={s.step} className="flex items-start gap-3">
              <span className="w-6 h-6 shrink-0 rounded-full bg-coral-100 text-coral-600 text-xs font-bold flex items-center justify-center">
                {s.step}
              </span>
              <span className="text-sm text-[var(--text-body)] leading-relaxed pt-0.5">{s.text}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Capability index ── */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold">What you can do</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {capabilities.map(({ path, icon: Icon, title, text }) => (
            <button
              key={path}
              onClick={() => navigate(path)}
              className="card p-5 text-left group hover:border-coral-200 transition-colors"
            >
              <div className="flex items-start gap-3.5">
                <span className="w-10 h-10 shrink-0 rounded-xl bg-coral-100 text-coral-500 flex items-center justify-center">
                  <Icon className="w-[18px] h-[18px]" />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-[0.95rem] flex items-center gap-1.5">
                    {title}
                    <ChevronRight className="w-4 h-4 text-[var(--text-muted)] group-hover:translate-x-0.5 transition-transform" />
                  </p>
                  <p className="mt-1 text-[0.83rem] leading-relaxed text-[var(--text-body)]">{text}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* ── Methodology ── */}
      <section className="card p-6">
        <h2 className="flex items-center gap-2 text-base font-semibold mb-4">
          <Cpu className="w-[18px] h-[18px] text-coral-500" /> Model and methodology
        </h2>
        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2.5 text-sm">
          <Row label="Encoder" value={model?.architecture?.encoder ?? 'CodeBERT (RoBERTa-base)'} />
          <Row label="Fusion" value={model?.architecture?.fusion ?? 'Linear(864→256) → ReLU → Dropout → Linear(256→64)'} />
          <Row label="Classifier" value={model?.architecture?.classifier ?? 'Linear(64→2)'} />
          <Row label="Feature groups" value={(model?.feature_groups?.length ?? 6) + ' groups, 41 features'} />
          <Row label="Max token length" value={String(model?.max_length ?? 256)} />
          <Row label="Device" value={model?.device ?? 'unknown'} />
        </div>
        <p className="mt-4 text-[0.83rem] leading-relaxed text-[var(--text-body)]">
          Code is tokenized for the transformer branch while 41 stylometric, structural, and complexity
          features are extracted in parallel across six groups. The two representations are concatenated
          and fused before classification. Evidence is then derived by ablating one feature group at a time
          and measuring how far the prediction moves.
        </p>
      </section>

      {/* ── Measured limitations, straight from the evaluation scripts ── */}
      <ModelWarnings />

      {/* ── Limits ── */}
      <section className="card p-6 border-amber-300/60 bg-amber-50/40">
        <h2 className="flex items-center gap-2 text-base font-semibold mb-3">
          <TriangleAlert className="w-[18px] h-[18px] text-amber-600" /> Limitations you should not ignore
        </h2>
        <ul className="space-y-2.5 text-sm text-[var(--text-body)]">
          {[
            'Authorship analysis is probabilistic. A result indicates model-associated patterns, never proof of who wrote the code.',
            'Do not use a single verdict as the basis for an academic-misconduct or employment decision. Pair it with review by a person.',
            'Short snippets carry little signal. Very short inputs should be treated as inconclusive regardless of the confidence shown.',
            'Non-Python languages rely on regex heuristics for structure, so their feature values are noisier than Python.',
            'A model trained on one code distribution degrades on another. Re-measure on your own labelled data via Model Evaluation before trusting it.',
          ].map(t => (
            <li key={t} className="flex gap-2.5">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
              {t}
            </li>
          ))}
        </ul>
      </section>

      {/* ── FAQ ── */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Frequently asked</h2>
        {faqs.map((f, i) => (
          <div key={f.q} className="card overflow-hidden">
            <button
              onClick={() => setOpenFaq(openFaq === i ? null : i)}
              className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-[var(--surface-soft)] transition-colors"
            >
              <span className="text-sm font-medium">{f.q}</span>
              <ChevronRight className={`w-4 h-4 shrink-0 text-[var(--text-muted)] transition-transform ${openFaq === i ? 'rotate-90' : ''}`} />
            </button>
            {openFaq === i && (
              <p className="px-4 pb-4 text-[0.85rem] leading-relaxed text-[var(--text-body)]">{f.a}</p>
            )}
          </div>
        ))}
      </section>

      {/* ── Contact ── */}
      <section className="card p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Mail className="w-[18px] h-[18px] text-coral-500" /> Still stuck?
          </h2>
          <p className="mt-1 text-sm text-[var(--text-body)]">
            Check the backend logs and <code className="text-coral-600">/api/health</code> first — they name the
            exact failing step during model load.
          </p>
        </div>
        <button onClick={() => navigate('/settings')} className="btn-secondary shrink-0">
          Open diagnostics <ChevronRight className="w-4 h-4" />
        </button>
      </section>
    </motion.div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-[var(--line)] last:border-0">
      <span className="text-[var(--text-muted)] shrink-0">{label}</span>
      <span className="font-medium text-right break-words">{value}</span>
    </div>
  );
}
