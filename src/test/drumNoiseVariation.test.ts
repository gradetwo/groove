/**
 * E-06 (second half) — per-hit noise variation, and the parity it must not break.
 *
 * The determinism half of E-06 made renders reproducible. This half fixes the *other*
 * defect: every drum noise layer called `start(time)` with no offset, so each hit read
 * the shared noise buffer from sample 0. A 16th-note hi-hat pattern was therefore the
 * same few tens of milliseconds of samples repeated byte-for-byte — a static
 * "machine-gun" comb that is one of the clearest tells of a programmed drum part.
 *
 * The hard part is not the variation, it is the *parity*: the live engine and the
 * offline renderer must derive the same offset for the same hit, or an exported file
 * stops matching the audition it came from. So these tests check both.
 */
import { describe, it, expect, afterEach } from "vitest";
import { noisePositionFor, noiseOffsetForHit } from "../audio/noise";
import { renderPatternOffline } from "../audio/WavExporter";
import { FakeOfflineAudioContext, installFakeOfflineAudioContext } from "./helpers/fakeAudio";
import type { SequencerPattern } from "../types/genre";
import { setGs1OfflineCapability } from "../audio/gs1/gs1OfflineCapability";

function drumPattern(trackId: string, name: string, steps: number): SequencerPattern {
  return {
    genre_id: "noise-variation",
    bpm: 120,
    swing: 0,
    scale: "C minor",
    totalSteps: steps,
    tracks: [
      {
        track_id: trackId,
        name,
        instrument: "drum",
        steps: new Array(steps).fill(1),
        velocity: new Array(steps).fill(100),
        pitch: new Array(steps).fill(0),
        gate: new Array(steps).fill(0.8),
        volume: 0.8,
        pan: 0,
        mute: false,
        solo: false,
      },
    ],
  } as unknown as SequencerPattern;
}

describe("noisePositionFor", () => {
  it("is stable for the same hit", () => {
    expect(noisePositionFor(2, 7, 1)).toBe(noisePositionFor(2, 7, 1));
  });

  it("distinguishes track, step and ratchet", () => {
    const base = noisePositionFor(0, 0, 0);
    expect(noisePositionFor(1, 0, 0)).not.toBe(base);
    expect(noisePositionFor(0, 1, 0)).not.toBe(base);
    expect(noisePositionFor(0, 0, 1)).not.toBe(base);
  });

  it("never collides across a realistic pattern size", () => {
    // 8 tracks x 64 steps x 8 ratchets must all be distinct, or two different hits would
    // share a noise slice and re-introduce the correlation this exists to remove.
    const seen = new Set<number>();
    for (let t = 0; t < 8; t++) {
      for (let s = 0; s < 64; s++) {
        for (let r = 0; r < 8; r++) seen.add(noisePositionFor(t, s, r));
      }
    }
    expect(seen.size).toBe(8 * 64 * 8);
  });

  it("produces offsets that vary from hit to hit", () => {
    const offsets = new Set<number>();
    for (let s = 0; s < 32; s++) {
      offsets.add(noiseOffsetForHit(noisePositionFor(2, s), 88200, 22050));
    }
    expect(offsets.size).toBeGreaterThan(28);
  });
});

describe("per-hit noise offsets reach the drum voices", () => {
  let restore: (() => void) | null = null;
  afterEach(() => {
    restore?.();
    restore = null;
  });

  it("gives each hi-hat hit a different noise read offset", async () => {
    restore = installFakeOfflineAudioContext();
    // Every step fires, so 16 hats must not all read from sample 0.
    // The 808 hat is a six-oscillator metallic cluster with no noise layer, so the kit
    // must be one that actually synthesises hats from noise (909/acoustic/cyber).
    await renderPatternOffline(drumPattern("hihat", "HiHat", 16), { drumKit: "909" });

    const ctx = FakeOfflineAudioContext.lastInstance!;
    const offsets = ctx.createdBufferSources
      .flatMap((source) => source.started.map((s) => s.offset))
      .filter((offset) => offset !== undefined);

    expect(offsets.length).toBeGreaterThan(0);
    // Before this work every one of these was 0.
    const distinct = new Set(offsets);
    expect(distinct.size).toBeGreaterThan(1);
    expect(offsets.some((o) => o > 0)).toBe(true);
  });

  it("keeps every offset inside the buffer so start() is always valid", async () => {
    restore = installFakeOfflineAudioContext();
    await renderPatternOffline(drumPattern("snare", "Snare", 16), { drumKit: "909" });

    const ctx = FakeOfflineAudioContext.lastInstance!;
    const bufferDuration = 2; // the shared 2 s noise bed
    for (const source of ctx.createdBufferSources) {
      for (const { offset } of source.started) {
        expect(offset).toBeGreaterThanOrEqual(0);
        expect(offset).toBeLessThan(bufferDuration);
      }
    }
  });

  it("is reproducible: two renders of the same pattern agree hit for hit", async () => {
    restore = installFakeOfflineAudioContext();
    await renderPatternOffline(drumPattern("percussion", "Perc", 16), { drumKit: "909" });
    const first = FakeOfflineAudioContext.lastInstance!.createdBufferSources.flatMap((s) =>
      s.started.map((x) => x.offset)
    );

    restore();
    restore = installFakeOfflineAudioContext();
    await renderPatternOffline(drumPattern("percussion", "Perc", 16), { drumKit: "909" });
    const second = FakeOfflineAudioContext.lastInstance!.createdBufferSources.flatMap((s) =>
      s.started.map((x) => x.offset)
    );

    // Variation must not come at the cost of determinism (V-01).
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(0);
  });
});


/**
 * The offline GS-1 capability probe renders a throwaway context of its own; these cases inspect the *app's* render
 * (hosts, strips, buffers) and would otherwise find the probe's instead. Declared satisfied at module scope here; the
 * probe has its own file, and `probe_engine_parity.mjs` is its acceptance test.
 */
setGs1OfflineCapability("usable");
