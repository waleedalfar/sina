import uuid
from datetime import UTC, datetime
from enum import Enum

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TenantScopedMixin


def _utcnow() -> datetime:
    return datetime.now(UTC)


class Model(Base, TenantScopedMixin):
    __tablename__ = "model"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)


class MalwareScanResult(str, Enum):
    pending = "pending"
    clean = "clean"
    positive = "positive"


class ModelVersion(Base, TenantScopedMixin):
    """
    Immutable once created — see models.md. MVP 0.1 supports exactly one
    artifact format (gguf, matching ADR-0001's llama.cpp/Ollama runtime
    choice), so `format` isn't a caller-supplied field, it's fixed.

    `malware_scan_result` and `file_hash` are always populated before this
    row is ever committed — MVP 0.1 scans synchronously within the import
    request (no background job queue), so `pending` is a schema-level
    placeholder for a possible future async scanning implementation, never
    an observed persisted state today. A positive scan result is still
    persisted (not silently discarded) so there's a durable record of a
    blocked import attempt for review — consistent with this project's
    "if it's not logged, it didn't happen" standard.
    """

    __tablename__ = "model_version"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    model_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("model.id"), nullable=False)
    version_label: Mapped[str] = mapped_column(Text, nullable=False)
    format: Mapped[str] = mapped_column(Text, nullable=False, default="gguf")
    file_hash: Mapped[str] = mapped_column(Text, nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    declared_source: Mapped[str | None] = mapped_column(Text, nullable=True)
    declared_license: Mapped[str | None] = mapped_column(Text, nullable=True)
    base_model_version_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("model_version.id"), nullable=True
    )
    known_limitations: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Column owned here; WRITE PATH is governance's job (not yet built) —
    # see models.md/governance.md's cross-doc split, same pattern as
    # identity owning Role while governance owns who grants them.
    risk_classification: Mapped[str | None] = mapped_column(Text, nullable=True)
    malware_scan_result: Mapped[str] = mapped_column(
        Text, nullable=False, default=MalwareScanResult.pending.value
    )
    malware_scanned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    hash_verified_at_import: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    imported_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.id"), nullable=False)
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)


def ollama_model_name(model_version_id: uuid.UUID) -> str:
    """Shared by `models` (start/stop) and `gateway` (inference routing) —
    kept in one place so the naming convention can't drift between them."""
    return f"hp{model_version_id.hex}"


class RuntimeStatus(str, Enum):
    stopped = "stopped"
    starting = "starting"
    running = "running"
    error = "error"


class HashReverifyResult(str, Enum):
    pass_ = "pass"
    fail = "fail"


class ModelRuntimeState(Base):
    """Mutable operational state, kept separate from the immutable
    ModelVersion record — see models.md."""

    __tablename__ = "model_runtime_state"

    model_version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("model_version.id"), primary_key=True
    )
    runtime_status: Mapped[str] = mapped_column(Text, nullable=False, default=RuntimeStatus.stopped.value)
    last_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_stopped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_health_check_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_hash_reverify_result: Mapped[str | None] = mapped_column(Text, nullable=True)
    memory_used_mb: Mapped[int | None] = mapped_column(Integer, nullable=True)
    process_error: Mapped[str | None] = mapped_column(Text, nullable=True)
