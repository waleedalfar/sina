"use client";

import { useState } from "react";
import Link from "next/link";
import { ScrollText, ShieldCheck } from "lucide-react";
import { useAuditEvents } from "@/lib/hooks/useAudit";
import { useMe } from "@/lib/hooks/useMe";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, RestrictedState } from "@/components/ui/ResourceState";
import { TableHead, TableNote, TableRow, Cell } from "@/components/ui/Table";
import { severityTone, SEVERITY_LABEL, TONE_MARK, TONE_TINT, TONE_TEXT } from "@/lib/status";
import { canReadAudit } from "@/lib/auth/roles";
import type { Severity } from "@/types/api";

const PAGE_SIZE = 50;
const COLS = "92px minmax(0,1.3fr) 140px 148px 152px minmax(0,1fr)";

export default function AuditPage() {
  const { data: me, isLoading: meLoading } = useMe();
  const [severity, setSeverity] = useState<Severity | "">("");
  const [eventType, setEventType] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [offset, setOffset] = useState(0);

  const { data, isLoading, isFetching } = useAuditEvents({
    severity: severity || undefined,
    event_type: eventType || undefined,
    resource_type: resourceType || undefined,
    limit: PAGE_SIZE,
    offset,
  });

  if (meLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!me || !canReadAudit(me.roles)) {
    return <RestrictedState what="Reading the audit log requires an admin, sign-off or read-only role." />;
  }

  return (
    <>
      <PageHeader
        title="Audit Log"
        description="Every consequential action on the platform, append-only."
        actions={
          <Link href="/audit/integrity">
            <Button variant="secondary">
              <ShieldCheck className="h-3.5 w-3.5" /> Verify Integrity
            </Button>
          </Link>
        }
      />

      {/* The filter bar is a panel, not a floating row of controls: these
          are the query you are running against the register, and they read
          as a form you filled in. */}
      <div className="flex flex-wrap items-end gap-3 border border-hairline bg-raised p-4">
        <label className="flex flex-col gap-1.5">
          <span className="label-mono">Severity</span>
          <select
            value={severity}
            onChange={(e) => {
              setSeverity(e.target.value as Severity | "");
              setOffset(0);
            }}
            className="field field-mono min-w-40"
          >
            <option value="">All severities</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="security_critical">Security critical</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-mono">event_type</span>
          <input
            value={eventType}
            onChange={(e) => {
              setEventType(e.target.value);
              setOffset(0);
            }}
            placeholder="policy.checklist.*"
            className="field field-mono min-w-48"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-mono">resource_type</span>
          <input
            value={resourceType}
            onChange={(e) => {
              setResourceType(e.target.value);
              setOffset(0);
            }}
            placeholder="application"
            className="field field-mono min-w-40"
          />
        </label>
        <div className="ml-auto font-mono text-[10px] text-secondary">
          {data ? `SHOWING ${offset + 1}–${offset + data.length}` : "…"}
        </div>
      </div>

      <Card>
        <TableHead cols={COLS}>
          <div>Seq</div>
          <div>Event</div>
          <div>Severity</div>
          <div>Occurred</div>
          <div>Actor</div>
          <div>Resource</div>
        </TableHead>

        {isLoading &&
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="border-b border-hairline px-4 py-3.5 last:border-b-0">
              <Skeleton className="h-3.5 w-full" />
            </div>
          ))}

        {!isLoading && data?.length === 0 && (
          <div className="p-4">
            <EmptyState
              icon={ScrollText}
              title="No matching audit events"
              description="Nothing in the chain matches these filters. Clear them to see the whole register."
            />
          </div>
        )}

        {data?.map((event) => {
          const tone = severityTone(event.severity);
          const critical = event.severity === "security_critical";
          return (
            <TableRow
              key={event.id}
              cols={COLS}
              mark={TONE_MARK[tone]}
              tint={TONE_TINT[tone]}
              href={`/audit/${event.id}`}
              className="font-mono text-[11px]"
            >
              <Cell className="text-secondary tabular-nums">{event.sequence_number}</Cell>
              <Cell label="Event" className={`truncate pr-3 ${critical ? "font-semibold text-primary" : "text-primary/85"}`}>
                {event.event_type}
              </Cell>
              {/* Severity is redlined rather than pilled in the table: a
                  pill per row would put 50 coloured boxes on screen and
                  bury the three that matter. */}
              <Cell label="Severity">
                <span
                  className={`text-[9px] tracking-[0.12em] uppercase ${TONE_TEXT[tone]} ${
                    critical ? "underline decoration-2 underline-offset-[3px]" : ""
                  }`}
                >
                  {SEVERITY_LABEL[event.severity]}
                </span>
              </Cell>
              <Cell label="Occurred" className="text-secondary">
                {new Date(event.occurred_at).toLocaleString(undefined, {
                  month: "short",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </Cell>
              <Cell label="Actor" className="truncate text-primary/75">
                {event.actor_identity_id ?? "system"}
              </Cell>
              <Cell label="Resource" className="truncate text-secondary">
                {event.resource_type ? `${event.resource_type}/${event.resource_id?.slice(0, 8)}` : "—"}
              </Cell>
            </TableRow>
          );
        })}

        {!isLoading && (data?.length ?? 0) > 0 && (
          <TableNote>
            Redlined rows denote security-critical entries. Entries cannot be edited or removed; corrections are
            appended.
          </TableNote>
        )}
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="ghost" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
          Previous
        </Button>
        <Button
          variant="ghost"
          disabled={isFetching || (data?.length ?? 0) < PAGE_SIZE}
          onClick={() => setOffset(offset + PAGE_SIZE)}
        >
          Next
        </Button>
      </div>
    </>
  );
}
