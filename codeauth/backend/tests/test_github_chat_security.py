"""Tests for the GitHub layer, the grounded assistant, and the ReDoS regression."""
import time

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.api.chat import classify, extract_code, guess_language
from app.ml.features import extract_all_features
from app.ml.patterns import find_function_names
from app.ml.segmentation import segment_code
from app.services.github_client import GitHubError, parse_repo_reference


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


# ─── Repository reference parsing ─────────────────────────────────────

@pytest.mark.parametrize("value,owner,repo,ref", [
    ("psf/requests", "psf", "requests", None),
    ("https://github.com/psf/requests", "psf", "requests", None),
    ("https://github.com/psf/requests.git", "psf", "requests", None),
    ("git@github.com:psf/requests.git", "psf", "requests", None),
    ("https://github.com/psf/requests/tree/main", "psf", "requests", "main"),
    ("https://github.com/psf/requests/blob/v2.31.0", "psf", "requests", "v2.31.0"),
])
def test_parse_accepts_real_shapes(value, owner, repo, ref):
    parsed = parse_repo_reference(value)
    assert (parsed.owner, parsed.repo, parsed.ref) == (owner, repo, ref)


@pytest.mark.parametrize("value", [
    "",
    "not-a-repo",
    "https://gitlab.com/foo/bar",                 # wrong host
    "http://169.254.169.254/latest/meta-data",    # cloud metadata endpoint
    "https://github.com/../../etc/passwd",        # traversal in owner
    "https://localhost:8000/a/b",                 # loopback
    "https://github.com/owner/repo%00",           # null byte in name
])
def test_parse_rejects_hostile_input(value):
    """Anything that is not plainly a github.com repo must be refused."""
    with pytest.raises(GitHubError):
        parse_repo_reference(value)


def test_github_endpoints_reject_bad_host(client):
    for path in ("/api/github/inspect", "/api/github/analyze"):
        resp = client.post(path, json={"repository_url": "https://evil.example.com/a/b"})
        assert resp.status_code == 400
        assert "github.com" in resp.json()["detail"]


def test_github_status_shape(client):
    body = client.get("/api/github/status").json()
    assert "reachable" in body and "token_configured" in body


# ─── ReDoS regression ─────────────────────────────────────────────────
# The original C-style function pattern nested a quantified group that could
# match whitespace, so a modest file could pin a CPU indefinitely. The heuristic
# path is reachable from /api/analyze for any non-Python file, and for any Python
# file whose AST parse fails, so this must stay bounded.

REDOS_SAMPLES = [
    "public static final Map<String, List<Integer>> " + "a " * 400 + "foo(int x) {\n",
    "inline static const unsigned long long " + "b " * 300 + "bar(void) {\n",
    "std::vector<std::map<std::string, std::vector<int>>> " + "c " * 250 + "baz() {\n",
    # A Python file that fails to parse, forcing the heuristic branch.
    ". 5\n" + "x = 1\n" * 40 + "def " + "d " * 200 + "qux():\n",
]


@pytest.mark.parametrize("sample", REDOS_SAMPLES)
def test_feature_extraction_stays_bounded(sample):
    start = time.perf_counter()
    extract_all_features(sample, "cpp")
    assert time.perf_counter() - start < 1.0


@pytest.mark.parametrize("sample", REDOS_SAMPLES)
def test_segmentation_stays_bounded(sample):
    start = time.perf_counter()
    segment_code(sample, "cpp")
    assert time.perf_counter() - start < 1.0


def test_function_detection_survived_the_rewrite():
    """The safe patterns must still find definitions across languages."""
    cases = {
        "int main() {\n  return 0;\n}\nstd::vector<int> build(int n) {\n  return {};\n}\n": {"main", "build"},
        "public class A {\n  public static void main(String[] a) {}\n  private int helper(int x) { return x; }\n}\n": {"main", "helper"},
        "func main() {\n}\nfunc (s *Server) Handle(w int) {\n}\n": {"main", "Handle"},
        "pub fn compute(a: i32) -> i32 { a }\nasync fn run() {}\n": {"compute", "run"},
        "function alpha(a) {}\nconst beta = async (x) => x;\n": {"alpha", "beta"},
        "def alpha(a):\n    return a\n": {"alpha"},
    }
    for code, expected in cases.items():
        assert expected.issubset(find_function_names(code)), code[:40]


def test_control_flow_is_not_mistaken_for_a_definition():
    code = "int main() {\n  if (x) {\n  }\n  while (y) {\n  }\n  switch (z) {\n  }\n}\n"
    names = find_function_names(code)
    assert "main" in names
    assert not ({"if", "while", "switch"} & names)


# ─── Assistant ────────────────────────────────────────────────────────

@pytest.mark.parametrize("message,intent", [
    ("How accurate is the model?", "model_performance"),
    ("Can I trust these results?", "limitations"),
    ("What are the limitations?", "limitations"),
    ("How do I analyze a github repo?", "github_help"),
    ("Summarise the last repository scan", "repository_summary"),
    ("which files are AI?", "list_files"),
    ("how many analyses have I run", "history_stats"),
    ("what is the reviewer agreement rate", "feedback_stats"),
    ("which features matter most", "features"),
    ("which engines are loaded", "engines"),
    ("how do I upload a CSV for evaluation", "evaluation"),
    ("what can you do", "capabilities"),
    ("```python\ndef f(x):\n    return x\n```", "analyze_code"),
])
def test_intent_routing(message, intent):
    assert classify(message) == intent


def test_fenced_code_is_extracted_and_typed():
    msg = "look at this\n```python\ndef alpha():\n    return 1\n```"
    code = extract_code(msg)
    assert code is not None and code.startswith("def alpha")
    assert guess_language(code) == "python"


def test_language_guessing():
    assert guess_language("#include <iostream>\nint main(){}") == "cpp"
    assert guess_language("func main() {\n}\n") == "go"
    assert guess_language("pub fn main() {}\n") == "rust"


def test_chat_answers_are_grounded(client):
    resp = client.post("/api/chat", json={"message": "How accurate is the model?"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["intent"] == "model_performance"
    # Every reply must name the tools it read, so any figure can be traced.
    assert body["citations"], "answer arrived with no citations"
    assert "no external LLM" in body["grounding"]


def test_chat_empty_message_is_handled(client):
    body = client.post("/api/chat", json={"message": "   "}).json()
    assert body["intent"] == "empty"
    assert body["suggestions"]


def test_chat_scores_pasted_code(client):
    code = "```python\ndef add(a, b):\n    return a + b\n```"
    body = client.post("/api/chat", json={"message": code}).json()
    assert body["intent"] == "analyze_code"
    assert any(c["tool"] == "run_inference" for c in body["citations"])


# ─── Measured model card ──────────────────────────────────────────────

def test_model_card_reports_measurements(client):
    card = client.get("/api/model/card").json()
    assert "headline" in card and "warnings" in card
    # Whatever the numbers are, the calibration finding must be surfaced.
    if card["headline"].get("real_world_false_positive_rate") is not None:
        assert any(w["severity"] == "high" for w in card["warnings"])


def test_health_reports_both_engines(client):
    body = client.get("/api/health").json()
    assert set(body["engines"]) == {"hybrid", "stylometric"}
    assert body["primary_engine"] in {"hybrid", "stylometric", None}


# ─── No hardcoded verdicts ────────────────────────────────────────────

def test_confidence_is_not_a_fixed_constant(client):
    """
    The old pipeline emitted only 100.0 or 98.3 because a hardcoded layer
    overrode the model. Distinct inputs must now produce distinct confidences.
    """
    samples = [
        ("def f(x):\n    return x * 2\n\ndef g(y):\n    return y + 1\n", "python"),
        ('def compute_total(items, rate):\n    """Sum and apply a rate."""\n'
         '    total = 0\n    for item in items:\n        total += item.price\n'
         '    return total * (1 + rate)\n', "python"),
        ("import sys\nn=int(input())\na=[int(x) for x in input().split()]\n"
         "a.sort()\ns=0\nfor i in range(n):\n    s+=a[i]\nprint(s)\n", "python"),
    ]
    confidences = set()
    for code, lang in samples:
        resp = client.post("/api/analyze", json={"code": code, "language": lang})
        assert resp.status_code == 200
        body = resp.json()
        confidences.add(body["confidence"])
        # The response must say which engine decided.
        assert body["engine"] in {"stylometric", "hybrid"}

    assert confidences != {100.0}, "confidence looks hardcoded again"
    assert not confidences.issubset({98.3, 100.0}), "confidence collapsed to the old constants"


def test_tiny_input_is_inconclusive(client):
    resp = client.post("/api/analyze", json={"code": "x = 1\n", "language": "python"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["prediction"] == "INCONCLUSIVE"
    assert body["confidence"] == 0.0
    assert body["caveats"]
