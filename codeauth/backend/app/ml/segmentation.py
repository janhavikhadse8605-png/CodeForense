"""
CodeAuth Code Segmentation — Function/class-level authorship analysis.

Parses code into segments (functions, classes, blocks) and runs
inference on each segment to detect mixed authorship.
"""
import ast
import re
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def segment_code(code: str, language: str = "python") -> list[dict]:
    """
    Segment source code into functions/classes/blocks.

    Returns list of segments with:
    - name: segment identifier
    - type: 'function', 'class', 'method', 'block'
    - code: source code of the segment
    - start_line: 1-indexed start line
    - end_line: 1-indexed end line
    """
    if language.lower() == "python":
        return _segment_python(code)
    else:
        return _segment_heuristic(code, language)


def _segment_python(code: str) -> list[dict]:
    """Segment Python code using AST."""
    segments = []
    lines = code.split("\n")

    try:
        tree = ast.parse(code)
    except SyntaxError:
        return _segment_heuristic(code, "python")

    for node in ast.iter_child_nodes(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            start = node.lineno
            end = node.end_lineno or start
            segment_code_str = "\n".join(lines[start - 1:end])
            segments.append({
                "name": node.name,
                "type": "function",
                "code": segment_code_str,
                "start_line": start,
                "end_line": end,
            })
        elif isinstance(node, ast.ClassDef):
            start = node.lineno
            end = node.end_lineno or start
            segment_code_str = "\n".join(lines[start - 1:end])
            segments.append({
                "name": node.name,
                "type": "class",
                "code": segment_code_str,
                "start_line": start,
                "end_line": end,
            })

            # Also extract methods within the class
            for child in ast.iter_child_nodes(node):
                if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    m_start = child.lineno
                    m_end = child.end_lineno or m_start
                    method_code = "\n".join(lines[m_start - 1:m_end])
                    segments.append({
                        "name": f"{node.name}.{child.name}",
                        "type": "method",
                        "code": method_code,
                        "start_line": m_start,
                        "end_line": m_end,
                    })

    # If no segments found, treat the whole code as one block
    if not segments:
        segments.append({
            "name": "main_block",
            "type": "block",
            "code": code,
            "start_line": 1,
            "end_line": len(lines),
        })

    return segments


def _segment_heuristic(code: str, language: str) -> list[dict]:
    """Heuristic segmentation for non-Python languages."""
    segments = []
    lines = code.split("\n")

    # Pattern for function definitions across common languages
    func_patterns = [
        r'\bdef\s+([a-zA-Z_]\w*)\s*\(',
        r'\bfunction\s+([a-zA-Z_]\w*)\s*\(',
        r'(?:const|let|var)\s+([a-zA-Z_]\w*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z_]\w*)\s*=>',
        r'(?:(?:inline|static|virtual|explicit|const|friend|public|private|protected|async|final|override)\s+)*(?:[\w:]+(?:<[^>]+>)?\s+[\*&]?\s*)+([a-zA-Z_]\w*)\s*\([^;{}]*\)\s*(?:const)?\s*(?:override)?\s*(?:noexcept)?\s*\{',
        r'\bfunc\s+(?:\([^)]*\)\s*)?([a-zA-Z_]\w*)\s*\(',
        r'\bfn\s+([a-zA-Z_]\w*)\s*\(',
    ]

    combined_pattern = "|".join(func_patterns)
    current_segment_start = None
    current_segment_name = None
    brace_depth = 0

    for i, line in enumerate(lines):
        match = re.search(combined_pattern, line)
        if match:
            # Save previous segment if exists
            if current_segment_start is not None:
                seg_code = "\n".join(lines[current_segment_start:i])
                if seg_code.strip():
                    segments.append({
                        "name": current_segment_name,
                        "type": "function",
                        "code": seg_code,
                        "start_line": current_segment_start + 1,
                        "end_line": i,
                    })

            # Extract function name from matched groups
            name = next((g for g in match.groups() if g), f"function_{len(segments)}")
            current_segment_start = i
            current_segment_name = name

    # Add last segment
    if current_segment_start is not None:
        seg_code = "\n".join(lines[current_segment_start:])
        if seg_code.strip():
            segments.append({
                "name": current_segment_name,
                "type": "function",
                "code": seg_code,
                "start_line": current_segment_start + 1,
                "end_line": len(lines),
            })

    if not segments:
        segments.append({
            "name": "main_block",
            "type": "block",
            "code": code,
            "start_line": 1,
            "end_line": len(lines),
        })

    return segments


def analyze_mixed_authorship(segment_results: list[dict]) -> dict:
    """
    Analyze segment-level results to determine mixed authorship.

    Returns:
        {
            overall_prediction: str,
            overall_confidence: float,
            human_ratio: float,
            ai_ratio: float,
            is_mixed: bool,
            segments: list,
        }
    """
    if not segment_results:
        return {
            "overall_prediction": "UNKNOWN",
            "overall_confidence": 0,
            "human_ratio": 0,
            "ai_ratio": 0,
            "is_mixed": False,
            "segments": [],
        }

    valid_results = [r for r in segment_results if r.get("prediction") != "UNKNOWN"]

    if not valid_results:
        return {
            "overall_prediction": "UNKNOWN",
            "overall_confidence": 0,
            "human_ratio": 0,
            "ai_ratio": 0,
            "is_mixed": False,
            "segments": segment_results,
        }

    human_segments = [r for r in valid_results if "HUMAN" in r.get("prediction", "")]
    ai_segments = [r for r in valid_results if "AI" in r.get("prediction", "")]

    total = len(valid_results)
    human_ratio = len(human_segments) / total * 100
    ai_ratio = len(ai_segments) / total * 100

    # Mixed if both human and AI segments exist with substantial representation
    is_mixed = len(human_segments) > 0 and len(ai_segments) > 0
    # Require at least 20% of each to call it truly mixed
    strongly_mixed = human_ratio >= 20 and ai_ratio >= 20

    if strongly_mixed:
        overall_prediction = "MIXED-AUTHORSHIP"
        avg_confidence = sum(r.get("confidence", 0) for r in valid_results) / total
    elif ai_ratio > human_ratio:
        overall_prediction = "AI-LIKELY"
        avg_confidence = sum(r.get("confidence", 0) for r in ai_segments) / max(len(ai_segments), 1)
    else:
        overall_prediction = "HUMAN-LIKELY"
        avg_confidence = sum(r.get("confidence", 0) for r in human_segments) / max(len(human_segments), 1)

    return {
        "overall_prediction": overall_prediction,
        "overall_confidence": round(avg_confidence, 1),
        "human_ratio": round(human_ratio, 1),
        "ai_ratio": round(ai_ratio, 1),
        "is_mixed": is_mixed,
        "segments": segment_results,
    }
