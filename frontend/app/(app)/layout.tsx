"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "react-oidc-context";
import { AppShell } from "@/components/layout/AppShell";
import { SessionExpiredGate } from "@/components/auth/SessionExpiredGate";
import { Aperture } from "lucide-react";

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
        <Aperture className="h-8 w-8 animate-pulse-live text-cyan" strokeWidth={2} />
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
