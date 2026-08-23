import { describe, expect, it } from "vitest";
import {
  findConflictingKind,
  kindsConflict,
  hasAnyRole,
  hasRole,
  hasRoleKind,
  SIGNOFF_CATEGORY_ROLE,
  SUSPEND_ROLES,
  PROMOTE_TO_PRODUCTION_ROLES,
  RETIRE_ROLES,
} from "@/lib/auth/roles";
import type { Role, RoleKind } from "@/types/api";

/**
 * This file is a *mirror* of backend/app/identity/roles.py, and a mirror
 * that drifts is worse than no mirror: the UI would either enable a grant
 * the server refuses, or — the dangerous direction — quietly hide one it
 * would have allowed. These tests encode the same truth table the Python
 * unit tests assert, so drift fails here rather than in front of a user.
 */

const ALL_KINDS: RoleKind[] = ["admin", "builder", "signoff", "permitted_user", "readonly"];

// Exactly the pairs in app/identity/roles.py's _CONFLICT_PAIRS.
const EXPECTED_CONFLICTS: [RoleKind, RoleKind][] = [
  ["readonly", "admin"],
  ["readonly", "builder"],
  ["readonly", "signoff"],
  ["readonly", "permitted_user"],
  ["builder", "signoff"],
  ["admin", "signoff"],
];

function isExpectedConflict(a: RoleKind, b: RoleKind): boolean {
  return EXPECTED_CONFLICTS.some(
    ([x, y]) => (x === a && y === b) || (x === b && y === a),
  );
}

describe("separation-of-duties conflict matrix", () => {
  it("matches the backend matrix for every ordered pair of kinds", () => {
    for (const a of ALL_KINDS) {
      for (const b of ALL_KINDS) {
        expect(kindsConflict(a, b), `${a} vs ${b}`).toBe(isExpectedConflict(a, b));
      }
    }
  });

  it("is symmetric", () => {
    for (const a of ALL_KINDS) {
      for (const b of ALL_KINDS) {
        expect(kindsConflict(a, b)).toBe(kindsConflict(b, a));
      }
    }
  });

  it("never conflicts a kind with itself, so a second role of one kind is grantable", () => {
    for (const kind of ALL_KINDS) {
      expect(kindsConflict(kind, kind), kind).toBe(false);
    }
  });

  it("allows sign-off roles to combine with each other", () => {
    // Five distinct categories must be signable, and one person may hold
    // more than one sign-off role even though they cannot sign twice in a
    // single review cycle — that second rule lives in the backend.
    expect(kindsConflict("signoff", "signoff")).toBe(false);
  });

  it("keeps an Auditor separate from everything else", () => {
    for (const kind of ALL_KINDS.filter((k) => k !== "readonly")) {
      expect(kindsConflict("readonly", kind), kind).toBe(true);
    }
  });

  it("keeps builders away from sign-off, preventing self-review", () => {
    expect(kindsConflict("builder", "signoff")).toBe(true);
  });

  it("keeps administrators away from sign-off, preventing self-escalation", () => {
    expect(kindsConflict("admin", "signoff")).toBe(true);
  });
});

describe("findConflictingKind", () => {
  it("returns null when nothing held conflicts", () => {
    expect(findConflictingKind("signoff", ["signoff", "permitted_user"])).toBe(null);
  });

  it("names the specific held kind that blocks the grant", () => {
    // The UI shows this to explain *why* a grant is disabled, so returning
    // the wrong one produces a confidently incorrect explanation.
    expect(findConflictingKind("signoff", ["permitted_user", "builder"])).toBe("builder");
  });

  it("returns null for an empty hand", () => {
    expect(findConflictingKind("admin", [])).toBe(null);
  });
});

describe("role predicates", () => {
  const roles: Role[] = [
    { id: "1", name: "Clinician", kind: "permitted_user" },
    { id: "2", name: "Auditor", kind: "readonly" },
  ];

  it("matches by exact name, not substring", () => {
    expect(hasRole(roles, "Clinician")).toBe(true);
    expect(hasRole(roles, "Clinic")).toBe(false);
    expect(hasRole(roles, "clinician")).toBe(false);
  });

  it("matches by kind", () => {
    expect(hasRoleKind(roles, "readonly")).toBe(true);
    expect(hasRoleKind(roles, "admin")).toBe(false);
  });

  it("hasAnyRole is false for an empty candidate list rather than true", () => {
    expect(hasAnyRole(roles, [])).toBe(false);
    expect(hasAnyRole(roles, ["Auditor", "Nobody"])).toBe(true);
    expect(hasAnyRole([], ["Auditor"])).toBe(false);
  });
});

describe("mirrored backend role lists", () => {
  // Drift in these lists is silent in normal use: the UI simply shows the
  // wrong affordances. Pinned against backend/app/governance/policy.py.
  it("matches CATEGORY_ROLE", () => {
    expect(SIGNOFF_CATEGORY_ROLE).toEqual({
      clinical_safety: "Clinical Safety Reviewer",
      privacy: "Privacy Officer",
      security: "Security Administrator",
      ai_governance: "AI Governance Officer",
      compliance: "Compliance Officer",
    });
  });

  it("matches SUSPEND_ROLES", () => {
    expect([...SUSPEND_ROLES].sort()).toEqual(
      ["AI Governance Officer", "Platform Administrator", "Security Administrator"].sort(),
    );
  });

  it("keeps promotion to production and retirement administrator-only", () => {
    expect(PROMOTE_TO_PRODUCTION_ROLES).toEqual(["Platform Administrator"]);
    expect(RETIRE_ROLES).toEqual(["Platform Administrator"]);
  });
});
