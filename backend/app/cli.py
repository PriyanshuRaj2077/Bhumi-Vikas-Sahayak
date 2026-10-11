"""Command-line interface. Prints JSON, so it is easy to use from scripts and AI agents.

Run from the backend/ folder:
    python -m app.cli ask "What is the minimum rear open space for a 150 sq m plot?"
    python -m app.cli plot-check --plot 200 --road 9 --frontage 10 --height 10 --type semi_detached
    python -m app.cli calc rear_open_space '{"plot_area_sqm": 150}'
    python -m app.cli rule 17-a
    python -m app.cli search "lift"
    python -m app.cli meta
Add --text to `ask` for a short human-readable answer instead of JSON.
"""
from __future__ import annotations

import argparse
import json
import sys


def _print(obj) -> None:
    sys.stdout.reconfigure(encoding="utf-8")  # Hindi output on Windows consoles
    print(json.dumps(obj, ensure_ascii=False, indent=2, default=str))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m app.cli", description="Bhumi Vikas Sahayak CLI (JSON output)")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("ask", help="Ask a question in English or Hindi")
    p.add_argument("question")
    p.add_argument("--lang", default="auto", choices=["auto", "en", "hi"])
    p.add_argument("--text", action="store_true", help="print a short text answer instead of JSON")

    p = sub.add_parser("plot-check", help="All numbers for a plot (no AI)")
    p.add_argument("--plot", type=float, required=True, help="plot area, sq m")
    p.add_argument("--road", type=float, required=True, help="width of street in front, m")
    p.add_argument("--frontage", type=float)
    p.add_argument("--height", type=float)
    p.add_argument("--use", default="residential", choices=["residential", "commercial", "shop_cum_residence"])
    p.add_argument("--type", dest="building_type", choices=["detached", "semi_detached", "row"])
    p.add_argument("--built-up", dest="built_up", type=float)

    p = sub.add_parser("calc", help="Run one calculator tool with JSON arguments")
    p.add_argument("name")
    p.add_argument("args", nargs="?", default="{}")

    p = sub.add_parser("rule", help="Show one rule (accepts 56, 17-a, 26-B, 42A ...)")
    p.add_argument("id")

    p = sub.add_parser("search", help="Keyword search over the rules")
    p.add_argument("query")

    sub.add_parser("meta", help="Rules version, amendments, AI availability, eval summary")
    sub.add_parser("tools", help="List the calculator tools and their JSON schemas")

    a = ap.parse_args(argv)

    if a.cmd == "ask":
        from .main import ask_once

        ans = ask_once(a.question, a.lang)
        if a.text:
            sys.stdout.reconfigure(encoding="utf-8")
            if ans["status"] == "not_found":
                print("NOT FOUND in the Bhumi Vikas Rules.", ans.get("not_found_reason", ""))
            else:
                print(ans.get("answer_md", ""))
                for c in ans.get("citations", []):
                    print(f"  [{c['n']}] Rule {c['rule']}{c['sub_rule']} p.{c['page']}: {' '.join(c['quote'].split())[:160]}")
                print(f"({ans.get('mode')} mode · {ans.get('rules_version')})")
        else:
            _print(ans)
        return 0 if ans["status"] in ("answered", "not_found", "rule") else 1

    if a.cmd == "plot-check":
        from . import corpus
        from .calculators import core

        out = core.plot_check(plot_area_sqm=a.plot, street_width_m=a.road, frontage_m=a.frontage, height_m=a.height,
                              use=a.use, building_type=a.building_type, built_up_sqm=a.built_up)
        out["rules_version"] = corpus.rules_version()
        _print(out)
        return 0

    if a.cmd == "calc":
        from .llm.tools import run_tool

        facts, text, is_error = run_tool(a.name, json.loads(a.args))
        _print({"error": json.loads(text)["error"]} if is_error else {"facts": facts})
        return 1 if is_error else 0

    if a.cmd == "rule":
        from . import corpus

        rid = corpus.resolve_rule_id(a.id)
        if not rid:
            _print({"error": f"rule {a.id} not found"})
            return 1
        data = corpus.rules_by_id()[rid].public()
        data["later_amendments"] = corpus.amendments_for(rid)
        _print(data)
        return 0

    if a.cmd == "search":
        from .search import related

        _print(related(a.query, 8))
        return 0

    if a.cmd == "meta":
        from .main import meta

        _print(meta())
        return 0

    if a.cmd == "tools":
        from .llm.tools import TOOLS

        _print(TOOLS)
        return 0
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
