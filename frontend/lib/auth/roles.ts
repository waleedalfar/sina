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
export const RETIRE_ROLES = ["Platform Administrator"];
