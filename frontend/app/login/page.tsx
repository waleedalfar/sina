"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "react-oidc-context";
import { motion } from "framer-motion";
import { Aperture, ArrowRight, ShieldCheck, ScrollText, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function LoginPage() {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (auth.isAuthenticated) router.replace("/dashboard");
  }, [auth.isAuthenticated, router]);

  return (
    <div className="relative flex h-screen items-center justify-center overflow-hidden bg-base">
      <BackgroundField />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        className="relative z-10 w-full max-w-sm px-6"
      >
        <div className="mb-8 flex flex-col items-center text-center">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#22d3ee_0%,#8b5cf6_100%)] shadow-[var(--shadow-glow-cyan)]"
          >
            <Aperture className="h-7 w-7 text-inverted" strokeWidth={2} />
          </motion.div>
          <h1 className="text-xl font-semibold text-primary">Aperture</h1>
          <p className="mt-1.5 text-sm text-secondary">
            Deploy and operate AI safely inside regulated healthcare environments.
          </p>
        </div>

        <Button
          variant="primary"
          className="w-full"
          onClick={() => auth.signinRedirect()}
          disabled={auth.isLoading}
        >
          {auth.isLoading ? "Connecting…" : "Sign in"}
          <ArrowRight className="h-4 w-4" />
        </Button>

        <p className="mt-4 text-center text-xs text-tertiary">
          Authenticates via your organization&apos;s identity provider. Aperture never sees your password.
        </p>

        <div className="mt-10 grid grid-cols-3 gap-3 border-t border-hairline pt-6">
          <Feature icon={ShieldCheck} label="Structural governance" />
          <Feature icon={ScrollText} label="Tamper-evident audit" />
          <Feature icon={GitBranch} label="Full model lifecycle" />
        </div>
      </motion.div>
    </div>
  );
}

function Feature({ icon: Icon, label }: { icon: typeof ShieldCheck; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 text-center">
      <Icon className="h-4 w-4 text-tertiary" strokeWidth={1.75} />
      <span className="text-[10px] leading-tight text-tertiary">{label}</span>
    </div>
  );
}

function BackgroundField() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.4]"
        style={{
          backgroundImage:
            "linear-gradient(var(--color-border-hairline) 1px, transparent 1px), linear-gradient(90deg, var(--color-border-hairline) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse 60% 60% at 50% 40%, black 0%, transparent 100%)",
        }}
      />
      <motion.div
        animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -top-40 left-1/4 h-96 w-96 rounded-full bg-cyan/20 blur-[120px]"
      />
      <motion.div
        animate={{ x: [0, -30, 0], y: [0, 20, 0] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-1/3 right-1/4 h-96 w-96 rounded-full bg-violet/20 blur-[120px]"
      />
    </div>
  );
}
