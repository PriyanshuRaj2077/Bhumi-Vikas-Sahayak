"""HTTP API and CLI contract tests (offline mode, no network)."""
import json

import pytest
from fastapi.testclient import TestClient

from app import cli
from app.main import app


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)


client = TestClient(app)


def test_health():
    assert client.get("/healthz").json()["rules"] == 106


def test_ask_json_answer_shape():
    r = client.post("/api/ask/json", json={"question": "What is the minimum rear open space for a 150 sq m residential plot?"})
    body = r.json()
    assert r.status_code == 200 and body["status"] == "answered"
    for key in ("answer_md", "facts", "citations", "rules_version", "disclaimer", "confidence", "unverified_numbers"):
        assert key in body
    assert body["facts"][0]["value"] == 1.5
    assert body["citations"][0]["rule"] == "56" and body["citations"][0]["page"] == 78


def test_ask_json_not_found():
    body = client.post("/api/ask/json", json={"question": "How do I pay my property tax online?"}).json()
    assert body["status"] == "not_found" and body["not_found_reason"]


def test_ask_stream_sse():
    r = client.post("/api/ask", json={"question": "Front open space on a 10 m road?"})
    assert r.headers["content-type"].startswith("text/event-stream")
    events = [b.split("\n")[0][7:] for b in r.text.strip().split("\n\n")]
    assert events[0] == "start" and events[-1] == "final"


def test_ask_validation():
    assert client.post("/api/ask/json", json={"question": "a"}).status_code == 422


def test_plot_check():
    body = client.post("/api/plot-check", json={"plot_area_sqm": 200, "street_width_m": 9}).json()
    keys = {f["key"]: f for f in body["facts"]}
    assert keys["front_open_space"]["value"] == 3.0 and keys["total_fee"]["value"] == 3250
    assert client.post("/api/plot-check", json={"plot_area_sqm": -1, "street_width_m": 9}).status_code == 422


def test_calc_endpoint():
    body = client.post("/api/calc", json={"name": "electric_clearance", "args": {"line_type": "high_upto_33kv"}}).json()
    assert body["facts"][0]["value"] == 3.7
    assert client.post("/api/calc", json={"name": "nope", "args": {}}).status_code == 422


def test_rules_endpoints():
    rules = client.get("/api/rules").json()
    assert len(rules) == 106 and any(r["amended_later"] for r in rules)
    assert client.get("/api/rules/17-a").json()["rule"] == "17"
    assert client.get("/api/rules/999").status_code == 404


def test_meta_and_pdf():
    meta = client.get("/api/meta").json()
    assert meta["amendments"][0]["rule_ref"] == "2(5)(c)"
    assert client.get("/pdf/en").headers["content-type"] == "application/pdf"


def test_openapi_lists_endpoints():
    paths = client.get("/openapi.json").json()["paths"]
    for p in ("/api/ask", "/api/ask/json", "/api/plot-check", "/api/calc", "/api/rules", "/api/meta"):
        assert p in paths


def test_cli_ask_and_plot(capsys):
    assert cli.main(["ask", "Rear open space for a 225 sq m plot?"]) == 0
    out = json.loads(capsys.readouterr().out)
    assert out["facts"][0]["value"] == 2.5
    assert cli.main(["plot-check", "--plot", "200", "--road", "9"]) == 0
    assert "facts" in json.loads(capsys.readouterr().out)
    assert cli.main(["rule", "26-B"]) == 0
    assert cli.main(["calc", "far_limit", '{"use": "residential", "plot_area_sqm": 200}']) == 0


def test_personal_data_is_masked_before_logging():
    from app import store

    body = client.post("/api/ask/json", json={"question": "Who signs my plans? call me 9876543210 or a@b.com"}).json()
    rows = store.conn().execute("SELECT question FROM qa_log WHERE id=?", (body["id"],)).fetchall()
    assert rows and "9876543210" not in rows[0][0] and "a@b.com" not in rows[0][0]
