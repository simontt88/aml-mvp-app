from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

load_dotenv()

# Resolve project root (backend directory) and read optional Turso info
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_INFO_PATH = os.path.join(PROJECT_ROOT, "db_info.txt")

def _read_db_info_file(path: str):
    endpoint = None
    token = None
    try:
        if os.path.exists(path):
            with open(path, "r") as f:
                for line in f.read().splitlines():
                    if line.startswith("endpoint="):
                        endpoint = line.split("endpoint=", 1)[1].strip()
                    elif line.startswith("token="):
                        token = line.split("token=", 1)[1].strip()
    except Exception:
        pass
    return endpoint, token

# Minimal, robust engine construction per Turso guidance
raw_url = os.getenv("TURSO_DATABASE_URL") or ""
auth_token = os.getenv("TURSO_AUTH_TOKEN") or os.getenv("LIBSQL_AUTH_TOKEN")

# Fallback to db_info.txt if env not provided
file_endpoint, file_token = _read_db_info_file(DB_INFO_PATH)
if file_endpoint and not raw_url:
    raw_url = file_endpoint
if file_token and not auth_token:
    auth_token = file_token

# Default local SQLite
if not raw_url:
    DATABASE_URL = "sqlite:///./aml_screening.db"
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    # Expect libsql remote url
    if not raw_url.startswith("libsql://"):
        raise ValueError(f"Unexpected TURSO_DATABASE_URL: {raw_url}")
    sa_url = f"sqlite+{raw_url}"
    # Prefer passing token both in connect_args and querystring to satisfy some envs/proxies
    params = []
    if auth_token:
        params.append(f"authToken={auth_token}")
    params.append("secure=true")
    # Some environments (e.g., behind certain proxies) require HTTP transport instead of WebSocket
    if os.getenv("LIBSQL_HTTP", "0") in ("1", "true", "True"): 
        params.append("hrana_transport=http")
    sep = "&" if "?" in sa_url else "?"
    sa_url = f"{sa_url}{sep}{'&'.join(params)}"
    DATABASE_URL = sa_url
    engine = create_engine(
        sa_url,
        connect_args={"auth_token": auth_token} if auth_token else {},
        pool_pre_ping=True,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()