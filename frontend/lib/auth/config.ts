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
    // Only strip `?code=`/`?state=` from the URL — deliberately NOT a
    // navigation. `history.replaceState` rewrites the address bar without
    // telling the Next App Router to render a different route, so using it
    // to "go" to the destination left the app mounted on this callback
    // route (a bare spinner) under a URL that claimed otherwise, until the
    // user reloaded by hand. The actual move is done by the callback page,
    // which has the router — see app/auth/callback/page.tsx.
    window.history.replaceState({}, document.title, window.location.pathname);
  },
};

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL!;
