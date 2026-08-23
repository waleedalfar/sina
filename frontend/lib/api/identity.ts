import { apiFetch } from "@/lib/api/client";
import type { Identity, Me, Role, RoleAssignment } from "@/types/api";

export const identityApi = {
  me: () => apiFetch<Me>("/api/v1/me"),
  roles: () => apiFetch<Role[]>("/api/v1/roles"),
  identities: () => apiFetch<Identity[]>("/api/v1/identities"),
  identityRoles: (identityId: string, includeRevoked = false) =>
    apiFetch<RoleAssignment[]>(
      `/api/v1/identities/${identityId}/roles${includeRevoked ? "?include_revoked=true" : ""}`,
    ),
  grantRole: (identityId: string, roleId: string) =>
    apiFetch<Role>(`/api/v1/identities/${identityId}/roles`, {
      method: "POST",
      body: { role_id: roleId },
    }),
  revokeRole: (identityId: string, roleId: string) =>
    apiFetch<void>(`/api/v1/identities/${identityId}/roles/${roleId}`, { method: "DELETE" }),
};
