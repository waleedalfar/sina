"use client";

import { Lock } from "lucide-react";
import { useSecurityEvents } from "@/lib/hooks/useAudit";
import { useMe } from "@/lib/hooks/useMe";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { canReadAudit } from "@/lib/auth/roles";
import type { SecurityEventsOut } from "@/types/api";

const COLUMNS: { key: keyof SecurityEventsOut; label: string }[] = [
  { key: "policy_violations", label: "Policy Violations" },
  { key: "phi_events", label: "PHI Events" },
  { key: "failed_authentication", label: "Failed Authentication" },
  { key: "suspicious_prompts", label: "Suspicious Prompts" },
  { key: "security_findings", label: "Security Findings" },
];

export default function SecurityPage() {
  const { data: me, isLoading: meLoading } = useMe();
  const { data, isLoading } = useSecurityEvents();

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
          The security dashboard is visible to admin, sign-off, and read-only roles only.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-primary">Security</h1>
        <p className="text-sm text-secondary mt-0.5">
          §26&apos;s five-column security view, sourced entirely from the audit event stream — no separate SIEM in
          MVP 0.1.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {COLUMNS.map((col) => {
          const events = data?.[col.key] as Record<string, unknown>[] | undefined;
          return (
            <Card key={col.key}>
              <CardHeader>
                <CardTitle>{col.label}</CardTitle>
                {events && <span className="text-xs font-mono text-tertiary">{events.length}</span>}
              </CardHeader>
              <CardContent className="p-0">
                <ul className="max-h-[480px] overflow-y-auto divide-y divide-[var(--color-border-hairline)]">
                  {isLoading &&
                    Array.from({ length: 3 }).map((_, i) => (
                      <li key={i} className="px-4 py-3">
                        <Skeleton className="h-4 w-full" />
                      </li>
                    ))}
                  {!isLoading && events?.length === 0 && (
                    <li className="px-4 py-8 text-center text-xs text-tertiary">None</li>
                  )}
                  {events?.map((event, i) => (
                    <SecurityEventRow key={i} event={event} />
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function SecurityEventRow({ event }: { event: Record<string, unknown> }) {
  const eventType = typeof event.event_type === "string" ? event.event_type : null;
  const occurredAt = typeof event.occurred_at === "string" ? event.occurred_at : null;
  const actor = typeof event.actor_identity_id === "string" ? event.actor_identity_id : null;

  return (
    <li className="px-4 py-3 space-y-1">
      {eventType && <p className="text-xs font-medium text-primary">{eventType}</p>}
      {occurredAt && <p className="text-[11px] text-tertiary">{new Date(occurredAt).toLocaleString()}</p>}
      {actor && <p className="text-[11px] font-mono text-secondary truncate">{actor}</p>}
    </li>
  );
}
