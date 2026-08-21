"""
Fetch a labelled human/AI code dataset into the CSV layout CodeAuth expects.

Source: LTPhong/CSC15011_Detecting_AI-Generated_Code on the Hugging Face Hub,
pulled through the public datasets-server REST API so no `datasets` dependency
is required. The dataset carries pre-defined train/validation/test splits, is
close to class-balanced, and its AI half was produced by 29 distinct code models
(Qwen, CodeLlama, StarCoder, Phi, Yi, Granite, DeepSeek, Llama, CodeGemma),
which keeps the labels from collapsing onto one generator's quirks.

Output columns match the /api/evaluation/run contract:
    code_content, authorship_class, language, generator

Usage:
    python fetch_dataset.py --split train --limit 6000
    python fetch_dataset.py --all
"""
from __future__ import annotations

import argparse
import csv
import sys
import time
from pathlib import Path

import requests

DATASET = "LTPhong/CSC15011_Detecting_AI-Generated_Code"
ROWS_URL = "https://datasets-server.huggingface.co/rows"
SIZE_URL = "https://datasets-server.huggingface.co/size"
PAGE = 100  # datasets-server caps a single request at 100 rows
DATA_DIR = Path(__file__).parent / "data"

# The dataset labels languages in prose; CodeAuth's extractors expect its own codes.
LANGUAGE_MAP = {
    "python": "python",
    "java": "java",
    "c++": "cpp",
    "cpp": "cpp",
    "c": "c",
    "c#": "csharp",
    "javascript": "javascript",
    "typescript": "typescript",
    "go": "go",
    "rust": "rust",
    "php": "php",
    "ruby": "ruby",
}


def split_sizes() -> dict[str, int]:
    r = requests.get(SIZE_URL, params={"dataset": DATASET}, timeout=30)
    r.raise_for_status()
    return {s["split"]: s["num_rows"] for s in r.json()["size"]["splits"]}


def fetch_split(split: str, limit: int | None, start: int = 0) -> list[dict]:
    total = split_sizes().get(split)
    if total is None:
        raise SystemExit(f"unknown split: {split}")
    target = total if limit is None else min(limit, total)
    print(f"[{split}] {total:,} rows available, fetching {target:,}")

    out: list[dict] = []
    offset = start
    while len(out) < target:
        length = min(PAGE, target - len(out))
        for attempt in range(5):
            try:
                r = requests.get(
                    ROWS_URL,
                    params={
                        "dataset": DATASET,
                        "config": "default",
                        "split": split,
                        "offset": offset,
                        "length": length,
                    },
                    timeout=60,
                )
                r.raise_for_status()
                break
            except requests.RequestException as exc:
                wait = 2 ** attempt
                print(f"  retry {attempt + 1}/5 after {wait}s ({exc})", file=sys.stderr)
                time.sleep(wait)
        else:
            raise SystemExit(f"giving up at offset {offset}")

        rows = r.json().get("rows", [])
        if not rows:
            print(f"  server returned no rows at offset {offset}; stopping early")
            break

        for item in rows:
            row = item["row"]
            code = (row.get("code") or "").strip()
            if len(code) < 20:
                continue  # too short to carry stylometric signal
            raw_lang = (row.get("language") or "").strip().lower()
            out.append({
                "code_content": code,
                "authorship_class": "AI" if int(row.get("label", 0)) == 1 else "HUMAN",
                "language": LANGUAGE_MAP.get(raw_lang, raw_lang or "python"),
                "generator": row.get("generator") or "unknown",
            })

        offset += length
        time.sleep(0.35)  # stay under the datasets-server rate limit
        if len(out) % 1000 < PAGE:
            print(f"  {len(out):,} kept…")

    return out


def write_csv(rows: list[dict], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(
            fh, fieldnames=["code_content", "authorship_class", "language", "generator"]
        )
        writer.writeheader()
        writer.writerows(rows)

    human = sum(1 for r in rows if r["authorship_class"] == "HUMAN")
    langs: dict[str, int] = {}
    for r in rows:
        langs[r["language"]] = langs.get(r["language"], 0) + 1
    print(f"  -> {path.name}: {len(rows):,} rows "
          f"({human:,} HUMAN / {len(rows) - human:,} AI) langs={langs}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--split", default="train", choices=["train", "validation", "test"])
    ap.add_argument("--limit", type=int, default=None, help="cap rows (default: whole split)")
    ap.add_argument("--all", action="store_true", help="fetch every split")
    ap.add_argument("--offset", type=int, default=0, help="start row (sample a different region)")
    args = ap.parse_args()

    splits = ["train", "validation", "test"] if args.all else [args.split]
    for split in splits:
        rows = fetch_split(split, args.limit, args.offset)
        write_csv(rows, DATA_DIR / f"{split}.csv")


if __name__ == "__main__":
    main()
