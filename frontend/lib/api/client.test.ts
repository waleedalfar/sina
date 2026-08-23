import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch, setTokenGetter } from "@/lib/api/client";
import { setSessionExpiredHandler } from "@/lib/auth/session";

function respond(status: number, body?: unknown, ok = status < 400) {
  return Promise.resolve({
    ok,
    status,
    statusText: `status ${status}`,
    json: async () => {
      if (body === undefined) throw new Error("no body");
      return body;
    },
  } as Response);
}

beforeEach(() => {
  setTokenGetter(() => null);
  setSessionExpiredHandler(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setSessionExpiredHandler(null);
});

describe("apiFetch", () => {
  it("attaches a bearer token when one is available", async () => {
    const fetchMock = vi.fn(() => respond(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    setTokenGetter(() => "tok123");

    await apiFetch("/api/v1/me");

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok123");
  });

  it("sends no Authorization header when there is no token", async () => {
    const fetchMock = vi.fn(() => respond(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/v1/me");

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("passes through custom headers, which the gateway needs", async () => {
    const fetchMock = vi.fn(() => respond(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/v1/chat/completions", {
      method: "POST",
      headers: { "X-Application-Id": "app-1" },
      body: { messages: [] },
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Application-Id"]).toBe("app-1");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("surfaces the server's detail rather than a generic message", async () => {
    vi.stubGlobal("fetch", () => respond(403, { detail: "caller does not hold a permitted role" }, false));

    await expect(apiFetch("/x")).rejects.toMatchObject({
      status: 403,
      detail: "caller does not hold a permitted role",
    });
  });

  it("falls back to statusText when the error body is not JSON", async () => {
    vi.stubGlobal("fetch", () => respond(500, undefined, false));
    await expect(apiFetch("/x")).rejects.toBeInstanceOf(ApiError);
  });

  it("returns undefined for 204 rather than trying to parse a body", async () => {
    vi.stubGlobal("fetch", () => respond(204, undefined));
    await expect(apiFetch("/x")).resolves.toBeUndefined();
  });

  /**
   * The distinction the whole session model rests on. A 401 means the
   * token is gone and every other in-flight request is about to fail the
   * same way, so it is signalled once, centrally. A 403 is a real answer —
   * a policy denial, a separation-of-duties conflict — and treating it as
   * an authentication failure would both discard the user's work and
   * misrepresent what the platform actually said.
   */
  it("signals session expiry on 401", async () => {
    const handler = vi.fn();
    setSessionExpiredHandler(handler);
    vi.stubGlobal("fetch", () => respond(401, { detail: "invalid token" }, false));

    await expect(apiFetch("/x")).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("does NOT signal session expiry on 403", async () => {
    const handler = vi.fn();
    setSessionExpiredHandler(handler);
    vi.stubGlobal("fetch", () => respond(403, { detail: "policy denied" }, false));

    await expect(apiFetch("/x")).rejects.toBeInstanceOf(ApiError);
    expect(handler).not.toHaveBeenCalled();
  });

  it.each([400, 404, 409, 413, 422, 429, 500, 502, 503])(
    "does NOT signal session expiry on %i",
    async (status) => {
      const handler = vi.fn();
      setSessionExpiredHandler(handler);
      vi.stubGlobal("fetch", () => respond(status, { detail: "nope" }, false));

      await expect(apiFetch("/x")).rejects.toBeInstanceOf(ApiError);
      expect(handler).not.toHaveBeenCalled();
    },
  );
});
