import { apiFetch } from "@/lib/api/client";
import type {
  Application,
  ApplicationDetail,
  ApprovalCategory,
  ApprovalDecision,
  GovernanceApproval,
  LifecycleState,
  RiskClassification,
  RiskQuestionnaire,
} from "@/types/api";

export interface ApplicationIn {
  name: string;
  purpose?: string;
  model_version_id: string;
  permitted_data?: string[];
  restricted_data?: string[];
  human_review_required?: boolean;
  autonomous_action_allowed?: boolean;
  external_network_allowed?: boolean;
  permitted_role_ids?: string[];
}

export type RiskQuestionnaireIn = Omit<
  RiskQuestionnaire,
  "application_id" | "suggested_classification" | "completed_by" | "completed_at"
>;

export const governanceApi = {
  listApplications: () => apiFetch<Application[]>("/api/v1/applications"),
  getApplication: (id: string) => apiFetch<ApplicationDetail>(`/api/v1/applications/${id}`),
  createApplication: (body: ApplicationIn) =>
    apiFetch<Application>("/api/v1/applications", { method: "POST", body }),
  updateApplication: (id: string, body: Partial<ApplicationIn>) =>
    apiFetch<Application>(`/api/v1/applications/${id}`, { method: "PATCH", body }),
  submitQuestionnaire: (id: string, body: RiskQuestionnaireIn) =>
    apiFetch<RiskQuestionnaire>(`/api/v1/applications/${id}/risk-questionnaire`, { method: "POST", body }),
  setRiskClassification: (id: string, risk_classification: RiskClassification) =>
    apiFetch<Application>(`/api/v1/applications/${id}/risk-classification`, {
      method: "PATCH",
      body: { risk_classification },
    }),
  transition: (id: string, to_state: LifecycleState) =>
    apiFetch<Application>(`/api/v1/applications/${id}/transition`, { method: "POST", body: { to_state } }),
  recordApproval: (id: string, category: ApprovalCategory, decision: ApprovalDecision, comment?: string) =>
    apiFetch<GovernanceApproval>(`/api/v1/applications/${id}/approvals`, {
      method: "POST",
      body: { category, decision, comment },
    }),
  suspend: (id: string, reason: string) =>
    apiFetch<Application>(`/api/v1/applications/${id}/suspend`, { method: "POST", body: { reason } }),
  recordModelVersionApproval: (
    versionId: string,
    decision: ApprovalDecision,
    evidence_evaluation_run_id: string,
    comment?: string,
  ) =>
    apiFetch<GovernanceApproval>(`/api/v1/model-versions/${versionId}/approvals`, {
      method: "POST",
      body: { decision, evidence_evaluation_run_id, comment },
    }),
  setModelVersionRiskClassification: (versionId: string, risk_classification: RiskClassification) =>
    apiFetch<void>(`/api/v1/model-versions/${versionId}/risk-classification`, {
      method: "PATCH",
      body: { risk_classification },
    }),
};
