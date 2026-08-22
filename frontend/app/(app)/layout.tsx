"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "react-oidc-context";
import { AppShell } from "@/components/layout/AppShell";
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

  return <AppShell>{children}</AppShell>;
}
