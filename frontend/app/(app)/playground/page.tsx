"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CornerDownLeft, ShieldX, ShieldCheck, Send, Info } from "lucide-react";
import { governanceApi } from "@/lib/api/governance";
import { gatewayApi } from "@/lib/api/gateway";
import { ApiError } from "@/lib/api/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { Skeleton } from "@/components/ui/Skeleton";
import type { Application, ChatCompletionResponse } from "@/types/api";

/**
 * The one screen where the governance stops being paperwork and becomes
 * observable: send a real prompt through the real gateway and watch the
 * 7-step policy checklist either allow it or refuse it *with the reason
 * named*.
 *
 * Denials are the point, not the error case. Everywhere else in this
 * console a `403` is a dead end; here it's the product demonstrating
 * itself, so it gets a first-class panel rather than a red box.
 */
export default function PlaygroundPage() {
  const { data: applications, isLoading } = useQuery({
    queryKey: ["applications"],
    queryFn: governanceApi.listApplications,
  });

  const [applicationId, setApplicationId] = useState("");
  const [prompt, setPrompt] = useState("");

  const send = useMutation<ChatCompletionResponse, Error, void>({
    mutationFn: () => gatewayApi.chat(applicationId, prompt),
  });

  const selected = applications?.find((a) => a.id === applicationId);
  const canSend = applicationId !== "" && prompt.trim() !== "" && !send.isPending;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-primary">Gateway Playground</h1>
        <p className="mt-1 text-sm text-secondary">
          Sends a real request through the inference gateway, subject to the same policy checklist
          every production caller passes. Nothing here bypasses governance.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Request</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <Skeleton className="h-10" />
          ) : (
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-secondary">Application</span>
              <select
                value={applicationId}
                onChange={(e) => {
                  setApplicationId(e.target.value);
                  send.reset();
                }}
                className="w-full rounded-lg border border-hairline bg-raised px-3 py-2 text-sm text-primary"
              >
                <option value="">Select an application…</option>
                {applications?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} — {a.lifecycle_state}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* Stated before the request rather than after the denial: the
              checklist only serves staging/production, and knowing that up
              front is more useful than discovering it in a 403. */}
          {selected && !["staging", "production"].includes(selected.lifecycle_state) && (
            <p className="flex items-start gap-2 rounded-lg border border-hairline bg-raised p-3 text-xs text-tertiary">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                This application is in <strong className="text-secondary">{selected.lifecycle_state}</strong>.
                The gateway only serves <strong className="text-secondary">staging</strong> and{" "}
                <strong className="text-secondary">production</strong>, so this request will be denied
                at checklist step 1 — which is worth seeing at least once.
              </span>
            </p>
          )}

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-secondary">Prompt</span>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder="Summarise this radiology report…"
              className="w-full resize-y rounded-lg border border-hairline bg-raised px-3 py-2 font-mono text-sm text-primary placeholder:text-tertiary"
            />
          </label>

          <div className="flex items-center justify-between">
            <span className="text-xs text-tertiary">
              Every request is audited, allowed or denied.
            </span>
            <Button
              variant="primary"
              size="sm"
              disabled={!canSend}
              onClick={() => send.mutate()}
              className="gap-1.5"
            >
              {send.isPending ? "Sending…" : (<><Send className="h-3.5 w-3.5" /> Send</>)}
            </Button>
          </div>
        </CardContent>
      </Card>

      {send.isError && <DenialPanel error={send.error} />}
      {send.isSuccess && <CompletionPanel response={send.data} application={selected} />}
    </div>
  );
}

/**
 * A denial is a correct, meaningful answer from the platform, so it is
 * rendered as one. The gateway's `detail` already names which check failed
 * and why (see `_deny` in gateway/router.py) — it is shown verbatim rather
 * than replaced with a generic message, because the specific reason is the
 * entire value of this screen.
 */
function DenialPanel({ error }: { error: Error }) {
  const api = error instanceof ApiError ? error : null;
  const status = api?.status ?? 0;

  // 403 is a policy denial — the checklist working. Everything else is
  // operational (model stopped, rate limited, oversized, inference down),
  // which is a different kind of answer and shouldn't wear the same badge.
  const isPolicyDenial = status === 403;

  const operationalLabel: Record<number, string> = {
    429: "Rate limited",
    413: "Prompt too large",
    503: "Model not running",
    502: "Inference failed",
  };

  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldX className={`h-4 w-4 ${isPolicyDenial ? "text-rose-400" : "text-amber-400"}`} />
            {isPolicyDenial ? "Denied by policy" : operationalLabel[status] ?? "Request failed"}
            <StatusPill tone={isPolicyDenial ? "danger" : "warning"} label={String(status || "error")} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="font-mono text-sm text-primary">{api?.detail ?? error.message}</p>
          {isPolicyDenial && (
            <p className="text-xs text-tertiary">
              The gateway refused this before any inference ran, and recorded a{" "}
              <code className="text-secondary">gateway.request_denied</code> event naming the failed
              check. It is visible now in the Audit log.
            </p>
          )}
          {status === 503 && (
            <p className="text-xs text-tertiary">
              The gateway never starts a model on demand — an unstarted model is an operational
              state to fix, not something a request should silently trigger. Start the model version
              from its Models page and try again.
            </p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function CompletionPanel({
  response,
  application,
}: {
  response: ChatCompletionResponse;
  application?: Application;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            Allowed
            <StatusPill tone="success" label="200" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-primary">
            {response.choices[0]?.message.content}
          </p>
          <dl className="flex flex-wrap gap-x-6 gap-y-1 border-t border-hairline pt-3 text-xs text-tertiary">
            <div className="flex gap-1.5">
              <dt>Model</dt>
              <dd className="font-mono text-secondary">{response.model}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt>Tokens</dt>
              <dd className="font-mono text-secondary">
                {response.usage.prompt_tokens} in / {response.usage.completion_tokens} out
              </dd>
            </div>
            {application && (
              <div className="flex gap-1.5">
                <dt>Via</dt>
                <dd className="text-secondary">{application.name}</dd>
              </div>
            )}
          </dl>
          <p className="flex items-center gap-1.5 text-xs text-tertiary">
            <CornerDownLeft className="h-3 w-3" />
            Passed all 7 checklist steps; recorded as <code className="text-secondary">gateway.request_served</code>.
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}
