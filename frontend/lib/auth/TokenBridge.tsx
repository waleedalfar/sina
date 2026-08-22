"use client";

import { useEffect } from "react";
import { useAuth } from "react-oidc-context";
import { setTokenGetter } from "@/lib/api/client";

/**
 * Wires the current OIDC access token into the plain `apiFetch` client
 * (lib/api/client.ts), which can't call the `useAuth()` hook itself since
 * it's used from outside React (query functions, event handlers). This is
 * the one bridge point between the two.
 */
export function TokenBridge() {
  const auth = useAuth();

  useEffect(() => {
    setTokenGetter(() => auth.user?.access_token ?? null);
  }, [auth.user]);

  return null;
}
