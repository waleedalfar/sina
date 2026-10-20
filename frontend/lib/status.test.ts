import { describe, expect, it } from "vitest";
import { scanAllowsStart, scanTone, SCAN_LABEL } from "./status";

// ADR-0006: a version over the scanner's limit was never scanned. It may be
// started, but it must never look like it passed a scan.
describe("scan result presentation", () => {
  it("never renders an unscanned version as clean", () => {
    expect(scanTone("not_scannable_size")).not.toBe("success");
    expect(SCAN_LABEL.not_scannable_size.toLowerCase()).not.toContain("clean");
  });

  it("lets clean and unscanned-but-verified versions start, and nothing else", () => {
    expect(scanAllowsStart("clean")).toBe(true);
    expect(scanAllowsStart("not_scannable_size")).toBe(true);
    expect(scanAllowsStart("positive")).toBe(false);
    expect(scanAllowsStart("pending")).toBe(false);
    expect(scanAllowsStart(undefined)).toBe(false);
  });
});
