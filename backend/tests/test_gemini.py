"""Gemini provider: tool loop, quote verification and provider selection, with a fake client (no network)."""
from types import SimpleNamespace as NS

import pytest

from app import config
from app.llm import gemini_engine, quotes
from app.main import ask_events


class FakeModels:
    def __init__(self, turns):
        self.turns = list(turns)
        self.calls = []

    def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        return self.turns.pop(0)


USAGE = NS(prompt_token_count=90000, candidates_token_count=120, cached_content_token_count=85000)


def _resp(text=None, calls=None):
    return NS(text=text, function_calls=calls, candidates=[NS(content=NS(role="model", parts=[]))], usage_metadata=USAGE)


@pytest.fixture
def gemini(monkeypatch):
    for k in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("GEMINI_API_KEY", "test")
    monkeypatch.setenv("LLM_PROVIDER", "gemini")

    def install(turns):
        fake = NS(models=FakeModels(turns))
        monkeypatch.setattr(gemini_engine, "_client", fake)
        return fake.models
    return install


def test_provider_selection(monkeypatch):
    for k in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "GEMINI_API_KEY", "GOOGLE_API_KEY", "LLM_PROVIDER"):
        monkeypatch.delenv(k, raising=False)
    assert config.llm_provider() is None
    monkeypatch.setenv("GEMINI_API_KEY", "g")
    assert config.llm_provider() == "gemini" and config.active_model() == config.GEMINI_MODEL
    monkeypatch.setenv("ANTHROPIC_API_KEY", "a")
    assert config.llm_provider() == "anthropic"
    monkeypatch.setenv("LLM_PROVIDER", "gemini")
    assert config.llm_provider() == "gemini"


def test_gemini_tool_loop_and_verified_quotes(gemini):
    models = gemini([
        _resp(calls=[NS(name="rear_open_space", args={"plot_area_sqm": 150})]),
        _resp(text='```json\n{"answer": "Leave at least 1.5 m at the rear [1]. You may build 9 floors [2].", '
                   '"quotes": [{"n": 1, "rule": "56", "quote": "Above 40.00 and up to 150.00 1.50"}, '
                   '{"n": 2, "rule": "56", "quote": "residential buildings may have nine floors in all cases"}]}\n```'),
    ])
    final = list(ask_events("What is the minimum rear open space for a 150 sq m residential plot?"))[-1]
    assert final["status"] == "answered" and final["mode"] == "ai" and final["provider"] == "gemini"
    assert final["facts"][0]["value"] == 1.5
    assert [(c["rule"], c["sub_rule"], c["page"]) for c in final["citations"]] == [("56", "(2)(a)", 78)]
    assert "[1]" in final["answer_md"] and "[2]" not in final["answer_md"]
    assert any("removed" in w for w in final["warnings"])
    assert "9" in final["unverified_numbers"]  # the invented claim is also flagged by the number check
    # the second request carried the function response back
    assert len(models.calls) == 2
    sent = models.calls[1]["contents"]  # user question, model function call, user function response
    assert sent[2].role == "user" and sent[2].parts[0].function_response.name == "rear_open_space"


def test_gemini_not_found(gemini):
    gemini([_resp(text='{"not_found": "Property tax falls under the Municipal Corporation Act"}')])
    final = list(ask_events("Can I get a refund of my water connection deposit?"))[-1]
    assert final["status"] == "not_found" and "Municipal" in final["not_found_reason"]


def test_gemini_answer_without_valid_quotes_becomes_not_found(gemini):
    gemini([_resp(text='{"answer": "You can build anything [1].", "quotes": [{"n": 1, "rule": "56", "quote": "anything goes in Bhopal city"}]}')])
    final = list(ask_events("Can I build a ten storey tower on my small corner plot?"))[-1]
    assert final["status"] == "not_found"


def test_gemini_amendment_quote(gemini):
    gemini([_resp(text='{"answer": "No separate development permission is needed [1].", "quotes": [{"n": 1, '
                       '"rule": "2(5)(c) amendment", "quote": "does not require separate development permission under Rule 2(5)(a)"}]}')])
    final = list(ask_events("Do I need separate development permission for a 300 sq m plot that matches the Development Plan?"))[-1]
    assert final["citations"][0]["amendment_id"] == "2026-08-28-r2-5-c"
    assert final["amendments"][0]["date"] == "28-08-2026"


def test_gemini_error_falls_back_to_offline(gemini, monkeypatch):
    class Boom:
        def generate_content(self, **kwargs):
            raise ConnectionError("no network")
    monkeypatch.setattr(gemini_engine, "_client", NS(models=Boom()))
    final = list(ask_events("What is the minimum rear open space for a 150 sq m residential plot?"))[-1]
    assert final["mode"] == "offline" and final["facts"][0]["value"] == 1.5


def test_parse_final_variants():
    assert gemini_engine.parse_final("NOT_FOUND: tax law") == {"not_found": "tax law"}
    assert gemini_engine.parse_final('Sure! {"answer": "x", "quotes": []} hope this helps')["answer"] == "x"
    assert gemini_engine.parse_final("plain text")["answer"] == "plain text"


def test_tool_schemas_convert_for_gemini():
    for t in gemini_engine.TOOLS:
        s = gemini_engine._json_schema(t["input_schema"])
        assert "additionalProperties" not in s
        for name, p in s["properties"].items():
            assert not isinstance(p.get("type"), list)
    s = gemini_engine._json_schema(next(t for t in gemini_engine.TOOLS if t["name"] == "front_open_space")["input_schema"])
    assert s["required"] == ["street_width_m"]
    assert gemini_engine.tool_config()  # builds real google-genai types
    assert "Rule 56: Residential Buildings" in gemini_engine.system_instruction()


def test_quote_resolution():
    assert quotes.resolve("56", "Up to 9.0 meters 3.0 meters")["page"] == 77
    assert quotes.resolve(None, "this sentence is definitely not part of the rules at all") is None
    # partial: a real 6+ word run inside an otherwise altered quote is kept, the rest is not invented
    cit = quotes.resolve("23", "Such revalidation may be permitted for two consecutive terms, roughly speaking")
    assert cit and cit["rule"] == "23"
