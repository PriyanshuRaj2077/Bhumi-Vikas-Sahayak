"""Scores the tool on eval/gold.jsonl and writes eval/results/latest.json + a markdown table.

Usage (from the repo root):
    python eval/run_eval.py              # AI mode if GEMINI_API_KEY or ANTHROPIC_API_KEY is set, else offline mode
    python eval/run_eval.py --offline    # force offline mode (calculators + keyword search)
    python eval/run_eval.py --only S01,S10

Checks per question:
- status: answered vs not_found matches;
- rule hit: every expected rule (or any of expect_rules_any) is among cited rules / calculator facts;
- numbers: every expected number appears in the answer text or fact values; none of must_not appear;
- expect_any_text: at least one of the phrases appears;
- expect_amendment: that amendment banner is attached.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
os.environ.setdefault("VAR_DIR", str(ROOT / "var" / "eval"))


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", s)


def score(item: dict, ans: dict) -> tuple[bool, list[str]]:
    problems: list[str] = []
    status = ans.get("status")
    if status != item["expect_status"]:
        return False, [f"status {status} (expected {item['expect_status']})"]
    if status == "not_found":
        return True, []
    rules = {c["rule"] for c in ans["citations"]} | {f["rule"] for f in ans["facts"]}
    for r in item.get("expect_rules", []):
        if r not in rules:
            problems.append(f"rule {r} not cited (got {sorted(rules)})")
    if item.get("expect_rules_any") and not set(item["expect_rules_any"]) & rules:
        problems.append(f"none of rules {item['expect_rules_any']} cited")
    blob = norm(ans["answer_md"] + " " + " ".join(f"{f['display']} {f['value']}" for f in ans["facts"]))
    for n in item.get("expect_numbers", []):
        variants = {n, n.replace(",", ""), n.rstrip("0").rstrip(".") if "." in n else n}
        if not any(re.search(rf"(?<![\d.]){re.escape(v)}(?![\d])", blob) for v in variants):
            problems.append(f"number {n} missing")
    for bad in item.get("must_not", []):
        if bad in blob:
            problems.append(f"contains wrong value {bad!r}")
    if item.get("expect_any_text") and not any(t in blob for t in item["expect_any_text"]):
        problems.append(f"none of {item['expect_any_text']} in answer")
    if item.get("expect_amendment") and item["expect_amendment"] not in {a["id"] for a in ans.get("amendments", [])}:
        problems.append("amendment banner missing")
    return not problems, problems


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--offline", action="store_true")
    ap.add_argument("--only", default="")
    args = ap.parse_args()
    if args.offline:
        os.environ["ANTHROPIC_API_KEY"] = ""
        os.environ["ANTHROPIC_AUTH_TOKEN"] = ""
        os.environ["GEMINI_API_KEY"] = ""
        os.environ["GOOGLE_API_KEY"] = ""

    from app import config
    from app.main import ask_events

    items = [json.loads(l) for l in open(ROOT / "eval" / "gold.jsonl", encoding="utf-8") if l.strip()]
    if args.only:
        keep = set(args.only.split(","))
        items = [i for i in items if i["id"] in keep]
    mode = "ai" if config.has_llm_credentials() else "offline"
    rows = []
    for item in items:
        t0 = time.monotonic()
        final = None
        for ev in ask_events(item["q"], item.get("lang", "auto")):
            if ev["event"] == "final":
                final = ev
        ok, problems = score(item, final or {})
        rows.append({"id": item["id"], "q": item["q"], "ok": ok, "problems": problems, "status": (final or {}).get("status"),
                     "mode": (final or {}).get("mode"), "rules": sorted({c["rule"] for c in (final or {}).get("citations", [])}),
                     "answer": (final or {}).get("answer_md", "")[:400], "seconds": round(time.monotonic() - t0, 1),
                     "usage": (final or {}).get("usage")})
        print(f"{'PASS' if ok else 'FAIL'} {item['id']:4} {rows[-1]['seconds']:5.1f}s  {'; '.join(problems)}")

    sample = [r for r in rows if r["id"].startswith("S")]
    summary = {
        "mode": mode, "provider": config.llm_provider(), "model": config.active_model(), "run_at": datetime.now().isoformat(timespec="seconds"),
        "total": len(sample), "correct": sum(r["ok"] for r in sample),
        "all_total": len(rows), "all_correct": sum(r["ok"] for r in rows),
        "label": f"{sum(r['ok'] for r in sample)}/{len(sample)} sample questions correct ({mode} mode)",
    }
    out_dir = ROOT / "eval" / "results"
    out_dir.mkdir(parents=True, exist_ok=True)
    payload = {"summary": summary, "rows": rows}
    (out_dir / f"{mode}.json").write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    if not args.only and (mode == "ai" or not (out_dir / "ai.json").exists()):
        (out_dir / "latest.json").write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")

    md = [f"### Eval: {summary['label']}; all {summary['all_correct']}/{summary['all_total']}", "",
          "| ID | Result | Question | Notes |", "|---|---|---|---|"]
    for r in rows:
        md.append(f"| {r['id']} | {'✅' if r['ok'] else '❌'} | {r['q'][:70]} | {'; '.join(r['problems'])} |")
    (out_dir / f"{mode}.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n" + summary["label"] + f"; all questions {summary['all_correct']}/{summary['all_total']}")


if __name__ == "__main__":
    main()
