import { apiFetch } from "@/lib/api/client";
import type { ChatCompletionResponse } from "@/types/api";

/**
 * The gateway is OpenAI-compatible on purpose (see gateway.md), so this
 * wrapper deliberately mirrors that request shape rather than inventing a
 * friendlier one — the whole point is that an existing OpenAI client can be
 * pointed at it unchanged, and the playground should exercise the same
 * contract everything else would.
 *
 * The calling Application is identified by the `X-Application-Id` header
 * because the path is fixed by that compatibility.
 */
export const gatewayApi = {
  chat: (applicationId: string, prompt: string, maxTokens = 256) =>
    apiFetch<ChatCompletionResponse>("/v1/chat/completions", {
      method: "POST",
      headers: { "X-Application-Id": applicationId },
      body: {
        messages: [{ role: "user", content: prompt }],
        max_tokens: maxTokens,
      },
    }),
};
