"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "react-oidc-context";
import { Aperture } from "lucide-react";

/**
 * oidc-client-ts processes the redirect via `onSigninCallback` (see
 * lib/auth/config.ts), which navigates to /dashboard once done. This page
 * just needs to render something reasonable while that's in flight, and
 * fall back to /login if it ends up here without an in-flight signin.
 */
export default function AuthCallbackPage() {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated && !auth.activeNavigator) {
      router.replace("/login");
    }
  }, [auth.isLoading, auth.isAuthenticated, auth.activeNavigator, router]);

  return (
    <div className="flex h-screen items-center justify-center bg-base">
      <Aperture className="h-8 w-8 animate-pulse-live text-cyan" strokeWidth={2} />
    </div>
  );
}
