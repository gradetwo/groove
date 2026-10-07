import { describe, expect, it } from "vitest";
import { collectWebDebugBundle, webDebugBundleFileName } from "../features/debug/webDebugBundle";

/**
 * ⭐ **One collector, and a bundle that says what it is and what it is not.**
 *
 * The web side has a single collection path now; its archive half is covered through the download the surface performs. The second case is
 * the one that matters: a failed request arrives carrying an address that may hold a token, and the bundle must not carry it onward. The
 * search runs over the bundle's own values, so a field added carelessly later makes it red rather than quiet.
 */
const stamp = () => new Date("2026-10-06T10:00:00.000Z");

describe("the debug bundle a browser makes", () => {
  it("⭐ names its version and moment, and reports the weight of each section", () => {
    const bundle = collectWebDebugBundle({
      arrangement: { trackCount: 3, bars: 8, noteCount: 41 },
      errors: ["playback could not start"],
      failedRequests: [{ status: 502, method: "POST" }],
      now: stamp,
    });
    expect(bundle.appVersion.length).toBeGreaterThan(0);
    expect(bundle.collectedAt).toBe("2026-10-06T10:00:00.000Z");
    expect(bundle.sizes.arrangement).toBeGreaterThan(0);
    expect(bundle.sizes.errors).toBeGreaterThan(0);
    expect(bundle.omitted).toContain("the work itself");
    expect(bundle.omissions.length).toBeGreaterThan(0);
    expect(bundle.manifest.some((part) => part.section === "failedRequests")).toBe(true);
  });

  it("⭐ keeps a failed request's status and drops the address that may hold a token", () => {
    const bundle = collectWebDebugBundle({
      failedRequests: [{ status: 502, method: "POST" }],
      now: stamp,
    });
    const carried = JSON.stringify(bundle.failedRequests);
    expect(carried).toContain('"status":502');
    expect(carried).not.toContain("hunter2");
    expect(carried).not.toContain("token");
    expect(carried).not.toContain("https://");
  });

  it("⭐ carries no note content even when the work is large", () => {
    const bundle = collectWebDebugBundle({
      arrangement: { trackCount: 64, bars: 512, noteCount: 409600 },
      now: stamp,
    });
    expect(JSON.stringify(bundle.arrangement)).not.toContain("pitch");
    expect(bundle.omitted).toContain("note content");
  });
});

describe("the name the downloaded file carries", () => {
  it("⭐ is the same rule the server half uses, with a stamp a file system will not rewrite", () => {
    expect(webDebugBundleFileName("2026-10-06T10:00:00.000Z")).toBe("groove-debug-2026-10-06T10-00-00-000Z.tar.gz");
    const stem = webDebugBundleFileName("2026-10-06T10:00:00.000Z").slice(0, -".tar.gz".length);
    expect(stem).not.toContain(":");
    expect(stem).not.toContain(".");
  });
});
