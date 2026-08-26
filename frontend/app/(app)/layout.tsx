"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "react-oidc-context";
import { AppShell } from "@/components/layout/AppShell";
import { SessionExpiredGate } from "@/components/auth/SessionExpiredGate";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated) {
      router.replace("/login");
    }
  }, [auth.isLoading, auth.isAuthenticated, router]);

  if (auth.isLoading || !auth.isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center bg-base">
        {/* A tube drawing, matching the lifecycle rack — the product's own
            idiom for "in progress", rather than a generic spinner. */}
        <div aria-label="Loading" role="status" className="flex flex-col items-center gap-2.5">
          <div className="h-2 w-9 border border-b-0 border-accent bg-accent" />
          <div className="relative h-14 w-9 overflow-hidden rounded-b-lg border border-accent">
            <div className="absolute inset-x-0 bottom-0 h-1/2 animate-pulse-live bg-accent/80" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Mounted here, not in Providers: only the authenticated route
          group can experience a session expiring mid-use, and /login must
          never be able to render an expiry overlay over itself. */}
      <SessionExpiredGate />
      <AppShell>{children}</AppShell>
    </>
  );
}
