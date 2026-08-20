"""Code similarity analysis API endpoints."""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.database.models import SimilarityResult
from app.ml.inference import get_code_embedding
from app.ml.similarity import find_nearest_samples
from app.ml.model import model_manager
from app.schemas.analysis import SimilarityRequest

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/similarity")
async def analyze_similarity(request: SimilarityRequest, db: Session = Depends(get_db)):
    """Find similar code samples using embedding comparison."""
    if not model_manager.is_ready:
        raise HTTPException(status_code=503, detail="ML model is currently unavailable.")

    # Get embedding for query code
    embedding = get_code_embedding(request.code)
    if embedding is None:
        raise HTTPException(status_code=500, detail="Failed to generate code embedding.")

    # Get reference embeddings from database
    references = db.query(SimilarityResult).all()
    ref_data = [
        {
            "id": r.id,
            "embedding": r.embedding,
            "label": r.label,
            "language": r.language,
            "snippet": r.snippet[:200] if r.snippet else "",
        }
        for r in references
        if r.embedding
    ]

    matches = find_nearest_samples(embedding, ref_data, top_k=request.top_k)

    # Store this embedding for future comparisons
    import hashlib
    code_hash = hashlib.sha256(request.code.encode()).hexdigest()[:16]

    existing = db.query(SimilarityResult).filter(SimilarityResult.code_hash == code_hash).first()
    if not existing:
        new_ref = SimilarityResult(
            code_hash=code_hash,
            embedding=embedding.tolist(),
            label="unknown",
            language=request.language,
            snippet=request.code[:500],
        )
        db.add(new_ref)
        db.commit()

    return {
        "matches": matches,
        "disclaimer": "Similarity indicates structural/semantic resemblance, not proof of common authorship.",
        "reference_count": len(ref_data),
    }
