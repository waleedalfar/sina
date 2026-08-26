"use client";

import { use, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud } from "lucide-react";
import { useModel, useImportModelVersion } from "@/lib/hooks/useModel";
import { useMe } from "@/lib/hooks/useMe";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { RestrictedState } from "@/components/ui/ResourceState";
import { hasAnyRole, IMPORT_MODEL_VERSION_ROLES } from "@/lib/auth/roles";
import { ApiError } from "@/lib/api/client";

export default function ImportModelVersionPage({ params }: { params: Promise<{ modelId: string }> }) {
  const { modelId } = use(params);
  const router = useRouter();
  const { data: model, isLoading: modelLoading } = useModel(modelId);
  const { data: me, isLoading: meLoading } = useMe();
  const importVersion = useImportModelVersion(modelId);
  const fileInput = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [versionLabel, setVersionLabel] = useState("");
  const [declaredSource, setDeclaredSource] = useState("");
  const [declaredLicense, setDeclaredLicense] = useState("");
  const [knownLimitations, setKnownLimitations] = useState("");
  const [baseModelVersionId, setBaseModelVersionId] = useState("");

  if (modelLoading || meLoading || !model) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!me || !hasAnyRole(me.roles, IMPORT_MODEL_VERSION_ROLES)) {
    return <RestrictedState what="Importing a Model Version requires the ML Engineer role." />;
  }

  const errorMessage =
    importVersion.error instanceof ApiError
      ? importVersion.error.detail
      : importVersion.error instanceof Error
        ? importVersion.error.message
        : null;

  const submit = () => {
    if (!file) return;
    importVersion.mutate(
      {
        file,
        opts: {
          version_label: versionLabel || undefined,
          declared_source: declaredSource || undefined,
          declared_license: declaredLicense || undefined,
          known_limitations: knownLimitations || undefined,
          base_model_version_id: baseModelVersionId || undefined,
        },
      },
      { onSuccess: () => router.push(`/models/${modelId}`) },
    );
  };

  return (
    <div className="flex max-w-3xl flex-col gap-4.5">
      <PageHeader eyebrow={`Models / ${model.name} / Import version`} title="Import version" />

      {errorMessage && (
        <p className="border border-danger border-l-4 bg-danger-bg px-4 py-3 text-[12.5px] text-danger">{errorMessage}</p>
      )}

      {/* The drop zone is hatched, like every "nothing here yet" surface in
          this system. Filling it swaps the hatch for the artifact's own
          facts. */}
      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        className={`flex flex-col items-center gap-2.5 border border-dashed border-strong px-5 py-7 text-center transition-colors hover:border-accent ${
          file ? "bg-surface" : "hatch"
        }`}
      >
        {file ? (
          <>
            <UploadCloud className="h-5 w-5 text-accent" strokeWidth={1.75} aria-hidden="true" />
            <span className="font-mono text-[11px] tracking-[0.14em] text-accent uppercase">Ready to import</span>
            <span className="max-w-full truncate font-mono text-[12.5px] text-primary">{file.name}</span>
            <span className="font-mono text-[10px] text-secondary">
              {(file.size / (1024 * 1024)).toFixed(1)} MB · hashed and scanned on arrival
            </span>
          </>
        ) : (
          <>
            <span className="font-mono text-[11px] tracking-[0.18em] text-secondary uppercase">Choose weights archive</span>
            <span className="text-[12.5px] text-secondary">
              .gguf · hashed with SHA-256 and malware-scanned on arrival
            </span>
            <span className="mt-1 border border-strong bg-surface px-4 py-2.5 font-mono text-[10px] tracking-[0.16em] uppercase">
              Choose file
            </span>
          </>
        )}
      </button>
      <input ref={fileInput} type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />

      <label className="flex flex-col gap-1.5">
        <span className="label-mono">Version label — auto-generated if blank</span>
        <input
          value={versionLabel}
          onChange={(e) => setVersionLabel(e.target.value)}
          placeholder="2.4.3 (auto)"
          className="field field-mono"
        />
      </label>

      {/*
        The three declared fields are boxed and spined brick red together,
        under one heading that says who asserted them. This is the design
        making an honest limitation visible rather than burying it: Sina
        records these as the importer's claim and cannot verify any of
        them, so they must never look like platform-verified facts.
      */}
      <section className="border border-danger">
        <div className="flex items-center justify-between gap-3 border-b border-danger/40 bg-danger-bg px-3.5 py-2.5">
          <span className="font-mono text-[10px] tracking-[0.2em] text-danger uppercase">Declared by importer</span>
          <span className="font-mono text-[9px] tracking-[0.12em] text-danger uppercase">Not verified by Sina</span>
        </div>
        <div className="flex flex-col gap-3.5 p-3.5">
          <p className="text-[12.5px] leading-relaxed text-secondary">
            These fields are recorded as the importer&apos;s assertion. Sina does not and cannot confirm them; they are
            surfaced with this caveat everywhere they appear downstream.
          </p>
          <label className="flex flex-col gap-1.5">
            <span className="label-mono">Declared source</span>
            <input
              value={declaredSource}
              onChange={(e) => setDeclaredSource(e.target.value)}
              placeholder="e.g. a Hugging Face repo id"
              className="field field-mono field-declared"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="label-mono">Declared license</span>
            <input
              value={declaredLicense}
              onChange={(e) => setDeclaredLicense(e.target.value)}
              placeholder="e.g. Apache-2.0"
              className="field field-mono field-declared"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="label-mono">Base version id — fine-tunes only</span>
            <input
              value={baseModelVersionId}
              onChange={(e) => setBaseModelVersionId(e.target.value)}
              placeholder="optional"
              className="field field-mono field-declared"
            />
          </label>
        </div>
      </section>

      <label className="flex flex-col gap-1.5">
        <span className="label-mono">Known limitations</span>
        <textarea
          value={knownLimitations}
          onChange={(e) => setKnownLimitations(e.target.value)}
          rows={3}
          className="field resize-y leading-relaxed"
        />
      </label>

      <div className="flex justify-end gap-2.5">
        <Button variant="secondary" onClick={() => router.push(`/models/${modelId}`)}>
          Cancel
        </Button>
        <Button variant="primary" disabled={!file || importVersion.isPending} onClick={submit}>
          {importVersion.isPending ? "Importing…" : "Import & scan"}
        </Button>
      </div>
    </div>
  );
}
