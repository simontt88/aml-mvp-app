from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
import os
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import timedelta, datetime
from typing import Dict, Any, Optional, List

from app.database import get_db, engine
from app.models import Operator
from app.schemas import (
    OperatorCreate, Operator as OperatorSchema, LoginRequest, Token,
    AspectFeedbackSchema, AspectFeedbackCreate,
    SourceCase as SourceCaseSchema, CaseStatusSchema, CaseLogSchema,
    BatchCaseStatusRequest, BatchCaseStatusResponse, BatchCaseStatusResponseItem
)
from app.auth import (
    authenticate_operator, create_access_token, get_current_operator,
    get_password_hash, ACCESS_TOKEN_EXPIRE_MINUTES
)
from app.models import SourceCase, CaseStatusSnapshot as CaseStatusModel, CaseLog as CaseLogModel, AspectFeedback as AspectFeedbackModel

# Ensure required v2 tables exist on startup (cloud DBs start empty)
for table in [
    Operator.__table__,
    SourceCase.__table__,
    CaseStatusModel.__table__,
    AspectFeedbackModel.__table__,
    CaseLogModel.__table__,
]:
    try:
        table.create(bind=engine, checkfirst=True)
    except Exception:
        # Silently continue if creation fails due to race or perms
        pass

app = FastAPI(title="AML Screening API", version="1.0.0")

origins = os.getenv("CORS_ALLOW_ORIGINS", "http://localhost:3000,http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in origins if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Authentication endpoints
@app.post("/auth/login", response_model=Token)
def login(login_request: LoginRequest, db: Session = Depends(get_db)):
    operator = authenticate_operator(db, login_request.email, login_request.password)
    if not operator:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": operator.email}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/auth/register", response_model=OperatorSchema)
def register(operator_data: OperatorCreate, db: Session = Depends(get_db)):
    db_operator = db.query(Operator).filter(Operator.email == operator_data.email).first()
    if db_operator:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = get_password_hash(operator_data.password)
    db_operator = Operator(
        name=operator_data.name,
        email=operator_data.email,
        password_hash=hashed_password,
        role=operator_data.role
    )
    db.add(db_operator)
    db.commit()
    db.refresh(db_operator)
    return db_operator

@app.get("/auth/me", response_model=OperatorSchema)
def get_current_user(current_operator: Operator = Depends(get_current_operator)):
    return current_operator

# v1 endpoints removed

# v2 endpoints ---------------------------------------------------------------

@app.get("/v2/cases", response_model=List[SourceCaseSchema])
def list_cases(
    profile_unique_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(get_current_operator)
):
    q = db.query(SourceCase)
    if profile_unique_id:
        q = q.filter(SourceCase.profile_unique_id == profile_unique_id)
    return q.offset(skip).limit(limit).all()


@app.get("/v2/cases/{profile_id}/{dj_id}", response_model=SourceCaseSchema)
def get_case_detail_v2(
    profile_id: str,
    dj_id: str,
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(get_current_operator)
):
    case = db.query(SourceCase).filter(SourceCase.profile_unique_id == profile_id, SourceCase.dj_profile_id == dj_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return case


@app.get("/v2/cases/{profile_id}/{dj_id}/status", response_model=CaseStatusSchema)
def get_case_status_v2(
    profile_id: str,
    dj_id: str,
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(get_current_operator)
):
    status = db.query(CaseStatusModel).filter(CaseStatusModel.profile_unique_id == profile_id, CaseStatusModel.dj_profile_id == dj_id).first()
    if not status:
        # initialize default
        status = CaseStatusModel(profile_unique_id=profile_id, dj_profile_id=dj_id, case_status="unreviewed", aspects_status={})
        db.add(status)
        db.commit()
        db.refresh(status)
    return status


@app.patch("/v2/cases/{profile_id}/{dj_id}/status", response_model=CaseStatusSchema)
def update_case_status_v2(
    profile_id: str,
    dj_id: str,
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(get_current_operator)
):
    status = db.query(CaseStatusModel).filter(CaseStatusModel.profile_unique_id == profile_id, CaseStatusModel.dj_profile_id == dj_id).first()
    if not status:
        status = CaseStatusModel(profile_unique_id=profile_id, dj_profile_id=dj_id, case_status="unreviewed", aspects_status={})
        db.add(status)
    # Apply updates
    if 'case_status' in payload:
        status.case_status = payload['case_status']
    if 'aspects_status' in payload:
        status.aspects_status = payload['aspects_status']
    status.last_updated_by = current_operator.id
    db.add(status)
    # Log
    db.add(CaseLogModel(profile_unique_id=profile_id, dj_profile_id=dj_id, event_type='status_change', payload=payload, operator_id=current_operator.id))
    db.commit()
    db.refresh(status)
    return status


@app.post("/v2/cases/{profile_id}/{dj_id}/logs", response_model=CaseLogSchema)
def append_log_v2(
    profile_id: str,
    dj_id: str,
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(get_current_operator)
):
    log = CaseLogModel(profile_unique_id=profile_id, dj_profile_id=dj_id, event_type=payload.get('event_type','comment'), payload=payload.get('payload'), operator_id=current_operator.id)
    db.add(log)
    db.commit()
    db.refresh(log)
    return log

# v1 endpoints removed

# v1 endpoints removed

# Aspect Feedback endpoints
@app.post("/v2/cases/{profile_id}/{dj_id}/feedback", response_model=AspectFeedbackSchema)
def create_aspect_feedback_v2(
    profile_id: str,
    dj_id: str,
    feedback_data: AspectFeedbackCreate,
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(get_current_operator)
):
    # Check if feedback already exists for this aspect
    existing_feedback = db.query(AspectFeedbackModel).filter(
        AspectFeedbackModel.profile_unique_id == profile_id,
        AspectFeedbackModel.dj_profile_id == dj_id,
        AspectFeedbackModel.aspect_type == feedback_data.aspect_type,
        AspectFeedbackModel.operator_id == current_operator.id
    ).first()
    
    if existing_feedback:
        # Update existing feedback
        for field, value in feedback_data.dict(exclude_unset=True).items():
            setattr(existing_feedback, field, value)
        db.commit()
        db.refresh(existing_feedback)
        return existing_feedback
    else:
        # Create new feedback
        db_feedback = AspectFeedbackModel(
            profile_unique_id=profile_id,
            dj_profile_id=dj_id,
            operator_id=current_operator.id,
            **feedback_data.dict()
        )
        db.add(db_feedback)
        db.commit()
        db.refresh(db_feedback)
        return db_feedback

@app.get("/v2/cases/{profile_id}/{dj_id}/feedback", response_model=List[AspectFeedbackSchema])
def get_aspect_feedback_v2(
    profile_id: str,
    dj_id: str,
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(get_current_operator)
):
    feedback = db.query(AspectFeedbackModel).filter(
        AspectFeedbackModel.profile_unique_id == profile_id,
        AspectFeedbackModel.dj_profile_id == dj_id,
        AspectFeedbackModel.operator_id == current_operator.id
    ).all()
    return feedback

@app.get("/")
def root():
    return {"message": "AML Screening API is running"}


# Batch endpoints --------------------------------------------------------------

@app.post("/v2/cases/status:batch", response_model=BatchCaseStatusResponse)
def batch_get_case_status(
    req: BatchCaseStatusRequest,
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(get_current_operator)
):
    # Build map for quick lookup
    keys = [(p.profile_unique_id, p.dj_profile_id) for p in req.pairs]
    if not keys:
        return {"items": []}

    # Fetch all statuses in one query
    statuses = db.query(CaseStatusModel).filter(
        CaseStatusModel.profile_unique_id.in_([k[0] for k in keys]),
    ).all()

    # Index by tuple
    status_map = {(s.profile_unique_id, s.dj_profile_id): s for s in statuses}

    items: List[BatchCaseStatusResponseItem] = []
    for key in keys:
        existing = status_map.get(key)
        if not existing:
            # initialize default
            existing = CaseStatusModel(
                profile_unique_id=key[0],
                dj_profile_id=key[1],
                case_status="unreviewed",
                aspects_status={},
            )
            db.add(existing)
            db.commit()
            db.refresh(existing)
        # Ensure proper Pydantic v2 serialization from ORM
        serialized_status = CaseStatusSchema.model_validate(existing, from_attributes=True)
        items.append(BatchCaseStatusResponseItem(
            profile_unique_id=key[0],
            dj_profile_id=key[1],
            status=serialized_status,
        ))

    return {"items": items}