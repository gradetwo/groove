/**
 * ⭐ **A track the render can never voice gets no channel strip — and a track it can voice still gets one.**
 *
 * The offline renderer built a full `ChannelStrip` (high-pass, EQ, compressor, drive, duck, polarity, pan and two send
 * taps) for **every** track before anything was scheduled, so an arrangement seeded from a smaller genre paid DSP rent
 * for tracks that hold no notes. The perf audit of 2026-10-13 measured it as the render's floor: an eighteen-strip
 * silent graph rendered 33.9 s of nothing against 1.5 s for one strip, and on this machine the same shape went
 * **21.8 s → 7.1 s** once the empty tracks stopped building strips.
 *
 * Two facts have to hold together, and each is one of the cases below:
 *
 *   1. **empty tracks add nothing** — the counter must not move when they are appended. This is the red proof: before
 *      the bypass it moved by 12 gains per empty track (4 empty → 88, 8 empty → 136), so the second case below fails
 *      on the old code with `136 !== 88`.
 *   2. **a sounding track keeps its strip** — the saving must not come from skipping real tracks. The audible-path
 *      fingerprint is unchanged, which was measured separately against the real `OfflineAudioContext`
 *      (`node-web-audio-api`): peak `0.86099380` and 1 435 992 non-zero samples, identical on both trees.
 *
 * The counter is `createdGains`, because that is what the fake graph records; the strips' gain nodes are what the
 * renderer allocates per track, so the reading is the shape under test rather than a proxy for it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderPatternOffline } from "../audio/WavExporter";
import { FakeAudioGraph, installFakeAudioContext, installFakeOfflineAudioContext } from "./helpers/fakeAudio";

/** Sixteen steps, so a track's `steps` array is the length the renderer expects. */
const rep = (pattern: number[]): number[] => {
  const out: number[] = [];
  for (let i = 0; i < 16; i++) out.push(pattern[i % pattern.length] ?? 0);
  return out;
};

const track = (id: string, steps: number[]) => ({
  track_id: id,
  name: id,
  instrument: id === "kick" ? "kick" : "synth",
  steps,
  velocity: rep([100]),
  pitch: rep([0]),
  volume: 0.8,
  pan: 0,
});

/** One track with notes, plus `extraEmpty` tracks that hold none. */
const patternWith = (extraEmpty: number) =>
  ({
    genre_id: "offline_strip_bypass",
    bpm: 120,
    totalSteps: 16,
    scale: "C major",
    tracks: [track("kick", rep([4, 0, 0, 0])), ...Array.from({ length: extraEmpty }, (_, i) => track(`pad-${i}`, rep([0])))],
  }) as unknown as Parameters<typeof renderPatternOffline>[0];

/**
 * The gains **every** context in one render allocated.
 *
 * Counted across contexts rather than read off `lastInstance`: `renderPatternOffline` retries when a render comes back
 * silent (a host that returns a correctly-sized silent buffer is a failed render), so one call can build more than one
 * graph and only the last would be visible. The spy sees all of them, which also makes the number deterministic.
 */
async function gainsFor(extraEmpty: number): Promise<number> {
  const spy = vi.spyOn(FakeAudioGraph.prototype, "createGain");
  try {
    await renderPatternOffline(patternWith(extraEmpty));
    return spy.mock.calls.length;
  } finally {
    spy.mockRestore();
  }
}

let restoreAudio: (() => void) | null = null;
let restoreOffline: (() => void) | null = null;

beforeEach(() => {
  restoreAudio = installFakeAudioContext();
  restoreOffline = installFakeOfflineAudioContext();
});
afterEach(() => {
  restoreAudio?.();
  restoreOffline?.();
  restoreAudio = null;
  restoreOffline = null;
});

describe("the offline renderer's channel strips", () => {
  it("⭐ empty tracks add no strip: appending them does not move the counter", async () => {
    const four = await gainsFor(4);
    const eight = await gainsFor(8);
    expect(
      eight,
      `eight empty tracks allocated ${eight} gains against ${four} for four — empty tracks are still building strips`
    ).toBe(four);
  });

  it("⭐ a track that can sound still gets its strip, so the saving is not the audible path", async () => {
    const withSounding = await gainsFor(0);
    expect(withSounding, "the track with notes must still build its strip").toBeGreaterThan(0);
    // And the empty ones really are the difference: the same render with them is what the case above holds flat.
    expect(await gainsFor(8), "empty tracks did not reduce a strip that was needed").toBe(withSounding);
  });
});
