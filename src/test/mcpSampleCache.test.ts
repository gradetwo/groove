/**
 * ⭐ **The owner's requirement, as criteria: the samples are persisted, shared, and complete before the render starts.**
 *
 * The four facts that have to be able to go red, one case each:
 *
 *   1. **a second render downloads nothing** — remove the process-wide store and it fails, because the loader that each render
 *      builds dies with the render (`src/audio/sampleLoader.ts` states the two caches and that both are per instance);
 *   2. **`render_arrangement_stems`' N tracks download each sample once** — the same removal fails it, and the shape is the one
 *      `mcp/render/worker.ts`'s stem loop actually has: `renderPatternOffline` called once per track, each building its own
 *      loader. Measured before this existed: **134 requests for one three-bar song, then the same 134 in the same process**;
 *   3. **a fresh process still downloads nothing** — the bytes are read back from a *new* store over the same directory, so
 *      deleting the disk write fails it;
 *   4. **the key is the path and the pin, not the URL** — the same library served from `source.test` and `mirror.test` keys
 *      identically, so keying by URL fails it. The pin is in the key because it is in the path
 *      (`…/virtuosity_drums/9f04cf9a7345/…`), which is what makes two revisions of one path different entries.
 *
 * The fifth case is the warm-up gate, and it is the half that is **not** about the cache: `prepareOfflineAudioLanes` must resolve
 * and decode every recording in the plan *before* the render, report progress as loaded/total, and name every failure — the
 * shape `src/audio/samplerLanePrepare.ts` already gives the live path, reused rather than reinvented.
 *
 * Nothing here needs a network, a browser or an audio context: the fetch, the decoder and the store are all injected, which is
 * the point of the seams. `src/test/mcpHeadlessRender.test.ts` is where the same wiring is driven for real, on the Node host.
 */
import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync, statSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { SampleByteCache, renderSampleCacheWiring, type SampleCacheStats } from "../../mcp/render/sampleCache";
import { sampleCacheKey } from "../audio/sampleCacheKey";
import { createSampleLoader, type DecodedSample, type SampleLoader } from "../audio/sampleLoader";
import { prepareOfflineAudioLanes } from "../audio/offlineAudioLanes";
import { renderPatternOffline } from "../audio/WavExporter";
import { loadHeadlessHost } from "../../mcp/render/headless";
import * as graph from "../audio/browserSampleGraph";
import { HEADLESS_PACKAGE } from "../../mcp/render/headless";
import { sampledAssetForLane } from "../data/sampledInstruments";
import type { SampleAsset } from "../data/sampleCatalogue";
import type { SequencerPattern, SequencerTrack } from "../types/genre";

/**
 * Whether the optional Node host is installed; asked synchronously so the real-render case skips loudly rather than failing for a
 * missing package — the same rule `src/test/mcpHeadlessRender.test.ts` follows.
 */
const headlessInstalled = ((): boolean => {
  try {
    createRequire(import.meta.url)(HEADLESS_PACKAGE);
    return true;
  } catch {
    return false;
  }
})();

/**
 * A real, decodable 8 kHz mono WAV holding a **tone**, so the Node host's own decoder can answer it and the renderer's silence
 * guard — which refuses to present an all-but-silent buffer as a render — sees audio. Half a second at about −6 dBFS: long
 * enough to cover one beat at 120 bpm, which is the gate the fixture writes.
 */
function wavBytes(): ArrayBuffer {
  const frames = 4000;
  const dataBytes = frames * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 16000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, dataBytes, true);
  for (let frame = 0; frame < frames; frame += 1) {
    view.setInt16(44 + frame * 2, Math.round(Math.sin((2 * Math.PI * 220 * frame) / 8000) * 16000), true);
  }
  return buffer;
}

/** A directory per test, removed after it, so no case can be answered by another's bytes. */
const directories: string[] = [];
function freshDirectory(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "groove-sample-cache-"));
  directories.push(directory);
  return directory;
}
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

/**
 * A fetch that serves a bytes table and counts every call, **by URL**, so "which address was asked" is assertable as well as
 * "how many times".
 */
function countingFetch(files: Record<string, string>): { fetchImpl: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const fetchImpl = (async (input: unknown) => {
    const url = String(input);
    calls.push(url);
    const body = files[url];
    if (body === undefined) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
    const bytes = new TextEncoder().encode(body);
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    };
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

/** A decoder that answers a buffer of a stated length — enough for every assertion here, and no `AudioContext` needed. */
function fakeDecode(decoded: string[]): (asset: SampleAsset, bytes: ArrayBuffer) => Promise<DecodedSample> {
  return async (asset, bytes) => {
    decoded.push(asset.assetId);
    return { buffer: { length: bytes.byteLength, duration: 1, numberOfChannels: 1, sampleRate: 44100 } as unknown as AudioBuffer };
  };
}

/** A sample as a region names it: library-relative `assetId`, absolute `url`, one pinned library root. */
function sampleAsset(assetId: string, url: string, fallbackUrl?: string): SampleAsset {
  return { assetId, name: assetId, kind: "one-shot", seconds: 1, url, ...(fallbackUrl ? { fallbackUrl } : {}) };
}

/**
 * The pinned library root from this repository's own manifest — `virtuosity_drums` at a commit. Everything below is addressed
 * under it, because the pin living in the URL is exactly what the key is built on.
 */
const PINNED = "https://source.test/virtuosity_drums/9f04cf9a7345";

describe("the sample cache's key is the library and the path, never the address", () => {
  it("keys one pinned library identically when it is served from two hosts", () => {
    const fromSource = sampleAsset("Samples/kick.wav", `${PINNED}/Samples/kick.wav`);
    const fromMirror = sampleAsset("Samples/kick.wav", `https://mirror.test/virtuosity_drums/9f04cf9a7345/Samples/kick.wav`);
    expect(sampleCacheKey(fromMirror)).toBe(sampleCacheKey(fromSource));
  });

  it("keys two revisions of one path differently, because the revision is in the path", () => {
    const older = sampleAsset("Samples/kick.wav", "https://source.test/lib/aaaa1111/Samples/kick.wav");
    const newer = sampleAsset("Samples/kick.wav", "https://source.test/lib/bbbb2222/Samples/kick.wav");
    expect(sampleCacheKey(newer)).not.toBe(sampleCacheKey(older));
  });

  it("answers a download made under one address from the other, with nothing on the wire", () => {
    const store = new SampleByteCache({ directory: freshDirectory(), limitBytes: null });
    const { fetchImpl, calls } = countingFetch({ [`${PINNED}/Samples/kick.wav`]: "kick-bytes" });
    const wiring = renderSampleCacheWiring({ fetchImpl, store });
    const decode = fakeDecode([]);

    return wiring
      .decoderFor({} as BaseAudioContext, decode)(sampleAsset("Samples/kick.wav", `${PINNED}/Samples/kick.wav`))
      .then(() => {
        expect(calls).toHaveLength(1);
        // Same library, same relative path, a *different host*: the bytes are already here.
        return wiring.decoderFor({} as BaseAudioContext, decode)(
          sampleAsset("Samples/kick.wav", "https://mirror.test/virtuosity_drums/9f04cf9a7345/Samples/kick.wav")
        );
      })
      .then(() => {
        expect(calls, "the mirror address must not be fetched: the key ignores the host").toHaveLength(1);
        expect(wiring.stats().diskHits).toBe(1);
      });
  });
});

describe("the bytes survive the process that downloaded them", () => {
  it("is a hit from a brand-new store over the same directory, with zero requests", async () => {
    const directory = freshDirectory();
    const { fetchImpl, calls } = countingFetch({ [`${PINNED}/Samples/snare.wav`]: "snare-bytes" });
    const asset = sampleAsset("Samples/snare.wav", `${PINNED}/Samples/snare.wav`);

    const first = new SampleByteCache({ directory, limitBytes: null });
    await renderSampleCacheWiring({ fetchImpl, store: first }).decoderFor({} as BaseAudioContext, fakeDecode([]))(asset);
    expect(calls).toHaveLength(1);
    expect(readdirSync(directory).filter((name) => name.endsWith(".bin"))).toHaveLength(1);

    /**
     * ⭐ **A new store, a new wiring, a new render** — the same directory. Nothing about the first one is reachable except the
     * bytes on disk, which is the whole claim.
     */
    const second = new SampleByteCache({ directory, limitBytes: null });
    const decoded: string[] = [];
    const stats: SampleCacheStats = (() => {
      const wiring = renderSampleCacheWiring({ fetchImpl, store: second });
      void wiring;
      return second.stats;
    })();
    await renderSampleCacheWiring({ fetchImpl, store: second }).decoderFor({} as BaseAudioContext, fakeDecode(decoded))(asset);

    expect(calls, "a fresh process must not fetch what is already on disk").toHaveLength(1);
    expect(decoded, "the decode still happens — a buffer belongs to its context").toEqual(["Samples/snare.wav"]);
    expect(stats.diskHits).toBe(1);
    expect(stats.networkRequests).toBe(0);
    expect(stats.decodeMs).toBeGreaterThanOrEqual(0);
  });

  it("keeps decode time and download time as separate numbers", async () => {
    const directory = freshDirectory();
    const { fetchImpl } = countingFetch({ [`${PINNED}/Samples/a.wav`]: "a".repeat(64) });
    const store = new SampleByteCache({ directory, limitBytes: null });
    const wiring = renderSampleCacheWiring({ fetchImpl, store });

    // A decoder that takes measurable time, so the two brackets cannot both be zero by accident.
    const slowDecode = async (): Promise<DecodedSample> => {
      const until = performance.now() + 5;
      while (performance.now() < until) {
        /* the measured half */
      }
      return { buffer: {} as AudioBuffer };
    };
    await wiring.decoderFor({} as BaseAudioContext, slowDecode)(sampleAsset("Samples/a.wav", `${PINNED}/Samples/a.wav`));

    const stats = wiring.stats();
    expect(stats.networkMs).toBeGreaterThan(0);
    expect(stats.decodeMs, "the decode is the half that took 5 ms on purpose").toBeGreaterThan(2);
    expect(stats.networkRequests).toBe(1);
    expect(stats.writes).toBe(1);
  });
});

describe("one process, repeated renders", () => {
  /** Wiring over a section of a library: one sample per distinct note, as an SFZ program names them. */
  const SAMPLE_URLS = {
    [`${PINNED}/Samples/a.wav`]: "A",
    [`${PINNED}/Samples/b.wav`]: "B",
    [`${PINNED}/Samples/c.wav`]: "C",
  };
  const assets = [
    sampleAsset("Samples/a.wav", `${PINNED}/Samples/a.wav`),
    sampleAsset("Samples/b.wav", `${PINNED}/Samples/b.wav`),
    sampleAsset("Samples/c.wav", `${PINNED}/Samples/c.wav`),
  ];

  /** One render: a new loader (as every render builds), the shared store underneath. */
  async function renderOnce(wiring: ReturnType<typeof renderSampleCacheWiring>): Promise<number> {
    const loader: SampleLoader = createSampleLoader(wiring.decoderFor({} as BaseAudioContext, fakeDecode([])), assets);
    await Promise.all(assets.map((asset) => loader.load(asset.assetId)));
    return loader.decodes();
  }

  it("fetches each sample once for two renders, which is the point of a process-wide store", async () => {
    const { fetchImpl, calls } = countingFetch(SAMPLE_URLS);
    const wiring = renderSampleCacheWiring({ fetchImpl, store: new SampleByteCache({ directory: freshDirectory(), limitBytes: null }) });

    expect(await renderOnce(wiring)).toBe(3);
    const afterFirst = calls.length;
    expect(afterFirst).toBe(3);

    // ⭐ The second render — a *new* loader, exactly as `renderPatternOffline` builds one per call.
    expect(await renderOnce(wiring)).toBe(3);
    expect(calls.length, "the second render must add no requests at all").toBe(afterFirst);
    expect(wiring.stats().diskHits).toBe(3);
  });

  it("fetches each sample once across N stem renders — the owner's '被重复下载 5 次'", async () => {
    const { fetchImpl, calls } = countingFetch(SAMPLE_URLS);
    const wiring = renderSampleCacheWiring({ fetchImpl, store: new SampleByteCache({ directory: freshDirectory(), limitBytes: null }) });

    /**
     * `render_arrangement_stems` renders **one track per call** (`mcp/render/worker.ts`), each of which builds its own loader —
     * so five tracks is five full passes over the same catalogue, and before the shared store that was five full downloads.
     */
    const stems = 5;
    for (let stem = 0; stem < stems; stem += 1) await renderOnce(wiring);

    expect(calls.length, `${stems} stems must download 3 samples, not ${stems * 3}`).toBe(3);
    expect(wiring.stats().diskHits).toBe(3 * (stems - 1));
    expect(new Set(calls).size).toBe(3);
  });
});

describe("the process-wide store the render paths actually use", () => {
  /**
   * ⭐ **The sharing has to hold for callers that ask for nothing.**
   *
   * The cases above inject a store, which judges the cache; this one judges the **default** — `renderSampleCacheWiring()` with no
   * arguments, which is what `mcp/render/headless.ts` calls. Two such wirings, built independently, must read and write one store,
   * or a per-render cache would pass every injected-store case while the real render path paid again. The mutation this is aimed
   * at is making `processSampleStore()` return a fresh store each time.
   */
  it("shares one store between two wirings built with no store of their own", async () => {
    const directory = freshDirectory();
    const previous = process.env.GROOVE_SAMPLE_CACHE;
    process.env.GROOVE_SAMPLE_CACHE = directory;
    try {
      const { fetchImpl, calls } = countingFetch({ [`${PINNED}/Samples/shared.wav`]: "shared-bytes" });
      const asset = sampleAsset("Samples/shared.wav", `${PINNED}/Samples/shared.wav`);

      const first = renderSampleCacheWiring({ fetchImpl });
      await first.decoderFor({} as BaseAudioContext, fakeDecode([]))(asset);
      expect(calls).toHaveLength(1);
      const before = first.stats();

      const second = renderSampleCacheWiring({ fetchImpl });
      await second.decoderFor({} as BaseAudioContext, fakeDecode([]))(asset);

      expect(calls, "the second render path must find the first one's bytes").toHaveLength(1);
      const after = second.stats();
      expect(after.networkRequests, "no request may be added by the second wiring").toBe(before.networkRequests);
      expect(after.diskHits - before.diskHits, "the hit must be recorded on the shared counters").toBe(1);
      expect(first.store, "both wirings must be the same object").toBe(second.store);
    } finally {
      if (previous === undefined) delete process.env.GROOVE_SAMPLE_CACHE;
      else process.env.GROOVE_SAMPLE_CACHE = previous;
    }
  });
});

describe("the per-user directory, the bound, and the way out", () => {
  it("stores under the directory it was given and reports its size", async () => {
    const directory = freshDirectory();
    const { fetchImpl } = countingFetch({ [`${PINNED}/Samples/d.wav`]: "d".repeat(32) });
    const store = new SampleByteCache({ directory, limitBytes: null });
    await renderSampleCacheWiring({ fetchImpl, store }).decoderFor({} as BaseAudioContext, fakeDecode([]))(
      sampleAsset("Samples/d.wav", `${PINNED}/Samples/d.wav`)
    );
    expect(store.usage()).toEqual({ entries: 1, bytes: 32 });
    expect(statSync(path.join(directory, readdirSync(directory)[0]!)).size).toBe(32);
  });

  it("evicts least-recently-used entries once the bound is exceeded, and never grows past it", async () => {
    const directory = freshDirectory();
    const files: Record<string, string> = {
      [`${PINNED}/Samples/one.wav`]: "1".repeat(40),
      [`${PINNED}/Samples/two.wav`]: "2".repeat(40),
      [`${PINNED}/Samples/three.wav`]: "3".repeat(40),
    };
    const { fetchImpl } = countingFetch(files);
    // A bound that fits two entries: the third write must take the least recently used one away.
    const store = new SampleByteCache({ directory, limitBytes: 90 });
    const wiring = renderSampleCacheWiring({ fetchImpl, store });
    const decode = fakeDecode([]);

    await wiring.decoderFor({} as BaseAudioContext, decode)(sampleAsset("Samples/one.wav", `${PINNED}/Samples/one.wav`));
    await new Promise((resolve) => setTimeout(resolve, 10));
    await wiring.decoderFor({} as BaseAudioContext, decode)(sampleAsset("Samples/two.wav", `${PINNED}/Samples/two.wav`));
    // `one` is touched last, so `two` is the least recently used when `three` arrives.
    await wiring.decoderFor({} as BaseAudioContext, decode)(sampleAsset("Samples/one.wav", `${PINNED}/Samples/one.wav`));
    await new Promise((resolve) => setTimeout(resolve, 10));
    await wiring.decoderFor({} as BaseAudioContext, decode)(sampleAsset("Samples/three.wav", `${PINNED}/Samples/three.wav`));

    const usage = store.usage();
    expect(usage.bytes, "the bound is a bound, not a target").toBeLessThanOrEqual(90);
    expect(usage.entries).toBe(2);
    expect(store.stats.evictions).toBe(1);
    expect(store.stats.evictedBytes).toBe(40);
  });

  it("can be cleared, and clearing it makes the next read pay again", async () => {
    const directory = freshDirectory();
    const files = { [`${PINNED}/Samples/e.wav`]: "e".repeat(16) };
    const { fetchImpl, calls } = countingFetch(files);
    const store = new SampleByteCache({ directory, limitBytes: null });
    const wiring = renderSampleCacheWiring({ fetchImpl, store });
    const asset = sampleAsset("Samples/e.wav", `${PINNED}/Samples/e.wav`);

    await wiring.decoderFor({} as BaseAudioContext, fakeDecode([]))(asset);
    expect(store.usage().entries).toBe(1);
    expect(store.clear()).toBe(1);
    expect(store.usage()).toEqual({ entries: 0, bytes: 0 });

    await wiring.decoderFor({} as BaseAudioContext, fakeDecode([]))(asset);
    expect(calls, "after a clear the bytes really are gone").toHaveLength(2);
  });

  it("does not cache a failure — a 404 must not become a permanent one", async () => {
    const store = new SampleByteCache({ directory: freshDirectory(), limitBytes: null });
    const { fetchImpl, calls } = countingFetch({});
    const wiring = renderSampleCacheWiring({ fetchImpl, store });
    const asset = sampleAsset("Samples/missing.wav", `${PINNED}/Samples/missing.wav`);

    await expect(wiring.decoderFor({} as BaseAudioContext, fakeDecode([]))(asset)).rejects.toThrow("HTTP 404");
    await expect(wiring.decoderFor({} as BaseAudioContext, fakeDecode([]))(asset)).rejects.toThrow("HTTP 404");
    expect(calls).toHaveLength(2);
    expect(store.usage().entries).toBe(0);
    expect(store.stats.failures).toBe(2);
  });
});

/**
 * ⭐ **The warm-up gate: what this render needs, resolved and decoded before it starts.**
 *
 * The plan is the renderer's own (`planOfflineAudioLanes`), the fixture is the shape `src/test/samplerLanePrepare.test.ts` uses
 * for the live path (a mapped lane with a repeated pitch), and the assertion is the one the requirement is made of: **every
 * recording the plan names is in the loader's cache before the first voice is placed**, reported as loaded/total, with each
 * failure named.
 */
describe("the pre-render warm-up", () => {
  const lane = {
    track_id: "lead",
    name: "Lead",
    instrument: "sax_lead",
    steps: [1, 1, 1, 1, 1, 0, 0, 0],
    pitch: [60, 60, 62, 60, 67, 0, 0, 0],
    pitches: [[60], [60], [62], [60], [67], [], [], []],
  } as unknown as SequencerTrack;
  const pattern = { totalSteps: 8, genre_id: "fixture", tracks: [lane] } as unknown as SequencerPattern;
  const laneAssetId = sampledAssetForLane(lane)!;
  const laneAsset: SampleAsset = {
    assetId: laneAssetId,
    name: "fixture sax",
    kind: "one-shot",
    seconds: 1,
    sfz: { url: `${PINNED}/Programs/sax.sfz`, path: "Programs/sax.sfz" },
  };
  const PROGRAM = [
    "<control> default_path=Samples/",
    "<region> sample=a.wav key=60 pitch_keycenter=60",
    "<region> sample=b.wav key=62 pitch_keycenter=62",
    "<region> sample=c.wav key=67 pitch_keycenter=67",
  ].join("\n");

  function countingLoader(): { loader: SampleLoader; decodes: () => number; noteLoads: () => number } {
    let decodes = 0;
    let noteLoads = 0;
    const loader = createSampleLoader(
      async () => {
        decodes += 1;
        return { buffer: {} as AudioBuffer };
      },
      [laneAsset],
      async () => PROGRAM
    );
    return {
      loader: {
        load: (assetId: string) => loader.load(assetId),
        loadNote: (assetId, note, options) => {
          noteLoads += 1;
          return loader.loadNote(assetId, note, options);
        },
        decodes: () => loader.decodes(),
      },
      decodes: () => decodes,
      noteLoads: () => noteLoads,
    };
  }

  it("resolves every distinct recording, reports loaded/total, and is ready", async () => {
    const { loader, noteLoads } = countingLoader();
    const ticks: Array<{ loaded: number; total: number }> = [];
    const report = await prepareOfflineAudioLanes({
      pattern,
      loader,
      catalogue: [laneAsset],
      onProgress: (progress) => ticks.push({ ...progress }),
    });

    // Three distinct pitches across eight steps: three recordings, however many notes repeat them.
    expect(report.total).toBe(3);
    expect(report.loaded).toBe(3);
    expect(report.ready).toBe(true);
    expect(report.empty).toBe(false);
    expect(report.problems).toEqual([]);
    expect(noteLoads(), "deduplicated by note, not by step").toBe(3);
    // Determinate: 0 first, one tick per recording, ending at the total.
    expect(ticks[0]).toEqual({ loaded: 0, total: 3 });
    expect(ticks.at(-1)).toEqual({ loaded: 3, total: 3 });
  });

  it("makes the render's own resolution free: the second pass adds no decode", async () => {
    const { loader, decodes } = countingLoader();
    await prepareOfflineAudioLanes({ pattern, loader, catalogue: [laneAsset] });
    const afterWarm = decodes();

    /**
     * ⭐ **This is the gate.** Two different loaders over one store's bytes is the cross-render case; this is the *same* render's
     * second pass — the mixing call that follows the warm-up — and it must add nothing. If the warm-up is removed, the run that
     * follows is the one that pays, which is what the case above measures from the other side.
     */
    await prepareOfflineAudioLanes({ pattern, loader, catalogue: [laneAsset] });
    expect(decodes()).toBe(afterWarm);
    expect(afterWarm).toBe(3);
  });

  it("names a recording it could not resolve, and is not ready — but still loads the rest", async () => {
    const { loader } = countingLoader();
    const failing: SampleLoader = {
      load: (assetId) => loader.load(assetId),
      loadNote: (assetId, note, options) =>
        note === 62 ? Promise.reject(new Error("no region covers key 62")) : loader.loadNote(assetId, note, options),
      decodes: () => loader.decodes(),
    };
    const report = await prepareOfflineAudioLanes({ pattern, loader: failing, catalogue: [laneAsset] });

    expect(report.ready).toBe(false);
    expect(report.loaded).toBe(2);
    expect(report.total).toBe(3);
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]).toContain("note 62");
    expect(report.problems[0]).toContain("no region covers key 62");
  });

  it("says nothing and asks for nothing when the pattern has no recorded lane", async () => {
    const synthOnly = {
      totalSteps: 8,
      genre_id: "fixture",
      tracks: [{ track_id: "kick", name: "Kick", instrument: "drum", steps: [1, 0, 0, 0] }],
    } as unknown as SequencerPattern;
    let asked = 0;
    const loader: SampleLoader = {
      load: async () => {
        asked += 1;
        return {} as AudioBuffer;
      },
      loadNote: async () => {
        asked += 1;
        return { buffer: {} as AudioBuffer, ratio: 1, samplePath: "x" };
      },
      decodes: () => asked,
    };
    const report = await prepareOfflineAudioLanes({ pattern: synthOnly, loader, catalogue: [] });
    expect(report).toEqual({ loaded: 0, total: 0, ready: true, empty: true, problems: [] });
    expect(asked).toBe(0);
  });
});

/**
 * ⭐ **The gate, driven through the real renderer** — `renderPatternOffline`, the Node host, and a fetch tap that records *when*
 * each request happened.
 *
 * The seeded order is the assertion, and it is the one the requirement is made of: **every recording the plan names is fetched
 * before `startRendering()` begins.** The renderer reports the frame it has reached through `onRenderProgress`, which it only
 * starts calling once rendering is under way, so "a fetch after the first frame callback" is a download inside the render — the
 * thing the warm-up exists to prevent. Remove the warm-up and those fetches move after that point; the count is unchanged, which
 * is why the *order* is what this case asserts rather than a total.
 *
 * It runs on the real Node host because that is the only place `renderPatternOffline` has an `OfflineAudioContext`, and it skips
 * loudly when the optional package is absent, as `src/test/mcpHeadlessRender.test.ts` does for the same reason.
 */
describe.skipIf(!headlessInstalled)("the warm-up gate, through the real renderer", () => {
  it("fetches every recording before the render starts", async () => {
    // The Node host's globals must exist before the renderer builds a context; this is the same call `renderPatternHeadless` makes.
    loadHeadlessHost(path.join(process.cwd(), "public"));
    const directory = freshDirectory();
    const PIN = "https://source.test/fixture-lib/pin1234";
    const PROGRAM = [
      "<control> default_path=Samples/",
      "<region> sample=one.wav key=60 pitch_keycenter=60",
      "<region> sample=two.wav key=62 pitch_keycenter=62",
    ].join("\n");
    const files: Record<string, string> = { [`${PIN}/Programs/lead.sfz`]: PROGRAM };

    const lane = {
      track_id: "lead",
      name: "Lead",
      instrument: "sax_lead",
      steps: [1, 0, 1, 0, 0, 0, 0, 0],
      pitch: [60, 0, 62, 0, 0, 0, 0, 0],
      pitches: [[60], [], [62], [], [], [], [], []],
    } as unknown as SequencerTrack;
    const pattern = { totalSteps: 8, genre_id: "fixture", tracks: [lane], bpm: 120 } as unknown as SequencerPattern;
    const assetId = sampledAssetForLane(lane)!;
    const asset: SampleAsset = {
      assetId,
      name: "fixture sax",
      kind: "one-shot",
      seconds: 1,
      sfz: { url: `${PIN}/Programs/lead.sfz`, path: "Programs/lead.sfz" },
    };

    const order: Array<{ what: string; at: number }> = [];
    const started = performance.now();
    const { fetchImpl } = countingFetch(files);
    const tappedFetch = (async (input: unknown, init?: unknown) => {
      order.push({ what: `fetch ${new URL(String(input)).pathname.split("/").pop()}`, at: performance.now() - started });
      // Every recording the program names is a tiny real WAV, so the host's own decoder can decode it.
      if (files[String(input)] === undefined) {
        const bytes = wavBytes();
        return { ok: true, status: 200, arrayBuffer: async () => bytes };
      }
      return (fetchImpl as unknown as (u: unknown, i?: unknown) => Promise<unknown>)(input, init);
    }) as unknown as typeof fetch;

    const store = new SampleByteCache({ directory, limitBytes: null });
    const wiring = renderSampleCacheWiring({ fetchImpl: tappedFetch, store });

    let preparation: { loaded: number; total: number; ready: boolean; problems: string[] } | null = null;
    const decoderCalls: number[] = [];
    const buffer = await renderPatternOffline(pattern, {
      bars: 1,
      sampleRate: 8000,
      channels: 1,
      audioLaneCatalogue: [asset],
      sampleDecoder: (context) => {
        const decoder = wiring.decoderFor(context, graph.browserBytesDecoder(context));
        return async (sample) => {
          decoderCalls.push(performance.now() - started);
          return decoder(sample);
        };
      },
      fetchSfzBytes: wiring.fetchSfzBytes,
      onAudioLanePreparation: (report) => {
        preparation = { loaded: report.loaded, total: report.total, ready: report.ready, problems: [...report.problems] };
        order.push({ what: `prepared ${report.loaded}/${report.total}`, at: performance.now() - started });
      },
      onRenderProgress: () => order.push({ what: "frame", at: performance.now() - started }),
    });

    expect(buffer.length).toBeGreaterThan(0);
    expect(preparation, "the warm-up must report before the render").not.toBeNull();
    expect(preparation!.ready, `warm-up problems: ${preparation!.problems.join(" | ")}`).toBe(true);
    expect(preparation!.total).toBe(2);
    expect(preparation!.loaded).toBe(2);

    /**
     * ⭐ **The seeded order.** The warm-up's own report comes first; then every recording's fetch; then the render's first frame —
     * and no fetch after it. A fetch between the first frame and the end is a download inside the render.
     */
    const firstFrameIndex = order.findIndex((entry) => entry.what === "frame");
    expect(firstFrameIndex, "the renderer must have reported at least one frame").toBeGreaterThan(-1);
    const fetchesAfterFirstFrame = order.slice(firstFrameIndex).filter((entry) => entry.what.startsWith("fetch"));
    expect(fetchesAfterFirstFrame.map((entry) => entry.what), "no recording may be fetched once rendering has begun").toEqual([]);
    // And the SFZ program itself is fetched before the render too, from the same store.
    const fetches = order.filter((entry) => entry.what.startsWith("fetch")).map((entry) => entry.what);
    expect(fetches).toContain("fetch lead.sfz");
    expect(fetches.filter((what) => what === "fetch lead.sfz")).toHaveLength(1);
    // Two recordings, decoded in the warm-up: the mixing pass is a cache hit rather than a second decode.
    expect(decoderCalls.length).toBeGreaterThanOrEqual(2);
  }, 120_000);
});
