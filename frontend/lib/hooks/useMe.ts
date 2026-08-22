"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "react-oidc-context";
import { identityApi } from "@/lib/api/identity";

export function useMe() {
  const auth = useAuth();
  return useQuery({
    queryKey: ["me"],
    queryFn: identityApi.me,
    enabled: auth.isAuthenticated,
  });
}
