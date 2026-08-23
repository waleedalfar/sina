import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  notifySessionExpired,
  rememberReturnPath,
  setSessionExpiredHandler,
  takeReturnPath,
} from "@/lib/auth/session";

const KEY = "aperture.returnPath";

beforeEach(() => {
  sessionStorage.clear();
  setSessionExpiredHandler(null);
});

afterEach(() => {
  setSessionExpiredHandler(null);
});

describe("return path", () => {
  it("round-trips a remembered path", () => {
    rememberReturnPath("/applications/abc");
    expect(takeReturnPath()).toBe("/applications/abc");
  });

  it("clears the value as it reads it, so a later read cannot replay it", () => {
    rememberReturnPath("/audit");
    expect(takeReturnPath()).toBe("/audit");
    expect(takeReturnPath()).toBe("/dashboard");
    expect(sessionStorage.getItem(KEY)).toBe(null);
  });

  it("falls back to /dashboard when nothing was remembered", () => {
    expect(takeReturnPath()).toBe("/dashboard");
  });

  /**
   * This value is read straight back out of storage and handed to a
   * navigation after re-authentication. If it could name another origin,
   * anything able to write sessionStorage would have an open redirect that
   * fires immediately after a successful login — the worst possible moment,
   * because the user has just proven they trust the page.
   */
  it.each([
    ["//evil.example.com", "protocol-relative URL"],
    ["https://evil.example.com/x", "absolute URL"],
    ["http://evil.example.com", "absolute URL, plain http"],
    ["javascript:alert(1)", "javascript: scheme"],
    ["evil.example.com", "bare host"],
    ["", "empty string"],
  ])("refuses %s (%s) and falls back to /dashboard", (value) => {
    sessionStorage.setItem(KEY, value);
    expect(takeReturnPath()).toBe("/dashboard");
  });

  it("accepts ordinary same-origin absolute paths", () => {
    for (const path of ["/", "/dashboard", "/applications/1", "/audit?severity=info"]) {
      sessionStorage.setItem(KEY, path);
      expect(takeReturnPath()).toBe(path);
    }
  });

  it("survives storage being unavailable rather than throwing", () => {
    // Private browsing and blocked site data both make these throw. Losing
    // the return path is acceptable; failing the sign-in is not.
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(() => rememberReturnPath("/audit")).not.toThrow();
    expect(takeReturnPath()).toBe("/dashboard");

    getItem.mockRestore();
    setItem.mockRestore();
  });
});

describe("expiry signalling", () => {
  it("notifies the registered handler", () => {
    const handler = vi.fn();
    setSessionExpiredHandler(handler);
    notifySessionExpired();
    expect(handler).toHaveBeenCalledOnce();
  });

  it("is a no-op when nothing is listening", () => {
    expect(() => notifySessionExpired()).not.toThrow();
  });

  it("stops notifying once the handler is cleared on unmount", () => {
    const handler = vi.fn();
    setSessionExpiredHandler(handler);
    setSessionExpiredHandler(null);
    notifySessionExpired();
    expect(handler).not.toHaveBeenCalled();
  });
});
