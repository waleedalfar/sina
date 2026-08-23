/**
 * Hand-written to match backend Pydantic schemas 1:1 — see
 * docs/modules/frontend.md's Open Questions re: codegen vs. hand-written.
 * One block per backend module, mirroring backend/app/ layout.
 */

// --- identity ---

export type RoleKind = "admin" | "builder" | "signoff" | "permitted_user" | "readonly";

export interface Role {
  id: string;
  name: string;
  kind: RoleKind;
}

/** One grant/revoke row from `GET /identities/{id}/roles`. `id` is still
 * the role id (what the revoke endpoint takes); `assignment_id` is what
 * makes two rows for the same role distinguishable, which the history
 * view can legitimately contain. */
export interface RoleAssignment extends Role {
  assignment_id: string;
  granted_by: string;
  granted_at: string;
  revoked_by: string | null;
  revoked_at: string | null;
}

export interface Me {
  id: string;
  type: "human" | "service";
  email: string | null;
  display_name: string | null;
  service_client_id: string | null;
  tenant_id: string;
  active: boolean;
  roles: Role[];
}

export interface Identity {
  id: string;
  type: "human" | "service";
  email: string | null;
  display_name: string | null;
  service_client_id: string | null;
  active: boolean;
  roles: Role[];
}

// --- governance ---

export type LifecycleState =
  | "draft"
  | "development"
  | "evaluation"
  | "governance_review"
  | "approved"
  | "staging"
  | "production"
  | "suspended"
  | "retired";

export const LIFECYCLE_ORDER: LifecycleState[] = [
  "draft",
  "development",
  "evaluation",
  "governance_review",
  "approved",
  "staging",
  "production",
];

export type ApprovalCategory = "clinical_safety" | "privacy" | "security" | "ai_governance" | "compliance";
export type ApprovalDecision = "approved" | "rejected" | "changes_requested";
export type RiskClassification = "low" | "moderate" | "high";

export interface Application {
  id: string;
  name: string;
  purpose: string | null;
  model_version_id: string;
  permitted_data: string[];
  restricted_data: string[];
  human_review_required: boolean;
  autonomous_action_allowed: boolean;
  external_network_allowed: boolean;
  risk_classification: RiskClassification | null;
  lifecycle_state: LifecycleState;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface GovernanceApproval {
  id: string;
  resource_type: "application" | "model_version";
  resource_id: string;
  category: ApprovalCategory;
  decision: ApprovalDecision;
  decided_by: string;
  decided_at: string;
  comment: string | null;
  evidence_evaluation_run_id: string | null;
  superseded_at: string | null;
}

export interface RiskQuestionnaire {
  application_id: string;
  processes_phi: boolean;
  analyzes_medical_images: boolean;
  analyzes_physiological_signals: boolean;
  generates_patient_specific_recommendations: boolean;
  recommends_diagnosis: boolean;
  recommends_treatment: boolean;
  influences_medication_decisions: boolean;
  produces_time_critical_recommendations: boolean;
  takes_autonomous_clinical_action: boolean;
  allows_independent_clinician_review: boolean;
  directly_affects_patient_care: boolean;
  suggested_classification: RiskClassification;
  completed_by: string;
  completed_at: string;
}

export interface ApplicationDetail extends Application {
  risk_questionnaire: RiskQuestionnaire | null;
  approvals: GovernanceApproval[];
  permitted_role_ids: string[];
}

// --- models ---

export type RuntimeStatus = "stopped" | "starting" | "running" | "error";
export type MalwareScanResult = "clean" | "positive" | "pending";

export interface ModelVersion {
  id: string;
  model_id: string;
  version_label: string;
  format: string;
  file_hash: string;
  file_size_bytes: number;
  declared_source: string | null;
  declared_license: string | null;
  base_model_version_id: string | null;
  known_limitations: string | null;
  malware_scan_result: MalwareScanResult;
  malware_scanned_at: string | null;
  risk_classification: RiskClassification | null;
  imported_by: string;
  imported_at: string;
}

export interface ModelRuntimeState {
  model_version_id: string;
  runtime_status: RuntimeStatus;
  last_started_at: string | null;
  last_stopped_at: string | null;
  last_health_check_at: string | null;
  last_hash_reverify_result: string | null;
  memory_used_mb: number | null;
  process_error: string | null;
  production_eligible: boolean;
}

export interface Model {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

// --- evaluation ---

export type EvaluationRunStatus = "running" | "complete" | "failed";
export type EvaluationCategoryName = "hallucination" | "phi_leakage" | "prompt_injection" | "healthcare_qa";

export interface EvaluationRun {
  id: string;
  model_version_id: string;
  triggered_by: string;
  triggered_at: string;
  completed_at: string | null;
  status: EvaluationRunStatus;
}

// --- audit ---

export type Severity = "info" | "warning" | "security_critical";

export interface AuditEvent {
  id: string;
  sequence_number: number;
  event_type: string;
  severity: Severity;
  occurred_at: string;
  actor_identity_id: string | null;
  resource_type: string | null;
  resource_id: string | null;
  payload: Record<string, unknown>;
  prev_event_hash: string | null;
  event_hash: string;
}

export interface IntegrityReport {
  checked: number;
  ok: boolean;
  first_break_sequence_number: number | null;
}

// --- dashboard-api ---

export interface ModelDashboardRow {
  model_id: string;
  model_name: string;
  version_id: string;
  version_label: string;
  runtime_status: RuntimeStatus;
  risk_classification: RiskClassification | null;
  ai_governance_decision: ApprovalDecision | null;
  evaluation_summary: Record<string, boolean> | null;
  applications: string[];
  last_reviewed_at: string | null;
}

export interface ApplicationDashboardRow {
  application_id: string;
  name: string;
  owner: string | null;
  model_name: string;
  model_version_label: string;
  risk_classification: RiskClassification | null;
  permitted_data: string[];
  human_review_required: boolean;
  lifecycle_state: LifecycleState;
  approvals_complete: number;
  approvals_required: number;
}

export interface EvaluationDashboardRow {
  run_id: string;
  model_id: string;
  model_name: string;
  model_version_label: string;
  status: EvaluationRunStatus;
  triggered_at: string;
  completed_at: string | null;
  category_summary: Record<string, boolean>;
}

export interface SecurityEventsOut {
  policy_violations: Record<string, unknown>[];
  phi_events: Record<string, unknown>[];
  failed_authentication: Record<string, unknown>[];
  suspicious_prompts: Record<string, unknown>[];
  security_findings: Record<string, unknown>[];
}

export interface GovernanceSummary {
  applications_by_state: Record<string, number>;
  model_versions_by_approval_status: Record<string, number>;
  pending_application_approvals: number;
}

export interface ApprovalQueueItem {
  resource_type: "application" | "model_version";
  resource_id: string;
  resource_name: string;
  category: ApprovalCategory;
}

/** Gateway responses are OpenAI-shaped — see lib/api/gateway.ts for why
 * this mirrors their schema rather than a friendlier local one. */
export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: { role: string; content: string };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
