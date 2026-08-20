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
