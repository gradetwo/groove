import { describe, expect, it } from "vitest";
import { createCatalogueRuntime } from "../data/sampleCatalogueRuntime";

/**
 * Fetching the catalogue, with the fetch injected — the same seam the loader, the decoder and the SFZ reader use, so this is testable with no network.
 *
 * Four criteria, each answering a decision the module makes: an unconfigured root stays empty; a good manifest resolves against the mirror; two concurrent callers share one fetch;
 * and a failure is **not** cached, so a transient outage does not become permanent.
 */
const manifest = JSON.stringify({
  version: 1,
  entries: [
    { id: "kit", name: "Kit", licence: "CC0", prefix: "kit", sfz: "Programs/kit.sfz", durationSeconds: 2.5, files: [{ path: "Programs/kit.sfz", bytes: 100 }] },
  ],
});

const responder = (text: string, ok = true, status = 200) => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return { ok, status, text: async () => text };
  };
  return { fetchImpl, calls: () => calls };
};

describe("createCatalogueRuntime", () => {
  it("stays empty when no root is configured, without fetching anything", async () => {
    const stub = responder(manifest);
    const runtime = createCatalogueRuntime({ fetchImpl: stub.fetchImpl });
    const result = await runtime.load();
    expect(result.assets).toEqual([]);
    // Fetched nothing: a catalogue with no mirror to resolve against has nothing to ask for.
    expect(stub.calls()).toBe(0);
    expect(runtime.ready).toBe(false);
  });

  it("resolves the manifest's assets against the configured root", async () => {
    const runtime = createCatalogueRuntime({ root: "https://cdn.example/samples", fetchImpl: responder(manifest).fetchImpl });
    const { assets, problems } = await runtime.load();
    expect(problems).toEqual([]);
    expect(assets.map((asset) => asset.assetId)).toEqual(["kit"]);
    expect(assets[0]!.sfz?.url).toBe("https://cdn.example/samples/kit/Programs/kit.sfz");
    expect(runtime.ready).toBe(true);
    expect(runtime.assets.map((asset) => asset.assetId)).toEqual(["kit"]);
  });

  it("shares one fetch between concurrent callers", async () => {
    const stub = responder(manifest);
    const runtime = createCatalogueRuntime({ root: "https://cdn.example", fetchImpl: stub.fetchImpl });
    const [a, b] = await Promise.all([runtime.load(), runtime.load()]);
    expect(a.assets).toHaveLength(1);
    expect(b.assets).toHaveLength(1);
    // A manifest is not worth downloading twice for two callers who ask at the same moment.
    expect(stub.calls()).toBe(1);
  });

  it("reports a failure without caching it, so a retry is a real retry", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      if (calls === 1) throw new Error("network down");
      return { ok: true, status: 200, text: async () => manifest };
    };
    const runtime = createCatalogueRuntime({ root: "https://cdn.example", fetchImpl });
    const first = await runtime.load();
    expect(first.assets).toEqual([]);
    expect(first.problems.join(" ")).toMatch(/network down/);
    expect(runtime.ready).toBe(false);
    // The second attempt fetches again and succeeds — a cached failure would have made the outage permanent.
    const second = await runtime.load();
    expect(second.assets).toHaveLength(1);
    expect(runtime.ready).toBe(true);
    expect(calls).toBe(2);
  });

  it("reports a bad status by number rather than treating it as an empty catalogue", async () => {
    const stub = responder("", false, 404);
    const runtime = createCatalogueRuntime({ root: "https://cdn.example", fetchImpl: stub.fetchImpl });
    const { problems } = await runtime.load();
    expect(problems.join(" ")).toMatch(/404/);
  });
});
