# CLAUDE.md

Read [AGENTS.md](AGENTS.md) first: it has the repo map, commands, answer schema and invariants.

Quick commands:
- Verify everything: `python verify.py` (add `--frontend` to build the UI)
- Backend tests: `cd backend && python -m pytest -q`
- Run the app: `cd backend && python -m uvicorn app.main:app --port 8000` (build the UI first: `cd frontend && npm install && npm run build`)
- Ask from the CLI: `cd backend && python -m app.cli ask "Rear open space for a 150 sq m plot?"`

AI provider: `LLM_PROVIDER=gemini|anthropic|auto` + `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` (no key = offline mode).

Rules when changing code:
- Numbers from rule tables go in `backend/app/calculators/core.py` with a verbatim `source` snippet plus a test, never in prompts.
- Keep `backend/app/llm/prompt.py` and the document blocks byte-stable (prompt caching).
- New amendments go in `backend/data/amendments.json`.
