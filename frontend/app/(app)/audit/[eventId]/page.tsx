"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { useAuditEvent } from "@/lib/hooks/useAudit";
import { useMe } from "@/lib/hooks/useMe";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { Skeleton } from "@/components/ui/Skeleton";
import { severityTone, SEVERITY_LABEL } from "@/lib/status";
import { canReadAudit } from "@/lib/auth/roles";

export default function AuditEventDetailPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  const { data: me, isLoading: meLoading } = useMe();
  const { data: event, isLoading } = useAuditEvent(eventId);

  if (meLoading || isLoading || !event) {
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link href="/audit" className="inline-flex items-center gap-1.5 text-xs text-tertiary hover:text-secondary mb-2">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Audit Log
          </Link>
          <h1 className="text-lg font-semibold text-primary">{event.event_type}</h1>
        </div>
        <StatusPill tone={severityTone(event.severity)} label={SEVERITY_LABEL[event.severity]} />
      </div>

      <Card className="p-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 text-sm">
          <Detail label="Sequence" value={String(event.sequence_number)} />
          <Detail label="Occurred" value={new Date(event.occurred_at).toLocaleString()} />
          <Detail label="Actor" value={event.actor_identity_id ?? "system"} mono />
          <Detail label="Resource type" value={event.resource_type ?? "—"} />
          <Detail label="Resource ID" value={event.resource_id ?? "—"} mono />
          <Detail label="Event ID" value={event.id} mono />
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payload</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs text-secondary bg-raised rounded-lg px-4 py-3 overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(event.payload, null, 2)}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hash Chain</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Detail label="Previous event hash" value={event.prev_event_hash ?? "— (chain start)"} mono full />
          <Detail label="This event's hash" value={event.event_hash} mono full />
        </CardContent>
      </Card>
    </div>
  );
}

function Detail({ label, value, mono, full }: { label: string; value: string; mono?: boolean; full?: boolean }) {
  return (
    <div className={full ? "space-y-1" : "flex items-center justify-between gap-3"}>
      <span className="text-xs text-tertiary">{label}</span>
      <span className={`text-xs text-primary ${mono ? "font-mono" : ""} ${full ? "block break-all" : "text-right truncate max-w-[160px]"}`}>
        {value}
      </span>
    </div>
  );
}
