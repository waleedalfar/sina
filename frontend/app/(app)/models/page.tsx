"use client";

import { useQuery } from "@tanstack/react-query";
import { Boxes } from "lucide-react";
import { dashboardApi } from "@/lib/api/dashboard";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusPill } from "@/components/ui/StatusPill";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/ResourceState";
import { TableHead, TableNote, TableRow, Cell } from "@/components/ui/Table";
import { riskTone, runtimeTone, RUNTIME_LABEL, TONE_MARK, TONE_TINT, TONE_TEXT } from "@/lib/status";

const COLS = "minmax(0,1fr) 108px 132px 128px 148px 116px 74px";

export default function ModelsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-models"],
    queryFn: dashboardApi.models,
    refetchInterval: 10_000,
  });

  return (
    <>
      <PageHeader
        title="Models"
        description="Registered weights and their versions. A model with no approved version cannot back an application."
      />

      <Card>
        <TableHead cols={COLS}>
          <div>Model</div>
          <div>Version</div>
          <div>Runtime</div>
          <div>Risk</div>
          <div>AI Governance</div>
          <div>Evaluation</div>
          <div>Apps</div>
        </TableHead>

        {isLoading &&
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="border-b border-hairline px-4 py-4 last:border-b-0">
              <Skeleton className="h-4 w-full" />
            </div>
          ))}

        {!isLoading && data?.length === 0 && (
          <div className="p-4">
            <EmptyState
              icon={Boxes}
              title="No model versions imported yet"
              description="Versions appear here once someone imports a weights archive and it clears the malware scan."
            />
          </div>
        )}

        {data?.map((row) => {
          // The row's spine tracks the thing that actually gates use:
          // whether this version has been through AI Governance. Runtime
          // state is infrastructure, and infrastructure never implies
          // approval.
          const approvalTone =
            row.ai_governance_decision === "approved"
              ? "success"
              : row.ai_governance_decision
                ? "danger"
                : "warning";
          return (
            <TableRow
              key={row.version_id}
              cols={COLS}
              mark={TONE_MARK[approvalTone]}
              tint={TONE_TINT[approvalTone]}
              href={`/models/${row.model_id}`}
            >
              <Cell className="pr-4 text-sm font-medium text-primary">{row.model_name}</Cell>
              <Cell label="Version" className="font-mono text-[11.5px] text-secondary">
                {row.version_label}
              </Cell>
              <Cell label="Runtime">
                <StatusPill
                  tone={runtimeTone(row.runtime_status)}
                  label={RUNTIME_LABEL[row.runtime_status]}
                  live={row.runtime_status === "running"}
                />
              </Cell>
              <Cell label="Risk">
                <StatusPill tone={riskTone(row.risk_classification)} label={row.risk_classification ?? "Unclassified"} />
              </Cell>
              <Cell label="AI Governance">
                <span
                  className={`font-mono text-[9.5px] tracking-[0.12em] uppercase ${TONE_TEXT[approvalTone]}`}
                >
                  {row.ai_governance_decision ?? "Pending"}
                </span>
              </Cell>
              <Cell label="Evaluation">
                {row.evaluation_summary ? (
                  <span className="flex gap-1">
                    {Object.entries(row.evaluation_summary).map(([cat, passed]) => (
                      <span
                        key={cat}
                        title={`${cat}: ${passed ? "passed" : "failed"}`}
                        className={`h-2 w-2 ${passed ? "bg-success" : "bg-danger"}`}
                      />
                    ))}
                  </span>
                ) : (
                  <span className="font-mono text-[9.5px] tracking-[0.12em] text-secondary uppercase">No runs</span>
                )}
              </Cell>
              <Cell label="Apps" className="font-mono text-[11.5px] text-secondary">
                {row.applications.length || "—"}
              </Cell>
            </TableRow>
          );
        })}

        {!isLoading && (data?.length ?? 0) > 0 && (
          <TableNote>
            Runtime state is infrastructure only — a running version is not an approved one.
          </TableNote>
        )}
      </Card>
    </>
  );
}
