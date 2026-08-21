import uuid
from datetime import datetime

from pydantic import BaseModel


class ModelDashboardRow(BaseModel):
    model_id: uuid.UUID
    model_name: str
    version_id: uuid.UUID
    version_label: str
    runtime_status: str
    risk_classification: str | None
    ai_governance_decision: str | None
    evaluation_summary: dict[str, bool] | None
    applications: list[str]
    last_reviewed_at: datetime | None


class ApplicationDashboardRow(BaseModel):
    application_id: uuid.UUID
    name: str
    owner: str | None
    model_name: str
    model_version_label: str
    risk_classification: str | None
    permitted_data: list[str]
    human_review_required: bool
    lifecycle_state: str
    approvals_complete: int
    approvals_required: int


class EvaluationDashboardRow(BaseModel):
    run_id: uuid.UUID
    model_id: uuid.UUID
    model_name: str
    model_version_label: str
    status: str
    triggered_at: datetime
    completed_at: datetime | None
    category_summary: dict[str, bool]


class SecurityEventsOut(BaseModel):
    policy_violations: list[dict]
    phi_events: list[dict]
    failed_authentication: list[dict]
    suspicious_prompts: list[dict]
    security_findings: list[dict]


class GovernanceSummaryOut(BaseModel):
    applications_by_state: dict[str, int]
    model_versions_by_approval_status: dict[str, int]
    pending_application_approvals: int


class ApprovalQueueItem(BaseModel):
    resource_type: str
    resource_id: uuid.UUID
    resource_name: str
    category: str
