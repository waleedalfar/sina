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
    # Joined in from EvaluationCase by the router (not columns on
    # EvaluationCaseResult itself) — without these, a human reviewer sees
    # only actual_output with no idea what was asked or what to check for,
    # making the human-review queue unusable. Not in evaluation.md's
    # original per-case schema; closed here the same way the doc's own
    # Revision Log closes the sibling human-review-endpoint gap.
    suite_id: uuid.UUID
    input_prompt: str
    scoring_method: str
    scoring_criteria: str
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
