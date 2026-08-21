"""
The MVP 0.1 role set and the separation-of-duties conflict matrix, straight
from identity.md. This is the one place both live — the seed script and the
role-grant endpoint both import from here, so the matrix can't drift from
what's actually seeded.
"""

from app.identity.models import RoleKind

# name, kind, description — traced from identity.md's role table, not
# collapsed for MVP convenience (see feedback_governance_schema_research
# memory: trace the spec's explicit lists before trimming).
SEED_ROLES: list[tuple[str, RoleKind, str]] = [
    ("Platform Administrator", RoleKind.admin, "Role/identity administration; cross-cutting admin actions."),
    ("ML Engineer", RoleKind.builder, "Imports and manages model versions."),
    ("Application Developer", RoleKind.builder, "Creates and edits Application drafts."),
    ("Clinical Safety Reviewer", RoleKind.signoff, "Clinical Safety sign-off on Applications/Model Versions."),
    ("Privacy Officer", RoleKind.signoff, "Privacy sign-off on Applications."),
    ("Security Administrator", RoleKind.signoff, "Security sign-off on Applications; can trigger emergency suspension."),
    ("AI Governance Officer", RoleKind.signoff, "AI Governance sign-off on Applications and Model Versions."),
    ("Compliance Officer", RoleKind.signoff, "Compliance sign-off on Applications; sets Model Version risk classification."),
    ("Clinician", RoleKind.permitted_user, "Permitted end user of approved clinical Applications."),
    ("Auditor", RoleKind.readonly, "Read-only access across governance, audit, and dashboard data."),
]

# Symmetric conflict pairs, by Role.kind — see identity.md's conflict
# matrix and the reasoning for each rule (self-review prevention for
# builder/signoff, self-escalation prevention for admin/signoff, and
# independence of oversight for readonly).
_CONFLICT_PAIRS: list[tuple[RoleKind, RoleKind]] = [
    (RoleKind.readonly, RoleKind.admin),
    (RoleKind.readonly, RoleKind.builder),
    (RoleKind.readonly, RoleKind.signoff),
    (RoleKind.readonly, RoleKind.permitted_user),
    (RoleKind.builder, RoleKind.signoff),
    (RoleKind.admin, RoleKind.signoff),
]

_CONFLICTS: set[tuple[str, str]] = set()
for _a, _b in _CONFLICT_PAIRS:
    _CONFLICTS.add((_a.value, _b.value))
    _CONFLICTS.add((_b.value, _a.value))


def kinds_conflict(kind_a: str, kind_b: str) -> bool:
    return (kind_a, kind_b) in _CONFLICTS


def find_conflicting_kind(candidate_kind: str, held_kinds: set[str]) -> str | None:
    """Returns the first currently-held kind that conflicts with
    candidate_kind, or None if there's no conflict."""
    for held in held_kinds:
        if kinds_conflict(candidate_kind, held):
            return held
    return None
