"use client";

import { useSecurityEvents } from "@/lib/hooks/useAudit";
import { useMe } from "@/lib/hooks/useMe";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { RestrictedState } from "@/components/ui/ResourceState";
import { canReadAudit } from "@/lib/auth/roles";
import type { SecurityEventsOut } from "@/types/api";

/*
  MasterPrompt §26's five columns, kept as five columns rather than five
  separate cards: they are one instrument panel read across, and the point
  is the relative height of the counts. Each column caps in the colour of
  what it counts — PHI events are teal because redaction working is not an
  incident, everything else is brick.
*/
const COLUMNS: { key: keyof SecurityEventsOut; label: string; cap: string; count: string }[] = [
  { key: "policy_violations", label: "Policy Violations", cap: "border-t-danger", count: "text-danger" },
  { key: "phi_events", label: "PHI Events", cap: "border-t-accent", count: "text-accent" },
  { key: "failed_authentication", label: "Failed Authentication", cap: "border-t-warning", count: "text-warning" },
  { key: "suspicious_prompts", label: "Suspicious Prompts", cap: "border-t-danger", count: "text-danger" },
  { key: "security_findings", label: "Security Findings", cap: "border-t-danger", count: "text-danger" },
];

export default function SecurityPage() {
  const { data: me, isLoading: meLoading } = useMe();
  const { data, isLoading } = useSecurityEvents();

  if (meLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!me || !canReadAudit(me.roles)) {
    return <RestrictedState what="The security dashboard requires an admin, sign-off or read-only role." />;
  }

  return (
    <>
      <PageHeader
        title="Security"
        description="Sourced entirely from the audit event stream — there is no separate SIEM in MVP 0.1."
        actions={
          <span className="font-mono text-[10px] tracking-[0.12em] text-secondary uppercase">
            Across all applications and identities
          </span>
        }
      />

      <div className="grid grid-cols-1 border border-hairline sm:grid-cols-2 xl:grid-cols-5">
        {COLUMNS.map((col) => {
          const events = data?.[col.key] as Record<string, unknown>[] | undefined;
          return (
            <section
              key={col.key}
              className="flex min-w-0 flex-col border-b border-hairline last:border-b-0 xl:border-r xl:border-b-0 xl:last:border-r-0"
            >
              <div className={`border-t-[3px] border-b border-hairline bg-raised px-3 py-3.5 ${col.cap}`}>
                <div className="label-mono">{col.label}</div>
                <div className={`mt-2 font-mono text-3xl leading-none font-semibold tabular-nums ${col.count}`}>
                  {isLoading ? "—" : pad(events?.length ?? 0)}
                </div>
                <div className="mt-1.5 font-mono text-[9px] text-secondary">
                  {isLoading ? "loading" : events?.length === 0 ? "nothing recorded" : "most recent first"}
                </div>
              </div>

              <ul className="max-h-[480px] overflow-y-auto">
                {isLoading &&
                  Array.from({ length: 3 }).map((_, i) => (
                    <li key={i} className="border-b border-hairline px-3 py-3">
                      <Skeleton className="h-3.5 w-full" />
                    </li>
                  ))}
                {!isLoading && events?.length === 0 && (
                  <li className="px-3 py-6 text-center font-mono text-[9.5px] tracking-[0.14em] text-secondary uppercase">
                    None
                  </li>
                )}
                {events?.map((event, i) => (
                  <SecurityEventRow key={i} event={event} />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}

function pad(value: number) {
  return value < 10 ? `0${value}` : String(value);
}

function SecurityEventRow({ event }: { event: Record<string, unknown> }) {
  const eventType = typeof event.event_type === "string" ? event.event_type : null;
  const occurredAt = typeof event.occurred_at === "string" ? event.occurred_at : null;
  const actor = typeof event.actor_identity_id === "string" ? event.actor_identity_id : null;

  return (
    <li className="border-b border-hairline px-3 py-2.5 last:border-b-0">
      {occurredAt && (
        <p className="font-mono text-[9.5px] text-secondary">
          {new Date(occurredAt).toLocaleString(undefined, {
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      )}
      {eventType && <p className="mt-0.5 font-mono text-[11px] break-words text-primary/85">{eventType}</p>}
      {actor && <p className="mt-0.5 truncate font-mono text-[9.5px] text-secondary">{actor}</p>}
    </li>
  );
}
