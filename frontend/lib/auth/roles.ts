import type { Role, RoleKind } from "@/types/api";

export function hasRole(roles: Role[], name: string): boolean {
  return roles.some((r) => r.name === name);
}

export function hasRoleKind(roles: Role[], kind: RoleKind): boolean {
  return roles.some((r) => r.kind === kind);
}

export function hasAnyRole(roles: Role[], names: string[]): boolean {
  return roles.some((r) => names.includes(r.name));
}

export const SIGNOFF_CATEGORY_ROLE: Record<string, string> = {
  clinical_safety: "Clinical Safety Reviewer",
  privacy: "Privacy Officer",
  security: "Security Administrator",
  ai_governance: "AI Governance Officer",
  compliance: "Compliance Officer",
};

export const SUSPEND_ROLES = ["Platform Administrator", "Security Administrator", "AI Governance Officer"];

/** Mirrors backend/app/governance/router.py's `submit_risk_questionnaire`
 * `require_role` list — Application Developer or any sign-off role. */
export const RISK_QUESTIONNAIRE_ROLES = ["Application Developer", ...Object.values(SIGNOFF_CATEGORY_ROLE)];
export const RETIRE_ROLES = ["Platform Administrator"];
export const REENTER_REVIEW_ROLES = ["Platform Administrator"];
export const PROMOTE_TO_STAGING_ROLES = ["Platform Administrator", "ML Engineer"];
export const PROMOTE_TO_PRODUCTION_ROLES = ["Platform Administrator"];

/** Mirrors backend/app/governance/policy.py's NON_TERMINAL_STATES — the
 * states retire() may be called from. */
export const NON_TERMINAL_LIFECYCLE_STATES = [
  "draft",
  "development",
  "evaluation",
  "governance_review",
  "approved",
  "staging",
  "production",
  "suspended",
] as const;

// --- models module ---

/** Mirrors backend/app/models/router.py's `import_model_version`. */
export const IMPORT_MODEL_VERSION_ROLES = ["ML Engineer"];
/** Mirrors backend/app/models/router.py's `start_model_version`/`stop_model_version`. */
export const START_STOP_MODEL_ROLES = ["ML Engineer", "Platform Administrator"];
/** Mirrors backend/app/governance/router.py's `set_model_version_risk_classification`. */
export const SET_MODEL_RISK_ROLES = ["AI Governance Officer", "Platform Administrator"];
/** Mirrors backend/app/governance/router.py's `record_model_version_approval`. */
export const RECORD_MODEL_APPROVAL_ROLES = ["AI Governance Officer"];
