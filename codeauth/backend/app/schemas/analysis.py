"""Pydantic schemas for CodeAuth API."""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


# ─── Analysis ──────────────────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    code: str = Field(..., min_length=1, description="Source code to analyze")
    language: str = Field(default="python", description="Programming language")


class SegmentResult(BaseModel):
    name: str
    segment_type: str
    start_line: int
    end_line: int
    prediction: str
    confidence: float
    human_probability: float = 0
    ai_probability: float = 0
    evidence: dict = {}
    heatmap_color: str = "yellow"  # red, green, yellow


class AnalysisResponse(BaseModel):
    id: str
    prediction: str
    confidence: float
    human_probability: float
    ai_probability: float
    evidence: dict
    statistics: dict
    feature_details: dict = {}
    segments: list[SegmentResult] = []
    mixed_authorship: Optional[dict] = None
    language: str
    created_at: str


class FunctionLevelRequest(BaseModel):
    code: str = Field(..., min_length=1)
    language: str = Field(default="python")


# ─── Repository ────────────────────────────────────────────────────────

class RepositoryAnalyzeRequest(BaseModel):
    repository_url: Optional[str] = None


class FileResult(BaseModel):
    file_path: str
    language: str
    prediction: str
    confidence: float
    ai_evidence: float = 0
    function_count: int = 0
    lines: int = 0


class RepositoryResponse(BaseModel):
    id: str
    name: str
    files_analyzed: int
    functions_analyzed: int
    human_ratio: float
    ai_ratio: float
    mixed_ratio: float
    file_results: list[FileResult] = []
    file_tree: dict = {}
    created_at: str


# ─── Evolution ─────────────────────────────────────────────────────────

class EvolutionRequest(BaseModel):
    versions: list[dict]  # [{code: str, label: str, timestamp: str?}]
    language: str = "python"


class VersionResult(BaseModel):
    label: str
    prediction: str
    confidence: float
    ai_probability: float
    timestamp: Optional[str] = None


class EvolutionResponse(BaseModel):
    id: str
    versions: list[VersionResult]
    style_shifts: list[dict] = []
    created_at: str


# ─── Evaluation ────────────────────────────────────────────────────────

class EvaluationResponse(BaseModel):
    id: str
    dataset_size: int
    accuracy: float
    precision: float
    recall: float
    f1_macro: float
    f1_weighted: float
    roc_auc: Optional[float] = None
    confusion_matrix: dict
    class_distribution: dict
    created_at: str


# ─── Feedback ──────────────────────────────────────────────────────────

class FeedbackRequest(BaseModel):
    analysis_id: Optional[str] = None
    code_hash: Optional[str] = None
    prediction: str
    confidence: float
    reviewer_label: str  # 'correct' or 'incorrect'
    actual_authorship: str = "unknown"  # 'human', 'ai', 'mixed', 'unknown'
    comment: str = ""


class FeedbackResponse(BaseModel):
    id: str
    reviewer_label: str
    actual_authorship: str
    comment: str
    created_at: str


class FeedbackStats(BaseModel):
    total_reviewed: int
    correct_predictions: int
    incorrect_predictions: int
    agreement_rate: float


# ─── Similarity ────────────────────────────────────────────────────────

class SimilarityRequest(BaseModel):
    code: str = Field(..., min_length=1)
    language: str = "python"
    top_k: int = 5


class SimilarMatch(BaseModel):
    id: str
    label: str
    similarity: float
    language: str
    snippet: str = ""


class SimilarityResponse(BaseModel):
    matches: list[SimilarMatch]
    disclaimer: str = "Similarity indicates structural/semantic resemblance, not proof of common authorship."


# ─── Reports ───────────────────────────────────────────────────────────

class ReportGenerateRequest(BaseModel):
    analysis_id: Optional[str] = None
    repository_id: Optional[str] = None
    title: str = "CodeAuth Analysis Report"
    format: str = "json"  # 'json', 'csv', 'pdf'


class ReportResponse(BaseModel):
    id: str
    title: str
    report_type: str
    format: str
    content: dict = {}
    created_at: str


# ─── Projects ──────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    name: str
    description: str = ""
    repository_url: str = ""


class ProjectResponse(BaseModel):
    id: str
    name: str
    description: str
    repository_url: str
    overall_prediction: str
    last_analyzed: Optional[str] = None
    file_count: int
    created_at: str


# ─── Investigation ─────────────────────────────────────────────────────

class InvestigationRequest(BaseModel):
    repository_id: Optional[str] = None
    task: str = "full_investigation"
    parameters: dict = {}


class InvestigationResponse(BaseModel):
    id: str
    summary: str
    findings: list[dict] = []
    tool_log: list[dict] = []
    created_at: str


# ─── Health ────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str
    model_status: str
    model_device: str = ""
    database_status: str = "ok"
    version: str = "1.0.0"
    validation_steps: list[dict] = []
