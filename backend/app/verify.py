"""Trust layer: turns raw model output into the answer the clerk sees.

- no citations (or a NOT_FOUND line) -> a "not found" answer, never free text;
- every citation is mapped to rule, sub-rule and exact PDF page;
- every number in the answer must appear in a cited quote, a calculator result or the question,
  otherwise it is flagged as unverified;
- rules touched by a later amendment get a banner and the rules-version string.
"""
from __future__ import annotations

import re

from . import corpus
from .config import DISCLAIMER_EN, DISCLAIMER_HI

WORD_NUMS = {"one": "1", "two": "2", "three": "3", "four": "4", "five": "5", "six": "6", "seven": "7", "eight": "8",
             "nine": "9", "ten": "10", "fifteen": "15", "thirty": "30"}
REF_PATTERNS = re.compile(
    r"(?:Rules?|rule|नियम|Section|section|धारा|Table|table|तालिका|Appendix|परिशिष्ट|p\.|page|pages|पृष्ठ|item|Item|row)\s*"
    r"(?:No\.?\s*)?[\dA-Za-z\-–]*(?:\([0-9a-zA-Z]+\))*(?:\s*(?:and|,|&|-|–|or|से)\s*[\dA-Za-z]+(?:\([0-9a-zA-Z]+\))*)*"
)
NUMBER = re.compile(r"(?<![\w.])(\d{1,3}(?:,\d{2,3})+|\d+(?:\.\d+)?)(?![\w])")
DEV_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")


def _norm_num(s: str) -> str:
    s = s.replace(",", "").lstrip("0") or "0"
    if s.startswith("."):
        s = "0" + s
    if "." in s:
        s = s.rstrip("0").rstrip(".")
    return s


def numbers_in(text: str, strip_refs: bool = True) -> set[str]:
    text = text.translate(DEV_DIGITS)
    text = re.sub(r"\[\d+\]", " ", text)  # citation markers
    text = re.sub(r"\((?:\d{1,2}|[a-z]|[ivx]{1,4})\)", " ", text)  # sub-rule markers
    if strip_refs:
        text = REF_PATTERNS.sub(" ", text)
    text = re.sub(r"\b\d{1,2}[-/]\d{1,2}[-/]\d{4}\b", lambda m: " ".join(m.group(0).replace("/", "-").split("-")), text)
    return {_norm_num(m.group(1)) for m in NUMBER.finditer(text)}


def allowed_numbers(sources: list[str]) -> set[str]:
    allowed: set[str] = set()
    for s in sources:
        low = s.lower()
        for w, d in WORD_NUMS.items():
            if re.search(rf"\b{w}\b", low):
                allowed.add(d)
        allowed |= numbers_in(s, strip_refs=False)
    return allowed


def _touches(a: dict, rule: str, sub_rule: str, amendment_id: str | None) -> bool:
    """True if a citation/fact points at the clause an amendment changed (e.g. 2(5)(c), not all of Rule 2)."""
    if amendment_id == a["id"]:
        return True
    if rule != a["rule"]:
        return False
    clause = a["rule_ref"][len(a["rule"]):]  # "(5)(c)"
    top = re.match(r"\(\w+\)", clause)
    return bool(sub_rule) and (sub_rule.startswith(clause) or (top is not None and sub_rule.startswith(top.group(0))))


def amendment_banners(refs: list[tuple[str, str, str | None]], lang: str) -> list[dict]:
    out = []
    for a in corpus.amendments():
        if any(_touches(a, r, s, aid) for r, s, aid in refs):
            out.append({
                "id": a["id"], "rule_ref": a["rule_ref"], "date": a["effective_date_display"],
                "summary": a["summary_hi"] if lang == "hi" else a["summary_en"],
                "source_url": a["source_url"], "gazette_reference": a["gazette_reference"],
            })
    return out


def build_answer(*, question: str, lang: str, answer_text: str, citations: list[dict], facts: list[dict],
                 mode: str, extra_warnings: list[str] | None = None, trusted: list[str] | None = None) -> dict:
    disclaimer = DISCLAIMER_HI if lang == "hi" else DISCLAIMER_EN
    stripped = answer_text.strip()
    not_found = stripped.upper().startswith("NOT_FOUND") or (not citations and not facts)
    if not_found:
        reason = stripped.split(":", 1)[1].strip() if stripped.upper().startswith("NOT_FOUND") and ":" in stripped else ""
        return {
            "status": "not_found", "lang": lang, "mode": mode, "answer_md": "", "not_found_reason": reason,
            "facts": [], "citations": [], "amendments": [], "warnings": [], "unverified_numbers": [],
            "confidence": "high" if reason else "check", "rules_version": corpus.rules_version(), "disclaimer": disclaimer,
        }

    sources = [c["quote"] for c in citations] + [question] + list(trusted or [])
    for f in facts:
        sources += [str(f.get(k, "")) for k in ("label", "label_hi", "display", "value", "row_label", "sub_rule", "citation")]
        sources.append(" ".join(f.get("notes", [])))
    unverified = sorted(numbers_in(stripped) - allowed_numbers(sources), key=lambda x: float(x))

    rule_ids = {c["rule"] for c in citations} | {f["rule"] for f in facts}
    refs = [(c["rule"], c.get("sub_rule", ""), c.get("amendment_id")) for c in citations] + [
        (f["rule"], f.get("sub_rule", ""), None) for f in facts]
    warnings = list(extra_warnings or [])
    if rule_ids & {"61", "53", "36", "37"} and not any("103" in w for w in warnings):
        warnings.append("Bhopal's Development Plan may set different FAR, density or land-use norms; it prevails (Rule 103)."
                        if lang != "hi" else "भोपाल विकास योजना के मानक अलग हो सकते हैं; वे मान्य होंगे (नियम 103)।")
    if any(f.get("edge_case") for f in facts):
        warnings.append("Edge case in a table: please confirm with the officer." if lang != "hi"
                        else "तालिका का सीमांत मामला: कृपया अधिकारी से पुष्टि करें।")
    confidence = "check" if unverified or any(f.get("edge_case") for f in facts) else "high"
    return {
        "status": "answered", "lang": lang, "mode": mode, "answer_md": stripped, "facts": facts, "citations": citations,
        "amendments": amendment_banners(refs, lang), "warnings": warnings, "unverified_numbers": unverified,
        "confidence": confidence, "rules_version": corpus.rules_version(), "disclaimer": disclaimer,
    }
