import { describe, expect, it } from "vitest";
import { collectWebDebugBundle } from "../data/debugBundleWeb";

/**
 * ⭐ **A bundle that says what it is and, just as loudly, what it is not.**
 *
 * The second case is the one that matters: a failed request arrives carrying an address that may hold a token, and the bundle
 * must not carry it onward. The check is a substring search over the serialised bundle, so a field added carelessly later makes
 * it red rather than quiet.
 */
describe("the debug bundle a browser makes", () => {
  it("⭐ names its version and moment, and reports what each section holds", () => {
    const bundle = collectWebDebugBundle({
      appVersion: "2.34.47",
      userAgent: "Mozilla/5.0 (test)",
      arrangement: { trackCount: 3, bars: 8, noteCount: 41 },
      errors: ["playback could not start"],
      timings: { firstPaintMs: 12 },
      audio: { state: "running", sampleRate: 48000 },
      now: () => new Date("2026-10-06T10:00:00.000Z"),
    });
    expect(bundle.manifest.appVersion).toBe("2.34.47");
    expect(bundle.manifest.generatedAt).toBe("2026-10-06T10:00:00.000Z");
    expect(bundle.manifest.sections.arrangement).toBeGreaterThan(0);
    expect(bundle.manifest.omitted).toContain("the work itself");
    expect(bundle.manifest.omissions.length).toBeGreaterThan(0);
  });

  it("⭐ keeps a failed request's status and drops the address that may hold a token", () => {
    const bundle = collectWebDebugBundle({
      appVersion: "2.34.47",
      userAgent: "Mozilla/5.0 (test)",
      failedRequests: [{ status: 502, method: "POST" }],
      now: () => new Date("2026-10-06T10:00:00.000Z"),
    });
    const text = JSON.stringify(bundle);
    expect(text).toContain('"status":502');
    // ⭐ And nothing that only the address could have carried. The search covers the sections rather than the whole bundle,
    // because the manifest's own prose explains that an address may carry a token — a word, not a leak.
    const carried = JSON.stringify(bundle.sections);
    expect(carried).not.toContain("hunter2");
    expect(carried).not.toContain("token");
    expect(carried).not.toContain("https://");
  });

  it("⭐ carries no note content even when the work is large", () => {
    const bundle = collectWebDebugBundle({
      appVersion: "2.34.47",
      userAgent: "Mozilla/5.0 (test)",
      arrangement: { trackCount: 64, bars: 512, noteCount: 409600 },
      now: () => new Date("2026-10-06T10:00:00.000Z"),
    });
    // ⭐ The bundle reports how much music there is in the same breath as refusing to carry it.
    expect(JSON.stringify(bundle.sections)).not.toContain("pitch");
    expect(bundle.manifest.omitted).toContain("note content");
  });
});
