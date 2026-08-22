"use client";

import { use, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, Lock, ArrowLeft } from "lucide-react";
import { useModel, useImportModelVersion } from "@/lib/hooks/useModel";
import { useMe } from "@/lib/hooks/useMe";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
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
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const canImport = me && hasAnyRole(me.roles, IMPORT_MODEL_VERSION_ROLES);

  if (!canImport) {
    return (
      <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-raised text-tertiary">
          <Lock className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <h2 className="text-base font-semibold text-primary">Access restricted</h2>
        <p className="max-w-md text-sm text-secondary">
          Importing a Model Version requires the ML Engineer role.
        </p>
        <Button variant="secondary" size="sm" onClick={() => router.push(`/models/${modelId}`)}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back to {model.name}
        </Button>
      </Card>
    );
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
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-primary">Import Version — {model.name}</h1>
        <p className="text-sm text-secondary mt-0.5">
          Every artifact is hashed (SHA-256) and scanned for malware before it's registered — a positive scan
          blocks the import outright, no override.
        </p>
      </div>

      <Card className="p-6 space-y-4 max-w-2xl">
        {errorMessage && (
          <div className="rounded-lg border border-danger/30 bg-danger-bg px-4 py-2.5 text-xs text-danger">
            {errorMessage}
          </div>
        )}

        <div>
          <label className="text-xs text-tertiary">Model artifact (.gguf)</label>
          <div
            onClick={() => fileInput.current?.click()}
            className="mt-1 flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-hairline bg-raised px-4 py-6 text-sm text-secondary hover:border-strong"
          >
            <UploadCloud className="h-5 w-5 text-tertiary shrink-0" />
            {file ? (
              <span className="font-mono text-xs text-primary truncate">
                {file.name} ({(file.size / (1024 * 1024)).toFixed(1)} MB)
              </span>
            ) : (
              <span>Click to choose a file</span>
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>

        <Field label="Version label" placeholder="auto-generated if left blank" value={versionLabel} onChange={setVersionLabel} />
        <Field label="Declared source" placeholder="e.g. a Hugging Face repo id — importer-entered, not verified" value={declaredSource} onChange={setDeclaredSource} />
        <Field label="Declared license" placeholder="importer-entered, not verified" value={declaredLicense} onChange={setDeclaredLicense} />
        <Field label="Base model version ID" placeholder="optional — if this is a fine-tune" value={baseModelVersionId} onChange={setBaseModelVersionId} mono />

        <div>
          <label className="text-xs text-tertiary">Known limitations</label>
          <textarea
            value={knownLimitations}
            onChange={(e) => setKnownLimitations(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-hairline bg-raised px-3 py-2 text-sm text-primary outline-none focus:border-cyan"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={() => router.push(`/models/${modelId}`)}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" disabled={!file || importVersion.isPending} onClick={submit}>
            {importVersion.isPending ? "Importing…" : "Import"}
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
  mono,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
}) {
  return (
    <div>
      <label className="text-xs text-tertiary">{label}</label>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1 w-full rounded-lg border border-hairline bg-raised px-3 py-2 text-sm text-primary outline-none focus:border-cyan placeholder:text-tertiary ${mono ? "font-mono" : ""}`}
      />
    </div>
  );
}
