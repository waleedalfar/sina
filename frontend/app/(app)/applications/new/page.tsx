"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Lock, ArrowLeft } from "lucide-react";
import { useMe } from "@/lib/hooks/useMe";
import { useRoles } from "@/lib/hooks/useIdentity";
import { governanceApi } from "@/lib/api/governance";
import { dashboardApi } from "@/lib/api/dashboard";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { hasAnyRole, CREATE_APPLICATION_ROLES } from "@/lib/auth/roles";
import { ApiError } from "@/lib/api/client";

export default function NewApplicationPage() {
  const router = useRouter();
  const { data: me, isLoading: meLoading } = useMe();
  const { data: modelRows, isLoading: modelsLoading } = useQuery({
    queryKey: ["dashboard-models"],
    queryFn: dashboardApi.models,
  });
  const { data: roles } = useRoles();

  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [modelVersionId, setModelVersionId] = useState("");
  const [permittedData, setPermittedData] = useState("");
  const [restrictedData, setRestrictedData] = useState("");
  const [humanReviewRequired, setHumanReviewRequired] = useState(true);
  const [autonomousActionAllowed, setAutonomousActionAllowed] = useState(false);
  const [externalNetworkAllowed, setExternalNetworkAllowed] = useState(false);
  const [permittedRoleIds, setPermittedRoleIds] = useState<Set<string>>(new Set());

  const create = useMutation({
    mutationFn: () =>
      governanceApi.createApplication({
        name,
        purpose: purpose || undefined,
        model_version_id: modelVersionId,
        permitted_data: permittedData.split(",").map((s) => s.trim()).filter(Boolean),
        restricted_data: restrictedData.split(",").map((s) => s.trim()).filter(Boolean),
        human_review_required: humanReviewRequired,
        autonomous_action_allowed: autonomousActionAllowed,
        external_network_allowed: externalNetworkAllowed,
        permitted_role_ids: [...permittedRoleIds],
      }),
    onSuccess: (app) => router.push(`/applications/${app.id}`),
  });

  if (meLoading || modelsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!me || !hasAnyRole(me.roles, CREATE_APPLICATION_ROLES)) {
    return (
      <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-raised text-tertiary">
          <Lock className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <h2 className="text-base font-semibold text-primary">Access restricted</h2>
        <p className="max-w-md text-sm text-secondary">Creating an Application requires the Application Developer role.</p>
        <Button variant="secondary" size="sm" onClick={() => router.push("/applications")}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Applications
        </Button>
      </Card>
    );
  }

  const errorMessage =
    create.error instanceof ApiError ? create.error.detail : create.error instanceof Error ? create.error.message : null;

  const canSubmit = name.trim().length > 0 && modelVersionId.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-primary">New Application</h1>
        <p className="text-sm text-secondary mt-0.5">
          Creates a Draft — nothing is live until it moves through Development, Evaluation, and Governance Review.
        </p>
      </div>

      <Card className="p-6 space-y-4 max-w-2xl">
        {errorMessage && (
          <div className="rounded-lg border border-danger/30 bg-danger-bg px-4 py-2.5 text-xs text-danger">{errorMessage}</div>
        )}

        <Field label="Name" value={name} onChange={setName} />

        <div>
          <label className="text-xs text-tertiary">Purpose</label>
          <textarea
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-lg border border-hairline bg-raised px-3 py-2 text-sm text-primary outline-none focus:border-cyan"
          />
        </div>

        <div>
          <label className="text-xs text-tertiary">Model Version</label>
          <select
            value={modelVersionId}
            onChange={(e) => setModelVersionId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-hairline bg-raised px-3 py-2 text-sm text-primary outline-none focus:border-cyan"
          >
            <option value="">Select a Model Version…</option>
            {modelRows?.map((row) => (
              <option key={row.version_id} value={row.version_id}>
                {row.model_name} — {row.version_label}
                {row.risk_classification ? "" : " (unclassified)"}
              </option>
            ))}
          </select>
        </div>

        <Field label="Permitted data" placeholder="comma-separated, e.g. clinical notes, demographics" value={permittedData} onChange={setPermittedData} />
        <Field label="Restricted data" placeholder="comma-separated, e.g. genomic data" value={restrictedData} onChange={setRestrictedData} />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 border-t border-hairline pt-4">
          <BoolField label="Human review required" value={humanReviewRequired} onChange={setHumanReviewRequired} />
          <BoolField label="Autonomous action allowed" value={autonomousActionAllowed} onChange={setAutonomousActionAllowed} />
          <BoolField label="External network allowed" value={externalNetworkAllowed} onChange={setExternalNetworkAllowed} />
        </div>

        <div className="border-t border-hairline pt-4">
          <label className="text-xs text-tertiary">Permitted users (roles allowed to use this Application)</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {roles?.map((role) => {
              const checked = permittedRoleIds.has(role.id);
              return (
                <button
                  key={role.id}
                  type="button"
                  onClick={() =>
                    setPermittedRoleIds((prev) => {
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

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={() => router.push("/applications")}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" disabled={!canSubmit || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? "Creating…" : "Create Draft"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Field({
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

function BoolField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div>
      <label className="text-xs text-tertiary">{label}</label>
      <div className="mt-1 flex items-center gap-1 rounded-lg border border-hairline bg-raised p-0.5 w-fit">
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors duration-150 ${
            !value ? "bg-cyan/15 text-cyan" : "text-tertiary hover:text-secondary"
          }`}
        >
          No
        </button>
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors duration-150 ${
            value ? "bg-cyan/15 text-cyan" : "text-tertiary hover:text-secondary"
          }`}
        >
          Yes
        </button>
      </div>
    </div>
  );
}
