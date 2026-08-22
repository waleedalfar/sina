import uuid
from datetime import UTC, datetime
from enum import Enum

from sqlalchemy import Boolean, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TenantScopedMixin


def _utcnow() -> datetime:
    return datetime.now(UTC)


class LifecycleState(str, Enum):
    draft = "draft"
    development = "development"
    evaluation = "evaluation"
    governance_review = "governance_review"
    approved = "approved"
    staging = "staging"
    production = "production"
    suspended = "suspended"
    retired = "retired"


class RiskClassification(str, Enum):
    low = "low"
    moderate = "moderate"
    high = "high"


class Application(Base, TenantScopedMixin):
    __tablename__ = "application"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    purpose: Mapped[str | None] = mapped_column(Text, nullable=True)
    model_version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("model_version.id"), nullable=False
    )
    permitted_data: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, default=list)
    restricted_data: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, default=list)
    human_review_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    autonomous_action_allowed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    external_network_allowed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    risk_classification: Mapped[str | None] = mapped_column(Text, nullable=True)
    lifecycle_state: Mapped[str] = mapped_column(Text, nullable=False, default=LifecycleState.draft.value)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )


class RiskQuestionnaireResponse(Base):
    """One row per Application — the §15 checklist. `suggested_classification`
    is computed and advisory only; see governance/risk.py. Never authoritative
    — `Application.risk_classification` is a separate, human-set field."""

    __tablename__ = "risk_questionnaire_response"

    application_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("application.id"), primary_key=True
    )
    processes_phi: Mapped[bool] = mapped_column(Boolean, nullable=False)
    analyzes_medical_images: Mapped[bool] = mapped_column(Boolean, nullable=False)
    analyzes_physiological_signals: Mapped[bool] = mapped_column(Boolean, nullable=False)
    generates_patient_specific_recommendations: Mapped[bool] = mapped_column(Boolean, nullable=False)
    recommends_diagnosis: Mapped[bool] = mapped_column(Boolean, nullable=False)
    recommends_treatment: Mapped[bool] = mapped_column(Boolean, nullable=False)
    influences_medication_decisions: Mapped[bool] = mapped_column(Boolean, nullable=False)
    produces_time_critical_recommendations: Mapped[bool] = mapped_column(Boolean, nullable=False)
    takes_autonomous_clinical_action: Mapped[bool] = mapped_column(Boolean, nullable=False)
    allows_independent_clinician_review: Mapped[bool] = mapped_column(Boolean, nullable=False)
    directly_affects_patient_care: Mapped[bool] = mapped_column(Boolean, nullable=False)
    suggested_classification: Mapped[str] = mapped_column(Text, nullable=False)
    completed_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.id"), nullable=False)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)


class ApplicationPermittedRole(Base):
    """Typed FK, not free text — §6's `Permitted Users`, expressed as which
    `identity.Role`s may use this application once approved."""

    __tablename__ = "application_permitted_role"

    application_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("application.id"), primary_key=True
    )
    role_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("role.id"), primary_key=True)


class ApprovalCategory(str, Enum):
    clinical_safety = "clinical_safety"
    privacy = "privacy"
    security = "security"
    ai_governance = "ai_governance"
    compliance = "compliance"


class ApprovalDecision(str, Enum):
    approved = "approved"
    rejected = "rejected"
    changes_requested = "changes_requested"


class ResourceType(str, Enum):
    application = "application"
    model_version = "model_version"


class GovernanceApproval(Base, TenantScopedMixin):
    """
    Generic, resource-scoped — shared by Application (5 categories
    required) and ModelVersion (1 category: ai_governance). Distinct-signer
    and no-self-approval are enforced in the router at write time, not here
    — see governance.md's Design decision. `evidence_evaluation_run_id` is a
    real FK now that `evaluation.EvaluationRun` exists (see that module's
    forward-declaration note) — required at the application layer for
    ai_governance/model_version decisions, optional otherwise.
    """

    __tablename__ = "governance_approval"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    resource_type: Mapped[str] = mapped_column(Text, nullable=False)
    resource_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    category: Mapped[str] = mapped_column(Text, nullable=False)
    decision: Mapped[str] = mapped_column(Text, nullable=False)
    decided_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.id"), nullable=False)
    decided_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    evidence_evaluation_run_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("evaluation_run.id"), nullable=True
    )
    # Set when the application re-enters governance_review after a rejection
    # or suspension, so the prior cycle's rows stop counting toward the
    # distinct-signer/duplicate-category checks. NULL = still active.
    superseded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
