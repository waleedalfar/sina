"""
Dashboard aggregation and the read-access rules across the API.

dashboard-api.md's central claim is that it invents no new authorization —
every endpoint reuses the rule its underlying data source already
established. That is a claim worth testing directly, because the easiest
way to leak data is a convenience endpoint that forgot to.
"""

import uuid

import pytest

DASHBOARD_ROUTES = [
    "/api/v1/dashboard/models",
    "/api/v1/dashboard/applications",
    "/api/v1/dashboard/evaluations",
    "/api/v1/dashboard/audit-events",
    "/api/v1/dashboard/security-events",
    "/api/v1/dashboard/governance-summary",
    "/api/v1/dashboard/my-approval-queue",
]


@pytest.mark.parametrize("route", DASHBOARD_ROUTES)
async def test_every_dashboard_route_rejects_anonymous_callers(client, route):
    client.anonymous()
    r = await client.get(route)
    assert r.status_code == 401, f"{route} served an unauthenticated caller"


@pytest.mark.parametrize("route", DASHBOARD_ROUTES)
async def test_every_dashboard_route_serves_an_administrator(client, as_role, route):
    await as_role("Platform Administrator")
    r = await client.get(route)
    assert r.status_code == 200, f"{route}: {r.text}"


@pytest.mark.parametrize(
    "route",
    ["/api/v1/dashboard/audit-events", "/api/v1/dashboard/security-events"],
)
async def test_audit_shaped_dashboard_routes_reuse_the_audit_read_rule(
    client, as_role, route
):
    """A Clinician can use an approved application but has no business
    reading the security event stream."""
    await as_role("Clinician")
    r = await client.get(route)
    assert r.status_code == 403, f"{route} served a permitted-user role"

    await as_role("Auditor")
    r = await client.get(route)
    assert r.status_code == 200, f"{route} refused an Auditor: {r.text}"


async def test_the_approval_queue_is_scoped_to_the_caller(
    client, as_role, make_identity, roles, model_version, completed_evaluation
):
    """It answers "what is waiting on *me*", so it must not become a
    convenient way to read every pending decision on the platform."""
    creator = await as_role("Application Developer")
    r = await client.post(
        "/api/v1/applications",
        json={"name": f"Queued-{uuid.uuid4().hex[:6]}", "model_version_id": str(model_version.id)},
    )
    app_id = r.json()["id"]
    for state in ("development", "evaluation", "governance_review"):
        await client.post(f"/api/v1/applications/{app_id}/transition", json={"to_state": state})

    officer = await make_identity("Privacy Officer")
    client.act_as(officer, [roles["Privacy Officer"]])
    r = await client.get("/api/v1/dashboard/my-approval-queue")
    assert r.status_code == 200, r.text
    assert any(item["resource_id"] == app_id for item in r.json()), "a pending decision was missing"

    # The creator holds no sign-off role, so nothing is waiting on them.
    client.act_as(creator, [roles["Application Developer"]])
    r = await client.get("/api/v1/dashboard/my-approval-queue")
    assert r.status_code == 200, r.text
    assert not any(item["resource_id"] == app_id for item in r.json())


async def test_governance_summary_counts_reflect_reality(
    client, as_role, model_version
):
    await as_role("Application Developer")
    before = None
    admin_view = None

    r = await client.post(
        "/api/v1/applications",
        json={"name": f"Counted-{uuid.uuid4().hex[:6]}", "model_version_id": str(model_version.id)},
    )
    assert r.status_code == 201, r.text

    await as_role("Platform Administrator")
    r = await client.get("/api/v1/dashboard/governance-summary")
    assert r.status_code == 200, r.text
    admin_view = r.json()
    assert isinstance(admin_view, dict) and admin_view, "summary was empty"


# --- Audit read access and filtering ---------------------------------


async def test_audit_log_is_closed_to_builder_and_permitted_user_roles(client, as_role):
    for role in ("ML Engineer", "Application Developer", "Clinician"):
        await as_role(role)
        r = await client.get("/api/v1/audit-events")
        assert r.status_code == 403, f"{role} could read the audit log"


@pytest.mark.parametrize("role", ["Auditor", "Platform Administrator", "Privacy Officer"])
async def test_audit_log_is_open_to_oversight_roles(client, as_role, role):
    await as_role(role)
    r = await client.get("/api/v1/audit-events")
    assert r.status_code == 200, f"{role}: {r.text}"


async def test_audit_filters_narrow_the_result_set(client, as_role, make_identity, roles):
    admin = await as_role("Platform Administrator")
    target = await make_identity("ML Engineer")
    await client.post(
        f"/api/v1/identities/{target.id}/roles", json={"role_id": str(roles["Clinician"].id)}
    )

    r = await client.get("/api/v1/audit-events?event_type=identity.role_granted")
    assert r.status_code == 200, r.text
    assert r.json(), "the filter excluded the event that was just written"
    assert all(e["event_type"] == "identity.role_granted" for e in r.json())

    r = await client.get("/api/v1/audit-events?event_type=nothing.matches.this")
    assert r.status_code == 200, r.text
    assert r.json() == []


async def test_audit_pagination_is_bounded(client, as_role):
    """An unbounded limit is a denial-of-service and a bulk-export path."""
    await as_role("Auditor")
    r = await client.get("/api/v1/audit-events?limit=100000")
    assert r.status_code == 422, "an arbitrarily large page size was accepted"


async def test_a_single_audit_event_is_readable_and_unknown_ids_404(
    client, as_role, make_identity, roles
):
    await as_role("Platform Administrator")
    target = await make_identity("ML Engineer")
    await client.post(
        f"/api/v1/identities/{target.id}/roles", json={"role_id": str(roles["Clinician"].id)}
    )

    events = (await client.get("/api/v1/audit-events?event_type=identity.role_granted")).json()
    r = await client.get(f"/api/v1/audit-events/{events[0]['id']}")
    assert r.status_code == 200, r.text

    r = await client.get(f"/api/v1/audit-events/{uuid.uuid4()}")
    assert r.status_code == 404, r.text


# --- Identity surface edges ------------------------------------------


async def test_me_is_open_to_any_authenticated_identity(client, as_role):
    for role in ("Clinician", "ML Engineer", "Auditor"):
        await as_role(role)
        r = await client.get("/api/v1/me")
        assert r.status_code == 200, f"{role}: {r.text}"


async def test_roles_are_listable_by_any_authenticated_identity(client, as_role):
    await as_role("Clinician")
    r = await client.get("/api/v1/roles")
    assert r.status_code == 200, r.text
    assert len(r.json()) == 10, "the MVP role set changed without this test noticing"

    client.anonymous()
    r = await client.get("/api/v1/roles")
    assert r.status_code == 401


async def test_identity_administration_is_closed_to_everyone_else(client, as_role, make_identity):
    target = await make_identity("ML Engineer")
    for role in ("Auditor", "Privacy Officer", "ML Engineer", "Clinician"):
        await as_role(role)
        r = await client.get("/api/v1/identities")
        assert r.status_code == 403, f"{role} could enumerate identities"
        r = await client.patch(f"/api/v1/identities/{target.id}/active", json={"active": False})
        assert r.status_code == 403, f"{role} could deactivate an identity"


async def test_deactivation_and_reactivation_are_audited(
    client, as_role, make_identity
):
    await as_role("Platform Administrator")
    target = await make_identity("ML Engineer")

    r = await client.patch(f"/api/v1/identities/{target.id}/active", json={"active": False})
    assert r.status_code == 200, r.text
    assert r.json()["active"] is False

    r = await client.patch(f"/api/v1/identities/{target.id}/active", json={"active": True})
    assert r.status_code == 200, r.text

    r = await client.get("/api/v1/audit-events?resource_type=identity")
    types = {e["event_type"] for e in r.json()}
    assert "identity.deactivated" in types
    assert "identity.reactivated" in types


async def test_granting_an_unknown_role_is_404(client, as_role, make_identity):
    await as_role("Platform Administrator")
    target = await make_identity("ML Engineer")
    r = await client.post(
        f"/api/v1/identities/{target.id}/roles", json={"role_id": str(uuid.uuid4())}
    )
    assert r.status_code == 404, r.text


async def test_revoking_a_role_that_is_not_held_is_404(client, as_role, make_identity, roles):
    await as_role("Platform Administrator")
    target = await make_identity("ML Engineer")
    r = await client.delete(f"/api/v1/identities/{target.id}/roles/{roles['Auditor'].id}")
    assert r.status_code == 404, r.text
