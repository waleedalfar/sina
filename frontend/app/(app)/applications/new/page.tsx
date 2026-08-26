"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMe } from "@/lib/hooks/useMe";
import { useRoles } from "@/lib/hooks/useIdentity";
import { governanceApi } from "@/lib/api/governance";
import { dashboardApi } from "@/lib/api/dashboard";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { RestrictedState } from "@/components/ui/ResourceState";
import { hasAnyRole, CREATE_APPLICATION_ROLES } from "@/lib/auth/roles";
import { ApiError } from "@/lib/api/client";

/** The five categories that must all sign off at Governance Review. Listed
 * here at creation time on purpose: knowing up front who has to approve is
 * what stops an application being built and only then discovering who owns
 * the objection. */
const SIGNOFF_CATEGORIES = ["Clinical Safety", "Privacy", "Security", "AI Governance", "Compliance"];

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
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!me || !hasAnyRole(me.roles, CREATE_APPLICATION_ROLES)) {
    return <RestrictedState what="Creating an Application requires the Application Developer role." />;
  }

  const errorMessage =
    create.error instanceof ApiError ? create.error.detail : create.error instanceof Error ? create.error.message : null;
  const canSubmit = name.trim().length > 0 && modelVersionId.length > 0;

  return (
    <>
      <PageHeader eyebrow="Applications / New" title="Register an application" />

      {errorMessage && (
        <p className="border border-danger border-l-4 bg-danger-bg px-4 py-3 text-[12.5px] text-danger">{errorMessage}</p>
      )}

      <div className="grid grid-cols-1 items-start gap-4.5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="flex flex-col border border-hairline bg-surface">
          <div className="panel-head">Identification</div>
          <div className="flex flex-col gap-4 p-4">
            <label className="flex flex-col gap-1.5">
              <span className="label-mono">Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className="field" />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="label-mono">Purpose</span>
              <textarea
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                rows={2}
                className="field resize-y leading-relaxed"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="label-mono">Model version</span>
              <select
                value={modelVersionId}
                onChange={(e) => setModelVersionId(e.target.value)}
                className="field field-mono"
              >
                <option value="">Select a model version…</option>
                {modelRows?.map((row) => (
                  <option key={row.version_id} value={row.version_id}>
                    {row.model_name} — {row.version_label}
                    {row.risk_classification ? "" : " (unclassified)"}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="label-mono">Permitted data types</span>
              <input
                value={permittedData}
                onChange={(e) => setPermittedData(e.target.value)}
                placeholder="comma-separated, e.g. clinical notes, demographics"
                className="field"
              />
              <ChipPreview values={permittedData} tone="success" />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="label-mono">Restricted data types</span>
              <input
                value={restrictedData}
                onChange={(e) => setRestrictedData(e.target.value)}
                placeholder="comma-separated, e.g. genomic data"
                className="field"
              />
              <ChipPreview values={restrictedData} tone="danger" />
            </label>
          </div>

          <div className="panel-head border-t border-hairline">Operating constraints</div>
          <div className="px-4 pt-1 pb-4">
            {/* These three are not the risk questionnaire — they are what
                the gateway enforces at request time. Saying what each one
                does, next to the switch, is the difference between a form
                and a decision. */}
            <BoolRow
              label="Human review required"
              effect="Output must be reviewed by a clinician before it is acted on"
              value={humanReviewRequired}
              onChange={setHumanReviewRequired}
            />
            <BoolRow
              label="Autonomous action allowed"
              effect="Answering yes forces a high-risk classification"
              value={autonomousActionAllowed}
              onChange={setAutonomousActionAllowed}
            />
            <BoolRow
              label="External network allowed"
              effect="Gateway blocks outbound calls unless this is yes"
              value={externalNetworkAllowed}
              onChange={setExternalNetworkAllowed}
            />
          </div>

          <div className="panel-head border-t border-hairline">Permitted users</div>
          <div className="flex flex-wrap gap-2 p-4">
            {roles?.map((role) => {
              const checked = permittedRoleIds.has(role.id);
              return (
                <button
                  key={role.id}
                  type="button"
                  aria-pressed={checked}
                  onClick={() =>
                    setPermittedRoleIds((prev) => {
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

        <div className="flex flex-col gap-4.5">
          {/*
            The design's live risk-tier readout, told truthfully: the tier
            is derived from the 11-question questionnaire on the
            application's own page, not from this form, so this panel shows
            what it will be until that happens — Unclassified — and who
            will have to sign.
          */}
          <section className="border border-warning">
            <div className="panel-head">Risk classification</div>
            <div className="flex flex-col gap-3.5 p-4">
              <div className="flex items-center gap-3.5">
                <div className="grid h-17 w-17 shrink-0 place-items-center border-2 border-warning font-mono text-2xl font-semibold text-warning">
                  ?
                </div>
                <div>
                  <div className="font-mono text-[11px] tracking-[0.18em] text-warning uppercase">Unclassified</div>
                  <p className="mt-1 max-w-[30ch] text-[12.5px] leading-relaxed text-secondary">
                    Derived from the risk questionnaire, which is completed on the application&apos;s own page after it
                    is created. It is never set by hand.
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2 border-t border-hairline pt-3">
                <div className="label-mono">Sign-offs required at governance review</div>
                {SIGNOFF_CATEGORIES.map((category) => (
                  <div
                    key={category}
                    className="flex items-center gap-2.5 font-mono text-[10.5px] tracking-[0.1em] text-primary/75 uppercase"
                  >
                    <span aria-hidden="true" className="h-1.5 w-1.5 bg-warning" />
                    {category}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <p className="font-mono text-[9.5px] leading-relaxed text-secondary">
            This creates a Draft. Nothing is live until it has moved through Development, Evaluation and Governance
            Review.
          </p>

          <div className="flex justify-end gap-2.5">
            <Button variant="secondary" onClick={() => router.push("/applications")}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!canSubmit || create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? "Creating…" : "Register application"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

/** Comma-separated text, echoed back as the chips it will become. The
 * field stays a plain text input — this only shows the reader how the
 * platform will split what they typed. */
function ChipPreview({ values, tone }: { values: string; tone: "success" | "danger" }) {
  const items = values.split(",").map((s) => s.trim()).filter(Boolean);
  if (items.length === 0) return null;
  const classes =
    tone === "success" ? "border-success bg-success-bg text-success-ink" : "border-danger bg-danger-bg text-danger";
  return (
    <span className="flex flex-wrap gap-1.5 pt-1">
      {items.map((item) => (
        <span key={item} className={`border px-2 py-1 font-mono text-[9.5px] tracking-[0.1em] uppercase ${classes}`}>
          {item}
        </span>
      ))}
    </span>
  );
}

function BoolRow({
  label,
  effect,
  value,
  onChange,
}: {
  label: string;
  effect: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-hairline py-3.5 last:border-b-0">
      <div>
        <div className="text-[13.5px] font-medium">{label}</div>
        <div className="mt-0.5 font-mono text-[10px] text-secondary">{effect}</div>
      </div>
      <div role="group" aria-label={label} className="inline-flex border border-strong">
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
    </div>
  );
}
