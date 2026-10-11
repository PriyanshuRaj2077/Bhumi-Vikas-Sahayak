"""Answer without the LLM: detect the intent, run calculators, and show the best-matching rule text.

Used when no API key is configured or the AI service is unreachable. The clerk still gets
correct table numbers and the rule text to read, just without a written explanation.
"""
from __future__ import annotations

import re

from . import corpus
from .calculators import core as c
from .router import Intake
from .search import best_passage, index


def _has(q: str, *patterns: str) -> bool:
    return any(re.search(p, q, re.I) for p in patterns)


def _use(q: str) -> str:
    if _has(q, r"shop[- ]cum[- ]residen", "दुकान.?सह.?आवास"):
        return "shop_cum_residence"
    if _has(q, r"\bshops?\b", "commercial", "office", "दुकान", "वाणिज्य"):
        return "commercial"
    return "residential"


def facts_for(intake: Intake) -> list[c.Fact]:
    q = intake.question
    f = intake.facts
    out: list[c.Fact] = []
    tall = f.get("height_m", 0) > c.RESIDENTIAL_HEIGHT_LIMIT
    try:
        if _has(q, r"\bfront\b", "आगे", "सामने") and "street_width_m" in f:
            out.append(c.front_open_space(f["street_width_m"], f.get("height_m")))
        if _has(q, r"\brear\b", r"\bback\b", "पीछे") and "plot_area_sqm" in f:
            out.append(c.rear_open_space(f["plot_area_sqm"], f.get("height_m")))
        if _has(q, r"\bfees?\b", "फीस", "शुल्क"):
            if _has(q, "development permission", "विकास अनुज्ञा") and "area_ha" in f:
                out.extend(c.development_permission_fee(f["area_ha"]))
            else:
                built = f.get("built_up_sqm") or (round(1.25 * f["plot_area_sqm"], 2) if "plot_area_sqm" in f else None)
                if built:
                    out.extend(c.building_permission_fee(built, _use(q)))
        # "FAR" is matched case-sensitively so "how far" does not trigger it
        if re.search(r"\bFAR\b|F\.A\.R", q) or _has(q, r"\bfloors?\b", r"\bstoreys?\b", "floor area", "मंजिल", "मंज़िल", "एफएआर"):
            out.append(c.far_limit(_use(q), f.get("plot_area_sqm")))
        if ("street_width_m" in f and "plot_area_sqm" in f) and (
            tall or _has(q, r"\bfloors?\b", r"\bstoreys?\b", r"\bhigh\b", r"\btall\b", r"\bheight\b", "मंजिल", "ऊँचाई", "ऊंचाई")
        ):
            out.append(c.high_building_norms(f["street_width_m"], f["plot_area_sqm"], f.get("frontage_m"), f.get("height_m") if tall else None))
        if _has(q, "electric", "बिजली", "overhead", r"\bkv\b", "voltage"):
            kind = "extra_high" if _has(q, "extra high", r"\b(66|132|220|400)\s*kv") else (
                "high_upto_33kv" if _has(q, r"high[- ]voltage", r"\b(11|22|33)\s*kv") else "low_medium")
            out.append(c.electric_clearance(kind))
        if _has(q, "agricultural tourist", "agri.?touris", "कृषि पर्यटन"):
            out.append(c.farmhouse_norms("agri_tourism", f.get("area_ha")))
        elif _has(q, "farm ?house", "फार्म"):
            out.append(c.farmhouse_norms("farm_house", f.get("area_ha")))
        if _has(q, r"\bvalid", "renew", "revalid", "वैध") and (m := re.search(r"\b(20\d\d)\b", q)):
            out.append(c.permission_validity(f"{m.group(1)}-07-01"))
        if _has(q, "development permission", "विकास अनुज्ञा", "विकास अनुमति") and "plot_area_sqm" in f and not _has(q, r"\bfees?\b", "शुल्क"):
            out.append(c.development_permission_note(f["plot_area_sqm"]))
    except c.InputError:
        pass
    seen, facts = set(), []
    for fact in out:
        if fact.key not in seen:
            seen.add(fact.key)
            facts.append(fact)
    return facts


def _citation(n: int, rule: corpus.Rule, passage: str, off: int) -> dict:
    page = rule.page_at(off)
    return {
        "n": n, "rule": rule.rule, "sub_rule": rule.sub_rule_at(off), "title": rule.title, "page": page, "quote": passage,
        "pdf_url": f"/pdf/en#page={page}", "hi_pdf_url": f"/pdf/hi#page={page}", "amendment_id": None,
    }


def answer(intake: Intake) -> dict:
    hi = intake.lang == "hi"
    facts = facts_for(intake)
    fact_dicts = [f.to_dict() for f in facts]
    citations: list[dict] = []
    by_rule = corpus.rules_by_id()

    # 1. the exact table rows behind each calculator result
    for f in facts:
        rule = by_rule[f.rule]
        span = rule.find(f.source) if f.source else None
        if span and not any(cit["rule"] == f.rule and cit["quote"] == rule.passage_around(*span) for cit in citations):
            citations.append(_citation(len(citations) + 1, rule, rule.passage_around(*span), span[0]))

    # 2. keyword search for the rest (skipped when calculators already answered)
    hits = [] if facts else index().search(intake.question, 3)
    for rule, _ in hits:
        passage, off = best_passage(rule, intake.question)
        citations.append(_citation(len(citations) + 1, rule, passage, off))

    # 3. amendment overlay
    for f in facts:
        if f.key == "development_permission" and "amended" in f.sub_rule:
            for a in corpus.amendments_for("2"):
                citations.append({"n": len(citations) + 1, "rule": "2", "sub_rule": "(5)(c)", "title": "Amendment " + a["effective_date_display"],
                                  "page": None, "quote": a["text"].split("\n\n")[1], "pdf_url": a["source_url"], "hi_pdf_url": None,
                                  "amendment_id": a["id"]})

    trusted: list[str] = []
    lines = [f"**{(f['label_hi'] if hi else f['label'])}: {f['display']}** ({'नियम' if hi else 'Rule'} {f['rule']}{f['sub_rule']})"
             for f in fact_dicts]
    if _has(intake.question, r"\bfees?\b", "फीस", "शुल्क") and not any(f.key == "permission_fee" for f in facts):
        lines.append(c.fee_overview())
        trusted.append(c.fee_overview())  # built from the unit-tested fee table
        if not any(cit["rule"] == "21" for cit in citations):
            rule = by_rule["21"]
            span = rule.find("A building intended to be used")
            citations.insert(0, _citation(0, rule, rule.passage_around(*span), span[0]))
            for i, cit in enumerate(citations, start=1):
                cit["n"] = i
    if _has(intake.question, r"\bfloors?\b", r"\bstoreys?\b", "मंजिल", "मंज़िल"):
        lines.append("नियमों में मंज़िलों की संख्या तय नहीं है; ऊँचाई और कुल निर्मित क्षेत्र (एफएआर) सीमित हैं।" if hi
                     else "The rules do not fix a number of floors; they limit height and total floor area (FAR).")

    if lines:
        text = "\n".join(f"- {l}" for l in lines)
    elif citations:
        top = citations[0]
        lead = "सबसे संबंधित नियम" if hi else "Most relevant rule"
        snippet = re.sub(r"\s+", " ", top["quote"]).strip()[:260]
        text = f"{lead}: **Rule {top['rule']}{top['sub_rule']}, {top['title']}** (p.{top['page']})\n\n> {snippet}…"
    else:
        text = "NOT_FOUND: no matching rule"
    return {"text": text, "citations": citations, "facts": fact_dicts, "trusted": trusted}
