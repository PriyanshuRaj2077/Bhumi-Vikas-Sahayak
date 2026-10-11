# 04 · Frontend design: built for the counter

> The user is a clerk with a queue of citizens. The screen is often turned toward the citizen. The UI must feel like **a calm, official reference desk**, not a chatbot.

## 1. UX principles

| Principle | What it means on screen |
|---|---|
| **Answer first, proof next to it** | Big direct answer at the top, rule badges right under it, PDF page open on the right. No scrolling to find the source. |
| **Zero learning curve** | Opens straight to one search box with example chips. No login, no menu. Works on the first try. |
| **Show, don't claim** | Every number is a *chip* with its rule (`3.0 m · Rule 56(1)(a) · p.77`). Click → the PDF jumps to the page with the line highlighted. |
| **Bilingual by default** | `EN / हिं` toggle in the header. Auto-switches when a question is typed in Devanagari. The whole UI is translated, not just the answer. |
| **Honest states** | "Not found" is a designed, friendly state, not an error. Amendments show as an amber banner. Edge cases show a "check with officer" tag. |
| **Citizen-shareable** | One click → printable A5 **Rule Slip** with the answer, rule numbers, quotes, version and disclaimer. |
| **Fast on old hardware** | < 200 KB JS gzipped (PDF viewer lazy-loaded); works on a 1366×768 screen in Chrome or Edge. |

## 2. Information architecture (one screen, three modes)

```
Header: [logo] Bhumi Vikas Sahayak · BMC Building Permission Desk     [EN | हिं]  [Rules: 06-03-2025 + 1 amendment ⓘ]
Tabs:   ( Ask a question )   ( Plot Check )   ( Browse rules )
```
- **Ask**: free text in English or Hindi → cited answer (LLM).
- **Plot Check**: a form for the most common counter case → instant numbers (no LLM, works offline).
- **Browse rules**: searchable list of 106 rules by Part. Opens the clean text plus the PDF page.

## 3. Wireframes

### 3.1 Home / Ask (empty state)
```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ 🏛 Bhumi Vikas Sahayak   BMC Building Permission Desk          EN | हिं   v 06-03-2025+1 │
├──────────────────────────────────────────────────────────────────────────────────────┤
│   [ Ask a question ]  [ Plot Check ]  [ Browse rules ]                                │
│                                                                                       │
│        Ask the MP Bhumi Vikas Rules, 2012                                             │
│   ┌──────────────────────────────────────────────────────────────┐ ┌───┐ ┌──────┐    │
│   │ e.g. My plot is 200 sq m on a 9 m road. Front gap, floors, fee?│ │ 🎤 │ │ Ask ⏎│    │
│   └──────────────────────────────────────────────────────────────┘ └───┘ └──────┘    │
│                                                                                       │
│   Try:  (Front gap for 9 m road)  (Fee for a house)  (Farm house rules)               │
│         (Permission validity)  (Distance from electric line)  (आगे कितनी जगह छोड़नी है?) │
│                                                                                       │
│   Recent at this desk:  • Rear gap 150 sq m → 1.5 m (R.56)   • Lift rules (R.83)      │
│                                                                                       │
│   ⓘ Reference aid only, not legal advice. Final decision rests with the Authority.    │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Answer view (split: answer left 55%, PDF right 45%)
```
┌───────────────────────────────────────────────┬──────────────────────────────────────┐
│ Q: My plot is 200 sq m on a 9 m road …         │  📄 Official PDF (EN)  [EN|HI] p.77 ▲▼│
│                                                │ ┌──────────────────────────────────┐ │
│ ✅ Leave 3.0 m at the front and 2.5 m at the    │ │ 56. Residential Buildings.-Open │ │
│    rear. Build up to 12.5 m high and 250 sq m   │ │ Spaces …                         │ │
│    total floor area. Fee ≈ Rs 3,250.            │ │  S.No. Width of street  Front    │ │
│                                                │ │ ▓1. Up to 9.0 meters    3.0 m▓   │ │
│ ┌────────────┐┌────────────┐┌────────────────┐ │ │  2. More than 9.0 …     3.6 m    │ │
│ │Front  3.0 m││Rear  2.5 m ││Max built-up    │ │ │  …                               │ │
│ │R.56(1)(a)  ││R.56(2)(a)  ││250 m² R.61 T8 ⚠│ │ └──────────────────────────────────┘ │
│ │p.77     🔗 ││p.78     🔗 ││p.83   DP may ▸ │ │  Highlighted: the line cited          │
│ └────────────┘└────────────┘└────────────────┘ │                                      │
│ ┌──────────────────┐┌─────────────────────────┐│                                      │
│ │Height ≤ 12.5 m   ││Fee Rs 3,000 + Rs 250 app ││                                      │
│ │R.56, R.42 T4     ││R.21(3)(b), 21(2)(ii) p.36││                                      │
│ └──────────────────┘└─────────────────────────┘│                                      │
│ • Floors: the rules limit height and floor area, not the number of floors.            │
│ • Sides depend on type (semi-detached 3.0 m one side; row: none). [Open Plot Check →] │
│                                                │                                      │
│ ▸ Source text (3 quotes)        ▸ Why these rules?                                    │
│ ⚠ Bhopal Development Plan may set a different FAR (Rule 103).                         │
│ Rules version: consolidated 06-03-2025 + 28-08-2026 amendment                         │
│ [🖨 Print rule slip] [📋 Copy] [हिंदी में दिखाएँ] [👍 Correct] [👎 Wrong]               │
└───────────────────────────────────────────────┴──────────────────────────────────────┘
```
- The answer **streams in** (typing feel). Fact chips appear as each calculator tool returns, with a subtle "calculated" tick icon for code-derived numbers.
- Clicking any chip or quote scrolls the PDF to the page and highlights the quoted line (pdf.js text-layer search).
- "Why these rules?" shows the tool inputs the calculator used (e.g. `street_width_m = 9 → row "Up to 9.0 meters"`). Clerks can see the reasoning.

### 3.3 Not-found state
```
┌──────────────────────────────────────────────────────────────┐
│ 🔍 Not covered by the Bhumi Vikas Rules, 2012                  │
│ "How do I pay my property tax online?"                         │
│ These rules deal with land development and building permission.│
│ Property tax is handled under the Municipal Corporation Act;   │
│ please direct the citizen to the BMC property tax counter.     │
│ [Ask something else]   [Browse all 106 rules]                  │
└──────────────────────────────────────────────────────────────┘
```
Neutral grey and blue, with no red, because this is a correct outcome rather than an error.

### 3.4 Amendment banner (amber)
```
⚠ Rule 2(5)(c) was amended on 28 Aug 2026 (after the 6 Mar 2025 consolidated copy).
  Plots up to 500 sq m that conform to the Development Plan land use do not need separate
  development permission. Source: public notice ↗  ·  Gazette reference pending
```

### 3.5 Plot Check (deterministic, instant)
```
┌─ Plot Check ───────────────────────────────────────────────────────────────────────┐
│ Plot area [ 200 ] (sq m ▾ / sq ft)   Road width in front [ 9 ] m   Frontage [ 10 ] m │
│ Use (● Residential ○ Commercial ○ Shop-cum-residence)   Height [ 10 ] m              │
│ Building type (○ Detached ● Semi-detached ○ Row)   Proposed built-up [ 250 ] sq m    │
│                                                                                     │
│ Results (update as you type)                                                       │
│  Front open space       3.0 m     R.56(1)(a)  p.77   row "Up to 9.0 meters"         │
│  Rear open space        2.5 m     R.56(2)(a)  p.78   row "Above 150 and up to 225"  │
│  Side open space        2.5 m one side (≤10 m high, frontage ≤10 m)   R.56(3)(ii)   │
│  Max height (this regime) 12.5 m  R.56 · above needs 12 m road & 1000 m² (R.42 T4)  │
│  FAR / max built-up     1.25 / 250 m²   R.61 T8   ⚠ DP may differ (R.103)           │
│  Permission fee         Rs 3,000  R.21(3)(b) slab 201–300                           │
│  Application fee        Rs 250    R.21(2)(ii) (Rs 1 × 250 m²)                       │
│  Development permission Not separately needed if DP-conforming (amend. 28-08-2026)  │
│ [🖨 Print rule slip]   [Ask a follow-up about this plot →]                          │
└─────────────────────────────────────────────────────────────────────────────────────┘
```
Inline validation: a plot of 200 sq m with "Detached" selected shows a hint, *"Detached needs > 225 m² and > 12 m frontage (Rule 53(1))"*.

### 3.6 Rule Slip (print, A5, black and white)
```
BHUMI VIKAS SAHAYAK · Reference slip                       11-10-2026 14:32
Question: Plot 200 sq m, 9 m road: front gap, floors, fee
-------------------------------------------------------------------------------
Front open space ...... 3.0 m ........ Rule 56(1)(a), PDF p.77
Rear open space ....... 2.5 m ........ Rule 56(2)(a), PDF p.78
Max floor area ........ 250 sq m ..... Rule 61 Table 8 (DP may differ, R.103)
Permission fee ........ Rs 3,000 ..... Rule 21(3)(b);  Application Rs 250, 21(2)
-------------------------------------------------------------------------------
"1. Up to 9.0 meters   3.0 meters"  (Rule 56(1)(a))
Rules: MP Bhumi Vikas Rules 2012, consolidated 06-03-2025 + amendment 28-08-2026
Reference aid only, not legal advice. Final decision rests with the Authority.
[QR → official PDF page]
```
There are no personal fields on the slip.

## 4. Hindi experience
- Full UI strings in `i18n/hi.json`, written by a teammate who is fluent in Hindi. Use plain office Hindi, not Sanskritised.
- Font: **Noto Sans Devanagari** + **Noto Sans** (self-hosted). Hindi body size 18 px (Devanagari needs about 10% more).
- Numbers stay in Latin digits (3.0 m, Rs 3,000), matching what clerks write on forms. Input accepts both २०० and 200.
- Quotes stay in **English** (source of truth) with a toggle, "हिंदी अनुवाद देखें", that shows a translation clearly labelled *अनुवाद, आधिकारिक पाठ नहीं* (translation, not the official text).
- PDF pane toggle EN ↔ HI opens the official Hindi PDF at the same page (verify page alignment; if pages differ, keep a `hi_page_map.json`).
- Voice input (optional): Web Speech API with `lang="hi-IN"` or `en-IN` behind the 🎤 button. If the browser doesn't support it, hide the button.

## 5. Visual design system

| Token | Value | Use |
|---|---|---|
| Primary | `#1F3A93` (deep govt blue) | Header, primary buttons |
| Accent | `#F28C28` (saffron) | Focus ring, active tab underline |
| Success | `#1E7B4F` | Answer tick, "calculated" icon |
| Warning | `#B7791F` bg `#FFF7E6` | Amendment and DP caveat banners |
| Neutral | `#F7F8FA` bg, `#1A1D23` text | Contrast ≥ 7:1 for body text |
| Radius / shadow | 12 px / soft 1-layer | Calm, modern cards |
| Type | Inter / Noto Sans 16–18 px body, 28 px answer line, tabular numerals for chips | |
| Monospace | JetBrains Mono for source quotes | Table spacing is preserved |

Accessibility: WCAG 2.2 AA, full keyboard flow (`/` focuses search, `Enter` asks, `P` prints, `Esc` clears), visible focus, `aria-live="polite"` for the streaming answer, minimum 44 px touch targets, `prefers-reduced-motion` respected.

## 6. Component tree

```
<App>
 ├─ <Header> (LangToggle, VersionBadge → AmendmentsDialog)
 ├─ <Tabs>
 │   ├─ <AskView>
 │   │   ├─ <SearchBar> (VoiceButton, ExampleChips, RecentList)
 │   │   └─ <AnswerPanel>
 │   │       ├─ <StreamingAnswer>  (markdown, aria-live)
 │   │       ├─ <FactChips>        (value · rule · page · source=calculator|text)
 │   │       ├─ <AmendmentBanner> <CaveatBanner>
 │   │       ├─ <SourceQuotes>     (collapsible, mono, "open in PDF")
 │   │       ├─ <WhyPanel>         (tool inputs → table row)
 │   │       ├─ <NotFoundCard>
 │   │       └─ <ActionBar>        (Print slip, Copy, Translate, Feedback)
 │   ├─ <PlotCheckView> (PlotForm, ResultsTable, Hints)
 │   └─ <BrowseView>   (RuleList grouped by Part, RuleReader)
 ├─ <PdfPane> (react-pdf, lazy; page jump + text highlight; EN/HI)
 └─ <PrintSlip> (print-only CSS @page A5)
```

## 7. Tech stack

| Concern | Choice | Why |
|---|---|---|
| Framework | **React 19 + Vite + TypeScript** | Fast build, static output served by FastAPI |
| UI kit | **Tailwind CSS + shadcn/ui (Radix primitives)** | Accessible, polished, quick to build in one day |
| Data fetching | TanStack Query + native `EventSource`/`fetch` stream for SSE | |
| PDF | `react-pdf` (pdf.js) with text layer for highlight | Exact page plus line highlight |
| i18n | `react-i18next` | EN/HI |
| Icons | lucide-react | |
| Print | CSS `@media print` + `@page { size: A5 }` | No PDF library needed |
| Tests | Vitest + Playwright smoke test (ask → answer shows a rule badge) | |

## 8. States and micro-interactions checklist
- [ ] Skeleton for the answer card with 3 placeholder chips while waiting (< 300 ms appear)
- [ ] Streaming text with a blinking caret; chips fade in as tools finish
- [ ] Timeout at 20 s → "Taking longer than usual. Try Plot Check" with a button
- [ ] API down → banner "AI answers unavailable; Plot Check and Browse still work"
- [ ] Empty or too-short query → inline hint, no request sent
- [ ] Personal-data nudge: if a 10-digit number or "name" is typed → "Please don't enter personal details"
- [ ] After 👎: small textbox "What was wrong?" (stored without personal data)
- [ ] In-app accuracy badge: "Tested: 16/17 sample questions correct", linking to the eval table

## 9. Onboarding (first open only, 3 steps, skippable)
1. "Type the citizen's question, in English or Hindi." (arrow → search bar)
2. "Every number shows its rule and page. Click to see it in the official PDF." (arrow → chip)
3. "Print a slip for the citizen." (arrow → print). Stored in `localStorage`, never shown again.
