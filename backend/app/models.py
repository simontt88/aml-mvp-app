from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, Float
from sqlalchemy.sql import func
from app.database import Base
from enum import Enum


class OperatorRole(str, Enum):
    ANALYST = "analyst"
    SENIOR_ANALYST = "senior_analyst"
    SUPERVISOR = "supervisor"


class Operator(Base):
    __tablename__ = "operators"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, default=OperatorRole.ANALYST)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# v2 schema only --------------------------------------------------------------

class SourceCase(Base):
    __tablename__ = "source_cases"

    id = Column(Integer, primary_key=True, index=True)
    profile_unique_id = Column(String, index=True, nullable=False)
    dj_profile_id = Column(String, index=True, nullable=False)
    reference_id = Column(String, nullable=True)
    profile_info = Column(JSON, nullable=True)
    structured_record = Column(Text, nullable=False)
    hit_record = Column(JSON, nullable=True)
    candidate_name = Column(String, nullable=True)
    final_score = Column(Float, nullable=True)
    aspect_name_json = Column(Text, nullable=True)
    aspect_age_json = Column(Text, nullable=True)
    aspect_nationality_json = Column(Text, nullable=True)
    aspect_risk_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class CaseStatusSnapshot(Base):
    __tablename__ = "case_status"

    id = Column(Integer, primary_key=True, index=True)
    profile_unique_id = Column(String, index=True, nullable=False)
    dj_profile_id = Column(String, index=True, nullable=False)
    case_status = Column(String, nullable=False, default="unreviewed")
    aspects_status = Column(JSON, nullable=True)
    last_updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    last_updated_by = Column(Integer, nullable=True)


class AspectFeedback(Base):
    __tablename__ = "aspect_feedback"

    id = Column(Integer, primary_key=True, index=True)
    profile_unique_id = Column(String, index=True, nullable=False)
    dj_profile_id = Column(String, index=True, nullable=False)
    aspect_type = Column(String, nullable=False)
    llm_output = Column(Text, nullable=True)
    llm_verdict_score = Column(Float, nullable=True)
    operator_feedback = Column(String, nullable=True)
    operator_comment = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    operator_id = Column(Integer, nullable=False)


class CaseLog(Base):
    __tablename__ = "case_logs"

    id = Column(Integer, primary_key=True, index=True)
    profile_unique_id = Column(String, index=True, nullable=False)
    dj_profile_id = Column(String, index=True, nullable=False)
    event_type = Column(String, nullable=False)
    payload = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    operator_id = Column(Integer, nullable=True)