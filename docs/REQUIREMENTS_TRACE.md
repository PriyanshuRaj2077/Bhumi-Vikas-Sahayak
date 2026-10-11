# Requirements trace: problem statement → code → proof

Source of requirements: Track 1 problem statement (`track-1-bhumi-vikas-sahayak/PROBLEM-STATEMENT.md` in the organisers' pack). Run `python verify.py` to re-check every automated proof below in about 10 seconds.

## A. What the tool must do

| # | Requirement (from the problem statement) | Where it is implemented | Automated proof |
|---|---|---|---|
| A1 | Clerk asks in **plain English or Hindi** and gets a short answer **in the same language** | `backend/app/router.py` (`intake`: Devanagari detection, Hindi digits, units), `llm/prompt.py` rule 8, `offline.py` (Hindi labels), `frontend/src/i18n.tsx` (full Hindi UI) | `tests/test_engine.py::test_intake_hindi`; eval S14, S15, T13; `e2e/smoke.mjs` "Hindi question answered" |
| A2 | Answer shows the **rule number** | Citations mapped to rule + sub-rule in `llm/documents.py::Doc.locate`, `corpus.Rule.sub_rule_at`; facts carry `rule`/`sub_rule` | `tests/test_engine.py::test_tool_loop_and_citations` (asserts `56(2)(a)`, `56(2)(b)`) |
| A3 | Answer shows **the exact text it came from** | Claude Citations API (`citations: {enabled: true}` in `llm/documents.py`); calculator facts carry a verbatim `quote` (`calculators/core.py::Fact.to_dict`) | `tests/test_calculators.py::test_every_fact_has_exact_quote_and_matching_page`, `::test_snippet_exists[*]` |
| A4 | Clerk can **check it against the PDF** (source of truth) | Exact PDF page per citation (`corpus.Rule.page_at`, built from running page headers); UI PDF pane opens that page and highlights the quoted row (`frontend/src/components/PdfPane.tsx`) | `test_every_fact_has_exact_quote_and_matching_page` (page match); `e2e/smoke.mjs` "PDF opened on the cited page with highlight" |
| A5 | When the rules are silent, **say so clearly instead of guessing** | Out-of-scope pre-filter (`router.OUT_OF_SCOPE`), prompt `NOT_FOUND` contract, verifier turns any uncited answer into `not_found` (`verify.build_answer`) | `test_engine.py::test_not_found`, `::test_uncited_answer_becomes_not_found`; `test_api.py::test_ask_json_not_found`; eval S16, S17, T12 |
| A6 | **Never invent a rule** | Rule numbers on screen come only from citation/fact metadata; uncited text is never shown as an answer | `test_uncited_answer_becomes_not_found` |
| A7 | **Numbers from tables (fees, setbacks) are right** | All table numbers computed in `calculators/core.py` (Rules 17, 21, 23, 42 T4/T5, 52, 53, 56, 61) and exposed to Claude as strict tools (`llm/tools.py`); verifier flags any number not in a quote/fact (`verify.numbers_in`) | `test_calculators.py` (front/rear boundaries 9.0/9.01/12/18, 40/150/150.01/225; every fee slab incl. 75.5 gap; FAR; electric; validity; farm house); `::test_fee_slab_numbers_match_rule_text`; `test_engine.py::test_unverified_number_flagged` |
| A8 | **Maths belongs in code**, not in the language model | Same as A7; prompt rule 2 forbids reading table numbers; Plot Check runs with no AI at all | `test_calculators.py::test_plot_check_headline_case` |
| A9 | Tool tells the clerk **which version of the rules** it used | `corpus.rules_version()` on every answer; `data/amendments.json` overlay with the **28 Aug 2026 Rule 2(5)(c)** amendment as a citable document; banner only when the amended clause is cited (`verify._touches`) | `test_engine.py::test_amendment_citation_banner`; eval S11 (`expect_amendment`); `e2e/smoke.mjs` "rule 2 shows the 28-08-2026 amendment banner" |
| A10 | Hindi PDF "copies out as garbage": **read it, don't parse it** | Hindi PDF is only rendered (PDF pane EN/हिं toggle), never parsed; Hindi answers are generated from the English source and quotes stay in English | Manual (UI) |
| A11 | **Correct answer within a minute** | Whole rulebook prompt-cached (`llm/documents.py`), streaming (SSE), effort `low`, optional cache pre-warm; Plot Check < 50 ms | Offline eval ≈ 0.1 s per question (`eval/results/offline.json`) |
| A12 | The headline case: *200 sq m plot, 9 m road: front gap, floors, fee* | Router extracts facts; calculators give 3.0 m front, 2.5 m rear, 12.5 m height regime, FAR 1.25 → 250 sq m, Rs 3,000 + Rs 250 fee; answer states that the rules don't fix a floor count | `test_plot_check_headline_case`; eval T01; `e2e/smoke.mjs` |
| A13 | **Show how often the tool is right on the sample questions** | `eval/gold.jsonl` (17 official + 13 extra), `eval/run_eval.py`, `verify.py`; score shown in the UI header and in `/api/meta` | `verify_report.json` → `eval_offline` |
| A14 | **Not legal advice; the clerk decides** | `disclaimer` on every answer, print slip and UI footer (`config.DISCLAIMER_EN/HI`) | `test_api.py::test_ask_json_answer_shape` (field present) |

## B. Constraints and rules of the day

| # | Constraint | How it is met | Proof |
|---|---|---|---|
| B1 | Public data only | Participant-pack files + one public amendment source (linked in README) | `backend/data/` |
| B2 | No connection to any live government system | Only outbound call is the Anthropic API (`llm/engine.py`); PDFs are served from local copies | Code review |
| B3 | No personal data | `router.PERSONAL` masks phone/email/12-digit IDs before logging; UI nudges the clerk | `test_api.py::test_personal_data_is_masked_before_logging` |
| B4 | One workflow, one user, one outcome (not a portal) | Single-screen clerk tool: Ask / Plot Check / Browse; no accounts | UI |
| B5 | README with team, user, run in ≤ 5 steps, what works/doesn't, extra data | `README.md` | Read it |
| B6 | `LICENSE` (MIT) | `LICENSE` | file present |
| B7 | No API keys or secrets in code | `.env` git-ignored; `.env.example` only | `verify.py` → `no_secrets_in_repo` |
| B8 | Code readable for the department | Typed Python + TypeScript, docstrings, `AGENTS.md`, design docs | n/a |

## C. Judging criteria → features

| Criterion | Feature evidence |
|---|---|
| Day-one impact (×2) | Runs with `uvicorn` or Docker; works **without an API key** (offline mode + Plot Check); printable citizen slip; amendment overlay updated by editing one JSON file |
| Product | One screen, onboarding (3 steps), example chips, EN/हिं, PDF beside the answer with highlight, keyboard shortcuts (`/`, Enter, Esc), mobile layout; screenshots in `docs/screenshots/` |
| Idea | Code-computed numbers + Citations API + number verifier + version-aware amendment overlay; no vector DB because the whole book fits in a cached prompt |
| Demo clarity | Demo script in `docs/02-implementation-plan.md` §7 |
