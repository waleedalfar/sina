"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "react-oidc-context";
import { Aperture } from "lucide-react";
import { takeReturnPath } from "@/lib/auth/session";

/**
 * oidc-client-ts processes the redirect via `onSigninCallback` (see
 * lib/auth/config.ts), which strips the `?code=`/`?state=` query but
 * deliberately does not navigate. This page performs the actual move,
 * because only it has the Next router: `history.replaceState` alone
 * rewrites the address bar without rendering the target route, which left
 * the app sitting on this spinner under a URL that claimed to be somewhere
 * else until the user reloaded by hand.
 *
 * Destination is whatever page the user was on when the session expired;
 * a plain first sign-in has nothing remembered and falls through to
 * /dashboard. Falls back to /login if we end up here with no in-flight
 * signin.
 */
export default function AuthCallbackPage() {
  const auth = useAuth();
  const router = useRouter();
  // `takeReturnPath` clears the stored value as it reads it, so this must
  // run exactly once — React StrictMode double-invokes effects in dev, and
  // a second read would return the /dashboard fallback and override the
  // real destination.
  const navigated = useRef(false);

  useEffect(() => {
    if (navigated.current) return;
    if (auth.isLoading || auth.activeNavigator) return;

    navigated.current = true;
    router.replace(auth.isAuthenticated ? takeReturnPath() : "/login");
  }, [auth.isLoading, auth.isAuthenticated, auth.activeNavigator, router]);

  return (
    <div className="flex h-screen items-center justify-center bg-base">
      <Aperture className="h-8 w-8 animate-pulse-live text-cyan" strokeWidth={2} />
    </div>
  );
}
