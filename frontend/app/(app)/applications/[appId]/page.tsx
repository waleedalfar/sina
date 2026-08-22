"use client";

import { use, useState } from "react";
import { motion } from "framer-motion";
import { ShieldAlert, CheckCircle2, XCircle, Clock3, RotateCcw } from "lucide-react";
import { useApplication, useApplicationMutations } from "@/lib/hooks/useApplication";
import { useMe } from "@/lib/hooks/useMe";
import { LifecycleStepper } from "@/components/lifecycle/LifecycleStepper";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Modal } from "@/components/ui/Modal";
import { decisionTone, riskTone, DECISION_LABEL } from "@/lib/status";
import { hasAnyRole, SIGNOFF_CATEGORY_ROLE, SUSPEND_ROLES } from "@/lib/auth/roles";
import type { ApprovalCategory, ApprovalDecision } from "@/types/api";

const APPROVAL_CATEGORIES: ApprovalCategory[] = ["clinical_safety", "privacy", "security", "ai_governance", "compliance"];

export default function ApplicationDetailPage({ params }: { params: Promise<{ appId: string }> }) {
  const { appId } = use(params);
  const { data: app, isLoading } = useApplication(appId);
  const { data: me } = useMe();
  const { recordApproval, suspend, transition } = useApplicationMutations(appId);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [reason, setReason] = useState("");

  if (isLoading || !app) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const activeApprovals = app.approvals.filter((a) => !a.superseded_at);
  const supersededApprovals = app.approvals.filter((a) => a.superseded_at);
  const isCreator = me?.id === app.created_by;
  const canSuspend = me && hasAnyRole(me.roles, SUSPEND_ROLES) && (app.lifecycle_state === "staging" || app.lifecycle_state === "production");
  const canReenterReview = me && hasAnyRole(me.roles, ["Platform Administrator"]) && app.lifecycle_state === "suspended";

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
        </div>
      </div>

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
            <Detail label="Created" value={new Date(app.created_at).toLocaleString()} />
          </CardContent>
        </Card>
      </div>

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

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-tertiary">{label}</span>
      <span className={`text-xs text-right text-primary ${mono ? "font-mono truncate max-w-[140px]" : ""}`}>{value}</span>
    </div>
  );
}
