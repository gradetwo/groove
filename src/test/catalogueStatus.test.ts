import { describe, expect, it } from "vitest";
import { describeCatalogueStatus } from "../data/sampleCatalogueStatus";

/**
 * Four reasons for one symptom, kept apart.
 *
 * Every criterion here exists because the user-visible outcome is identical — no sound — while the cause and the action differ: nothing configured, still loading, a manifest that came back
 * as HTML (which is what this project's own deployment actually did), an empty catalogue, or a genuinely broken one.
 */
const base = { configured: true, loading: false, ready: false, problems: [] as string[], assetCount: 0 };

describe("describeCatalogueStatus", () => {
  it("says a missing mirror is not a fault, when nothing is configured", () => {
    const status = describeCatalogueStatus({ ...base, configured: false });
    expect(status.phase).toBe("unconfigured");
    // Reads as a capability, not an error: this is the state the project ships in.
    expect(status.summary).toMatch(/No sample mirror is configured/);
  });

  it("separates a manifest served as HTML from a broken manifest", () => {
    // The real one: `GET /samples/manifest.json` answered 200 with `text/html` from an SPA fallback.
    const status = describeCatalogueStatus({ ...base, problems: ["manifest: manifest is not valid JSON: Unexpected token '<'"] });
    expect(status.phase).toBe("failed");
    expect(status.summary).toMatch(/stale deployment, not a broken manifest/);
    // And the named problem is kept verbatim, because it already says which entry and file.
    expect(status.detail[0]).toMatch(/not valid JSON/);
  });

  it("does not blame deployment for an ordinary fetch failure", () => {
    const status = describeCatalogueStatus({ ...base, problems: ["manifest: 404 from /samples/manifest.json"] });
    expect(status.summary).toMatch(/could not be loaded/);
    expect(status.summary).not.toMatch(/stale deployment/);
  });

  it("distinguishes an empty catalogue from an unreadable one", () => {
    // "The library has no instruments" and "the library could not be read" send a composer to different actions.
    const empty = describeCatalogueStatus({ ...base, ready: true, assetCount: 0 });
    expect(empty.phase).toBe("empty");
    expect(empty.summary).toMatch(/described no usable instruments/);
  });

  it("counts what is available, and reports loading while it is", () => {
    expect(describeCatalogueStatus({ ...base, loading: true }).phase).toBe("loading");
    const ready = describeCatalogueStatus({ ...base, ready: true, assetCount: 1 });
    expect(ready.phase).toBe("ready");
    // Singular, because "1 instruments available" is the kind of detail that makes a message look untrustworthy.
    expect(ready.summary).toMatch(/1 instrument available/);
    expect(describeCatalogueStatus({ ...base, ready: true, assetCount: 3 }).summary).toMatch(/3 instruments available/);
  });
});

describe("describeRuntimeStatus", () => {
  it("reads a runtime's own fields, so a caller cannot forget one", async () => {
    const { describeRuntimeStatus } = await import("../data/sampleCatalogueStatus");
    const { createCatalogueRuntime } = await import("../data/sampleCatalogueRuntime");
    const runtime = createCatalogueRuntime({ root: "" });
    // No root configured: the shipped state, reported as a capability rather than an error.
    expect(describeRuntimeStatus(runtime).phase).toBe("unconfigured");
  });

  it("reports loading while a fetch is in flight, and ready once it resolves", async () => {
    const { describeRuntimeStatus } = await import("../data/sampleCatalogueStatus");
    const { createCatalogueRuntime } = await import("../data/sampleCatalogueRuntime");
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const runtime = createCatalogueRuntime({
      root: "https://cdn.example",
      fetchImpl: async () => {
        await gate;
        return { ok: true, status: 200, text: async () => JSON.stringify({ version: 1, entries: [{ id: "k", name: "K", licence: "CC0", prefix: "k", sfz: "k.sfz", durationSeconds: 1, files: [{ path: "k.sfz", bytes: 1 }] }] }) };
      },
    });
    const pending = runtime.load();
    // In flight: "loading" is a different sentence from "nothing yet", and an interface that cannot tell them apart looks broken.
    expect(describeRuntimeStatus(runtime).phase).toBe("loading");
    release!();
    await pending;
    expect(describeRuntimeStatus(runtime).phase).toBe("ready");
  });
});
