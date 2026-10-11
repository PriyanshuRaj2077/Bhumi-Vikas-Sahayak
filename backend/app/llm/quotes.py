"""Verifies quotes returned by a model that has no native citations API (e.g. Gemini).

The model must copy rule text exactly. Each quote is searched for in the cleaned rule text
(whitespace-insensitive). If the whole quote is not found, the longest run of at least
MIN_WORDS consecutive words that is found is used instead. Quotes that cannot be found are
dropped, so a model can never show text that is not in the rules.
"""
from __future__ import annotations

import re
from functools import lru_cache

from .. import corpus

MIN_WORDS = 6
MAX_QUOTE_CHARS = 700


@lru_cache(maxsize=None)
def _normalized(rule_id: str) -> tuple[str, list[int]]:
    """Whitespace-collapsed rule text plus a map from normalized index to original index."""
    text = corpus.rules_by_id()[rule_id].text
    out: list[str] = []
    idx: list[int] = []
    prev_space = True
    for i, ch in enumerate(text):
        if ch.isspace():
            if not prev_space:
                out.append(" ")
                idx.append(i)
            prev_space = True
        else:
            out.append(ch)
            idx.append(i)
            prev_space = False
    return "".join(out), idx


def _find_in_rule(rule: corpus.Rule, words: list[str]) -> tuple[int, int] | None:
    norm, idx = _normalized(rule.rule)
    target = " ".join(words)
    pos = norm.find(target)
    if pos != -1:
        return idx[pos], idx[pos + len(target) - 1] + 1
    if len(words) < MIN_WORDS:
        return None
    best: tuple[int, int] | None = None
    best_len = 0
    i = 0
    while i <= len(words) - MIN_WORDS:
        j = i + MIN_WORDS
        chunk = " ".join(words[i:j])
        p = norm.find(chunk)
        if p == -1:
            i += 1
            continue
        while j < len(words) and norm.find(" ".join(words[i:j + 1])) != -1:
            j += 1
        chunk = " ".join(words[i:j])
        p = norm.find(chunk)
        if j - i > best_len:
            best_len, best = j - i, (idx[p], idx[p + len(chunk) - 1] + 1)
        i = j
    return best


def _clean(quote: str) -> list[str]:
    q = quote.strip().strip('"“”‘’\'').replace("…", " ").replace("...", " ")
    return q.split()


def resolve(rule_hint: str | None, quote: str) -> dict | None:
    """Returns a citation dict (without "n") for a verified quote, or None."""
    words = _clean(quote)
    if not words:
        return None
    by_id = corpus.rules_by_id()
    order: list[corpus.Rule] = []
    hint = corpus.resolve_rule_id(str(rule_hint)) if rule_hint else None
    if hint:
        order.append(by_id[hint])
    order += [r for r in corpus.rules() if r.rule != hint]

    # amendment texts first if the model points at one
    if (rule_hint and "amend" in str(rule_hint).lower()) or (hint == "2" and "500" in quote):
        cit = _resolve_amendment(words)
        if cit:
            return cit
    for rule in order:
        span = _find_in_rule(rule, words)
        if span:
            start, end = span
            passage = rule.passage_around(start, end)
            if len(passage) > MAX_QUOTE_CHARS:
                passage = rule.text[start:end]
            page = rule.page_at(start)
            return {
                "rule": rule.rule, "sub_rule": rule.sub_rule_at(start), "title": rule.title, "page": page,
                "quote": passage, "pdf_url": f"/pdf/en#page={page}", "hi_pdf_url": f"/pdf/hi#page={page}",
                "amendment_id": None,
            }
    return _resolve_amendment(words)


def _resolve_amendment(words: list[str]) -> dict | None:
    target = " ".join(words)
    for a in corpus.amendments():
        text = re.sub(r"\s+", " ", a["text"])
        if target in text or (len(words) >= MIN_WORDS and any(
            " ".join(words[i:i + MIN_WORDS]) in text for i in range(len(words) - MIN_WORDS + 1)
        )):
            return {
                "rule": a["rule"], "sub_rule": a["rule_ref"][len(a["rule"]):], "title": "Amendment " + a["effective_date_display"],
                "page": None, "quote": target if target in text else text[:400], "pdf_url": a["source_url"],
                "hi_pdf_url": None, "amendment_id": a["id"],
            }
    return None


def apply(answer: str, quotes: list[dict]) -> tuple[str, list[dict], int]:
    """Verifies quotes, renumbers [n] markers in the answer, drops markers of rejected quotes.

    Returns (answer_text, citations, number_of_rejected_quotes).
    """
    citations: list[dict] = []
    remap: dict[str, str] = {}
    rejected = 0
    seen: dict[tuple, int] = {}
    for q in quotes:
        n = str(q.get("n", "")).strip()
        cit = resolve(q.get("rule"), str(q.get("quote", "")))
        if cit is None:
            rejected += 1
            remap[n] = ""
            continue
        key = (cit["rule"], cit["quote"])
        if key in seen:
            remap[n] = f"[{seen[key]}]"
            continue
        cit["n"] = len(citations) + 1
        seen[key] = cit["n"]
        citations.append(cit)
        remap[n] = f"[{cit['n']}]"

    def sub(m: re.Match) -> str:
        return remap.get(m.group(1), "")

    text = re.sub(r"\[(\d+)\]", sub, answer)
    text = re.sub(r"[ \t]+([.,;:])", r"\1", text)
    return text.strip(), citations, rejected
