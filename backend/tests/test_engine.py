"""Tests the Claude tool loop and citation mapping with a fake client (no network)."""
from types import SimpleNamespace as NS

import pytest

from app import config
from app.llm import engine
from app.llm.documents import documents
from app.main import ask_events
from app.router import intake


def _cite(snippet: str):
    for i, d in enumerate(documents()):
        pos = d.text.find(snippet)
        if pos != -1:
            return NS(type="char_location", document_index=i, start_char_index=pos, end_char_index=pos + len(snippet),
                      cited_text=snippet, document_title=d.title)
    raise AssertionError(snippet)


class FakeStream:
    def __init__(self, msg):
        self.msg = msg

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def __iter__(self):
        for b in self.msg.content:
            if b.type == "text":
                yield NS(type="text", text=b.text)

    def get_final_message(self):
        return self.msg


class FakeClient:
    def __init__(self, turns):
        self.turns = list(turns)
        self.calls = []
        self.beta = NS(messages=NS(stream=self._stream))

    def _stream(self, **kwargs):
        self.calls.append(kwargs)
        return FakeStream(self.turns.pop(0))


USAGE = NS(input_tokens=100, output_tokens=50, cache_read_input_tokens=80000, cache_creation_input_tokens=0)


def _msg(content, stop):
    return NS(content=content, stop_reason=stop, usage=USAGE, model="claude-opus-5-5")


@pytest.fixture
def fake(monkeypatch):
    def install(turns):
        fc = FakeClient(turns)
        monkeypatch.setattr(engine, "_client", fc)
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test")
        return fc
    return install


def test_tool_loop_and_citations(fake):
    q = "What is the minimum rear open space for a 150 sq m residential plot?"
    fc = fake([
        _msg([NS(type="tool_use", id="t1", name="rear_open_space", input={"plot_area_sqm": 150, "height_m": None})], "tool_use"),
        _msg([
            NS(type="text", text="Leave at least 1.5 m at the rear.", citations=[_cite("Above 40.00 and up to 150.00                            1.50")]),
            NS(type="text", text="\n- It must run along the whole rear wall (Rule 56(2)(b)).", citations=[_cite("The rear open space\n              shall be co-extensive with the entire face of the rear wall")]),
        ], "end_turn"),
    ])
    events = list(ask_events(q))
    final = events[-1]
    assert final["status"] == "answered" and final["mode"] == "ai"
    assert final["facts"][0]["value"] == 1.5
    assert [(c["rule"], c["sub_rule"], c["page"]) for c in final["citations"]] == [("56", "(2)(a)", 78), ("56", "(2)(b)", 78)]
    assert "[1]" in final["answer_md"] and "[2]" in final["answer_md"]
    assert final["unverified_numbers"] == []
    # documents are cached and citations are enabled
    first = fc.calls[0]
    docs = [b for b in first["messages"][0]["content"] if b["type"] == "document"]
    assert docs[-1]["cache_control"] == {"type": "ephemeral"}
    assert all(d["citations"] == {"enabled": True} for d in docs)
    assert first["model"] == config.MODEL
    # tool result was sent back
    assert fc.calls[1]["messages"][2]["content"][0]["type"] == "tool_result"


def test_not_found(fake):
    fake([_msg([NS(type="text", text="NOT_FOUND: Municipal building bye-laws", citations=None)], "end_turn")])
    final = list(ask_events("Can I keep a pet elephant on my roof?"))[-1]
    assert final["status"] == "not_found"


def test_uncited_answer_becomes_not_found(fake):
    fake([_msg([NS(type="text", text="You can build 4 floors.", citations=None)], "end_turn")])
    final = list(ask_events("How many floors on a corner plot near the lake?"))[-1]
    assert final["status"] == "not_found"


def test_unverified_number_flagged(fake):
    fake([_msg([NS(type="text", text="Leave 4.2 m at the front.", citations=[_cite("Up to 9.0 meters")])], "end_turn")])
    final = list(ask_events("Front gap on a 9 m road?"))[-1]
    assert final["unverified_numbers"] == ["4.2"] and final["confidence"] == "check"


def test_amendment_citation_banner(fake):
    amend = documents()[-1]
    snippet = "does not require separate development permission under Rule 2(5)(a)"
    pos = amend.text.find(snippet)
    cit = NS(type="char_location", document_index=len(documents()) - 1, start_char_index=pos, end_char_index=pos + len(snippet),
             cited_text=snippet, document_title=amend.title)
    fake([_msg([NS(type="text", text="No separate development permission is needed for a 300 sq m plot that conforms.", citations=[cit])], "end_turn")])
    final = list(ask_events("Do I need separate development permission for a 300 sq m plot that matches the Development Plan?"))[-1]
    assert final["citations"][0]["amendment_id"] == "2026-08-28-r2-5-c"
    assert final["amendments"] and final["amendments"][0]["date"] == "28-08-2026"


def test_intake_hindi():
    it = intake("मेरा प्लॉट २०० वर्ग मीटर का है और सामने 9 मीटर चौड़ी सड़क है")
    assert it.lang == "hi" and it.facts == {"plot_area_sqm": 200.0, "street_width_m": 9.0}


def test_sqft_conversion():
    it = intake("1500 sq ft plot on 30 feet road")
    assert it.facts["plot_area_sqm"] == pytest.approx(139.35, abs=0.01)


def test_offline_far_word_is_not_floor_area_ratio(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
    final = list(ask_events("How far must my balcony stay from a low-voltage overhead electric line?"))[-1]
    keys = {f["key"] for f in final["facts"]}
    assert keys == {"electric_clearance"}
