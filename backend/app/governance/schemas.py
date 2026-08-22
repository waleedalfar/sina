import uuid
from datetime import datetime

from pydantic import BaseModel


class ApplicationIn(BaseModel):
    name: str
    purpose: str | None = None
    model_version_id: uuid.UUID
    permitted_data: list[str] = []
    restricted_data: list[str] = []
    human_review_required: bool = True
    autonomous_action_allowed: bool = False
    external_network_allowed: bool = False
    permitted_role_ids: list[uuid.UUID] = []


class ApplicationUpdateIn(BaseModel):
    name: str | None = None
    purpose: str | None = None
    permitted_data: list[str] | None = None
    restricted_data: list[str] | None = None
    human_review_required: bool | None = None
    autonomous_action_allowed: bool | None = None
    external_network_allowed: bool | None = None
    permitted_role_ids: list[uuid.UUID] | None = None


class ApplicationOut(BaseModel):
    id: uuid.UUID
    name: str
    purpose: str | None
    model_version_id: uuid.UUID
    permitted_data: list[str]
    restricted_data: list[str]
    human_review_required: bool
    autonomous_action_allowed: bool
    external_network_allowed: bool
    risk_classification: str | None
    lifecycle_state: str
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RiskQuestionnaireIn(BaseModel):
    processes_phi: bool
    analyzes_medical_images: bool
    analyzes_physiological_signals: bool
    generates_patient_specific_recommendations: bool
    recommends_diagnosis: bool
    recommends_treatment: bool
    influences_medication_decisions: bool
    produces_time_critical_recommendations: bool
    takes_autonomous_clinical_action: bool
    allows_independent_clinician_review: bool
    directly_affects_patient_care: bool


class RiskQuestionnaireOut(RiskQuestionnaireIn):
    application_id: uuid.UUID
    suggested_classification: str
    completed_by: uuid.UUID
    completed_at: datetime

    model_config = {"from_attributes": True}


class RiskClassificationIn(BaseModel):
    risk_classification: str  # low | moderate | high


class TransitionIn(BaseModel):
    to_state: str


class ApprovalIn(BaseModel):
    category: str
    decision: str  # approved | rejected | changes_requested
    comment: str | None = None


class ModelVersionApprovalIn(BaseModel):
    decision: str
    comment: str | None = None
    evidence_evaluation_run_id: uuid.UUID


class GovernanceApprovalOut(BaseModel):
    id: uuid.UUID
    resource_type: str
    resource_id: uuid.UUID
    category: str
    decision: str
    decided_by: uuid.UUID
    decided_at: datetime
    comment: str | None
    evidence_evaluation_run_id: uuid.UUID | None
    superseded_at: datetime | None

    model_config = {"from_attributes": True}


class SuspendIn(BaseModel):
    reason: str


class ApplicationDetailOut(ApplicationOut):
    risk_questionnaire: RiskQuestionnaireOut | None
    approvals: list[GovernanceApprovalOut]
    permitted_role_ids: list[uuid.UUID]
