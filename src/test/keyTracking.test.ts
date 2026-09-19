/**
 * Key tracking: the authored cutoff is a C4 cutoff, not an absolute one.
 *
 * The defect: the low-pass corner was an absolute constant, so a C2 bass note and a C6 lead note
 * both opened to the preset's `filterCutoff`. Relative to the note's own fundamental the low note
 * was wide open (thin and bright) and the high note nearly closed (dull) — the opposite of how a
 * real resonant body behaves, and therefore a systematic reason every preset drifted from the
 * records its genre comes from.
 *
 * These assertions read the *scheduled* cutoff, which is what the oscillator actually runs
 * through; the audible result is covered by `measure_genre_timbre.mjs`, whose baseline is
 * re-recorded whenever a change like this lands (see `PRODUCT_PLAN_v2.1.0.md` §3.5).
 */
import { describe, it, expect } from "vitest";
import {
  playPolySynthNote,
  DEFAULT_SYNTH_PRESETS,
  DEFAULT_KEY_TRACK_DEPTH,
  KEY_TRACK_REFERENCE_MIDI,
  midiToFreq,
} from "../audio/PolySynth";
import { FakeOfflineAudioContext, installFakeOfflineAudioContext } from "./helpers/fakeAudio";

/**
 * The scheduled cutoff for one note, read from a real fake context.
 *
 * This used to be a hand-rolled mock with one stub per node type. That kind of mock drifts against
 * the voice builder: when the stereo unison stage added a `ChannelSplitter`, the sibling velocity
 * suite broke with `ctx.createChannelSplitter is not a function` — a failure that says nothing
 * about velocity. The shared double implements the whole graph API and throws on the same illegal
 * ramp targets a browser does, so a new node type cannot silently stop being exercised here.
 */
const cutoffFor = (preset: (typeof DEFAULT_SYNTH_PRESETS)[string], midi: number): number => {
  const restore = installFakeOfflineAudioContext();
  try {
    const ctx = new FakeOfflineAudioContext(1, 4096, 44100);
    playPolySynthNote(
      ctx as unknown as BaseAudioContext,
      ctx.createGain() as unknown as AudioNode,
      midi,
      0,
      0.5,
      0.8,
      preset
    );
    const main = ctx.createdFilters.find((f) => f.type === "lowpass");
    if (!main) throw new Error("no low-pass filter was created");
    // The first scheduled cutoff is the reference value the voice holds.
    return main.frequency.events[0]?.value ?? main.frequency.value;
  } finally {
    restore();
  }
};

const preset = DEFAULT_SYNTH_PRESETS.warmPad;

describe("key tracking", () => {
  it("leaves the reference note exactly at the authored cutoff", () => {
    // C4 is the anchor: a preset that says 2.6 kHz must mean 2.6 kHz there, or every authored
    // number in the library changes meaning.
    expect(cutoffFor(preset, KEY_TRACK_REFERENCE_MIDI)).toBeCloseTo(preset.filterCutoff, 3);
  });

  it("opens the cutoff for notes above the reference and closes it below", () => {
    const low = cutoffFor(preset, KEY_TRACK_REFERENCE_MIDI - 12);
    const mid = cutoffFor(preset, KEY_TRACK_REFERENCE_MIDI);
    const high = cutoffFor(preset, KEY_TRACK_REFERENCE_MIDI + 12);
    expect(low).toBeLessThan(mid);
    expect(high).toBeGreaterThan(mid);
  });

  it("applies the stated depth: an octave of pitch moves the cutoff by 2^depth", () => {
    const depth = DEFAULT_KEY_TRACK_DEPTH;
    const mid = cutoffFor(preset, KEY_TRACK_REFERENCE_MIDI);
    const high = cutoffFor(preset, KEY_TRACK_REFERENCE_MIDI + 12);
    // Half tracking: one octave up multiplies the cutoff by 2^0.5 ≈ 1.414, not by 2.
    const expected = preset.filterCutoff * Math.pow(2, depth);
    expect(high).toBeCloseTo(expected, 1);
    expect(mid).toBeCloseTo(preset.filterCutoff, 3);
  });

  it("can be disabled per preset for a deliberately fixed corner", () => {
    // A preset whose character *is* the fixed corner (drum-like blips, lo-fi stabs) must be able
    // to opt out; otherwise the fix would remove a sound the library intentionally uses.
    const fixed = { ...preset, keyTrackFilter: 0 };
    expect(cutoffFor(fixed, KEY_TRACK_REFERENCE_MIDI - 24)).toBeCloseTo(preset.filterCutoff, 3);
    expect(cutoffFor(fixed, KEY_TRACK_REFERENCE_MIDI + 24)).toBeCloseTo(preset.filterCutoff, 3);
  });

  it("takes the ratio from the oscillator frequency, so role-relative pitches track too", () => {
    // The engine passes some pitches as absolute notes and some as role-relative offsets; only the
    // resulting frequency is common ground, which is why the implementation derives the ratio from
    // it rather than from the MIDI argument.
    const ratioAt = (midi: number) => midiToFreq(midi) / midiToFreq(KEY_TRACK_REFERENCE_MIDI);
    expect(ratioAt(KEY_TRACK_REFERENCE_MIDI + 24)).toBeCloseTo(4, 6);
    const high = cutoffFor(preset, KEY_TRACK_REFERENCE_MIDI + 24);
    expect(high).toBeCloseTo(preset.filterCutoff * Math.pow(4, DEFAULT_KEY_TRACK_DEPTH), 1);
  });

  it("never produces a non-positive or non-finite cutoff at the extremes", () => {
    for (const midi of [0, 12, 24, 36, 60, 96, 120, 127]) {
      const cutoff = cutoffFor(preset, midi);
      expect(Number.isFinite(cutoff), `midi ${midi}`).toBe(true);
      expect(cutoff, `midi ${midi}`).toBeGreaterThan(0);
    }
  });
});
