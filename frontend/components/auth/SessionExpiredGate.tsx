"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "react-oidc-context";
import { useQueryClient } from "@tanstack/react-query";
import { Clock3 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { rememberReturnPath, setSessionExpiredHandler } from "@/lib/auth/session";

/**
 * What the user sees when their session ends mid-session — previously
 * nothing coherent: a `401` surfaced as whatever red box the page it
 * happened on happened to render, or as an empty list, and the app would
 * sit there authenticated-looking but unable to load anything.
 *
 * Blocking overlay rather than an immediate redirect on purpose. An
 * automatic bounce to the IdP throws away whatever the user had typed and
 * gives no explanation for why the screen changed; this says what
 * happened, stops further interaction with stale data, and lets them
 * choose the moment. Keycloak's own SSO session is often still alive, in
 * which case signing back in is a single click with no re-typing.
 */
export function SessionExpiredGate() {
  const auth = useAuth();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [expired, setExpired] = useState(false);

  const trigger = useCallback(() => {
    setExpired(true);
    // Stop every background refetch immediately. Without this, a dozen
    // queries keep retrying against a dead token behind the overlay,
    // each one re-firing the same signal.
    queryClient.cancelQueries();
  }, [queryClient]);

  // Source 1: a 401 from any API call (lib/api/client.ts).
  useEffect(() => {
    setSessionExpiredHandler(trigger);
    return () => setSessionExpiredHandler(null);
  }, [trigger]);

  // Source 2: oidc-client-ts noticing before the backend does — the
  // access token expired and `automaticSilentRenew` either failed or
  // never got the chance.
  useEffect(() => {
    const removeExpired = auth.events.addAccessTokenExpired(trigger);
    const removeRenewError = auth.events.addSilentRenewError(trigger);
    return () => {
      removeExpired();
      removeRenewError();
    };
  }, [auth.events, trigger]);

  const signInAgain = () => {
    rememberReturnPath(pathname);
    auth.signinRedirect();
  };

  if (!expired) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(16,23,26,0.6)] p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="session-expired-title"
        className="w-full max-w-sm border border-rule bg-surface text-center shadow-[var(--shadow-modal)]"
      >
        <div className="bg-rule px-4 py-3 text-left font-mono text-[10px] tracking-[0.22em] text-surface uppercase">
          Session expired
        </div>
        <div className="flex flex-col items-center gap-3 p-5">
          <div className="flex h-11 w-11 items-center justify-center border border-dashed border-warning text-warning">
            <Clock3 className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <h2 id="session-expired-title" className="text-[15px] font-semibold text-primary">
            Your sign-in is no longer valid
          </h2>
          <p className="text-[12.5px] leading-relaxed text-secondary">
            Nothing on this page is being kept up to date. Sign in again to pick up where you left off.
          </p>
          <Button variant="primary" className="mt-1 w-full" onClick={signInAgain}>
            Sign in again
          </Button>
        </div>
      </div>
    </div>
  );
}
