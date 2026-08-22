import type { AuthProviderProps } from "react-oidc-context";

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
    window.history.replaceState({}, document.title, "/dashboard");
  },
};

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL!;
