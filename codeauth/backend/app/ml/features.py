"""
CodeAuth Feature Extraction — 41 features across 6 groups.

Feature groups and dimensions (matching trained model):
- naming: 8 features
- structure: 10 features
- comments: 6 features
- repetition: 5 features
- complexity: 6 features
- formatting: 6 features
"""
import ast
import re
import logging
from collections import Counter
from typing import Optional

import numpy as np

from app.ml.patterns import CLASS_RE, find_function_names

logger = logging.getLogger(__name__)


def extract_all_features(code: str, language: str = "python") -> dict:
    """
    Extract all 41 features from source code.

    Returns dict with keys: naming, structure, comments, repetition, complexity, formatting
    Each value is a list of floats matching the expected feature dimensions.
    Also returns 'details' with human-readable feature descriptions.
    """
    lines = code.split("\n")
    non_empty_lines = [l for l in lines if l.strip()]

    # Try AST parsing for Python
    tree = None
    if language.lower() == "python":
        try:
            tree = ast.parse(code)
        except SyntaxError:
            logger.warning("Failed to parse Python AST, using heuristic extraction")

    naming = extract_naming_features(code, lines, tree, language)
    structure = extract_structure_features(code, lines, tree, language)
    comments = extract_comment_features(code, lines, tree, language)
    repetition = extract_repetition_features(code, lines)
    complexity = extract_complexity_features(code, lines, tree, language)
    formatting = extract_formatting_features(code, lines)

    return {
        "naming": naming["values"],
        "structure": structure["values"],
        "comments": comments["values"],
        "repetition": repetition["values"],
        "complexity": complexity["values"],
        "formatting": formatting["values"],
        "details": {
            "naming": naming["details"],
            "structure": structure["details"],
            "comments": comments["details"],
            "repetition": repetition["details"],
            "complexity": complexity["details"],
            "formatting": formatting["details"],
        },
        "statistics": {
            "lines": len(lines),
            "non_empty_lines": len(non_empty_lines),
            "functions": structure["details"].get("function_count", 0),
            "classes": structure["details"].get("class_count", 0),
            "complexity": complexity["details"].get("avg_complexity", 0),
        },
    }


# ─── NAMING FEATURES (8) ───────────────────────────────────────────────

def extract_naming_features(code: str, lines: list, tree, language: str) -> dict:
    """
    Extract 8 naming features:
    0: identifier_count
    1: avg_identifier_length
    2: identifier_length_variance
    3: snake_case_ratio
    4: camelCase_ratio
    5: uppercase_ratio
    6: single_char_ratio
    7: naming_consistency
    """
    identifiers = _extract_identifiers(code, tree, language)

    if not identifiers:
        return {
            "values": [0.0] * 8,
            "details": {
                "identifier_count": 0,
                "avg_identifier_length": 0,
                "identifier_length_variance": 0,
                "snake_case_ratio": 0,
                "camelCase_ratio": 0,
                "uppercase_ratio": 0,
                "single_char_ratio": 0,
                "naming_consistency": 0,
            },
        }

    count = len(identifiers)
    lengths = [len(i) for i in identifiers]
    avg_len = np.mean(lengths) if lengths else 0
    var_len = np.var(lengths) if len(lengths) > 1 else 0

    snake = sum(1 for i in identifiers if _is_snake_case(i)) / count
    camel = sum(1 for i in identifiers if _is_camel_case(i)) / count
    upper = sum(1 for i in identifiers if i.isupper() and len(i) > 1) / count
    single = sum(1 for i in identifiers if len(i) == 1) / count

    # Naming consistency: how much identifiers follow a single convention
    convention_ratios = [snake, camel, upper]
    consistency = max(convention_ratios) if convention_ratios else 0

    details = {
        "identifier_count": count,
        "avg_identifier_length": round(float(avg_len), 2),
        "identifier_length_variance": round(float(var_len), 2),
        "snake_case_ratio": round(snake, 4),
        "camelCase_ratio": round(camel, 4),
        "uppercase_ratio": round(upper, 4),
        "single_char_ratio": round(single, 4),
        "naming_consistency": round(consistency, 4),
    }

    values = [
        float(count),
        float(avg_len),
        float(var_len),
        float(snake),
        float(camel),
        float(upper),
        float(single),
        float(consistency),
    ]

    return {"values": values, "details": details}


def _extract_identifiers(code: str, tree, language: str) -> list[str]:
    """Extract identifiers from code using AST or regex fallback."""
    identifiers = []

    if tree is not None:
        for node in ast.walk(tree):
            if isinstance(node, ast.Name):
                identifiers.append(node.id)
            elif isinstance(node, ast.FunctionDef) or isinstance(node, ast.AsyncFunctionDef):
                identifiers.append(node.name)
            elif isinstance(node, ast.ClassDef):
                identifiers.append(node.name)
            elif isinstance(node, ast.arg):
                identifiers.append(node.arg)
    else:
        # Regex fallback for non-Python or parse failures
        # Match identifiers but exclude keywords
        keywords = {
            "if", "else", "for", "while", "return", "import", "from", "class",
            "def", "try", "except", "finally", "with", "as", "in", "is", "not",
            "and", "or", "True", "False", "None", "function", "var", "let",
            "const", "new", "this", "self", "public", "private", "static",
            "void", "int", "string", "bool", "float", "double", "char",
        }
        pattern = re.compile(r'\b([a-zA-Z_]\w*)\b')
        for match in pattern.finditer(code):
            name = match.group(1)
            if name not in keywords and len(name) > 0:
                identifiers.append(name)

    # Filter out common builtins
    builtins = {"print", "len", "range", "str", "int", "float", "list", "dict", "set", "tuple", "type", "isinstance"}
    identifiers = [i for i in identifiers if i not in builtins]
    return identifiers


def _is_snake_case(name: str) -> bool:
    return bool(re.match(r'^[a-z][a-z0-9]*(_[a-z0-9]+)*$', name))


def _is_camel_case(name: str) -> bool:
    return bool(re.match(r'^[a-z]+(?:[A-Z][a-z0-9]*)*$', name)) and any(c.isupper() for c in name)


# ─── STRUCTURE FEATURES (10) ───────────────────────────────────────────

def extract_structure_features(code: str, lines: list, tree, language: str) -> dict:
    """
    Extract 10 structure features:
    0: ast_node_count
    1: function_count
    2: class_count
    3: loop_count
    4: conditional_count
    5: branch_count
    6: return_count
    7: exception_handling_count
    8: max_nesting_depth
    9: lines_of_code
    """
    loc = len([l for l in lines if l.strip()])

    if tree is not None:
        node_count = sum(1 for _ in ast.walk(tree))
        funcs = sum(1 for n in ast.walk(tree) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)))
        classes = sum(1 for n in ast.walk(tree) if isinstance(n, ast.ClassDef))
        loops = sum(1 for n in ast.walk(tree) if isinstance(n, (ast.For, ast.While, ast.AsyncFor)))
        conditionals = sum(1 for n in ast.walk(tree) if isinstance(n, ast.If))
        branches = conditionals + loops
        returns = sum(1 for n in ast.walk(tree) if isinstance(n, ast.Return))
        exceptions = sum(1 for n in ast.walk(tree) if isinstance(n, (ast.Try, ast.ExceptHandler)))
        nesting = _max_nesting_depth(tree)
    else:
        node_count = _heuristic_node_count(code)

        # Backtracking-safe multi-language detection; see app.ml.patterns.
        funcs = len(find_function_names(code))
        classes = len(CLASS_RE.findall(code))
        loops = len(re.findall(r'\b(?:for|while|do\s*\{|loop)\b', code))
        conditionals = len(re.findall(r'\b(?:if|else\s+if|elif|switch)\b', code))
        branches = conditionals + loops
        returns = len(re.findall(r'\breturn\b', code))
        exceptions = len(re.findall(r'\b(?:try|catch|except|finally|throw|raise)\b', code))
        nesting = _heuristic_nesting(lines)

    details = {
        "ast_node_count": node_count,
        "function_count": funcs,
        "class_count": classes,
        "loop_count": loops,
        "conditional_count": conditionals,
        "branch_count": branches,
        "return_count": returns,
        "exception_handling_count": exceptions,
        "max_nesting_depth": nesting,
        "lines_of_code": loc,
    }

    values = [
        float(node_count), float(funcs), float(classes), float(loops),
        float(conditionals), float(branches), float(returns),
        float(exceptions), float(nesting), float(loc),
    ]

    return {"values": values, "details": details}


def _max_nesting_depth(tree) -> int:
    """Calculate max nesting depth from AST."""
    def _depth(node, current=0):
        max_d = current
        for child in ast.iter_child_nodes(node):
            if isinstance(child, (ast.If, ast.For, ast.While, ast.With, ast.Try,
                                  ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                max_d = max(max_d, _depth(child, current + 1))
            else:
                max_d = max(max_d, _depth(child, current))
        return max_d
    return _depth(tree)


def _heuristic_node_count(code: str) -> int:
    """Estimate AST node count from code tokens."""
    tokens = re.findall(r'\b\w+\b', code)
    return len(tokens)


def _heuristic_nesting(lines: list) -> int:
    """Estimate nesting depth from indentation."""
    max_indent = 0
    for line in lines:
        stripped = line.lstrip()
        if stripped:
            indent = len(line) - len(stripped)
            level = indent // 4 if indent > 0 else indent // 2
            max_indent = max(max_indent, level)
    return max_indent


# ─── COMMENT FEATURES (6) ─────────────────────────────────────────────

def extract_comment_features(code: str, lines: list, tree, language: str) -> dict:
    """
    Extract 6 comment features:
    0: comment_count
    1: comment_code_ratio
    2: avg_comment_length
    3: docstring_count
    4: comment_words
    5: comments_per_function
    """
    comments = []
    docstrings = 0
    code_lines = 0

    is_c_style = language.lower() in ("c", "cpp", "csharp", "java", "javascript", "typescript", "go", "rust", "php")
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if is_c_style:
            if stripped.startswith("//") or stripped.startswith("/*") or stripped.startswith("*"):
                comments.append(stripped)
            else:
                code_lines += 1
        else:
            if stripped.startswith("#") or stripped.startswith("//") or stripped.startswith("/*") or stripped.startswith("*"):
                comments.append(stripped)
            else:
                code_lines += 1

    # Count docstrings from AST
    if tree is not None:
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Module)):
                if (node.body and isinstance(node.body[0], ast.Expr)
                        and isinstance(node.body[0].value, (ast.Constant, ast.Str))):
                    docstrings += 1
    else:
        docstrings = len(re.findall(r'"""[\s\S]*?"""|\'\'\'[\s\S]*?\'\'\'', code))

    comment_count = len(comments)
    comment_ratio = comment_count / max(code_lines, 1)
    avg_length = np.mean([len(c) for c in comments]) if comments else 0
    total_words = sum(len(c.split()) for c in comments)

    # Functions count for comments/function
    if tree is not None:
        func_count = sum(1 for n in ast.walk(tree) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)))
    else:
        func_count = len(re.findall(r'\b(?:def|function|func)\s+\w+', code))

    comments_per_func = comment_count / max(func_count, 1)

    details = {
        "comment_count": comment_count,
        "comment_code_ratio": round(comment_ratio, 4),
        "avg_comment_length": round(float(avg_length), 2),
        "docstring_count": docstrings,
        "comment_words": total_words,
        "comments_per_function": round(comments_per_func, 2),
    }

    values = [
        float(comment_count), float(comment_ratio), float(avg_length),
        float(docstrings), float(total_words), float(comments_per_func),
    ]

    return {"values": values, "details": details}


# ─── REPETITION FEATURES (5) ──────────────────────────────────────────

def extract_repetition_features(code: str, lines: list) -> dict:
    """
    Extract 5 repetition features:
    0: duplicate_line_ratio
    1: repeated_token_ratio
    2: repeated_statement_count
    3: repeated_block_count
    4: repetition_score
    """
    non_empty = [l.strip() for l in lines if l.strip()]

    # Duplicate lines
    if non_empty:
        line_counts = Counter(non_empty)
        duplicates = sum(c - 1 for c in line_counts.values() if c > 1)
        dup_ratio = duplicates / len(non_empty)
    else:
        dup_ratio = 0

    # Repeated tokens
    tokens = re.findall(r'\b\w+\b', code)
    if tokens:
        token_counts = Counter(tokens)
        repeated_tokens = sum(c for c in token_counts.values() if c > 2)
        rep_token_ratio = repeated_tokens / len(tokens)
    else:
        rep_token_ratio = 0

    # Repeated statements (lines that appear 3+ times)
    if non_empty:
        rep_statements = sum(1 for c in Counter(non_empty).values() if c >= 3)
    else:
        rep_statements = 0

    # Repeated blocks (consecutive identical line sequences of 2+)
    rep_blocks = 0
    if len(non_empty) >= 4:
        for size in range(2, min(6, len(non_empty) // 2 + 1)):
            blocks = []
            for i in range(len(non_empty) - size + 1):
                block = tuple(non_empty[i:i+size])
                blocks.append(block)
            block_counts = Counter(blocks)
            rep_blocks += sum(1 for c in block_counts.values() if c > 1)

    # Overall repetition score
    rep_score = (dup_ratio * 0.3 + rep_token_ratio * 0.3 +
                 min(rep_statements / 10, 1.0) * 0.2 +
                 min(rep_blocks / 5, 1.0) * 0.2)

    details = {
        "duplicate_line_ratio": round(dup_ratio, 4),
        "repeated_token_ratio": round(rep_token_ratio, 4),
        "repeated_statement_count": rep_statements,
        "repeated_block_count": rep_blocks,
        "repetition_score": round(rep_score, 4),
    }

    values = [
        float(dup_ratio), float(rep_token_ratio),
        float(rep_statements), float(rep_blocks), float(rep_score),
    ]

    return {"values": values, "details": details}


# ─── COMPLEXITY FEATURES (6) ──────────────────────────────────────────

def extract_complexity_features(code: str, lines: list, tree, language: str) -> dict:
    """
    Extract 6 complexity features:
    0: avg_complexity
    1: max_complexity
    2: branch_count
    3: loop_count
    4: boolean_expression_count
    5: avg_nesting_depth
    """
    if tree is not None:
        complexities = []
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                c = _function_complexity(node)
                complexities.append(c)

        avg_complexity = np.mean(complexities) if complexities else 1.0
        max_complexity = max(complexities) if complexities else 1.0
        branches = sum(1 for n in ast.walk(tree) if isinstance(n, ast.If))
        loops = sum(1 for n in ast.walk(tree) if isinstance(n, (ast.For, ast.While)))
        booleans = sum(1 for n in ast.walk(tree) if isinstance(n, ast.BoolOp))

        # Average nesting across functions
        nestings = []
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                nestings.append(_max_nesting_depth(node))
        avg_nesting = np.mean(nestings) if nestings else 0
    else:
        branches = len(re.findall(r'\b(?:if|elif|else\s+if|switch|case)\b', code))
        loops = len(re.findall(r'\b(?:for|while)\b', code))
        booleans = len(re.findall(r'\b(?:and|or|&&|\|\|)\b', code))
        avg_complexity = 1.0 + branches * 0.5 + loops * 0.5
        max_complexity = avg_complexity
        avg_nesting = _heuristic_nesting(lines) / 2.0

    details = {
        "avg_complexity": round(float(avg_complexity), 2),
        "max_complexity": round(float(max_complexity), 2),
        "branch_count": branches,
        "loop_count": loops,
        "boolean_expression_count": booleans,
        "avg_nesting_depth": round(float(avg_nesting), 2),
    }

    values = [
        float(avg_complexity), float(max_complexity),
        float(branches), float(loops),
        float(booleans), float(avg_nesting),
    ]

    return {"values": values, "details": details}


def _function_complexity(func_node) -> int:
    """Calculate cyclomatic complexity of a function."""
    complexity = 1
    for node in ast.walk(func_node):
        if isinstance(node, (ast.If, ast.ExceptHandler)):
            complexity += 1
        elif isinstance(node, (ast.For, ast.While, ast.AsyncFor)):
            complexity += 1
        elif isinstance(node, ast.BoolOp):
            complexity += len(node.values) - 1
    return complexity


# ─── FORMATTING FEATURES (6) ──────────────────────────────────────────

def extract_formatting_features(code: str, lines: list) -> dict:
    """
    Extract 6 formatting features:
    0: avg_line_length
    1: line_length_variance
    2: indentation_consistency
    3: blank_line_ratio
    4: whitespace_consistency
    5: formatting_score
    """
    non_empty = [l for l in lines if l.strip()]

    if not non_empty:
        return {
            "values": [0.0] * 6,
            "details": {
                "avg_line_length": 0, "line_length_variance": 0,
                "indentation_consistency": 0, "blank_line_ratio": 0,
                "whitespace_consistency": 0, "formatting_score": 0,
            },
        }

    lengths = [len(l) for l in non_empty]
    avg_len = np.mean(lengths)
    var_len = np.var(lengths)

    # Indentation consistency
    indents = []
    for line in non_empty:
        stripped = line.lstrip()
        indent = len(line) - len(stripped)
        if indent > 0:
            indents.append(indent)

    if indents:
        # Check if indentation is consistently a multiple of a base unit
        indent_gcd = indents[0]
        for i in indents[1:]:
            from math import gcd
            indent_gcd = gcd(indent_gcd, i)
        indent_consistency = 1.0 if indent_gcd >= 2 else 0.5
        # Check variance of indent levels
        indent_var = np.var(indents)
        indent_consistency *= max(0, 1.0 - indent_var / 100)
    else:
        indent_consistency = 1.0

    # Blank line ratio
    blank_lines = sum(1 for l in lines if not l.strip())
    blank_ratio = blank_lines / max(len(lines), 1)

    # Whitespace consistency (trailing spaces, tabs vs spaces)
    trailing_spaces = sum(1 for l in lines if l != l.rstrip())
    mixed_indent = sum(1 for l in lines if l.startswith("\t") and " " in l[:len(l) - len(l.lstrip())])
    ws_consistency = 1.0 - (trailing_spaces + mixed_indent) / max(len(lines), 1)

    # Overall formatting score
    fmt_score = (indent_consistency * 0.3 + ws_consistency * 0.3 +
                 (1.0 - min(var_len / 1000, 1.0)) * 0.2 +
                 min(blank_ratio * 5, 1.0) * 0.2)

    details = {
        "avg_line_length": round(float(avg_len), 2),
        "line_length_variance": round(float(var_len), 2),
        "indentation_consistency": round(float(indent_consistency), 4),
        "blank_line_ratio": round(blank_ratio, 4),
        "whitespace_consistency": round(float(ws_consistency), 4),
        "formatting_score": round(float(fmt_score), 4),
    }

    values = [
        float(avg_len), float(var_len), float(indent_consistency),
        float(blank_ratio), float(ws_consistency), float(fmt_score),
    ]

    return {"values": values, "details": details}
