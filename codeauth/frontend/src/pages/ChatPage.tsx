import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Send, Bot, User, Loader2, Wrench, Sparkles, Database, ChevronDown, Trash2,
} from 'lucide-react';
import { sendChat, getChatSuggestions } from '../api/client';
import type { ChatReply, ChatTurn } from '../types';
import PageHeader from '../components/PageHeader';

const FALLBACK_SUGGESTIONS = [
  'How accurate is the model?',
  'What are the limitations?',
  'How do I analyze a GitHub repo?',
  'Which features matter most?',
];

export default function ChatPage() {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>(FALLBACK_SUGGESTIONS);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    getChatSuggestions()
      .then(r => { if (r?.suggestions?.length) setSuggestions(r.suggestions); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns, busy]);

  const ask = async (raw?: string) => {
    const message = (raw ?? input).trim();
    if (!message || busy) return;

    setTurns(t => [...t, { role: 'user', text: message }]);
    setInput('');
    setBusy(true);

    try {
      const reply: ChatReply = await sendChat(message);
      setTurns(t => [...t, {
        role: 'assistant',
        text: reply.answer,
        intent: reply.intent,
        citations: reply.citations,
        suggestions: reply.suggestions,
      }]);
      if (reply.suggestions?.length) setSuggestions(reply.suggestions);
    } catch (err: any) {
      setTurns(t => [...t, {
        role: 'assistant',
        text: err?.response?.data?.detail
          || 'I could not reach the backend. Is the API running on port 8000?',
        intent: 'error',
      }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      <PageHeader
        eyebrow="Assistant"
        eyebrowIcon={<Bot className="w-[15px] h-[15px]" />}
        title="Ask about your analyses"
        description="Answers are composed from this system's own records and live model output — stored analyses, repository scans, reviewer feedback, and the measured model card."
        actions={
          turns.length > 0 && (
            <button onClick={() => setTurns([])} className="btn-secondary text-xs !py-2 !px-3">
              <Trash2 className="w-3.5 h-3.5" /> Clear
            </button>
          )
        }
      />

      <p className="flex items-start gap-2.5 rounded-2xl border border-coral-100 bg-coral-50 px-4 py-3 text-xs text-[var(--text-body)]">
        <Database className="w-4 h-4 shrink-0 mt-0.5 text-coral-500" />
        <span>
          <strong>No external language model is involved.</strong> Each reply routes your question to
          a tool that reads a real record — the trained classifier, the SQLite tables, or the
          evaluation artifacts — and every answer lists the tools it called. If the data isn't
          there, it says so rather than guessing.
        </span>
      </p>

      {/* ── Transcript ── */}
      <div className="card p-5 min-h-[380px] max-h-[620px] overflow-y-auto space-y-5">
        {turns.length === 0 && !busy && (
          <div className="py-14 text-center">
            <span className="w-14 h-14 rounded-2xl bg-coral-100 text-coral-500 flex items-center justify-center mx-auto mb-4">
              <Bot className="w-7 h-7" />
            </span>
            <p className="font-semibold">Ask a question, or paste code to have it scored</p>
            <p className="mt-1 text-sm text-[var(--text-body)] max-w-md mx-auto">
              Wrap code in a <code>```</code> block and it will run through the classifier and come
              back with a verdict and evidence.
            </p>
          </div>
        )}

        {turns.map((turn, i) => <Turn key={i} turn={turn} />)}

        {busy && (
          <div className="flex items-start gap-3">
            <Avatar role="assistant" />
            <div className="rounded-2xl bg-[var(--surface-sunken)] border border-[var(--line)] px-4 py-3">
              <Loader2 className="w-4 h-4 animate-spin text-coral-500" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* ── Suggestions ── */}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map(s => (
            <button
              key={s}
              onClick={() => ask(s)}
              disabled={busy}
              className="chip hover:border-coral-300 hover:text-coral-600 transition-colors disabled:opacity-50"
            >
              <Sparkles className="w-3 h-3" /> {s}
            </button>
          ))}
        </div>
      )}

      {/* ── Composer ── */}
      <div className="card p-3 flex items-end gap-3">
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            // Enter sends; Shift+Enter is a newline, which matters for pasted code.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              ask();
            }
          }}
          rows={Math.min(8, Math.max(2, input.split('\n').length))}
          placeholder="Ask about accuracy, limitations, a repository scan… or paste code in a ``` block"
          className="field !border-0 !bg-transparent resize-none flex-1 focus:!shadow-none"
        />
        <button onClick={() => ask()} disabled={busy || !input.trim()} className="btn-primary shrink-0">
          <Send className="w-4 h-4" /> Send
        </button>
      </div>
      <p className="text-[0.68rem] text-[var(--text-muted)]">
        Enter sends · Shift+Enter for a new line
      </p>
    </motion.div>
  );
}

function Turn({ turn }: { turn: ChatTurn }) {
  const [showTools, setShowTools] = useState(false);
  const isUser = turn.role === 'user';

  return (
    <div className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <Avatar role={turn.role} />
      <div className={`min-w-0 max-w-[85%] ${isUser ? 'items-end' : ''}`}>
        <div
          className={`rounded-2xl px-4 py-3 ${
            isUser
              ? 'bg-coral-500 text-white'
              : 'bg-[var(--surface-sunken)] border border-[var(--line)]'
          }`}
        >
          {isUser
            ? <pre className="whitespace-pre-wrap font-sans text-sm">{turn.text}</pre>
            : <Markdown text={turn.text} />}
        </div>

        {!isUser && turn.citations && turn.citations.length > 0 && (
          <div className="mt-1.5">
            <button
              onClick={() => setShowTools(!showTools)}
              className="inline-flex items-center gap-1.5 text-[0.68rem] text-[var(--text-muted)] hover:text-coral-600"
            >
              <Wrench className="w-3 h-3" />
              {turn.citations.length} tool call{turn.citations.length === 1 ? '' : 's'}
              {turn.intent && <span className="font-mono">· {turn.intent}</span>}
              <ChevronDown className={`w-3 h-3 transition-transform ${showTools ? 'rotate-180' : ''}`} />
            </button>
            {showTools && (
              <ul className="mt-1.5 space-y-1">
                {turn.citations.map((c, i) => (
                  <li key={i} className="font-mono text-[0.65rem] text-[var(--text-muted)]">
                    {c.tool}({Object.entries(c.parameters).map(([k, v]) => `${k}=${String(v)}`).join(', ')})
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Avatar({ role }: { role: 'user' | 'assistant' }) {
  const isUser = role === 'user';
  return (
    <span
      className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center ${
        isUser ? 'bg-[var(--surface-sunken)] text-[var(--text-body)]' : 'bg-coral-100 text-coral-600'
      }`}
    >
      {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
    </span>
  );
}

/**
 * Minimal renderer for the subset of markdown the backend emits: bold, inline
 * code, bullets, and pipe tables. Deliberately not a full parser — the input is
 * our own templated text, not arbitrary user content.
 */
function Markdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  let table: string[] = [];

  const flushList = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="my-1.5 space-y-1 pl-4 list-disc">
        {list.map((item, i) => <li key={i} className="text-sm">{inline(item)}</li>)}
      </ul>,
    );
    list = [];
  };

  const flushTable = () => {
    if (table.length < 2) { table = []; return; }
    const cells = (row: string) => row.split('|').map(c => c.trim()).filter(Boolean);
    const header = cells(table[0]);
    const body = table.slice(2).map(cells);
    blocks.push(
      <div key={`tb-${blocks.length}`} className="my-2 overflow-x-auto">
        <table className="text-xs border-collapse">
          <thead>
            <tr>{header.map((h, i) => (
              <th key={i} className="text-left px-2.5 py-1.5 border-b border-[var(--line)] font-semibold">{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {body.map((row, ri) => (
              <tr key={ri}>{row.map((c, ci) => (
                <td key={ci} className="px-2.5 py-1.5 border-b border-[var(--line)]">{inline(c)}</td>
              ))}</tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
    table = [];
  };

  for (const line of lines) {
    if (line.trim().startsWith('|')) { flushList(); table.push(line); continue; }
    flushTable();
    if (line.trim().startsWith('- ')) { list.push(line.trim().slice(2)); continue; }
    flushList();
    if (!line.trim()) { blocks.push(<div key={`sp-${blocks.length}`} className="h-1.5" />); continue; }
    blocks.push(<p key={`p-${blocks.length}`} className="text-sm leading-relaxed">{inline(line)}</p>);
  }
  flushList();
  flushTable();

  return <div className="space-y-0.5">{blocks}</div>;
}

/** Bold and inline-code spans. */
function inline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} className="px-1 py-0.5 rounded bg-[var(--surface)] border border-[var(--line)] text-[0.85em]">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
