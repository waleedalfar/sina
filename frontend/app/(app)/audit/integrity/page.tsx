"use client";

import Link from "next/link";
import { ArrowLeft, ShieldCheck, ShieldAlert, Lock } from "lucide-react";
import { useVerifyIntegrity } from "@/lib/hooks/useAudit";
import { useMe } from "@/lib/hooks/useMe";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { hasAnyRole, VERIFY_INTEGRITY_ROLES, canReadAudit } from "@/lib/auth/roles";
import { ApiError } from "@/lib/api/client";

export default function AuditIntegrityPage() {
  const { data: me, isLoading: meLoading } = useMe();
  const verify = useVerifyIntegrity();

  if (meLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!me || !canReadAudit(me.roles)) {
    return (
      <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-raised text-tertiary">
          <Lock className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <h2 className="text-base font-semibold text-primary">Access restricted</h2>
      </Card>
    );
  }

  const canVerify = hasAnyRole(me.roles, VERIFY_INTEGRITY_ROLES);
  const errorMessage =
    verify.error instanceof ApiError ? verify.error.detail : verify.error instanceof Error ? verify.error.message : null;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/audit" className="inline-flex items-center gap-1.5 text-xs text-tertiary hover:text-secondary mb-2">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Audit Log
        </Link>
        <h1 className="text-lg font-semibold text-primary">Hash Chain Integrity</h1>
        <p className="text-sm text-secondary mt-0.5">
          Walks the full audit event chain and recomputes each event&apos;s hash — the same SQL function the insert
          trigger uses, called here rather than reimplemented, so this check can never drift from what actually
          protects the data.
        </p>
      </div>

      {/* The whole purpose of this page is the verdict, and it replaces
          the panel in place without moving focus — so the result region is
          live. `polite` rather than `alert`: the user pressed the button
          and is waiting for exactly this, so it need not interrupt. */}
      <Card
        aria-live="polite"
        aria-busy={verify.isPending}
        className="p-8 flex flex-col items-center text-center gap-4"
      >
        {!verify.data && !verify.isPending && (
          <>
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-raised text-tertiary">
              <ShieldCheck className="h-6 w-6" strokeWidth={1.75} />
            </div>
            <p className="text-sm text-secondary max-w-sm">
              Nothing has been checked yet this session. Running the check reads every event — it does not modify
              anything.
            </p>
          </>
        )}

        {verify.isPending && (
          <>
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-raised text-tertiary animate-pulse-live">
              <ShieldCheck className="h-6 w-6" strokeWidth={1.75} />
            </div>
            <p className="text-sm text-secondary">Verifying…</p>
          </>
        )}

        {verify.data && (
          <>
            <div
              className={`flex h-14 w-14 items-center justify-center rounded-xl ${
                verify.data.ok ? "bg-success-bg text-success" : "bg-danger-bg text-danger"
              }`}
            >
              {verify.data.ok ? <ShieldCheck className="h-6 w-6" strokeWidth={1.75} /> : <ShieldAlert className="h-6 w-6" strokeWidth={1.75} />}
            </div>
            {verify.data.ok ? (
              <p className="text-sm text-primary">
                Chain intact — <span className="font-mono">{verify.data.checked}</span> events verified, no tampering
                detected.
              </p>
            ) : (
              <p className="text-sm text-danger">
                Break detected at sequence{" "}
                <span className="font-mono">{verify.data.first_break_sequence_number}</span> — checked{" "}
                <span className="font-mono">{verify.data.checked}</span> events before the break.
              </p>
            )}
          </>
        )}

        {errorMessage && <p className="text-xs text-danger">{errorMessage}</p>}

        {canVerify ? (
          <Button variant="primary" size="sm" disabled={verify.isPending} onClick={() => verify.mutate()}>
            {verify.data ? "Run again" : "Run Integrity Check"}
          </Button>
        ) : (
          <p className="text-xs text-tertiary">Running this check requires the Auditor or Platform Administrator role.</p>
        )}
      </Card>
    </div>
  );
}
