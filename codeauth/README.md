# CodeAuth — Code Authorship Analyzer

Determines whether source code is more consistent with human or AI authorship, reports the
evidence behind each verdict, and states plainly where it cannot be trusted.

---

## Headline result, and the caveat that matters more

A gradient-boosted classifier trained on 41 stylometric features:

| metric | held-out test |
|---|---|
| Accuracy | **0.9648** |
| Macro F1 | **0.9648** |
| ROC-AUC | **0.9931** |
| Python / C++ / Java | 0.980 / 0.814 / 0.764 |

**That number does not transfer to production code.** Measured on 150 files of the Python
standard library — human-written, pre-dating LLM code generation — **64% were labelled AI**, and
57% of those at ≥90% confidence.

The cause is the training distribution. The corpus is short competitive-programming submissions,
where "human" correlates with terse, loosely formatted code. Mature library code is consistently
formatted and documented, which the model reads as AI. Permutation importance confirms it:
formatting alone accounts for **76.6%** of measured importance.

Reproduce both numbers:

```bash
cd backend
python ml_training/train_stylometric.py     # -> training_report.json
python ml_training/calibration_check.py     # -> calibration_report.json
```

Treat a verdict as a statement about surface style, not about who wrote the code. It is not
evidence of misconduct. The UI surfaces this at the point of use rather than burying it here.

---

## The ML component

### Dataset

`ml_training/fetch_dataset.py` pulls [`LTPhong/CSC15011_Detecting_AI-Generated_Code`][ds] through
the Hugging Face datasets-server REST API — no `datasets` dependency. The AI half comes from **34
distinct generators** (Qwen, CodeLlama, StarCoder, Phi, Yi, Granite, DeepSeek, Llama, CodeGemma),
so labels do not collapse onto one model's quirks.

```bash
python ml_training/fetch_dataset.py --all --limit 2500
```

| split | rows | human | AI | source |
|---|---|---|---|---|
| train | 2500 | 1160 | 1340 | official `train` |
| validation | 2500 | 1194 | 1306 | official `validation`, offset 0 |
| test | 2500 | 1213 | 1287 | official `validation`, offset 20000 |

Verified zero overlap between all three splits. The dataset's own `test` split is used *not*
because it was convenient but because `datasets-server` returns HTTP 500 for it at every offset;
the substitute is a disjoint slice of a held-out split, which is documented in the report rather
than quietly swapped.

### Protocol

Features come from `app/ml/features.py` — the **same** code path that serves inference, so trained
and served representations cannot drift.

1. Fit three candidates on `train` with 5-fold stratified CV.
2. Select on `validation` macro F1.
3. Score `test` **once**, after selection.

| candidate | CV macro F1 | validation macro F1 |
|---|---|---|
| logistic_regression | 0.9031 ± 0.0181 | 0.8994 |
| random_forest | 0.9556 ± 0.0065 | 0.9554 |
| **hist_gradient_boosting** ← selected | **0.9662 ± 0.0081** | **0.9695** |

### Two engines, and why the checkpoint lost

`ml_training/evaluate_engines.py` scores both engines over identical held-out samples:

| engine | accuracy | ROC-AUC | C++ | Java |
|---|---|---|---|---|
| **stylometric** (trained here) | **0.9683** | 0.9892 | 0.794 | 0.833 |
| hybrid CodeBERT (supplied checkpoint) | 0.7300 | 0.7089 | 0.529 | 0.583 |

The checkpoint's `metadata.json` asserts `test_accuracy: 0.9832`. It measures **0.7300** here and
sits near chance on C++ and Java, so it does not get the deciding vote — it runs as a second
opinion, and disagreement between the engines is reported as a caveat on the verdict. If you swap
in a better checkpoint, re-run `evaluate_engines.py` and revisit the ordering in
`app/ml/inference.py`.

The 41 features, across six groups: **naming** (8), **structure** (10), **comments** (6),
**repetition** (5), **complexity** (6), **formatting** (6).

---

## Feature map

| Requirement | Where | Notes |
|---|---|---|
| Dataset & processing | `ml_training/fetch_dataset.py` | 34 AI generators, 3 disjoint splits |
| **Authorship model (compulsory)** | `ml_training/train_stylometric.py` | trained + evaluated here, metrics above |
| Feature analysis | `app/ml/features.py` | 41 features, AST for Python, heuristics elsewhere |
| Mixed-authorship detection | `app/ml/segmentation.py` | per-function scoring, narrowest range wins |
| Confidence & explainability | `app/ml/stylometric.py`, `app/ml/evidence.py` | leave-one-group-out ablation |
| Evaluation interface | `/api/evaluation/run`, Model Evaluation page | upload labelled CSV, get confusion matrix |
| *Bonus* — Code evolution | `/api/evolution/analyze`, `/api/github/evolution` | pasted versions, or real commit history |
| *Bonus* — Repository analysis | `/api/github/analyze`, `/api/repository/upload` | GitHub ref or ZIP |
| *Bonus* — Language generalization | 11 languages | Python strong, others materially weaker |
| *Bonus* — Human review feedback | `/api/feedback` | bound to a real stored prediction |
| *Bonus* — Similarity analysis | `/api/similarity` | cosine distance in the 64-dim fusion space |
| *Bonus* — Agentic investigation | `/api/investigation/run`, `/api/chat` | MCP tool orchestration, transport-tagged audit log |
| *Bonus* — **MCP integration** | `backend/mcp_server.py`, `/api/mcp/*` | server **and** client, 9 tools, JSON-RPC/stdio |

---

## GitHub access

Over the REST API only — no `git` binary, no clone, no shell.

| Endpoint | Purpose |
|---|---|
| `GET /api/github/status` | reachability, token presence, rate-limit headroom |
| `POST /api/github/inspect` | metadata + commit history, no inference |
| `POST /api/github/analyze` | download a ref, score every supported file |
| `POST /api/github/evolution` | score one file at each of its recent commits |

Accepts `owner/repo`, `https://github.com/owner/repo`, `git@github.com:owner/repo.git`, and
`/tree/<branch>` URLs.

```bash
curl -X POST localhost:8000/api/github/analyze \
  -H 'Content-Type: application/json' \
  -d '{"repository_url":"psf/requests","max_files":100}'
```

**Hardening** (every input here is a user-supplied URL):

- Host allow-list — only `api.github.com` and `codeload.github.com`, checked again after
  redirects, so a crafted URL cannot become an SSRF probe.
- `owner`/`repo`/`ref` validated against GitHub's naming rules before reaching a URL.
- Archive download streamed with a hard byte ceiling, aborted on breach.
- Zip entries checked for traversal, symlinks, entry count, and total uncompressed size before
  extraction — none of which `extractall` does for you.
- Tokens read from `GITHUB_TOKEN` or passed per-request, sent only as a bearer header, never
  logged or persisted.

Unauthenticated access is capped at 60 requests/hour. Set `GITHUB_TOKEN` for 5000 and private
repositories.

---

## MCP (Model Context Protocol)

Wired in both directions. The official `mcp` Python SDK needs Python >= 3.10 and
this backend runs on 3.9, so the wire protocol is implemented directly — JSON-RPC
2.0 over newline-delimited stdio, no extra dependencies.

### CodeAuth as an MCP server

[`backend/mcp_server.py`](backend/mcp_server.py) exposes nine tools to any MCP
client — Claude Desktop, Claude Code, or CodeAuth's own agent:

| Tool | Purpose |
|---|---|
| `analyze_code` | score a snippet; returns verdict, evidence, caveats |
| `analyze_functions` | per-function scoring for mixed-authorship detection |
| `get_model_card` | measured metrics **and** the false-positive rate |
| `list_analyses` / `get_analysis` | stored results, full feature values |
| `list_repositories` / `get_repository` | scan results, top flagged files |
| `inspect_github_repository` | GitHub metadata + commit history |
| `github_file_history` | score one file across its commits |

Register it:

```json
{
  "mcpServers": {
    "codeauth": {
      "command": "python3",
      "args": ["/abs/path/to/codeauth/backend/mcp_server.py"]
    }
  }
}
```

The `initialize` response carries the reliability caveat in its `instructions`,
so a client learns the model over-flags real code before it calls anything. Models
load lazily, so `tools/list` is instant; set `MCP_LOAD_HYBRID=1` to also load the
500 MB transformer for second-opinion fields.

### CodeAuth as an MCP client

[`app/services/mcp_client.py`](backend/app/services/mcp_client.py) connects out to
servers declared in `mcp_servers.json` (same shape as Claude Desktop, so an
existing `mcpServers` block pastes straight in).

| Endpoint | Purpose |
|---|---|
| `GET /api/mcp/status` | connect, handshake, list every server's tools |
| `POST /api/mcp/reload` | re-read the config without a restart |
| `POST /api/mcp/call` | invoke one tool on one configured server |

```bash
cp backend/mcp_servers.example.json backend/mcp_servers.json
curl -s localhost:8000/api/mcp/status | jq '.summary'
# "1/1 server(s) connected, 9 tool(s) available"
```

**Security posture** — this spawns child processes, so it is deliberately narrow:

- Servers exist only in the operator-controlled config file. An HTTP caller names
  a server; it can never supply a command, argument, or env var, so the endpoint
  cannot become a remote shell. A request with extra `command`/`args` keys is
  ignored, and there is a test asserting exactly that.
- `shell=False` — direct argv exec, never a shell.
- The child inherits a minimal env plus only the keys the config names.
- Every request is bounded by a timeout; a hung server is terminated, not waited on.

### The agent loop

`POST /api/investigation/run` runs **discover → plan → act → synthesize**:
enumerate tools from every connected server, select by capability against the
requested directive, call them over MCP, then build findings — and attach the
measured false-positive rate as a `critical` finding so an assessment cannot ship
without its own reliability bound.

Every entry in the returned `tool_log` is tagged `mcp` or `local`, with server and
duration, so provenance is never ambiguous. With no server reachable the agent
falls back to direct database reads and says so.

## Assistant

`POST /api/chat` answers questions from this system's own data. It is **not** a wrapper around a
general-purpose LLM — no external model is called. Each question is routed to a tool that reads a
real record, and the reply lists every tool it called so any figure can be traced:

- the trained classifier (live inference on pasted code)
- stored analyses, segments, repositories, feedback, evaluation runs
- the measured model card in `ml_training/*.json`

It reports the calibration warning alongside performance figures instead of quoting the
flattering number alone, and says when data is missing rather than guessing.

---

## Running it

### Backend

```bash
cd backend
pip install -r requirements.txt

# Model artifacts. The checkpoint is Git LFS — without `git lfs pull` you get a
# 134-byte pointer, not 499 MB of weights.
git lfs pull
cp ../authorship_final_model/authorship_hybrid_model.pt model_files/
cp ../authorship_final_model/feature_scaler.pkl        model_files/

# Train the stylometric model (the app runs on this alone if the checkpoint is absent)
python ml_training/fetch_dataset.py --all --limit 2500
python ml_training/train_stylometric.py

uvicorn app.main:app --reload --port 8000
```

`GET /api/health` reports each engine independently. Either one alone is enough to serve
predictions; if the checkpoint is missing, the app runs on the stylometric model and says so.

### Frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173, proxies /api to :8000
```

### Tests

```bash
cd backend && PYTHONPATH=. pytest tests/ -q      # 77 tests
cd frontend && npx tsc -b && npm run build
```

The suite includes regression tests for the two worst bugs found in this codebase: a
catastrophic-backtracking pattern reachable from `/api/analyze`, and a hardcoded decision layer
that made confidence a constant.

---

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `MODEL_DIR` | `./model_files` | where both engines load from |
| `DEVICE` | `auto` | `cpu`, `mps`, `cuda` |
| `DATABASE_URL` | `sqlite:///./codeauth.db` | |
| `GITHUB_TOKEN` | — | raises the rate limit, enables private repos |
| `CORS_ORIGINS` | `localhost:5173,localhost:3000` | |

---

## Limitations

- **A verdict is not proof of authorship.** It describes surface style. Do not base an academic
  or employment decision on it.
- **64% false positives on real human code.** See the top of this document. This is the single
  most important number here.
- **Formatting dominates at 76.6% of importance.** Running a formatter can flip a verdict without
  any authorship change.
- **Non-Python is materially weaker** — 0.814 C++, 0.764 Java. Those languages use regex-based
  structure extraction rather than a real AST, and are under-represented in training.
- **Short inputs carry no signal.** Under 5 non-blank lines returns `INCONCLUSIVE` with confidence
  0 rather than a number that looks meaningful.
- **No authentication.** The API is unauthenticated and intended for local or trusted-network use.
- **Submitted code is never executed** — parsed statically via AST and tokenizers only.

[ds]: https://huggingface.co/datasets/LTPhong/CSC15011_Detecting_AI-Generated_Code
