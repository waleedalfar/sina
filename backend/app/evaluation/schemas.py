import uuid
from datetime import datetime

from pydantic import BaseModel


class EvaluationRunOut(BaseModel):
    id: uuid.UUID
    model_version_id: uuid.UUID
    triggered_by: uuid.UUID
    triggered_at: datetime
    completed_at: datetime | None
    status: str

    model_config = {"from_attributes": True}


class EvaluationCategoryResultOut(BaseModel):
    id: uuid.UUID
    category: str
    suite_id: uuid.UUID
    cases_total: int
    cases_passed: int
    passed: bool

    model_config = {"from_attributes": True}


class EvaluationCaseResultOut(BaseModel):
    id: uuid.UUID
    case_id: uuid.UUID
    actual_output: str
    passed: bool
    scored_by: str
    reviewed_by: uuid.UUID | None

    model_config = {"from_attributes": True}


class EvaluationRunDetailOut(EvaluationRunOut):
    category_results: list[EvaluationCategoryResultOut]
    case_results: list[EvaluationCaseResultOut]


class HumanReviewIn(BaseModel):
    passed: bool
