"""
Pure unit tests for the separation-of-duties conflict matrix — no DB/infra
needed. This is the single most safety-critical piece of logic in the
identity module (identity.md's whole reason for existing), so it gets
tested in isolation from the rest of the stack.
"""

from app.identity.models import RoleKind
from app.identity.roles import SEED_ROLES, find_conflicting_kind, kinds_conflict


def test_seed_roles_has_exactly_ten_roles_matching_identity_md():
    assert len(SEED_ROLES) == 10
    names = {name for name, _kind, _desc in SEED_ROLES}
    assert names == {
        "Platform Administrator",
        "ML Engineer",
        "Application Developer",
        "Clinical Safety Reviewer",
        "Privacy Officer",
        "Security Administrator",
        "AI Governance Officer",
        "Compliance Officer",
        "Clinician",
        "Auditor",
    }


def test_readonly_conflicts_with_everything():
    for kind in (RoleKind.admin, RoleKind.builder, RoleKind.signoff, RoleKind.permitted_user):
        assert kinds_conflict(RoleKind.readonly.value, kind.value)


def test_builder_conflicts_with_signoff():
    assert kinds_conflict(RoleKind.builder.value, RoleKind.signoff.value)


def test_admin_conflicts_with_signoff():
    assert kinds_conflict(RoleKind.admin.value, RoleKind.signoff.value)


def test_signoff_roles_may_combine_with_each_other():
    # Multiple sign-off roles on one identity are allowed — identity.md:
    # "nothing in the spec requires sign-off roles to be independent from
    # each other, only from the people who build or administer" what's
    # reviewed.
    assert not kinds_conflict(RoleKind.signoff.value, RoleKind.signoff.value)


def test_admin_and_builder_may_combine():
    # Platform Administrator isn't inherently a self-review risk the way a
    # builder is — see identity.md's reasoning for why this combination
    # (unlike admin+signoff) is allowed.
    assert not kinds_conflict(RoleKind.admin.value, RoleKind.builder.value)


def test_permitted_user_may_combine_with_builder_and_signoff():
    assert not kinds_conflict(RoleKind.permitted_user.value, RoleKind.builder.value)
    assert not kinds_conflict(RoleKind.permitted_user.value, RoleKind.signoff.value)


def test_find_conflicting_kind_returns_the_specific_conflicting_kind():
    held = {RoleKind.builder.value, RoleKind.permitted_user.value}
    assert find_conflicting_kind(RoleKind.signoff.value, held) == RoleKind.builder.value


def test_find_conflicting_kind_returns_none_when_no_conflict():
    held = {RoleKind.admin.value, RoleKind.permitted_user.value}
    assert find_conflicting_kind(RoleKind.builder.value, held) is None
