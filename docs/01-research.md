# 01 · Research: Track 1, Bhumi Vikas Sahayak

> Source pack: https://github.com/Vishal4742/bhopal-impact-lab-2026-problem-statements → `track-1-bhumi-vikas-sahayak/`
> Event: Claude Impact Lab × Cerebras Café Compute, Bhopal, Sun 11 Oct 2026. Build window 10:15 AM to 5:00 PM.

---

## 1. The problem in one paragraph

Every building in Bhopal must follow the **MP Bhumi Vikas Rules, 2012**: 108 pages, 105 numbered rules plus inserted ones (12-A, 17-a, 26-A, 26-B, 42-A, 93(a)…). A **building-permission clerk at the Bhopal Municipal Corporation (BMC)** answers the same questions at the counter all day ("how much gap at the front?", "what fee?", "how many floors?"). The numbers sit in **flattened tables** that are easy to misread, the rules **keep being amended** (the consolidated copy stops on 6 Mar 2025, and Rule 2(5)(c) changed again on 28 Aug 2026), and citizens ask in **English and Hindi**. The clerk needs **a correct answer within a minute, with the rule number and the exact source text** to show the citizen. When the rules don't cover a question, the tool must say **"not found"** and not guess.

## 2. The user and the moment of use

| | |
|---|---|
| **Primary user** | BMC building-permission counter clerk. Often not an engineer. Uses a shared desktop PC (Chrome or Edge) and may turn the screen toward the citizen. |
| **Secondary audience** | The citizen across the counter, who sees the screen or takes a printout. Small architects and plot owners (not today's target, but they benefit later). |
| **Trigger** | A citizen asks a question, often with plot facts: *"My plot is 200 sq m on a 9 m road…"* |
| **Success** | Under 60 s: a short answer, the rule number, the quoted text, the PDF page, and which version of the rules was used. |
| **Failure modes that hurt** | A wrong number from a table, an invented rule, an answer from superseded text, Hindi rendered as garbage, or a slow or confusing UI. |

**Design consequence:** this is not a chatbot. It is a lookup tool that can **cite its source**. Every screen element should help the clerk *point at the rule*. As the brief puts it: *"The tool points to the rule; the clerk decides."*

## 3. How it is judged, and what that means for the build

| Criterion | Weight | What wins it |
|---|---|---|
| Day-one impact | ×2 (10 pts) | Runs with `docker compose up` or 5 steps. Works on the 17 sample questions. Accuracy is published. A printable "rule slip" for citizens. |
| Product | 5 | One screen, opens straight to the search box, example chips, Hindi toggle, answer in about 5 s, PDF page beside the answer. |
| Idea | 5 | A **deterministic Plot Check calculator** (numbers come from code, not the LLM), an **amendment overlay** with a version badge, and **number verification** (every number shown must appear in the cited text). |
| Demo clarity | 5 | The story: citizen question → 200 sq m / 9 m road → full answer with rule slip in 30 s → Hindi → "not found" for property tax. |

Jury checklist for Track 1 (from the guide), each mapped to a feature:

1. *Every answer shows its rule number and source text* → Claude Citations API (char-level quotes) plus a rule badge and PDF page link.
2. *Says "not found" and never invents a rule* → zero citations means a "Not found" card is forced in code, and the prompt has an explicit NOT_FOUND contract.
3. *Table numbers are right* → tables are hand-encoded as JSON, unit-tested, and served by calculator tools.
4. *Shows how often it is right on the sample questions* → an `eval/` harness and an accuracy table in the README and inside the app ("Accuracy: 16/17 on sample set").

## 4. What the data looks like (verified by reading it)

| File | Facts |
|---|---|
| `bhumi_vikas_rules.jsonl` | 106 lines: rules 1 to 105 plus **26-B**. Fields: `rule` (string), `title`, `part`, `page_start`, `page_end`, `text`. About **284 K characters, roughly 75 to 90 K tokens in total**. |
| `bhumi_vikas_rules_fulltext_by_page.txt` | 4,711 lines, pages delimited by `===== PDF page N =====` |
| EN PDF | Source of truth, 108 pages, 1.2 MB |
| HI PDF | Legacy (non-Unicode) font: **render it, don't parse it** |
| `sample_questions.md` | 17 questions: 13 English, 2 Hindi, 2 out of scope |

### Data quirks we must handle

| Quirk | Example | Handling |
|---|---|---|
| Running page headers inside text | `Rule 56   M.P. Bhumi Vikas Rules, 2012   78` | Strip with regex `^\s*Rule[s]?\s[\d\-A-Za-z, ]+\s+M\.P\. Bhumi Vikas Rules, 2012\s+\d+\s*$`, but **use the trailing number to build a char→page map**, so every citation resolves to an exact PDF page and not just a range. |
| Court "COMMENTS" (case law) inside rule text | Rule 21, 28, 61, 103 end with `COMMENTS … Ramesh Verma Vs. Indore Municipal Corporation…` | Split them into a separate `comments` field. Show them as "Court note (not a rule)". |
| Footnote amendment markers | `1[`, a lone `1`, `Subs. by Notification No. F. UDH-3/0002/18-5/2024 dated 06th March 2025` | Parse into an `amendments[]` metadata list per rule, so the UI can say "amended 6 Mar 2025". |
| Footnotes of the *next* rule bleed in | Rule 19's text contains the footnote for rule 20/21 | Accept it. Citations quote exact text, so the clerk sees it in context. |
| Inserted rules live inside the parent | 17-a sits in rule 17; 12-A in 12; 42-A in 42 | Build an alias index: `17-a → 17`, `42A → 42`, etc. A query for "rule 17-a" resolves. |
| Flattened tables | Rule 21(3)(b) fee slabs, 56(1)/(2) setbacks, 42 Tables 4/5, 61 Table 8, 52 clearances | **Hand-encode as JSON** with `rule`, `sub_rule`, `page`, and check against the PDF. |
| Missing amendment | 28 Aug 2026 change to Rule 2(5)(c) | Add an `amendments.json` overlay document (see §6). |
| Hindi PDF garbage | Kruti-Dev-style font | Don't extract it. Link to the Hindi PDF page for reading, and answer in Hindi generated from the English source. |

## 5. Key tables (verified against the text; check against the PDF before the demo)

### Rule 56(1)(a): front open space, residential, height ≤ 12.5 m (PDF p. 77)
| Street width facing plot | Front open space min. |
|---|---|
| Up to 9.0 m | **3.0 m** |
| > 9.0 m and ≤ 12 m | **3.6 m** |
| > 12 m and ≤ 18 m | **4.5 m** |
| > 18 m | **6.0 m** |
| 56(1)(b): existing developed areas, street < 6.0 m | Building line at 6.0 m from the street centre line |

### Rule 56(2)(a): rear open space, residential, height ≤ 12.5 m (PDF p. 78)
| Plot area (sq m) | Rear open space min. |
|---|---|
| ≤ 40 | Nil |
| > 40 and ≤ 150 | **1.5 m** |
| > 150 and ≤ 225 | **2.5 m** |
| > 225 | **3.0 m** |

### Rule 56(3): side open space
- Detached: 3 m on both sides. Detached ≤ 7 m high with frontage < 12 m: one side may be 1.5 m.
- Semi-detached: 3.0 m on one side. Semi-detached ≤ 10 m high with frontage ≤ 10 m: may be 2.5 m.
- Row type: no side open space.
- Building type follows **Rule 53(1)**: detached > 225 sq m and > 12 m frontage; semi-detached 125 to 225 sq m and 8 to 12 m; row 50 to 225 sq m and 4.5 to 12 m.
- Height > 12.5 m: Rule 56(5) points to **Rule 42 Tables 4 and 5** (Table 4 row 1 needs a ≥ 12 m road, a ≥ 1000 sq m plot and ≥ 18 m frontage; then front 7.5 m and sides/rear 6 m).

### Rule 21: fees (PDF pp. 35 to 37)
- **Application fee (21(2))**: development permission Rs 5,000 per hectare or part; building permission **Rs 1.00 per sq m of proposed built-up area**; never refunded.
- **Permission fee, building (non high-rise), residential (21(3)(b) item 1)**, by **built-up area** (not plot area):

| Built-up (sq m) | Fee (Rs) | | Built-up (sq m) | Fee (Rs) |
|---|---|---|---|---|
| 0 to 75 | 750 | | 751 to 1,000 | 10,000 |
| 76 to 125 | 1,250 | | 1,001 to 1,250 | 12,500 |
| 126 to 200 | 2,000 | | 1,251 to 1,500 | 15,000 |
| 201 to 300 | 3,000 | | 1,501 to 2,000 | 20,000 |
| 301 to 400 | 4,000 | | 2,001 to 2,500 | 25,000 |
| 401 to 600 | 6,000 | | above 2,500 | 50,000 |
| 601 to 750 | 7,500 | | | |

  - Commercial or shop-cum-residence: item 1 + 50%. Social or educational: same as item 1. Cinema: Rs 15,000 (≤ 800 seats) or Rs 25,000. Alteration with no added area: Rs 500. Addition ≤ 10%: Rs 500; > 10%: fresh application. Revalidation: 10% of the original fee.
  - **High-rise (21(3)(c))**: residential Rs 10 per sq m built-up; commercial +100%; shop-cum-residence +50%.
  - ⚠ **Slab gap**: 75 to 76, 125 to 126 and so on. A built-up area of 75.5 sq m is ambiguous. The code treats it as the higher slab and **shows an "edge case, check with officer" flag**.
- Development permission fee (21(3)(a)) per hectare by planning-area population. Bhopal is > 10 lakh: residential/PSP/industrial Rs 75,000/ha, commercial Rs 1,50,000/ha, recreational/agriculture Rs 30,000/ha.

### Rule 61 Table 8: FAR (PDF p. 83)
Residential **1.25**. Commercial 2.50 (city centre), 2.00 (sub-city), 1.75 (community), 1.50 (local shopping), 1.25 (convenience). Public/semi-public 1.00. Industrial per Rule 48.
\* *"F.A.R and Density may be adopted as provided in the Development Plans of respective towns"*, and **Rule 103** says the Development Plan prevails. **The tool must say: "Bhopal Development Plan may set a different FAR, confirm with the planning section."**
Premium FAR up to 25% of base (61(7), added 6 Mar 2025).

### Rule 52: distance from overhead electric lines (PDF p. 69)
| Line | Vertical | Horizontal |
|---|---|---|
| Low/medium voltage and service lines | **2.5 m** | **1.2 m** |
| High voltage ≤ 33 kV | **3.7 m** | **1.2 m** |
| Extra high voltage > 33 kV | 15 m corridor (7.5 m each side of the centre line) or per the Electricity Rules, whichever is more |

### Rule 17: farm house (PDF p. 34)
Min. plot **0.40 ha**, max. FAR **0.10**, height 7.5 m with a sloping roof, 100 live trees per ha, access road ≥ 7.5 m, MOS 7.5 m on all sides. (17-a, agricultural tourist facility: 1.00 ha, FAR 0.10.)

### Rule 23: validity of development permission (PDF p. 41)
Valid **3 years**. Revalidation for **two consecutive one-year terms**, then a fresh application (**5 years total, not relaxable**). No fee if revalidation is applied for before expiry; if after, the 21(3)(a) fee applies. If work starts within validity, the permission doesn't lapse.

## 6. The amendment problem (version awareness)

| Version | Source | In dataset? |
|---|---|---|
| Consolidated to **6 Mar 2025** | mptownplan.gov.in `bvn06032025E.pdf` | Yes |
| **28 Aug 2026** amendment to **Rule 2(5)(c)** | teamleaseregtech.com/updates/article/59469 | **No** |

**28 Aug 2026 amendment (summary from the public source):** construction or reconstruction on plots **up to 500 sq m** that **conforms to the land use in the approved Development Plan** and its norms **no longer needs separate development permission under Rule 2(5)(a)**. The condition is mandatory. *No notification number was given in the public source; mark the record "Gazette reference pending".*

The current 2(5)(c) in the dataset (inserted 28 Sep 2022) is about the developed Central Area, where local bodies issue building permission per the Development Plan land use.

**Design:** `amendments.json` → each entry has `{id, rule, effective_date, source_url, summary_en, summary_hi, supersedes_text?}`. Each entry is injected as its own citable document, *"Amendment 28-08-2026 to Rule 2(5)(c)"*. The UI shows a **version badge** on every answer: `Rules as of 6 Mar 2025 + 1 later amendment (28 Aug 2026)`. When a cited rule has a later overlay, it shows an amber banner: *"This rule was amended on 28 Aug 2026. Showing the amended position."*

## 7. Sample-question answer key (draft, team to verify each against the PDF)

| # | Question (short) | Expected answer | Rule(s) |
|---|---|---|---|
| 1 | 10 m street, 9 m tall: front gap? | **3.6 m** (street > 9 and ≤ 12 m; height ≤ 12.5 m) | 56(1)(a), p.77 |
| 2 | Farm house: min plot, max FAR | **0.40 ha; FAR 0.10** | 17, p.34 |
| 3 | Permission granted 2023: validity, renewals | **3 years; 2 renewals of 1 year each; 5 years max** | 23, p.41 |
| 4 | Authority didn't reply in time | **Deemed sanctioned** if refusal isn't communicated within the period in **Sec. 30(5) of the Act**. The period itself is *not* in these rules. **Not deemed** when the application went to an authorised architect or structural engineer (proviso). Nothing in it allows a breach of the Act, the DP or other laws. | 28, p.48 to 49 |
| 5 | Balcony vs LV overhead line | **2.5 m vertical, 1.2 m horizontal** (or the Electricity Rules if stricter); measured from max sag or deflection | 52, p.69 |
| 6 | Who signs plans | Licensed architect, structural engineer, engineer, supervisor or town planner, with name, address, qualification and licence number and validity; **plus the owner**. Scope of each licence per Rule 26. | 18, 26, p.34, 43 |
| 7 | Documents with application | Forms Appendix A-1 (development) or A-2/A-2(1) (building), plans in quadruplicate plus an electronic copy (online only, where adopted), fee receipt; details per Rule 16 | 14, 16, 21(1) |
| 8 | Fee, residential house | Application fee **Rs 1 per sq m built-up** + permission fee **by built-up slab** (Rs 750 to 50,000); high-rise **Rs 10 per sq m** | 21(2), 21(3)(b), 21(3)(c) |
| 9 | Change a plan after sanction | Allowed, except deviations that affect front MOS, **exceed 30% of permissible FAR**, touch parking or utility space, road alignment, water bodies, or come within 30 m of their banks. Compounding fee per the municipal Act. Addition ≤ 10%: Rs 500; > 10%: fresh application. | 24, 21(3)(b) items 7 & 8 |
| 10 | Rear gap, 150 sq m plot | **1.5 m** (150 falls in "> 40 and ≤ 150"). A boundary trap. | 56(2)(a), p.78 |
| 11 | 300 sq m plot matching the DP: need development permission? | **No separate development permission**, per the **28 Aug 2026 amendment** to 2(5)(c), if it conforms to DP land use and norms. Building permission is still needed. Show the version banner. | 2(5)(c) + amendment |
| 12 | DP vs rules conflict | **Rule 103**: DP norms apply. If contrary, the Director proposes to Government, whose decision is final. | 103, p.107 |
| 13 | Lifts, building > 15 m | Lifts are **required for any building > 12.5 m**. Design per **NBC Part VIII Sec. 5**. Details with the application in **Appendix A-2(A)**, completion report in **E-3(A)**, unique registration number. Pre-existing lifts: register within 6 months, Rs 500 per unit. Fire measures per Rule 42(3). | 83, 42(3) |
| 14 | (HI) 200 sq m, 9 m road: front gap | **3.0 m** (9.0 m is "up to 9.0 m"). A boundary trap. Answer in Hindi. | 56(1)(a) |
| 15 | (HI) Building permission fee + rule | Same as Q8, in Hindi | 21 |
| 16 | Pay property tax online | **Not found** in the Bhumi Vikas Rules (that falls under the Municipal Corporation Act/BMC) | none |
| 17 | Land rate on Kolar Road | **Not found** (collector guideline rates are not in these rules) | none |

### The headline demo case (from the problem statement)
*"My plot is 200 sq m on a 9 m road. How much gap at the front, how many floors, what fee?"*

| Item | Answer | Source |
|---|---|---|
| Front | **3.0 m** | 56(1)(a) |
| Rear | **2.5 m** (150 < 200 ≤ 225) | 56(2)(a) |
| Sides | Depends on type. 200 sq m is semi-detached or row per 53(1). Semi-detached: 3.0 m one side (2.5 m if ≤ 10 m high and frontage ≤ 10 m). Row: nil. | 56(3), 53(1) |
| Height | ≤ 12.5 m under Rule 56. Above 12.5 m needs a ≥ 12 m road and a ≥ 1,000 sq m plot (Table 4), so **not eligible**. | 56, 42 Table 4 |
| Floors | **The rules do not fix a floor count.** Max built-up = FAR 1.25 × 200 = **250 sq m** in total, within 12.5 m height. *Bhopal Development Plan may differ (Rule 103).* | 61 Table 8, 103 |
| Fee | e.g. built-up 250 sq m → permission fee **Rs 3,000** (201 to 300 slab) + application fee **Rs 250** = **Rs 3,250** in the rules (other municipal charges not covered) | 21(2)(ii), 21(3)(b) |

This one question exercises 6 rules and 4 tables. **That is why numbers must come from code**, with Claude explaining and citing.

## 8. Approach options considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| Vector RAG (embeddings + top-k) | Familiar | Chunking breaks tables; retrieval misses lose the answer; more infra | ✗ |
| **Whole rulebook in context + prompt caching + Citations API** | ~85 K tokens fits easily; nothing to "miss"; char-exact quotes come from the API, not the model; cached reads are cheap | Per-call input cost (mitigated by the cache) | ✅ **primary** |
| Keyword/BM25 router to the top 8 rules, then the LLM | Cheap, fast | Can miss cross-references | Use as a **fallback** if the API is slow, and for the "related rules" panel |
| **Deterministic calculators for tables** | Always correct, testable, works offline | Needs a hand-encoded table | ✅ **for all numbers** |
| Fine-tuning | none | No time, no data | ✗ |

**Chosen: hybrid.** Claude (with citations) reads the whole cached rulebook and explains. Tool calls to deterministic calculators produce every number from a table. Code verifies each number against citations or tool output.

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| LLM misreads a table | Calculators are the only source of table numbers; post-check flags any number not found in a citation or tool output |
| Invented rule | Answer has no citations → forced "Not found" card; rule numbers are only rendered from citation metadata, never from free text |
| Outdated rule | Amendment overlay + version badge on every answer |
| Hindi quality | Glossary of fixed terms (FAR = तल क्षेत्र अनुपात (FAR); setback/MOS = सीमांत खुला स्थान; plot = भूखंड); a team member reviews 20 Hindi outputs |
| API down at demo time | Plot Check works without the LLM; recorded 2-minute video at 4:00 PM |
| Latency | Prompt-cache pre-warm on startup; effort `low`; stream tokens to the UI |
| Legal liability | Footer on every answer and on the slip: *"Reference aid only, not legal advice. Final decision rests with the Authority."* |

## 10. Sources
- Problem pack: https://github.com/Vishal4742/bhopal-impact-lab-2026-problem-statements
- Rules (EN): https://mptownplan.gov.in/NewsPDF/bvn06032025E.pdf · (HI): https://mptownplan.gov.in/NewsPDF/bvn06032025H.pdf
- 28 Aug 2026 amendment: https://teamleaseregtech.com/updates/article/59469/government-of-madhya-pradesh-amendment-to-land-development-rules
