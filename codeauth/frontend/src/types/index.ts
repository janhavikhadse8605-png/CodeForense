/** Core types for CodeAuth frontend. */

export interface AnalysisResult {
  id: string;
  prediction: string;
  confidence: number;
  human_probability: number;
  ai_probability: number;
  evidence: Record<string, number>;
  statistics: {
    lines: number;
    non_empty_lines?: number;
    functions: number;
    classes: number;
    complexity: number;
  };
  feature_details: Record<string, Record<string, number | string>>;
  segments: SegmentResult[];
  mixed_authorship?: MixedAuthorship;
  language: string;
  created_at: string;
}

export interface SegmentResult {
  name: string;
  segment_type: string;
  start_line: number;
  end_line: number;
  prediction: string;
  confidence: number;
  human_probability: number;
  ai_probability: number;
  evidence: Record<string, number>;
  heatmap_color: 'red' | 'green' | 'yellow';
}

export interface MixedAuthorship {
  overall_prediction: string;
  overall_confidence: number;
  human_ratio: number;
  ai_ratio: number;
  is_mixed: boolean;
  segments: SegmentResult[];
}

/** Detail payload from GET /api/history/{id} — segments arrive without a heatmap colour. */
export interface AnalysisDetail {
  id: string;
  code_snippet: string;
  language: string;
  prediction: string;
  confidence: number;
  human_probability: number;
  ai_probability: number;
  evidence: Record<string, number>;
  statistics: Record<string, number>;
  feature_details: Record<string, Record<string, number | string>>;
  segments: Array<Omit<SegmentResult, 'heatmap_color'>>;
  created_at: string;
}

export interface HistoryItem {
  id: string;
  code_snippet: string;
  language: string;
  prediction: string;
  confidence: number;
  human_probability: number;
  ai_probability: number;
  lines: number;
  created_at: string;
}

export interface DashboardStats {
  total_analyses: number;
  ai_associated: number;
  human_associated: number;
  mixed: number;
  avg_confidence: number;
  recent_analyses: Array<{
    id: string;
    prediction: string;
    confidence: number;
    language: string;
    created_at: string;
  }>;
}

export interface RepositoryResult {
  id: string;
  name: string;
  files_analyzed: number;
  functions_analyzed: number;
  human_ratio: number;
  ai_ratio: number;
  mixed_ratio: number;
  file_results: FileResult[];
  file_tree: FileTreeNode;
  created_at: string;
}

export interface FileResult {
  file_path: string;
  language: string;
  prediction: string;
  confidence: number;
  ai_evidence: number;
  function_count: number;
  lines: number;
}

export interface FileTreeNode {
  name: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
  status?: string;
  prediction?: string;
  confidence?: number;
}

export interface EvaluationResult {
  available: boolean;
  id?: string;
  dataset_size?: number;
  accuracy?: number;
  precision?: number;
  recall?: number;
  f1_macro?: number;
  f1_weighted?: number;
  roc_auc?: number | null;
  confusion_matrix?: { matrix: number[][]; labels: string[] };
  class_distribution?: Record<string, number>;
  warnings?: string[];
  message?: string;
  created_at?: string;
}

export interface FeedbackData {
  stats: {
    total_reviewed: number;
    correct_predictions: number;
    incorrect_predictions: number;
    agreement_rate: number;
  };
  items: Array<{
    id: string;
    analysis_id: string;
    prediction: string;
    confidence: number;
    reviewer_label: string;
    actual_authorship: string;
    comment: string;
    created_at: string;
  }>;
}

export interface ProjectData {
  id: string;
  name: string;
  description: string;
  repository_url: string;
  overall_prediction: string;
  last_analyzed: string | null;
  file_count: number;
  created_at: string;
}

export interface ReportData {
  id: string;
  title: string;
  report_type: string;
  format: string;
  content: Record<string, unknown>;
  created_at: string;
}

export interface ModelInfo {
  model_name: string;
  base_model: string;
  architecture: {
    encoder: string;
    feature_mlps: string[];
    fusion: string;
    classifier: string;
  };
  classes: string[];
  mixed_methodology: string;
  feature_groups: string[];
  feature_dimensions: Record<string, number>;
  max_length: number;
  test_accuracy?: number;
  trained_timestamp?: string;
  is_ready: boolean;
  device: string;
}


/* ─── GitHub ─────────────────────────────────────── */

export interface GitHubStatus {
  reachable: boolean;
  token_configured: boolean;
  rate_limit?: number;
  rate_remaining?: number;
  note?: string;
  error?: string;
}

export interface GitHubRepoMeta {
  full_name: string;
  description: string | null;
  default_branch: string;
  language: string | null;
  size_kb: number;
  stars: number;
  forks: number;
  is_private: boolean;
  is_fork: boolean;
  pushed_at: string | null;
  license: string | null;
  html_url: string;
}

export interface GitHubCommit {
  sha: string;
  short_sha: string;
  author_name: string | null;
  date: string | null;
  message: string;
  html_url: string;
}

export interface GitHubInspectResult {
  repository: GitHubRepoMeta;
  ref: string;
  commits: GitHubCommit[];
  commit_count_sampled: number;
  distinct_authors: number;
  commits_per_author: Record<string, number>;
  rate_remaining: number | null;
}

export interface GitHubAnalyzeResult extends RepositoryResult {
  repository: GitHubRepoMeta;
  ref: string;
  files_skipped: number;
  truncated: boolean;
  commits: GitHubCommit[];
  source: string;
}

export interface GitHubEvolutionPoint {
  sha: string;
  short_sha: string;
  author_name: string | null;
  date: string | null;
  message: string;
  html_url: string;
  prediction: string;
  confidence: number;
  ai_probability: number;
  human_probability: number;
  evidence: Record<string, number>;
  lines: number;
  engine: string;
}

export interface GitHubEvolutionShift {
  from_sha: string;
  to_sha: string;
  from_author: string | null;
  to_author: string | null;
  date: string | null;
  verdict_changed: boolean;
  from_prediction: string;
  to_prediction: string;
  ai_probability_delta: number;
  evidence_shift: number;
  description: string;
}

export interface GitHubEvolutionResult {
  repository: GitHubRepoMeta;
  file_path: string;
  language: string;
  revisions_analyzed: number;
  commits_examined: number;
  timeline: GitHubEvolutionPoint[];
  style_shifts: GitHubEvolutionShift[];
  rate_remaining: number | null;
}

/* ─── Chat ───────────────────────────────────────── */

export interface ChatCitation {
  tool: string;
  parameters: Record<string, unknown>;
  at: string;
}

export interface ChatReply {
  answer: string;
  intent: string;
  citations: ChatCitation[];
  data: Record<string, unknown>;
  suggestions: string[];
  grounding: string;
  created_at: string;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
  intent?: string;
  citations?: ChatCitation[];
  suggestions?: string[];
  pending?: boolean;
}

/* ─── Model card ─────────────────────────────────── */

export interface ModelWarning {
  severity: 'high' | 'medium' | string;
  title: string;
  detail: string;
  measured_by: string | null;
}

export interface ModelCard {
  headline: {
    in_distribution_accuracy?: number;
    in_distribution_f1_macro?: number;
    in_distribution_roc_auc?: number;
    selected_model?: string;
    dataset?: string;
    per_language?: Record<string, number>;
    group_importance_share?: Record<string, number>;
    real_world_false_positive_rate?: number;
    calibration_source?: string;
  };
  warnings: ModelWarning[];
  training?: Record<string, unknown> | null;
  engine_comparison?: Record<string, unknown> | null;
  calibration?: Record<string, unknown> | null;
}


/* ─── MCP ────────────────────────────────────────── */

export interface MCPTool {
  name: string;
  description: string;
  input_schema: {
    type?: string;
    properties?: Record<string, { type?: string; description?: string; default?: unknown }>;
    required?: string[];
  };
}

export interface MCPServerEntry {
  name: string;
  description: string;
  command: string;
  enabled: boolean;
  connected: boolean;
  tools: MCPTool[];
  error: string | null;
  server_info?: { name?: string; version?: string };
  protocol_version?: string;
}

export interface MCPStatus {
  configured: boolean;
  config_path: string;
  server_count: number;
  servers: MCPServerEntry[];
  tool_count: number;
  connected_servers: string[];
  summary: string;
}

export interface MCPCallResult {
  server: string;
  tool: string;
  is_error: boolean;
  duration_ms: number;
  result: unknown;
  content: Array<{ type: string; text?: string }>;
}

/* ─── Investigation ──────────────────────────────── */

export interface InvestigationToolCall {
  tool: string;
  parameters: Record<string, unknown>;
  transport: 'mcp' | 'local';
  server: string | null;
  duration_ms: number | null;
  error: string | null;
  timestamp: string;
}

export interface InvestigationFinding {
  type: 'critical' | 'warning' | 'info' | string;
  title: string;
  description: string;
}

export interface InvestigationResult {
  id: string;
  task: string;
  summary: string;
  findings: InvestigationFinding[];
  tool_log: InvestigationToolCall[];
  mcp: {
    configured: boolean;
    connected_servers: string[];
    tools_discovered: string[];
    calls_made: number;
    status: string;
  };
  created_at: string;
}
