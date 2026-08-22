"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "react-oidc-context";

export default function RootPage() {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (auth.isLoading) return;
    router.replace(auth.isAuthenticated ? "/dashboard" : "/login");
  }, [auth.isLoading, auth.isAuthenticated, router]);

  return null;
}
