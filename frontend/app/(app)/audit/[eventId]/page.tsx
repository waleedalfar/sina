"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useAuditEvent } from "@/lib/hooks/useAudit";
import { useMe } from "@/lib/hooks/useMe";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusPill } from "@/components/ui/StatusPill";
import { Skeleton } from "@/components/ui/Skeleton";
import { DataRow } from "@/components/ui/DataList";
import { RestrictedState } from "@/components/ui/ResourceState";
import { severityTone, SEVERITY_LABEL } from "@/lib/status";
import { canReadAudit } from "@/lib/auth/roles";

export default function AuditEventDetailPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  const { data: me, isLoading: meLoading } = useMe();
  const { data: event, isLoading } = useAuditEvent(eventId);

  if (meLoading || isLoading || !event) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!me || !canReadAudit(me.roles)) {
    return <RestrictedState what="Reading audit events requires an admin, sign-off or read-only role." />;
  }

  return (
    <div className="flex max-w-4xl flex-col gap-4.5">
      <Link
        href="/audit"
        className="inline-flex items-center gap-1.5 font-mono text-[9.5px] tracking-[0.14em] text-secondary uppercase hover:text-primary"
      >
        <ArrowLeft className="h-3 w-3" /> Back to audit log
      </Link>

      <PageHeader
        eyebrow={`Audit / Event ${event.sequence_number}`}
        title={<span className="font-mono text-2xl">{event.event_type}</span>}
        aside={
          <div className="mt-2.5 flex flex-wrap gap-2.5">
            <StatusPill tone={severityTone(event.severity)} label={SEVERITY_LABEL[event.severity]} />
            <span className="border border-strong px-2.5 py-1 font-mono text-[10px] tracking-[0.18em] text-secondary uppercase">
              Append-only
            </span>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Record</CardTitle>
        </CardHeader>
        <DataRow label="Sequence">{event.sequence_number}</DataRow>
        <DataRow label="Occurred at">{new Date(event.occurred_at).toISOString().replace("T", " ").replace("Z", " UTC")}</DataRow>
        <DataRow label="Actor">{event.actor_identity_id ?? "system"}</DataRow>
        <DataRow label="Resource type" tone="warning">
          {event.resource_type ?? "—"}
        </DataRow>
        <DataRow label="Resource id">{event.resource_id ?? "—"}</DataRow>
        <DataRow label="Event id">{event.id}</DataRow>
        <DataRow label="Severity" tone={event.severity === "security_critical" ? "danger" : "default"}>
          {event.severity}
        </DataRow>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payload</CardTitle>
        </CardHeader>
        <pre className="overflow-x-auto bg-input p-4 font-mono text-[11px] leading-[1.75] text-primary/80">
          {JSON.stringify(event.payload, null, 2)}
        </pre>
      </Card>

      {/* The hash chain block. Drawn as two linked records rather than two
          labelled strings, because the link is the whole point: this
          event's hash is computed over the previous one, so altering any
          earlier record breaks every hash after it. */}
      <section className="border border-accent">
        <div className="border-b border-accent/40 bg-accent-bg px-4 py-3 font-mono text-[10px] tracking-[0.22em] text-accent uppercase">
          Hash chain block
        </div>
        <div className="flex flex-col p-4">
          <div className="border border-hairline bg-raised px-3.5 py-3">
            <div className="label-mono">
              {event.prev_event_hash ? `Previous event ${event.sequence_number - 1} · hash` : "Chain start"}
            </div>
            <div className="mt-1.5 font-mono text-[11.5px] break-all text-secondary">
              {event.prev_event_hash ?? "— no predecessor"}
            </div>
          </div>
          <div aria-hidden="true" className="ml-5.5 h-6 w-px bg-accent" />
          <div className="border border-accent bg-accent-bg px-3.5 py-3">
            <div className="font-mono text-[9px] tracking-[0.18em] text-accent uppercase">
              This event {event.sequence_number} · hash
            </div>
            <div className="mt-1.5 font-mono text-[11.5px] break-all text-primary">{event.event_hash}</div>
          </div>
          <p className="mt-3 font-mono text-[9.5px] leading-relaxed text-secondary">
            The hash is computed in the database over the previous hash and this record. Altering any earlier record
            breaks every hash after it — which is what{" "}
            <Link href="/audit/integrity" className="text-accent underline">
              the integrity check
            </Link>{" "}
            walks.
          </p>
        </div>
      </section>
    </div>
  );
}
