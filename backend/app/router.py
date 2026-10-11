"""Cheap pre-processing before any LLM call: language, numbers, plot facts, scope, rule shortcuts."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from functools import lru_cache

from .config import DATA_DIR
from .corpus import resolve_rule_id

DEVANAGARI = re.compile(r"[ऀ-ॿ]")
DEV_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")
SQFT_PER_SQM = 10.7639

NUM = r"(\d+(?:[.,]\d+)?)"
AREA_SQM = re.compile(NUM + r"\s*(?:sq\.?\s*m(?:t|tr|eters?|etres?)?\b|sqm\b|square\s*met(?:er|re)s?|m2\b|m²|वर्ग\s*मीटर|वर्गमीटर|वर्ग\s*मी\.?)", re.I)
AREA_SQFT = re.compile(NUM + r"\s*(?:sq\.?\s*f(?:ee)?t\b|sqft\b|square\s*f(?:ee|oo)t|वर्ग\s*फ(?:ी|ु)ट)", re.I)
AREA_HA = re.compile(NUM + r"\s*(?:hectares?|ha\b|हेक्टेयर)", re.I)
ROAD = re.compile(
    NUM + r"\s*(?:m|mt|mtr|meters?|metres?|मीटर|मी\.?)\s*(?:wide\s*|चौड़ी\s*|चौड़ा\s*|चौड़े\s*)?(?:road|street|rd|सड़क|रोड|मार्ग|गली)", re.I
)
ROAD2 = re.compile(r"(?:road|street|सड़क|रोड)\s*(?:width|of|is|की चौड़ाई)?\s*(?:is\s*)?" + NUM + r"\s*(?:m|meters?|metres?|मीटर)", re.I)
HEIGHT = re.compile(NUM + r"\s*(?:m|meters?|metres?|मीटर)\s*(?:tall|high|height|ऊँचा|ऊंचा|ऊँची|ऊंची)", re.I)
HEIGHT2 = re.compile(r"(?:height|ऊँचाई|ऊंचाई)\s*(?:of|is|will be|की)?\s*" + NUM + r"\s*(?:m|meters?|metres?|मीटर)", re.I)
FRONTAGE = re.compile(r"(?:frontage|फ्रंटेज)\s*(?:of|is)?\s*" + NUM + r"\s*(?:m|meters?|metres?|मीटर)", re.I)
BUILT_UP = re.compile(r"(?:built[\s-]*up|construct(?:ed|ion)? area|निर्मित क्षेत्र)\s*(?:area)?\s*(?:of|is)?\s*" + NUM, re.I)
BUILT_UP2 = re.compile(NUM + r"\s*(?:sq\.?\s*m|sqm|square\s*met(?:er|re)s?|m2|वर्ग\s*मीटर)\s*(?:of\s*)?(?:built[\s-]*up|construct(?:ed|ion)|निर्मित)", re.I)
RULE_REF = re.compile(r"^\s*(?:rule|niyam|नियम)\s*([0-9]{1,3}(?:\s*-?\s*[A-Za-z])?(?:\([0-9a-z]+\))*)\s*\??\s*$", re.I)

OUT_OF_SCOPE = [
    (re.compile(r"property\s*tax|house\s*tax|संपत्ति\s*कर|प्रॉपर्टी\s*टैक्स|गृह\s*कर", re.I),
     "Property tax is handled by the Municipal Corporation under the M.P. Municipal Corporation Act, not the Bhumi Vikas Rules. Direct the citizen to the BMC property tax counter or portal.",
     "संपत्ति कर नगर निगम अधिनियम के अंतर्गत आता है, भूमि विकास नियमों में नहीं। नागरिक को नगर निगम के संपत्ति कर काउंटर पर भेजें।"),
    (re.compile(r"market\s*(?:rate|price|value)|land\s*(?:rate|price)|guideline\s*(?:rate|value)|collector\s*rate|circle\s*rate|बाजार\s*(?:दर|मूल्य|भाव)|गाइडलाइन|कलेक्टर\s*दर|ज़मीन\s*का\s*(?:रेट|भाव)|जमीन\s*का\s*(?:रेट|भाव)", re.I),
     "Land rates are not in the Bhumi Vikas Rules. Collector guideline rates are published by the Registration Department (District Registrar).",
     "भूमि की दरें भूमि विकास नियमों में नहीं हैं। कलेक्टर गाइडलाइन दरें पंजीयन विभाग जारी करता है।"),
    (re.compile(r"registry|registration\s*of\s*(?:sale|deed)|mutation|namantaran|नामांतरण|रजिस्ट्री|stamp\s*duty|स्टाम्प", re.I),
     "Registration, stamp duty and mutation are outside the Bhumi Vikas Rules (Registration and Revenue departments).",
     "रजिस्ट्री, स्टाम्प शुल्क और नामांतरण भूमि विकास नियमों के बाहर हैं (पंजीयन/राजस्व विभाग)।"),
    (re.compile(r"water\s*(?:bill|connection\s*fee)|electricity\s*bill|बिजली\s*बिल|पानी\s*(?:का\s*)?बिल", re.I),
     "Utility bills are outside the Bhumi Vikas Rules.",
     "बिजली/पानी के बिल भूमि विकास नियमों के बाहर हैं।"),
]

PERSONAL = re.compile(r"(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{9}(?!\d)|[\w.+-]+@[\w-]+\.[\w.]+|\b\d{4}\s?\d{4}\s?\d{4}\b")


@dataclass
class Intake:
    question: str  # normalised (ASCII digits, personal data masked)
    lang: str  # en | hi
    facts: dict = field(default_factory=dict)
    fact_notes: list[str] = field(default_factory=list)
    out_of_scope: tuple[str, str] | None = None
    rule_ref: str | None = None
    personal_masked: bool = False


def _num(s: str) -> float:
    return float(s.replace(",", ""))


def intake(question: str, lang: str = "auto") -> Intake:
    q = question.translate(DEV_DIGITS).strip()
    masked = PERSONAL.sub("[removed]", q)
    detected = "hi" if DEVANAGARI.search(q) else "en"
    out = Intake(question=masked, lang=lang if lang in ("en", "hi") else detected, personal_masked=masked != q)

    if m := AREA_SQM.search(q):
        out.facts["plot_area_sqm"] = _num(m.group(1))
    elif m := AREA_SQFT.search(q):
        sqft = _num(m.group(1))
        out.facts["plot_area_sqm"] = round(sqft / SQFT_PER_SQM, 2)
        out.fact_notes.append(f"{sqft:g} sq ft converted to {out.facts['plot_area_sqm']:g} sq m (1 sq m = 10.7639 sq ft).")
    if m := AREA_HA.search(q):
        out.facts["area_ha"] = _num(m.group(1))
    if m := ROAD.search(q) or ROAD2.search(q):
        out.facts["street_width_m"] = _num(m.group(1))
    if m := HEIGHT.search(q) or HEIGHT2.search(q):
        out.facts["height_m"] = _num(m.group(1))
    if m := FRONTAGE.search(q):
        out.facts["frontage_m"] = _num(m.group(1))
    if m := BUILT_UP.search(q) or BUILT_UP2.search(q):
        out.facts["built_up_sqm"] = _num(m.group(1))
        if out.facts.get("plot_area_sqm") == out.facts["built_up_sqm"] and not re.search(r"plot|भूखंड|प्लॉट", q, re.I):
            del out.facts["plot_area_sqm"]

    for pattern, en, hi in OUT_OF_SCOPE:
        if pattern.search(q):
            out.out_of_scope = (en, hi)
            break

    if m := RULE_REF.match(q):
        out.rule_ref = resolve_rule_id(m.group(1))
    return out


# ---------------------------------------------------------------------------
# Offline keyword search (fallback when the LLM is unavailable, and "related rules")
# ---------------------------------------------------------------------------

STOP = set("""a an the of to in on for and or is are be i my me we our how what which who when where can do does
much many will shall with from at by it this that as if any have has need there should under rules rule""".split())


@lru_cache(maxsize=1)
def glossary() -> list[dict]:
    with open(DATA_DIR / "glossary_hi.json", encoding="utf-8") as fh:
        return json.load(fh)["terms"]


def _stem(t: str) -> str:
    for suf in ("ings", "ing", "ies", "ed", "es", "s"):
        if t.endswith(suf) and len(t) - len(suf) >= 4:
            return t[: -len(suf)] + ("y" if suf == "ies" else "")
    return t


def tokens(text: str) -> list[str]:
    return [_stem(t) for t in re.findall(r"[a-z]+", text.lower()) if t not in STOP and len(t) > 2]


EN_SYNONYMS = [
    (r"not replied|no reply|hasn.t replied|has not replied|deadline|no response|miss(?:es|ed)? the", "limitation period grant refusal deemed sanctioned"),
    (r"change (?:my|the) plan|modify (?:my|the) plan|after (?:it is )?sanction", "deviation from sanctioned plan"),
    (r"sign|submit (?:my )?(?:building )?plans", "preparation signing plans architect licensed"),
    (r"documents?|papers", "application information accompanying documents"),
    (r"disagree|conflict|contrary|precedence", "development plan precedence"),
    (r"lift|elevator", "lifts escalators"),
    (r"valid|renew", "duration sanction revalidation"),
    (r"basement", "basement"),
    (r"balcony", "balcony projection electric lines"),
]


def expand_hindi(q: str) -> str:
    extra = []
    for pattern, words in EN_SYNONYMS:
        if re.search(pattern, q, re.I):
            extra.append(words)
    for term in glossary():
        if any(h in q for h in term["hi"]):
            extra.extend(term["en"])
    return q + " " + " ".join(extra)
