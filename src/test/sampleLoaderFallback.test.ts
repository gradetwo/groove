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

/**
 * The probe is injected here as an immediate refusal: every address in this file is a `*.example` host, so the real `no-cors` probe would go to
 * the network to learn what the fixture already knows, and a criterion that depends on DNS is a criterion that fails in CI for the wrong reason.
 */
const loaderWith = (fetchSfzText: (url: string) => Promise<string>) =>
  createSampleLoader(decoder, [asset, sample], fetchSfzText, async () => {
    throw new TypeError("Failed to fetch");
  });

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

/**
 * **"Failed to fetch" is the one error message with no information in it**, and it is what an independent user read for both of the loader's
 * addresses while `curl` on the same URLs returned 200. The browser raises one `TypeError` for a missing `Access-Control-Allow-Origin`, a blocked
 * preflight, a dropped connection and a DNS failure alike, so the reply has to ask the separating question itself: *does the host answer at all?*
 *
 * These criteria drive that question through the loader's own injection point rather than over a network, so what is asserted is the sentence a
 * caller receives in each of the three cases that matter.
 */
describe("a transport failure is explained rather than named", () => {
  const transportFailure = (url: string) => Promise.reject(new TypeError(`Failed to fetch (${url})`));

  it("says the address does not answer cross-origin when the same URL serves bytes to a no-cors request", async () => {
    const probes: string[] = [];
    const loader = createSampleLoader(decoder, [asset, sample], transportFailure, async (url) => {
      probes.push(url);
      // Reachable: the host serves the object, and what the page is missing is the CORS header.
      return { type: "opaque", status: 0 };
    });

    const error = await loader.loadNote("kit", 38).catch((reason: Error) => reason.message);
    // The original facts survive — both addresses and both messages — and the diagnosis is added to them.
    expect(error).toMatch(/neither address served the SFZ/);
    expect(error).toMatch(/Failed to fetch/);
    expect(error).toMatch(/does not answer cross-origin/);
    expect(error).toMatch(/CORS header/);
    // The probe is asked about the addresses that failed, not about anything else, and only after the failure.
    expect(probes).toEqual([SOURCE, MIRROR]);
  });

  it("adds no diagnosis when the address does not answer at all, because the message already says that", async () => {
    const loader = createSampleLoader(decoder, [asset, sample], transportFailure, async () => {
      throw new TypeError("Failed to fetch");
    });

    const error = await loader.loadNote("kit", 38).catch((reason: Error) => reason.message);
    expect(error).toMatch(/neither address served the SFZ/);
    // A guess about CORS here would send a reader to the bucket's policy for a host that is simply down.
    expect(error).not.toMatch(/does not answer cross-origin/);
  });

  it("adds no diagnosis to a load that never fails, and never probes one", async () => {
    const probes: string[] = [];
    const loader = createSampleLoader(decoder, [asset, sample], async () => SFZ, async (url) => {
      probes.push(url);
      return { type: "opaque", status: 0 };
    });

    await expect(loader.loadNote("kit", 38)).resolves.toBeDefined();
    // The probe makes a second request per failure, so a working load must not pay for it.
    expect(probes).toEqual([]);
  });
});
