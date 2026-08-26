"use client";

import { use, useState } from "react";
import { ArrowRight, Archive, ClipboardList, Pencil, RotateCcw, ShieldAlert } from "lucide-react";
import { useApplication, useApplicationMutations } from "@/lib/hooks/useApplication";
import { useMe } from "@/lib/hooks/useMe";
import { useRoles } from "@/lib/hooks/useIdentity";
import { LifecycleStepper, LifecycleLegend } from "@/components/lifecycle/LifecycleStepper";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusPill } from "@/components/ui/StatusPill";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { ResourceState } from "@/components/ui/ResourceState";
import { Modal } from "@/components/ui/Modal";
import { DataRow } from "@/components/ui/DataList";
import { TableNote } from "@/components/ui/Table";
import { decisionTone, lifecycleTone, riskTone, DECISION_LABEL, LIFECYCLE_LABEL } from "@/lib/status";
import {
  hasAnyRole,
  SIGNOFF_CATEGORY_ROLE,
  SUSPEND_ROLES,
  REENTER_REVIEW_ROLES,
  RETIRE_ROLES,
  PROMOTE_TO_STAGING_ROLES,
  PROMOTE_TO_PRODUCTION_ROLES,
  NON_TERMINAL_LIFECYCLE_STATES,
  RISK_QUESTIONNAIRE_ROLES,
} from "@/lib/auth/roles";
import type { ApplicationDetail, ApprovalCategory, LifecycleState, RiskClassification, Role } from "@/types/api";
import type { ApplicationUpdateIn, RiskQuestionnaireIn } from "@/lib/api/governance";
import { ApiError } from "@/lib/api/client";

const APPROVAL_CATEGORIES: ApprovalCategory[] = ["clinical_safety", "privacy", "security", "ai_governance", "compliance"];

// MasterPrompt §15's questionnaire, in its original order — see
// backend/app/governance/risk.py for the classification rule these feed.
const QUESTIONNAIRE_FIELDS: { key: keyof RiskQuestionnaireIn; label: string }[] = [
  { key: "processes_phi", label: "Process PHI?" },
  { key: "analyzes_medical_images", label: "Analyze medical images?" },
  { key: "analyzes_physiological_signals", label: "Analyze physiological signals?" },
  { key: "generates_patient_specific_recommendations", label: "Generate patient-specific recommendations?" },
  { key: "recommends_diagnosis", label: "Recommend diagnosis?" },
  { key: "recommends_treatment", label: "Recommend treatment?" },
  { key: "influences_medication_decisions", label: "Influence medication decisions?" },
  { key: "produces_time_critical_recommendations", label: "Produce time-critical recommendations?" },
  { key: "takes_autonomous_clinical_action", label: "Take autonomous clinical action?" },
  { key: "allows_independent_clinician_review", label: "Allow a clinician to independently review the basis?" },
  { key: "directly_affects_patient_care", label: "Directly affect patient care?" },
];

// Mirrors backend/app/governance/risk.py's compute_suggested_classification
// exactly, for a live preview as the form is filled in — the POST response
// carries the authoritative value.
const HIGH_SIGNAL_FIELDS: (keyof RiskQuestionnaireIn)[] = [
  "recommends_diagnosis",
  "recommends_treatment",
  "influences_medication_decisions",
  "takes_autonomous_clinical_action",
];
const MODERATE_SIGNAL_FIELDS: (keyof RiskQuestionnaireIn)[] = [
  "processes_phi",
  "analyzes_medical_images",
  "analyzes_physiological_signals",
  "generates_patient_specific_recommendations",
  "produces_time_critical_recommendations",
  "directly_affects_patient_care",
];

function computeSuggestedClassification(answers: RiskQuestionnaireIn): RiskClassification {
  if (HIGH_SIGNAL_FIELDS.some((f) => answers[f])) return "high";
  if (MODERATE_SIGNAL_FIELDS.some((f) => answers[f])) return "moderate";
  return "low";
}

const TIER_CODE: Record<string, string> = { low: "T1", moderate: "T2", high: "T3" };

export default function ApplicationDetailPage({ params }: { params: Promise<{ appId: string }> }) {
  const { appId } = use(params);
  const { data: app, isLoading, error, refetch } = useApplication(appId);
  const { data: me } = useMe();
  const { recordApproval, suspend, transition, submitQuestionnaire, update } = useApplicationMutations(appId);
  const { data: roles } = useRoles();
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [reason, setReason] = useState("");
  const [retireOpen, setRetireOpen] = useState(false);
  const [questionnaireOpen, setQuestionnaireOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!app) {
    return (
      <ResourceState
        error={error}
        resource="application"
        backHref="/applications"
        backLabel="Back to applications"
        onRetry={() => refetch()}
      />
    );
  }

  const activeApprovals = app.approvals.filter((a) => !a.superseded_at);
  const supersededApprovals = app.approvals.filter((a) => a.superseded_at);
  const isCreator = me?.id === app.created_by;
  const canSuspend =
    !!me && hasAnyRole(me.roles, SUSPEND_ROLES) && (app.lifecycle_state === "staging" || app.lifecycle_state === "production");
  const canReenterReview = !!me && hasAnyRole(me.roles, REENTER_REVIEW_ROLES) && app.lifecycle_state === "suspended";
  const canRetire =
    !!me &&
    hasAnyRole(me.roles, RETIRE_ROLES) &&
    (NON_TERMINAL_LIFECYCLE_STATES as readonly string[]).includes(app.lifecycle_state);
  const canEditQuestionnaire = !!me && hasAnyRole(me.roles, RISK_QUESTIONNAIRE_ROLES);

  // Mirrors backend/app/governance/router.py's update_application guard
  // exactly (creator-only, draft/development only), for the same reason the
  // separation-of-duties matrix is mirrored on the Identity page: tell the
  // user why an action is unavailable *before* they attempt it, rather than
  // letting the server produce a bare 403/409 after the fact. The server
  // remains the authority — this is an explanation, not the enforcement.
  const isEditableState = app.lifecycle_state === "draft" || app.lifecycle_state === "development";
  const canEdit = isCreator && isEditableState;
  const editLockedReason = `Locked in ${app.lifecycle_state.replace("_", " ")} — an Application is only editable in Draft or Development. Past that, its purpose and data scope are what reviewers signed off against.`;

  // Manual forward transition, per backend/app/governance/policy.py's
  // MANUAL_TRANSITIONS graph — governance_review -> approved/development are
  // deliberately absent (system-triggered only, as a side effect of
  // recording an approval).
  const manualNext: { label: string; to: LifecycleState } | null =
    app.lifecycle_state === "draft"
      ? { label: "Move to Development", to: "development" }
      : app.lifecycle_state === "development"
        ? { label: "Move to Evaluation", to: "evaluation" }
        : app.lifecycle_state === "evaluation"
          ? { label: "Submit for Governance Review", to: "governance_review" }
          : app.lifecycle_state === "approved"
            ? { label: "Promote to Staging", to: "staging" }
            : app.lifecycle_state === "staging"
              ? { label: "Promote to Production", to: "production" }
              : null;

  const manualNextRoles: string[] | null =
    app.lifecycle_state === "draft" || app.lifecycle_state === "development" || app.lifecycle_state === "evaluation"
      ? null // creator-only, checked via isCreator below
      : app.lifecycle_state === "approved"
        ? PROMOTE_TO_STAGING_ROLES
        : app.lifecycle_state === "staging"
          ? PROMOTE_TO_PRODUCTION_ROLES
          : null;

  const canManualNext =
    manualNext !== null && !!me && (manualNextRoles === null ? isCreator : hasAnyRole(me.roles, manualNextRoles));

  // What this identity could actually do next, handed to the rack so the
  // tubes themselves show the available moves rather than only the button
  // row above them.
  const armed: LifecycleState[] = [
    ...(canManualNext && manualNext ? [manualNext.to] : []),
    ...(canReenterReview ? (["governance_review"] as LifecycleState[]) : []),
    ...(canSuspend ? (["suspended"] as LifecycleState[]) : []),
    ...(canRetire ? (["retired"] as LifecycleState[]) : []),
  ];

  const transitionErrorMessage =
    transition.error instanceof ApiError
      ? transition.error.detail
      : transition.error instanceof Error
        ? transition.error.message
        : null;

  const signedCount = activeApprovals.filter((a) => a.decision === "approved").length;
  const inReview = app.lifecycle_state === "governance_review";
  const outstanding = APPROVAL_CATEGORIES.length - signedCount;

  return (
    <>
      <PageHeader
        eyebrow={`Applications / ${app.id.slice(0, 8)}`}
        title={app.name}
        aside={
          <>
            <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
              <StatusPill
                tone={lifecycleTone(app.lifecycle_state)}
                label={LIFECYCLE_LABEL[app.lifecycle_state]}
                live={app.lifecycle_state === "governance_review"}
              />
              <StatusPill tone={riskTone(app.risk_classification)} label={app.risk_classification ?? "Unclassified"} />
              <span className="font-mono text-[11px] text-secondary">{app.id}</span>
            </div>
            <p className="mt-3 max-w-[70ch] text-[13.5px] leading-relaxed text-secondary">
              {app.purpose ?? <span className="italic">No purpose recorded.</span>}
            </p>
          </>
        }
        actions={
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap justify-end gap-2">
              {isCreator && (
                <Button
                  variant="secondary"
                  disabled={!canEdit}
                  title={canEdit ? undefined : editLockedReason}
                  onClick={() => setEditOpen(true)}
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
              )}
              {canManualNext && manualNext && (
                <Button variant="primary" onClick={() => transition.mutate(manualNext.to)} disabled={transition.isPending}>
                  {manualNext.label} <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              )}
              {canReenterReview && (
                <Button variant="secondary" onClick={() => transition.mutate("governance_review")} disabled={transition.isPending}>
                  <RotateCcw className="h-3.5 w-3.5" /> Re-enter review
                </Button>
              )}
              {canSuspend && (
                <Button variant="danger" onClick={() => setSuspendOpen(true)}>
                  <ShieldAlert className="h-3.5 w-3.5" /> Emergency suspend
                </Button>
              )}
              {canRetire && (
                <Button variant="secondary" onClick={() => setRetireOpen(true)}>
                  <Archive className="h-3.5 w-3.5" /> Retire
                </Button>
              )}
            </div>
            {inReview && (
              <span className="font-mono text-[9.5px] text-secondary">
                {outstanding === 0
                  ? "All sign-offs recorded"
                  : `Promotion locked — ${outstanding} of ${APPROVAL_CATEGORIES.length} sign-offs outstanding`}
              </span>
            )}
          </div>
        }
      />

      {isCreator && !canEdit && (
        // Visible, not just a `title` tooltip — same principle the admin
        // Identities page uses for conflicting role grants: say why the
        // action is off before it's attempted.
        <p className="font-mono text-[9.5px] leading-relaxed text-secondary">{editLockedReason}</p>
      )}

      {transitionErrorMessage && (
        <p className="border border-danger border-l-4 bg-danger-bg px-4 py-3 text-[12.5px] text-danger">
          {transitionErrorMessage}
        </p>
      )}

      <section className="border border-hairline bg-raised">
        <div className="flex items-baseline justify-between gap-4 border-b border-hairline bg-surface px-4 py-3">
          <span className="font-mono text-[10px] tracking-[0.22em] uppercase">Lifecycle rack — 9 states</span>
          <span className="font-mono text-[10px] text-secondary uppercase">
            Current · {LIFECYCLE_LABEL[app.lifecycle_state]}
          </span>
        </div>
        <div className="px-4 pt-5 pb-4">
          <LifecycleStepper state={app.lifecycle_state} available={armed} />
        </div>
        <div className="px-4 pb-3.5">
          <LifecycleLegend />
        </div>
      </section>

      <div className="grid grid-cols-1 items-start gap-4.5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Governance approvals{supersededApprovals.length > 0 ? " — active round" : ""}</CardTitle>
            <span className={`font-mono text-[10px] ${outstanding === 0 ? "text-success" : "text-danger"}`}>
              {signedCount} / {APPROVAL_CATEGORIES.length}
            </span>
          </CardHeader>

          {APPROVAL_CATEGORIES.map((category) => {
            const decision = activeApprovals.find((a) => a.category === category);
            const requiredRole = SIGNOFF_CATEGORY_ROLE[category];
            const canSign = !!me && inReview && hasAnyRole(me.roles, [requiredRole]) && !isCreator && !decision;

            return (
              <div
                key={category}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3.5 border-b border-hairline px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-[13.5px] font-medium capitalize">{category.replace(/_/g, " ")}</p>
                  <p className="mt-0.5 font-mono text-[9.5px] tracking-[0.1em] text-warning uppercase">{requiredRole}</p>
                  {decision && (
                    <p className="mt-1 font-mono text-[10px] text-secondary">
                      {decision.decided_by} · {new Date(decision.decided_at).toLocaleString()}
                    </p>
                  )}
                </div>
                {decision ? (
                  <StatusPill tone={decisionTone(decision.decision)} label={DECISION_LABEL[decision.decision]} />
                ) : canSign ? (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="border-success text-success-ink"
                      disabled={recordApproval.isPending}
                      onClick={() => recordApproval.mutate({ category, decision: "approved" })}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="border-danger text-danger"
                      disabled={recordApproval.isPending}
                      onClick={() => recordApproval.mutate({ category, decision: "rejected" })}
                    >
                      Reject
                    </Button>
                  </div>
                ) : (
                  <StatusPill tone="warning" label="Pending" />
                )}
              </div>
            );
          })}

          {/* Prior rounds are struck through and hatched rather than
              recoloured. A superseded approval is not a *worse* approval —
              it is a record of a decision that no longer counts, and the
              hatch is this system's mark for "nothing lives here now". */}
          {supersededApprovals.length > 0 && (
            <>
              <div className="border-b border-hairline bg-raised px-4 py-2.5 font-mono text-[9.5px] tracking-[0.18em] text-secondary uppercase">
                Prior rounds — superseded
              </div>
              {supersededApprovals.map((a) => (
                <div
                  key={a.id}
                  className="hatch-fine grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3.5 border-b border-hairline px-4 py-2.5 opacity-70"
                >
                  <div>
                    <span className="text-[12.5px] capitalize line-through decoration-secondary">
                      {a.category.replace(/_/g, " ")}
                    </span>
                    <p className="mt-0.5 font-mono text-[9.5px] text-secondary">
                      {a.decided_by} · {new Date(a.decided_at).toLocaleString()}
                    </p>
                  </div>
                  <span className="font-mono text-[9px] tracking-[0.16em] text-secondary uppercase">
                    {DECISION_LABEL[a.decision]} · superseded {new Date(a.superseded_at!).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </>
          )}

          <TableNote>
            Governance Review closes on its own once every category has signed — it is never a manual transition.
          </TableNote>
        </Card>

        <div className="flex flex-col gap-4.5">
          <section className={`border ${app.risk_classification ? "border-hairline" : "border-warning"}`}>
            <div className="panel-head">
              <span>Risk classification</span>
              {canEditQuestionnaire && (
                <button
                  type="button"
                  onClick={() => setQuestionnaireOpen(true)}
                  className="font-mono text-[9px] tracking-[0.14em] text-accent uppercase hover:underline"
                >
                  {app.risk_questionnaire ? "Edit answers" : "Begin questionnaire"}
                </button>
              )}
            </div>

            <div className="flex flex-col gap-3.5 p-4">
              <div className="flex items-center gap-3.5">
                <div
                  className={`grid h-14.5 w-14.5 shrink-0 place-items-center border-2 font-mono text-xl font-semibold ${
                    app.risk_classification === "low"
                      ? "border-success text-success"
                      : app.risk_classification
                        ? "border-danger text-danger"
                        : "border-warning text-warning"
                  }`}
                >
                  {app.risk_classification ? TIER_CODE[app.risk_classification] : "?"}
                </div>
                <div className="min-w-0">
                  <div
                    className={`font-mono text-[10px] tracking-[0.18em] uppercase ${
                      app.risk_classification === "low"
                        ? "text-success"
                        : app.risk_classification
                          ? "text-danger"
                          : "text-warning"
                    }`}
                  >
                    {app.risk_classification ? `${app.risk_classification} risk` : "Unclassified"}
                  </div>
                  <p className="mt-1 text-[12.5px] leading-snug text-secondary">
                    {app.risk_questionnaire
                      ? `Suggested ${app.risk_questionnaire.suggested_classification} from ${QUESTIONNAIRE_FIELDS.length} answers — advisory only; a sign-off role sets the authoritative value.`
                      : "The questionnaire has not been completed. Until it is, this application stays Unclassified."}
                  </p>
                </div>
              </div>

              {app.risk_questionnaire ? (
                <div className="flex flex-col border-t border-hairline pt-1">
                  {QUESTIONNAIRE_FIELDS.map(({ key, label }) => (
                    <div
                      key={key}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-hairline py-2 last:border-b-0"
                    >
                      <span className="text-[12.5px] text-primary/80">{label}</span>
                      <span
                        className={`font-mono text-[10px] tracking-[0.16em] uppercase ${
                          app.risk_questionnaire![key] ? "text-danger" : "text-secondary"
                        }`}
                      >
                        {app.risk_questionnaire![key] ? "Yes" : "No"}
                      </span>
                    </div>
                  ))}
                  <p className="pt-2.5 font-mono text-[9.5px] text-secondary">
                    Completed {new Date(app.risk_questionnaire.completed_at).toLocaleString()} by{" "}
                    {app.risk_questionnaire.completed_by}
                  </p>
                </div>
              ) : (
                <div className="hatch flex flex-col items-center gap-2.5 border border-dashed border-strong px-4 py-7 text-center">
                  <div className="grid h-11 w-11 place-items-center border border-dashed border-strong font-mono text-base text-secondary">
                    ?
                  </div>
                  <div className="font-mono text-[10.5px] tracking-[0.2em] text-secondary uppercase">Not yet completed</div>
                  <p className="max-w-[42ch] text-[12.5px] leading-relaxed text-secondary">
                    Classification determines the evidence set required at Governance Review.
                  </p>
                  {canEditQuestionnaire && (
                    <Button variant="primary" size="sm" onClick={() => setQuestionnaireOpen(true)}>
                      <ClipboardList className="h-3 w-3" /> Begin questionnaire
                    </Button>
                  )}
                </div>
              )}
            </div>
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <DataRow label="Model version">{app.model_version_id}</DataRow>
            <DataRow label="Human review" tone={app.human_review_required ? "default" : "danger"}>
              {app.human_review_required ? "Required" : "Not required"}
            </DataRow>
            <DataRow label="Autonomous action" tone={app.autonomous_action_allowed ? "danger" : "default"}>
              {app.autonomous_action_allowed ? "Allowed" : "Denied"}
            </DataRow>
            <DataRow label="External network" tone={app.external_network_allowed ? "danger" : "default"}>
              {app.external_network_allowed ? "Allowed" : "Denied"}
            </DataRow>
            <DataRow label="Permitted data">{app.permitted_data.join(", ") || "—"}</DataRow>
            <DataRow label="Restricted data" tone="danger">
              {app.restricted_data.join(", ") || "—"}
            </DataRow>
            {/* The production access rule itself — gateway checklist step 3
                denies any caller holding none of these roles. Worth showing
                plainly next to the data scope, not just editable in a form. */}
            <DataRow label="Permitted users" tone={app.permitted_role_ids.length === 0 ? "danger" : "default"}>
              {app.permitted_role_ids.length === 0
                ? "None — no one can call this in Production"
                : app.permitted_role_ids.map((id) => roles?.find((r) => r.id === id)?.name ?? id).join(", ")}
            </DataRow>
            <DataRow label="Created">{new Date(app.created_at).toLocaleString()}</DataRow>
          </Card>
        </div>
      </div>

      <Modal open={suspendOpen} onClose={() => setSuspendOpen(false)} title="Confirm — emergency suspend" tone="danger">
        <p className="text-[14.5px] leading-relaxed">
          Suspending halts all inference for <strong>{app.name}</strong> in staging and production. Re-entry requires a
          full new Governance Review — never straight back to Production.
        </p>
        <dl className="border border-hairline bg-raised p-3 font-mono text-[10.5px] leading-[1.7] text-secondary">
          <div className="flex gap-3">
            <dt className="w-16 shrink-0 tracking-[0.14em] uppercase">Effect</dt>
            <dd>immediate · reversible only through review</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-16 shrink-0 tracking-[0.14em] uppercase">Audit</dt>
            <dd>application.suspended</dd>
          </div>
        </dl>
        <label className="flex flex-col gap-1.5">
          <span className="label-mono">Reason</span>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="field resize-y" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-mono">
            Type <span className="text-primary normal-case">{app.name}</span> to confirm
          </span>
          <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className="field field-mono" />
        </label>
        <div className="flex justify-end gap-2.5">
          <Button variant="secondary" onClick={() => setSuspendOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={confirmText !== app.name || !reason || suspend.isPending}
            onClick={() => suspend.mutate(reason, { onSuccess: () => setSuspendOpen(false) })}
          >
            Suspend now
          </Button>
        </div>
      </Modal>

      <Modal open={retireOpen} onClose={() => setRetireOpen(false)} title="Confirm — retire application" tone="danger">
        <p className="text-[14.5px] leading-relaxed">
          This permanently retires <strong>{app.name}</strong>. Retired is a terminal state — there is no transition
          back out of it.
        </p>
        <div className="flex justify-end gap-2.5">
          <Button variant="secondary" onClick={() => setRetireOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={transition.isPending}
            onClick={() => transition.mutate("retired", { onSuccess: () => setRetireOpen(false) })}
          >
            Retire now
          </Button>
        </div>
      </Modal>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit application">
        <ApplicationEditForm
          app={app}
          roles={roles ?? []}
          pending={update.isPending}
          error={
            update.error instanceof ApiError
              ? update.error.detail
              : update.error instanceof Error
                ? update.error.message
                : null
          }
          onCancel={() => setEditOpen(false)}
          onSubmit={(body) => update.mutate(body, { onSuccess: () => setEditOpen(false) })}
        />
      </Modal>

      <Modal open={questionnaireOpen} onClose={() => setQuestionnaireOpen(false)} title="Risk classification questionnaire">
        <RiskQuestionnaireForm
          initial={app.risk_questionnaire}
          pending={submitQuestionnaire.isPending}
          onCancel={() => setQuestionnaireOpen(false)}
          onSubmit={(body) => submitQuestionnaire.mutate(body, { onSuccess: () => setQuestionnaireOpen(false) })}
        />
      </Modal>
    </>
  );
}

function RiskQuestionnaireForm({
  initial,
  pending,
  onCancel,
  onSubmit,
}: {
  initial: { [K in keyof RiskQuestionnaireIn]: boolean } | null;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (body: RiskQuestionnaireIn) => void;
}) {
  const [answers, setAnswers] = useState<RiskQuestionnaireIn>(() => {
    const defaults = {} as RiskQuestionnaireIn;
    for (const { key } of QUESTIONNAIRE_FIELDS) defaults[key] = initial?.[key] ?? false;
    return defaults;
  });

  const suggested = computeSuggestedClassification(answers);

  return (
    <>
      <p className="text-[13px] leading-relaxed text-secondary">
        Does the application… (§15 — advisory only, never authoritative; a sign-off role sets the real value.)
      </p>
      <div className="max-h-96 overflow-y-auto border border-hairline">
        {QUESTIONNAIRE_FIELDS.map(({ key, label }) => (
          <div
            key={key}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-hairline px-3 py-2.5 last:border-b-0"
          >
            <span className="text-[13px]">{label}</span>
            <YesNo value={answers[key]} onChange={(v) => setAnswers((a) => ({ ...a, [key]: v }))} label={label} />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 border-t border-hairline pt-3">
        <span className="label-mono">Suggested classification</span>
        <StatusPill tone={riskTone(suggested)} label={suggested} />
      </div>
      <div className="flex justify-end gap-2.5">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" disabled={pending} onClick={() => onSubmit(answers)}>
          {pending ? "Submitting…" : "Submit"}
        </Button>
      </div>
    </>
  );
}

function ApplicationEditForm({
  app,
  roles,
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  app: ApplicationDetail;
  roles: Role[];
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (body: ApplicationUpdateIn) => void;
}) {
  const [name, setName] = useState(app.name);
  const [purpose, setPurpose] = useState(app.purpose ?? "");
  const [permittedData, setPermittedData] = useState(app.permitted_data.join(", "));
  const [restrictedData, setRestrictedData] = useState(app.restricted_data.join(", "));
  const [humanReview, setHumanReview] = useState(app.human_review_required);
  const [autonomous, setAutonomous] = useState(app.autonomous_action_allowed);
  const [externalNetwork, setExternalNetwork] = useState(app.external_network_allowed);
  const [roleIds, setRoleIds] = useState<Set<string>>(new Set(app.permitted_role_ids));

  const parseList = (s: string) => s.split(",").map((v) => v.trim()).filter(Boolean);

  // Send only what actually changed. The backend PATCH uses
  // `exclude_unset`, and for `permitted_role_ids` specifically it deletes
  // and re-inserts every join row whenever the field is present — so
  // sending an unchanged value would churn rows for no reason.
  const buildBody = (): ApplicationUpdateIn => {
    const body: ApplicationUpdateIn = {};
    const permitted = parseList(permittedData);
    const restricted = parseList(restrictedData);
    const nextRoleIds = [...roleIds];
    const sameList = (a: string[], b: string[]) =>
      a.length === b.length && [...a].sort().join(" ") === [...b].sort().join(" ");

    if (name !== app.name) body.name = name;
    if (purpose !== (app.purpose ?? "")) body.purpose = purpose;
    if (!sameList(permitted, app.permitted_data)) body.permitted_data = permitted;
    if (!sameList(restricted, app.restricted_data)) body.restricted_data = restricted;
    if (humanReview !== app.human_review_required) body.human_review_required = humanReview;
    if (autonomous !== app.autonomous_action_allowed) body.autonomous_action_allowed = autonomous;
    if (externalNetwork !== app.external_network_allowed) body.external_network_allowed = externalNetwork;
    if (!sameList(nextRoleIds, app.permitted_role_ids)) body.permitted_role_ids = nextRoleIds;
    return body;
  };

  const changedCount = Object.keys(buildBody()).length;

  return (
    <>
      {error && <p className="border border-danger border-l-4 bg-danger-bg px-3 py-2 text-[12px] text-danger">{error}</p>}

      <div className="flex max-h-[60vh] flex-col gap-3.5 overflow-y-auto pr-1">
        <label className="flex flex-col gap-1.5">
          <span className="label-mono">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="field" />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="label-mono">Purpose</span>
          <textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} rows={2} className="field resize-y" />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="label-mono">Permitted data</span>
          <input
            value={permittedData}
            onChange={(e) => setPermittedData(e.target.value)}
            placeholder="comma-separated"
            className="field"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="label-mono">Restricted data</span>
          <input
            value={restrictedData}
            onChange={(e) => setRestrictedData(e.target.value)}
            placeholder="comma-separated"
            className="field"
          />
        </label>

        <div className="flex flex-col border-t border-hairline pt-1">
          <EditBool label="Human review required" value={humanReview} onChange={setHumanReview} />
          <EditBool label="Autonomous action allowed" value={autonomous} onChange={setAutonomous} />
          <EditBool label="External network allowed" value={externalNetwork} onChange={setExternalNetwork} />
        </div>

        <div className="flex flex-col gap-2 border-t border-hairline pt-3">
          <span className="label-mono">Permitted users — roles allowed to call this in Production</span>
          <div className="flex flex-wrap gap-2">
            {roles.map((role) => {
              const checked = roleIds.has(role.id);
              return (
                <button
                  key={role.id}
                  type="button"
                  aria-pressed={checked}
                  onClick={() =>
                    setRoleIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(role.id)) next.delete(role.id);
                      else next.add(role.id);
                      return next;
                    })
                  }
                  className={`border px-3 py-1.5 font-mono text-[9.5px] tracking-[0.12em] uppercase transition-colors ${
                    checked ? "border-accent bg-accent-bg text-accent" : "border-strong text-secondary hover:text-primary"
                  }`}
                >
                  {role.name}
                </button>
              );
            })}
          </div>
        </div>

        <p className="border-t border-hairline pt-3 font-mono text-[9.5px] leading-relaxed text-secondary">
          The bound Model Version cannot be changed here — rebinding would invalidate any governance approval already
          recorded against it. Create a new Application instead.
        </p>
      </div>

      <div className="flex justify-end gap-2.5 border-t border-hairline pt-3.5">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={pending || changedCount === 0 || name.trim().length === 0}
          onClick={() => onSubmit(buildBody())}
        >
          {pending ? "Saving…" : changedCount === 0 ? "No changes" : `Save ${changedCount} change${changedCount === 1 ? "" : "s"}`}
        </Button>
      </div>
    </>
  );
}

function EditBool({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-hairline py-2.5 last:border-b-0">
      <span className="text-[13px]">{label}</span>
      <YesNo value={value} onChange={onChange} label={label} />
    </div>
  );
}

function YesNo({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex shrink-0 border border-strong">
      <button
        type="button"
        aria-pressed={value}
        onClick={() => onChange(true)}
        className={`px-3.5 py-1.5 font-mono text-[10px] tracking-[0.16em] uppercase ${
          value ? "bg-rule text-surface" : "text-secondary hover:text-primary"
        }`}
      >
        Yes
      </button>
      <button
        type="button"
        aria-pressed={!value}
        onClick={() => onChange(false)}
        className={`px-3.5 py-1.5 font-mono text-[10px] tracking-[0.16em] uppercase ${
          !value ? "bg-rule text-surface" : "text-secondary hover:text-primary"
        }`}
      >
        No
      </button>
    </div>
  );
}
