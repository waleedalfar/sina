"use client";

import { useQuery } from "@tanstack/react-query";
import { dashboardApi } from "@/lib/api/dashboard";
import { auditApi } from "@/lib/api/audit";

export function useGovernanceSummary() {
  return useQuery({ queryKey: ["governance-summary"], queryFn: dashboardApi.governanceSummary, refetchInterval: 10_000 });
}

export function useMyApprovalQueue() {
  return useQuery({ queryKey: ["my-approval-queue"], queryFn: dashboardApi.myApprovalQueue, refetchInterval: 10_000 });
}

export function useDashboardApplications() {
  return useQuery({ queryKey: ["dashboard-applications"], queryFn: dashboardApi.applications });
}

export function useDashboardModels() {
  return useQuery({ queryKey: ["dashboard-models"], queryFn: dashboardApi.models, refetchInterval: 10_000 });
}

export function useDashboardEvaluations() {
  return useQuery({ queryKey: ["dashboard-evaluations"], queryFn: dashboardApi.evaluations });
}

export function useRecentAuditEvents(limit = 8) {
  return useQuery({
    queryKey: ["recent-audit-events", limit],
    queryFn: () => auditApi.list({ limit }),
    refetchInterval: 15_000,
  });
}
