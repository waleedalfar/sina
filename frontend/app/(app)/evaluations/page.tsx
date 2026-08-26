"use client";

import { FlaskConical } from "lucide-react";
import { useDashboardEvaluations } from "@/lib/hooks/useDashboard";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusPill } from "@/components/ui/StatusPill";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/ResourceState";
import { TableHead, TableNote, TableRow, Cell } from "@/components/ui/Table";
import { runStatusTone, RUN_STATUS_LABEL, TONE_MARK, TONE_TINT } from "@/lib/status";

const COLS = "minmax(0,1fr) 132px 148px 168px minmax(0,1.1fr)";

export default function EvaluationsPage() {
  const { data, isLoading } = useDashboardEvaluations();

  return (
    <>
      <PageHeader
        title="Evaluation Runs"
        description="Evidence for model approval. A run must complete before its version can be approved."
      />

      <Card>
        <TableHead cols={COLS}>
          <div>Model</div>
          <div>Version</div>
          <div>Status</div>
          <div>Triggered</div>
          <div>Categories</div>
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
              icon={FlaskConical}
              title="No evaluation runs yet"
              description="Runs appear here once someone triggers a suite against a model version from its detail page."
            />
          </div>
        )}

        {data?.map((row) => {
          const tone = runStatusTone(row.status);
          return (
            <TableRow
              key={row.run_id}
              cols={COLS}
              mark={TONE_MARK[tone]}
              tint={TONE_TINT[tone]}
              href={`/evaluations/${row.run_id}`}
            >
              <Cell className="truncate pr-4 text-sm font-medium text-primary">{row.model_name}</Cell>
              <Cell label="Version" className="font-mono text-[11.5px] text-secondary">
                {row.model_version_label}
              </Cell>
              <Cell label="Status">
                <StatusPill tone={tone} label={RUN_STATUS_LABEL[row.status]} live={row.status === "running"} />
              </Cell>
              <Cell label="Triggered" className="font-mono text-[11px] text-secondary">
                {new Date(row.triggered_at).toLocaleString()}
              </Cell>
              <Cell label="Categories">
                <span className="flex flex-wrap gap-x-3 gap-y-1">
                  {Object.entries(row.category_summary).map(([cat, passed]) => (
                    <span
                      key={cat}
                      className={`inline-flex items-center gap-1.5 font-mono text-[9.5px] tracking-[0.1em] uppercase ${
                        passed ? "text-success" : "text-danger"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 ${passed ? "bg-success" : "bg-danger"}`} />
                      {cat.replace(/_/g, " ")}
                    </span>
                  ))}
                </span>
              </Cell>
            </TableRow>
          );
        })}

        {!isLoading && (data?.length ?? 0) > 0 && (
          <TableNote>A run that is still awaiting human review is not yet evidence.</TableNote>
        )}
      </Card>
    </>
  );
}
