import { ChevronDown } from 'lucide-react';

const LANGUAGES = [
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

interface LanguageSelectProps {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  id?: string;
}

export default function LanguageSelect({ value, onChange, className = '', id }: LanguageSelectProps) {
  return (
    <div className={`relative ${className}`}>
      <select
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="field !py-2 !text-xs pr-8 cursor-pointer font-medium"
        aria-label="Source language"
      >
        {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)] pointer-events-none" />
    </div>
  );
}

/** Shown when the selected language is outside the model's validated target. */
export function LanguageCaveat({ language }: { language: string }) {
  if (language === 'python') return null;
  return (
    <p className="text-[0.7rem] leading-relaxed text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
      This language is parsed with regex heuristics rather than a full AST, and the checkpoint was validated on
      Python. Treat the result as weaker evidence.
    </p>
  );
}
