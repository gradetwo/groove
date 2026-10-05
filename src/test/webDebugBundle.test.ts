import { describe, expect, it } from "vitest";
import { collectWebDebugBundle, webDebugBundleFileName } from "../features/debug/webDebugBundle";

/**
 * ⭐ **Same shape as the server's bundle criterion, so the two files can be read the same way.**
 */
describe("Web · the debug bundle", () => {
  it("names its version, its manifest and what it could not collect", () => {
    const bundle = collectWebDebugBundle({ note: "the page went quiet" });
    expect(bundle.appVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(bundle.manifest.length).toBeGreaterThan(3);
    expect(bundle.omissions.length).toBe(2);
    expect(bundle.note).toBe("the page went quiet");
    expect(webDebugBundleFileName(bundle.collectedAt)).toMatch(/^groove-debug-[\dTZ-]+\.json$/);
  });

  it("reports the counts it was given and stops omitting them", () => {
    const bundle = collectWebDebugBundle({ arrangement: { tracks: 3, bars: 8 }, audioContext: { sampleRate: 48000, state: "running" } });
    expect(bundle.arrangement).toEqual({ tracks: 3, bars: 8 });
    expect(bundle.audioContext?.state).toBe("running");
    expect(bundle.omissions).toEqual([]);
  });

  it("carries no secret word", () => {
    const text = JSON.stringify(collectWebDebugBundle());
    for (const word of ["token", "secret", "password", "apikey", "authorization"]) {
      expect(text.toLowerCase(), word).not.toContain(word);
    }
  });
});
