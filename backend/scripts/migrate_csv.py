import pandas as pd
import json
import sys
import os
from sqlalchemy.orm import Session
import re

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Ensure we import DB configured for Turso if present
from app.database import SessionLocal, engine
from app.models import Base, Operator, SourceCase, CaseStatusSnapshot as CaseStatusModel, AspectFeedback, CaseLog
from app.auth import get_password_hash

def create_default_operator(db: Session):
    """Create a default operator if none exists"""
    operator = db.query(Operator).first()
    if not operator:
        default_operator = Operator(
            name="Default Operator",
            email="operator@example.com",
            password_hash=get_password_hash("password123"),
            role="analyst"
        )
        db.add(default_operator)
        db.commit()
        db.refresh(default_operator)
        return default_operator
    return operator

def migrate_csv_data(csv_file_path: str, batch_size: int = 50):
    """Migrate data from CSV to v2 tables only.

    Accepts fe_input.csv style columns: profile_unique_id, dj_profile_id, profile_info,
    structured_record, name_llm_output, age_llm_output, nationality_llm_output,
    risk_llm_output, final_score, reference_id (optional)
    """

    # Create only v2 tables if not exist
    SourceCase.__table__.create(bind=engine, checkfirst=True)
    CaseStatusModel.__table__.create(bind=engine, checkfirst=True)
    AspectFeedback.__table__.create(bind=engine, checkfirst=True)
    Operator.__table__.create(bind=engine, checkfirst=True)
    CaseLog.__table__.create(bind=engine, checkfirst=True)

    db = SessionLocal()
    try:
        operator = create_default_operator(db)
        print(f"Using operator: {operator.name} (ID: {operator.id})")

        df = pd.read_csv(csv_file_path)
        print(f"Processing {len(df)} rows from CSV")

        def sanitize_llm_output(raw_text: str) -> str:
            if pd.isna(raw_text):
                return json.dumps({"reasoning": "", "claims": []})
            text = str(raw_text)
            try:
                obj = json.loads(text)
            except Exception:
                text2 = re.sub(r"'record:(\d+:\d+)'", r'"record:\\1"', text)
                text2 = text2.replace("'", '"')
                try:
                    obj = json.loads(text2)
                except Exception:
                    return json.dumps({"reasoning": text, "claims": []})
            reasoning = obj.get('reasoning') or (obj.get('category') or {}).get('reasoning') or ""
            verdict = (obj.get('category') or {}).get('verdict')
            claims = obj.get('claims') or []
            norm_claims = []
            for c in claims:
                st = c.get('statement') if isinstance(c, dict) else str(c)
                cits = []
                raw_cits = c.get('citations', []) if isinstance(c, dict) else []
                for cit in raw_cits:
                    m = re.search(r"(\d+):(\d+)", str(cit))
                    if m:
                        cits.append(f"record:{m.group(1)}:{m.group(2)}")
                norm_claims.append({"statement": st, "citations": cits})
            return json.dumps({"reasoning": reasoning, "claims": norm_claims, "category": {"verdict": verdict}})

        def parse_json_forgiving(raw_val):
            try:
                if isinstance(raw_val, (dict, list)):
                    return raw_val
                return json.loads(raw_val)
            except Exception:
                try:
                    text = str(raw_val)
                    # attempt common fixes
                    text2 = re.sub(r"'record:(\d+:\d+)'", r'"record:\\1"', text)
                    text2 = text2.replace("'", '"')
                    return json.loads(text2)
                except Exception:
                    return None

        success_count = 0
        error_count = 0
        total = len(df)
        ops_in_batch = 0

        for index, row in df.iterrows():
            try:
                profile_unique_id = row['profile_unique_id']
                dj_profile_id = row['dj_profile_id']
                pf = parse_json_forgiving(row['profile_info'])
                profile_info = pf if pf is not None else {"raw": str(row['profile_info'])}
                structured_record = row['structured_record']
                candidate_name = None
                m = re.search(r"Name\.fullName:\s*([^\n]+)", structured_record)
                if m:
                    candidate_name = m.group(1).replace('-', '').strip()
                hit_record = {
                    "dj_profile_id": dj_profile_id,
                    "source": profile_info.get('profile_sourceofname')
                }

                # Parse aspect outputs if present
                def get_aspect(col):
                    val = row.get(col)
                    return sanitize_llm_output(str(val)) if pd.notna(val) else None
                aspect_name_json = get_aspect('name_llm_output')
                aspect_age_json = get_aspect('age_llm_output')
                aspect_nat_json = get_aspect('nationality_llm_output')
                aspect_risk_json = get_aspect('risk_llm_output')

                # Upsert SourceCase
                src = db.query(SourceCase).filter(
                    SourceCase.profile_unique_id==profile_unique_id,
                    SourceCase.dj_profile_id==dj_profile_id
                ).first()
                if not src:
                    src = SourceCase(
                        profile_unique_id=profile_unique_id,
                        dj_profile_id=dj_profile_id,
                        reference_id=str(row.get('reference_id')) if 'reference_id' in df.columns else None,
                        profile_info=profile_info,
                        structured_record=structured_record,
                        hit_record=hit_record,
                        candidate_name=candidate_name,
                        final_score=float(row.get('final_score')) if 'final_score' in df.columns and pd.notna(row.get('final_score')) else None,
                        aspect_name_json=aspect_name_json,
                        aspect_age_json=aspect_age_json,
                        aspect_nationality_json=aspect_nat_json,
                        aspect_risk_json=aspect_risk_json,
                    )
                    db.add(src)
                else:
                    src.reference_id=str(row.get('reference_id')) if 'reference_id' in df.columns else src.reference_id
                    src.profile_info=profile_info or src.profile_info
                    src.structured_record=structured_record or src.structured_record
                    src.hit_record=hit_record or src.hit_record
                    src.candidate_name=candidate_name or src.candidate_name
                    src.final_score=float(row.get('final_score')) if 'final_score' in df.columns and pd.notna(row.get('final_score')) else src.final_score
                    src.aspect_name_json=aspect_name_json or src.aspect_name_json
                    src.aspect_age_json=aspect_age_json or src.aspect_age_json
                    src.aspect_nationality_json=aspect_nat_json or src.aspect_nationality_json
                    src.aspect_risk_json=aspect_risk_json or src.aspect_risk_json

                # Upsert AspectFeedback per aspect/operator
                for aspect, aspect_json in {
                    'name': aspect_name_json,
                    'age': aspect_age_json,
                    'nationality': aspect_nat_json,
                    'risk': aspect_risk_json,
                }.items():
                    if aspect_json:
                        af = db.query(AspectFeedback).filter(
                            AspectFeedback.profile_unique_id==profile_unique_id,
                            AspectFeedback.dj_profile_id==dj_profile_id,
                            AspectFeedback.aspect_type==aspect,
                            AspectFeedback.operator_id==operator.id
                        ).first()
                        score = None
                        if pd.notna(row.get('final_score')):
                            score = float(row.get('final_score'))
                        elif pd.notna(row.get(f'{aspect}_llm_verdict_score')):
                            score = float(row.get(f'{aspect}_llm_verdict_score'))
                        if not af:
                            db.add(AspectFeedback(
                                profile_unique_id=profile_unique_id,
                                dj_profile_id=dj_profile_id,
                                aspect_type=aspect,
                                llm_output=aspect_json,
                                llm_verdict_score=score,
                                operator_id=operator.id
                            ))
                        else:
                            af.llm_output = aspect_json
                            af.llm_verdict_score = score if score is not None else af.llm_verdict_score

                # Init case status if missing
                status = db.query(CaseStatusModel).filter(
                    CaseStatusModel.profile_unique_id==profile_unique_id,
                    CaseStatusModel.dj_profile_id==dj_profile_id
                ).first()
                if not status:
                    db.add(CaseStatusModel(
                        profile_unique_id=profile_unique_id,
                        dj_profile_id=dj_profile_id,
                        case_status='unreviewed',
                        aspects_status={}
                    ))
                success_count += 1
                if index % 20 == 0 or index == total - 1:
                    print(f"Progress: {index+1}/{total} processed (ok={success_count}, err={error_count})", flush=True)

                # Batch commit to avoid large end-of-run commit stalls
                ops_in_batch += 1
                if ops_in_batch >= batch_size:
                    print(f"Committing batch (size={ops_in_batch})…", flush=True)
                    db.commit()
                    ops_in_batch = 0
            except Exception as e:
                print(f"Error processing row {index}: {str(e)}")
                db.rollback()
                error_count += 1
                if index % 20 == 0 or index == total - 1:
                    print(f"Progress: {index+1}/{total} processed (ok={success_count}, err={error_count})", flush=True)
                continue

        if ops_in_batch > 0:
            print(f"Committing final batch (size={ops_in_batch})…", flush=True)
            db.commit()
        print("Migration completed successfully (v2 only)!")

        total_src = db.query(SourceCase).count()
        total_status = db.query(CaseStatusModel).count()
        total_feedback = db.query(AspectFeedback).count()
        print("Summary:")
        print(f"- SourceCases: {total_src}")
        print(f"- CaseStatus: {total_status}")
        print(f"- AspectFeedback: {total_feedback}")
        print(f"- Rows OK: {success_count}")
        print(f"- Rows ERR: {error_count}")
    except Exception as e:
        print(f"Migration failed: {str(e)}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Migrate CSV into v2 tables (Turso)")
    parser.add_argument("csv", nargs="?", default="/Users/simonting/Documents/aml-agent/aml-agent-fe/fe_input.csv", help="Path to CSV (default: repo fe_input.csv)")
    parser.add_argument("--batch-size", type=int, default=50, help="Rows per commit batch (default 50)")
    args = parser.parse_args()

    if not os.path.exists(args.csv):
        print(f"CSV file not found: {args.csv}")
        sys.exit(1)

    migrate_csv_data(args.csv, batch_size=args.batch_size)