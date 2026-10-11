"""Loads the rules JSONL and cleans it into citable documents.

Cleaning (see docs/01-research.md section 4):
- running page headers ("Rule 56   M.P. Bhumi Vikas Rules, 2012   78") are removed,
  but the page number is kept so every character maps to an exact PDF page;
- court "COMMENTS" (case law) are split out; they are not rules;
- amendment footnotes ("Subs. by Notification No. ... dated ...") are parsed as metadata;
- inserted rules that live inside a parent rule (17-a in 17, 42-A in 42 ...) get aliases.
"""
from __future__ import annotations

import bisect
import json
import re
from dataclasses import dataclass, field
from functools import lru_cache

from .config import DATA_DIR, SOURCE_DIR

HEADER_RE = re.compile(r"^.*M\.P\. Bhumi Vikas Rules, 2012\s+(\d+)\s*$")
COMMENTS_RE = re.compile(r"^\s*COMMENTS\s*$")
# A sub-rule marker at the start of a line: "(1) Text", "(a) Text", "(ii) Text", "1[(4) Text".
# Table column headers such as "(1)   (2)   (3)" are excluded by the (?!\() lookahead.
MARKER_RE = re.compile(r"(?m)^\s*(?:\d?\s*\[)?\s*\((\d{1,2}|[a-z]|[ivx]{1,4})\)[ \t]+(?!\()\S")
AMEND_RE = re.compile(
    r"(Subs\.|Ins\.|Inserted|Substituted|Added|Omitted|Deleted|Subs\. \(Inserted\))[^\n]*?"
    r"Notification No\.?\s*([^\n,]+?),?\s*[Dd]ated\s*(?:the\s*)?([0-9]{1,2}(?:st|nd|rd|th)?[\s-]*\w+[\s,-]*\d{4})",
)

# Inserted rules printed with their own number but stored inside the previous rule.
ALIASES = {
    "12-A": "12", "12A": "12",
    "17-A": "17", "17A": "17",
    "25(A)": "25", "25A": "25", "25-A": "25",
    "26-A": "26", "26A": "26",
    "26B": "26-B",
    "42-A": "42", "42A": "42",
    "93(A)": "93", "93A": "93", "93-A": "93",
}


@dataclass
class Rule:
    rule: str
    title: str
    part: str
    page_start: int
    page_end: int
    text: str  # cleaned, citable text
    raw_text: str
    comments: list[str] = field(default_factory=list)
    amendments: list[dict] = field(default_factory=list)
    page_offsets: list[int] = field(default_factory=list)  # char offsets where a page begins
    page_numbers: list[int] = field(default_factory=list)  # page number for each offset

    def page_at(self, char_index: int) -> int:
        i = bisect.bisect_right(self.page_offsets, char_index) - 1
        return self.page_numbers[max(i, 0)]

    def sub_rule_at(self, char_index: int) -> str:
        """Best-effort sub-rule label, e.g. "(1)(a)", for the text at char_index."""
        before = self.text[: char_index + 1]
        num = letter = roman = None
        for m in MARKER_RE.finditer(before):
            tok = m.group(1)
            if tok.isdigit():
                num, letter, roman = tok, None, None
            elif re.fullmatch(r"[ivx]+", tok) and not (
                len(tok) == 1 and letter and ord(tok) == ord(letter) + 1
            ):
                if num is not None or letter is not None:
                    roman = tok
            else:
                letter, roman = tok, None
        if num is None and letter is None:
            return ""
        return "".join(f"({p})" for p in (num, letter, roman) if p)

    def find(self, snippet: str) -> tuple[int, int] | None:
        """Locate a whitespace-normalised snippet in the text; returns (start, end) or None."""
        words = snippet.split()
        if not words:
            return None
        m = re.search(r"\s+".join(re.escape(w) for w in words), self.text)
        return (m.start(), m.end()) if m else None

    def passage_around(self, start: int, end: int) -> str:
        """The full lines containing [start, end), plus one line of context before."""
        nl = chr(10)
        line_start = self.text.rfind(nl, 0, start)
        if line_start > 0:
            line_start = self.text.rfind(nl, 0, line_start)
        line_end = self.text.find(nl, end)
        return self.text[max(line_start, 0): line_end if line_end != -1 else len(self.text)].strip(nl)

    def public(self) -> dict:
        return {
            "rule": self.rule,
            "title": self.title,
            "part": self.part,
            "page_start": self.page_start,
            "page_end": self.page_end,
            "text": self.text,
            "comments": self.comments,
            "amendments": self.amendments,
        }


def _split_comments(lines: list[str]) -> tuple[list[str], list[str]]:
    """Remove COMMENTS blocks (one or more case-law paragraphs) from the rule lines."""
    kept: list[str] = []
    comments: list[str] = []
    i = 0
    while i < len(lines):
        if COMMENTS_RE.match(lines[i]):
            i += 1
            while True:
                para: list[str] = []
                while i < len(lines) and not lines[i].strip():
                    i += 1
                while i < len(lines) and lines[i].strip() and not HEADER_RE.match(lines[i]):
                    para.append(lines[i].strip())
                    i += 1
                if para:
                    comments.append(" ".join(para))
                # Another case note follows only if the next paragraph looks like one.
                j = i
                while j < len(lines) and not lines[j].strip():
                    j += 1
                nxt = " ".join(l.strip() for l in lines[j : j + 6])
                if j < len(lines) and " -- " in nxt and " Vs. " in " ".join(l for l in lines[j : j + 12]):
                    i = j
                    continue
                break
            continue
        kept.append(lines[i])
        i += 1
    return kept, comments


def _clean(raw: dict) -> Rule:
    lines = raw["text"].split("\n")
    lines, comments = _split_comments(lines)
    out: list[str] = []
    offsets = [0]
    pages = [raw["page_start"]]
    length = 0
    for line in lines:
        m = HEADER_RE.match(line)
        if m and line.strip().startswith("Rule"):
            page = int(m.group(1))
            if page != pages[-1]:
                offsets.append(length)
                pages.append(page)
            continue
        out.append(line)
        length += len(line) + 1
    text = "\n".join(out)
    text = re.sub(r"\n{3,}", "\n\n", text).rstrip()
    # Re-derive offsets after blank-line collapsing (collapse only shortens text, so
    # recompute by replaying the same transformation on prefixes).
    if len(offsets) > 1:
        joined = "\n".join(out)
        new_offsets = [0]
        for off in offsets[1:]:
            prefix = re.sub(r"\n{3,}", "\n\n", joined[:off])
            new_offsets.append(len(prefix))
        offsets = new_offsets

    amendments = []
    seen = set()
    for m in AMEND_RE.finditer(raw["text"].replace("\n", " ")):
        key = (m.group(2).strip(), m.group(3).strip())
        if key in seen:
            continue
        seen.add(key)
        amendments.append({"kind": m.group(1), "notification": key[0], "date": key[1]})

    return Rule(
        rule=raw["rule"],
        title=raw["title"],
        part=raw["part"],
        page_start=raw["page_start"],
        page_end=raw["page_end"],
        text=text,
        raw_text=raw["text"],
        comments=comments,
        amendments=amendments,
        page_offsets=offsets,
        page_numbers=pages,
    )


@lru_cache(maxsize=1)
def rules() -> list[Rule]:
    path = SOURCE_DIR / "bhumi_vikas_rules.jsonl"
    with open(path, encoding="utf-8") as fh:
        return [_clean(json.loads(line)) for line in fh if line.strip()]


@lru_cache(maxsize=1)
def rules_by_id() -> dict[str, Rule]:
    return {r.rule: r for r in rules()}


def resolve_rule_id(ref: str) -> str | None:
    ref = ref.strip().upper().replace(" ", "")
    ref = re.sub(r"^(RULE|NIYAM|नियम)", "", ref)
    by_id = rules_by_id()
    if ref in by_id:
        return ref
    if ref in ALIASES:
        return ALIASES[ref]
    base = re.match(r"^(\d+)", ref)
    if base and base.group(1) in by_id:
        return base.group(1)
    return None


@lru_cache(maxsize=1)
def amendments() -> list[dict]:
    with open(DATA_DIR / "amendments.json", encoding="utf-8") as fh:
        return json.load(fh)["amendments"]


def amendments_for(rule_id: str) -> list[dict]:
    return [a for a in amendments() if a["rule"] == rule_id]


def rules_version() -> str:
    from .config import RULES_BASE_VERSION

    later = amendments()
    if not later:
        return RULES_BASE_VERSION
    dates = ", ".join(f"{a['effective_date_display']} (Rule {a['rule_ref']})" for a in later)
    return f"{RULES_BASE_VERSION} + {len(later)} later amendment{'s' if len(later) > 1 else ''}: {dates}"
