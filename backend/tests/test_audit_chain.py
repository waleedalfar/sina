"""
Regression cover for audit tamper-evidence.

`audit.md` claims two independent layers: the app's DB role holds no
UPDATE/DELETE grant on `audit_event`, and a trigger-computed hash chain
makes any change detectable. Both are the kind of property that can be
silently lost by a later migration, so both are asserted here rather than
trusted.
"""

import uuid

import pytest
from sqlalchemy import text


async def test_actions_emit_audit_events_and_the_chain_verifies(
    client, as_role, make_identity, roles
):
    await as_role("Platform Administrator")
    target = await make_identity("ML Engineer")

    r = await client.post(
        f"/api/v1/identities/{target.id}/roles", json={"role_id": str(roles["Clinician"].id)}
    )
    assert r.status_code == 201, r.text

    r = await client.get("/api/v1/audit-events?event_type=identity.role_granted")
    assert r.status_code == 200, r.text
    assert len(r.json()) >= 1, "granting a role emitted no audit event"

    r = await client.get("/api/v1/audit-events/verify-integrity")
    assert r.status_code == 200, r.text
    report = r.json()
    assert report["ok"] is True
    assert report["first_break_sequence_number"] is None
    assert report["checked"] > 0


async def test_the_runtime_role_cannot_update_or_delete_audit_events(db, client, as_role, roles, make_identity):
    """Layer one: privilege revocation at the migration level.

    This is the layer that stops tampering rather than merely revealing it,
    so a migration that quietly re-granted these would be a serious
    regression with no other visible symptom.
    """
    await as_role("Platform Administrator")
    target = await make_identity("ML Engineer")
    await client.post(
        f"/api/v1/identities/{target.id}/roles", json={"role_id": str(roles["Clinician"].id)}
    )

    row = (await db.execute(text("SELECT id FROM audit_event LIMIT 1"))).first()
    assert row is not None, "no audit events to attempt tampering on"

    for statement in (
        "UPDATE audit_event SET event_type = 'tampered' WHERE id = :id",
        "DELETE FROM audit_event WHERE id = :id",
    ):
        with pytest.raises(Exception) as exc:
            await db.execute(text(statement), {"id": row[0]})
            await db.commit()
        assert "permission denied" in str(exc.value).lower(), statement
        await db.rollback()


async def test_verify_integrity_is_not_open_to_everyone(client, as_role):
    await as_role("ML Engineer")
    r = await client.get("/api/v1/audit-events/verify-integrity")
    assert r.status_code == 403, r.text

    client.anonymous()
    r = await client.get("/api/v1/audit-events/verify-integrity")
    assert r.status_code == 401, r.text
