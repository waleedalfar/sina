"""
Minimal forward-declaration of `EvaluationRun`, ahead of the `evaluation`
module's own turn in ADR-0003's build order.

`governance` structurally depends on this table for two things specified in
governance.md: the `Evaluation -> Governance Review` lifecycle gate
(existence + completion of a run), and `GovernanceApproval.
evidence_evaluation_run_id` (a real FK, not a bare UUID with no referential
integrity — the whole point of that field per evaluation.md's amendment was
to make evidence a structural link, not a suggestion). Rather than fake or
skip those checks until `evaluation` is built, this implements exactly the
`EvaluationRun` shape evaluation.md already specifies — not new design, a
subset of an already-approved one, built early because governance needs it.
`evaluation.md`'s own module will add EvaluationSuite/EvaluationCase/
EvaluationCategoryResult/EvaluationCaseResult and the actual run-execution
logic around this table when it's built; this table itself needs no rework.
"""

import uuid
from datetime import UTC, datetime
from enum import Enum

from sqlalchemy import DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TenantScopedMixin


def _utcnow() -> datetime:
    return datetime.now(UTC)


class EvaluationRunStatus(str, Enum):
    pending = "pending"
    running = "running"
    complete = "complete"
    failed = "failed"


class EvaluationRun(Base, TenantScopedMixin):
    __tablename__ = "evaluation_run"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    model_version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("model_version.id"), nullable=False
    )
    triggered_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.id"), nullable=False)
    triggered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(Text, nullable=False, default=EvaluationRunStatus.pending.value)
