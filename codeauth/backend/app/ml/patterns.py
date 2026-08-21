r"""
Shared, backtracking-safe source patterns for heuristic (non-AST) extraction.

The original C-style function pattern nested a quantified group that could match
whitespace -- `(?:[\w:]+(?:<[^>]+>)?\s+[\*&]?\s*)+` -- which backtracks
catastrophically. A ~50 line file was enough to pin a CPU indefinitely, and the
heuristic path is reachable from /api/analyze and /api/repository/upload for any
non-Python file *or* any Python file whose AST parse fails, so untrusted input
could stall a worker.

Rules kept here so features.py and segmentation.py cannot drift apart:
  * no quantified group that can itself match whitespace,
  * every repetition bounded with {0,n},
  * `[ \t]` instead of `\s` so a match cannot run across lines,
  * declarations anchored to the start of a line (they always are in practice),
    which collapses the search space.
"""
import re

# Definitions that start a line, per language family.
FUNCTION_PATTERNS: tuple[str, ...] = (
    # Python / Ruby: def name(
    r'^[ \t]{0,64}def[ \t]+([A-Za-z_]\w{0,80})[ \t]{0,8}\(',
    # JavaScript / TypeScript: function name(
    r'^[ \t]{0,64}(?:export[ \t]+){0,1}(?:async[ \t]+){0,1}function[ \t]{0,8}\*?[ \t]{0,8}([A-Za-z_$]\w{0,80})[ \t]{0,8}\(',
    # Arrow assigned to a binding: const name = (...) =>
    r'^[ \t]{0,64}(?:export[ \t]+){0,1}(?:const|let|var)[ \t]+([A-Za-z_$]\w{0,80})[ \t]{0,8}=[ \t]{0,8}(?:async[ \t]{0,8}){0,1}(?:\([^;{}()\n]{0,200}\)|[A-Za-z_$]\w{0,80})[ \t]{0,8}=>',
    # C / C++ / C# / Java: [modifiers] Type name(args) {
    # One type token only -- no quantified whitespace-bearing group.
    r'^[ \t]{0,64}'
    r'(?:(?:public|private|protected|internal|static|final|inline|virtual|explicit|friend|abstract|override|synchronized|async|unsafe)[ \t]+){0,5}'
    r'[A-Za-z_][\w:]{0,80}(?:<[^<>;{}\n]{0,120}>){0,1}(?:\[\]){0,2}[ \t]{0,8}[*&]{0,2}[ \t]+'
    r'([A-Za-z_]\w{0,80})[ \t]{0,8}\([^;{}()\n]{0,400}\)'
    r'[ \t]{0,8}(?:const[ \t]{0,8}){0,1}(?:noexcept[ \t]{0,8}){0,1}(?:override[ \t]{0,8}){0,1}(?:throws[ \t]+[\w,. \t]{0,120}){0,1}\{',
    # Go: func (recv) Name(  /  func Name(
    r'^[ \t]{0,64}func[ \t]+(?:\([^;{}()\n]{0,120}\)[ \t]{0,8}){0,1}([A-Za-z_]\w{0,80})[ \t]{0,8}\(',
    # Rust: fn name(
    r'^[ \t]{0,64}(?:pub[ \t]+){0,1}(?:async[ \t]+){0,1}fn[ \t]+([A-Za-z_]\w{0,80})[ \t]{0,8}\(',
)

# Tokens that look like calls but are never function definitions.
NON_FUNCTION_NAMES = frozenset({
    "if", "for", "while", "switch", "catch", "sizeof", "typeof", "decltype",
    "return", "class", "struct", "else", "do", "try", "with", "match",
})

COMBINED_FUNCTION_RE = re.compile("|".join(FUNCTION_PATTERNS), re.MULTILINE)

CLASS_RE = re.compile(
    r'^[ \t]{0,64}(?:\w{0,20}[ \t]+){0,3}(?:class|struct|interface|trait|enum)[ \t]+(\w{1,80})',
    re.MULTILINE,
)


def find_function_names(code: str) -> set:
    """Collect distinct function/method names from source without an AST."""
    names = set()
    for match in COMBINED_FUNCTION_RE.finditer(code):
        name = next((g for g in match.groups() if g), None)
        if name and name not in NON_FUNCTION_NAMES:
            names.add(name)
    return names
