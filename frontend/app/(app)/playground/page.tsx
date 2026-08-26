"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Info, Send } from "lucide-react";
import { governanceApi } from "@/lib/api/governance";
import { gatewayApi } from "@/lib/api/gateway";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
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
    <>
      <PageHeader
        title="Gateway Playground"
        description="Every request here passes the same policy checklist as production traffic and is written to the audit chain. Nothing here bypasses governance."
      />

      <div className="border border-hairline bg-surface">
        <div className="panel-head">Request</div>
        <div className="flex flex-col gap-4 p-4">
          {isLoading ? (
            <Skeleton className="h-10" />
          ) : (
            <label className="flex flex-col gap-1.5">
              <span className="label-mono">Application</span>
              <select
                value={applicationId}
                onChange={(e) => {
                  setApplicationId(e.target.value);
                  send.reset();
                }}
                className="field field-mono"
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
            <p className="flex items-start gap-2.5 border border-warning border-l-4 bg-warning-bg p-3.5 text-[12.5px] leading-relaxed text-secondary">
              <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
              <span>
                This application is in{" "}
                <span className="font-mono text-primary">{selected.lifecycle_state}</span>. The gateway serves only
                staging and production, so this request will be denied at checklist step 1 — which is worth seeing at
                least once.
              </span>
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="label-mono">Prompt</span>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={7}
                placeholder="Summarise the overnight vitals trend for bed 4B-12 and flag any deterioration signal."
                className="field field-mono min-h-42 resize-y leading-relaxed"
              />
            </label>

            <div className="flex flex-col gap-1.5">
              <span className="label-mono">Response</span>
              <div aria-live="polite" aria-atomic="true" className="flex min-h-42 flex-1 flex-col">
                {send.isSuccess ? (
                  <CompletionPanel response={send.data} application={selected} />
                ) : send.isError ? (
                  <DenialPanel error={send.error} />
                ) : (
                  <div className="hatch flex flex-1 items-center justify-center border border-dashed border-strong p-4 text-center font-mono text-[10px] tracking-[0.18em] text-secondary uppercase">
                    {send.isPending ? "Awaiting gateway…" : "No request sent"}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <span className="font-mono text-[9.5px] text-secondary">
              Allowed or denied, every request is written to the audit chain.
            </span>
            <Button variant="primary" disabled={!canSend} onClick={() => send.mutate()}>
              {send.isPending ? (
                "Sending…"
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" /> Send
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
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

  const operational: Record<number, { label: string; note: string }> = {
    429: {
      label: "Rate limited",
      note: "This application has spent its window. The limit is per application, not per caller.",
    },
    413: { label: "Prompt too large", note: "The prompt exceeds the configured ceiling; nothing was sent to the model." },
    503: {
      label: "Model not running",
      note: "The gateway never starts a model on demand — an unstarted model is an operational state to fix, not something a request should silently trigger. Start the version from its model page and try again.",
    },
    502: { label: "Inference failed", note: "The model was reached but did not return a usable response." },
  };

  const heading = isPolicyDenial ? "Denied by policy" : (operational[status]?.label ?? "Request failed");
  const tone = isPolicyDenial ? "border-danger text-danger" : "border-warning text-warning";

  return (
    <div role="alert" className={`flex flex-1 flex-col gap-2.5 border border-l-[5px] bg-surface p-4 ${tone}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] tracking-[0.2em] uppercase">{heading}</span>
        <span className="font-mono text-[9.5px] text-secondary">HTTP {status || "error"}</span>
      </div>
      <p className="font-mono text-[12.5px] leading-relaxed break-words text-primary">{api?.detail ?? error.message}</p>
      {isPolicyDenial ? (
        <p className="text-[12px] leading-relaxed text-secondary">
          The gateway refused this before any inference ran and recorded a{" "}
          <span className="font-mono">gateway.request_denied</span> event naming the failed check. It is in the audit
          log now.
        </p>
      ) : (
        operational[status] && <p className="text-[12px] leading-relaxed text-secondary">{operational[status].note}</p>
      )}
    </div>
  );
}

function CompletionPanel({ response, application }: { response: ChatCompletionResponse; application?: Application }) {
  return (
    <div className="flex flex-1 flex-col gap-3 border border-hairline bg-raised p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] tracking-[0.2em] text-success uppercase">Allowed</span>
        <span className="font-mono text-[9.5px] text-secondary">Checklist passed · 7 steps</span>
      </div>
      <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-primary">
        {response.choices[0]?.message.content}
      </p>
      <dl className="flex flex-wrap gap-x-5 gap-y-1 border-t border-hairline pt-2.5 font-mono text-[9.5px] text-secondary">
        <div className="flex gap-1.5">
          <dt className="tracking-[0.14em] uppercase">Model</dt>
          <dd className="text-primary/80">{response.model}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="tracking-[0.14em] uppercase">Tokens</dt>
          <dd className="text-primary/80">
            {response.usage.prompt_tokens} in / {response.usage.completion_tokens} out
          </dd>
        </div>
        {application && (
          <div className="flex gap-1.5">
            <dt className="tracking-[0.14em] uppercase">Via</dt>
            <dd className="text-primary/80">{application.name}</dd>
          </div>
        )}
      </dl>
      <p className="font-mono text-[9.5px] text-secondary">Recorded as gateway.request_served.</p>
    </div>
  );
}
