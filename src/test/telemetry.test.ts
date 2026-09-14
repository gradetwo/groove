import { describe, it, expect } from "vitest";
import { createDiagnosticReport, sanitizeStackTrace, reportException, getRecentErrors, APP_VERSION } from "../utils/telemetry";

describe("Privacy-First Telemetry & Observability (P4-10)", () => {
  it("sanitizes user file system paths from stack traces", () => {
    const rawStack = "Error: Boom\n  at Object.<anonymous> (/home/crow/music/groove/src/app.ts:10:5)";
    const sanitized = sanitizeStackTrace(rawStack);
    expect(sanitized).not.toContain("/home/crow");
    expect(sanitized).toContain("/home/***");
  });

  it("creates valid diagnostic report containing version and platform", () => {
    const err = new Error("Audio context decode error");
    const report = createDiagnosticReport(err, "ComponentStack: <StudioView>");

    expect(report.version).toBe(APP_VERSION);
    expect(report.errorMessage).toBe("Audio context decode error");
    expect(report.timestamp).toBeDefined();
    expect(report.platform).toBeDefined();
  });

  it("retains caught exceptions and never leaks raw user paths", () => {
    const before = getRecentErrors().length;
    const report = reportException(new Error("Test crash"));

    const after = getRecentErrors();
    expect(after.length).toBeGreaterThanOrEqual(1);
    // Captured reports carry the running app version and are sanitised.
    expect(report.version).toBe(APP_VERSION);
    expect(report.stack ?? "").not.toMatch(/\/home\/[a-z]+\//);
    expect(after[after.length - 1].errorMessage).toBe("Test crash");
    expect(after.length).toBeGreaterThanOrEqual(before);
  });

  it("caps retained crash reports so a crash loop cannot grow memory unbounded", () => {
    for (let i = 0; i < 40; i++) reportException(new Error(`crash ${i}`));
    expect(getRecentErrors().length).toBeLessThanOrEqual(20);
  });
});
