import { describe, expect, it } from "vitest";
import { createSampleLoader } from "../audio/sampleLoader";
import type { SampleAsset } from "../data/sampleCatalogue";

/**
 * The sample loader's two rules (owner decision 2026-09-28, the read-only slice's graph contract).
 *
 * The decoder is injected, so both rules are testable without a browser — which matters because `decodeAudioData` is exactly the part that cannot be unit tested, and
 * the bookkeeping around it is exactly the part that breaks.
 */
const CATALOGUE: SampleAsset[] = [
  { assetId: "riser-01", name: "Riser 01", kind: "one-shot", seconds: 2 },
  { assetId: "chop-01", name: "Vox Chop", kind: "one-shot", seconds: 1 },
];

const fakeBuffer = (id: string) => ({ id } as unknown as AudioBuffer);

describe("the sample loader", () => {
  it("decodes an asset once, even when two lanes ask at the same instant", async () => {
    let started = 0;
    const loader = createSampleLoader(async (asset) => {
      started += 1;
      await Promise.resolve();
      return fakeBuffer(asset.assetId);
    }, CATALOGUE);

    // Concurrent, not sequential: the promise is what gets cached, so the second caller awaits the first one's decode.
    const [a, b] = await Promise.all([loader.load("riser-01"), loader.load("riser-01")]);
    expect(a).toBe(b);
    expect(started).toBe(1);
    expect(loader.decodes()).toBe(1);

    // And a later call is still the same buffer.
    expect(await loader.load("riser-01")).toBe(a);
    expect(started).toBe(1);
  });

  it("does not remember a failure, so a retry is a real attempt", async () => {
    let attempts = 0;
    const loader = createSampleLoader(async (asset) => {
      attempts += 1;
      if (attempts === 1) throw new Error("transient decode failure");
      return fakeBuffer(asset.assetId);
    }, CATALOGUE);

    await expect(loader.load("riser-01")).rejects.toThrow(/transient/);
    // The second attempt must reach the decoder rather than the cached rejection.
    await expect(loader.load("riser-01")).resolves.toBeTruthy();
    expect(attempts).toBe(2);
  });

  it("refuses an id the catalogue does not hold, and says what the catalogue's state is", async () => {
    const loader = createSampleLoader(async (asset) => fakeBuffer(asset.assetId), CATALOGUE);
    await expect(loader.load("nope")).rejects.toThrow(/the catalogue holds riser-01, chop-01/);

    // The shipped catalogue is empty, which is the honest state of this feature — and the message says so rather than listing nothing.
    const empty = createSampleLoader(async (asset) => fakeBuffer(asset.assetId));
    await expect(empty.load("riser-01")).rejects.toThrow(/no samples ship with the app yet/);
    expect(empty.decodes()).toBe(0);
  });

  it("decodes two different assets separately, and counts only what it decoded", async () => {
    const loader = createSampleLoader(async (asset) => fakeBuffer(asset.assetId), CATALOGUE);
    const [a, b] = await Promise.all([loader.load("riser-01"), loader.load("chop-01")]);
    expect(a).not.toBe(b);
    expect(loader.decodes()).toBe(2);
  });
});
