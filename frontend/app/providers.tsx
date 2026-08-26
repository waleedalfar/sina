"use client";

import { ThemeProvider } from "next-themes";
import { AuthProvider } from "react-oidc-context";
import { MotionConfig } from "framer-motion";
import { oidcConfig } from "@/lib/auth/config";
import { TokenBridge } from "@/lib/auth/TokenBridge";
import { QueryProvider } from "@/lib/query/provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="light" enableSystem={false}>
      <AuthProvider {...oidcConfig}>
        <TokenBridge />
        {/* globals.css's `prefers-reduced-motion` block only catches plain
            CSS transitions/animations — every Framer Motion animation
            (page entrances, list staggers, the Lifecycle Stepper's
            rotating ring, the nav spring) is JS-driven and needs this to
            respect the same OS preference. See frontend.md's Design
            decision: "a real accessibility requirement, not optional." */}
        <MotionConfig reducedMotion="user">
          <QueryProvider>{children}</QueryProvider>
        </MotionConfig>
      </AuthProvider>
    </ThemeProvider>
  );
}
