"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useVerifyIntegrity } from "@/lib/hooks/useAudit";
import { useMe } from "@/lib/hooks/useMe";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { RestrictedState } from "@/components/ui/ResourceState";
import { hasAnyRole, VERIFY_INTEGRITY_ROLES, canReadAudit } from "@/lib/auth/roles";
import { ApiError } from "@/lib/api/client";

/*
  One panel with four states, drawn as an instrument reading rather than a
  toast: a glyph, a headline, a bar, and the action that state affords. The
  broken-chain state is the only place in the product that fills a button
  brick red by default — at that point escalating is the only sane next
  move, and the screen should say so.
*/
type Reading = {
  state: string;
  glyph: string;
  title: string;
  body: string;
  bar: string;
  accent: string;
  border: string;
};

export default function AuditIntegrityPage() {
  const { data: me, isLoading: meLoading } = useMe();
  const verify = useVerifyIntegrity();

  if (meLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!me || !canReadAudit(me.roles)) {
    return <RestrictedState what="The integrity check requires an admin, sign-off or read-only role." />;
  }

  const canVerify = hasAnyRole(me.roles, VERIFY_INTEGRITY_ROLES);
  const errorMessage =
    verify.error instanceof ApiError ? verify.error.detail : verify.error instanceof Error ? verify.error.message : null;

  let reading: Reading;
  if (verify.isPending) {
    reading = {
      state: "Running",
      glyph: "◐",
      title: "Recomputing hash chain",
      body: "Every event is re-hashed from the chain start. The register stays readable and writable while this runs.",
      bar: "65%",
      accent: "text-accent",
      border: "border-accent",
    };
  } else if (verify.data?.ok) {
    reading = {
      state: "Verified",
      glyph: "✓",
      title: `Chain intact — ${verify.data.checked.toLocaleString()} events`,
      body: "Every hash matches its predecessor from the chain start to the head. No tampering detected.",
      bar: "100%",
      accent: "text-success",
      border: "border-success",
    };
  } else if (verify.data) {
    reading = {
      state: "Broken chain",
      glyph: "✕",
      title: `Hash mismatch at sequence ${verify.data.first_break_sequence_number}`,
      body: `The stored hash does not match the recomputed value. Everything after this sequence is unverifiable. ${verify.data.checked.toLocaleString()} events were checked before the break. Escalate to the security administrator immediately.`,
      bar: "94%",
      accent: "text-danger",
      border: "border-danger",
    };
  } else {
    reading = {
      state: "Idle",
      glyph: "○",
      title: "Chain not verified this session",
      body: "Running the check recomputes every hash from the chain start. It reads only — nothing is modified.",
      bar: "0%",
      accent: "text-warning",
      border: "border-warning",
    };
  }

  const broken = !!verify.data && !verify.data.ok;

  return (
    <div className="flex max-w-3xl flex-col gap-4.5">
      <Link
        href="/audit"
        className="inline-flex items-center gap-1.5 font-mono text-[9.5px] tracking-[0.14em] text-secondary uppercase hover:text-primary"
      >
        <ArrowLeft className="h-3 w-3" /> Back to audit log
      </Link>

      <PageHeader
        eyebrow="Audit / Integrity"
        title="Hash Chain Integrity"
        description="Walks the full audit event chain and recomputes each event's hash — the same SQL function the insert trigger uses, called here rather than reimplemented, so this check can never drift from what actually protects the data."
      />

      {/* The whole purpose of this page is the verdict, and it replaces
          the panel in place without moving focus — so the result region is
          live. `polite` rather than `alert`: the user pressed the button
          and is waiting for exactly this, so it need not interrupt. */}
      <section
        aria-live="polite"
        aria-busy={verify.isPending}
        className={`flex flex-col gap-3.5 border border-l-[5px] bg-surface p-5 ${reading.border}`}
      >
        <div className="flex items-center justify-between gap-3.5">
          <div className={`font-mono text-[10px] tracking-[0.22em] uppercase ${reading.accent}`}>{reading.state}</div>
          {verify.data && (
            <div className="font-mono text-[9.5px] text-secondary">
              {verify.data.checked.toLocaleString()} events checked
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          <div
            aria-hidden="true"
            className={`grid h-13 w-13 shrink-0 place-items-center border-2 font-mono text-[17px] ${reading.border} ${reading.accent}`}
          >
            {reading.glyph}
          </div>
          <div className="min-w-0">
            <div className="text-base font-semibold">{reading.title}</div>
            <p className="mt-1 text-[13px] leading-relaxed text-secondary">{reading.body}</p>
          </div>
        </div>

        <div className="h-2 border border-hairline bg-raised">
          <div
            className={`h-full ${
              broken ? "bg-danger" : verify.data?.ok ? "bg-success" : verify.isPending ? "bg-accent" : "bg-transparent"
            }`}
            style={{ width: reading.bar }}
          />
        </div>

        {errorMessage && (
          <p className="border border-danger border-l-4 bg-danger-bg px-3.5 py-2.5 text-[12.5px] text-danger">
            {errorMessage}
          </p>
        )}

        {canVerify ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant={broken ? "danger" : "secondary"}
              disabled={verify.isPending}
              onClick={() => verify.mutate()}
            >
              {verify.isPending ? "Verifying…" : verify.data ? "Re-verify" : "Verify integrity"}
            </Button>
            {broken && (
              <Link href={`/audit?severity=security_critical`}>
                <Button variant="secondary">Inspect security events</Button>
              </Link>
            )}
          </div>
        ) : (
          <p className="font-mono text-[9.5px] text-secondary">
            Running this check requires the Auditor or Platform Administrator role.
          </p>
        )}
      </section>
    </div>
  );
}
