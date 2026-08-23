"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { identityApi } from "@/lib/api/identity";

export function useIdentities() {
  return useQuery({ queryKey: ["identities"], queryFn: identityApi.identities });
}

export function useRoles() {
  return useQuery({ queryKey: ["roles"], queryFn: identityApi.roles });
}

/** Full grant/revoke history for one identity. Only fetched when the
 * card's history section is actually opened — there's no reason to pull
 * every identity's history on page load. */
export function useIdentityRoleHistory(identityId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["identity-role-history", identityId],
    queryFn: () => identityApi.identityRoles(identityId, true),
    enabled,
  });
}

export function useIdentityRoleMutations(identityId: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["identities"] });
    // A grant or revoke is exactly what the history view exists to show.
    qc.invalidateQueries({ queryKey: ["identity-role-history", identityId] });
  };

  const grant = useMutation({
    mutationFn: (roleId: string) => identityApi.grantRole(identityId, roleId),
    onSuccess: invalidate,
  });

  const revoke = useMutation({
    mutationFn: (roleId: string) => identityApi.revokeRole(identityId, roleId),
    onSuccess: invalidate,
  });

  return { grant, revoke };
}
