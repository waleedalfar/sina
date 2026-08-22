"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Boxes, ClipboardCheck, ClipboardList, ShieldCheck, Inbox, ArrowRight } from "lucide-react";
import { StatTile } from "@/components/ui/StatTile";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { Skeleton } from "@/components/ui/Skeleton";
import { useGovernanceSummary, useMyApprovalQueue, useRecentAuditEvents } from "@/lib/hooks/useDashboard";
import { useMe } from "@/lib/hooks/useMe";
import { hasRoleKind } from "@/lib/auth/roles";
import { lifecycleTone, severityTone, LIFECYCLE_LABEL } from "@/lib/status";
import type { LifecycleState } from "@/types/api";

export default function DashboardPage() {
  const { data: me } = useMe();
  const { data: summary, isLoading: summaryLoading } = useGovernanceSummary();
  const { data: queue, isLoading: queueLoading } = useMyApprovalQueue();
  const canReadAudit = !!me && (hasRoleKind(me.roles, "admin") || hasRoleKind(me.roles, "signoff") || hasRoleKind(me.roles, "readonly"));
  const { data: recentEvents } = useRecentAuditEvents(8);

  const totalApplications = summary ? Object.values(summary.applications_by_state).reduce((a, b) => a + b, 0) : 0;
  const inReview = summary?.applications_by_state["governance_review"] ?? 0;
  const inProduction = summary?.applications_by_state["production"] ?? 0;
  const modelsApproved = summary?.model_versions_by_approval_status["approved"] ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-primary">
          Welcome back{me?.display_name ? `, ${me.display_name.split(" ")[0]}` : ""}
        </h1>
        <p className="text-sm text-secondary mt-0.5">Here&apos;s what&apos;s happening across your AI systems right now.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[92px]" />)
        ) : (
          <>
            <StatTile index={0} label="Applications" value={totalApplications} icon={ClipboardCheck} accent="gradient" />
            <StatTile index={1} label="In Governance Review" value={inReview} icon={ClipboardList} hint="awaiting sign-off" />
            <StatTile index={2} label="In Production" value={inProduction} icon={Boxes} />
            <StatTile index={3} label="Model Versions Approved" value={modelsApproved} icon={ShieldCheck} />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>My Approval Queue</CardTitle>
            {queue && queue.length > 0 && <StatusPill tone="warning" label={`${queue.length} pending`} />}
          </CardHeader>
          <CardContent className="p-0">
            {queueLoading ? (
              <div className="space-y-2 p-5">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
            ) : !queue || queue.length === 0 ? (
              <EmptyState icon={Inbox} message="Nothing waiting on your sign-off right now." />
            ) : (
              <ul className="divide-y divide-[var(--color-border-hairline)]">
                {queue.map((item, i) => (
                  <motion.li
                    key={`${item.resource_id}-${item.category}`}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, delay: i * 0.03 }}
                  >
                    <Link
                      href={item.resource_type === "application" ? `/applications/${item.resource_id}` : `/models`}
                      className="flex items-center justify-between px-5 py-3 hover:bg-raised transition-colors group"
                    >
                      <div>
                        <p className="text-sm font-medium text-primary">{item.resource_name}</p>
                        <p className="text-xs text-tertiary capitalize">
                          {item.category.replace("_", " ")} sign-off · {item.resource_type.replace("_", " ")}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-tertiary group-hover:text-cyan group-hover:translate-x-0.5 transition-all" />
                    </Link>
                  </motion.li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Applications by State</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {summaryLoading ? (
              <Skeleton className="h-40" />
            ) : (
              Object.entries(summary?.applications_by_state ?? {})
                .filter(([, count]) => count > 0)
                .map(([state, count]) => (
                  <div key={state} className="flex items-center justify-between">
                    <StatusPill tone={lifecycleTone(state as LifecycleState)} label={LIFECYCLE_LABEL[state as LifecycleState] ?? state} />
                    <span className="text-sm font-mono font-medium text-primary">{count}</span>
                  </div>
                ))
            )}
          </CardContent>
        </Card>
      </div>

      {canReadAudit && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <Link href="/audit" className="text-xs text-cyan hover:underline flex items-center gap-1">
              View audit log <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {!recentEvents ? (
              <div className="space-y-2 p-5">
                <Skeleton className="h-8" />
                <Skeleton className="h-8" />
                <Skeleton className="h-8" />
              </div>
            ) : recentEvents.length === 0 ? (
              <EmptyState icon={Inbox} message="No audit activity yet." />
            ) : (
              <ul className="divide-y divide-[var(--color-border-hairline)]">
                {recentEvents.map((event) => (
                  <li key={event.id} className="flex items-center justify-between px-5 py-2.5">
                    <div className="flex items-center gap-3">
                      <StatusPill tone={severityTone(event.severity)} label={event.severity.replace("_", " ")} />
                      <span className="text-sm text-primary font-mono">{event.event_type}</span>
                    </div>
                    <span className="text-xs text-tertiary">{new Date(event.occurred_at).toLocaleTimeString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function EmptyState({ icon: Icon, message }: { icon: typeof Inbox; message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <Icon className="h-6 w-6 text-tertiary" strokeWidth={1.5} />
      <p className="text-sm text-tertiary">{message}</p>
    </div>
  );
}
