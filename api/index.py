import os
import sys
from pathlib import Path


# Ensure the Python path can import the backend package (which contains `app`)
CURRENT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = CURRENT_DIR.parent
BACKEND_DIR = PROJECT_ROOT / "backend"

# Prepend backend directory so imports like `from app.main import app` work
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


# Expose FastAPI app for Vercel's Python ASGI runtime
from fastapi import FastAPI  # noqa: E402
from app.main import app as backend_app  # noqa: E402

# Mount the backend app under /api so routes match when accessed via /api/* on Vercel
vercel_app = FastAPI()
vercel_app.mount("/api", backend_app)
app = vercel_app

# Optional: allow overriding CORS for previews via env
default_cors = os.getenv("CORS_ALLOW_ORIGINS")
if default_cors:
    # If set, `app` in app.main already reads and applies CORS from env on import
    # Nothing else to do here; this import ensures env is loaded before first request.
    pass


