import { apiFetch } from "@/lib/api/client";
import type { Identity, Me, Role } from "@/types/api";

export const identityApi = {
  me: () => apiFetch<Me>("/api/v1/me"),
  roles: () => apiFetch<Role[]>("/api/v1/roles"),
  identities: () => apiFetch<Identity[]>("/api/v1/identities"),
  identityRoles: (identityId: string) => apiFetch<Role[]>(`/api/v1/identities/${identityId}/roles`),
  grantRole: (identityId: string, roleId: string) =>
    apiFetch<Role>(`/api/v1/identities/${identityId}/roles`, {
      method: "POST",
      body: { role_id: roleId },
    }),
  revokeRole: (identityId: string, roleId: string) =>
    apiFetch<void>(`/api/v1/identities/${identityId}/roles/${roleId}`, { method: "DELETE" }),
};
