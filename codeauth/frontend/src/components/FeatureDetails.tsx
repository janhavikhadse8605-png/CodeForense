import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Tag, Braces, MessageSquare, Repeat, BarChart3, AlignLeft } from 'lucide-react';

interface FeatureDetailsProps {
  details: Record<string, Record<string, number | string>>;
}

const groupConfig: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  naming: { icon: <Tag className="w-4 h-4" />, label: 'Naming Analysis', color: 'coral' },
  structure: { icon: <Braces className="w-4 h-4" />, label: 'Structural Analysis', color: 'blue' },
  comments: { icon: <MessageSquare className="w-4 h-4" />, label: 'Comment Analysis', color: 'green' },
  repetition: { icon: <Repeat className="w-4 h-4" />, label: 'Repetition Analysis', color: 'amber' },
  complexity: { icon: <BarChart3 className="w-4 h-4" />, label: 'Complexity Analysis', color: 'purple' },
  formatting: { icon: <AlignLeft className="w-4 h-4" />, label: 'Formatting Analysis', color: 'teal' },
};

const detailLabels: Record<string, string> = {
  identifier_count: 'Identifier count', avg_identifier_length: 'Avg identifier length',
  identifier_length_variance: 'Length variance', snake_case_ratio: 'snake_case ratio',
  camelCase_ratio: 'camelCase ratio', uppercase_ratio: 'UPPERCASE ratio',
  single_char_ratio: 'Single-char ratio', naming_consistency: 'Naming consistency',
  ast_node_count: 'AST node count', function_count: 'Functions', class_count: 'Classes',
  loop_count: 'Loops', conditional_count: 'Conditionals', branch_count: 'Branches',
  return_count: 'Returns', exception_handling_count: 'Exception handling',
  max_nesting_depth: 'Max nesting depth', lines_of_code: 'Lines of code',
  comment_count: 'Comment count', comment_code_ratio: 'Comment/code ratio',
  avg_comment_length: 'Avg comment length', docstring_count: 'Docstrings',
  comment_words: 'Comment words', comments_per_function: 'Comments/function',
  duplicate_line_ratio: 'Duplicate line ratio', repeated_token_ratio: 'Repeated token ratio',
  repeated_statement_count: 'Repeated statements', repeated_block_count: 'Repeated blocks',
  repetition_score: 'Repetition score',
  avg_complexity: 'Avg complexity', max_complexity: 'Max complexity',
  boolean_expression_count: 'Boolean expressions', avg_nesting_depth: 'Avg nesting',
  avg_line_length: 'Avg line length', line_length_variance: 'Line length variance',
  indentation_consistency: 'Indentation consistency', blank_line_ratio: 'Blank line ratio',
  whitespace_consistency: 'Whitespace consistency', formatting_score: 'Formatting score',
};

export default function FeatureDetails({ details }: FeatureDetailsProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Feature Details</h3>
      {Object.entries(details).map(([group, values]) => {
        const config = groupConfig[group];
        if (!config) return null;

        return (
          <div key={group} className="rounded-xl border border-cream-200 overflow-hidden">
            <button
              onClick={() => setExpanded(expanded === group ? null : group)}
              className="w-full flex items-center justify-between p-3.5 hover:bg-cream-50 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-slate-500">{config.icon}</span>
                <span className="text-sm font-medium text-slate-700">{config.label}</span>
              </div>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expanded === group ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence>
              {expanded === group && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 grid grid-cols-2 gap-x-4 gap-y-2">
                    {Object.entries(values).map(([key, val]) => (
                      <div key={key} className="flex justify-between items-center py-1.5 border-b border-cream-100 last:border-0">
                        <span className="text-xs text-slate-500">{detailLabels[key] || key}</span>
                        <span className="text-xs font-semibold text-slate-700">
                          {typeof val === 'number' ? (val % 1 === 0 ? val : val.toFixed(4)) : val}
                        </span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
