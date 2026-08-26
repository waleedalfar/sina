"use client";

import Link from "next/link";
import { Boxes, ClipboardCheck, ClipboardList, ShieldCheck, Inbox, ArrowRight } from "lucide-react";
import { StatTile } from "@/components/ui/StatTile";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusPill } from "@/components/ui/StatusPill";
import { Skeleton } from "@/components/ui/Skeleton";
import { TableNote } from "@/components/ui/Table";
import { useGovernanceSummary, useMyApprovalQueue, useRecentAuditEvents } from "@/lib/hooks/useDashboard";
import { useMe } from "@/lib/hooks/useMe";
import { hasRoleKind } from "@/lib/auth/roles";
import { lifecycleTone, severityTone, LIFECYCLE_LABEL, SEVERITY_LABEL, TONE_MARK, TONE_TEXT } from "@/lib/status";
import type { LifecycleState } from "@/types/api";

export default function DashboardPage() {
  const { data: me } = useMe();
  const { data: summary, isLoading: summaryLoading } = useGovernanceSummary();
  const { data: queue, isLoading: queueLoading } = useMyApprovalQueue();
  const isAdmin = !!me && hasRoleKind(me.roles, "admin");
  const isSignoff = !!me && hasRoleKind(me.roles, "signoff");
  const canReadAudit = !!me && (isAdmin || isSignoff || hasRoleKind(me.roles, "readonly"));
  const { data: recentEvents } = useRecentAuditEvents(8);

  const totalApplications = summary ? Object.values(summary.applications_by_state).reduce((a, b) => a + b, 0) : 0;
  const inReview = summary?.applications_by_state["governance_review"] ?? 0;
  const inProduction = summary?.applications_by_state["production"] ?? 0;
  const modelsApproved = summary?.model_versions_by_approval_status["approved"] ?? 0;

  // Which register you are reading is a fact about your roles, and saying
  // so out loud is the point: an auditor should never wonder whether they
  // are seeing everything or only their slice.
  const roleLabel = isAdmin ? "Administrator" : isSignoff ? "Reviewer" : canReadAudit ? "Auditor" : "Operator";
  const queueTitle = isSignoff ? "Your sign-off queue" : "Requires your action";
  const queueFoot = isSignoff
    ? "You see only applications where a category you hold is required."
    : isAdmin
      ? "Everything tenant-wide that is blocked on a person."
      : "Items assigned to you.";

  return (
    <>
      <PageHeader
        title="Control Plane Status"
        description={
          <>
            Single tenant · signed in as{" "}
            <span className="font-mono text-primary">{me?.display_name ?? me?.email ?? "…"}</span>
          </>
        }
        actions={
          <span className="border border-strong px-4 py-2.5 font-mono text-[10px] tracking-[0.16em] text-warning uppercase">
            {roleLabel} view
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {summaryLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[124px]" />)
        ) : (
          <>
            <StatTile label="Applications" value={pad(totalApplications)} icon={ClipboardCheck} />
            <StatTile
              label="In Governance Review"
              value={pad(inReview)}
              icon={ClipboardList}
              tone={inReview > 0 ? "info" : "neutral"}
              hint="awaiting sign-off"
            />
            <StatTile label="In Production" value={pad(inProduction)} icon={Boxes} tone="success" />
            <StatTile label="Model Versions Approved" value={pad(modelsApproved)} icon={ShieldCheck} tone="success" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{queueTitle}</CardTitle>
            <span className="font-mono text-[9.5px] tracking-[0.12em] text-warning uppercase">{roleLabel} view</span>
          </CardHeader>
          {queueLoading ? (
            <div className="flex flex-col gap-2 p-4">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : !queue || queue.length === 0 ? (
            <PanelEmpty message="Nothing is waiting on your sign-off right now." />
          ) : (
            <ul>
              {queue.map((item) => (
                <li key={`${item.resource_id}-${item.category}`}>
                  <Link
                    href={item.resource_type === "application" ? `/applications/${item.resource_id}` : `/models`}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3.5 border-b border-l-[3px] border-hairline border-l-warning px-4 py-3 transition-colors hover:bg-raised"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-medium text-primary">{item.resource_name}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-secondary">
                        {item.category.replace(/_/g, " ")} sign-off · {item.resource_type.replace(/_/g, " ")}
                      </p>
                    </div>
                    <span className="border border-warning px-2.5 py-1.5 font-mono text-[9px] tracking-[0.16em] text-warning uppercase">
                      Sign off
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <TableNote>{queueFoot}</TableNote>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Applications by state</CardTitle>
          </CardHeader>
          {summaryLoading ? (
            <div className="p-4">
              <Skeleton className="h-40" />
            </div>
          ) : (
            <ul>
              {Object.entries(summary?.applications_by_state ?? {})
                .filter(([, count]) => count > 0)
                .map(([state, count]) => {
                  const tone = lifecycleTone(state as LifecycleState);
                  return (
                    <li
                      key={state}
                      className="flex items-center justify-between gap-3 border-b border-l-[3px] border-hairline px-4 py-2.5 last:border-b-0"
                      style={{ borderLeftColor: TONE_MARK[tone] }}
                    >
                      <StatusPill tone={tone} label={LIFECYCLE_LABEL[state as LifecycleState] ?? state} />
                      <span className="font-mono text-[13px] font-semibold tabular-nums">{pad(count)}</span>
                    </li>
                  );
                })}
            </ul>
          )}
        </Card>
      </div>

      {canReadAudit && (
        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <Link
              href="/audit"
              className="flex items-center gap-1 font-mono text-[9.5px] tracking-[0.14em] text-accent uppercase hover:underline"
            >
              View audit log <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          {!recentEvents ? (
            <div className="flex flex-col gap-2 p-4">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          ) : recentEvents.length === 0 ? (
            <PanelEmpty message="No audit activity yet." />
          ) : (
            <ul>
              {recentEvents.map((event) => {
                const tone = severityTone(event.severity);
                return (
                  <li
                    key={event.id}
                    className="grid grid-cols-[52px_minmax(0,1fr)] gap-3 border-b border-hairline px-4 py-2.5 last:border-b-0"
                  >
                    <span className="font-mono text-[10px] text-secondary">
                      {new Date(event.occurred_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <div className="min-w-0">
                      <div className={`truncate font-mono text-[11px] ${TONE_TEXT[tone]}`}>{event.event_type}</div>
                      <div className="mt-0.5 font-mono text-[9px] tracking-[0.14em] text-secondary uppercase">
                        {SEVERITY_LABEL[event.severity]} · {event.resource_type}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}

/** Counts are set as two-digit mono figures so a row of tiles reads as a
 * gauge panel rather than as prose. */
function pad(value: number) {
  return value < 10 ? `0${value}` : String(value);
}

function PanelEmpty({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-9 text-center">
      <Inbox className="h-5 w-5 text-tertiary" strokeWidth={1.5} aria-hidden="true" />
      <p className="text-[12.5px] text-secondary">{message}</p>
    </div>
  );
}
