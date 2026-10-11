"""Gemini answer engine: whole rulebook in the system instruction, calculator tools via function
calling, and quotes verified against the rule text (Gemini has no native citations API).

Emits the same events as engine.answer_stream, so the rest of the app does not care which
provider answered.
"""
from __future__ import annotations

import copy
import json
import logging
import re
import time
from collections.abc import Iterator
from functools import lru_cache

from .. import config
from ..router import Intake
from . import quotes
from .documents import documents
from .prompt import SYSTEM_PROMPT, question_block
from .tools import TOOLS, run_tool

log = logging.getLogger(__name__)
MAX_TURNS = 6

GEMINI_FORMAT = """
Output format (overrides the format above). Your final reply must be one JSON object and nothing else (no code fences):
{"answer": "<first line: the direct answer in at most 30 words; then up to 4 lines starting with '- '; put [1], [2] ... right after each claim>",
 "quotes": [{"n": 1, "rule": "<rule number, e.g. 56 or 2(5)(c) amendment>", "quote": "<5 to 40 words copied character for character from the documents>"}]}
Every [n] in the answer must have a quote with the same n. Copy quotes exactly; do not paraphrase, shorten with "...", or join text from different places. Quotes that are not found verbatim in the rules are deleted automatically.
If the documents do not cover the question, reply with {"not_found": "<which department or law most likely covers it>"}.
"""

_client = None


def client():
    global _client
    if _client is None:
        from google import genai

        _client = genai.Client(api_key=config.gemini_api_key())
    return _client


@lru_cache(maxsize=1)
def system_instruction() -> str:
    """Frozen prompt + whole rulebook (stable prefix, so Gemini's implicit cache can reuse it)."""
    parts = [SYSTEM_PROMPT, GEMINI_FORMAT, "\n# DOCUMENTS\n"]
    for d in documents():
        parts.append(f"\n<document title=\"{d.title}\">\n{d.context}\n{d.text}\n</document>\n")
    return "".join(parts)


def _json_schema(schema: dict) -> dict:
    """Our strict Anthropic schemas -> JSON Schema for Gemini: nullable types become optional anyOf."""
    s = copy.deepcopy(schema)
    props = s.get("properties", {})
    required = []
    for name, p in props.items():
        t = p.get("type")
        if isinstance(t, list) and "null" in t:
            base = [x for x in t if x != "null"][0]
            p.pop("type")
            p["anyOf"] = [{"type": base}, {"type": "null"}]
        else:
            required.append(name)
    s["required"] = required
    s.pop("additionalProperties", None)
    return s


@lru_cache(maxsize=1)
def tool_config():
    from google.genai import types

    decls = [types.FunctionDeclaration(name=t["name"], description=t["description"],
                                       parameters_json_schema=_json_schema(t["input_schema"])) for t in TOOLS]
    return [types.Tool(function_declarations=decls)]


def _gen_config():
    from google.genai import types

    return types.GenerateContentConfig(
        system_instruction=system_instruction(),
        tools=tool_config(),
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        temperature=0.1,
    )


def parse_final(text: str) -> dict:
    """Extracts the JSON object from the model's final text; tolerant of code fences and prose."""
    t = text.strip()
    t = re.sub(r"^```(?:json)?\s*|\s*```$", "", t)
    if t.upper().startswith("NOT_FOUND"):
        return {"not_found": t.split(":", 1)[1].strip() if ":" in t else ""}
    start, end = t.find("{"), t.rfind("}")
    if start != -1 and end > start:
        try:
            obj = json.loads(t[start:end + 1])
            if isinstance(obj, dict):
                return obj
        except json.JSONDecodeError:
            pass
    return {"answer": t, "quotes": []}


def answer_stream(intake: Intake) -> Iterator[dict]:
    from google.genai import errors, types

    started = time.monotonic()
    contents: list = [types.Content(role="user", parts=[types.Part.from_text(
        text=question_block(intake.question, intake.facts, intake.lang, intake.fact_notes))])]
    facts: list[dict] = []
    usage = {"input_tokens": 0, "output_tokens": 0, "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0}
    final_text = None
    try:
        for _ in range(MAX_TURNS):
            resp = client().models.generate_content(model=config.GEMINI_MODEL, contents=contents, config=_gen_config())
            um = getattr(resp, "usage_metadata", None)
            if um:
                usage["input_tokens"] += um.prompt_token_count or 0
                usage["output_tokens"] += um.candidates_token_count or 0
                usage["cache_read_input_tokens"] += getattr(um, "cached_content_token_count", 0) or 0
            calls = resp.function_calls or []
            if not resp.candidates:
                yield {"event": "error", "message": "Gemini returned no answer (it may have been blocked).", "code": "blocked"}
                return
            contents.append(resp.candidates[0].content)  # keeps thought signatures for the next turn
            if calls:
                parts = []
                for fc in calls:
                    args = dict(fc.args or {})
                    new_facts, text, is_error = run_tool(fc.name, args)
                    facts.extend(new_facts)
                    yield {"event": "tool", "name": fc.name, "input": args, "facts": new_facts, "error": is_error}
                    parts.append(types.Part.from_function_response(name=fc.name, response={"result": json.loads(text)}))
                contents.append(types.Content(role="user", parts=parts))
                continue
            final_text = resp.text or ""
            break
    except errors.ClientError as exc:
        code = getattr(exc, "code", 400)
        msg = {401: "The Gemini API key is invalid.", 403: "The Gemini API key is not allowed to use this model.",
               429: "Gemini rate limit reached. Please retry in a minute."}.get(code, f"Gemini request error ({code}).")
        yield {"event": "error", "message": msg, "code": "auth" if code in (401, 403) else "api"}
        return
    except errors.ServerError as exc:
        yield {"event": "error", "message": f"Gemini service error ({getattr(exc, 'code', 500)}).", "code": "api"}
        return
    except Exception as exc:  # network errors etc.: the app falls back to offline answers
        log.exception("Gemini call failed")
        yield {"event": "error", "message": f"Cannot reach Gemini ({type(exc).__name__}). Showing offline results.", "code": "offline"}
        return

    if final_text is None:
        yield {"event": "error", "message": "The answer took too many steps. Please ask a narrower question."}
        return

    obj = parse_final(final_text)
    warnings: list[str] = []
    if "not_found" in obj and not obj.get("answer"):
        text, citations = f"NOT_FOUND: {obj['not_found']}", []
    else:
        text, citations, rejected = quotes.apply(str(obj.get("answer", "")), list(obj.get("quotes") or []))
        if rejected:
            warnings.append(f"{rejected} quote(s) from the AI were not found word-for-word in the rules and were removed.")
    yield {
        "event": "llm_done", "text": text, "citations": citations, "facts": facts, "usage": usage,
        "model": config.GEMINI_MODEL, "latency_ms": int((time.monotonic() - started) * 1000), "warnings": warnings,
    }
