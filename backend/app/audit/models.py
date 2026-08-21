import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import BigInteger, DateTime, Identity, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TenantScopedMixin


class Severity(str, Enum):
    info = "info"
    security_critical = "security_critical"


class AuditEvent(Base, TenantScopedMixin):
    """
    Append-only. See audit.md's two tamper-evidence layers, both enforced
    outside the ORM: (1) the app's runtime DB role has no UPDATE/DELETE
    grant on this table (migration-level), (2) a BEFORE INSERT trigger
    computes event_hash from prev_event_hash + this row's immutable fields,
    and BEFORE UPDATE/DELETE triggers reject mutation outright even for a
    role that somehow retains the privilege. Nothing here should ever be
    updated from application code — there is intentionally no update path
    anywhere in this module.
    """

    __tablename__ = "audit_event"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sequence_number: Mapped[int] = mapped_column(
        BigInteger, Identity(always=True), unique=True, nullable=False
    )
    event_type: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[str] = mapped_column(Text, nullable=False, default=Severity.info.value)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    actor_identity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    resource_type: Mapped[str | None] = mapped_column(Text, nullable=True)
    resource_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    prev_event_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    event_hash: Mapped[str] = mapped_column(Text, nullable=False)
