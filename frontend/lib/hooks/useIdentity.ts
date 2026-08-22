"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { identityApi } from "@/lib/api/identity";

export function useIdentities() {
  return useQuery({ queryKey: ["identities"], queryFn: identityApi.identities });
}

export function useRoles() {
  return useQuery({ queryKey: ["roles"], queryFn: identityApi.roles });
}

export function useIdentityRoleMutations(identityId: string) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["identities"] });

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
