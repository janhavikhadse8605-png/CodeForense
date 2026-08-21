"""
Grounded assistant over CodeAuth's own model data.

This is deliberately *not* a wrapper around a general-purpose LLM. The brief
requires a genuine ML component rather than prompt-forwarding, so every answer
here is composed from data this system produced:

    * the trained classifier (live inference on pasted code)
    * stored analyses, segments, repositories, feedback and evaluation runs
    * the measured model card in ml_training/*.json
    * the 64-dim fusion embedding space, for similarity questions

The reply pipeline is: classify intent -> call the matching tool(s) -> render a
templated answer over the retrieved values -> attach citations naming the tool
and table each number came from. If nothing relevant is found it says so instead
of guessing, and it will not report a figure it did not read from a real record.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Callable, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database.models import (
    Analysis,
    EvaluationRun,
    Feedback,
    Repository,
)
from app.database.session import get_db
from app.ml.inference import any_engine_ready, engines_available, run_inference
from app.ml.model_cards import model_card
from app.schemas.analysis import ChatRequest

logger = logging.getLogger(__name__)
router = APIRouter()

# ─── Intent classification ────────────────────────────────────────────
# Keyword scoring rather than a model: the intent set is small and closed, and a
# deterministic router is inspectable and cannot hallucinate a route.

INTENT_KEYWORDS: dict[str, tuple[str, ...]] = {
    "model_performance": (
        "accurate", "accuracy", "f1", "precision", "recall", "roc", "auc",
        "metric", "benchmark", "how good", "performance", "score",
    ),
    "limitations": (
        "trust", "reliable", "reliability", "limitation", "caveat", "weakness",
        "false positive", "wrong", "misleading", "safe to use", "proof", "evidence",
    ),
    "explain_analysis": (
        "why", "explain", "reason", "evidence", "because", "how did you",
        "what made", "justify",
    ),
    "repository_summary": (
        "repo", "repository", "codebase", "project scan", "scanned",
    ),
    "list_files": (
        "which file", "what file", "list file", "files are ai", "files are human",
        "worst file", "flagged file",
    ),
    "history_stats": (
        "how many", "history", "past analys", "my analys", "total analys", "so far",
    ),
    "feedback_stats": (
        "agreement", "reviewer", "feedback", "correct prediction", "human review",
    ),
    "features": (
        "feature", "signal", "stylometric", "what do you look", "indentation",
        "naming", "formatting", "importance",
    ),
    "engines": (
        "engine", "hybrid", "codebert", "which model", "what model", "architecture",
    ),
    "github_help": (
        "github", "clone", "git repo", "pull request", "commit history", "branch",
    ),
    "evaluation": (
        "evaluate", "evaluation", "csv", "dataset", "confusion matrix", "test set",
    ),
    "capabilities": (
        "what can you", "help", "who are you", "what do you do", "commands",
    ),
}

CODE_HINTS = re.compile(
    r"(^|\n)\s*(def |class |import |from |function |const |let |var |public |private |#include|package |fn |func )",
)


# Ties are common ("github repo" matches both the repo and the GitHub intent), so
# specific intents are resolved ahead of general ones.
INTENT_PRIORITY: tuple[str, ...] = (
    "github_help", "limitations", "features", "engines", "evaluation",
    "feedback_stats", "list_files", "model_performance", "explain_analysis",
    "history_stats", "repository_summary", "capabilities",
)

# Phrases that mean "teach me how", which should never resolve to a data summary.
HOWTO_MARKERS = ("how do i", "how can i", "how to", "where do i", "steps to")


def classify(message: str) -> str:
    text = message.lower()

    # A pasted code block wins over everything: the user wants it analyzed.
    if "```" in message or (len(message.splitlines()) >= 3 and CODE_HINTS.search(message)):
        return "analyze_code"

    asking_howto = any(m in text for m in HOWTO_MARKERS)

    scores: dict[str, float] = {}
    for intent, keywords in INTENT_KEYWORDS.items():
        # Longer keywords are more specific, so they carry more weight than a
        # bare substring like "repo" matching inside "github repo".
        hit = sum(len(kw) for kw in keywords if kw in text)
        if hit:
            scores[intent] = hit

    if not scores:
        return "capabilities"

    # "How do I ... github ..." is a how-to, not a request for scan results.
    if asking_howto and "github_help" in scores:
        return "github_help"
    if asking_howto:
        scores.pop("repository_summary", None)
        scores.pop("history_stats", None)
        if not scores:
            return "capabilities"

    best = max(scores.values())
    tied = [i for i, v in scores.items() if v == best]
    if len(tied) == 1:
        return tied[0]
    for intent in INTENT_PRIORITY:
        if intent in tied:
            return intent
    return tied[0]


def extract_code(message: str) -> Optional[str]:
    fenced = re.findall(r"```(?:[a-zA-Z+#]*)\n(.*?)```", message, re.DOTALL)
    if fenced:
        return fenced[0].strip()
    lines = message.splitlines()
    if len(lines) >= 3 and CODE_HINTS.search(message):
        return message.strip()
    return None


def guess_language(code: str) -> str:
    if re.search(r"^\s*(def |import |from |print\()", code, re.MULTILINE):
        return "python"
    if "#include" in code or "std::" in code:
        return "cpp"
    if re.search(r"\b(public|private)\s+(static\s+)?(void|int|String)\b", code):
        return "java"
    if re.search(r"\b(function|const|let|=>)\b", code):
        return "javascript"
    if re.search(r"^\s*func\s", code, re.MULTILINE):
        return "go"
    if re.search(r"^\s*(pub\s+)?fn\s", code, re.MULTILINE):
        return "rust"
    return "python"


# ─── Tools ────────────────────────────────────────────────────────────


class ChatTools:
    """Every data read the assistant is allowed to make, logged as it goes."""

    def __init__(self, db: Session):
        self.db = db
        self.calls: list[dict] = []

    def _log(self, tool: str, **params) -> None:
        self.calls.append({
            "tool": tool,
            "parameters": params,
            "at": datetime.now(timezone.utc).isoformat(),
        })

    def card(self) -> dict:
        self._log("read_model_card", source="ml_training/*.json")
        return model_card.get()

    def latest_analysis(self) -> Optional[Analysis]:
        self._log("query_analyses", order="created_at desc", limit=1)
        return self.db.query(Analysis).order_by(Analysis.created_at.desc()).first()

    def analysis_by_id(self, analysis_id: str) -> Optional[Analysis]:
        self._log("query_analyses", id=analysis_id)
        return self.db.query(Analysis).filter(Analysis.id == analysis_id).first()

    def analysis_counts(self) -> dict:
        self._log("aggregate_analyses")
        rows = self.db.query(Analysis).all()
        ai = sum(1 for r in rows if "AI" in (r.prediction or ""))
        human = sum(1 for r in rows if "HUMAN" in (r.prediction or ""))
        inconclusive = sum(1 for r in rows if "INCONCLUSIVE" in (r.prediction or ""))
        langs: dict[str, int] = {}
        for r in rows:
            langs[r.language or "unknown"] = langs.get(r.language or "unknown", 0) + 1
        confidences = [r.confidence for r in rows if r.confidence is not None]
        return {
            "total": len(rows),
            "ai": ai,
            "human": human,
            "inconclusive": inconclusive,
            "languages": langs,
            "mean_confidence": round(sum(confidences) / len(confidences), 1) if confidences else None,
        }

    def latest_repository(self) -> Optional[Repository]:
        self._log("query_repositories", order="created_at desc", limit=1)
        return self.db.query(Repository).order_by(Repository.created_at.desc()).first()

    def repository_by_id(self, repo_id: str) -> Optional[Repository]:
        self._log("query_repositories", id=repo_id)
        return self.db.query(Repository).filter(Repository.id == repo_id).first()

    def feedback_stats(self) -> dict:
        self._log("aggregate_feedback")
        rows = self.db.query(Feedback).all()
        correct = sum(1 for r in rows if r.reviewer_label == "correct")
        return {
            "total": len(rows),
            "correct": correct,
            "incorrect": sum(1 for r in rows if r.reviewer_label == "incorrect"),
            "agreement_rate": round(correct / len(rows) * 100, 1) if rows else None,
        }

    def latest_evaluation(self) -> Optional[EvaluationRun]:
        self._log("query_evaluation_runs", order="created_at desc", limit=1)
        return self.db.query(EvaluationRun).order_by(EvaluationRun.created_at.desc()).first()

    def analyze(self, code: str, language: str) -> dict:
        self._log("run_inference", language=language, chars=len(code))
        return run_inference(code, language)


# ─── Answer builders ──────────────────────────────────────────────────

Answer = tuple[str, dict, list[str]]  # (markdown, data, suggestions)


def _pct(value: Optional[float]) -> str:
    return "unknown" if value is None else f"{value * 100:.1f}%"


def answer_model_performance(t: ChatTools, _msg: str) -> Answer:
    card = t.card()
    head = card.get("headline") or {}
    if not head.get("in_distribution_accuracy"):
        return (
            "No measured metrics are available yet. Run `ml_training/train_stylometric.py` "
            "to train and evaluate, then ask again.",
            {}, ["What are the limitations?", "Which engines are loaded?"],
        )

    lines = [
        "**Measured performance** — held-out test split, evaluated once after model selection.",
        "",
        f"- Accuracy **{_pct(head['in_distribution_accuracy'])}**",
        f"- Macro F1 **{_pct(head.get('in_distribution_f1_macro'))}**",
        f"- ROC-AUC **{head.get('in_distribution_roc_auc')}**",
        f"- Selected model: `{head.get('selected_model')}`",
    ]
    per_lang = head.get("per_language") or {}
    if per_lang:
        lines += ["", "**By language:**"]
        for lang, acc in sorted(per_lang.items(), key=lambda kv: -(kv[1] or 0)):
            lines.append(f"- {lang}: {_pct(acc)}")

    fpr = head.get("real_world_false_positive_rate")
    if fpr is not None:
        lines += [
            "",
            f"⚠️ That accuracy is **in-distribution only**. On known-human code from "
            f"{head.get('calibration_source')}, **{fpr * 100:.0f}%** of files were wrongly "
            f"labelled AI. Ask about limitations before relying on any verdict.",
        ]

    return "\n".join(lines), {"headline": head}, [
        "Why is the false positive rate so high?",
        "Which features drive the prediction?",
        "Which engines are loaded?",
    ]


def answer_limitations(t: ChatTools, _msg: str) -> Answer:
    card = t.card()
    warnings = card.get("warnings") or []
    if not warnings:
        return (
            "No measured limitations are on file yet — run the scripts in `ml_training/` "
            "to populate them.",
            {}, ["How accurate is the model?"],
        )

    lines = ["**What the measurements say you should not do with this tool.**", ""]
    for w in warnings:
        marker = "🔴" if w.get("severity") == "high" else "🟠"
        lines.append(f"{marker} **{w['title']}**")
        lines.append(f"   {w['detail']}")
        if w.get("measured_by"):
            lines.append(f"   _source: `{w['measured_by']}`_")
        lines.append("")
    lines.append(
        "A verdict from this system is a statement about surface style, not about who "
        "wrote the code. It is not admissible evidence of misconduct."
    )
    return "\n".join(lines), {"warnings": warnings}, [
        "How accurate is the model?",
        "Which features drive the prediction?",
    ]


def answer_analyze_code(t: ChatTools, msg: str) -> Answer:
    code = extract_code(msg)
    if not code:
        return (
            "Paste the code in a fenced ``` block and I will score it.",
            {}, ["How accurate is the model?"],
        )
    if not any_engine_ready():
        return ("No inference engine is loaded, so I cannot score anything. Check `/api/health`.",
                {}, ["Which engines are loaded?"])

    language = guess_language(code)
    result = t.analyze(code, language)

    ev = result.get("evidence") or {}
    top = sorted(ev.items(), key=lambda kv: -kv[1])[:3]

    lines = [
        f"**{result['prediction']}** — confidence {result['confidence']}%  "
        f"(detected language: `{language}`)",
        "",
        f"- P(human) {result['human_probability']}%  ·  P(AI) {result['ai_probability']}%",
        f"- Engine: `{result.get('engine')}` — {result.get('engine_detail')}",
        f"- {result['statistics'].get('lines', 0)} lines, "
        f"{result['statistics'].get('functions', 0)} functions",
    ]
    if top:
        lines += ["", "**Strongest evidence groups** (ablation, relative contribution):"]
        lines += [f"- {name}: {value}%" for name, value in top]

    agreement = result.get("engine_agreement")
    if agreement:
        verdict = "agree" if agreement["engines_agree"] else "**disagree**"
        lines += [
            "",
            f"The two engines {verdict}: stylometric says "
            f"{agreement['stylometric_ai_probability']}% AI, hybrid says "
            f"{agreement['hybrid_ai_probability']}% AI.",
        ]

    for caveat in result.get("caveats") or []:
        lines += ["", f"⚠️ {caveat}"]

    return "\n".join(lines), {"result": result}, [
        "Why did it decide that?",
        "How reliable is this verdict?",
    ]


def answer_explain_analysis(t: ChatTools, msg: str) -> Answer:
    match = re.search(r"\b([0-9a-f]{16,32})\b", msg)
    analysis = t.analysis_by_id(match.group(1)) if match else t.latest_analysis()
    if not analysis:
        return ("I have no stored analyses to explain yet. Run one first.",
                {}, ["How accurate is the model?"])

    ev = analysis.evidence or {}
    ranked = sorted(ev.items(), key=lambda kv: -kv[1])
    stats = analysis.statistics or {}
    details = analysis.feature_details or {}

    lines = [
        f"**{analysis.prediction}** at {analysis.confidence}% confidence "
        f"(`{analysis.language}`, {stats.get('lines', '?')} lines).",
        "",
        "**Contribution by feature group** — measured by zeroing each group and "
        "re-scoring, normalised to 100%:",
    ]
    lines += [f"- {name}: {value}%" for name, value in ranked]

    # Quote the actual measured values behind the top group.
    if ranked:
        top_group = ranked[0][0]
        group_values = details.get(top_group) or {}
        if group_values:
            shown = list(group_values.items())[:5]
            lines += ["", f"**Measured `{top_group}` values for this sample:**"]
            lines += [f"- {k.replace('_', ' ')}: {v}" for k, v in shown]

    card = t.card()
    share = (card.get("headline") or {}).get("group_importance_share") or {}
    if share.get("formatting", 0) >= 50:
        lines += [
            "",
            f"⚠️ Across the whole test set, formatting alone accounts for "
            f"{share['formatting']:.0f}% of this model's importance. Re-formatting a file "
            f"can move its verdict without changing authorship.",
        ]

    return "\n".join(lines), {"analysis_id": analysis.id, "evidence": ev}, [
        "What are the limitations?",
        "How many analyses have I run?",
    ]


def answer_repository_summary(t: ChatTools, msg: str) -> Answer:
    match = re.search(r"\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b", msg)
    repo = t.repository_by_id(match.group(1)) if match else t.latest_repository()
    if not repo:
        return (
            "No repository scans on record. Use the Repository page — paste a GitHub URL "
            "or upload a ZIP — then ask again.",
            {}, ["How do I analyze a GitHub repo?"],
        )

    lines = [
        f"**{repo.name}** (`{repo.source_type}`{f' — {repo.path}' if repo.path else ''})",
        "",
        f"- {repo.files_analyzed} files scored, {repo.functions_analyzed} functions found",
        f"- Human-associated **{repo.human_ratio}%** · AI-associated **{repo.ai_ratio}%** · "
        f"Mixed {repo.mixed_ratio}%",
        f"- Scanned {repo.created_at.strftime('%Y-%m-%d %H:%M') if repo.created_at else 'unknown'}",
    ]

    results = repo.results or []
    if results:
        flagged = sorted(
            (r for r in results if "AI" in (r.get("prediction") or "")),
            key=lambda r: -(r.get("confidence") or 0),
        )[:5]
        if flagged:
            lines += ["", "**Highest-confidence AI-associated files:**"]
            lines += [
                f"- `{r['file_path']}` — {r['confidence']}% ({r.get('lines', '?')} lines)"
                for r in flagged
            ]

    card = t.card()
    fpr = (card.get("headline") or {}).get("real_world_false_positive_rate")
    if fpr is not None and repo.ai_ratio and repo.ai_ratio > 50:
        lines += [
            "",
            f"⚠️ Treat this split with suspicion. On known-human production code the model "
            f"false-positives at {fpr * 100:.0f}%, so a high AI ratio on a real repository is "
            f"the expected failure mode, not a finding.",
        ]

    return "\n".join(lines), {"repository_id": repo.id}, [
        "Which files were flagged?",
        "What are the limitations?",
    ]


def answer_list_files(t: ChatTools, msg: str) -> Answer:
    repo = t.latest_repository()
    if not repo or not repo.results:
        return ("No scanned repository with per-file results yet.",
                {}, ["How do I analyze a GitHub repo?"])

    want_human = "human" in msg.lower()
    label = "HUMAN" if want_human else "AI"
    rows = [r for r in repo.results if label in (r.get("prediction") or "")]
    rows.sort(key=lambda r: -(r.get("confidence") or 0))

    if not rows:
        return (f"No files in **{repo.name}** were labelled {label}.",
                {"repository_id": repo.id}, ["Summarise the repository"])

    lines = [f"**{len(rows)} {label}-associated file(s)** in `{repo.name}`:", ""]
    lines += [
        f"- `{r['file_path']}` — {r['confidence']}% · {r.get('language')} · {r.get('lines', '?')} lines"
        for r in rows[:15]
    ]
    if len(rows) > 15:
        lines.append(f"- …and {len(rows) - 15} more")
    return "\n".join(lines), {"repository_id": repo.id, "count": len(rows)}, [
        "Summarise the repository", "What are the limitations?",
    ]


def answer_history_stats(t: ChatTools, _msg: str) -> Answer:
    c = t.analysis_counts()
    if not c["total"]:
        return ("No analyses recorded yet.", {}, ["How accurate is the model?"])
    langs = ", ".join(f"{k} ({v})" for k, v in sorted(c["languages"].items(), key=lambda kv: -kv[1]))
    lines = [
        f"**{c['total']} analyses** on record.",
        "",
        f"- AI-associated: {c['ai']}",
        f"- Human-associated: {c['human']}",
        f"- Inconclusive: {c['inconclusive']}",
        f"- Mean confidence: {c['mean_confidence']}%" if c["mean_confidence"] is not None else "",
        f"- Languages: {langs}",
    ]
    return "\n".join(l for l in lines if l), {"counts": c}, [
        "Explain the most recent analysis", "What is the reviewer agreement rate?",
    ]


def answer_feedback_stats(t: ChatTools, _msg: str) -> Answer:
    s = t.feedback_stats()
    if not s["total"]:
        return (
            "No reviewer feedback recorded yet. The Reviewer Feedback page lets you mark "
            "predictions correct or incorrect, and the agreement rate is computed only from "
            "those records.",
            {}, ["How accurate is the model?"],
        )
    return (
        f"**{s['total']} reviews** on record: {s['correct']} marked correct, "
        f"{s['incorrect']} incorrect — agreement rate **{s['agreement_rate']}%**.\n\n"
        f"This reflects reviewer opinion on the samples chosen for review, which is not a "
        f"random sample, so it is not an accuracy estimate.",
        {"feedback": s},
        ["How accurate is the model?", "What are the limitations?"],
    )


def answer_features(t: ChatTools, _msg: str) -> Answer:
    card = t.card()
    training = card.get("training") or {}
    share = training.get("group_importance_share") or {}
    importance = training.get("feature_importance") or {}

    lines = [
        "The model reads **41 features across 6 groups**, all computed statically — the "
        "code is never executed.",
        "",
    ]
    if share:
        lines.append("**Group importance** (permutation importance on the held-out set):")
        lines += [
            f"- {g}: {v:.1f}%"
            for g, v in sorted(share.items(), key=lambda kv: -kv[1])
        ]
    if importance:
        top = list(importance.items())[:8]
        lines += ["", "**Most influential individual features:**"]
        lines += [f"- {name.replace('_', ' ')} ({score})" for name, score in top]
    if share.get("formatting", 0) >= 50:
        lines += [
            "",
            f"⚠️ Formatting dominates at {share['formatting']:.0f}%. That is a property of the "
            f"training corpus, not a law of authorship: run a formatter and the verdict can flip.",
        ]
    return "\n".join(lines), {"group_importance": share}, [
        "What are the limitations?", "How accurate is the model?",
    ]


def answer_engines(t: ChatTools, _msg: str) -> Answer:
    engines = engines_available()
    card = t.card()
    comparison = (card.get("engine_comparison") or {}).get("engines") or {}

    lines = ["**Inference engines**", ""]
    lines.append(f"- `stylometric` — {'loaded' if engines['stylometric'] else 'not loaded'} "
                 f"(gradient boosting over the 41 features). **Primary.**")
    lines.append(f"- `hybrid` — {'loaded' if engines['hybrid'] else 'not loaded'} "
                 f"(CodeBERT encoder fused with six feature-group MLPs). Second opinion.")

    if comparison:
        lines += ["", "**Measured head-to-head on identical held-out samples:**", ""]
        lines.append("| engine | accuracy | ROC-AUC |")
        lines.append("|---|---|---|")
        for key, label in (("stylometric", "stylometric"), ("hybrid", "hybrid")):
            m = comparison.get(key)
            if m:
                lines.append(f"| {label} | {m['accuracy']} | {m.get('roc_auc')} |")
        claim = (card.get("engine_comparison") or {}).get("checkpoint_metadata_claim")
        hybrid = comparison.get("hybrid") or {}
        if claim and hybrid.get("accuracy") and hybrid["accuracy"] < claim - 0.05:
            lines += [
                "",
                f"The checkpoint's own `metadata.json` claims {claim:.4f} accuracy but measures "
                f"{hybrid['accuracy']:.4f} here, which is why it does not get the deciding vote.",
            ]
    return "\n".join(lines), {"engines": engines}, [
        "How accurate is the model?", "What are the limitations?",
    ]


def answer_github_help(_t: ChatTools, _msg: str) -> Answer:
    return (
        "**Analyzing a GitHub repository**\n\n"
        "1. Open **Repository → GitHub** and paste any of these: "
        "`https://github.com/owner/repo`, `owner/repo`, or a `/tree/branch` URL.\n"
        "2. **Inspect** fetches metadata and commit history without running inference — cheap, "
        "and it tells you the default branch and how many distinct commit authors there are.\n"
        "3. **Analyze** downloads that ref as an archive and scores every supported source file, "
        "returning per-file verdicts and an annotated directory tree.\n"
        "4. **Commit evolution** scores a single file at each of its recent commits, so you can "
        "see where its style shifts across real project history.\n\n"
        "Private repositories and higher rate limits need a token: set `GITHUB_TOKEN` in the "
        "backend environment. Unauthenticated access is capped at 60 requests/hour. A token "
        "passed from the UI is used for that one request and never stored.",
        {},
        ["Summarise the last repository scan", "Which files were flagged?"],
    )


def answer_evaluation(t: ChatTools, _msg: str) -> Answer:
    run = t.latest_evaluation()
    card = t.card()
    head = card.get("headline") or {}

    lines = []
    if run:
        lines += [
            f"**Most recent evaluation run** — {run.dataset_size} samples, "
            f"{run.created_at.strftime('%Y-%m-%d %H:%M') if run.created_at else ''}",
            "",
            f"- Accuracy {run.accuracy} · Macro F1 {run.f1_macro} · ROC-AUC {run.roc_auc}",
            f"- Confusion matrix: {(run.confusion_matrix or {}).get('matrix')}",
            "",
        ]
    else:
        lines += ["No evaluation run has been uploaded through the UI yet.", ""]

    if head.get("in_distribution_accuracy"):
        lines += [
            "**From training** (`ml_training/train_stylometric.py`): accuracy "
            f"{_pct(head['in_distribution_accuracy'])}, macro F1 "
            f"{_pct(head.get('in_distribution_f1_macro'))} on "
            f"{head.get('dataset')}.",
        ]
    lines += [
        "",
        "To evaluate on your own data, upload a CSV with `code_content` and "
        "`authorship_class` (`HUMAN`/`AI`) columns on the Model Evaluation page.",
    ]
    return "\n".join(lines), {}, ["How accurate is the model?", "What are the limitations?"]


def answer_capabilities(t: ChatTools, _msg: str) -> Answer:
    engines = engines_available()
    card = t.card()
    head = card.get("headline") or {}
    acc = head.get("in_distribution_accuracy")
    fpr = head.get("real_world_false_positive_rate")

    lines = [
        "I answer from this system's own data — stored analyses, repository scans, reviewer "
        "feedback, and the measured model card. I am not a general chatbot and I do not call "
        "an external language model.",
        "",
        "**Try:**",
        "- Paste code in a ``` block and I will score it",
        "- \"How accurate is the model?\"",
        "- \"What are the limitations?\"",
        "- \"Why was the last analysis flagged?\"",
        "- \"Summarise the last repository scan\"",
        "- \"Which files were flagged as AI?\"",
        "- \"Which features matter most?\"",
        "- \"How do I analyze a GitHub repo?\"",
        "",
        f"Engines loaded: stylometric={engines['stylometric']}, hybrid={engines['hybrid']}.",
    ]
    if acc:
        lines.append(f"Held-out accuracy {_pct(acc)}.")
    if fpr is not None:
        lines.append(
            f"⚠️ On known-human production code the false-positive rate is {fpr * 100:.0f}% — "
            f"ask about limitations before trusting a verdict."
        )
    return "\n".join(lines), {}, [
        "How accurate is the model?", "What are the limitations?",
        "How do I analyze a GitHub repo?",
    ]


HANDLERS: dict[str, Callable[[ChatTools, str], Answer]] = {
    "model_performance": answer_model_performance,
    "limitations": answer_limitations,
    "analyze_code": answer_analyze_code,
    "explain_analysis": answer_explain_analysis,
    "repository_summary": answer_repository_summary,
    "list_files": answer_list_files,
    "history_stats": answer_history_stats,
    "feedback_stats": answer_feedback_stats,
    "features": answer_features,
    "engines": answer_engines,
    "github_help": answer_github_help,
    "evaluation": answer_evaluation,
    "capabilities": answer_capabilities,
}


@router.post("/chat")
def chat(request: ChatRequest, db: Session = Depends(get_db)):
    """Answer a question using only data this system produced."""
    message = (request.message or "").strip()
    if not message:
        return {
            "answer": "Ask me something, or paste code in a ``` block to have it scored.",
            "intent": "empty",
            "citations": [],
            "data": {},
            "suggestions": ["How accurate is the model?", "What are the limitations?"],
        }

    intent = classify(message)
    tools = ChatTools(db)

    try:
        answer, data, suggestions = HANDLERS[intent](tools, message)
    except Exception as exc:
        logger.error("Chat handler %s failed: %s", intent, exc, exc_info=True)
        answer = (
            f"I hit an error answering that ({exc.__class__.__name__}). The intent I routed to "
            f"was `{intent}`."
        )
        data, suggestions = {}, ["What can you do?"]

    return {
        "answer": answer,
        "intent": intent,
        # Citations name the tool and the source for every read behind the answer,
        # so any number in the reply can be traced to a record.
        "citations": tools.calls,
        "data": data,
        "suggestions": suggestions,
        "grounding": "local model outputs and stored records only; no external LLM",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/chat/suggestions")
def chat_suggestions():
    """Opening prompts for a fresh conversation."""
    return {
        "suggestions": [
            "How accurate is the model?",
            "What are the limitations?",
            "How do I analyze a GitHub repo?",
            "Which features matter most?",
            "Summarise the last repository scan",
            "Which engines are loaded?",
        ]
    }
