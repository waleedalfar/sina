import { apiFetch } from "@/lib/api/client";
import type { AuditEvent, IntegrityReport } from "@/types/api";

export interface AuditEventFilters {
  actor_identity_id?: string;
  resource_type?: string;
  resource_id?: string;
  event_type?: string;
  severity?: string;
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
}

export const auditApi = {
  list: (filters: AuditEventFilters = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined) params.set(key, String(value));
    }
    const qs = params.toString();
    return apiFetch<AuditEvent[]>(`/api/v1/audit-events${qs ? `?${qs}` : ""}`);
  },
  get: (id: string) => apiFetch<AuditEvent>(`/api/v1/audit-events/${id}`),
  verifyIntegrity: (fromSequence = 0) =>
    apiFetch<IntegrityReport>(`/api/v1/audit-events/verify-integrity?from_sequence=${fromSequence}`),
};
