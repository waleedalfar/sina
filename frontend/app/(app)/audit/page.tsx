"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ScrollText, ShieldCheck, Lock } from "lucide-react";
import { useAuditEvents } from "@/lib/hooks/useAudit";
import { useMe } from "@/lib/hooks/useMe";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { Skeleton } from "@/components/ui/Skeleton";
import { severityTone, SEVERITY_LABEL } from "@/lib/status";
import { canReadAudit } from "@/lib/auth/roles";
import type { Severity } from "@/types/api";

const PAGE_SIZE = 50;

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
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96" />
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
        <p className="max-w-md text-sm text-secondary">
          The audit log is visible to admin, sign-off, and read-only roles only.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-primary">Audit Log</h1>
          <p className="text-sm text-secondary mt-0.5">Every consequential action on the platform, append-only.</p>
        </div>
        <Link href="/audit/integrity">
          <Button variant="secondary" size="sm">
            <ShieldCheck className="h-3.5 w-3.5" /> Verify Integrity
          </Button>
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={severity}
          onChange={(e) => {
            setSeverity(e.target.value as Severity | "");
            setOffset(0);
          }}
          className="rounded-lg border border-hairline bg-raised px-3 py-1.5 text-xs text-primary outline-none focus:border-cyan"
        >
          <option value="">All severities</option>
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="security_critical">Security Critical</option>
        </select>
        <input
          value={eventType}
          onChange={(e) => {
            setEventType(e.target.value);
            setOffset(0);
          }}
          placeholder="event_type…"
          className="rounded-lg border border-hairline bg-raised px-3 py-1.5 text-xs text-primary outline-none focus:border-cyan placeholder:text-tertiary"
        />
        <input
          value={resourceType}
          onChange={(e) => {
            setResourceType(e.target.value);
            setOffset(0);
          }}
          placeholder="resource_type…"
          className="rounded-lg border border-hairline bg-raised px-3 py-1.5 text-xs text-primary outline-none focus:border-cyan placeholder:text-tertiary"
        />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs font-medium uppercase tracking-wide text-tertiary">
                <th className="px-5 py-3">Seq</th>
                <th className="px-5 py-3">Event</th>
                <th className="px-5 py-3">Severity</th>
                <th className="px-5 py-3">Occurred</th>
                <th className="px-5 py-3">Actor</th>
                <th className="px-5 py-3">Resource</th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-hairline last:border-0">
                    <td className="px-5 py-4" colSpan={6}>
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))}
              {!isLoading && data?.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <ScrollText className="h-6 w-6 text-tertiary" strokeWidth={1.5} />
                      <p className="text-sm text-tertiary">No matching audit events.</p>
                    </div>
                  </td>
                </tr>
              )}
              {data?.map((event, i) => (
                <motion.tr
                  key={event.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2, delay: i * 0.02 }}
                  className="border-b border-hairline last:border-0 hover:bg-raised transition-colors"
                >
                  <td className="px-5 py-3 font-mono text-xs text-tertiary">{event.sequence_number}</td>
                  <td className="px-5 py-3">
                    <Link href={`/audit/${event.id}`} className="text-primary font-medium hover:underline">
                      {event.event_type}
                    </Link>
                  </td>
                  <td className="px-5 py-3">
                    <StatusPill tone={severityTone(event.severity)} label={SEVERITY_LABEL[event.severity]} />
                  </td>
                  <td className="px-5 py-3 text-xs text-secondary">{new Date(event.occurred_at).toLocaleString()}</td>
                  <td className="px-5 py-3 font-mono text-xs text-secondary truncate max-w-[160px]">
                    {event.actor_identity_id ?? "system"}
                  </td>
                  <td className="px-5 py-3 text-xs text-secondary">
                    {event.resource_type ? `${event.resource_type}:${event.resource_id?.slice(0, 8)}` : "—"}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
          Previous
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={isFetching || (data?.length ?? 0) < PAGE_SIZE}
          onClick={() => setOffset(offset + PAGE_SIZE)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
