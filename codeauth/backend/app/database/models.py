"""Database models for CodeAuth."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, Float, Integer, Text, DateTime, JSON, ForeignKey, Boolean
from sqlalchemy.orm import relationship

from app.database.session import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


class Analysis(Base):
    __tablename__ = "analyses"

    id = Column(String, primary_key=True, default=generate_uuid)
    code_hash = Column(String, index=True)
    code_snippet = Column(Text)
    language = Column(String, default="python")
    prediction = Column(String)
    confidence = Column(Float)
    human_probability = Column(Float)
    ai_probability = Column(Float)
    evidence = Column(JSON)
    statistics = Column(JSON)
    feature_details = Column(JSON)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    segments = relationship("AnalysisSegment", back_populates="analysis", cascade="all, delete-orphan")
    feedback = relationship("Feedback", back_populates="analysis", cascade="all, delete-orphan")


class AnalysisSegment(Base):
    __tablename__ = "analysis_segments"

    id = Column(String, primary_key=True, default=generate_uuid)
    analysis_id = Column(String, ForeignKey("analyses.id"), nullable=False)
    name = Column(String)
    segment_type = Column(String)
    code = Column(Text)
    start_line = Column(Integer)
    end_line = Column(Integer)
    prediction = Column(String)
    confidence = Column(Float)
    human_probability = Column(Float)
    ai_probability = Column(Float)
    evidence = Column(JSON)

    analysis = relationship("Analysis", back_populates="segments")


class Project(Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    description = Column(Text, default="")
    repository_url = Column(String, default="")
    overall_prediction = Column(String, default="")
    last_analyzed = Column(DateTime)
    file_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    settings = Column(JSON, default=dict)


class Repository(Base):
    __tablename__ = "repositories"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String)
    project_id = Column(String, ForeignKey("projects.id"), nullable=True)
    source_type = Column(String)  # 'upload', 'git', 'github'
    path = Column(String)
    files_analyzed = Column(Integer, default=0)
    functions_analyzed = Column(Integer, default=0)
    human_ratio = Column(Float, default=0)
    ai_ratio = Column(Float, default=0)
    mixed_ratio = Column(Float, default=0)
    results = Column(JSON)
    file_tree = Column(JSON)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Feedback(Base):
    __tablename__ = "feedback"

    id = Column(String, primary_key=True, default=generate_uuid)
    analysis_id = Column(String, ForeignKey("analyses.id"), nullable=True)
    code_hash = Column(String)
    prediction = Column(String)
    confidence = Column(Float)
    reviewer_label = Column(String)  # 'correct', 'incorrect'
    actual_authorship = Column(String)  # 'human', 'ai', 'mixed', 'unknown'
    comment = Column(Text, default="")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    analysis = relationship("Analysis", back_populates="feedback")


class Report(Base):
    __tablename__ = "reports"

    id = Column(String, primary_key=True, default=generate_uuid)
    analysis_id = Column(String, ForeignKey("analyses.id"), nullable=True)
    repository_id = Column(String, ForeignKey("repositories.id"), nullable=True)
    title = Column(String)
    report_type = Column(String, default="analysis")  # 'analysis', 'repository', 'evolution'
    content = Column(JSON)
    format = Column(String, default="json")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class EvaluationRun(Base):
    __tablename__ = "evaluation_runs"

    id = Column(String, primary_key=True, default=generate_uuid)
    dataset_size = Column(Integer)
    accuracy = Column(Float)
    precision = Column(Float)
    recall = Column(Float)
    f1_macro = Column(Float)
    f1_weighted = Column(Float)
    roc_auc = Column(Float, nullable=True)
    confusion_matrix = Column(JSON)
    class_distribution = Column(JSON)
    metrics_detail = Column(JSON)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class SimilarityResult(Base):
    __tablename__ = "similarity_results"

    id = Column(String, primary_key=True, default=generate_uuid)
    source_analysis_id = Column(String, ForeignKey("analyses.id"), nullable=True)
    code_hash = Column(String)
    embedding = Column(JSON)  # Store 64-dim vector as JSON list
    label = Column(String)
    language = Column(String)
    snippet = Column(Text)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
