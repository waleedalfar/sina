import { apiFetch } from "@/lib/api/client";
import type { EvaluationRun } from "@/types/api";

export interface EvaluationCategoryResult {
  id: string;
  category: string;
  suite_id: string;
  cases_total: number;
  cases_passed: number;
  passed: boolean;
}

export interface EvaluationCaseResult {
  id: string;
  case_id: string;
  suite_id: string;
  input_prompt: string;
  scoring_method: "marker_match" | "canary_check" | "exact_fuzzy_match" | "human_review";
  scoring_criteria: string;
  actual_output: string;
  passed: boolean;
  scored_by: "automated" | "human";
  reviewed_by: string | null;
}

export interface EvaluationRunDetail extends EvaluationRun {
  category_results: EvaluationCategoryResult[];
  case_results: EvaluationCaseResult[];
}

export const evaluationApi = {
  listRuns: (versionId: string) => apiFetch<EvaluationRun[]>(`/api/v1/model-versions/${versionId}/evaluation-runs`),
  triggerRun: (versionId: string) =>
    apiFetch<EvaluationRun>(`/api/v1/model-versions/${versionId}/evaluation-runs`, { method: "POST" }),
  getRun: (runId: string) => apiFetch<EvaluationRunDetail>(`/api/v1/evaluation-runs/${runId}`),
  submitHumanReview: (runId: string, caseResultId: string, passed: boolean) =>
    apiFetch<EvaluationCaseResult>(`/api/v1/evaluation-runs/${runId}/cases/${caseResultId}`, {
      method: "PATCH",
      body: { passed },
    }),
};
