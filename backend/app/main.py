"""FastAPI app: API + official PDFs + the built frontend, all from one origin."""
from __future__ import annotations

import json
import logging
import threading
import time
from collections.abc import Iterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import config, corpus, offline, store
from .calculators import core as calc
from .router import intake as make_intake
from .search import related
from .verify import build_answer

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("bvs")



@asynccontextmanager
async def lifespan(_app: FastAPI):
    _startup()
    yield


app = FastAPI(title="Bhumi Vikas Sahayak", version="1.0.0", lifespan=lifespan)


# ---------------------------------------------------------------------------
# Ask (streamed)
# ---------------------------------------------------------------------------
class AskIn(BaseModel):
    question: str = Field(min_length=3, max_length=1000)
    lang: str = "auto"


def ask_events(question: str, lang: str = "auto") -> Iterator[dict]:
    """Shared by the HTTP endpoint and the eval harness."""
    started = time.monotonic()
    qa_id = store.new_id()
    it = make_intake(question, lang)
    yield {"event": "start", "id": qa_id, "lang": it.lang, "facts_detected": it.facts,
           "personal_masked": it.personal_masked}

    if it.rule_ref:
        yield {"event": "final", "id": qa_id, "status": "rule", "rule": it.rule_ref, "lang": it.lang}
        return

    if it.out_of_scope:
        reason = it.out_of_scope[1] if it.lang == "hi" else it.out_of_scope[0]
        ans = build_answer(question=it.question, lang=it.lang, answer_text=f"NOT_FOUND: {reason}", citations=[], facts=[],
                           mode="rules")
        ans.update(id=qa_id, latency_ms=int((time.monotonic() - started) * 1000))
        store.log_answer(qa_id, it.question, ans, latency_ms=ans["latency_ms"])
        yield {"event": "final", **ans}
        return

    warnings: list[str] = []
    if it.fact_notes:
        warnings.extend(it.fact_notes)
    use_ai = config.has_llm_credentials() and store.questions_today() < config.MAX_QUESTIONS_PER_DAY
    if use_ai:
        from .llm.engine import answer_stream

        for ev in answer_stream(it):
            if ev["event"] == "llm_done":
                ans = build_answer(question=it.question, lang=it.lang, answer_text=ev["text"], citations=ev["citations"],
                                   facts=ev["facts"], mode="ai", extra_warnings=warnings)
                ans.update(id=qa_id, latency_ms=ev["latency_ms"], model=ev["model"], usage=ev["usage"])
                store.log_answer(qa_id, it.question, ans, ev["usage"], ev["model"], ev["latency_ms"])
                yield {"event": "final", **ans}
                return
            if ev["event"] == "error":
                warnings.append(ev["message"])
                yield {"event": "notice", "message": ev["message"]}
                break
            yield ev
    else:
        if not config.has_llm_credentials():
            warnings.append("एआई उत्तर बंद हैं (API कुंजी नहीं है); गणना परिणाम और संबंधित नियम दिखाए गए हैं।" if it.lang == "hi"
                            else "AI answers are off (no API key configured); showing calculator results and the matching rules.")
        else:
            warnings.append("आज की एआई प्रश्न सीमा पूरी हो गई; ऑफ़लाइन परिणाम दिखाए गए हैं।" if it.lang == "hi"
                            else "Daily AI question limit reached; showing offline results.")

    off = offline.answer(it)
    ans = build_answer(question=it.question, lang=it.lang, answer_text=off["text"], citations=off["citations"],
                       facts=off["facts"], mode="offline", extra_warnings=warnings, trusted=off["trusted"])
    ans.update(id=qa_id, latency_ms=int((time.monotonic() - started) * 1000))
    store.log_answer(qa_id, it.question, ans, latency_ms=ans["latency_ms"])
    yield {"event": "final", **ans}


def _sse(events: Iterator[dict]) -> Iterator[str]:
    try:
        for ev in events:
            name = ev.pop("event")
            yield f"event: {name}\ndata: {json.dumps(ev, ensure_ascii=False, default=str)}\n\n"
    except Exception:  # never leave the browser hanging
        log.exception("ask failed")
        yield "event: final\ndata: " + json.dumps({"status": "error", "message": "Something went wrong. Please try again."}) + "\n\n"


@app.post("/api/ask", summary="Ask a question (Server-Sent Events stream, used by the web UI)")
def ask(body: AskIn):
    return StreamingResponse(_sse(ask_events(body.question, body.lang)), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


def ask_once(question: str, lang: str = "auto") -> dict:
    """Runs the full pipeline and returns only the final answer (plus the calculator calls made)."""
    tools: list[dict] = []
    final: dict = {"status": "error", "message": "no answer"}
    for ev in ask_events(question, lang):
        if ev["event"] == "tool":
            tools.append({"name": ev["name"], "input": ev["input"], "error": ev["error"]})
        elif ev["event"] == "final":
            final = {k: v for k, v in ev.items() if k != "event"}
    final["question"] = question
    final["tool_calls"] = tools
    return final


@app.post("/api/ask/json", summary="Ask a question and get one JSON answer (no streaming; easiest for scripts and agents)")
def ask_json(body: AskIn):
    return ask_once(body.question, body.lang)


# ---------------------------------------------------------------------------
# Plot Check (deterministic, offline)
# ---------------------------------------------------------------------------
class PlotIn(BaseModel):
    plot_area_sqm: float = Field(gt=0, le=1_000_000)
    street_width_m: float = Field(gt=0, le=200)
    frontage_m: float | None = Field(default=None, gt=0, le=2000)
    height_m: float | None = Field(default=None, gt=0, le=500)
    use: str = "residential"
    building_type: str | None = None
    built_up_sqm: float | None = Field(default=None, gt=0)
    commercial_category: str | None = None
    conforms_to_dp: bool | None = None


@app.post("/api/plot-check")
def plot_check(body: PlotIn):
    try:
        out = calc.plot_check(**body.model_dump())
    except calc.InputError as exc:
        raise HTTPException(422, str(exc)) from exc
    out["rules_version"] = corpus.rules_version()
    return out


class CalcIn(BaseModel):
    name: str
    args: dict


@app.post("/api/calc")
def calc_one(body: CalcIn):
    from .llm.tools import run_tool

    facts, text, is_error = run_tool(body.name, body.args)
    if is_error:
        raise HTTPException(422, json.loads(text)["error"])
    return {"facts": facts}


# ---------------------------------------------------------------------------
# Rules, meta, feedback
# ---------------------------------------------------------------------------
@app.get("/api/rules")
def list_rules():
    return [{"rule": r.rule, "title": r.title, "part": r.part.split('"')[0].strip(" -") if '"' in r.part else r.part,
             "page_start": r.page_start, "page_end": r.page_end, "amended_later": bool(corpus.amendments_for(r.rule))}
            for r in corpus.rules()]


@app.get("/api/rules/{rule_id}")
def get_rule(rule_id: str):
    rid = corpus.resolve_rule_id(rule_id)
    if not rid:
        raise HTTPException(404, "Rule not found")
    r = corpus.rules_by_id()[rid]
    data = r.public()
    data["later_amendments"] = corpus.amendments_for(rid)
    data["pages"] = [{"offset": o, "page": p} for o, p in zip(r.page_offsets, r.page_numbers)]
    return data


@app.get("/api/search")
def search(q: str):
    return related(q, 8)


@app.get("/api/meta")
def meta():
    eval_path = config.ROOT_DIR / "eval" / "results" / "latest.json"
    eval_summary = None
    if eval_path.exists():
        eval_summary = json.loads(eval_path.read_text(encoding="utf-8")).get("summary")
    return {
        "rules_version": corpus.rules_version(),
        "amendments": corpus.amendments(),
        "ai_available": config.has_llm_credentials(),
        "model": config.MODEL,
        "eval": eval_summary,
        "stats": store.stats(),
        "recent": store.recent(),
        "disclaimer": config.DISCLAIMER_EN,
    }


class FeedbackIn(BaseModel):
    id: str
    verdict: str = Field(pattern="^(correct|wrong)$")
    note: str = ""


@app.post("/api/feedback")
def feedback(body: FeedbackIn):
    store.add_feedback(body.id, body.verdict, body.note)
    return {"ok": True}


@app.get("/healthz")
def healthz():
    return {"ok": True, "rules": len(corpus.rules()), "ai_available": config.has_llm_credentials()}


# ---------------------------------------------------------------------------
# PDFs and frontend
# ---------------------------------------------------------------------------
@app.get("/pdf/{lang}")
def pdf(lang: str):
    path = config.PDF_DIR / f"{lang}.pdf"
    if lang not in ("en", "hi") or not path.exists():
        raise HTTPException(404)
    return FileResponse(path, media_type="application/pdf", headers={"Cache-Control": "public, max-age=86400"})


if config.FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=config.FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        candidate = config.FRONTEND_DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(config.FRONTEND_DIST / "index.html")
else:
    @app.get("/")
    def no_frontend():
        return JSONResponse({"message": "Frontend not built. Run: cd frontend && npm install && npm run build"})


def _startup():
    corpus.rules()  # load and clean once
    if config.OFFICE_PREWARM and config.has_llm_credentials():
        from .llm.engine import prewarm

        def loop():
            while True:
                try:
                    prewarm()
                    log.info("prompt cache warmed")
                except Exception as exc:  # noqa: BLE001
                    log.warning("prewarm failed: %s", exc)
                time.sleep(config.PREWARM_SECONDS)

        threading.Thread(target=loop, daemon=True).start()
