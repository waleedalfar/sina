import type {
  ApprovalDecision,
  EvaluationRunStatus,
  LifecycleState,
  MalwareScanResult,
  RiskClassification,
  RuntimeStatus,
  Severity,
} from "@/types/api";

export type Tone = "success" | "warning" | "danger" | "neutral" | "info";

export const LIFECYCLE_LABEL: Record<LifecycleState, string> = {
  draft: "Draft",
  development: "Development",
  evaluation: "Evaluation",
  governance_review: "Governance Review",
  approved: "Approved",
  staging: "Staging",
  production: "Production",
  suspended: "Suspended",
  retired: "Retired",
};

// The lifecycle in its real progression order (governance.md's state
// machine), with the two off-path terminal-ish states last. Used wherever
// states are listed for the user rather than displayed one at a time —
// object key order is not something to depend on for that.
export const LIFECYCLE_ORDER: LifecycleState[] = [
  "draft",
  "development",
  "evaluation",
  "governance_review",
  "approved",
  "staging",
  "production",
  "suspended",
  "retired",
];

export function lifecycleTone(state: LifecycleState): Tone {
  switch (state) {
    case "production":
    case "approved":
      return "success";
    case "staging":
    case "evaluation":
    case "governance_review":
      return "warning";
    case "suspended":
      return "danger";
    case "retired":
    case "draft":
    case "development":
    default:
      return "neutral";
  }
}

export function lifecycleIsLive(state: LifecycleState): boolean {
  return state === "production" || state === "governance_review" || state === "evaluation";
}

export function riskTone(risk: RiskClassification | null): Tone {
  if (risk === "high") return "danger";
  if (risk === "moderate") return "warning";
  if (risk === "low") return "success";
  return "neutral";
}

export function runtimeTone(status: RuntimeStatus): Tone {
  switch (status) {
    case "running":
      return "success";
    case "starting":
      return "info";
    case "error":
      return "danger";
    case "stopped":
    default:
      return "neutral";
  }
}

export const RUNTIME_LABEL: Record<RuntimeStatus, string> = {
  running: "Running",
  starting: "Starting",
  stopped: "Stopped",
  error: "Error",
};

export function scanTone(result: MalwareScanResult): Tone {
  if (result === "clean") return "success";
  if (result === "positive") return "danger";
  return "warning";
}

export function decisionTone(decision: ApprovalDecision): Tone {
  if (decision === "approved") return "success";
  if (decision === "rejected") return "danger";
  return "warning";
}

export const DECISION_LABEL: Record<ApprovalDecision, string> = {
  approved: "Approved",
  rejected: "Rejected",
  changes_requested: "Changes Requested",
};

export function severityTone(severity: Severity): Tone {
  if (severity === "security_critical") return "danger";
  if (severity === "warning") return "warning";
  return "info";
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  security_critical: "Security Critical",
  warning: "Warning",
  info: "Info",
};

export function runStatusTone(status: EvaluationRunStatus): Tone {
  if (status === "complete") return "success";
  if (status === "failed") return "danger";
  return "info";
}

export const RUN_STATUS_LABEL: Record<EvaluationRunStatus, string> = {
  running: "Running",
  complete: "Complete",
  failed: "Failed",
};
