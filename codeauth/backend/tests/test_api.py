"""Unit tests for CodeAuth backend."""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.ml.features import extract_all_features
from app.ml.segmentation import segment_code, analyze_mixed_authorship


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_health_endpoint(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "model_status" in data
    assert data["model_status"] == "ready"


def test_feature_extraction_dimensions():
    sample_code = """
def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)
"""
    feats = extract_all_features(sample_code, "python")
    assert len(feats["naming"]) == 8
    assert len(feats["structure"]) == 10
    assert len(feats["comments"]) == 6
    assert len(feats["repetition"]) == 5
    assert len(feats["complexity"]) == 6
    assert len(feats["formatting"]) == 6
    assert feats["statistics"]["functions"] == 1


def test_segmentation():
    sample_code = """
def func_a():
    return 1

def func_b():
    return 2
"""
    segments = segment_code(sample_code, "python")
    assert len(segments) == 2
    assert segments[0]["name"] == "func_a"
    assert segments[1]["name"] == "func_b"


def test_mixed_authorship_aggregation():
    segment_results = [
        {"prediction": "HUMAN-LIKELY", "confidence": 85.0},
        {"prediction": "AI-LIKELY", "confidence": 92.0},
    ]
    mixed = analyze_mixed_authorship(segment_results)
    assert mixed["is_mixed"] is True
    assert mixed["overall_prediction"] == "MIXED-AUTHORSHIP"


def test_analyze_endpoint_real_model(client):
    sample_code = """
def add_numbers(a, b):
    return a + b
"""
    response = client.post("/api/analyze", json={"code": sample_code, "language": "python"})
    assert response.status_code == 200
    data = response.json()
    assert "prediction" in data
    assert "confidence" in data
    assert "evidence" in data
    assert "naming" in data["evidence"]
    assert "structure" in data["evidence"]
    assert "comments" in data["evidence"]
    assert "repetition" in data["evidence"]
    assert "complexity" in data["evidence"]
    assert "formatting" in data["evidence"]


def test_empty_code_validation(client):
    response = client.post("/api/analyze", json={"code": "   ", "language": "python"})
    assert response.status_code == 400


def test_dashboard_stats(client):
    response = client.get("/api/dashboard/stats")
    assert response.status_code == 200
    data = response.json()
    assert "total_analyses" in data
    assert "avg_confidence" in data


def test_model_info(client):
    response = client.get("/api/model/info")
    assert response.status_code == 200
    data = response.json()
    assert data["model_name"] == "Hybrid CodeBERT Authorship Model"
