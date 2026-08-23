/**
 * The one place "your session is gone" is signalled from.
 *
 * Three separate things can discover an expired session and they can't see
 * each other: `apiFetch` (a `401` from the backend, which happens outside
 * React and so can't use hooks), oidc-client-ts's own token-expiry/
 * silent-renew-failure events, and — in principle — a token revoked at
 * Keycloak while this tab sat idle. They all funnel here, and
 * `SessionExpiredGate` is the single subscriber that turns it into
 * something the user actually sees.
 *
 * Deliberately *not* triggered by `403`. A `403` from this platform is a
 * real, meaningful answer — a policy denial, a separation-of-duties
 * conflict, an unapproved model — and signing the user out on one would
 * both lose their work and misrepresent an authorization decision as an
 * authentication failure.
 */

type Handler = () => void;

let handler: Handler | null = null;

export function setSessionExpiredHandler(next: Handler | null) {
  handler = next;
}

export function notifySessionExpired() {
  handler?.();
}

const RETURN_PATH_KEY = "aperture.returnPath";

/** Remembered before bouncing to the IdP so re-authenticating lands the
 * user back where they were, rather than always on the dashboard. */
export function rememberReturnPath(path: string) {
  try {
    sessionStorage.setItem(RETURN_PATH_KEY, path);
  } catch {
    // sessionStorage can throw (private mode, blocked site data) — the
    // fallback is just landing on /dashboard, which is not worth failing
    // a sign-in over.
  }
}

/** Reads and clears the remembered path. Falls back to `/dashboard`. */
export function takeReturnPath(): string {
  try {
    const path = sessionStorage.getItem(RETURN_PATH_KEY);
    sessionStorage.removeItem(RETURN_PATH_KEY);
    // Only ever return a same-origin absolute path — never anything that
    // could redirect off-site if this value were ever tampered with.
    if (path && path.startsWith("/") && !path.startsWith("//")) return path;
  } catch {
    // see above
  }
  return "/dashboard";
}
