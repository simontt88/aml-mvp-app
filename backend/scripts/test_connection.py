import sys
import re
import os

# Ensure backend root is on sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import engine


def mask_auth_token(url: str) -> str:
    if not isinstance(url, str):
        return str(url)
    return re.sub(r"(authToken=)[^&]+", r"\1***", url)


def main() -> int:
    url = str(engine.url)
    print("Engine URL:", mask_auth_token(url))

    try:
        with engine.connect() as conn:
            value = conn.exec_driver_sql("select 1").scalar()
            print("select 1 =>", value)
            print("Connection OK")
            return 0
    except Exception as e:
        print("Connection FAILED:", e)
        return 1


if __name__ == "__main__":
    sys.exit(main())


