import { afterEach, describe, it, expect, vi } from "vitest";
import { GS1_PATCHES, GS1_TEXTURE_ROUTING, resolveGs1Patch, routingForRole } from "../data/gs1Patches";
import { gs1PatchFor, patchNeedsSample } from "../audio/gs1/gs1Tracks";
import { Param } from "../../vendor/gs1/src/audio/params";
import {
  TEXTURE_SAMPLE_ROOT,
  TEXTURE_SAMPLE_SECONDS,
  generateTextureSample,
} from "../audio/gs1/textureSample";

/**
 * P2.5's first slice: the **voice** for sample-based texture, and the recording it plays.
 *
 * The licence question is set aside, so the plumbing can be built — and the recording itself is content the repository
 * does not have, so the mechanism ships with a generated stand-in and a documented import path. These cases pin what
 * can be pinned without audio hardware: the routing resolves, the patch is in the core's **sample** mode, the patch
 * and the generator agree about the root key, and the generated one-shot has the shape a texture lane needs.
 */
describe("P2.5 · sample-based texture", () => {
  it("routes a texture instrument to the sample patch", () => {
    expect(routingForRole("texture")).toBe(GS1_TEXTURE_ROUTING);
    expect(Object.keys(GS1_TEXTURE_ROUTING).length).toBeGreaterThan(1);
    for (const instrument of Object.keys(GS1_TEXTURE_ROUTING)) {
      const resolved = resolveGs1Patch("texture", instrument);
      expect(resolved?.patch, instrument).toBe("sampleTexture");
    }
  });

  it("puts the patch in the core's sample mode, at the root the generator says", () => {
    const patch = GS1_PATCHES.sampleTexture;
    // `Wave::from_u32`: 8 is the single-cycle wavetable and 9 is the imported sample.
    expect(patch[Param.OSC1_WAVE]).toBe(9);
    expect(patch[Param.SMP_ROOT]).toBe(TEXTURE_SAMPLE_ROOT);
    // One-shot: `SMP_MODE` is the sample's loop mode, and a found sound is not a loop by default.
    expect(patch[Param.SMP_MODE]).toBe(0);
    // The measured headroom ceiling (E3, eight voices) — a patch above it drives the core's own limiter.
    expect(patch[Param.PATCH_GAIN] ?? 1).toBeLessThanOrEqual(0.6);
  });

  it("generates a deterministic one-shot that starts loud and ends silent", () => {
    const a = generateTextureSample(44100);
    const b = generateTextureSample(44100);
    expect(a.length).toBe(Math.round(TEXTURE_SAMPLE_SECONDS * 44100));
    expect(a.length).toBe(b.length);
    // Deterministic: two calls are the same bytes, which is what lets a render repeat.
    for (let i = 0; i < a.length; i += 97) expect(a[i]).toBe(b[i]);

    const head = (() => {
      let peak = 0;
      for (let i = 0; i < a.length / 10; i += 1) peak = Math.max(peak, Math.abs(a[i]));
      return peak;
    })();
    const tail = (() => {
      let peak = 0;
      for (let i = Math.floor(a.length * 0.9); i < a.length; i += 1) peak = Math.max(peak, Math.abs(a[i]));
      return peak;
    })();
    let overall = 0;
    for (let i = 0; i < a.length; i += 1) overall = Math.max(overall, Math.abs(a[i]));

    expect(overall, "normalised to a known peak so the patch's gain means something").toBeCloseTo(0.9, 1);
    expect(head).toBeGreaterThan(tail * 4);
    // …and the tail is *quiet*, not truncated: the last sample is close to silence.
    expect(Math.abs(a[a.length - 1])).toBeLessThan(0.01);
  });

  it("honours the sample rate it is given, so playback pitch does not depend on render settings", () => {
    expect(generateTextureSample(22050).length).toBe(Math.round(TEXTURE_SAMPLE_SECONDS * 22050));
    // A nonsense rate falls back rather than producing a zero-length buffer the host would refuse.
    expect(generateTextureSample(Number.NaN).length).toBe(Math.round(TEXTURE_SAMPLE_SECONDS * 44100));
  });
});

/**
 * The **loader**: a sample patch is silent until its recording arrives, so whoever builds the host has to hand it one.
 *
 * Both paths ask the same two questions in the same place — does this patch play a sample, and has this host been given
 * one — which is what these cases check at the seam rather than through a render, because the import is asynchronous
 * and the interesting failure is "asked zero times" or "asked on every note".
 */
describe("P2.5 · the loader", () => {
  it("knows which patches need a recording", () => {
    expect(patchNeedsSample("sampleTexture")).toBe(true);
    for (const name of Object.keys(GS1_PATCHES) as Array<keyof typeof GS1_PATCHES>) {
      if (name === "sampleTexture") continue;
      expect(patchNeedsSample(name), name).toBe(false);
    }
  });

  it("routes a texture instrument through whatever lane declares it", () => {
    // The lane is an `fx` lane; the instrument is what says "this is a recording".
    expect(gs1PatchFor("fx", "vinyl_texture")?.patch).toBe("sampleTexture");
    // …and the rule runs one way only: an fx instrument that is not a texture stays native.
    expect(gs1PatchFor("fx", "noise_sweep")).toBeNull();
    // The role-specific tables still win where they apply.
    expect(gs1PatchFor("chords", "warm_pad")?.patch).toBe("warmPad");
  });
});

/**
 * …and the **renderer** finally plays one: an `fx` lane whose instrument names a recording goes through GS-1, with its
 * sample loaded, instead of the native riser.
 *
 * This is the slice that needed a *mechanism* test rather than a genre: no genre declares a texture instrument yet, so
 * the pattern here is built by hand. What it pins is the whole chain in one render — the host is built for the lane,
 * the sample is imported, the patch is the sample patch, and notes are addressed to that host.
 */
import { installFakeOfflineAudioContext } from "./helpers/fakeAudio";
import { setGs1RoutingEnabled } from "../audio/gs1/gs1Tracks";

const mocks = vi.hoisted(() => ({ createGs1Host: vi.fn() }));
vi.mock("../audio/gs1/Gs1Host", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../audio/gs1/Gs1Host")>();
  return { ...actual, createGs1Host: mocks.createGs1Host };
});

describe("P2.5 · a texture lane renders through GS-1", () => {
  afterEach(() => {
    setGs1RoutingEnabled(true);
    mocks.createGs1Host.mockReset();
  });

  it("builds a host for the texture lane, imports the recording, and plays the notes there", async () => {
    const { renderPatternOffline } = await import("../audio/WavExporter");
    const restore = installFakeOfflineAudioContext();
    setGs1RoutingEnabled(true);

    const hosts: Array<{
      setPatch: ReturnType<typeof vi.fn>;
      importSample: ReturnType<typeof vi.fn>;
      noteOnAt: ReturnType<typeof vi.fn>;
      setTuningNote: ReturnType<typeof vi.fn>;
      noteOffAt: ReturnType<typeof vi.fn>;
      output: { connect: () => void };
      ready: Promise<{ abi: number; variant: string }>;
      scheduledNoteLatencyFrames: number;
      dispose: () => void;
    }> = [];
    mocks.createGs1Host.mockImplementation(async () => {
      const host = {
        ready: Promise.resolve({ abi: 9, variant: "simd" }),
        scheduledNoteLatencyFrames: 128,
        output: { connect: () => undefined },
        setPatch: vi.fn(),
        importSample: vi.fn().mockResolvedValue({ has: true, code: 0 }),
        clearSample: vi.fn().mockResolvedValue({ has: false, code: 0 }),
        noteOnAt: vi.fn(),
        noteOffAt: vi.fn(),
        setTuningNote: vi.fn(),
        allNotesOff: vi.fn(),
        dispose: vi.fn(),
      };
      hosts.push(host);
      return host;
    });

    const pattern = {
      genre_id: "chicago-house",
      bpm: 124,
      swing: 0,
      scale: "C minor",
      totalSteps: 16,
      tracks: [
        {
          name: "Texture",
          track_id: "fx",
          instrument: "vinyl_texture",
          steps: [1, ...Array(15).fill(0)],
          velocity: [90, ...Array(15).fill(0)],
          // The bar is 100 here, not 1: `probabilityPasses` reads the track's own 0-100 scale, and a `1` gates the
          // step to a ~1 % roll — which is how this case first failed, with the host built and no note addressed to it.
          probability: Array(16).fill(100),
        },
      ],
    } as never;

    await renderPatternOffline(pattern, { bars: 1, sampleRate: 44100 });
    restore();

    expect(hosts.length, "one host for the texture lane").toBe(1);
    const host = hosts[0];
    expect(host.setPatch).toHaveBeenCalledTimes(1);
    // The recording arrives before any note, and at the render's own rate.
    expect(host.importSample).toHaveBeenCalledTimes(1);
    expect(host.importSample.mock.calls[0][1]).toBe(44100);
    expect((host.importSample.mock.calls[0][0] as Float32Array).length).toBeGreaterThan(1000);
    // …and the note is addressed to that host rather than to the native riser.
    expect(host.noteOnAt).toHaveBeenCalled();
    expect(host.setTuningNote).toHaveBeenCalled();
  });
});
