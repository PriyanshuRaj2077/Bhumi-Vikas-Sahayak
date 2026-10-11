"""BM25 keyword search over the cleaned rules (no external dependencies)."""
from __future__ import annotations

import math
import re
from collections import Counter
from functools import lru_cache

from . import corpus
from .router import expand_hindi, tokens


class _Index:
    def __init__(self):
        self.rules = corpus.rules()
        self.docs = []
        for r in self.rules:
            # title words count three times: they are the best signal
            toks = tokens(r.title) * 3 + tokens(r.text)
            self.docs.append(Counter(toks))
        self.lengths = [sum(d.values()) for d in self.docs]
        self.avg = sum(self.lengths) / len(self.lengths)
        df = Counter()
        for d in self.docs:
            df.update(d.keys())
        n = len(self.docs)
        self.idf = {t: math.log(1 + (n - c + 0.5) / (c + 0.5)) for t, c in df.items()}

    def search(self, query: str, k: int = 5) -> list[tuple[corpus.Rule, float]]:
        q = tokens(expand_hindi(query))
        if not q:
            return []
        scores = []
        for i, d in enumerate(self.docs):
            s = 0.0
            for t in q:
                f = d.get(t)
                if not f:
                    continue
                s += self.idf[t] * f * 2.2 / (f + 1.2 * (0.25 + 0.75 * self.lengths[i] / self.avg))
            if s > 0:
                scores.append((self.rules[i], s))
        scores.sort(key=lambda x: -x[1])
        return scores[:k]


@lru_cache(maxsize=1)
def index() -> _Index:
    return _Index()


def best_passage(rule: corpus.Rule, query: str, width: int = 420) -> tuple[str, int]:
    """Return the paragraph of the rule that best matches the query, and its char offset."""
    q = set(tokens(expand_hindi(query)))
    best, best_score, best_off = rule.text[:width], -1, 0
    for m in re.finditer(r"(?:[^\n]+\n?){1,6}", rule.text):
        chunk = m.group(0)
        score = len(q & set(tokens(chunk)))
        if score > best_score:
            best, best_score, best_off = chunk, score, m.start()
    return best.strip()[:width], best_off


def related(query: str, k: int = 4) -> list[dict]:
    out = []
    for rule, score in index().search(query, k):
        passage, off = best_passage(rule, query)
        out.append({
            "rule": rule.rule, "title": rule.title, "page": rule.page_at(off), "sub_rule": rule.sub_rule_at(off),
            "quote": passage, "score": round(score, 2),
        })
    return out
