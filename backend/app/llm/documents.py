"""Builds the citable document blocks sent to Claude (one per Part of the rules + amendments).

Citations come back as (document_index, start_char, end_char). `locate()` maps that back to
a rule, sub-rule and exact PDF page using the offsets recorded here.
"""
from __future__ import annotations

import bisect
from dataclasses import dataclass
from functools import lru_cache

from .. import corpus


@dataclass
class DocPiece:
    rule: corpus.Rule
    start: int  # offset of the rule body inside the document text
    end: int


@dataclass
class Doc:
    title: str
    context: str
    text: str
    pieces: list[DocPiece]
    amendment: dict | None = None

    def locate(self, start: int, end: int) -> dict:
        if self.amendment:
            a = self.amendment
            return {"rule": a["rule"], "sub_rule": a["rule_ref"][len(a["rule"]):], "title": "Amendment " + a["effective_date_display"],
                    "page": None, "amendment_id": a["id"], "source_url": a["source_url"]}
        starts = [p.start for p in self.pieces]
        i = max(bisect.bisect_right(starts, start) - 1, 0)
        piece = self.pieces[i]
        local = max(start - piece.start, 0)
        r = piece.rule
        return {"rule": r.rule, "sub_rule": r.sub_rule_at(local), "title": r.title, "page": r.page_at(local)}


def _part_key(part: str) -> str:
    # Parts after VIII carry a long garbled heading; group them together.
    return part.split('"')[0].strip() if '"' in part else part


@lru_cache(maxsize=1)
def documents() -> list[Doc]:
    groups: dict[str, list[corpus.Rule]] = {}
    for r in corpus.rules():
        groups.setdefault(_part_key(r.part), []).append(r)
    docs: list[Doc] = []
    for part, rules in groups.items():
        chunks: list[str] = []
        pieces: list[DocPiece] = []
        length = 0
        for r in rules:
            header = f"=== Rule {r.rule}: {r.title} (PDF pages {r.page_start}-{r.page_end}) ===\n"
            chunks.append(header)
            length += len(header)
            pieces.append(DocPiece(rule=r, start=length, end=length + len(r.text)))
            chunks.append(r.text + "\n\n")
            length += len(r.text) + 2
        first, last = rules[0], rules[-1]
        docs.append(Doc(
            title=f"MP Bhumi Vikas Rules 2012: {part.rstrip(' -')} (Rules {first.rule}-{last.rule})",
            context=f"Official text consolidated to 06 March 2025. PDF pages {first.page_start}-{last.page_end}.",
            text="".join(chunks),
            pieces=pieces,
        ))
    for a in corpus.amendments():
        docs.append(Doc(
            title=f"Amendment dated {a['effective_date_display']} to Rule {a['rule_ref']} (later than the consolidated copy)",
            context=f"Source: {a['source_url']}. Gazette reference: {a['gazette_reference']}.",
            text=a["text"],
            pieces=[],
            amendment=a,
        ))
    return docs


def content_blocks() -> list[dict]:
    blocks = [
        {
            "type": "document",
            "source": {"type": "text", "media_type": "text/plain", "data": d.text},
            "title": d.title,
            "context": d.context,
            "citations": {"enabled": True},
        }
        for d in documents()
    ]
    blocks[-1]["cache_control"] = {"type": "ephemeral"}  # cache the whole rulebook prefix
    return blocks
