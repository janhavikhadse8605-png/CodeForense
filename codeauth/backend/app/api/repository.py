"""Repository analysis API endpoints."""
import hashlib
import logging
import os
import shutil
import tempfile
import zipfile
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.database.models import Repository
from app.ml.inference import run_inference
from app.ml.model import model_manager

logger = logging.getLogger(__name__)
router = APIRouter()

SUPPORTED_EXTENSIONS = {
    ".py": "python", ".js": "javascript", ".ts": "typescript",
    ".java": "java", ".c": "c", ".cpp": "cpp", ".cs": "csharp",
    ".go": "go", ".rs": "rust", ".php": "php", ".rb": "ruby",
    ".jsx": "javascript", ".tsx": "typescript",
}

IGNORED_DIRS = {
    "node_modules", ".git", "dist", "build", "venv", "__pycache__",
    ".venv", "env", ".env", ".tox", "target", "bin", "obj",
    ".idea", ".vscode", "coverage", ".next",
}


@router.post("/repository/upload")
async def upload_repository(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Upload a ZIP file containing a repository for analysis."""
    if not model_manager.is_ready:
        raise HTTPException(status_code=503, detail="ML model is currently unavailable.")

    if not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only ZIP files are supported.")

    # Create temp directory
    temp_dir = tempfile.mkdtemp(prefix="codeauth_repo_")

    try:
        # Save uploaded file
        zip_path = os.path.join(temp_dir, "repo.zip")
        content = await file.read()

        if len(content) > 100 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Repository exceeds 100MB limit.")

        with open(zip_path, "wb") as f:
            f.write(content)

        # Extract
        with zipfile.ZipFile(zip_path, "r") as z:
            z.extractall(os.path.join(temp_dir, "extracted"))

        extracted_path = os.path.join(temp_dir, "extracted")

        # Analyze
        result = _analyze_directory(extracted_path)

        # Save to DB
        repo = Repository(
            name=file.filename.replace(".zip", ""),
            source_type="upload",
            path="",
            files_analyzed=result["files_analyzed"],
            functions_analyzed=result["functions_analyzed"],
            human_ratio=result["human_ratio"],
            ai_ratio=result["ai_ratio"],
            mixed_ratio=result["mixed_ratio"],
            results=result["file_results"],
            file_tree=result["file_tree"],
        )
        db.add(repo)
        db.commit()
        db.refresh(repo)

        return {
            "id": repo.id,
            "name": repo.name,
            "files_analyzed": result["files_analyzed"],
            "functions_analyzed": result["functions_analyzed"],
            "human_ratio": result["human_ratio"],
            "ai_ratio": result["ai_ratio"],
            "mixed_ratio": result["mixed_ratio"],
            "file_results": result["file_results"],
            "file_tree": result["file_tree"],
            "created_at": repo.created_at.isoformat(),
        }

    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


@router.post("/repository/analyze")
async def analyze_repository_url(
    repository_url: str = Form(None),
    db: Session = Depends(get_db),
):
    """Analyze a repository from a URL (placeholder for Git integration)."""
    if repository_url:
        return {
            "message": "Git repository cloning requires Git credentials configuration.",
            "status": "not_configured",
            "repository_url": repository_url,
        }
    raise HTTPException(status_code=400, detail="Please provide a repository URL or upload a ZIP file.")


@router.get("/repository/{repo_id}")
async def get_repository(repo_id: str, db: Session = Depends(get_db)):
    """Get repository analysis results."""
    repo = db.query(Repository).filter(Repository.id == repo_id).first()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found.")

    return {
        "id": repo.id,
        "name": repo.name,
        "files_analyzed": repo.files_analyzed,
        "functions_analyzed": repo.functions_analyzed,
        "human_ratio": repo.human_ratio,
        "ai_ratio": repo.ai_ratio,
        "mixed_ratio": repo.mixed_ratio,
        "file_results": repo.results or [],
        "file_tree": repo.file_tree or {},
        "created_at": repo.created_at.isoformat(),
    }


def _analyze_directory(root_path: str) -> dict:
    """Analyze all source files in a directory."""
    file_results = []
    total_functions = 0
    file_tree = {"name": os.path.basename(root_path) or "repository", "type": "directory", "children": []}

    for dirpath, dirnames, filenames in os.walk(root_path):
        # Filter ignored directories
        dirnames[:] = [d for d in dirnames if d not in IGNORED_DIRS]

        for filename in filenames:
            ext = os.path.splitext(filename)[1].lower()
            if ext not in SUPPORTED_EXTENSIONS:
                continue

            filepath = os.path.join(dirpath, filename)
            rel_path = os.path.relpath(filepath, root_path)

            try:
                with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                    code = f.read()

                if not code.strip() or len(code) < 20:
                    continue

                language = SUPPORTED_EXTENSIONS[ext]
                result = run_inference(code[:50000], language)

                file_results.append({
                    "file_path": rel_path,
                    "language": language,
                    "prediction": result["prediction"],
                    "confidence": result["confidence"],
                    "ai_evidence": result["ai_probability"],
                    "function_count": result["statistics"].get("functions", 0),
                    "lines": result["statistics"].get("lines", 0),
                })
                total_functions += result["statistics"].get("functions", 0)

            except Exception as e:
                logger.warning(f"Failed to analyze {rel_path}: {e}")
                continue

    # Calculate ratios
    total = len(file_results)
    if total > 0:
        human_count = sum(1 for f in file_results if "HUMAN" in f["prediction"])
        ai_count = sum(1 for f in file_results if "AI" in f["prediction"])
        mixed_count = sum(1 for f in file_results if "MIXED" in f["prediction"])

        human_ratio = round(human_count / total * 100, 1)
        ai_ratio = round(ai_count / total * 100, 1)
        mixed_ratio = round(mixed_count / total * 100, 1)
    else:
        human_ratio = ai_ratio = mixed_ratio = 0

    # Build file tree
    file_tree = _build_file_tree(root_path, file_results)

    return {
        "files_analyzed": total,
        "functions_analyzed": total_functions,
        "human_ratio": human_ratio,
        "ai_ratio": ai_ratio,
        "mixed_ratio": mixed_ratio,
        "file_results": file_results,
        "file_tree": file_tree,
    }


def _build_file_tree(root_path: str, file_results: list) -> dict:
    """Build a nested file tree with analysis status indicators."""
    result_map = {r["file_path"]: r for r in file_results}

    tree = {"name": "repository", "type": "directory", "children": [], "status": "neutral"}

    for rel_path, result in result_map.items():
        parts = Path(rel_path).parts
        current = tree

        for i, part in enumerate(parts):
            is_file = (i == len(parts) - 1)

            if is_file:
                status = "green" if "HUMAN" in result["prediction"] else ("red" if "AI" in result["prediction"] else "yellow")
                current["children"].append({
                    "name": part,
                    "type": "file",
                    "status": status,
                    "prediction": result["prediction"],
                    "confidence": result["confidence"],
                })
            else:
                existing = next((c for c in current["children"] if c["name"] == part and c["type"] == "directory"), None)
                if not existing:
                    existing = {"name": part, "type": "directory", "children": [], "status": "neutral"}
                    current["children"].append(existing)
                current = existing

    return tree
