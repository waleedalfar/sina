"use client";

import { useState } from "react";
import Link from "next/link";
import { ClipboardCheck, Plus } from "lucide-react";
import { useDashboardApplications } from "@/lib/hooks/useDashboard";
import { useMe } from "@/lib/hooks/useMe";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusPill } from "@/components/ui/StatusPill";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/ResourceState";
import { TableHead, TableNote, TableRow, Cell } from "@/components/ui/Table";
import { lifecycleTone, LIFECYCLE_LABEL, LIFECYCLE_ORDER, riskTone, TONE_MARK, TONE_TINT } from "@/lib/status";
import { hasAnyRole, CREATE_APPLICATION_ROLES } from "@/lib/auth/roles";
import type { LifecycleState } from "@/types/api";

const COLS = "minmax(0,1fr) 220px 176px 148px 96px";

export default function ApplicationsPage() {
  const { data, isLoading } = useDashboardApplications();
  const { data: me } = useMe();
  const canCreate = me && hasAnyRole(me.roles, CREATE_APPLICATION_ROLES);
  const [stateFilter, setStateFilter] = useState<LifecycleState | "">("");

  // Filtered client-side, unlike the Audit log's server-side filters. The
  // dashboard endpoint returns every Application in one unpaginated call
  // already (the rows need the whole set), so a round-trip per filter
  // click would buy nothing — and having the full set locally is what
  // makes the per-state counts below possible. Revisit if this list ever
  // grows past the point where fetching it whole is reasonable.
  const counts = (data ?? []).reduce<Partial<Record<LifecycleState, number>>>((acc, app) => {
    acc[app.lifecycle_state] = (acc[app.lifecycle_state] ?? 0) + 1;
    return acc;
  }, {});
  const visible = stateFilter ? (data ?? []).filter((a) => a.lifecycle_state === stateFilter) : (data ?? []);

  return (
    <>
      <PageHeader
        title="Applications"
        description="Every AI Application registered on the platform and where it stands in governance."
        actions={
          canCreate ? (
            <Link href="/applications/new">
              <Button variant="primary">
                <Plus className="h-3.5 w-3.5" /> New Application
              </Button>
            </Link>
          ) : undefined
        }
      />

      {!isLoading && (data?.length ?? 0) > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip label="All" count={data?.length ?? 0} selected={stateFilter === ""} onClick={() => setStateFilter("")} />
          {LIFECYCLE_ORDER.filter((s) => counts[s]).map((s) => (
            <FilterChip
              key={s}
              label={LIFECYCLE_LABEL[s]}
              count={counts[s] ?? 0}
              tone={s}
              selected={stateFilter === s}
              onClick={() => setStateFilter(stateFilter === s ? "" : s)}
            />
          ))}
        </div>
      )}

      {isLoading && (
        <Card>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="border-b border-hairline px-4 py-4 last:border-b-0">
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </Card>
      )}

      {!isLoading && data?.length === 0 && (
        <EmptyState
          icon={ClipboardCheck}
          title="No applications registered yet"
          description="Registered applications appear here once someone completes the risk questionnaire."
          action={
            canCreate ? (
              <Link href="/applications/new">
                <Button variant="primary" size="sm">
                  <Plus className="h-3 w-3" /> Register application
                </Button>
              </Link>
            ) : undefined
          }
        />
      )}

      {!isLoading && (data?.length ?? 0) > 0 && (
        <Card>
          <TableHead cols={COLS}>
            <div>Application</div>
            <div>Model version</div>
            <div>Lifecycle</div>
            <div>Risk</div>
            <div>Sign-offs</div>
          </TableHead>

          {visible.map((app) => {
            const tone = lifecycleTone(app.lifecycle_state);
            return (
              <TableRow
                key={app.application_id}
                cols={COLS}
                mark={TONE_MARK[app.lifecycle_state === "suspended" ? "danger" : tone]}
                tint={app.lifecycle_state === "suspended" ? TONE_TINT.danger : undefined}
                href={`/applications/${app.application_id}`}
              >
                <Cell className="pr-4">
                  <div className="truncate text-sm font-medium text-primary">{app.name}</div>
                  <div className="mt-0.5 font-mono text-[10px] text-secondary">Owner: {app.owner ?? "Unknown"}</div>
                </Cell>
                <Cell label="Model version" className="truncate font-mono text-[11.5px] text-secondary">
                  {app.model_name} · {app.model_version_label}
                </Cell>
                <Cell label="Lifecycle">
                  <StatusPill
                    tone={tone}
                    label={LIFECYCLE_LABEL[app.lifecycle_state]}
                    live={app.lifecycle_state === "governance_review"}
                  />
                </Cell>
                <Cell label="Risk">
                  <StatusPill tone={riskTone(app.risk_classification)} label={app.risk_classification ?? "Unclassified"} />
                </Cell>
                <Cell label="Sign-offs" className="font-mono text-[11.5px] tabular-nums">
                  {app.lifecycle_state === "governance_review" ? (
                    <span className={app.approvals_complete < app.approvals_required ? "text-danger" : "text-success"}>
                      {app.approvals_complete} / {app.approvals_required}
                    </span>
                  ) : (
                    <span className="text-secondary">—</span>
                  )}
                </Cell>
              </TableRow>
            );
          })}

          {visible.length === 0 && (
            <TableNote>No applications in {LIFECYCLE_LABEL[stateFilter as LifecycleState]}.</TableNote>
          )}
        </Card>
      )}
    </>
  );
}

function FilterChip({
  label,
  count,
  selected,
  tone,
  onClick,
}: {
  label: string;
  count: number;
  selected: boolean;
  tone?: LifecycleState;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex items-center gap-2 border px-3 py-1.5 font-mono text-[9.5px] tracking-[0.14em] uppercase transition-colors ${
        selected ? "border-rule bg-rule text-surface" : "border-strong text-secondary hover:text-primary"
      }`}
      style={
        selected || !tone
          ? undefined
          : { borderLeftWidth: "4px", borderLeftColor: TONE_MARK[lifecycleTone(tone)] }
      }
    >
      {label}
      <span className={selected ? "opacity-70" : "text-tertiary"}>{count}</span>
    </button>
  );
}
