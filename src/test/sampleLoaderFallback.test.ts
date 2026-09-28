import { describe, expect, it } from "vitest";
import { createSampleLoader } from "../audio/sampleLoader";
import type { SampleAsset } from "../data/sampleCatalogue";

/**
 * The source-first fallback, which is a branch and therefore needs its own criteria.
 *
 * The loader's existing suite passed unchanged when this was added, which is exactly why it proves nothing about the new path: a branch that is never taken cannot fail. Three things matter here —
 * the source is preferred, the mirror is used when the source fails **for any reason**, and when both fail the error names both addresses so a reader knows which host to look at.
 */
const SOURCE = "https://raw.githubusercontent.com/sfzinstruments/virtuosity_drums/9f04cf9a7345/kit/Programs/01-basic-kit.sfz";
const MIRROR = "https://mirror.example/virtuosity-drums/Programs/01-basic-kit.sfz";

// One region on note 38, which is enough for `resolveInstrumentNote` to answer and keeps the SFZ out of the way of what is being tested.
const SFZ = "<region> sample=sample.wav key=38\n";

const asset: SampleAsset = {
  assetId: "kit",
  name: "Kit",
  kind: "one-shot",
  seconds: 1,
  sfz: { url: SOURCE, fallbackUrl: MIRROR },
};

const decoder = async () => ({ duration: 1, length: 44100, numberOfChannels: 1, sampleRate: 44100 }) as unknown as AudioBuffer;

/**
 * **The sample has to be a catalogue asset too.** The first version of this test declared only the instrument and the loader answered `no sample "sample.wav" — the catalogue holds kit`: the decoder is
 * reached through the catalogue by `assetId`, so a region naming a file the catalogue does not know cannot be decoded. That is a real constraint of the design, and the test now mirrors it.
 */
const sample: SampleAsset = { assetId: "sample.wav", name: "Sample", kind: "one-shot", seconds: 1, url: "https://mirror.example/virtuosity-drums/Samples/sample.wav" };

const loaderWith = (fetchSfzText: (url: string) => Promise<string>) => createSampleLoader(decoder, [asset, sample], fetchSfzText);

describe("the loader's source-first fallback", () => {
  it("uses the source and never asks the mirror when the source answers", async () => {
    const asked: string[] = [];
    const loader = loaderWith(async (url) => {
      asked.push(url);
      return SFZ;
    });
    // `loadNote` resolves with a decoded buffer or rejects — the `{ok, reason}` shape belongs to `resolveInstrumentNote`, one layer down. The typecheck said so when the first version of this test
    // asked for `.ok` on an `AudioBuffer`, which is the kind of correction that costs one line instead of one misunderstanding.
    await expect(loader.loadNote("kit", 38)).resolves.toBeDefined();
    // The mirror is a fallback, not a co-equal: asking it while the source works would double the traffic for every note.
    expect(asked).toEqual([SOURCE]);
  });

  it("falls back to the mirror when the source fails, whatever the reason", async () => {
    const asked: string[] = [];
    const loader = loaderWith(async (url) => {
      asked.push(url);
      // A network error rather than a 404: the trigger is any failure, because the two hosts fail differently.
      if (url === SOURCE) throw new Error("network down");
      return SFZ;
    });
    await expect(loader.loadNote("kit", 38)).resolves.toBeDefined();
    expect(asked).toEqual([SOURCE, MIRROR]);
  });

  it("names both addresses when neither answers", async () => {
    const loader = loaderWith(async (url) => {
      throw new Error(url === SOURCE ? "403 from source" : "timeout from mirror");
    });
    await expect(loader.loadNote("kit", 38)).rejects.toThrow(/neither address served the SFZ/);
    // Both reasons, both addresses: "the source is gone and the mirror is misrouted" is a different situation from "this instrument exists nowhere".
    await expect(loader.loadNote("kit", 38)).rejects.toThrow(/403 from source/);
    await expect(loader.loadNote("kit", 38)).rejects.toThrow(/timeout from mirror/);
  });
});
