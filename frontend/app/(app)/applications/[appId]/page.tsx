"use client";

import { use, useState } from "react";
import { motion } from "framer-motion";
import {
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Clock3,
  RotateCcw,
  ArrowRight,
  Archive,
  ClipboardList,
  Pencil,
} from "lucide-react";
import { useApplication, useApplicationMutations } from "@/lib/hooks/useApplication";
import { useMe } from "@/lib/hooks/useMe";
import { useRoles } from "@/lib/hooks/useIdentity";
import { LifecycleStepper } from "@/components/lifecycle/LifecycleStepper";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { ResourceState } from "@/components/ui/ResourceState";
import { Modal } from "@/components/ui/Modal";
import { decisionTone, riskTone, DECISION_LABEL } from "@/lib/status";
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
import type { ApplicationDetail, ApprovalCategory, ApprovalDecision, LifecycleState, RiskClassification, Role } from "@/types/api";
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
      <div className="space-y-4">
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
        backLabel="Back to Applications"
        onRetry={() => refetch()}
      />
    );
  }

  const activeApprovals = app.approvals.filter((a) => !a.superseded_at);
  const supersededApprovals = app.approvals.filter((a) => a.superseded_at);
  const isCreator = me?.id === app.created_by;
  const canSuspend = me && hasAnyRole(me.roles, SUSPEND_ROLES) && (app.lifecycle_state === "staging" || app.lifecycle_state === "production");
  const canReenterReview = me && hasAnyRole(me.roles, REENTER_REVIEW_ROLES) && app.lifecycle_state === "suspended";
  const canRetire =
    me &&
    hasAnyRole(me.roles, RETIRE_ROLES) &&
    (NON_TERMINAL_LIFECYCLE_STATES as readonly string[]).includes(app.lifecycle_state);
  const canEditQuestionnaire = me && hasAnyRole(me.roles, RISK_QUESTIONNAIRE_ROLES);

  // Mirrors backend/app/governance/router.py's update_application guard
  // exactly (creator-only, draft/development only), for the same reason the
  // separation-of-duties matrix is mirrored on the Identity page: tell the
  // user why an action is unavailable *before* they attempt it, rather than
  // letting the server produce a bare 403/409 after the fact. The server
  // remains the authority — this is an explanation, not the enforcement.
  const isEditableState = app.lifecycle_state === "draft" || app.lifecycle_state === "development";
  // Shown to the creator only (same as the manual forward-transition button
  // above), disabled-with-a-reason rather than hidden once the window closes.
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
    manualNext !== null && me && (manualNextRoles === null ? isCreator : hasAnyRole(me.roles, manualNextRoles));

  const transitionErrorMessage =
    transition.error instanceof ApiError
      ? transition.error.detail
      : transition.error instanceof Error
        ? transition.error.message
        : null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg font-semibold text-primary">{app.name}</h1>
            <StatusPill tone={riskTone(app.risk_classification)} label={app.risk_classification ?? "Unclassified"} />
          </div>
          <p className="text-sm text-secondary mt-1">{app.purpose ?? "No purpose recorded."}</p>
        </div>
        <div className="flex items-center gap-2">
          {isCreator && (
            <Button
              variant="secondary"
              size="sm"
              disabled={!canEdit}
              title={canEdit ? undefined : editLockedReason}
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
          )}
          {canManualNext && manualNext && (
            <Button variant="primary" size="sm" onClick={() => transition.mutate(manualNext.to)} disabled={transition.isPending}>
              {manualNext.label} <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}
          {canReenterReview && (
            <Button variant="secondary" size="sm" onClick={() => transition.mutate("governance_review")} disabled={transition.isPending}>
              <RotateCcw className="h-3.5 w-3.5" /> Re-enter Governance Review
            </Button>
          )}
          {canSuspend && (
            <Button variant="danger" size="sm" onClick={() => setSuspendOpen(true)}>
              <ShieldAlert className="h-3.5 w-3.5" /> Emergency Suspend
            </Button>
          )}
          {canRetire && (
            <Button variant="ghost" size="sm" onClick={() => setRetireOpen(true)}>
              <Archive className="h-3.5 w-3.5" /> Retire
            </Button>
          )}
        </div>
      </div>

      {isCreator && !canEdit && (
        // Visible, not just a `title` tooltip — same principle the admin
        // Identities page uses for conflicting role grants: say why the
        // action is off before it's attempted.
        <p className="text-xs text-tertiary">{editLockedReason}</p>
      )}

      {transitionErrorMessage && (
        <div className="rounded-lg border border-danger/30 bg-danger-bg px-4 py-2.5 text-xs text-danger">
          {transitionErrorMessage}
        </div>
      )}

      <Card className="overflow-x-auto p-6">
        <LifecycleStepper state={app.lifecycle_state} />
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Governance Approvals — Active Cycle</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-[var(--color-border-hairline)]">
              {APPROVAL_CATEGORIES.map((category) => {
                const decision = activeApprovals.find((a) => a.category === category);
                const requiredRole = SIGNOFF_CATEGORY_ROLE[category];
                const canSign =
                  me &&
                  app.lifecycle_state === "governance_review" &&
                  hasAnyRole(me.roles, [requiredRole]) &&
                  !isCreator &&
                  !decision;

                return (
                  <li key={category} className="flex items-center justify-between px-5 py-3.5">
                    <div>
                      <p className="text-sm font-medium text-primary capitalize">{category.replace("_", " ")}</p>
                      <p className="text-xs text-tertiary">{requiredRole}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {decision ? (
                        <StatusPill tone={decisionTone(decision.decision)} label={DECISION_LABEL[decision.decision]} />
                      ) : canSign ? (
                        <ApprovalActions
                          onDecide={(d) => recordApproval.mutate({ category, decision: d })}
                          pending={recordApproval.isPending}
                        />
                      ) : (
                        <StatusPill tone="neutral" label="Pending" icon={Clock3} />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Detail label="Model Version" value={app.model_version_id} mono />
            <Detail label="Human Review Required" value={app.human_review_required ? "Yes" : "No"} />
            <Detail label="Autonomous Action" value={app.autonomous_action_allowed ? "Allowed" : "Not allowed"} />
            <Detail label="External Network" value={app.external_network_allowed ? "Allowed" : "Not allowed"} />
            <Detail label="Permitted Data" value={app.permitted_data.join(", ") || "—"} />
            <Detail label="Restricted Data" value={app.restricted_data.join(", ") || "—"} />
            {/* The production access rule itself — gateway checklist step 3
                denies any caller holding none of these roles. Worth showing
                plainly next to the data scope, not just editable in a form. */}
            <Detail
              label="Permitted Users"
              value={
                app.permitted_role_ids.length === 0
                  ? "None — no one can call this in Production"
                  : app.permitted_role_ids
                      .map((id) => roles?.find((r) => r.id === id)?.name ?? id)
                      .join(", ")
              }
            />
            <Detail label="Created" value={new Date(app.created_at).toLocaleString()} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Risk Classification Questionnaire</CardTitle>
          {canEditQuestionnaire && (
            <Button variant="ghost" size="sm" onClick={() => setQuestionnaireOpen(true)}>
              {app.risk_questionnaire ? (
                <>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </>
              ) : (
                <>
                  <ClipboardList className="h-3.5 w-3.5" /> Complete Questionnaire
                </>
              )}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {app.risk_questionnaire ? (
            <>
              <div className="mb-4 flex items-center gap-2">
                <span className="text-xs text-tertiary">Suggested classification</span>
                <StatusPill
                  tone={riskTone(app.risk_questionnaire.suggested_classification)}
                  label={app.risk_questionnaire.suggested_classification}
                />
                <span className="text-[11px] text-tertiary">
                  — advisory only; a sign-off role sets the authoritative classification shown above.
                </span>
              </div>
              <ul className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                {QUESTIONNAIRE_FIELDS.map(({ key, label }) => (
                  <li key={key} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-secondary">{label}</span>
                    <span className={app.risk_questionnaire![key] ? "text-primary font-medium" : "text-tertiary"}>
                      {app.risk_questionnaire![key] ? "Yes" : "No"}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-tertiary">
                Completed {new Date(app.risk_questionnaire.completed_at).toLocaleString()} by{" "}
                <span className="font-mono">{app.risk_questionnaire.completed_by}</span>
              </p>
            </>
          ) : (
            <p className="text-sm text-tertiary">Not yet completed.</p>
          )}
        </CardContent>
      </Card>

      {supersededApprovals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Prior Review Cycles</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-[var(--color-border-hairline)] opacity-60">
              {supersededApprovals.map((a) => (
                <li key={a.id} className="flex items-center justify-between px-5 py-2.5">
                  <span className="text-xs text-secondary capitalize">{a.category.replace("_", " ")}</span>
                  <div className="flex items-center gap-2">
                    <StatusPill tone={decisionTone(a.decision)} label={DECISION_LABEL[a.decision]} />
                    <span className="text-[10px] text-tertiary">superseded {new Date(a.superseded_at!).toLocaleDateString()}</span>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Modal open={suspendOpen} onClose={() => setSuspendOpen(false)} title="Emergency suspend">
        <p className="text-sm text-secondary mb-3">
          This immediately stops <strong className="text-primary">{app.name}</strong> from serving traffic. Re-entry
          requires a full new Governance Review — never straight back to Production.
        </p>
        <label className="text-xs text-tertiary">Reason</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-1 w-full rounded-lg border border-hairline bg-raised px-3 py-2 text-sm text-primary outline-none focus:border-cyan"
          rows={2}
        />
        <label className="text-xs text-tertiary mt-3 block">
          Type <span className="font-mono text-primary">{app.name}</span> to confirm
        </label>
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          className="mt-1 w-full rounded-lg border border-hairline bg-raised px-3 py-2 text-sm text-primary outline-none focus:border-cyan"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setSuspendOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={confirmText !== app.name || !reason || suspend.isPending}
            onClick={() => suspend.mutate(reason, { onSuccess: () => setSuspendOpen(false) })}
          >
            Suspend now
          </Button>
        </div>
      </Modal>

      <Modal open={retireOpen} onClose={() => setRetireOpen(false)} title="Retire application">
        <p className="text-sm text-secondary">
          This permanently retires <strong className="text-primary">{app.name}</strong>. Retired is a terminal
          state — there is no transition back out of it.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setRetireOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
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

      <Modal
        open={questionnaireOpen}
        onClose={() => setQuestionnaireOpen(false)}
        title="Risk classification questionnaire"
      >
        <RiskQuestionnaireForm
          initial={app.risk_questionnaire}
          pending={submitQuestionnaire.isPending}
          onCancel={() => setQuestionnaireOpen(false)}
          onSubmit={(body) => submitQuestionnaire.mutate(body, { onSuccess: () => setQuestionnaireOpen(false) })}
        />
      </Modal>
    </div>
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
    <div>
      <p className="text-sm text-secondary mb-1">
        Does the application... (§15 — advisory only, never authoritative; see the classification
        badge for who sets the real value).
      </p>
      <ul className="max-h-96 overflow-y-auto divide-y divide-[var(--color-border-hairline)] -mx-1">
        {QUESTIONNAIRE_FIELDS.map(({ key, label }) => (
          <li key={key} className="flex items-center justify-between gap-3 px-1 py-2.5">
            <span className="text-sm text-primary">{label}</span>
            <div className="flex items-center gap-1 rounded-lg border border-hairline bg-raised p-0.5 shrink-0">
              <ToggleOption label="No" selected={!answers[key]} onClick={() => setAnswers((a) => ({ ...a, [key]: false }))} />
              <ToggleOption label="Yes" selected={answers[key]} onClick={() => setAnswers((a) => ({ ...a, [key]: true }))} />
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-center gap-2 border-t border-hairline pt-4">
        <span className="text-xs text-tertiary">Suggested classification</span>
        <StatusPill tone={riskTone(suggested)} label={suggested} />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" disabled={pending} onClick={() => onSubmit(answers)}>
          Submit
        </Button>
      </div>
    </div>
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
      a.length === b.length && [...a].sort().join(" ") === [...b].sort().join(" ");

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
    <div>
      {error && (
        <div className="mb-3 rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">{error}</div>
      )}

      <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
        <EditField label="Name" value={name} onChange={setName} />

        <div>
          <label className="text-xs text-tertiary">Purpose</label>
          <textarea
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-lg border border-hairline bg-raised px-3 py-2 text-sm text-primary outline-none focus:border-cyan"
          />
        </div>

        <EditField label="Permitted data" placeholder="comma-separated" value={permittedData} onChange={setPermittedData} />
        <EditField label="Restricted data" placeholder="comma-separated" value={restrictedData} onChange={setRestrictedData} />

        <div className="space-y-2.5 border-t border-hairline pt-3">
          <EditBool label="Human review required" value={humanReview} onChange={setHumanReview} />
          <EditBool label="Autonomous action allowed" value={autonomous} onChange={setAutonomous} />
          <EditBool label="External network allowed" value={externalNetwork} onChange={setExternalNetwork} />
        </div>

        <div className="border-t border-hairline pt-3">
          <label className="text-xs text-tertiary">Permitted users (roles allowed to use this in Production)</label>
          <div className="mt-2 flex flex-wrap gap-2">
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
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-150 ${
                    checked ? "border-cyan/40 bg-cyan/15 text-cyan" : "border-hairline bg-raised text-tertiary hover:text-secondary"
                  }`}
                >
                  {role.name}
                </button>
              );
            })}
          </div>
        </div>

        <p className="text-[11px] text-tertiary border-t border-hairline pt-3">
          The bound Model Version can&apos;t be changed here — rebinding would invalidate any governance approval
          already recorded against it. Create a new Application instead.
        </p>
      </div>

      <div className="mt-4 flex justify-end gap-2 border-t border-hairline pt-4">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={pending || changedCount === 0 || name.trim().length === 0}
          onClick={() => onSubmit(buildBody())}
        >
          {pending ? "Saving…" : changedCount === 0 ? "No changes" : `Save ${changedCount} change${changedCount === 1 ? "" : "s"}`}
        </Button>
      </div>
    </div>
  );
}

function EditField({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-xs text-tertiary">{label}</label>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-hairline bg-raised px-3 py-2 text-sm text-primary outline-none focus:border-cyan placeholder:text-tertiary"
      />
    </div>
  );
}

function EditBool({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-primary">{label}</span>
      <div className="flex items-center gap-1 rounded-lg border border-hairline bg-raised p-0.5 shrink-0">
        <ToggleOption label="No" selected={!value} onClick={() => onChange(false)} />
        <ToggleOption label="Yes" selected={value} onClick={() => onChange(true)} />
      </div>
    </div>
  );
}

function ApprovalActions({ onDecide, pending }: { onDecide: (d: ApprovalDecision) => void; pending: boolean }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-1.5">
      <Button variant="secondary" size="sm" disabled={pending} onClick={() => onDecide("approved")}>
        <CheckCircle2 className="h-3.5 w-3.5 text-success" /> Approve
      </Button>
      <Button variant="secondary" size="sm" disabled={pending} onClick={() => onDecide("rejected")}>
        <XCircle className="h-3.5 w-3.5 text-danger" /> Reject
      </Button>
    </motion.div>
  );
}

function ToggleOption({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-md px-3 py-1 text-xs font-medium transition-colors duration-150 ${
        selected ? "bg-cyan/15 text-cyan" : "text-tertiary hover:text-secondary"
      }`}
    >
      {label}
    </button>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-tertiary">{label}</span>
      <span className={`text-xs text-right text-primary ${mono ? "font-mono truncate max-w-[140px]" : ""}`}>{value}</span>
    </div>
  );
}
