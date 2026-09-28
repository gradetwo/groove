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

/**
 * A3's last piece: the same loader, for an entry that is an **instrument**.
 *
 * The decoder is injected and now so is the SFZ fetch, so the whole branch is testable without a browser — which matters, because the interesting part is not the
 * fetching but the rule that a sample shared by several notes is still decoded **once**. That rule is asserted rather than described in a comment.
 */
const INSTRUMENT_SFZ = `
<region> sample=low.wav lokey=0 hikey=47 pitch_keycenter=40
<region> sample=mid.wav lokey=48 hikey=71 pitch_keycenter=60
`;
const INSTRUMENTS: SampleAsset[] = [
  { assetId: "piano", name: "Piano", kind: "one-shot", seconds: 1, sfz: { url: "/samples/piano.sfz" } },
  { assetId: "low.wav", name: "Low", kind: "one-shot", seconds: 0.5 },
  { assetId: "mid.wav", name: "Mid", kind: "one-shot", seconds: 0.5 },
];

describe("the sample loader and an instrument entry", () => {
  it("refuses a note on an entry that is not an instrument, rather than guessing one sample", async () => {
    const loader = createSampleLoader(async (asset) => fakeBuffer(asset.assetId), CATALOGUE);
    await expect(loader.loadNote("riser-01", 60)).rejects.toThrow(/is not an instrument \(it has no sfz\)/);
  });

  it("picks the sample the note's region names, and reports the reason when no region covers it", async () => {
    const loader = createSampleLoader(async (asset) => fakeBuffer(asset.assetId), INSTRUMENTS, async () => INSTRUMENT_SFZ);
    // The resolved note is returned as the buffer's identity, so the assertion is about **which** sample answered.
    expect(((await loader.loadNote("piano", 40)) as unknown as { id: string }).id).toBe("low.wav");
    expect(((await loader.loadNote("piano", 60)) as unknown as { id: string }).id).toBe("mid.wav");
    expect(((await loader.loadNote("piano", 68)) as unknown as { id: string }).id).toBe("mid.wav");

    const gaps = createSampleLoader(async (asset) => fakeBuffer(asset.assetId), [{ ...INSTRUMENTS[0]!, sfz: { url: "/x.sfz" } }], async () => "<region> sample=only.wav lokey=60 hikey=64 pitch_keycenter=60");
    await expect(gaps.loadNote("piano", 70)).rejects.toThrow(/cover keys 60–64/);
  });

  it("decodes a sample shared by several notes only once — the single-flight rule applies to the sample, not the note", async () => {
    let started = 0;
    const loader = createSampleLoader(
      async (asset) => {
        started += 1;
        return fakeBuffer(asset.assetId);
      },
      INSTRUMENTS,
      async () => INSTRUMENT_SFZ
    );
    // Three notes, all answered by mid.wav, plus one by low.wav: two decodes, not four.
    const buffers = await Promise.all([loader.loadNote("piano", 60), loader.loadNote("piano", 61), loader.loadNote("piano", 62), loader.loadNote("piano", 40)]);
    expect(started).toBe(2);
    expect(loader.decodes()).toBe(2);
    // And the shared sample really is one buffer, not three equal ones.
    expect(buffers[0]).toBe(buffers[1]);
    expect(buffers[0]).toBe(buffers[2]);
    expect(buffers[3]).not.toBe(buffers[0]);
  });

  it("reports an SFZ it could not fetch, and an instrument that defines no regions", async () => {
    const failing = createSampleLoader(async (asset) => fakeBuffer(asset.assetId), INSTRUMENTS, async (url) => {
      throw new Error(`SFZ "${url}" could not be fetched (404)`);
    });
    await expect(failing.loadNote("piano", 60)).rejects.toThrow(/could not be fetched \(404\)/);

    const empty = createSampleLoader(async (asset) => fakeBuffer(asset.assetId), INSTRUMENTS, async () => "  ");
    await expect(empty.loadNote("piano", 60)).rejects.toThrow(/has empty SFZ text/);
  });

  it("leaves the plain path exactly as it was", async () => {
    const loader = createSampleLoader(async (asset) => fakeBuffer(asset.assetId), INSTRUMENTS, async () => INSTRUMENT_SFZ);
    // `load` on a plain sample never consults the SFZ fetcher and still behaves as before.
    expect(((await loader.load("low.wav")) as unknown as { id: string }).id).toBe("low.wav");
    expect(loader.decodes()).toBe(1);
    /**
     * And `load` on an **instrument's** id still goes straight to the decoder, unchanged.
     *
     * The first version of this assertion claimed the loader refuses that, and it failed — correctly, because the loader has no such rule and adding one would be a
     * new policy rather than a fix. Whether an instrument id is a legitimate thing to name as a plain sample is a **catalogue authoring** question, and the place that
     * answers such questions is `sampleReferenceProblem`, not the loader. Recorded here rather than quietly dropped, because "the loader refuses the wrong kind of
     * reference" is a plausible-sounding rule that this code does not have.
     */
    expect(((await loader.load("piano")) as unknown as { id: string }).id).toBe("piano");
    expect(loader.decodes()).toBe(2);
  });
});
