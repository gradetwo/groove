import { setGs1OfflineCapability } from "../audio/gs1/gs1OfflineCapability";
import { describe, it, expect } from "vitest";
import { foldLoopTail, tailFramesOf } from "../audio/renderTail";

/**
 * P0.6's other half: a loop asset has to join itself.
 *
 * The render tail is deliberate — a file must not stop while the reverb is audible — but a *loop* with that tail
 * appended plays, rings out into silence, and restarts. The fix is the standard one: render loop + tail, then add
 * the tail back over the head modulo the loop length, which is what the reverb would have been doing had the loop
 * never stopped. These cases pin the arithmetic and the property it exists for.
 */
describe("seamless loop · fold the tail over the head", () => {
  it("wraps a tail impulse to the position it belongs in the next pass", () => {
    // A four-frame loop followed by its two-frame tail.
    const source = new Float32Array([0, 0, 0, 0, 0.5, 0.25]);
    const [folded] = foldLoopTail([source], 4, tailFramesOf(source.length, 4));
    // The two tail samples land at the head of the loop, summed with what was there.
    expect(Array.from(folded)).toEqual([0.5, 0.25, 0, 0]);
    expect(folded.length).toBe(4);
  });

  it("sums the tail into the head rather than replacing it", () => {
    const source = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.05, 0.15]);
    const [folded] = foldLoopTail([source], 4, 2);
    expect(folded[0]).toBeCloseTo(0.15, 6);
    expect(folded[1]).toBeCloseTo(0.35, 6);
    expect(folded[2]).toBeCloseTo(0.3, 6);
    expect(folded[3]).toBeCloseTo(0.4, 6);
  });

  it("keeps energy (nothing is dropped) and every channel stays the loop's length", () => {
    const left = new Float32Array(16).map((_, i) => (i === 13 ? 1 : 0));
    const right = new Float32Array(16).map((_, i) => (i === 14 ? -0.5 : 0));
    const folded = foldLoopTail([left, right], 12, 4);
    expect(folded.map((c) => c.length)).toEqual([12, 12]);
    expect(folded[0][1]).toBe(1);
    expect(folded[1][2]).toBe(-0.5);
    const sum = (c: Float32Array) => Array.from(c).reduce((s, v) => s + Math.abs(v), 0);
    expect(sum(folded[0])).toBeCloseTo(1, 6);
    expect(sum(folded[1])).toBeCloseTo(0.5, 6);
  });

  it("puts the previous pass's tail into the loop, and leaves the rest of the loop alone", () => {
    /**
     * The semantics, stated exactly — and worth stating, because two plausible-sounding versions of this assertion
     * are wrong and the first drafts of this case made both. The fold does **not** make a doubled loop equal the
     * original render (every pass carries its own loop *and* the tail before it), and the two passes are identical
     * to each other (it is a loop), so their difference is zero everywhere. What is true, and is the whole point:
     * the tail lands **inside** the loop at the offset it belongs to, summed with what was already there.
     */
    const loopFrames = 64;
    const tailFrames = 32;
    const source = new Float32Array(loopFrames + tailFrames);
    for (let i = 0; i < loopFrames; i += 1) source[i] = Math.sin((i / loopFrames) * Math.PI * 2) * 0.5;
    for (let i = 0; i < tailFrames; i += 1) source[loopFrames + i] = 0.5 * Math.pow(0.9, i);

    const [folded] = foldLoopTail([source], loopFrames, tailFrames);
    for (let i = 0; i < tailFrames; i += 1) {
      expect(folded[i], `wrapped sample ${i}`).toBeCloseTo(source[i] + source[loopFrames + i], 5);
    }
    for (let i = tailFrames; i < loopFrames; i += 1) {
      expect(folded[i], `untouched sample ${i}`).toBeCloseTo(source[i], 6);
    }
    // A plain truncation would have thrown the tail away; this keeps it.
    const energy = (data: Float32Array) => Array.from(data).reduce((sum, v) => sum + v * v, 0);
    expect(energy(folded)).toBeGreaterThan(energy(source.subarray(0, loopFrames)));
  });

  it("refuses to read past what was rendered, and tolerates a zero-length loop", () => {
    const source = new Float32Array([1, 2, 3]);
    const [folded] = foldLoopTail([source], 3, 99);
    expect(Array.from(folded)).toEqual([1, 2, 3]);
    expect(foldLoopTail([source], 0, 3)[0].length).toBe(0);
    expect(tailFramesOf(3, 10)).toBe(0);
    expect(tailFramesOf(10, 4)).toBe(6);
  });
});

/**
 * …and the renderer's own switch. Asserted structurally rather than by listening: a loop render with the option on
 * is exactly the loop's length, and with it off it is longer by the tail the genre's FX asked for. The tail's
 * *content* is the unit cases' business above; what matters here is that the option reaches the buffer a caller gets.
 */
import { installFakeOfflineAudioContext } from "./helpers/fakeAudio";

describe("seamless loop · the renderer's option", () => {
  const pattern = {
    genre_id: "chicago-house",
    bpm: 124,
    swing: 0,
    scale: "C minor",
    totalSteps: 16,
    tracks: [
      {
        name: "Kick",
        track_id: "kick",
        instrument: "kick_909",
        steps: [1, ...Array(15).fill(0)],
        velocity: [110, ...Array(15).fill(0)],
        probability: Array(16).fill(100),
      },
    ],
  } as never;

  it("returns the loop itself with the option on, and the loop plus its tail with it off", async () => {
    const { renderPatternOffline } = await import("../audio/WavExporter");
    const restore = installFakeOfflineAudioContext();
    try {
      const plain = await renderPatternOffline(pattern, { bars: 1, sampleRate: 44100 });
      const loop = await renderPatternOffline(pattern, { bars: 1, sampleRate: 44100, seamlessLoop: true });
      const stepDur = 60 / 124 / 4;
      const expectedLoopFrames = Math.round(16 * stepDur * 44100);
      expect(loop.length).toBe(expectedLoopFrames);
      expect(plain.length).toBeGreaterThan(loop.length);
      // The tail the genre's FX ask for, at the render's own rate — the fold removes exactly that much.
      expect(plain.length - loop.length).toBeGreaterThan(0.5 * 44100 * 0.5);
    } finally {
      restore();
    }
  });
});


/**
 * The offline GS-1 capability probe renders a throwaway context of its own; these cases inspect the *app's* render
 * (hosts, strips, buffers) and would otherwise find the probe's instead. Declared satisfied at module scope here; the
 * probe has its own file, and `probe_engine_parity.mjs` is its acceptance test.
 */
setGs1OfflineCapability("usable");
