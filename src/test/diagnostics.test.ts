import { describe, it, expect } from "vitest";
import { diagRequested } from "../platform/diagnostics";

/**
 * The diagnostic panel is a development surface, and a development surface that leaks into normal use is a
 * liability. It is gated exactly like the probe hook: nothing at all unless the URL asks for it.
 */
describe("the diagnostic panel's gate", () => {
  it("opens only when the URL asks", () => {
    expect(diagRequested("?diag=1")).toBe(true);
    expect(diagRequested("?tab=studio&diag=1")).toBe(true);
    expect(diagRequested("?diag=0")).toBe(false);
    expect(diagRequested("?probe=1")).toBe(false);
    expect(diagRequested("")).toBe(false);
    expect(diagRequested("?diag")).toBe(false);
  });
});
