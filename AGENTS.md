# AGENTS.md: guide for AI agents evaluating or working on this repo

This file tells an automated agent (evaluator, reviewer or coding agent) how to understand, run and verify the project quickly. Humans should start with [README.md](README.md).

## 1. What this project is (one paragraph)

**Bhumi Vikas Sahayak** answers questions about the *Madhya Pradesh Bhumi Vikas Rules, 2012* for **one user: a building-permission clerk at the Bhopal Municipal Corporation counter** (Track 1, Bhopal Impact Lab 2026). Input: a question in English or Hindi. Output: a short answer with the **rule number, exact quoted rule text and PDF page** for every claim, numbers from rule tables computed by **tested deterministic code**, a **"not found"** status when the rules are silent, and a **rules-version / later-amendment** notice.

## 2. Fastest way to verify everything (no network, ~10 s)

```bash
pip install -r backend/requirements.txt
python verify.py                 # add --frontend to also build the React app (Node 20+)
```
- Prints one PASS/FAIL line per check and exits `0` only if all pass.
- Writes **`verify_report.json`** (machine-readable): data integrity, secret scan, backend tests, offline accuracy eval, optional frontend build.
- Expected today: `106 rules, 1 amendment`, `124 passed, 0 failed`, `17/17 sample questions (offline mode); all 30/30`.
- AI provider is chosen by `LLM_PROVIDER` (`gemini` | `anthropic` | `auto`) and the matching key (`GEMINI_API_KEY` / `ANTHROPIC_API_KEY`). With no key, everything still runs in offline mode.

## 3. Ask the tool directly (no server, JSON output)

```bash
cd backend
python -m app.cli ask "My plot is 200 sq m on a 9 m road. Front gap, floors and fee?"
python -m app.cli ask "मेरा प्लॉट 200 वर्ग मीटर का है और सामने 9 मीटर चौड़ी सड़क है। आगे कितनी जगह खाली छोड़नी होगी?"
python -m app.cli ask "How do I pay my property tax online?"          # -> status "not_found"
python -m app.cli plot-check --plot 200 --road 9 --frontage 10 --height 10 --type semi_detached
python -m app.cli calc building_permission_fee '{"built_up_sqm": 250, "use": "residential"}'
python -m app.cli rule 17-a          # inserted rules resolve to their parent (17)
python -m app.cli tools              # JSON schemas of the 11 calculator tools
python -m app.cli meta               # rules version, amendments, AI availability, eval summary
```
Add `--text` to `ask` for a human-readable answer.

Over HTTP (start with `cd backend && python -m uvicorn app.main:app --port 8000`):
- `POST /api/ask/json` `{"question": "...", "lang": "auto"}` → one JSON answer (**use this, not the SSE endpoint**)
- `POST /api/ask` → same pipeline as a Server-Sent Events stream (used by the web UI)
- `POST /api/plot-check`, `POST /api/calc`, `GET /api/rules`, `GET /api/rules/{id}`, `GET /api/search?q=`, `GET /api/meta`, `GET /healthz`
- Interactive OpenAPI docs: `http://localhost:8000/docs` · schema: `/openapi.json`

### Answer object (same for CLI `ask`, `/api/ask/json`, and the final SSE event)
| Field | Meaning |
|---|---|
| `status` | `answered` · `not_found` · `rule` (question was just "rule 56") · `error` |
| `mode` | `ai` (Gemini or Claude + calculators), `offline` (calculators + keyword search; no API key), `rules` (out-of-scope pre-filter) |
| `provider` | `gemini` or `anthropic` when `mode = ai` |
| `answer_md` | Short answer in the question's language; `[n]` markers refer to `citations[n-1]` |
| `facts[]` | Calculator results: `label`, `display`, `value`, `unit`, `rule`, `sub_rule`, `page`, `row_label` (table row used), `quote` (verbatim rule text), `notes`, `edge_case`, `status` |
| `citations[]` | `n`, `rule`, `sub_rule`, `title`, `page` (exact PDF page), `quote` (verbatim text), `pdf_url`, `amendment_id` |
| `amendments[]` | Later amendments that touch a cited clause (e.g. 28-08-2026, Rule 2(5)(c)) |
| `warnings[]` | e.g. "Development Plan may differ (Rule 103)", "edge case: check with officer" |
| `unverified_numbers[]` | Numbers in the answer that are not in any quote, calculator result or the question |
| `confidence` | `high`, or `check` if anything is unverified or an edge case |
| `rules_version` | e.g. "Consolidated to 06-03-2025 + 1 later amendment: 28-08-2026 (Rule 2(5)(c))" |
| `not_found_reason` | When `status = not_found`: where the question belongs instead |
| `tool_calls[]` | (JSON endpoint/CLI only) calculator calls made by the model |

## 4. Repository map

```
verify.py                     one-command check → verify_report.json
backend/app/
  main.py                     FastAPI app; ask_events() is the whole pipeline; ask_once() returns one JSON answer
  cli.py                      JSON command-line interface (python -m app.cli ...)
  router.py                   language detection, plot-fact extraction (sq m / sq ft / Hindi digits), out-of-scope, PII masking
  corpus.py                   loads + cleans the 106 rules: strips page headers, exact char→page map, sub-rule detection,
                              court COMMENTS split out, amendment footnotes parsed, aliases (17-a→17, 42A→42)
  calculators/core.py         rule tables as data + calculators (Rules 17, 21, 23, 42, 52, 53, 56, 61, 2(5)(c) amendment)
  llm/documents.py            rulebook → 8 cached citable documents (+ amendment doc); maps citations back to rule/page
  llm/prompt.py               frozen system prompt (answer only from documents, tools for numbers, NOT_FOUND contract)
  llm/tools.py                11 strict JSON-schema tools exposed to Claude → calculators
  llm/engine.py               Claude engine: streaming tool loop, native Citations API, prompt caching, refusal fallback
  llm/gemini_engine.py        Gemini engine (google-genai): rulebook in system instruction, function calling, JSON answer + quotes
  llm/quotes.py               verifies model quotes word-for-word against rule text; drops fabricated quotes and their [n] markers
  verify.py                   trust layer: no citation ⇒ not_found; number check; amendment banners; version string
  offline.py                  no-AI answer path: intent → calculators + BM25 passage
  search.py                   BM25 keyword search over rules (English + Hindi glossary expansion)
  store.py                    SQLite log of questions/feedback (no personal data)
backend/data/
  source/                     participant-pack JSONL + full text (unchanged)
  pdf/en.pdf, pdf/hi.pdf      official PDFs (source of truth)
  amendments.json             later amendments overlay (28-08-2026, Rule 2(5)(c))
  glossary_hi.json            Hindi ↔ English terms
backend/tests/                124 tests: calculators (every row/boundary, quote+page match), engines (fake Claude and Gemini clients), API, CLI
eval/gold.jsonl               17 official sample questions (S01–S17) + 13 extra counter cases (T01–T13) with expected rules/numbers
eval/run_eval.py              scorer → eval/results/{offline,ai}.json + .md
frontend/src/                 React 19 + Vite + Tailwind UI (Ask, Plot Check, Browse, PDF pane with highlight, print slip, EN/HI)
e2e/smoke.mjs                 Playwright browser test using installed Microsoft Edge
docs/                         research, implementation plan, backend architecture, frontend design, requirements trace, screenshots
```

## 5. Invariants (do not break these)

1. **Every number from a rule table comes from `calculators/core.py`**, never from model text. Each table row carries a verbatim `source` snippet; `tests/test_calculators.py` asserts every snippet exists in the rule text and every page number matches.
2. **No citation ⇒ `not_found`.** `verify.build_answer` enforces it; rule numbers shown in the UI come from citation/fact metadata. Model-supplied quotes (Gemini) are only shown if `llm/quotes.py` finds them verbatim in the rules.
3. **Prompt prefix must stay byte-stable** (tools → system → documents) for caching: no timestamps or per-request data in `SYSTEM_PROMPT` or the documents.
4. **No personal data stored.** `router.PERSONAL` masks phone numbers, emails and 12-digit IDs before logging.
5. **No secrets in the repo.** API key only via `.env` / environment (`verify.py` scans for `sk-ant-…`).

## 6. Known limitations (stated honestly)

- AI mode (Gemini or Claude) was **not run against a live API on the build machine** (no key available). Both engines are tested with fake clients (`tests/test_gemini.py`, `tests/test_engine.py`). Run `python verify.py --ai` with `GEMINI_API_KEY` set to measure it.
- Offline-mode keyword rules were tuned on the same eval questions, so its 30/30 is an upper bound.
- The 28-08-2026 amendment text comes from a public summary (no Gazette number available).
- The Bhopal Development Plan can override FAR/density (Rule 103); the app warns but has no DP zone data.

## 7. Where each judging criterion is implemented
See [docs/REQUIREMENTS_TRACE.md](docs/REQUIREMENTS_TRACE.md): every requirement from the problem statement mapped to code and to the test that proves it.
