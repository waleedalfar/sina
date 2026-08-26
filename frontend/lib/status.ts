import type {
  ApprovalDecision,
  EvaluationRunStatus,
  LifecycleState,
  MalwareScanResult,
  RiskClassification,
  RuntimeStatus,
  Severity,
} from "@/types/api";

/**
 * The five tones, and what each one *means* — this is the whole colour
 * system and it is semantic, not decorative:
 *
 *   info     teal   — in progress, running, under review
 *   success  green  — cleared, approved, passed
 *   danger   brick  — refused, failed, dangerous
 *   warning  steel  — waiting on a human decision
 *   neutral  grey   — inert; not started, or finished and filed away
 *
 * Steel is deliberately not amber: nothing on this platform is "nearly
 * wrong", things are either awaiting a person or they are not.
 */
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
    // Work is actively happening to these — teal, the in-progress tone.
    case "evaluation":
    case "governance_review":
      return "info";
    // Staging is a holding position awaiting a human's promotion decision.
    case "staging":
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

/**
 * Moderate and high both read brick red. That is on purpose: the moment an
 * application is above routine risk it needs the full sign-off cycle, and
 * a softer colour for "moderate" invites people to treat it as nearly-fine.
 * Unclassified is steel — it isn't safe, it's un-assessed, and someone has
 * to go and assess it.
 */
export function riskTone(risk: RiskClassification | null): Tone {
  if (risk === "high" || risk === "moderate") return "danger";
  if (risk === "low") return "success";
  return "warning";
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
  // Changes-requested is a refusal of this round, not a pause — it reads
  // the same as a rejection, because for the applicant it is one.
  return "danger";
}

export const DECISION_LABEL: Record<ApprovalDecision, string> = {
  approved: "Approved",
  rejected: "Rejected",
  changes_requested: "Changes Requested",
};

export function severityTone(severity: Severity): Tone {
  if (severity === "security_critical") return "danger";
  if (severity === "warning") return "warning";
  // The overwhelming majority of the audit log is `info`. Colouring it
  // would drown the handful of rows that matter.
  return "neutral";
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

/**
 * The 4px spine colour a register row carries on its left edge, so a
 * column of rows shows where the exceptions are before you read any of it.
 * Neutral rows get no spine at all — an unremarkable row should be silent.
 */
export const TONE_MARK: Record<Tone, string> = {
  success: "var(--color-status-success)",
  warning: "var(--color-status-warning)",
  danger: "var(--color-status-danger)",
  info: "var(--color-accent)",
  neutral: "transparent",
};

/** The matching row tint. Only exceptional rows are tinted. */
export const TONE_TINT: Record<Tone, string | undefined> = {
  success: undefined,
  warning: undefined,
  danger: "var(--color-status-danger-bg)",
  info: undefined,
  neutral: undefined,
};

/** Tailwind text colour per tone, for the many places a bare value is
 * coloured without a pill around it. */
export const TONE_TEXT: Record<Tone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-accent",
  neutral: "text-secondary",
};

export const RUN_STATUS_LABEL: Record<EvaluationRunStatus, string> = {
  running: "Running",
  complete: "Complete",
  failed: "Failed",
};
