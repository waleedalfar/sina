import json
import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.models import AuditEvent, Severity

MAX_PAYLOAD_BYTES = 8192  # blunt safeguard against accidentally logging raw
# content (e.g. a whole document or model output) — see audit.md's note that
# this is not content-aware PHI detection, just a sanity cap.


async def emit(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    event_type: str,
    actor_identity_id: uuid.UUID | None,
    payload: dict | None = None,
    resource_type: str | None = None,
    resource_id: uuid.UUID | None = None,
    severity: Severity = Severity.info,
    occurred_at: datetime | None = None,
) -> AuditEvent:
    """
    Emits an audit event into the CALLER's existing transaction — never
    commits itself. Per audit.md's design decision, callers must emit
    within the same transaction as the action being audited, so an audit
    write failure rolls back the action too. `sequence_number`,
    `prev_event_hash`, and `event_hash` are populated by a database trigger
    on insert, not here — so even a write that bypasses this function
    entirely still gets chained correctly.
    """
    payload = payload or {}
    payload_json = json.dumps(payload, default=str)
    if len(payload_json.encode("utf-8")) > MAX_PAYLOAD_BYTES:
        raise ValueError(
            f"audit payload exceeds {MAX_PAYLOAD_BYTES}-byte cap for event_type={event_type!r} "
            "— see audit.md's Security section"
        )

    event = AuditEvent(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        event_type=event_type,
        severity=severity.value,
        occurred_at=occurred_at or datetime.now(UTC),
        actor_identity_id=actor_identity_id,
        resource_type=resource_type,
        resource_id=resource_id,
        payload=payload,
    )
    db.add(event)
    await db.flush()  # populates id/sequence_number/hash fields within this txn, no commit
    return event
