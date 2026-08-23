import type { AuthProviderProps } from "react-oidc-context";
import { takeReturnPath } from "@/lib/auth/session";

/**
 * Browser-native OIDC (Authorization Code + PKCE) directly against
 * Keycloak's public `hospital-platform-web` client — no Next.js backend
 * session, no client secret in the browser (there isn't one). See
 * docs/modules/frontend.md's "Design decision: browser-native OIDC".
 */
export const oidcConfig: AuthProviderProps = {
  authority: process.env.NEXT_PUBLIC_OIDC_AUTHORITY!,
  client_id: process.env.NEXT_PUBLIC_OIDC_CLIENT_ID!,
  redirect_uri: process.env.NEXT_PUBLIC_OIDC_REDIRECT_URI!,
  scope: "openid profile email",
  automaticSilentRenew: true,
  onSigninCallback: () => {
    // Lands back on whatever page the user was on when the session
    // expired, not always the dashboard — see lib/auth/session. A plain
    // first sign-in has nothing remembered and falls through to
    // /dashboard as before.
    window.history.replaceState({}, document.title, takeReturnPath());
  },
};

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL!;
