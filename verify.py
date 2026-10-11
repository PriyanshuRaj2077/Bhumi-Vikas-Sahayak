"""One command to check the whole project. Writes verify_report.json (machine-readable) and prints a summary.

    python verify.py                 # backend tests + offline accuracy eval + data integrity checks (about 10 s, no network)
    python verify.py --frontend      # also type-check and build the React app (needs Node 20+)
    python verify.py --ai            # also run the eval in AI mode (needs ANTHROPIC_API_KEY; costs about $1)

Exit code 0 means every selected check passed.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"


def run(cmd: list[str], cwd: Path, env: dict | None = None) -> tuple[int, str, float]:
    t0 = time.monotonic()
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace",
                       env={**os.environ, "PYTHONIOENCODING": "utf-8", **(env or {})}, shell=False)
    return p.returncode, (p.stdout or "") + (p.stderr or ""), round(time.monotonic() - t0, 1)


def check_tests() -> dict:
    code, out, secs = run([sys.executable, "-m", "pytest", "-q", "-p", "no:warnings"], BACKEND)
    m = re.search(r"(\d+) passed", out)
    f = re.search(r"(\d+) failed", out)
    return {"name": "backend_tests", "passed": code == 0, "tests_passed": int(m.group(1)) if m else 0,
            "tests_failed": int(f.group(1)) if f else 0, "seconds": secs, "tail": out.strip().splitlines()[-3:]}


def check_eval(mode: str) -> dict:
    args = [sys.executable, "eval/run_eval.py"] + (["--offline"] if mode == "offline" else [])
    code, out, secs = run(args, ROOT)
    path = ROOT / "eval" / "results" / f"{mode}.json"
    summary = json.loads(path.read_text(encoding="utf-8"))["summary"] if path.exists() and code == 0 else {}
    ok = code == 0 and summary.get("correct") == summary.get("total")
    return {"name": f"eval_{mode}", "passed": ok, "summary": summary, "seconds": secs,
            "failures": [l for l in out.splitlines() if l.startswith("FAIL")]}


def check_data() -> dict:
    sys.path.insert(0, str(BACKEND))
    from app import corpus  # noqa: E402

    rules = corpus.rules()
    problems = []
    if len(rules) != 106:
        problems.append(f"expected 106 rules, got {len(rules)}")
    for r in rules:
        if "M.P. Bhumi Vikas Rules, 2012   " in r.text:
            problems.append(f"running header left in rule {r.rule}")
        if any(not (r.page_start <= p <= r.page_end + 1) for p in r.page_numbers):
            problems.append(f"page out of range in rule {r.rule}")
    for a in corpus.amendments():
        for k in ("id", "rule", "rule_ref", "effective_date", "source_url", "text", "summary_en", "summary_hi"):
            if not a.get(k):
                problems.append(f"amendment {a.get('id')} missing {k}")
    for pdf in ("en", "hi"):
        if not (BACKEND / "data" / "pdf" / f"{pdf}.pdf").exists():
            problems.append(f"missing PDF {pdf}")
    return {"name": "data_integrity", "passed": not problems, "rules": len(rules),
            "amendments": len(corpus.amendments()), "problems": problems}


def check_secrets() -> dict:
    hits = []
    for p in ROOT.rglob("*"):
        if any(part in p.parts for part in ("node_modules", ".git", "dist", "var", "__pycache__")) or not p.is_file():
            continue
        if p.suffix.lower() in (".pdf", ".png", ".woff", ".woff2", ".jpg", ".db"):
            continue
        try:
            text = p.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        if re.search(r"sk-ant-[A-Za-z0-9_-]{20,}", text):
            hits.append(str(p.relative_to(ROOT)))
    return {"name": "no_secrets_in_repo", "passed": not hits, "files": hits}


def check_frontend() -> dict:
    npm = shutil.which("npm")
    if not npm:
        return {"name": "frontend_build", "passed": False, "error": "npm not found"}
    fe = ROOT / "frontend"
    if not (fe / "node_modules").exists():
        run([npm, "ci"], fe)
    code, out, secs = run([npm, "run", "build"], fe)
    return {"name": "frontend_build", "passed": code == 0, "seconds": secs, "tail": out.strip().splitlines()[-2:]}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--frontend", action="store_true")
    ap.add_argument("--ai", action="store_true")
    a = ap.parse_args()

    checks = [check_data(), check_secrets(), check_tests(), check_eval("offline")]
    if a.ai:
        checks.append(check_eval("ai"))
    if a.frontend:
        checks.append(check_frontend())
    report = {"project": "bhumi-vikas-sahayak", "run_at": datetime.now().isoformat(timespec="seconds"),
              "all_passed": all(c["passed"] for c in checks), "checks": checks}
    (ROOT / "verify_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    for c in checks:
        extra = ""
        if c["name"] == "backend_tests":
            extra = f"{c['tests_passed']} passed, {c['tests_failed']} failed"
        elif c["name"].startswith("eval_"):
            extra = c["summary"].get("label", "") + (f"; all {c['summary'].get('all_correct')}/{c['summary'].get('all_total')}" if c["summary"] else "")
        elif c["name"] == "data_integrity":
            extra = f"{c['rules']} rules, {c['amendments']} amendment(s)" + (f"; {c['problems']}" if c["problems"] else "")
        print(f"{'PASS' if c['passed'] else 'FAIL'}  {c['name']:20} {extra}")
    print("\nALL CHECKS PASSED" if report["all_passed"] else "\nSOME CHECKS FAILED", "-> verify_report.json")
    return 0 if report["all_passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
