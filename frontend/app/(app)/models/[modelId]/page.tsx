"use client";

import { use, useState } from "react";
import Link from "next/link";
import { Boxes, FlaskConical, Pencil, Play, Plus, Square } from "lucide-react";
import {
  useModel,
  useUpdateModel,
  useModelDashboardRows,
  useModelVersionDetail,
  useModelVersionRuntimeState,
  useEvaluationRuns,
  useModelVersionMutations,
} from "@/lib/hooks/useModel";
import { useTriggerEvaluationRun } from "@/lib/hooks/useEvaluation";
import { useMe } from "@/lib/hooks/useMe";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusPill } from "@/components/ui/StatusPill";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { ResourceState, EmptyState } from "@/components/ui/ResourceState";
import { DataRow } from "@/components/ui/DataList";
import { TableNote } from "@/components/ui/Table";
import {
  decisionTone,
  riskTone,
  runtimeTone,
  scanTone,
  RUNTIME_LABEL,
  DECISION_LABEL,
} from "@/lib/status";
import {
  hasAnyRole,
  START_STOP_MODEL_ROLES,
  SET_MODEL_RISK_ROLES,
  RECORD_MODEL_APPROVAL_ROLES,
  IMPORT_MODEL_VERSION_ROLES,
  EVALUATION_TRIGGER_ROLES,
} from "@/lib/auth/roles";
import { ApiError } from "@/lib/api/client";
import type { ModelDashboardRow, RiskClassification, ApprovalDecision } from "@/types/api";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

export default function ModelDetailPage({ params }: { params: Promise<{ modelId: string }> }) {
  const { modelId } = use(params);
  const { data: model, isLoading: modelLoading, error, refetch } = useModel(modelId);
  const updateModel = useUpdateModel(modelId);
  const [editing, setEditing] = useState(false);
  const { data: rows, isLoading: rowsLoading } = useModelDashboardRows(modelId);
  const { data: me } = useMe();
  const canImport = !!me && hasAnyRole(me.roles, IMPORT_MODEL_VERSION_ROLES);

  if (modelLoading || rowsLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (!model) {
    return (
      <ResourceState error={error} resource="model" backHref="/models" backLabel="Back to models" onRetry={() => refetch()} />
    );
  }

  const approvedCount = (rows ?? []).filter((r) => r.ai_governance_decision === "approved").length;

  return (
    <>
      <PageHeader
        eyebrow={`Models / ${model.name}`}
        title={model.name}
        aside={
          <>
            <div className="mt-2.5 flex flex-wrap gap-2.5">
              <span className="border border-hairline border-l-4 border-l-success bg-raised px-2.5 py-1 font-mono text-[10px] tracking-[0.18em] uppercase">
                {rows?.length ?? 0} versions · {approvedCount} approved
              </span>
              <span className="border border-hairline px-2.5 py-1 font-mono text-[10px] tracking-[0.18em] text-warning uppercase">
                Local weights
              </span>
            </div>

            {editing ? (
              <ModelEditForm
                name={model.name}
                description={model.description}
                pending={updateModel.isPending}
                error={
                  updateModel.error instanceof ApiError
                    ? updateModel.error.detail
                    : updateModel.error instanceof Error
                      ? updateModel.error.message
                      : null
                }
                onCancel={() => setEditing(false)}
                onSubmit={(body) => updateModel.mutate(body, { onSuccess: () => setEditing(false) })}
              />
            ) : (
              <p className="mt-3 max-w-[70ch] text-[13.5px] leading-relaxed text-secondary">
                {model.description ?? <span className="italic">No description recorded.</span>}
              </p>
            )}
          </>
        }
        actions={
          canImport && !editing ? (
            <>
              {/* Same role as importing a version and as creating the Model:
                  whoever can register a Model owns its metadata. Mirrored
                  client-side to hide the action, not to enforce it — the
                  backend requires ML Engineer independently. */}
              <Button variant="secondary" onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
              <Link href={`/models/${modelId}/import`}>
                <Button variant="primary">
                  <Plus className="h-3.5 w-3.5" /> Import version
                </Button>
              </Link>
            </>
          ) : undefined
        }
      />

      {rows && rows.length === 0 && (
        <EmptyState
          icon={Boxes}
          title="No versions imported yet"
          description="A model with no version cannot back an application. Import a weights archive to start."
          action={
            canImport ? (
              <Link href={`/models/${modelId}/import`}>
                <Button variant="primary" size="sm">
                  <Plus className="h-3 w-3" /> Import version
                </Button>
              </Link>
            ) : undefined
          }
        />
      )}

      {rows?.map((row) => (
        <VersionPanel key={row.version_id} modelId={modelId} row={row} />
      ))}

      {rows && rows.length > 0 && (
        <TableNote className="px-0">
          A version cannot be approved without evaluation evidence attached, and runtime controls stay disabled for a
          version that did not clear the malware scan.
        </TableNote>
      )}
    </>
  );
}

/** Editing happens in place, inside a teal-ringed panel, rather than in a
 * modal: the thing being edited stays on screen and in context. */
function ModelEditForm({
  name: initialName,
  description: initialDescription,
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  name: string;
  description: string | null;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (body: { name?: string; description?: string | null }) => void;
}) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? "");

  const changed = name !== initialName || description !== (initialDescription ?? "");

  const build = () => {
    const body: { name?: string; description?: string | null } = {};
    if (name !== initialName) body.name = name;
    if (description !== (initialDescription ?? "")) body.description = description || null;
    return body;
  };

  return (
    <div className="mt-3.5 flex max-w-2xl flex-col gap-2.5 border border-accent bg-input p-3">
      <div className="font-mono text-[9px] tracking-[0.2em] text-accent uppercase">Editing model</div>
      {error && <p className="border border-danger border-l-4 bg-danger-bg px-3 py-2 text-[12px] text-danger">{error}</p>}
      <label className="flex flex-col gap-1.5">
        <span className="label-mono">Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} className="field" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="label-mono">Description</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="field resize-y leading-relaxed"
        />
      </label>
      <p className="font-mono text-[9.5px] leading-relaxed text-secondary">
        Renaming is recorded in the audit trail. This name appears next to every governance approval already recorded
        against this model&apos;s versions, so the previous value has to stay recoverable. Imported versions themselves
        cannot be edited at all.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={pending || !changed || name.trim().length === 0}
          onClick={() => onSubmit(build())}
        >
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

function VersionPanel({ modelId, row }: { modelId: string; row: ModelDashboardRow }) {
  const { data: full } = useModelVersionDetail(modelId, row.version_id);
  const { data: runtime } = useModelVersionRuntimeState(row.version_id);
  const { data: runs } = useEvaluationRuns(row.version_id);
  const { data: me } = useMe();
  const { start, stop, setRiskClassification, recordApproval } = useModelVersionMutations(row.version_id);
  const triggerEval = useTriggerEvaluationRun(row.version_id);
  const [evidenceRunId, setEvidenceRunId] = useState("");

  const canStartStop = !!me && hasAnyRole(me.roles, START_STOP_MODEL_ROLES);
  const canSetRisk = !!me && hasAnyRole(me.roles, SET_MODEL_RISK_ROLES);
  const canTriggerEval = !!me && hasAnyRole(me.roles, EVALUATION_TRIGGER_ROLES);
  const isImporter = full && me?.id === full.imported_by;
  const canApprove = !!me && hasAnyRole(me.roles, RECORD_MODEL_APPROVAL_ROLES) && !isImporter && !row.ai_governance_decision;
  const completeRuns = (runs ?? []).filter((r) => r.status === "complete");
  const latestRun = runs?.[0];

  const isRunning = row.runtime_status === "running" || row.runtime_status === "starting";
  const isClean = full?.malware_scan_result === "clean";

  const mutationError = [start.error, stop.error, setRiskClassification.error, recordApproval.error].find(
    (e): e is Error => e instanceof Error,
  );
  const mutationErrorMessage = mutationError instanceof ApiError ? mutationError.detail : mutationError?.message;

  // The spine says whether this version may be used at all, which is the
  // approval decision — not whether it happens to be running.
  const spine =
    row.ai_governance_decision === "approved"
      ? "border-l-success"
      : row.ai_governance_decision
        ? "border-l-danger"
        : "border-l-warning";

  return (
    <section className={`border border-l-4 border-hairline bg-surface ${spine}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline bg-raised px-4 py-3">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[15px] font-semibold">{row.version_label}</span>
          <span className="font-mono text-[9.5px] tracking-[0.14em] text-secondary uppercase">
            {full?.format ?? "gguf"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill
            tone={scanTone(full?.malware_scan_result ?? "pending")}
            label={`Scan: ${full?.malware_scan_result ?? "pending"}`}
          />
          <StatusPill
            tone={runtimeTone(row.runtime_status)}
            label={RUNTIME_LABEL[row.runtime_status]}
            live={row.runtime_status === "running"}
          />
          {row.ai_governance_decision ? (
            <StatusPill tone={decisionTone(row.ai_governance_decision)} label={DECISION_LABEL[row.ai_governance_decision]} />
          ) : (
            <StatusPill tone="warning" label="Unapproved" />
          )}
          {runtime?.production_eligible && <StatusPill tone="success" label="Production eligible" />}
        </div>
      </div>

      {mutationErrorMessage && (
        <p className="border-b border-danger bg-danger-bg px-4 py-2.5 text-[12.5px] text-danger">{mutationErrorMessage}</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2">
        <div className="border-b border-hairline lg:border-r lg:border-b-0">
          <DataRow label="Artifact hash">{full?.file_hash ?? "…"}</DataRow>
          <DataRow label="Size">{full ? formatBytes(full.file_size_bytes) : "…"}</DataRow>
          <DataRow label="Imported by">{full?.imported_by ?? "…"}</DataRow>
          <DataRow label="Imported at">{full ? new Date(full.imported_at).toLocaleString() : "…"}</DataRow>
        </div>
        {/* The two declared fields keep the brick spine they were entered
            with on the import screen — the caveat travels with the value. */}
        <div>
          <DataRow label="Declared source" tone="danger" className="border-l-4 border-l-danger">
            {full?.declared_source ?? "—"}
          </DataRow>
          <DataRow label="Declared license" tone="danger" className="border-l-4 border-l-danger">
            {full?.declared_license ?? "—"}
          </DataRow>
          <DataRow label="Known limits">{full?.known_limitations ?? "—"}</DataRow>
          <DataRow label="Used by">{row.applications.length > 0 ? row.applications.join(", ") : "—"}</DataRow>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[9.5px] text-secondary">
          {runtime?.last_started_at && <span>Started {new Date(runtime.last_started_at).toLocaleString()}</span>}
          {runtime?.memory_used_mb != null && <span>{runtime.memory_used_mb} MB</span>}
          {runtime?.process_error && <span className="text-danger">{runtime.process_error}</span>}
        </div>
        {canStartStop &&
          (isRunning ? (
            <Button variant="secondary" size="sm" disabled={stop.isPending} onClick={() => stop.mutate()}>
              <Square className="h-3 w-3" /> Stop
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              disabled={start.isPending || !isClean}
              title={!isClean ? "Blocked: this version did not pass the malware scan" : undefined}
              onClick={() => start.mutate()}
            >
              <Play className="h-3 w-3" /> Start
            </Button>
          ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="label-mono">Risk classification</span>
          <StatusPill tone={riskTone(row.risk_classification)} label={row.risk_classification ?? "Unclassified"} />
        </div>
        {canSetRisk && (
          <div role="group" aria-label="Set risk classification" className="inline-flex border border-strong">
            {(["low", "moderate", "high"] as RiskClassification[]).map((level) => (
              <button
                key={level}
                type="button"
                aria-pressed={row.risk_classification === level}
                disabled={setRiskClassification.isPending}
                onClick={() => setRiskClassification.mutate(level)}
                className={`px-3 py-1.5 font-mono text-[9.5px] tracking-[0.14em] uppercase transition-colors ${
                  row.risk_classification === level ? "bg-rule text-surface" : "text-secondary hover:text-primary"
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="label-mono">Evaluation</span>
          {row.evaluation_summary && Object.keys(row.evaluation_summary).length > 0 ? (
            <CategoryDots summary={row.evaluation_summary} href={latestRun ? `/evaluations/${latestRun.id}` : undefined} />
          ) : (
            <span className="font-mono text-[9.5px] tracking-[0.12em] text-secondary uppercase">No runs yet</span>
          )}
        </div>
        {canTriggerEval && (
          <Button variant="secondary" size="sm" disabled={triggerEval.isPending} onClick={() => triggerEval.mutate()}>
            <FlaskConical className="h-3 w-3" />
            {triggerEval.isPending ? "Running… (a couple of minutes)" : "Run evaluation"}
          </Button>
        )}
      </div>
      {triggerEval.error instanceof Error && (
        <p className="border-t border-hairline px-4 py-2.5 text-[12px] text-danger">
          {triggerEval.error instanceof ApiError ? triggerEval.error.detail : triggerEval.error.message}
        </p>
      )}

      {canApprove && (
        <div className="flex flex-wrap items-center gap-2.5 border-t border-hairline bg-raised px-4 py-3">
          <span className="label-mono">AI governance decision</span>
          {completeRuns.length === 0 ? (
            <p className="font-mono text-[10px] text-secondary">
              No completed evaluation run yet — required as evidence before a decision can be recorded.
            </p>
          ) : (
            <>
              <select
                value={evidenceRunId}
                onChange={(e) => setEvidenceRunId(e.target.value)}
                className="field field-mono w-auto py-1.5"
              >
                <option value="">Evidence run…</option>
                {completeRuns.map((r) => (
                  <option key={r.id} value={r.id}>
                    {new Date(r.triggered_at).toLocaleDateString()} — {r.id.slice(0, 8)}
                  </option>
                ))}
              </select>
              <Button
                variant="secondary"
                size="sm"
                className="border-success text-success-ink"
                disabled={!evidenceRunId || recordApproval.isPending}
                onClick={() => recordApproval.mutate({ decision: "approved" as ApprovalDecision, evidenceRunId })}
              >
                Approve
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="border-danger text-danger"
                disabled={!evidenceRunId || recordApproval.isPending}
                onClick={() => recordApproval.mutate({ decision: "rejected" as ApprovalDecision, evidenceRunId })}
              >
                Reject
              </Button>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function CategoryDots({ summary, href }: { summary: Record<string, boolean>; href?: string }) {
  const dots = (
    <span className="flex flex-wrap gap-x-3 gap-y-1">
      {Object.entries(summary).map(([cat, passed]) => (
        <span
          key={cat}
          className={`inline-flex items-center gap-1.5 font-mono text-[9.5px] tracking-[0.1em] uppercase ${
            passed ? "text-success" : "text-danger"
          }`}
        >
          <span className={`h-1.5 w-1.5 ${passed ? "bg-success" : "bg-danger"}`} />
          {cat.replace(/_/g, " ")}
        </span>
      ))}
    </span>
  );
  return href ? (
    <Link href={href} className="hover:underline">
      {dots}
    </Link>
  ) : (
    dots
  );
}
