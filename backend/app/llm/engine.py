"""Claude answer engine: cached rulebook + citations + calculator tools, streamed."""
from __future__ import annotations

import logging
import time
from collections.abc import Iterator

import anthropic

from .. import config
from ..router import Intake
from .documents import content_blocks, documents
from .prompt import SYSTEM_PROMPT, question_block
from .tools import TOOLS, run_tool

log = logging.getLogger(__name__)
MAX_TURNS = 6

_client: anthropic.Anthropic | None = None


def client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(timeout=90.0, max_retries=2)
    return _client


def _request_kwargs(messages: list, max_tokens: int = 4000) -> dict:
    kwargs = dict(
        model=config.MODEL,
        max_tokens=max_tokens,
        system=SYSTEM_PROMPT,
        tools=TOOLS,
        output_config={"effort": config.EFFORT},
        messages=messages,
    )
    if config.USE_FALLBACKS:
        kwargs.update(betas=["server-side-fallback-2026-07-01"], fallbacks="default")
    return kwargs


def prewarm() -> None:
    """Writes the rulebook prefix into the prompt cache so the first real question is fast."""
    messages = [{"role": "user", "content": content_blocks() + [{"type": "text", "text": "warm-up"}]}]
    kwargs = _request_kwargs(messages, max_tokens=0)
    kwargs.pop("betas", None), kwargs.pop("fallbacks", None)
    client().messages.create(**kwargs)


def _citation_dict(cit, number: int) -> dict | None:
    if getattr(cit, "type", "") != "char_location":
        return None
    docs = documents()
    if not 0 <= cit.document_index < len(docs):
        return None
    loc = docs[cit.document_index].locate(cit.start_char_index, cit.end_char_index)
    rule = loc["rule"]
    page = loc["page"]
    return {
        "n": number, "rule": rule, "sub_rule": loc["sub_rule"], "title": loc["title"], "page": page,
        "quote": cit.cited_text.strip(), "amendment_id": loc.get("amendment_id"),
        "pdf_url": f"/pdf/en#page={page}" if page else loc.get("source_url"),
        "hi_pdf_url": f"/pdf/hi#page={page}" if page else None,
    }


def answer_stream(intake: Intake) -> Iterator[dict]:
    """Yields events: {"event": "delta"|"tool"|"llm_done"|"error", ...}."""
    started = time.monotonic()
    messages: list = [{
        "role": "user",
        "content": content_blocks() + [{"type": "text", "text": question_block(intake.question, intake.facts, intake.lang, intake.fact_notes)}],
    }]
    facts: list[dict] = []
    usage = {"input_tokens": 0, "output_tokens": 0, "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0}
    final = None
    try:
        for _ in range(MAX_TURNS):
            with client().beta.messages.stream(**_request_kwargs(messages)) as stream:
                for event in stream:
                    if event.type == "text":
                        yield {"event": "delta", "text": event.text}
                msg = stream.get_final_message()
            for k in usage:
                usage[k] += getattr(msg.usage, k, 0) or 0
            if msg.stop_reason == "refusal":
                yield {"event": "error", "message": "The model declined this request. Please rephrase or use Plot Check."}
                return
            messages.append({"role": "assistant", "content": msg.content})
            tool_uses = [b for b in msg.content if b.type == "tool_use"]
            if msg.stop_reason == "tool_use" and tool_uses:
                results = []
                for tu in tool_uses:
                    new_facts, text, is_error = run_tool(tu.name, tu.input)
                    facts.extend(new_facts)
                    yield {"event": "tool", "name": tu.name, "input": tu.input, "facts": new_facts, "error": is_error}
                    results.append({"type": "tool_result", "tool_use_id": tu.id, "content": text, "is_error": is_error})
                messages.append({"role": "user", "content": results})
                yield {"event": "delta_reset"}  # text so far was a preamble before tool calls
                continue
            final = msg
            break
    except anthropic.AuthenticationError:
        yield {"event": "error", "message": "The AI service key is missing or invalid.", "code": "auth"}
        return
    except anthropic.RateLimitError:
        yield {"event": "error", "message": "Too many requests right now. Please retry in a minute.", "code": "rate_limit"}
        return
    except anthropic.APIConnectionError:
        yield {"event": "error", "message": "Cannot reach the AI service. Plot Check and Browse still work offline.", "code": "offline"}
        return
    except anthropic.APIStatusError as exc:
        log.exception("Anthropic API error")
        yield {"event": "error", "message": "AI service error. Showing offline results.", "code": "api"}
        return

    if final is None:
        yield {"event": "error", "message": "The answer took too many steps. Please ask a narrower question."}
        return

    # Rebuild the answer text with numbered citation markers.
    parts: list[str] = []
    citations: list[dict] = []
    seen: dict[tuple, int] = {}
    for block in final.content:
        if block.type != "text":
            continue
        parts.append(block.text)
        markers = []
        for cit in getattr(block, "citations", None) or []:
            key = (getattr(cit, "document_index", None), getattr(cit, "start_char_index", None))
            if key not in seen:
                d = _citation_dict(cit, len(citations) + 1)
                if d is None:
                    continue
                seen[key] = d["n"]
                citations.append(d)
            if f"[{seen[key]}]" not in markers:
                markers.append(f"[{seen[key]}]")
        if markers:
            parts.append(" " + "".join(markers))
    yield {
        "event": "llm_done", "text": "".join(parts), "citations": citations, "facts": facts,
        "usage": usage, "model": getattr(final, "model", config.MODEL), "latency_ms": int((time.monotonic() - started) * 1000),
    }
