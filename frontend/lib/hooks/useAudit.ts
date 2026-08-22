"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { auditApi, type AuditEventFilters } from "@/lib/api/audit";
import { dashboardApi } from "@/lib/api/dashboard";

export function useAuditEvents(filters: AuditEventFilters) {
  return useQuery({ queryKey: ["audit-events", filters], queryFn: () => auditApi.list(filters) });
}

export function useAuditEvent(id: string) {
  return useQuery({ queryKey: ["audit-event", id], queryFn: () => auditApi.get(id) });
}

export function useVerifyIntegrity() {
  return useMutation({ mutationFn: () => auditApi.verifyIntegrity(0) });
}

export function useSecurityEvents(limit = 20) {
  return useQuery({ queryKey: ["security-events", limit], queryFn: () => dashboardApi.securityEvents(limit) });
}
