"""
The "what's allowed" tables for governance — category/role mapping and the
Application lifecycle state graph, per governance.md.
"""

from app.governance.models import LifecycleState

CATEGORY_ROLE: dict[str, str] = {
    "clinical_safety": "Clinical Safety Reviewer",
    "privacy": "Privacy Officer",
    "security": "Security Administrator",
    "ai_governance": "AI Governance Officer",
    "compliance": "Compliance Officer",
}

APPLICATION_APPROVAL_CATEGORIES: list[str] = list(CATEGORY_ROLE.keys())  # all 5 required

SUSPEND_ROLES = {"Platform Administrator", "Security Administrator", "AI Governance Officer"}
RETIRE_ROLES = {"Platform Administrator"}

NON_TERMINAL_STATES = {
    LifecycleState.draft.value,
    LifecycleState.development.value,
    LifecycleState.evaluation.value,
    LifecycleState.governance_review.value,
    LifecycleState.approved.value,
    LifecycleState.staging.value,
    LifecycleState.production.value,
    LifecycleState.suspended.value,
}

# Transitions reachable via POST /applications/{id}/transition. A `None`
# role set means "creator only" (checked separately, since it's a specific
# identity, not a role). governance_review -> approved and
# governance_review -> development are deliberately absent — those are
# system-triggered only, as a side effect of recording a GovernanceApproval
# decision (see router.py), never reachable through this endpoint. Suspend
# is its own dedicated endpoint, also not part of this graph.
MANUAL_TRANSITIONS: dict[str, dict[str, set[str] | None]] = {
    LifecycleState.draft.value: {
        LifecycleState.development.value: None,
    },
    LifecycleState.development.value: {
        LifecycleState.evaluation.value: None,
    },
    LifecycleState.evaluation.value: {
        # Creator-only, PLUS a DB-gated condition (>=1 complete
        # EvaluationRun for the bound ModelVersion) checked in the router —
        # not expressible in this static table.
        LifecycleState.governance_review.value: None,
    },
    LifecycleState.approved.value: {
        LifecycleState.staging.value: {"Platform Administrator", "ML Engineer"},
    },
    LifecycleState.staging.value: {
        LifecycleState.production.value: {"Platform Administrator"},
    },
    LifecycleState.suspended.value: {
        # Re-entry role not explicit in governance.md; Platform
        # Administrator chosen as the role that generally manages
        # cross-cutting lifecycle actions elsewhere (suspend, retire) —
        # flagged as an implementation assumption, not a documented rule.
        LifecycleState.governance_review.value: {"Platform Administrator"},
    },
}
