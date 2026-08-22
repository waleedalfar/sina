import { apiFetch } from "@/lib/api/client";
import type {
  ApplicationDashboardRow,
  ApprovalQueueItem,
  EvaluationDashboardRow,
  GovernanceSummary,
  ModelDashboardRow,
  SecurityEventsOut,
} from "@/types/api";

export const dashboardApi = {
  models: () => apiFetch<ModelDashboardRow[]>("/api/v1/dashboard/models"),
  applications: () => apiFetch<ApplicationDashboardRow[]>("/api/v1/dashboard/applications"),
  evaluations: () => apiFetch<EvaluationDashboardRow[]>("/api/v1/dashboard/evaluations"),
  securityEvents: (limit = 20) =>
    apiFetch<SecurityEventsOut>(`/api/v1/dashboard/security-events?limit=${limit}`),
  governanceSummary: () => apiFetch<GovernanceSummary>("/api/v1/dashboard/governance-summary"),
  myApprovalQueue: () => apiFetch<ApprovalQueueItem[]>("/api/v1/dashboard/my-approval-queue"),
};
