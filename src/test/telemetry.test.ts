import { describe, it, expect } from "vitest";
import { createDiagnosticReport, sanitizeStackTrace, reportException, trackEvent, getRecentErrors, getRecentEvents, APP_VERSION } from "../utils/telemetry";

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

  it("records unhandled exceptions and telemetry events", () => {
    reportException(new Error("Test crash"));
    expect(getRecentErrors().length).toBeGreaterThanOrEqual(1);

    trackEvent("studio", "export_wav", "master");
    const events = getRecentEvents();
    expect(events.some((e) => e.action === "export_wav")).toBe(true);
  });
});
