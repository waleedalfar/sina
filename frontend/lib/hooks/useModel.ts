"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { dashboardApi } from "@/lib/api/dashboard";
import { modelsApi } from "@/lib/api/models";
import { governanceApi } from "@/lib/api/governance";
import { evaluationApi } from "@/lib/api/evaluation";
import type { ApprovalDecision, RiskClassification } from "@/types/api";

export function useModel(modelId: string) {
  return useQuery({ queryKey: ["model", modelId], queryFn: () => modelsApi.get(modelId) });
}

export function useUpdateModel(modelId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof modelsApi.update>[1]) => modelsApi.update(modelId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["model", modelId] });
      // The name shown on the /models list and on every Application card
      // comes from the dashboard rows, not from this query.
      qc.invalidateQueries({ queryKey: ["dashboard-models"] });
      qc.invalidateQueries({ queryKey: ["dashboard-applications"] });
    },
  });
}

type ImportOpts = Parameters<typeof modelsApi.importVersion>[2];

export function useImportModelVersion(modelId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, opts }: { file: File; opts?: ImportOpts }) => modelsApi.importVersion(modelId, file, opts),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dashboard-models"] }),
  });
}

/** Version rows for one Model — reuses the same `dashboard-models` cache
 * the /models list page already populates, filtered client-side (no
 * per-model list endpoint exists; see frontend.md's cross-module table). */
export function useModelDashboardRows(modelId: string) {
  const { data, ...rest } = useQuery({
    queryKey: ["dashboard-models"],
    queryFn: dashboardApi.models,
    refetchInterval: 10_000,
  });
  return { data: data?.filter((r) => r.model_id === modelId), ...rest };
}

/** Full ModelVersionOut — the dashboard row doesn't carry hash/size/scan/
 * provenance fields needed for the detail view. */
export function useModelVersionDetail(modelId: string, versionId: string) {
  return useQuery({ queryKey: ["model-version", versionId], queryFn: () => modelsApi.getVersion(modelId, versionId) });
}

export function useModelVersionRuntimeState(versionId: string) {
  return useQuery({
    queryKey: ["model-version-runtime", versionId],
    queryFn: () => modelsApi.runtimeState(versionId),
    refetchInterval: 10_000,
  });
}

export function useEvaluationRuns(versionId: string) {
  return useQuery({ queryKey: ["evaluation-runs", versionId], queryFn: () => evaluationApi.listRuns(versionId) });
}

export function useModelVersionMutations(versionId: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["model-version-runtime", versionId] });
    qc.invalidateQueries({ queryKey: ["model-version", versionId] });
    qc.invalidateQueries({ queryKey: ["dashboard-models"] });
  };

  const start = useMutation({ mutationFn: () => modelsApi.start(versionId), onSuccess: invalidate });
  const stop = useMutation({ mutationFn: () => modelsApi.stop(versionId), onSuccess: invalidate });

  const setRiskClassification = useMutation({
    mutationFn: (risk: RiskClassification) => governanceApi.setModelVersionRiskClassification(versionId, risk),
    onSuccess: invalidate,
  });

  const recordApproval = useMutation({
    mutationFn: ({ decision, evidenceRunId, comment }: { decision: ApprovalDecision; evidenceRunId: string; comment?: string }) =>
      governanceApi.recordModelVersionApproval(versionId, decision, evidenceRunId, comment),
    onSuccess: invalidate,
  });

  return { start, stop, setRiskClassification, recordApproval };
}
