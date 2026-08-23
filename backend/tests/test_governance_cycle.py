"""
Regression cover for the Application approval cycle.

This is the path the platform exists to enforce, and the one whose rules
are easiest to break by accident: five distinct sign-offs, no self-approval,
one signer per cycle, and a transition to Approved that the *system*
triggers as a side effect of the last approval rather than anyone
requesting it. All of it was previously proven only by live walkthrough,
which leaves nothing behind to catch a regression.

See governance.md for the rules being asserted.
"""

import uuid

import pytest

from app.governance.policy import APPLICATION_APPROVAL_CATEGORIES, CATEGORY_ROLE


async def _create_application(client, model_version, **overrides):
    body = {
        "name": f"TestApp-{uuid.uuid4().hex[:6]}",
        "purpose": "regression fixture",
        "model_version_id": str(model_version.id),
        "permitted_data": ["clinical_notes"],
        "restricted_data": [],
        "human_review_required": True,
        **overrides,
    }
    r = await client.post("/api/v1/applications", json=body)
    assert r.status_code == 201, r.text
    return r.json()


async def _approve_model_version(client, make_identity, roles, model_version, evaluation_run):
    """The five Application sign-offs are necessary but NOT sufficient — the
    bound Model Version must also carry an approved `ai_governance`
    decision before the system will move the Application to Approved. That
    coupling is easy to miss reading either module alone, so it is asserted
    here rather than assumed.

    The decision must also cite a completed evaluation run as evidence —
    the approval schema requires it, so an approver cannot sign off on a
    model version that was never evaluated.
    """
    officer = await make_identity("AI Governance Officer")
    client.act_as(officer, [roles["AI Governance Officer"]])
    r = await client.post(
        f"/api/v1/model-versions/{model_version.id}/approvals",
        json={"decision": "approved", "evidence_evaluation_run_id": str(evaluation_run.id)},
    )
    assert r.status_code == 201, r.text
    return officer


async def _advance_to_governance_review(client, app_id, creator, roles):
    """draft -> development -> evaluation -> governance_review, as the creator."""
    client.act_as(creator, [roles["Application Developer"]])
    for to_state in ("development", "evaluation", "governance_review"):
        r = await client.post(
            f"/api/v1/applications/{app_id}/transition", json={"to_state": to_state}
        )
        assert r.status_code == 200, f"{to_state}: {r.text}"
    return r.json()


@pytest.fixture
def signer_roles(roles):
    return {category: roles[role] for category, role in CATEGORY_ROLE.items()}


async def test_five_distinct_signoffs_drive_the_system_transition_to_approved(
    client, as_role, make_identity, roles, model_version, completed_evaluation
):
    creator = await as_role("Application Developer")
    application = await _create_application(client, model_version)
    assert application["lifecycle_state"] == "draft"

    state = await _advance_to_governance_review(client, application["id"], creator, roles)
    assert state["lifecycle_state"] == "governance_review"

    # Four of the five categories: still under review, because the
    # transition is all-or-nothing.
    for category in APPLICATION_APPROVAL_CATEGORIES[:-1]:
        signer = await make_identity(CATEGORY_ROLE[category])
        client.act_as(signer, [roles[CATEGORY_ROLE[category]]])
        r = await client.post(
            f"/api/v1/applications/{application['id']}/approvals",
            json={"category": category, "decision": "approved"},
        )
        assert r.status_code == 201, r.text

    client.act_as(creator, [roles["Application Developer"]])
    r = await client.get(f"/api/v1/applications/{application['id']}")
    assert r.json()["lifecycle_state"] == "governance_review", "transitioned early"

    await _approve_model_version(
        client, make_identity, roles, model_version, completed_evaluation
    )

    # The fifth flips it, without anyone requesting a transition.
    last = APPLICATION_APPROVAL_CATEGORIES[-1]
    signer = await make_identity(CATEGORY_ROLE[last])
    client.act_as(signer, [roles[CATEGORY_ROLE[last]]])
    r = await client.post(
        f"/api/v1/applications/{application['id']}/approvals",
        json={"category": last, "decision": "approved"},
    )
    assert r.status_code == 201, r.text

    client.act_as(creator, [roles["Application Developer"]])
    r = await client.get(f"/api/v1/applications/{application['id']}")
    assert r.json()["lifecycle_state"] == "approved"


async def test_creator_cannot_approve_own_application(
    client, as_role, make_identity, roles, model_version, completed_evaluation
):
    """No-self-approval, enforced even when the caller holds the sign-off
    role — role history isn't retroactive, so the matrix alone isn't enough.
    """
    creator = await as_role("Application Developer")
    application = await _create_application(client, model_version)
    await _advance_to_governance_review(client, application["id"], creator, roles)

    # Same identity, now also wearing a sign-off role.
    client.act_as(creator, [roles["Application Developer"], roles["Privacy Officer"]])
    r = await client.post(
        f"/api/v1/applications/{application['id']}/approvals",
        json={"category": "privacy", "decision": "approved"},
    )
    assert r.status_code == 409, r.text
    assert "creator" in r.text


async def test_one_signer_cannot_cover_two_categories(
    client, as_role, make_identity, roles, model_version, completed_evaluation
):
    creator = await as_role("Application Developer")
    application = await _create_application(client, model_version)
    await _advance_to_governance_review(client, application["id"], creator, roles)

    signer = await make_identity("Privacy Officer", "Security Administrator")
    client.act_as(signer, [roles["Privacy Officer"], roles["Security Administrator"]])

    r = await client.post(
        f"/api/v1/applications/{application['id']}/approvals",
        json={"category": "privacy", "decision": "approved"},
    )
    assert r.status_code == 201, r.text

    r = await client.post(
        f"/api/v1/applications/{application['id']}/approvals",
        json={"category": "security", "decision": "approved"},
    )
    assert r.status_code == 409, "the same identity signed twice in one cycle"


async def test_approval_requires_the_category_role(
    client, as_role, make_identity, roles, model_version, completed_evaluation
):
    creator = await as_role("Application Developer")
    application = await _create_application(client, model_version)
    await _advance_to_governance_review(client, application["id"], creator, roles)

    wrong = await make_identity("Privacy Officer")
    client.act_as(wrong, [roles["Privacy Officer"]])
    r = await client.post(
        f"/api/v1/applications/{application['id']}/approvals",
        json={"category": "security", "decision": "approved"},
    )
    assert r.status_code == 403, r.text


async def test_approvals_rejected_outside_governance_review(
    client, as_role, make_identity, roles, model_version, completed_evaluation
):
    await as_role("Application Developer")
    application = await _create_application(client, model_version)

    signer = await make_identity("Privacy Officer")
    client.act_as(signer, [roles["Privacy Officer"]])
    r = await client.post(
        f"/api/v1/applications/{application['id']}/approvals",
        json={"category": "privacy", "decision": "approved"},
    )
    assert r.status_code == 409, "approval accepted while still in draft"


async def test_reentry_supersedes_the_previous_cycles_approvals(
    client, as_role, make_identity, roles, model_version, completed_evaluation
):
    """Review-round semantics: a reviewer who signed a prior cycle must be
    able to sign again after re-entry, without a spurious 409.
    """
    creator = await as_role("Application Developer")
    application = await _create_application(client, model_version)
    app_id = application["id"]
    await _advance_to_governance_review(client, app_id, creator, roles)

    signer = await make_identity("Privacy Officer")
    client.act_as(signer, [roles["Privacy Officer"]])
    r = await client.post(
        f"/api/v1/applications/{app_id}/approvals",
        json={"category": "privacy", "decision": "approved"},
    )
    assert r.status_code == 201, r.text

    # Kick it back out with a rejection. There is deliberately no manual
    # governance_review -> development path; the rejection is what moves
    # it, as a system-triggered side effect.
    rejecter = await make_identity("Security Administrator")
    client.act_as(rejecter, [roles["Security Administrator"]])
    r = await client.post(
        f"/api/v1/applications/{app_id}/approvals",
        json={"category": "security", "decision": "rejected"},
    )
    assert r.status_code == 201, r.text

    client.act_as(creator, [roles["Application Developer"]])
    r = await client.get(f"/api/v1/applications/{app_id}")
    assert r.json()["lifecycle_state"] == "development", r.text

    for to_state in ("evaluation", "governance_review"):
        r = await client.post(
            f"/api/v1/applications/{app_id}/transition", json={"to_state": to_state}
        )
        assert r.status_code == 200, f"{to_state}: {r.text}"

    # The same signer signs the same category again: allowed, because the
    # prior row was superseded rather than left standing.
    client.act_as(signer, [roles["Privacy Officer"]])
    r = await client.post(
        f"/api/v1/applications/{app_id}/approvals",
        json={"category": "privacy", "decision": "approved"},
    )
    assert r.status_code == 201, r.text
