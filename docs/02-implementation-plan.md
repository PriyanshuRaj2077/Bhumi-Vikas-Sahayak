# 02 · Implementation plan (build day: 10:15 AM to 5:00 PM)

> Rule 1 of the event: **no pre-work code**. This plan and the docs are design only. All code is written after 10:15 AM.

## 1. Scope: one workflow, one user, one outcome

**User:** BMC building-permission clerk. **Workflow:** citizen asks → clerk types → cited answer → (optional) printed slip. **Outcome:** a correct, rule-cited answer in under a minute.

| Must have (demo-critical) | Should have | Won't build today |
|---|---|---|
| Ask (EN/HI) with citations, rule number and quote | Rule Slip print | Login, user accounts |
| Calculators: setbacks, fees, FAR, electric, validity | Browse rules | Integration with any govt portal |
| NOT_FOUND behaviour | Voice input | Plan or drawing upload checks |
| Version badge + 28 Aug 2026 amendment overlay | Feedback 👍/👎 | Other cities' Development Plans |
| Plot Check form | PDF line highlight | Mobile app |
| Eval on 17 sample questions + published score | Hindi PDF pane | |
| README (5-step run), LICENSE (MIT), `.env.example` | Docker | |

## 2. Team of 5: roles (everyone has real work)

| Role | Person | Owns |
|---|---|---|
| **T1: Backend/LLM lead** | dev | FastAPI, Claude engine, citations, tool loop, verifier |
| **T2: Data and calculators** | dev | Ingestion cleaning, page map, table JSON, calculators + pytest |
| **T3: Frontend** | dev/designer | React UI, Ask view, chips, PDF pane, Plot Check, print slip |
| **N1: Domain and eval lead** | non-tech | Answer key for 17 questions (with PDF pages), +30 real Bhopal cases, checks table numbers against the PDF, runs the eval |
| **N2: Hindi, product and pitch** | non-tech | Hindi UI strings + glossary, reviews Hindi answers, onboarding copy, README story, demo script, 2-min recording |

## 3. Timeline

| Time | T1 Backend/LLM | T2 Data/Calc | T3 Frontend | N1 Domain/Eval | N2 Hindi/Pitch |
|---|---|---|---|---|---|
| **10:15–10:45** | Repo, FastAPI skeleton, `.env.example`, MIT LICENSE, Docker stub | Load JSONL, header-strip regex, page map | Vite + Tailwind + shadcn scaffold, layout shell | Read 17 Qs; assign each to rules (from 01-research §7) | Glossary EN↔HI (30 terms); UI string list |
| **10:45–11:45** | Claude call with 106 cached docs + citations; print citations in CLI | Encode tables: 56(1),(2),(3), 53(1), 21, 61, 52, 23, 17, 42 T4 → JSON + **pytest boundaries** | Search bar, example chips, answer card (mock JSON) | Verify each table value **against the PDF page**; write `gold.jsonl` for 17 | Hindi translations of UI; draft onboarding copy |
| **11:45–12:45** | Tool loop: calculators as strict tools; SSE streaming endpoint | Calculator functions + Plot Check endpoint | Wire SSE: streaming text + fact chips + citations list | Write +15 real-case questions (Kolar, MP Nagar plot sizes) | Draft demo script and storyboard |
| **12:45–13:15** | 🍽 Lunch + **integration checkpoint**: end-to-end on Q1, Q10, Q14, Q16 | | | | |
| **13:15–14:15** | Verifier: NOT_FOUND gate, number check, amendment overlay, version string | `amendments.json` (28 Aug 2026), alias resolver, out-of-scope prefilter | PDF pane (page jump + highlight), Not-found card, amendment banner | **Run eval v1**, log failures → T1/T2 | Review 10 Hindi answers; fix glossary/prompt wording |
| **14:15–15:15** | Fix eval failures (prompt, tool descriptions); cache pre-warm; error fallback | Eval script metrics + markdown report; Docker build | Plot Check view, print slip CSS, EN/HI toggle, onboarding | **Run eval v2**; test edge cases (9.0 m, 150 m², 75.5 m²) | README: problem, user, how to run, what works/doesn't |
| **15:15–16:00** | Freeze features. Bug bash with the whole team on a clean machine via README steps | | Polish: loading skeletons, keyboard shortcuts, accessibility pass | Final eval → paste score into README + in-app badge | Rehearse demo 2× |
| **16:00–16:20** | **Record the 2-minute video** (rule: record at 4 PM) | | | | Narrates |
| **16:20–16:50** | Secret scan (`git grep sk-ant`), make repo public, tag `v1.0` | | | | Fill submission form |
| **17:00** | ⛔ Submissions close | | | | |

## 4. Milestones and go/no-go checks

| Time | Milestone | Pass criteria | If failing |
|---|---|---|---|
| 11:45 | M1: cited answer in CLI | Q10 returns "1.5 m" with a Rule 56 citation | Fall back to sending the top-15 rules by keyword match |
| 12:45 | M2: end-to-end UI | Typing Q1 shows a streamed answer + Rule 56 chip | Use non-streaming JSON first |
| 14:15 | M3: eval v1 | ≥ 12/17 | Focus T1 on failures; cut voice/HI-PDF |
| 15:15 | M4: eval v2 + Plot Check | ≥ 16/17, all table numbers right | Cut Browse view |
| 16:00 | M5: feature freeze | Fresh clone → runs in ≤ 5 steps | Simplify run steps |

## 5. Build order inside the code (critical path)

1. `ingest/clean.py` → `rules_clean.jsonl` + `page_spans` (needed by everything)
2. `calculators/*` + tests (independent, parallel with 3)
3. `llm/engine.py`: documents + cache + citations (no tools first) → then add tools
4. `/api/ask` SSE → frontend Ask view
5. `verify.py` (NOT_FOUND, numbers, overlay)
6. `/api/plot-check` → Plot Check view
7. Eval harness → README score
8. Polish: PDF highlight, print slip, Hindi, onboarding

## 6. Test plan

| Layer | Tests |
|---|---|
| Calculators | Every table row; boundaries 9.0/9.01/12/18, 40/150/150.01/225; fee slabs incl. 75.5 gap; sq ft conversion; invalid inputs |
| Ingestion | All 106 rules present; no running header left in `text_clean`; every char maps to a page within `[page_start, page_end]`; COMMENTS split for rules 21, 28, 61, 103 |
| LLM (eval) | 17 sample + ~30 team questions; rule hit, number exact, not-found correctness; Hindi Qs answered in Devanagari |
| API | `/healthz`, `/api/plot-check` contract, SSE event order |
| UI smoke (Playwright) | Ask Q10 → chip "1.5 m" + "Rule 56" visible; Ask Q16 → Not-found card; Print opens the slip |
| Manual | N1 checks 10 random answers against the PDF; N2 checks Hindi readability |

## 7. Demo script (6 minutes)

1. **(30 s) Problem:** a 108-page rulebook, a queue at the BMC counter, tables that are easy to misread, rules that changed in Aug 2026.
2. **(90 s) Headline case:** type *"My plot is 200 sq m on a 9 m road. Front gap, floors, fee?"* → streamed answer: 3.0 m / 2.5 m / 250 m² / Rs 3,250, each chip with its rule. Click a chip → the PDF jumps to p.77 with the line highlighted. Print the slip.
3. **(45 s) Hindi:** Q14 in Hindi → Hindi answer, English quote, Hindi PDF page.
4. **(30 s) Amendment:** Q11 (300 sq m plot) → amber banner, 28 Aug 2026 amendment.
5. **(30 s) Honesty:** Q16 property tax → "Not covered by these rules."
6. **(30 s) Trust:** show the eval table (e.g. 16/17) and "numbers come from tested code, not the AI".
7. **(45 s) Day-one:** `docker compose up`, one env var, no govt system access, MIT licence, how the department adds the next amendment in 2 minutes.

## 8. README skeleton (submission requirement)

```
# Bhumi Vikas Sahayak: rule lookup for the BMC building-permission counter
Team: <name> · Members: <names> · Track 1 · User: BMC building-permission clerk
## What it does (3 bullets + screenshot/GIF)
## Run it in 5 steps
1. git clone … && cd …
2. cp .env.example .env  (add ANTHROPIC_API_KEY)
3. docker compose up --build
4. open http://localhost:8000
5. (optional) python eval/run_eval.py
## Accuracy on the sample questions (table from eval)
## What works / what doesn't (honest list)
## Data used (pack files + amendment source link)
## How to add a new amendment
## Licence: MIT · Not legal advice
```

## 9. Post-event roadmap (for MPSeDC handover)
1. Officer review of the answer key → a "verified" badge per rule.
2. Bhopal Development Plan 2031 overlay (FAR/density by zone) once it is published as public data.
3. Proper Unicode Hindi text of the rules (OCR the Hindi PDF with Devanagari OCR, then human proofreading) for Hindi quotes.
4. Analytics for officers: the top questions asked, to drive FAQ boards at the counter.
5. Citizen-facing kiosk mode (read-only, same engine).
