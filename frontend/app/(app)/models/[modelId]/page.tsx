"use client";

import { use, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Plus,
  Play,
  Square,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Clock3,
  Boxes,
  FlaskConical,
} from "lucide-react";
import {
  useModel,
  useModelDashboardRows,
  useModelVersionDetail,
  useModelVersionRuntimeState,
  useEvaluationRuns,
  useModelVersionMutations,
} from "@/lib/hooks/useModel";
import { useTriggerEvaluationRun } from "@/lib/hooks/useEvaluation";
import { useMe } from "@/lib/hooks/useMe";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
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
  const { data: model, isLoading: modelLoading } = useModel(modelId);
  const { data: rows, isLoading: rowsLoading } = useModelDashboardRows(modelId);
  const { data: me } = useMe();
  const canImport = me && hasAnyRole(me.roles, IMPORT_MODEL_VERSION_ROLES);

  if (modelLoading || rowsLoading || !model) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-primary">{model.name}</h1>
          <p className="text-sm text-secondary mt-1">{model.description ?? "No description recorded."}</p>
        </div>
        {canImport && (
          <Link href={`/models/${modelId}/import`}>
            <Button variant="primary" size="sm">
              <Plus className="h-3.5 w-3.5" /> Import Version
            </Button>
          </Link>
        )}
      </div>

      {rows && rows.length === 0 && (
        <Card className="flex flex-col items-center gap-2 py-16 text-center">
          <Boxes className="h-6 w-6 text-tertiary" strokeWidth={1.5} />
          <p className="text-sm text-tertiary">No versions imported yet.</p>
        </Card>
      )}

      {rows?.map((row, i) => (
        <motion.div key={row.version_id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: i * 0.05 }}>
          <VersionCard modelId={modelId} row={row} />
        </motion.div>
      ))}
    </div>
  );
}

function VersionCard({ modelId, row }: { modelId: string; row: ModelDashboardRow }) {
  const { data: full } = useModelVersionDetail(modelId, row.version_id);
  const { data: runtime } = useModelVersionRuntimeState(row.version_id);
  const { data: runs } = useEvaluationRuns(row.version_id);
  const { data: me } = useMe();
  const { start, stop, setRiskClassification, recordApproval } = useModelVersionMutations(row.version_id);
  const triggerEval = useTriggerEvaluationRun(row.version_id);
  const [evidenceRunId, setEvidenceRunId] = useState("");

  const canStartStop = me && hasAnyRole(me.roles, START_STOP_MODEL_ROLES);
  const canSetRisk = me && hasAnyRole(me.roles, SET_MODEL_RISK_ROLES);
  const canTriggerEval = me && hasAnyRole(me.roles, EVALUATION_TRIGGER_ROLES);
  const isImporter = full && me?.id === full.imported_by;
  const canApprove = me && hasAnyRole(me.roles, RECORD_MODEL_APPROVAL_ROLES) && !isImporter && !row.ai_governance_decision;
  const completeRuns = (runs ?? []).filter((r) => r.status === "complete");
  const latestRun = runs?.[0];

  const isRunning = row.runtime_status === "running" || row.runtime_status === "starting";
  const isClean = full?.malware_scan_result === "clean";

  const mutationError = [start.error, stop.error, setRiskClassification.error, recordApproval.error].find(
    (e): e is Error => e instanceof Error,
  );
  const mutationErrorMessage = mutationError instanceof ApiError ? mutationError.detail : mutationError?.message;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="font-mono">{row.version_label}</CardTitle>
          <p className="text-xs text-tertiary">{full?.format ?? "gguf"}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill tone={scanTone(full?.malware_scan_result ?? "pending")} label={`Scan: ${full?.malware_scan_result ?? "pending"}`} icon={full?.malware_scan_result === "positive" ? ShieldAlert : undefined} />
          <StatusPill tone={runtimeTone(row.runtime_status)} label={RUNTIME_LABEL[row.runtime_status]} live={row.runtime_status === "running"} />
          {runtime?.production_eligible && <StatusPill tone="success" label="Production Eligible" icon={ShieldCheck} />}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {mutationErrorMessage && (
          <div className="rounded-lg border border-danger/30 bg-danger-bg px-4 py-2.5 text-xs text-danger">
            {mutationErrorMessage}
          </div>
        )}

        <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 text-sm">
          <Detail label="File hash" value={full?.file_hash} mono />
          <Detail label="Size" value={full ? formatBytes(full.file_size_bytes) : undefined} />
          <Detail label="Declared source" value={full?.declared_source ?? "—"} />
          <Detail label="Declared license" value={full?.declared_license ?? "—"} />
          <Detail label="Imported by" value={full?.imported_by} mono />
          <Detail label="Imported at" value={full ? new Date(full.imported_at).toLocaleString() : undefined} />
        </div>
        {full?.known_limitations && (
          <p className="text-xs text-secondary border-l-2 border-hairline pl-3">{full.known_limitations}</p>
        )}

        <div className="flex items-center justify-between border-t border-hairline pt-4">
          <div className="flex items-center gap-4 text-xs text-tertiary">
            {runtime?.last_started_at && <span>Started {new Date(runtime.last_started_at).toLocaleString()}</span>}
            {runtime?.memory_used_mb != null && <span>{runtime.memory_used_mb} MB</span>}
            {runtime?.process_error && <span className="text-danger">{runtime.process_error}</span>}
          </div>
          {canStartStop && (
            <div className="flex items-center gap-2">
              {isRunning ? (
                <Button variant="secondary" size="sm" disabled={stop.isPending} onClick={() => stop.mutate()}>
                  <Square className="h-3.5 w-3.5" /> Stop
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={start.isPending || !isClean}
                  title={!isClean ? "Blocked: this version did not pass the malware scan" : undefined}
                  onClick={() => start.mutate()}
                >
                  <Play className="h-3.5 w-3.5" /> Start
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-tertiary">Risk classification</span>
            <StatusPill tone={riskTone(row.risk_classification)} label={row.risk_classification ?? "Unclassified"} />
          </div>
          {canSetRisk && (
            <div className="flex items-center gap-1 rounded-lg border border-hairline bg-raised p-0.5">
              {(["low", "moderate", "high"] as RiskClassification[]).map((level) => (
                <button
                  key={level}
                  type="button"
                  disabled={setRiskClassification.isPending}
                  onClick={() => setRiskClassification.mutate(level)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors duration-150 ${
                    row.risk_classification === level ? "bg-cyan/15 text-cyan" : "text-tertiary hover:text-secondary"
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-tertiary">Evaluation</span>
            {row.evaluation_summary && Object.keys(row.evaluation_summary).length > 0 ? (
              latestRun ? (
                <Link href={`/evaluations/${latestRun.id}`} className="flex gap-1.5 hover:underline">
                  {Object.entries(row.evaluation_summary).map(([cat, passed]) => (
                    <span key={cat} className="inline-flex items-center gap-1 text-xs text-secondary">
                      <span className={`h-2 w-2 rounded-full ${passed ? "bg-success" : "bg-danger"}`} />
                      {cat.replace("_", " ")}
                    </span>
                  ))}
                </Link>
              ) : (
                <div className="flex gap-1.5">
                  {Object.entries(row.evaluation_summary).map(([cat, passed]) => (
                    <span key={cat} className="inline-flex items-center gap-1 text-xs text-secondary">
                      <span className={`h-2 w-2 rounded-full ${passed ? "bg-success" : "bg-danger"}`} />
                      {cat.replace("_", " ")}
                    </span>
                  ))}
                </div>
              )
            ) : (
              <span className="text-xs text-tertiary">No runs yet</span>
            )}
            {canTriggerEval && (
              <Button variant="ghost" size="sm" disabled={triggerEval.isPending} onClick={() => triggerEval.mutate()}>
                <FlaskConical className="h-3.5 w-3.5" /> {triggerEval.isPending ? "Running… (can take a couple minutes)" : "Run Evaluation"}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-tertiary">AI Governance</span>
            {row.ai_governance_decision ? (
              <StatusPill tone={decisionTone(row.ai_governance_decision)} label={DECISION_LABEL[row.ai_governance_decision]} />
            ) : (
              <StatusPill tone="neutral" label="Pending" icon={Clock3} />
            )}
          </div>
        </div>
        {triggerEval.error instanceof Error && (
          <p className="text-xs text-danger">
            {triggerEval.error instanceof ApiError ? triggerEval.error.detail : triggerEval.error.message}
          </p>
        )}

        {canApprove && (
          <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-4">
            {completeRuns.length === 0 ? (
              <p className="text-xs text-tertiary">No completed evaluation run yet — required as evidence before recording a decision.</p>
            ) : (
              <>
                <select
                  value={evidenceRunId}
                  onChange={(e) => setEvidenceRunId(e.target.value)}
                  className="rounded-lg border border-hairline bg-raised px-2.5 py-1.5 text-xs text-primary outline-none focus:border-cyan"
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
                  disabled={!evidenceRunId || recordApproval.isPending}
                  onClick={() => recordApproval.mutate({ decision: "approved" as ApprovalDecision, evidenceRunId })}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" /> Approve
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!evidenceRunId || recordApproval.isPending}
                  onClick={() => recordApproval.mutate({ decision: "rejected" as ApprovalDecision, evidenceRunId })}
                >
                  <XCircle className="h-3.5 w-3.5 text-danger" /> Reject
                </Button>
              </>
            )}
          </div>
        )}

        {row.applications.length > 0 && (
          <div className="border-t border-hairline pt-4">
            <span className="text-xs text-tertiary">Used by</span>
            <p className="text-xs text-secondary mt-1">{row.applications.join(", ")}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Detail({ label, value, mono }: { label: string; value: string | undefined; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-tertiary">{label}</span>
      {value === undefined ? (
        <Skeleton className="h-4 w-24" />
      ) : (
        <span className={`text-xs text-right text-primary ${mono ? "font-mono truncate max-w-[220px]" : ""}`}>{value}</span>
      )}
    </div>
  );
}
