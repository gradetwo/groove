import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { installProbeHooks, probeRequested, uninstallProbeHooks } from "../platform/probeHooks";

/**
 * The hook is deliberate, flag-gated, and worth a case of its own.
 *
 * B7's claim could not be checked audibly because nothing exposed the engine. A hook added for that reason has to
 * *not* exist in normal use — a measurement seam that leaks into the product is a hook nobody can reason about — so
 * the gating is the property under test, not the plumbing.
 */
const surface = {
  engine: {} as never,
  readState: () => ({}) as never,
  commit: () => {},
};

describe("probe hooks · only when the URL asks", () => {
  beforeEach(() => {
    uninstallProbeHooks();
  });
  afterEach(() => {
    uninstallProbeHooks();
  });

  it("reads the flag from the search string", () => {
    expect(probeRequested("?probe=1")).toBe(true);
    expect(probeRequested("?tab=studio&probe=1")).toBe(true);
    expect(probeRequested("?probe=0")).toBe(false);
    expect(probeRequested("?probe=yes")).toBe(false);
    expect(probeRequested("")).toBe(false);
    expect(probeRequested("?tab=studio")).toBe(false);
  });

  it("installs only for the flag, and removes itself", () => {
    expect(installProbeHooks(surface, "?tab=studio")).toBe(false);
    expect(window.__grooveProbe).toBeUndefined();

    expect(installProbeHooks(surface, "?tab=studio&probe=1")).toBe(true);
    expect(window.__grooveProbe).toBe(surface);

    uninstallProbeHooks();
    expect(window.__grooveProbe).toBeUndefined();
  });
});
