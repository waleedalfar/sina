import { apiFetch } from "@/lib/api/client";
import type { Model, ModelRuntimeState, ModelVersion } from "@/types/api";

export const modelsApi = {
  list: () => apiFetch<Model[]>("/api/v1/models"),
  get: (id: string) => apiFetch<Model>(`/api/v1/models/${id}`),
  create: (name: string, description?: string) =>
    apiFetch<Model>("/api/v1/models", { method: "POST", body: { name, description } }),
  // Model-level metadata only. There is deliberately no version-level
  // equivalent: a ModelVersion records an imported artifact (hash, scan
  // result, importer) and is immutable, and its one mutable field,
  // risk_classification, is owned by governance's own endpoint.
  update: (id: string, body: { name?: string; description?: string | null }) =>
    apiFetch<Model>(`/api/v1/models/${id}`, { method: "PATCH", body }),
  getVersion: (modelId: string, versionId: string) =>
    apiFetch<ModelVersion>(`/api/v1/models/${modelId}/versions/${versionId}`),
  importVersion: (
    modelId: string,
    file: File,
    opts: {
      version_label?: string;
      declared_source?: string;
      declared_license?: string;
      base_model_version_id?: string;
      known_limitations?: string;
    } = {},
  ) => {
    const form = new FormData();
    form.append("file", file);
    if (opts.version_label) form.append("version_label", opts.version_label);
    if (opts.declared_source) form.append("declared_source", opts.declared_source);
    if (opts.declared_license) form.append("declared_license", opts.declared_license);
    if (opts.base_model_version_id) form.append("base_model_version_id", opts.base_model_version_id);
    if (opts.known_limitations) form.append("known_limitations", opts.known_limitations);
    return apiFetch<ModelVersion>(`/api/v1/models/${modelId}/versions`, {
      method: "POST",
      body: form,
      isFormData: true,
    });
  },
  runtimeState: (versionId: string) => apiFetch<ModelRuntimeState>(`/api/v1/model-versions/${versionId}/runtime-state`),
  start: (versionId: string) => apiFetch<ModelRuntimeState>(`/api/v1/model-versions/${versionId}/start`, { method: "POST" }),
  stop: (versionId: string) => apiFetch<ModelRuntimeState>(`/api/v1/model-versions/${versionId}/stop`, { method: "POST" }),
};
