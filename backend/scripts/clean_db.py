import sys
import os
import argparse

# Ensure backend root is on sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import engine, SessionLocal
from app.models import (
    Base,
    Operator,
    SourceCase,
    CaseStatusSnapshot as CaseStatusModel,
    AspectFeedback,
    CaseLog,
)


def drop_and_recreate() -> None:
    print("Dropping all v2 tables…")
    Base.metadata.drop_all(bind=engine)
    print("Recreating v2 tables…")
    Base.metadata.create_all(bind=engine)
    print("Done.")


def delete_rows(keep_operators: bool = False) -> None:
    db = SessionLocal()
    try:
        # Delete in dependency-safe order
        db.query(AspectFeedback).delete()
        db.query(CaseLog).delete()
        db.query(CaseStatusModel).delete()
        db.query(SourceCase).delete()
        if not keep_operators:
            db.query(Operator).delete()
        db.commit()
    finally:
        db.close()


def print_counts() -> None:
    db = SessionLocal()
    try:
        counts = {
            "operators": db.query(Operator).count(),
            "source_cases": db.query(SourceCase).count(),
            "case_status": db.query(CaseStatusModel).count(),
            "aspect_feedback": db.query(AspectFeedback).count(),
            "case_logs": db.query(CaseLog).count(),
        }
        print("Current counts:")
        for k, v in counts.items():
            print(f"- {k}: {v}")
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description="Clean Turso DB back to square 1 (v2 tables only)")
    parser.add_argument(
        "--drop",
        action="store_true",
        help="Drop and recreate all v2 tables instead of deleting rows",
    )
    parser.add_argument(
        "--keep-operators",
        action="store_true",
        help="When deleting rows, preserve records in operators table",
    )
    args = parser.parse_args()

    if args.drop:
        drop_and_recreate()
    else:
        delete_rows(keep_operators=args.keep_operators)

    print_counts()


if __name__ == "__main__":
    main()


