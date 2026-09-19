/**
 * Stereo unison width (appendix E.5 item 1: "supersaw 目前是两把锯齿，真实超级锯是 7 路失谐").
 *
 * The measured gap was that a "supersaw" was two sawtooth oscillators 26 cents apart in **mono**.
 * Two detuned saws in one channel do not read as a supersaw: they beat against each other at a
 * single, slowly-moving rate and the result is one slightly-chorused lead. The character of the
 * sound — a trance/EDM wall — comes from the detuned members occupying *different places in the
 * stereo field*, which is the thing that was missing outright.
 *
 * Two halves are pinned here:
 *
 *  - the arithmetic (`stereoSpreadGains`, `unisonOuterDetuneCents`), which is pure and therefore
 *    testable to the last decimal;
 *  - the **no-op guarantee**: every preset that does not opt in must allocate exactly the nodes it
 *    always did. That is what keeps the committed timbre and loudness baselines meaningful for the
 *    158 presets that were not re-voiced, so it is asserted by counting oscillators rather than by
 *    trusting the `if`.
 */
import { describe, it, expect } from "vitest";
import {
  DEFAULT_SYNTH_PRESETS,
  MAX_STEREO_SPREAD,
  UNISON_OUTER_DETUNE_MULTIPLE,
  playPolySynthNote,
  stereoSpreadGains,
  unisonOuterDetuneCents,
} from "../audio/PolySynth";
import { FakeOfflineAudioContext, installFakeOfflineAudioContext } from "./helpers/fakeAudio";

/** Play one note through the fake context and hand back the graph it built. */
function voice(preset: (typeof DEFAULT_SYNTH_PRESETS)[string]) {
  const restore = installFakeOfflineAudioContext();
  try {
    const ctx = new FakeOfflineAudioContext(1, 4096, 44100);
    playPolySynthNote(
      ctx as unknown as BaseAudioContext,
      ctx.createGain() as unknown as AudioNode,
      60,
      1,
      0.4,
      0.9,
      preset
    );
    return ctx;
  } finally {
    restore();
  }
}

const values = (events: { value: number }[]) => events.map((e) => e.value);

describe("stereoSpreadGains", () => {
  it("holds constant power at every width", () => {
    for (const spread of [0, 0.25, 0.5, 0.65, 1]) {
      const { left, right } = stereoSpreadGains(spread);
      expect(left * left + right * right, `spread ${spread}`).toBeCloseTo(1, 6);
    }
  });

  it("is the constant-power centre at 0, not unity on one side", () => {
    const { left, right } = stereoSpreadGains(0);
    expect(left).toBeCloseTo(Math.SQRT1_2, 6);
    expect(right).toBeCloseTo(Math.SQRT1_2, 6);
    // A linear pan would give {1, 0} here, which would make a centred pair 3 dB louder than the
    // mono voice it replaces. (`left === right` is exactly the property; `toBe` on the two floats
    // is not, because `Math.cos` and `Math.sin` of the same angle differ in the last bit.)
    expect(Object.is(left, right)).toBe(false);
    expect(Math.abs(left - right)).toBeLessThan(1e-15);
  });

  it("reaches hard left / hard right at 1", () => {
    const { left, right } = stereoSpreadGains(1);
    expect(left).toBeCloseTo(0, 6);
    expect(right).toBeCloseTo(1, 6);
  });

  it("increases separation monotonically", () => {
    let previous = -Infinity;
    for (const spread of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
      const { left, right } = stereoSpreadGains(spread);
      const separation = right - left;
      expect(separation, `separation at ${spread}`).toBeGreaterThan(previous);
      previous = separation;
    }
  });

  it("clamps out-of-range and non-finite widths instead of emitting NaN", () => {
    for (const bad of [-1, -0.5, 1.5, 99, Number.NaN, Number.POSITIVE_INFINITY]) {
      const { left, right } = stereoSpreadGains(bad);
      expect(Number.isFinite(left), `left for ${bad}`).toBe(true);
      expect(Number.isFinite(right), `right for ${bad}`).toBe(true);
      expect(left).toBeGreaterThanOrEqual(0);
      expect(left).toBeLessThanOrEqual(1);
    }
    // Above the maximum clamps down to hard-panned, below zero clamps to centre.
    expect(stereoSpreadGains(99).right).toBeCloseTo(1, 6);
    expect(stereoSpreadGains(-1).left).toBeCloseTo(Math.SQRT1_2, 6);
  });
});

describe("unisonOuterDetuneCents", () => {
  it("places the outer pair wider than the preset's own detune", () => {
    expect(unisonOuterDetuneCents(26)).toBeCloseTo(26 * UNISON_OUTER_DETUNE_MULTIPLE, 6);
    // The point is that it is *not* a repeat: identical offsets would produce one beat, not a shimmer.
    expect(unisonOuterDetuneCents(26)).not.toBe(26);
  });

  it("scales a preset that has no detune to no detune", () => {
    expect(unisonOuterDetuneCents(0)).toBe(0);
  });

  it("is total for a broken value", () => {
    expect(unisonOuterDetuneCents(Number.NaN)).toBe(0);
  });
});

describe("the supersaw is widened and un-opted-in presets are untouched", () => {
  it("declares a spread for supersaw", () => {
    expect(DEFAULT_SYNTH_PRESETS.supersaw.stereoSpread).toBeGreaterThan(0);
    expect(DEFAULT_SYNTH_PRESETS.supersaw.stereoSpread).toBeLessThanOrEqual(MAX_STEREO_SPREAD);
  });

  it("never pairs a spread with no detune, which would spread nothing", () => {
    /**
     * `unisonOuterDetuneCents` scales the preset's own offset, so a preset that asks for width
     * while declaring zero detune would build four *identical* oscillators panned apart: no
     * beating, no widening, +3 dB and twice the nodes. That is a data mistake rather than a code
     * one, so it is caught here, over the whole library, at the point a preset is added.
     */
    for (const key of Object.keys(DEFAULT_SYNTH_PRESETS)) {
      const preset = DEFAULT_SYNTH_PRESETS[key];
      if (!preset.stereoSpread) continue;
      expect(preset.osc2DetuneCents, `${key} asks for width with no detune`).not.toBe(0);
      // And the outer pair must genuinely sit outside the inner one, or the stack is one flat band.
      expect(Math.abs(unisonOuterDetuneCents(preset.osc2DetuneCents))).toBeGreaterThan(
        Math.abs(preset.osc2DetuneCents)
      );
    }
  });

  it("allocates four oscillators for supersaw where a mono preset gets two", () => {
    const widened = voice(DEFAULT_SYNTH_PRESETS.supersaw);
    const mono = voice(DEFAULT_SYNTH_PRESETS.analogLead);
    expect(mono.createdOscillators.length).toBe(2);
    expect(widened.createdOscillators.length).toBe(4);
  });

  it("creates no stereo nodes at all for a preset without stereoSpread", () => {
    /**
     * The no-op guarantee, stated as a node count rather than as an `if`. If a future change made
     * the stereo stage unconditional, 158 presets would silently change timbre and both committed
     * baselines would become meaningless — this is the assertion that catches that.
     */
    const plain = Object.keys(DEFAULT_SYNTH_PRESETS).filter(
      (key) => !DEFAULT_SYNTH_PRESETS[key].stereoSpread
    );
    // Every preset except the one that opts in. Asserted as "all but one" rather than a magic
    // number, so adding a preset does not silently narrow what this test covers.
    expect(plain.length).toBe(Object.keys(DEFAULT_SYNTH_PRESETS).length - 1);
    expect(plain.length).toBeGreaterThan(40);
    for (const key of plain) {
      const ctx = voice(DEFAULT_SYNTH_PRESETS[key]);
      expect(ctx.createdChannelSplitters.length, key).toBe(0);
      expect(ctx.createdChannelMergers.length, key).toBe(0);
    }
  });

  it("creates the splitter and merger for the widened preset", () => {
    const ctx = voice(DEFAULT_SYNTH_PRESETS.supersaw);
    expect(ctx.createdChannelSplitters.length).toBe(1);
    expect(ctx.createdChannelMergers.length).toBe(1);
    // A two-output splitter and a two-input merger: the graph needs both channels independently.
    expect(ctx.createdChannelSplitters[0].numberOfOutputs).toBe(2);
    expect(ctx.createdChannelMergers[0].numberOfInputs).toBe(2);
  });

  it("applies the equal-power pair for the declared width to real gain nodes", () => {
    const ctx = voice(DEFAULT_SYNTH_PRESETS.supersaw);
    const { left, right } = stereoSpreadGains(DEFAULT_SYNTH_PRESETS.supersaw.stereoSpread!);
    const scheduled = ctx.createdGains.flatMap((g) => values(g.gain.events));
    const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
    // Both sides must actually be scheduled, or the pair is panned one way only.
    expect(scheduled.some((v) => near(v, left))).toBe(true);
    expect(scheduled.some((v) => near(v, right))).toBe(true);
    expect(near(left, right)).toBe(false);
  });

  it("keeps the outer pair's mix at half the preset's, so widening does not raise the level", () => {
    const preset = DEFAULT_SYNTH_PRESETS.supersaw;
    const ctx = voice(preset);
    const scheduled = ctx.createdGains.flatMap((g) => values(g.gain.events));
    expect(scheduled).toContain(preset.osc2Mix * 0.5);
  });

  it("detunes the outer oscillators symmetrically around zero", () => {
    const preset = DEFAULT_SYNTH_PRESETS.supersaw;
    const ctx = voice(preset);
    const detunes = ctx.createdOscillators
      .flatMap((o) => values(o.detune.events))
      .filter((v) => v !== 0);
    const expected = unisonOuterDetuneCents(preset.osc2DetuneCents);
    expect(detunes).toContain(preset.osc2DetuneCents);
    expect(detunes).toContain(expected);
    expect(detunes).toContain(-expected);
  });

  it("starts and stops every one of the four oscillators, so nothing is left running", () => {
    const ctx = voice(DEFAULT_SYNTH_PRESETS.supersaw);
    expect(ctx.createdOscillators.length).toBe(4);
    // The fake records `startedAt` / `stoppedAt` rather than using `vi.fn`, so presence of a
    // recorded time is the assertion — a voice that starts an oscillator and never stops it would
    // hold a slot in the engine's voice registry forever.
    for (const osc of ctx.createdOscillators) {
      expect(osc.started).toBe(true);
      expect(osc.startedAt.length).toBeGreaterThan(0);
      expect(osc.stoppedAt.length).toBeGreaterThan(0);
      expect(osc.stoppedAt[0]).toBeGreaterThan(osc.startedAt[0]);
    }
  });
});
