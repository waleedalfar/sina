import { API_BASE_URL } from "@/lib/auth/config";
import { notifySessionExpired } from "@/lib/auth/session";

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
}

let tokenGetter: () => string | null = () => null;

/** Wired up once from AuthProvider so the plain fetch wrapper below can
 * attach a Bearer token without every call site threading it through. */
export function setTokenGetter(getter: () => string | null) {
  tokenGetter = getter;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  isFormData?: boolean;
  /** Extra request headers. Needed by the gateway, which identifies the
   * calling Application with `X-Application-Id` rather than a path param —
   * it's an OpenAI-compatible endpoint, so the path shape isn't ours to
   * change. */
  headers?: Record<string, string>;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = tokenGetter();
  const headers: Record<string, string> = { ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;

  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    if (options.isFormData) {
      body = options.body as FormData;
    } else {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body);
    }
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body,
  });

  if (!res.ok) {
    // A 401 means the token the backend saw is missing, expired, or no
    // longer valid — the session is over, and every other in-flight query
    // is about to fail the same way. Signal it once, centrally, instead of
    // letting each call site render its own red box (see lib/auth/session).
    // 403 is deliberately excluded: that's a policy answer, not a
    // session problem.
    if (res.status === 401) notifySessionExpired();

    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = data.detail ?? detail;
    } catch {
      // non-JSON error body — fall back to statusText
    }
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
