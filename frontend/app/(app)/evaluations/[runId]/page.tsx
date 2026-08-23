"use client";

import { use } from "react";
import { CheckCircle2, XCircle, Clock3, UserCheck } from "lucide-react";
import { useEvaluationRun, useEvaluationRunHeader, useSubmitHumanReview } from "@/lib/hooks/useEvaluation";
import { useMe } from "@/lib/hooks/useMe";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { Skeleton } from "@/components/ui/Skeleton";
import { ResourceState } from "@/components/ui/ResourceState";
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

export default function EvaluationRunDetailPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = use(params);
  const { data: run, isLoading, error, refetch } = useEvaluationRun(runId);
  const header = useEvaluationRunHeader(runId);
  const { data: me } = useMe();
  const submitReview = useSubmitHumanReview(runId);

  const canReview = me && hasAnyRole(me.roles, EVALUATION_TRIGGER_ROLES);

  if (isLoading) {
    return (
      <div className="space-y-4">
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
        backLabel="Back to Evaluations"
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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-primary">
            {header ? `${header.model_name} — ${header.model_version_label}` : "Evaluation Run"}
          </h1>
          <p className="text-xs text-tertiary font-mono mt-1">{run.model_version_id}</p>
        </div>
        <StatusPill tone={runStatusTone(run.status)} label={RUN_STATUS_LABEL[run.status]} live={run.status === "running"} />
      </div>

      <Card className="p-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-sm">
          <Detail label="Triggered" value={new Date(run.triggered_at).toLocaleString()} />
          <Detail label="Completed" value={run.completed_at ? new Date(run.completed_at).toLocaleString() : "—"} />
          <Detail label="Triggered by" value={run.triggered_by} mono />
          <Detail label="Run ID" value={run.id} mono />
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Category Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-[var(--color-border-hairline)]">
            {run.category_results.map((cat) => (
              <li key={cat.id} className="flex items-center justify-between px-5 py-3.5">
                <span className="text-sm font-medium text-primary">{CATEGORY_LABEL[cat.category] ?? cat.category}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-tertiary font-mono">
                    {cat.cases_passed}/{cat.cases_total}
                  </span>
                  <StatusPill
                    tone={cat.passed ? "success" : "danger"}
                    label={cat.passed ? "Passed" : "Failed"}
                    icon={cat.passed ? CheckCircle2 : XCircle}
                  />
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {[...casesByCategory.entries()].map(([category, cases]) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle>{CATEGORY_LABEL[category] ?? category}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-[var(--color-border-hairline)]">
              {cases.map((cr) => (
                <CaseRow key={cr.id} caseResult={cr} canReview={!!canReview} onReview={(passed) => submitReview.mutate({ caseResultId: cr.id, passed })} pending={submitReview.isPending} />
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

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
  const isPendingHumanReview = caseResult.scored_by === "human" && caseResult.reviewed_by === null;

  return (
    <li className="px-5 py-4 space-y-2.5">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-primary flex-1">{caseResult.input_prompt}</p>
        <StatusPill
          tone={caseResult.passed ? "success" : "danger"}
          label={caseResult.passed ? "Passed" : isPendingHumanReview ? "Pending review" : "Failed"}
          icon={caseResult.passed ? CheckCircle2 : isPendingHumanReview ? Clock3 : XCircle}
        />
      </div>
      <p className="text-xs text-secondary bg-raised rounded-lg px-3 py-2 font-mono whitespace-pre-wrap">{caseResult.actual_output}</p>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-xs text-tertiary">
          <span>{SCORING_METHOD_LABEL[caseResult.scoring_method] ?? caseResult.scoring_method}</span>
          {caseResult.scoring_criteria && <span className="font-mono">criteria: {caseResult.scoring_criteria}</span>}
          {caseResult.reviewed_by && (
            <span className="inline-flex items-center gap-1">
              <UserCheck className="h-3 w-3" /> reviewed by <span className="font-mono">{caseResult.reviewed_by}</span>
            </span>
          )}
        </div>
        {caseResult.scored_by === "human" && canReview && (
          <div className="flex items-center gap-1 rounded-lg border border-hairline bg-raised p-0.5">
            <button
              type="button"
              disabled={pending}
              onClick={() => onReview(false)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-150 ${
                !caseResult.passed && caseResult.reviewed_by ? "bg-danger-bg text-danger" : "text-tertiary hover:text-secondary"
              }`}
            >
              Fails
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => onReview(true)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-150 ${
                caseResult.passed ? "bg-success-bg text-success" : "text-tertiary hover:text-secondary"
              }`}
            >
              Passes
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-tertiary">{label}</p>
      <p className={`text-sm text-primary mt-0.5 ${mono ? "font-mono truncate" : ""}`}>{value}</p>
    </div>
  );
}
