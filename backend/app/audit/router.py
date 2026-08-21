import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.models import AuditEvent
from app.core.db import get_db
from app.core.exceptions import NotFound
from app.identity.models import RoleKind
from app.identity.security import require_role, require_role_kind

# Basic filtered listing is in-scope per audit.md's scope correction to
# ADR-0003 — dashboard-api needs it. Advanced search/export/SIEM stays
# deferred.
router = APIRouter(prefix="/api/v1/audit-events", tags=["audit"])

# Read access follows identity.md's Role.kind taxonomy, not a bespoke list —
# admin, signoff, and readonly kinds; builder/permitted_user cannot read.
_READ_KINDS = (RoleKind.admin.value, RoleKind.signoff.value, RoleKind.readonly.value)


class AuditEventOut(BaseModel):
    id: uuid.UUID
    sequence_number: int
    event_type: str
    severity: str
    occurred_at: datetime
    actor_identity_id: uuid.UUID | None
    resource_type: str | None
    resource_id: uuid.UUID | None
    payload: dict
    prev_event_hash: str | None
    event_hash: str

    model_config = {"from_attributes": True}


class IntegrityReport(BaseModel):
    checked: int
    ok: bool
    first_break_sequence_number: int | None = None


@router.get("", response_model=list[AuditEventOut])
async def list_audit_events(
    db: AsyncSession = Depends(get_db),
    _: object = Depends(require_role_kind(*_READ_KINDS)),
    actor_identity_id: uuid.UUID | None = None,
    resource_type: str | None = None,
    resource_id: uuid.UUID | None = None,
    event_type: str | None = None,
    severity: str | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    limit: int = Query(default=50, le=500),
    offset: int = Query(default=0, ge=0),
):
    stmt = select(AuditEvent).order_by(AuditEvent.sequence_number.desc())
    if actor_identity_id is not None:
        stmt = stmt.where(AuditEvent.actor_identity_id == actor_identity_id)
    if resource_type is not None:
        stmt = stmt.where(AuditEvent.resource_type == resource_type)
    if resource_id is not None:
        stmt = stmt.where(AuditEvent.resource_id == resource_id)
    if event_type is not None:
        stmt = stmt.where(AuditEvent.event_type == event_type)
    if severity is not None:
        stmt = stmt.where(AuditEvent.severity == severity)
    if since is not None:
        stmt = stmt.where(AuditEvent.occurred_at >= since)
    if until is not None:
        stmt = stmt.where(AuditEvent.occurred_at <= until)
    stmt = stmt.limit(limit).offset(offset)

    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.get("/verify-integrity", response_model=IntegrityReport)
async def verify_integrity(
    db: AsyncSession = Depends(get_db),
    _: object = Depends(require_role("Auditor", "Platform Administrator")),
    from_sequence: int = Query(default=0, ge=0),
):
    """
    Walks the hash chain and reports the first break, if any — makes the
    tamper-evident property actually checkable. See audit.md's honest
    caveat: this detects tampering, it doesn't prevent a fully privileged
    DB administrator from having done it in the first place.

    Recomputation calls the SAME `audit_event_compute_hash` SQL function
    the insert trigger uses (defined in the migration), rather than
    reimplementing the canonicalization in Python — two independent
    implementations of the same hash would risk drifting out of sync
    (timestamp formatting, JSON key ordering, etc.) and reporting false
    breaks. There is exactly one implementation, called from two places.
    """
    result = await db.execute(
        sa_text(
            """
            SELECT sequence_number, event_hash,
                   audit_event_compute_hash(
                       prev_event_hash, id, event_type, occurred_at,
                       actor_identity_id, resource_type, resource_id, payload
                   ) AS recomputed
            FROM audit_event
            WHERE sequence_number >= :from_sequence
            ORDER BY sequence_number ASC
            """
        ),
        {"from_sequence": from_sequence},
    )
    rows = result.fetchall()

    checked = 0
    for row in rows:
        checked += 1
        if row.event_hash != row.recomputed:
            return IntegrityReport(
                checked=checked, ok=False, first_break_sequence_number=row.sequence_number
            )

    return IntegrityReport(checked=checked, ok=True)


@router.get("/{event_id}", response_model=AuditEventOut)
async def get_audit_event(
    event_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: object = Depends(require_role_kind(*_READ_KINDS)),
):
    event = await db.get(AuditEvent, event_id)
    if event is None:
        raise NotFound(f"audit event {event_id} not found")
    return event
