"""
Domain-shift check: how does the model behave on real-world human code?

The benchmark says 96.8% accuracy. That number is real, but it is measured on the
distribution the model was trained on — short competitive-programming submissions.
This script scores code that is human-written beyond reasonable doubt and reports
the false-positive rate, because a model that is excellent in-distribution can be
useless on the code people will actually paste into it.

Sources, all pre-dating widespread LLM code generation or verifiably human:
  * The Python standard library shipped with the running interpreter.
  * Any local directory passed with --dir (e.g. a checkout of a mature library).

Everything here is labelled HUMAN by construction, so every AI verdict is a
false positive.

Usage:
    python calibration_check.py
    python calibration_check.py --dir /path/to/checkout --max-files 120
"""
from __future__ import annotations

import argparse
import json
import logging
import random
import sys
import sysconfig
import time
from pathlib import Path

HERE = Path(__file__).parent
BACKEND = HERE.parent
sys.path.insert(0, str(BACKEND))

logging.getLogger("app.ml.features").setLevel(logging.ERROR)

from app.ml.features import extract_all_features  # noqa: E402
from app.ml.inference import _flatten_features  # noqa: E402
from app.ml.stylometric import stylometric_model  # noqa: E402

MODEL_DIR = BACKEND / "model_files"
OUT = HERE / "calibration_report.json"

SKIP_DIR_NAMES = {
    "test", "tests", "site-packages", "__pycache__", "lib2to3",
    "idlelib", "turtledemo", "node_modules", ".git",
}


def collect_python_files(root: Path, limit: int) -> list[Path]:
    found: list[Path] = []
    for path in sorted(root.rglob("*.py")):
        if any(part in SKIP_DIR_NAMES for part in path.parts):
            continue
        try:
            if path.stat().st_size < 800 or path.stat().st_size > 200_000:
                continue
        except OSError:
            continue
        found.append(path)
    random.Random(11).shuffle(found)
    return found[:limit]


def score(paths: list[Path], label: str) -> dict:
    rows = []
    t0 = time.time()
    for path in paths:
        try:
            code = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        if len(code.strip()) < 200:
            continue
        try:
            vector = _flatten_features(extract_all_features(code, "python"))
            ai_prob = stylometric_model.predict(vector)[1]
        except Exception:
            continue
        rows.append({"file": path.name, "ai_probability": round(float(ai_prob), 4)})

    if not rows:
        return {"source": label, "n": 0}

    probs = [r["ai_probability"] for r in rows]
    false_positives = [r for r in rows if r["ai_probability"] >= 0.5]
    high_conf_fp = [r for r in rows if r["ai_probability"] >= 0.9]

    return {
        "source": label,
        "n": len(rows),
        "false_positive_rate": round(len(false_positives) / len(rows), 4),
        "high_confidence_fp_rate": round(len(high_conf_fp) / len(rows), 4),
        "mean_ai_probability": round(sum(probs) / len(probs), 4),
        "median_ai_probability": round(sorted(probs)[len(probs) // 2], 4),
        "seconds": round(time.time() - t0, 1),
        "worst_offenders": sorted(rows, key=lambda r: -r["ai_probability"])[:8],
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dir", action="append", default=[], help="extra human-code directory")
    ap.add_argument("--max-files", type=int, default=150)
    args = ap.parse_args()

    if not stylometric_model.load(MODEL_DIR / "stylometric_model.pkl"):
        raise SystemExit("stylometric model not available — run train_stylometric.py first")

    results = []

    stdlib = Path(sysconfig.get_paths()["stdlib"])
    if stdlib.exists():
        files = collect_python_files(stdlib, args.max_files)
        print(f"Python standard library: {len(files)} files from {stdlib}")
        results.append(score(files, f"python-stdlib ({sys.version.split()[0]})"))

    for extra in args.dir:
        root = Path(extra).expanduser()
        if not root.exists():
            print(f"skipping missing dir: {root}")
            continue
        files = collect_python_files(root, args.max_files)
        print(f"{root}: {len(files)} files")
        results.append(score(files, str(root)))

    print("\n" + "=" * 74)
    print("Every file below is human-written. AI verdicts are false positives.")
    print("=" * 74)
    for r in results:
        if not r.get("n"):
            continue
        print(f"\n{r['source']}  (n={r['n']})")
        print(f"  false positive rate      {r['false_positive_rate']:.1%}")
        print(f"  of which high-confidence {r['high_confidence_fp_rate']:.1%}  (P(AI) >= 0.90)")
        print(f"  mean P(AI)               {r['mean_ai_probability']:.3f}")
        print(f"  median P(AI)             {r['median_ai_probability']:.3f}")
        if r["worst_offenders"]:
            worst = ", ".join(f"{o['file']}={o['ai_probability']:.2f}" for o in r["worst_offenders"][:4])
            print(f"  worst                    {worst}")

    OUT.write_text(json.dumps({"results": results}, indent=2))
    print(f"\nsaved -> {OUT}")
    print(
        "\nInterpretation: a high false-positive rate here means the benchmark score does\n"
        "not transfer to production code. The training corpus is short contest-style\n"
        "submissions, where 'human' correlates with terse, loosely formatted code; mature\n"
        "library code is consistently formatted and documented, which the model reads as AI."
    )


if __name__ == "__main__":
    main()
