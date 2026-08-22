"use client";

import { ThemeProvider } from "next-themes";
import { AuthProvider } from "react-oidc-context";
import { oidcConfig } from "@/lib/auth/config";
import { TokenBridge } from "@/lib/auth/TokenBridge";
import { QueryProvider } from "@/lib/query/provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="dark" enableSystem={false}>
      <AuthProvider {...oidcConfig}>
        <TokenBridge />
        <QueryProvider>{children}</QueryProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
