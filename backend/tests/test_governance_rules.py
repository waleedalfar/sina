"""
Governance rules beyond the happy-path approval cycle: the lifecycle state
machine's refusals, edit guards, emergency suspension, retirement, and the
advisory risk questionnaire.

These are the rules that make the lifecycle mean something. A state machine
that can be talked around is decoration, so most of what follows asserts
that something is *refused*.
"""

import uuid

import pytest

from app.governance.policy import MANUAL_TRANSITIONS
from app.governance.risk import compute_suggested_classification


async def _draft(client, model_version, **kw):
    r = await client.post(
        "/api/v1/applications",
        json={
            "name": f"App-{uuid.uuid4().hex[:6]}",
            "model_version_id": str(model_version.id),
            **kw,
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


# --- The state machine refuses what it should ------------------------


async def test_a_skipped_transition_is_refused(client, as_role, model_version):
    """draft -> evaluation skips development. The graph is the rule."""
    await as_role("Application Developer")
    app = await _draft(client, model_version)
    r = await client.post(f"/api/v1/applications/{app['id']}/transition", json={"to_state": "evaluation"})
    assert r.status_code == 409, r.text
    assert "no manual transition" in r.text


async def test_approved_is_never_reachable_by_a_manual_transition(client, as_role, model_version):
    """Governance Review -> Approved is system-triggered only, as a side
    effect of the final approval. If it were manually reachable the whole
    sign-off mechanism could be bypassed with one request."""
    await as_role("Application Developer")
    app = await _draft(client, model_version)
    for state in ("development", "evaluation"):
        await client.post(f"/api/v1/applications/{app['id']}/transition", json={"to_state": state})

    r = await client.post(f"/api/v1/applications/{app['id']}/transition", json={"to_state": "approved"})
    assert r.status_code == 409, r.text


def test_no_manual_edge_in_the_graph_leads_to_approved():
    """Asserted against the table itself, so adding such an edge fails here
    rather than silently becoming policy."""
    for from_state, edges in MANUAL_TRANSITIONS.items():
        assert "approved" not in edges, f"{from_state} has a manual edge to approved"


async def test_governance_review_requires_a_completed_evaluation_run(
    client, as_role, model_version
):
    """The evaluation gate: no Application enters review on a model version
    nobody has evaluated. Note this fixture has no evaluation run."""
    await as_role("Application Developer")
    app = await _draft(client, model_version)
    for state in ("development", "evaluation"):
        r = await client.post(f"/api/v1/applications/{app['id']}/transition", json={"to_state": state})
        assert r.status_code == 200, r.text

    r = await client.post(
        f"/api/v1/applications/{app['id']}/transition", json={"to_state": "governance_review"}
    )
    assert r.status_code == 409, r.text
    assert "evaluation run" in r.text


async def test_only_the_creator_may_drive_the_early_transitions(
    client, as_role, make_identity, roles, model_version
):
    await as_role("Application Developer")
    app = await _draft(client, model_version)

    other = await make_identity("Application Developer")
    client.act_as(other, [roles["Application Developer"]])
    r = await client.post(f"/api/v1/applications/{app['id']}/transition", json={"to_state": "development"})
    assert r.status_code == 403, r.text


async def test_promotion_to_production_requires_platform_administrator(
    client, as_role, make_identity, roles, model_version, completed_evaluation, db
):
    from app.governance.models import Application, LifecycleState

    creator = await as_role("Application Developer")
    app = await _draft(client, model_version)
    row = await db.get(Application, uuid.UUID(app["id"]))
    row.lifecycle_state = LifecycleState.staging.value
    await db.commit()

    # The creator alone cannot push it into production.
    client.act_as(creator, [roles["Application Developer"]])
    r = await client.post(f"/api/v1/applications/{app['id']}/transition", json={"to_state": "production"})
    assert r.status_code == 403, r.text

    admin = await make_identity("Platform Administrator")
    client.act_as(admin, [roles["Platform Administrator"]])
    r = await client.post(f"/api/v1/applications/{app['id']}/transition", json={"to_state": "production"})
    assert r.status_code == 200, r.text
    assert r.json()["lifecycle_state"] == "production"


# --- Emergency suspension --------------------------------------------


async def test_suspension_requires_a_privileged_role_and_a_live_state(
    client, as_role, make_identity, roles, model_version, db
):
    from app.governance.models import Application, LifecycleState

    await as_role("Application Developer")
    app = await _draft(client, model_version)

    admin = await make_identity("Platform Administrator")
    client.act_as(admin, [roles["Platform Administrator"]])
    r = await client.post(f"/api/v1/applications/{app['id']}/suspend", json={"reason": "test"})
    assert r.status_code == 409, "a draft was suspendable"

    row = await db.get(Application, uuid.UUID(app["id"]))
    row.lifecycle_state = LifecycleState.production.value
    await db.commit()

    dev = await make_identity("Application Developer")
    client.act_as(dev, [roles["Application Developer"]])
    r = await client.post(f"/api/v1/applications/{app['id']}/suspend", json={"reason": "test"})
    assert r.status_code == 403, "a builder role could suspend production"

    client.act_as(admin, [roles["Platform Administrator"]])
    r = await client.post(f"/api/v1/applications/{app['id']}/suspend", json={"reason": "bad output"})
    assert r.status_code == 200, r.text
    assert r.json()["lifecycle_state"] == "suspended"


async def test_suspension_is_audited_as_security_critical(
    client, as_role, make_identity, roles, model_version, db
):
    from app.governance.models import Application, LifecycleState

    await as_role("Application Developer")
    app = await _draft(client, model_version)
    row = await db.get(Application, uuid.UUID(app["id"]))
    row.lifecycle_state = LifecycleState.production.value
    await db.commit()

    admin = await make_identity("Platform Administrator")
    client.act_as(admin, [roles["Platform Administrator"]])
    await client.post(f"/api/v1/applications/{app['id']}/suspend", json={"reason": "harmful output"})

    r = await client.get("/api/v1/audit-events?event_type=application.emergency_suspended")
    assert r.status_code == 200, r.text
    events = r.json()
    assert events, "suspension emitted no audit event"
    assert events[0]["severity"] == "security_critical"


# --- Retirement ------------------------------------------------------


async def test_retirement_is_platform_administrator_only_and_terminal(
    client, as_role, make_identity, roles, model_version
):
    await as_role("Application Developer")
    app = await _draft(client, model_version)

    dev = await make_identity("Application Developer")
    client.act_as(dev, [roles["Application Developer"]])
    r = await client.post(f"/api/v1/applications/{app['id']}/transition", json={"to_state": "retired"})
    assert r.status_code == 403, r.text

    admin = await make_identity("Platform Administrator")
    client.act_as(admin, [roles["Platform Administrator"]])
    r = await client.post(f"/api/v1/applications/{app['id']}/transition", json={"to_state": "retired"})
    assert r.status_code == 200, r.text

    # Terminal: nothing leaves retired.
    r = await client.post(f"/api/v1/applications/{app['id']}/transition", json={"to_state": "draft"})
    assert r.status_code == 409, "a retired application was revived"


# --- Edit guards -----------------------------------------------------


async def test_only_the_creator_may_edit_and_only_before_evaluation(
    client, as_role, make_identity, roles, model_version
):
    creator = await as_role("Application Developer")
    app = await _draft(client, model_version, name="Original")

    other = await make_identity("Application Developer")
    client.act_as(other, [roles["Application Developer"]])
    r = await client.patch(f"/api/v1/applications/{app['id']}", json={"name": "Hijacked"})
    assert r.status_code == 403, r.text

    client.act_as(creator, [roles["Application Developer"]])
    r = await client.patch(f"/api/v1/applications/{app['id']}", json={"name": "Renamed"})
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "Renamed"

    for state in ("development", "evaluation"):
        await client.post(f"/api/v1/applications/{app['id']}/transition", json={"to_state": state})
    r = await client.patch(f"/api/v1/applications/{app['id']}", json={"name": "TooLate"})
    assert r.status_code == 409, "an application under evaluation was still editable"


async def test_editing_replaces_permitted_roles_wholesale(
    client, as_role, roles, model_version
):
    await as_role("Application Developer")
    app = await _draft(client, model_version, permitted_role_ids=[str(roles["Clinician"].id)])

    r = await client.patch(
        f"/api/v1/applications/{app['id']}",
        json={"permitted_role_ids": [str(roles["Auditor"].id)]},
    )
    assert r.status_code == 200, r.text

    r = await client.get(f"/api/v1/applications/{app['id']}")
    assert r.status_code == 200, r.text
    assert [str(i) for i in r.json()["permitted_role_ids"]] == [str(roles["Auditor"].id)]


# --- Risk questionnaire (advisory, never authoritative) ---------------


@pytest.mark.parametrize(
    "answers,expected",
    [
        ({"recommends_diagnosis": True}, "high"),
        ({"recommends_treatment": True}, "high"),
        ({"influences_medication_decisions": True}, "high"),
        ({"takes_autonomous_clinical_action": True}, "high"),
        ({"processes_phi": True}, "moderate"),
        ({"analyzes_medical_images": True}, "moderate"),
        ({"directly_affects_patient_care": True}, "moderate"),
        ({}, "low"),
        # A mitigating answer must never escalate: a human reviewing the
        # output reduces risk, and listing it as a signal would invert it.
        ({"allows_independent_clinician_review": True}, "low"),
        # High wins over moderate when both are present.
        ({"recommends_diagnosis": True, "processes_phi": True}, "high"),
    ],
)
def test_risk_scoring_rule(answers, expected):
    fields = [
        "processes_phi",
        "analyzes_medical_images",
        "analyzes_physiological_signals",
        "generates_patient_specific_recommendations",
        "recommends_diagnosis",
        "recommends_treatment",
        "influences_medication_decisions",
        "produces_time_critical_recommendations",
        "takes_autonomous_clinical_action",
        "allows_independent_clinician_review",
        "directly_affects_patient_care",
    ]
    responses = {f: False for f in fields}
    responses.update(answers)
    assert compute_suggested_classification(responses) == expected


async def test_questionnaire_is_advisory_and_does_not_set_the_classification(
    client, as_role, model_version
):
    """§15: the score suggests, a human decides. If submitting it set the
    classification directly, the reviewer's judgement would be bypassed."""
    await as_role("Application Developer")
    app = await _draft(client, model_version)

    answers = {
        "processes_phi": True,
        "analyzes_medical_images": False,
        "analyzes_physiological_signals": False,
        "generates_patient_specific_recommendations": False,
        "recommends_diagnosis": True,
        "recommends_treatment": False,
        "influences_medication_decisions": False,
        "produces_time_critical_recommendations": False,
        "takes_autonomous_clinical_action": False,
        "allows_independent_clinician_review": True,
        "directly_affects_patient_care": False,
    }
    r = await client.post(f"/api/v1/applications/{app['id']}/risk-questionnaire", json=answers)
    assert r.status_code == 200, r.text
    assert r.json()["suggested_classification"] == "high"

    r = await client.get(f"/api/v1/applications/{app['id']}")
    assert r.json()["risk_classification"] is None, "the suggestion was applied automatically"


async def test_resubmitting_the_questionnaire_updates_rather_than_duplicates(
    client, as_role, model_version
):
    await as_role("Application Developer")
    app = await _draft(client, model_version)
    base = {f: False for f in (
        "processes_phi", "analyzes_medical_images", "analyzes_physiological_signals",
        "generates_patient_specific_recommendations", "recommends_diagnosis",
        "recommends_treatment", "influences_medication_decisions",
        "produces_time_critical_recommendations", "takes_autonomous_clinical_action",
        "allows_independent_clinician_review", "directly_affects_patient_care",
    )}

    r = await client.post(f"/api/v1/applications/{app['id']}/risk-questionnaire", json=base)
    assert r.json()["suggested_classification"] == "low"

    r = await client.post(
        f"/api/v1/applications/{app['id']}/risk-questionnaire",
        json={**base, "recommends_treatment": True},
    )
    assert r.status_code == 200, r.text
    assert r.json()["suggested_classification"] == "high"


async def test_setting_the_risk_classification_is_restricted(
    client, as_role, make_identity, roles, model_version
):
    await as_role("Application Developer")
    app = await _draft(client, model_version)

    r = await client.patch(
        f"/api/v1/applications/{app['id']}/risk-classification",
        json={"risk_classification": "low"},
    )
    assert r.status_code == 403, "a builder role set a risk classification"

    officer = await make_identity("AI Governance Officer")
    client.act_as(officer, [roles["AI Governance Officer"]])
    r = await client.patch(
        f"/api/v1/applications/{app['id']}/risk-classification",
        json={"risk_classification": "high"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["risk_classification"] == "high"


# --- Not found / validation ------------------------------------------


async def test_unknown_application_is_404_across_the_surface(client, as_role):
    await as_role("Platform Administrator")
    missing = uuid.uuid4()
    for method, path, body in [
        ("get", f"/api/v1/applications/{missing}", None),
        ("post", f"/api/v1/applications/{missing}/transition", {"to_state": "development"}),
        ("post", f"/api/v1/applications/{missing}/suspend", {"reason": "x"}),
    ]:
        r = await getattr(client, method)(path, **({"json": body} if body else {}))
        assert r.status_code == 404, f"{path} returned {r.status_code}"


async def test_creating_against_an_unknown_model_version_is_rejected(client, as_role):
    await as_role("Application Developer")
    r = await client.post(
        "/api/v1/applications",
        json={"name": "Orphan", "model_version_id": str(uuid.uuid4())},
    )
    assert r.status_code in (404, 409, 422), r.text
