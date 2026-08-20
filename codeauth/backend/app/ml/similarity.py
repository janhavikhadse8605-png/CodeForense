"""
CodeAuth Similarity Engine — CodeBERT embedding-based similarity analysis.
"""
import logging
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Compute cosine similarity between two vectors."""
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


def find_nearest_samples(
    query_embedding: np.ndarray,
    reference_embeddings: list[dict],
    top_k: int = 5,
) -> list[dict]:
    """
    Find the most similar code samples from reference embeddings.

    Args:
        query_embedding: 64-dim fusion embedding of the query code
        reference_embeddings: List of dicts with 'embedding', 'label', 'id', etc.
        top_k: Number of nearest neighbors to return

    Returns:
        List of dicts with similarity scores and metadata.
    """
    if not reference_embeddings:
        return []

    results = []
    for ref in reference_embeddings:
        ref_emb = np.array(ref["embedding"])
        sim = cosine_similarity(query_embedding, ref_emb)
        results.append({
            "id": ref.get("id", ""),
            "label": ref.get("label", "unknown"),
            "similarity": round(sim * 100, 1),
            "language": ref.get("language", "unknown"),
            "snippet": ref.get("snippet", ""),
        })

    results.sort(key=lambda x: x["similarity"], reverse=True)
    return results[:top_k]
