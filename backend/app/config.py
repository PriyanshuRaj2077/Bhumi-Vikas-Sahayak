"""Runtime settings, read from environment variables (and an optional .env file)."""
from __future__ import annotations

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = BACKEND_DIR.parent
DATA_DIR = BACKEND_DIR / "data"
SOURCE_DIR = DATA_DIR / "source"
TABLES_DIR = DATA_DIR / "tables"
PDF_DIR = DATA_DIR / "pdf"
BUILD_DIR = DATA_DIR / "build"
VAR_DIR = Path(os.environ.get("VAR_DIR", ROOT_DIR / "var"))
FRONTEND_DIST = Path(os.environ.get("FRONTEND_DIST", ROOT_DIR / "frontend" / "dist"))


def _load_dotenv() -> None:
    """Minimal .env loader so the app runs without extra dependencies."""
    for candidate in (ROOT_DIR / ".env", BACKEND_DIR / ".env"):
        if not candidate.exists():
            continue
        for line in candidate.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv()

MODEL = os.environ.get("MODEL", "claude-opus-5-5")
EFFORT = os.environ.get("EFFORT", "low")
USE_FALLBACKS = os.environ.get("USE_FALLBACKS", "1") == "1"
MAX_QUESTIONS_PER_DAY = int(os.environ.get("MAX_QUESTIONS_PER_DAY", "2000"))
PREWARM_SECONDS = int(os.environ.get("PREWARM_SECONDS", "240"))
OFFICE_PREWARM = os.environ.get("PREWARM", "0") == "1"


def has_llm_credentials() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))


RULES_BASE_VERSION = "Consolidated to 06-03-2025"
DISCLAIMER_EN = "Reference aid only, not legal advice. The final decision rests with the Authority."
DISCLAIMER_HI = "केवल संदर्भ सहायता है, कानूनी सलाह नहीं। अंतिम निर्णय सक्षम प्राधिकारी का है।"
