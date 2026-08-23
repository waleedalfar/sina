"""
Regression cover for role grant/revoke and the history endpoint.

The history endpoint was specified in identity.md and went unbuilt for
weeks; nothing failed, because nothing tested it. These assertions exist so
that particular silence can't happen twice.
"""

import uuid

import pytest


@pytest.fixture
def admin_role(roles):
    return roles["Platform Administrator"]


async def test_grant_revoke_regrant_produces_distinct_assignment_rows(
    client, as_role, make_identity, roles
):
    await as_role("Platform Administrator")
    target = await make_identity("ML Engineer")
    clinician = roles["Clinician"]

    for _ in range(2):
        r = await client.post(
            f"/api/v1/identities/{target.id}/roles", json={"role_id": str(clinician.id)}
        )
        assert r.status_code == 201, r.text
        r = await client.delete(f"/api/v1/identities/{target.id}/roles/{clinician.id}")
        assert r.status_code == 204, r.text

    r = await client.get(f"/api/v1/identities/{target.id}/roles?include_revoked=true")
    assert r.status_code == 200, r.text
    rows = r.json()

    clinician_rows = [row for row in rows if row["name"] == "Clinician"]
    assert len(clinician_rows) == 2, "revoke then re-grant must create a second row"
    assert len({row["assignment_id"] for row in clinician_rows}) == 2, "assignment_ids collide"
    assert all(row["revoked_at"] and row["revoked_by"] for row in clinician_rows)

    # Newest first.
    granted = [row["granted_at"] for row in rows]
    assert granted == sorted(granted, reverse=True)


async def test_default_listing_excludes_revoked_assignments(client, as_role, make_identity, roles):
    await as_role("Platform Administrator")
    target = await make_identity("ML Engineer")
    clinician = roles["Clinician"]

    await client.post(f"/api/v1/identities/{target.id}/roles", json={"role_id": str(clinician.id)})
    await client.delete(f"/api/v1/identities/{target.id}/roles/{clinician.id}")

    r = await client.get(f"/api/v1/identities/{target.id}/roles")
    assert [row["name"] for row in r.json()] == ["ML Engineer"]


async def test_unknown_identity_is_404_not_empty_list(client, as_role):
    """`[]` would read as "this identity never held a role", which is a
    different fact from "no such identity" — and this endpoint is read for
    audit purposes."""
    await as_role("Platform Administrator")
    r = await client.get(f"/api/v1/identities/{uuid.uuid4()}/roles?include_revoked=true")
    assert r.status_code == 404, r.text


async def test_history_is_platform_administrator_only(client, as_role, make_identity):
    target = await make_identity("ML Engineer")

    for role in ("ML Engineer", "Auditor"):
        await as_role(role)
        r = await client.get(f"/api/v1/identities/{target.id}/roles?include_revoked=true")
        assert r.status_code == 403, f"{role} could read role history"

    client.anonymous()
    r = await client.get(f"/api/v1/identities/{target.id}/roles?include_revoked=true")
    assert r.status_code == 401


async def test_separation_of_duties_blocks_a_conflicting_grant(
    client, as_role, make_identity, roles
):
    """A builder role and a sign-off role cannot be held at once — the
    self-review rule from identity.md, enforced in code rather than policy.
    """
    await as_role("Platform Administrator")
    target = await make_identity("ML Engineer")

    r = await client.post(
        f"/api/v1/identities/{target.id}/roles",
        json={"role_id": str(roles["Privacy Officer"].id)},
    )
    assert r.status_code == 409, r.text
    assert "conflict" in r.text.lower()


async def test_granting_a_role_twice_conflicts(client, as_role, make_identity, roles):
    await as_role("Platform Administrator")
    target = await make_identity("ML Engineer")
    r = await client.post(
        f"/api/v1/identities/{target.id}/roles",
        json={"role_id": str(roles["ML Engineer"].id)},
    )
    assert r.status_code == 409, r.text
