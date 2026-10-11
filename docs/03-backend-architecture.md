# 03 · Backend architecture

> Goal: every answer is **cited, versioned, and numerically correct**, and the department can run it with one command.

## 1. Design principles

1. **The LLM explains, the code computes.** Every number that comes from a table (setback, fee, FAR, clearance, validity) is produced by a deterministic, unit-tested function that carries its rule and page reference.
2. **No citation, no answer.** Rule numbers and quotes on screen come from **Claude Citations API metadata** (exact character spans of the source), never from the model's free text.
3. **Version-aware.** Every response carries `rules_version` and any amendment that touches the cited rules.
4. **Whole book, no retrieval misses.** The cleaned rulebook (~85 K tokens) is sent in full on every call as a **prompt-cached prefix**. A vector DB is not needed.
5. **Boring, portable stack.** One Python service with SQLite and static frontend files. `docker compose up` works on any BMC/MPSeDC VM. No government system integration.

## 2. High-level architecture

```
┌──────────────────────────── Browser (clerk's PC) ────────────────────────────┐
│  React SPA: Ask │ Plot Check │ PDF viewer (pdf.js) │ Rule slip (print)        │
└──────────────┬─────────────────────────────────────────────▲─────────────────┘
               │ POST /api/ask (SSE stream)                   │ GET /pdf/en#page=77
               │ POST /api/plot-check                         │
┌──────────────▼─────────────────────────────────────────────┴─────────────────┐
│                         FastAPI app  (uvicorn, 1 container)                   │
│                                                                               │
│  ┌──────────────┐   ┌─────────────────┐   ┌──────────────────────────────┐   │
│  │ Query intake  │──▶│ Router          │──▶│ Answer engine (Claude)       │   │
│  │ lang detect   │   │ • out-of-scope  │   │ • cached rulebook docs       │   │
│  │ normalise     │   │   pre-filter    │   │ • citations ON               │   │
│  │ (units, HI    │   │ • fact extract  │   │ • tools → calculators        │   │
│  │  numerals)    │   │   (plot, road)  │   │ • streaming                  │   │
│  └──────────────┘   └─────────────────┘   └──────────────┬───────────────┘   │
│                                                           │                   │
│  ┌──────────────────────────┐   ┌─────────────────────────▼────────────────┐ │
│  │ Calculators (pure Python) │◀──│ Verifier                                 │ │
│  │ front/rear/side setback   │   │ • ≥1 citation else NOT_FOUND             │ │
│  │ permission & app fee      │   │ • every number ∈ citations ∪ tool output │ │
│  │ FAR / max built-up        │   │ • map citation → rule, sub-rule, page    │ │
│  │ electric clearance        │   │ • attach amendment overlay + version     │ │
│  │ validity dates (R.23)     │   └─────────────────────────┬────────────────┘ │
│  └──────────────────────────┘                             │                   │
│                                                           ▼                   │
│  ┌─────────────────────────────── Data layer ─────────────────────────────┐  │
│  │ rules_clean.jsonl · page_map.json · tables/*.json · amendments.json     │  │
│  │ glossary_hi.json · pdf/en.pdf · pdf/hi.pdf · app.db (SQLite: logs,      │  │
│  │ feedback, eval runs; no personal data)                                  │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────────┘
                     │ HTTPS (only outbound call)
                     ▼
              Anthropic Messages API (claude-opus-5-5)
```

## 3. Repository layout

```
bhumi-vikas-sahayak/
├─ backend/
│  ├─ app/
│  │  ├─ main.py              # FastAPI app, routes, static files
│  │  ├─ config.py            # env: ANTHROPIC_API_KEY, MODEL, EFFORT, RULES_VERSION
│  │  ├─ ingest/
│  │  │  ├─ clean.py          # strip headers, split COMMENTS, footnotes → amendments
│  │  │  ├─ page_map.py       # char offset → PDF page (from running headers)
│  │  │  └─ aliases.py        # 17-a→17, 42A→42, 26-B, 2(5)(c) parser
│  │  ├─ calculators/
│  │  │  ├─ setbacks.py       # Rule 56(1),(2),(3), 53(1), 42 T4/T5
│  │  │  ├─ fees.py           # Rule 21(2), 21(3)(a),(b),(c)
│  │  │  ├─ far.py            # Rule 61 Table 8, 17, 17-a
│  │  │  ├─ electric.py       # Rule 52
│  │  │  └─ validity.py       # Rule 23
│  │  ├─ llm/
│  │  │  ├─ prompt.py         # system prompt (frozen → cacheable)
│  │  │  ├─ documents.py      # builds 106 + N amendment document blocks
│  │  │  ├─ tools.py          # tool schemas (strict) → calculators
│  │  │  └─ engine.py         # stream, tool loop, citation collection
│  │  ├─ verify.py            # NOT_FOUND gate, number check, overlay
│  │  ├─ router.py            # out-of-scope prefilter, fact extraction
│  │  └─ store.py             # SQLite (questions, answers, feedback)
│  ├─ data/                   # generated + hand-curated JSON (committed)
│  │  ├─ tables/rule21_fees.json, rule56_setbacks.json, rule61_far.json, ...
│  │  ├─ amendments.json
│  │  └─ glossary_hi.json
│  └─ tests/                  # pytest: every table row, boundaries, slab gaps
├─ frontend/                  # React + Vite (see 04-frontend-design.md)
├─ eval/
│  ├─ gold.jsonl              # 17 sample + ~30 team-written questions
│  └─ run_eval.py             # scores rule hit, number exact, not-found
├─ docker-compose.yml · Dockerfile · .env.example · LICENSE (MIT) · README.md
```

## 4. Ingestion pipeline (run once at build time: `python -m app.ingest`)

```
bhumi_vikas_rules.jsonl ──▶ clean.py ──▶ rules_clean.jsonl
                                │            { rule, title, part, page_start, page_end,
                                │              text_clean, comments[], amendments[],
                                │              aliases[], page_spans[[start_char,end_char,page]] }
fulltext_by_page.txt ───▶ page_map.py ──▶ page_spans (exact page for any char offset)
hand-curated ───────────▶ tables/*.json (+ pytest against values read off the PDF)
amendments.json ────────▶ validated (pydantic) and appended as extra documents
```

**Cleaning rules**
- Remove running headers (`Rule 56   M.P. Bhumi Vikas Rules, 2012   78`) but record `78` as a page boundary at that offset → `page_spans`.
- Cut everything from a line matching `^\s*COMMENTS\s*$` up to the next rule heading into `comments[]` (case law, labelled "Court note, not a rule").
- Footnote blocks `Subs./Ins./Inserted by Notification No. … dated …` → `amendments[] = {kind, notification, date, gazette}`.
- Keep the table spacing as-is (citations quote it verbatim; the UI renders it in monospace).

**Table JSON format (example `rule56_setbacks.json`)**
```json
{
  "rule": "56", "sub_rule": "(1)(a)", "page": 77,
  "applies_if": {"use": "residential", "height_max_m": 12.5},
  "key": "street_width_m",
  "rows": [
    {"gt": null, "lte": 9.0,  "value_m": 3.0, "label": "Up to 9.0 meters"},
    {"gt": 9.0,  "lte": 12.0, "value_m": 3.6, "label": "More than 9.0 meters and up to 12 meters"},
    {"gt": 12.0, "lte": 18.0, "value_m": 4.5, "label": "More than 12.0 meters and up to 18 meters"},
    {"gt": 18.0, "lte": null, "value_m": 6.0, "label": "Above 18 meters"}
  ],
  "source_text": " 1.    Up to 9.0 meters                                            3.0 meters"
}
```
Every calculator result returns `{value, unit, rule, sub_rule, page, row_label, source_text, notes[], edge_case: bool}`, so the UI can show *which row* was used.

## 5. Calculators (deterministic, offline, tested)

| Function | Inputs | Output | Rule |
|---|---|---|---|
| `front_open_space(street_width_m, height_m, existing_developed=False)` | | metres + row; if height > 12.5 → delegate to `high_building_norms` | 56(1) |
| `rear_open_space(plot_area_sqm, height_m)` | | metres + row | 56(2) |
| `side_open_space(building_type, height_m, frontage_m)` | | per-side metres + provisos | 56(3) |
| `building_type_options(plot_area_sqm, frontage_m)` | | detached / semi / row eligibility | 53(1) |
| `high_building_norms(road_width_m, plot_area_sqm, frontage_m, height_m)` | | eligible row of Table 4/5 or "not eligible because…" | 42 |
| `far_limit(use, category, plot_area_sqm)` | | FAR, max built-up, DP caveat | 61 T8, 103 |
| `building_permission_fee(built_up_sqm, use, high_rise)` | | permission fee + application fee + total, slab row, edge-case flag | 21(2),(3)(b),(c) |
| `development_permission_fee(area_ha, landuse, population_band="gt10lakh")` | | Rs | 21(2)(i), 21(3)(a) |
| `electric_clearance(line_type)` | | vertical/horizontal m | 52 |
| `permission_validity(grant_date, revalidations=0, applied_before_expiry=True)` | | expiry, max-date, fee note | 23 |
| `farmhouse_check(plot_ha, far, height_m, road_m)` | | pass/fail per clause | 17 |

**Tests** (`pytest -q`, run in CI): every table row, every boundary (9.0, 9.01, 12.0, 150, 150.01, 225, 75.5 slab gap), units (sq ft → sq m with a warning), and negative or zero inputs rejected.

## 6. Answer engine (Claude)

### 6.1 Model and settings
| Setting | Value | Why |
|---|---|---|
| Model | `claude-opus-5-5` (env `MODEL`) | Best accuracy on legal text and Hindi |
| Thinking | adaptive (default; cannot be disabled on Opus 5.5) | |
| Effort | `low` for Ask (latency), `medium` for eval runs (env `EFFORT`) | Default for Opus 5.5 is `medium`; set it explicitly |
| Streaming | yes (SSE to the browser) | First token in about 1 to 2 s |
| Fallbacks | `fallbacks: "default"` + beta `server-side-fallback-2026-07-01` | A refusal on harmless legal text is rare, but it must never blank the counter screen |
| Prompt cache | breakpoint after the last rule document | ~85 K cached tokens; reads at $0.20/MTok ≈ **$0.02 per question** |
| Pre-warm | one `max_tokens: 0` call at startup and every 4 min while the office is open | Avoids a cold first answer |

### 6.2 Request shape (cache-stable order: tools → system → documents → question)
```python
# llm/engine.py (sketch)
docs = [
    {
        "type": "document",
        "source": {"type": "text", "media_type": "text/plain", "data": r["text_clean"]},
        "title": f"Rule {r['rule']}: {r['title']}",
        "context": f"{r['part']} | PDF pages {r['page_start']}-{r['page_end']} | rules consolidated to 6 Mar 2025",
        "citations": {"enabled": True},
    }
    for r in RULES                      # 106 rule docs, fixed order
] + [amendment_doc(a) for a in AMENDMENTS]   # e.g. "Amendment 28-08-2026 to Rule 2(5)(c)"
docs[-1]["cache_control"] = {"type": "ephemeral"}   # cache everything above

with client.beta.messages.stream(
    model=settings.MODEL,               # "claude-opus-5-5"
    max_tokens=4000,
    system=SYSTEM_PROMPT,               # frozen text, no timestamps
    tools=CALCULATOR_TOOLS,             # strict JSON schemas, deterministic order
    output_config={"effort": settings.EFFORT},
    betas=["server-side-fallback-2026-07-01"],
    fallbacks="default",
    messages=[{"role": "user", "content": docs + [{"type": "text", "text": question_block}]}],
) as stream:
    ...  # forward text deltas over SSE; run tool_use → calculators → tool_result; loop
```
*Notes:* citations cannot be combined with `output_config.format` (structured outputs), so the answer stays as text with citations, and structure comes from tools and the verifier. Tool choice stays `auto` (forced tool choice is not supported on Opus 5.5); the prompt tells the model to call the calculator. Thinking is on: pass assistant content blocks back unchanged in the tool loop.

### 6.3 System prompt (core contract)
```
You help a Bhopal Municipal Corporation building-permission clerk look up the
MP Bhumi Vikas Rules, 2012 (consolidated to 6 March 2025) plus listed later amendments.

Rules:
1. Answer ONLY from the provided rule documents and amendment documents. Cite every claim.
2. For any number from a table (open spaces, fees, FAR, clearances, validity), call the
   matching calculator tool and use its result. Never compute or read table numbers yourself.
3. If the documents do not answer the question, reply exactly: NOT_FOUND: <one line on
   which authority or law likely covers it>. Do not guess.
4. If a later amendment changes a cited rule, follow the amendment and say so.
5. If the Development Plan may override (FAR, density, land use), say so (Rule 103).
6. Reply in the user's language (English or Hindi, Devanagari). Keep rule numbers,
   units and numerals as digits. Use the glossary terms. Quotes stay in English.
7. Format: first line = direct answer (≤ 25 words). Then up to 4 short bullets.
   No legal advice; the clerk decides.
```

### 6.4 Tools exposed to Claude
`front_open_space`, `rear_open_space`, `side_open_space`, `building_type_options`, `high_building_norms`, `far_limit`, `building_permission_fee`, `development_permission_fee`, `electric_clearance`, `permission_validity`, `farmhouse_check`. All have `strict: true`, `additionalProperties: false`, and units in field names (`plot_area_sqm`, `street_width_m`).

## 7. Router and pre-processing (cheap, before the LLM)

1. **Language detect**: any Devanagari → `hi`. Convert Devanagari digits (२००) to ASCII. Map units: "वर्ग मीटर / sq m / sqm / m²", "फीट / sq ft" (convert sq ft to sq m and warn).
2. **Fact extraction** (regex): plot area, road width, height, floors, use. These are passed to the LLM as a `known_facts` block and pre-fill the Plot Check form ("Open in Plot Check →").
3. **Out-of-scope prefilter**: keywords such as *property tax, market rate, guideline rate, registry, mutation, water bill* → instant NOT_FOUND card with a "where to go" hint. It still logs. The LLM path is the backstop, so the prefilter only has to be precise, not complete.
4. **Rule-number shortcut**: "rule 56", "नियम 56", "17-a" → open that rule directly (no LLM call).

## 8. Verifier (post-processing, the trust layer)

```
answer_blocks ─▶ collect citations ─▶ if text starts NOT_FOUND or citations == 0 → NotFound card
                                      │
                                      ├─▶ map citation (document_index, char range)
                                      │      → rule id, sub-rule (regex on preceding "(n)(a)"),
                                      │        exact PDF page via page_spans
                                      ├─▶ numbers in answer text (regex, incl. Devanagari digits)
                                      │      each must appear in: cited_text ∪ tool outputs ∪ question
                                      │      else mark ⚠ "unverified number" (shown in amber)
                                      ├─▶ amendment overlay: any cited rule with a later amendment
                                      │      → banner + version string
                                      └─▶ confidence = high | check (if any ⚠ or edge_case)
```

## 9. API contract

### `POST /api/ask` → `text/event-stream`
Request:
```json
{ "question": "My plot is 200 sq m on a 9 m road ...", "lang": "auto" }
```
Events: `delta` (streamed text) → `tool` (`{"name":"rear_open_space","result":{...}}`) → `final`:
```json
{
  "id": "q_01J…",
  "status": "answered",                 // answered | not_found | error
  "lang": "en",
  "answer_md": "Leave **3.0 m** at the front ...",
  "facts": [
    {"label": "Front open space", "value": "3.0 m", "rule": "56(1)(a)", "page": 77, "source": "calculator"},
    {"label": "Rear open space",  "value": "2.5 m", "rule": "56(2)(a)", "page": 78, "source": "calculator"}
  ],
  "citations": [
    {"rule": "56", "sub_rule": "(1)(a)", "title": "Residential Buildings", "page": 77,
     "quote": "1.    Up to 9.0 meters    3.0 meters", "pdf_url": "/pdf/en#page=77",
     "hi_pdf_url": "/pdf/hi#page=77"}
  ],
  "amendments": [],
  "rules_version": "Consolidated 06-03-2025 + amendment 28-08-2026 (Rule 2(5)(c))",
  "warnings": [],                       // e.g. "Bhopal Development Plan may set a different FAR (Rule 103)"
  "confidence": "high",
  "latency_ms": 4800,
  "disclaimer": "Reference aid only, not legal advice."
}
```

### `POST /api/plot-check` (no LLM, < 50 ms)
```json
{ "plot_area_sqm": 200, "street_width_m": 9, "frontage_m": 10, "height_m": 10,
  "use": "residential", "building_type": "semi_detached", "built_up_sqm": 250 }
```
→ `{ "results": [ {label, value, rule, sub_rule, page, row_label, source_text, edge_case} … ], "rules_version": … }`

### Other endpoints
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/rules` | List of rules (number, title, part, pages) for the browse drawer |
| GET | `/api/rules/{id}` | Clean text, comments, amendments (`17-a` resolves to 17) |
| GET | `/api/meta` | rules_version, amendments, model, eval accuracy |
| POST | `/api/feedback` | `{id, verdict: "correct"\|"wrong", note}`. No personal data. |
| GET | `/pdf/en`, `/pdf/hi` | Static PDFs (official copies) |
| GET | `/healthz` | Liveness, API key present, cache warm |

## 10. Storage (SQLite, `app.db`)

| Table | Columns |
|---|---|
| `qa_log` | id, ts, lang, question, status, rules_cited, latency_ms, input_tokens, cache_read_tokens, output_tokens, model |
| `feedback` | qa_id, ts, verdict, note |
| `eval_runs` | run_id, ts, model, effort, score_rule, score_number, score_notfound, details_json |

**Privacy:** the UI warns the clerk not to type names or phone numbers. The router masks 10-digit numbers and emails before logging. Logs are retained for 90 days.

## 11. Evaluation harness (`eval/run_eval.py`)

`gold.jsonl` row:
```json
{"id": "S10", "q": "What is the minimum rear open space for a 150 sq m residential plot?",
 "lang": "en", "expect_status": "answered", "expect_rules": ["56"], "expect_numbers": ["1.5"],
 "must_not": ["2.5"]}
```
Metrics: **rule hit** (an expected rule is among the citations), **number exact** (all expected numbers present, none of `must_not`), **not-found correctness**, latency p50/p95, cost per question. The output is a markdown table that is pasted into the README and served at `/api/meta`. Target: **≥ 16/17** on the sample set and **100%** on the table-number questions.

## 12. Deployment and operations

```yaml
# docker-compose.yml
services:
  app:
    build: .
    ports: ["8000:8000"]
    env_file: .env            # ANTHROPIC_API_KEY=..., MODEL=claude-opus-5-5, EFFORT=low
    volumes: ["./var:/app/var"]   # app.db
```
- Multi-stage Dockerfile: Node builds `frontend/dist`, then a Python slim image serves the API and the static files from one origin (no CORS).
- **Secrets**: only through `.env` (git-ignored); `.env.example` is committed. Check with `git grep -n "sk-ant"` before pushing.
- **Resilience**: if the API is unreachable, `/api/ask` returns `status:error` with a "Use Plot Check or browse the rule" fallback; Plot Check and the rule browser keep working offline.
- **Cost guard**: `MAX_QUESTIONS_PER_DAY` env; a token usage summary on `/api/meta`.
- **Updating rules after the event**: add an entry to `amendments.json` (or replace the JSONL with a new consolidation), run `python -m app.ingest && pytest && python eval/run_eval.py`. The version badge updates automatically.

## 13. Performance budget

| Step | Target |
|---|---|
| Router + facts | < 20 ms |
| First streamed token (cache warm) | ≈ 1.5 s |
| Full answer incl. 1 to 3 tool calls | 4 to 8 s |
| Plot Check | < 50 ms |
| Cost per question (cache hit) | ≈ $0.02 to $0.04 |
