"""SQLite log of questions, answers and feedback. No personal data is stored (masked at intake)."""
from __future__ import annotations

import json
import sqlite3
import threading
import time
import uuid
from datetime import date

from .config import VAR_DIR

_lock = threading.Lock()
_conn: sqlite3.Connection | None = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS qa_log (
  id TEXT PRIMARY KEY, ts REAL, day TEXT, lang TEXT, mode TEXT, question TEXT, status TEXT, rules_cited TEXT,
  confidence TEXT, latency_ms INTEGER, input_tokens INTEGER, output_tokens INTEGER, cache_read_tokens INTEGER,
  cache_write_tokens INTEGER, model TEXT, answer_json TEXT
);
CREATE TABLE IF NOT EXISTS feedback (qa_id TEXT, ts REAL, verdict TEXT, note TEXT);
"""


def conn() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        VAR_DIR.mkdir(parents=True, exist_ok=True)
        _conn = sqlite3.connect(VAR_DIR / "app.db", check_same_thread=False)
        _conn.executescript(SCHEMA)
    return _conn


def new_id() -> str:
    return "q_" + uuid.uuid4().hex[:12]


def log_answer(qa_id: str, question: str, answer: dict, usage: dict | None = None, model: str = "", latency_ms: int = 0):
    usage = usage or {}
    rules = sorted({c["rule"] for c in answer.get("citations", [])} | {f["rule"] for f in answer.get("facts", [])})
    with _lock:
        conn().execute(
            "INSERT OR REPLACE INTO qa_log VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (qa_id, time.time(), date.today().isoformat(), answer.get("lang"), answer.get("mode"), question, answer.get("status"),
             ",".join(rules), answer.get("confidence"), latency_ms, usage.get("input_tokens", 0), usage.get("output_tokens", 0),
             usage.get("cache_read_input_tokens", 0), usage.get("cache_creation_input_tokens", 0), model,
             json.dumps(answer, ensure_ascii=False)),
        )
        conn().commit()


def questions_today() -> int:
    with _lock:
        row = conn().execute("SELECT COUNT(*) FROM qa_log WHERE day=? AND mode='ai'", (date.today().isoformat(),)).fetchone()
    return row[0]


def add_feedback(qa_id: str, verdict: str, note: str):
    with _lock:
        conn().execute("INSERT INTO feedback VALUES (?,?,?,?)", (qa_id, time.time(), verdict, note[:500]))
        conn().commit()


def recent(limit: int = 6) -> list[dict]:
    with _lock:
        rows = conn().execute(
            "SELECT id, question, status, rules_cited, lang FROM qa_log WHERE ts IN (SELECT MAX(ts) FROM qa_log GROUP BY question) "
            "ORDER BY ts DESC LIMIT ?", (limit,)
        ).fetchall()
    return [{"id": r[0], "question": r[1], "status": r[2], "rules": r[3].split(",") if r[3] else [], "lang": r[4]} for r in rows]


def stats() -> dict:
    with _lock:
        c = conn()
        total = c.execute("SELECT COUNT(*) FROM qa_log").fetchone()[0]
        good = c.execute("SELECT COUNT(*) FROM feedback WHERE verdict='correct'").fetchone()[0]
        bad = c.execute("SELECT COUNT(*) FROM feedback WHERE verdict='wrong'").fetchone()[0]
    return {"questions": total, "feedback_correct": good, "feedback_wrong": bad}
