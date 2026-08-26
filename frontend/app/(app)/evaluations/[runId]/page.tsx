"use client";

import { use } from "react";
import { UserCheck } from "lucide-react";
import { useEvaluationRun, useEvaluationRunHeader, useSubmitHumanReview } from "@/lib/hooks/useEvaluation";
import { useMe } from "@/lib/hooks/useMe";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusPill } from "@/components/ui/StatusPill";
import { Skeleton } from "@/components/ui/Skeleton";
import { ResourceState } from "@/components/ui/ResourceState";
import { DataRow } from "@/components/ui/DataList";
import { TableHead, TableNote, TableRow, Cell } from "@/components/ui/Table";
import { runStatusTone, RUN_STATUS_LABEL } from "@/lib/status";
import { hasAnyRole, EVALUATION_TRIGGER_ROLES } from "@/lib/auth/roles";
import type { EvaluationCaseResult } from "@/lib/api/evaluation";

const CATEGORY_LABEL: Record<string, string> = {
  hallucination: "Hallucination",
  phi_leakage: "PHI Leakage",
  prompt_injection: "Prompt Injection",
  healthcare_qa: "Healthcare QA",
};

const SCORING_METHOD_LABEL: Record<string, string> = {
  marker_match: "Marker match",
  canary_check: "Canary check",
  exact_fuzzy_match: "Exact/fuzzy match",
  human_review: "Human review",
};

const COLS = "minmax(0,1.35fr) minmax(0,1.35fr) 150px 200px";

export default function EvaluationRunDetailPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = use(params);
  const { data: run, isLoading, error, refetch } = useEvaluationRun(runId);
  const header = useEvaluationRunHeader(runId);
  const { data: me } = useMe();
  const submitReview = useSubmitHumanReview(runId);

  const canReview = !!me && hasAnyRole(me.roles, EVALUATION_TRIGGER_ROLES);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!run) {
    return (
      <ResourceState
        error={error}
        resource="evaluation run"
        backHref="/evaluations"
        backLabel="Back to evaluations"
        onRetry={() => refetch()}
      />
    );
  }

  const categoryBySuiteId = new Map(run.category_results.map((c) => [c.suite_id, c]));
  const casesByCategory = new Map<string, EvaluationCaseResult[]>();
  for (const cr of run.case_results) {
    const category = categoryBySuiteId.get(cr.suite_id)?.category ?? "unknown";
    casesByCategory.set(category, [...(casesByCategory.get(category) ?? []), cr]);
  }

  const totals = run.category_results.reduce(
    (acc, c) => ({ passed: acc.passed + c.cases_passed, total: acc.total + c.cases_total }),
    { passed: 0, total: 0 },
  );
  const aggregate = totals.total > 0 ? (totals.passed / totals.total) * 100 : null;
  const pendingReview = run.case_results.filter((c) => c.scored_by === "human" && c.reviewed_by === null).length;

  return (
    <>
      <PageHeader
        eyebrow={`Evaluations / ${run.id.slice(0, 8)}`}
        title={header ? `${header.model_name} ${header.model_version_label}` : "Evaluation run"}
        aside={
          <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
            <StatusPill
              tone={runStatusTone(run.status)}
              label={RUN_STATUS_LABEL[run.status]}
              live={run.status === "running"}
            />
            {pendingReview > 0 && <StatusPill tone="warning" label={`${pendingReview} awaiting human review`} />}
            <span className="font-mono text-[11px] text-secondary">
              {totals.total} cases · {new Date(run.triggered_at).toLocaleString()}
            </span>
          </div>
        }
        actions={
          <div className="text-right">
            <div className="label-mono">Aggregate</div>
            <div
              className={`font-mono text-[34px] leading-tight font-semibold tabular-nums ${
                aggregate === null ? "text-secondary" : aggregate >= 90 ? "text-success" : "text-danger"
              }`}
            >
              {aggregate === null ? "—" : `${aggregate.toFixed(1)}%`}
            </div>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {run.category_results.map((cat) => {
          const pct = cat.cases_total > 0 ? (cat.cases_passed / cat.cases_total) * 100 : 0;
          return (
            <div
              key={cat.id}
              className={`flex flex-col gap-2.5 border border-t-[3px] border-hairline bg-raised p-3.5 ${
                cat.passed ? "border-t-success" : "border-t-danger"
              }`}
            >
              <div className="label-mono">{CATEGORY_LABEL[cat.category] ?? cat.category}</div>
              <div
                className={`font-mono text-[26px] leading-none font-semibold tabular-nums ${
                  cat.passed ? "text-success" : "text-danger"
                }`}
              >
                {pct.toFixed(1)}%
              </div>
              <div className="h-1.5 border border-hairline bg-surface">
                <div className={`h-full ${cat.passed ? "bg-success" : "bg-danger"}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="font-mono text-[9.5px] text-secondary">
                {cat.cases_total} cases · {cat.cases_total - cat.cases_passed} fail
              </div>
            </div>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Run record</CardTitle>
        </CardHeader>
        <DataRow label="Triggered">{new Date(run.triggered_at).toLocaleString()}</DataRow>
        <DataRow label="Completed">{run.completed_at ? new Date(run.completed_at).toLocaleString() : "—"}</DataRow>
        <DataRow label="Triggered by">{run.triggered_by}</DataRow>
        <DataRow label="Model version">{run.model_version_id}</DataRow>
        <DataRow label="Run id">{run.id}</DataRow>
      </Card>

      {[...casesByCategory.entries()].map(([category, cases]) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle>{CATEGORY_LABEL[category] ?? category}</CardTitle>
            <span className="font-mono text-[9.5px] text-secondary">{cases.length} cases</span>
          </CardHeader>
          <TableHead cols={COLS}>
            <div>Prompt</div>
            <div>Response</div>
            <div>Scoring method</div>
            <div>Result</div>
          </TableHead>
          {cases.map((cr) => (
            <CaseRow
              key={cr.id}
              caseResult={cr}
              canReview={canReview}
              onReview={(passed) => submitReview.mutate({ caseResultId: cr.id, passed })}
              pending={submitReview.isPending}
            />
          ))}
          {cases.some((c) => c.scored_by === "human") && (
            <TableNote>
              Cases scored by a human are not evidence until someone has actually judged them.
            </TableNote>
          )}
        </Card>
      ))}
    </>
  );
}

/*
  The case row doubles as the human-review queue: a case awaiting judgement
  is steel, never green and never red, and carries the two buttons that
  settle it. There is no separate queue screen because the judgement needs
  the prompt and the response side by side, which is exactly this row.
*/
function CaseRow({
  caseResult,
  canReview,
  onReview,
  pending,
}: {
  caseResult: EvaluationCaseResult;
  canReview: boolean;
  onReview: (passed: boolean) => void;
  pending: boolean;
}) {
  const awaitingReview = caseResult.scored_by === "human" && caseResult.reviewed_by === null;
  const tone = awaitingReview ? "warning" : caseResult.passed ? "success" : "danger";
  const mark = awaitingReview
    ? "var(--color-status-warning)"
    : caseResult.passed
      ? "transparent"
      : "var(--color-status-danger)";

  return (
    <TableRow
      cols={COLS}
      mark={mark}
      tint={awaitingReview ? "var(--color-status-warning-bg)" : caseResult.passed ? undefined : "var(--color-status-danger-bg)"}
      className="items-start"
    >
      <Cell label="Prompt" className="pr-4 text-[12.5px] leading-relaxed text-primary/85">
        {caseResult.input_prompt}
      </Cell>
      <Cell label="Response" className="pr-4 text-[12.5px] leading-relaxed break-words text-secondary">
        {caseResult.actual_output}
      </Cell>
      <Cell label="Scoring method" className="pr-3">
        <div className="font-mono text-[9.5px] tracking-[0.1em] text-warning uppercase">
          {SCORING_METHOD_LABEL[caseResult.scoring_method] ?? caseResult.scoring_method}
        </div>
        {caseResult.scoring_criteria && (
          <div className="mt-1 font-mono text-[9px] break-words text-secondary">{caseResult.scoring_criteria}</div>
        )}
      </Cell>
      <Cell label="Result">
        <div className="flex flex-col gap-2">
          <span
            className={`font-mono text-[9.5px] tracking-[0.16em] uppercase ${
              tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-warning"
            }`}
          >
            {awaitingReview ? "Pending review" : caseResult.passed ? "Pass" : "Fail"}
          </span>
          {caseResult.reviewed_by && (
            <span className="inline-flex items-center gap-1 font-mono text-[9px] text-secondary">
              <UserCheck className="h-3 w-3" aria-hidden="true" /> {caseResult.reviewed_by}
            </span>
          )}
          {caseResult.scored_by === "human" && canReview && (
            <div className="flex gap-1.5">
              <button
                type="button"
                disabled={pending}
                onClick={() => onReview(true)}
                className={`border px-2.5 py-1.5 font-mono text-[9px] tracking-[0.14em] uppercase transition-colors disabled:opacity-50 ${
                  caseResult.passed && caseResult.reviewed_by
                    ? "border-success bg-success-bg text-success-ink"
                    : "border-success text-success-ink hover:bg-success-bg"
                }`}
              >
                Approve
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => onReview(false)}
                className={`border px-2.5 py-1.5 font-mono text-[9px] tracking-[0.14em] uppercase transition-colors disabled:opacity-50 ${
                  !caseResult.passed && caseResult.reviewed_by
                    ? "border-danger bg-danger-bg text-danger"
                    : "border-danger text-danger hover:bg-danger-bg"
                }`}
              >
                Reject
              </button>
            </div>
          )}
        </div>
      </Cell>
    </TableRow>
  );
}
