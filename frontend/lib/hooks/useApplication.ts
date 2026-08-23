"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { governanceApi, type ApplicationUpdateIn, type RiskQuestionnaireIn } from "@/lib/api/governance";
import type { ApprovalCategory, ApprovalDecision } from "@/types/api";

export function useApplication(id: string) {
  return useQuery({ queryKey: ["application", id], queryFn: () => governanceApi.getApplication(id) });
}

export function useApplicationMutations(id: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["application", id] });
    qc.invalidateQueries({ queryKey: ["dashboard-applications"] });
    qc.invalidateQueries({ queryKey: ["my-approval-queue"] });
    qc.invalidateQueries({ queryKey: ["governance-summary"] });
  };

  const recordApproval = useMutation({
    mutationFn: ({ category, decision, comment }: { category: ApprovalCategory; decision: ApprovalDecision; comment?: string }) =>
      governanceApi.recordApproval(id, category, decision, comment),
    onSuccess: invalidate,
  });

  const suspend = useMutation({
    mutationFn: (reason: string) => governanceApi.suspend(id, reason),
    onSuccess: invalidate,
  });

  const transition = useMutation({
    mutationFn: (toState: Parameters<typeof governanceApi.transition>[1]) => governanceApi.transition(id, toState),
    onSuccess: invalidate,
  });

  const submitQuestionnaire = useMutation({
    mutationFn: (body: RiskQuestionnaireIn) => governanceApi.submitQuestionnaire(id, body),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: (body: ApplicationUpdateIn) => governanceApi.updateApplication(id, body),
    onSuccess: invalidate,
  });

  return { recordApproval, suspend, transition, submitQuestionnaire, update };
}
