from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime
from app.models import OperatorRole


class SourceCase(BaseModel):
  id: int
  profile_unique_id: str
  dj_profile_id: str
  reference_id: Optional[str] = None
  profile_info: Optional[Dict[str, Any]] = None
  structured_record: str
  hit_record: Optional[Dict[str, Any]] = None
  candidate_name: Optional[str] = None
  final_score: Optional[float] = None
  aspect_name_json: Optional[str] = None
  aspect_age_json: Optional[str] = None
  aspect_nationality_json: Optional[str] = None
  aspect_risk_json: Optional[str] = None
  created_at: datetime

  class Config:
    orm_mode = True


class CaseStatusSchema(BaseModel):
  id: int
  profile_unique_id: str
  dj_profile_id: str
  case_status: str
  aspects_status: Optional[Dict[str, Any]] = None
  last_updated_at: datetime
  last_updated_by: Optional[int] = None

  class Config:
    orm_mode = True


class AspectFeedbackSchema(BaseModel):
  id: int
  profile_unique_id: str
  dj_profile_id: str
  aspect_type: str
  llm_output: Optional[str] = None
  llm_verdict_score: Optional[float] = None
  operator_feedback: Optional[str] = None
  operator_comment: Optional[str] = None
  created_at: datetime
  updated_at: datetime
  operator_id: int

  class Config:
    orm_mode = True


class AspectFeedbackCreate(BaseModel):
  aspect_type: str
  llm_output: Optional[str] = None
  llm_verdict_score: Optional[float] = None
  operator_feedback: Optional[str] = None
  operator_comment: Optional[str] = None


class CaseLogSchema(BaseModel):
  id: int
  profile_unique_id: str
  dj_profile_id: str
  event_type: str
  payload: Optional[Dict[str, Any]]
  created_at: datetime
  operator_id: Optional[int]

  class Config:
    orm_mode = True


class OperatorBase(BaseModel):
    name: str
    email: EmailStr
    role: OperatorRole = OperatorRole.ANALYST


class OperatorCreate(OperatorBase):
    password: str


class Operator(OperatorBase):
    id: int
    created_at: datetime
    
    class Config:
        orm_mode = True


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str


# Batch status schemas ---------------------------------------------------------

class CaseStatusKey(BaseModel):
  profile_unique_id: str
  dj_profile_id: str


class BatchCaseStatusRequest(BaseModel):
  pairs: List[CaseStatusKey]


class BatchCaseStatusResponseItem(BaseModel):
  profile_unique_id: str
  dj_profile_id: str
  status: CaseStatusSchema


class BatchCaseStatusResponse(BaseModel):
  items: List[BatchCaseStatusResponseItem]