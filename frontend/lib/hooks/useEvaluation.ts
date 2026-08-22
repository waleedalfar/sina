"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { dashboardApi } from "@/lib/api/dashboard";
import { evaluationApi } from "@/lib/api/evaluation";

export function useEvaluationRun(runId: string) {
  return useQuery({ queryKey: ["evaluation-run", runId], queryFn: () => evaluationApi.getRun(runId) });
}

/** Model/version label for the header — reuses the same `dashboard-
 * evaluations` cache the /evaluations list page already populates (no
 * endpoint resolves a Model/ModelVersion directly from a bare run id). */
export function useEvaluationRunHeader(runId: string) {
  const { data } = useQuery({ queryKey: ["dashboard-evaluations"], queryFn: dashboardApi.evaluations });
  return data?.find((r) => r.run_id === runId);
}

export function useSubmitHumanReview(runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ caseResultId, passed }: { caseResultId: string; passed: boolean }) =>
      evaluationApi.submitHumanReview(runId, caseResultId, passed),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["evaluation-run", runId] });
      qc.invalidateQueries({ queryKey: ["dashboard-evaluations"] });
    },
  });
}

export function useTriggerEvaluationRun(versionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => evaluationApi.triggerRun(versionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["evaluation-runs", versionId] });
      qc.invalidateQueries({ queryKey: ["dashboard-evaluations"] });
      qc.invalidateQueries({ queryKey: ["dashboard-models"] });
    },
  });
}
