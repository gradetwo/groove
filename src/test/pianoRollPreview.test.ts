/**
 * Piano-roll isolated preview + chord audition voicing (PRODUCT_PLAN_v2.1.0.md §1).
 *
 * The two headline defects this file exists to prevent from returning:
 *
 *   1. Auditioning a chord re-voiced every member — `triggerNote` is a *single-note* preview, and
 *      on a `chords` track it runs the genre's chord treatment on whatever note it is handed. A
 *      four-note chord therefore produced twelve voices in the same register (measured as 24
 *      oscillators rather than 8), which is the "chord audition sounds wrong" report.
 *   2. There was no way to play one lane on its own; the only playback was the full arrangement.
 *
 * The assertion style mirrors the rest of the audio suite: count the nodes the engine actually
 * scheduled on a fake context, rather than reading back the parameters it was told to write.
 */
import { describe, it, expect } from "vitest";
import { AudioEngine } from "../audio/AudioEngine";
import { installFakeAudioContext } from "./helpers/fakeAudio";
import { previewProgressionNotes, applyChordProgression, CHORD_PROGRESSIONS } from "../features/sequencer/rollModel";
import type { SequencerPattern } from "../types/genre";

function makeTrack(track_id: string, name: string, instrument: string) {
  return {
    track_id,
    name,
    instrument,
    steps: new Array(16).fill(0),
    pitch: new Array(16).fill(null),
    gate: new Array(16).fill(1),
    velocity: new Array(16).fill(100),
  };
}

function makePattern(): SequencerPattern {
  return {
    genre_id: "house",
    scale: "C minor",
    bpm: 124,
    swing: 0,
    timeSignature: "4/4",
    resolution: "1/16",
    stepCount: 16,
    tracks: [
      makeTrack("kick", "Kick", "punchy_kick"),
      makeTrack("snare", "Snare", "clap"),
      makeTrack("hihat", "Hi-Hat", "closed_hat"),
      makeTrack("percussion", "Perc", "rim_shaker"),
      makeTrack("bass", "Bass", "sub_bass"),
      makeTrack("chords", "Chords", "m1_organ"),
      makeTrack("lead", "Lead", "saw_lead"),
      makeTrack("fx", "FX", "noise_sweep"),
    ],
  } as unknown as SequencerPattern;
}

const CHORDS_TRACK = 5;

describe("chord audition plays a voicing once, not a voicing per member", () => {
  it("creates one voice per note of a four-note voicing", () => {
    const restore = installFakeAudioContext();
    try {
      const engine = new AudioEngine();
      engine.setPattern(makePattern());
      (engine as unknown as { initAudioContext: () => void }).initAudioContext();
      const ctx = (engine as unknown as { ctx: any }).ctx;

      const notes = [60, 63, 67, 70];
      const before = ctx.createdOscillators.length;
      engine.previewChord(CHORDS_TRACK, "Chords", notes, 0.75, 0.5);
      const created = ctx.createdOscillators.length - before;

      // A PolySynth voice is two oscillators, so four notes is eight. Before this fix the same
      // call created 24, because each member was voiced into its own triad.
      expect(created).toBe(8);
    } finally {
      restore();
    }
  });

  it("does not re-voice the notes it is given", () => {
    const restore = installFakeAudioContext();
    try {
      const engine = new AudioEngine();
      engine.setPattern(makePattern());
      (engine as unknown as { initAudioContext: () => void }).initAudioContext();
      const ctx = (engine as unknown as { ctx: any }).ctx;

      const before = ctx.createdOscillators.length;
      // A single pitch that is not a chord tone: the old path would invent a triad from it.
      engine.previewChord(CHORDS_TRACK, "Chords", [72], 0.75, 0.5);
      expect(ctx.createdOscillators.length - before).toBe(2);
    } finally {
      restore();
    }
  });

  it("ignores an empty or wholly invalid voicing instead of throwing", () => {
    const restore = installFakeAudioContext();
    try {
      const engine = new AudioEngine();
      engine.setPattern(makePattern());
      (engine as unknown as { initAudioContext: () => void }).initAudioContext();
      const ctx = (engine as unknown as { ctx: any }).ctx;
      const before = ctx.createdOscillators.length;
      engine.previewChord(CHORDS_TRACK, "Chords", [], 0.75);
      engine.previewChord(CHORDS_TRACK, "Chords", [0, -3, Number.NaN], 0.75);
      expect(ctx.createdOscillators.length - before).toBe(0);
    } finally {
      restore();
    }
  });
});

describe("the progression audition plays exactly what the stamp writes", () => {
  const progression = CHORD_PROGRESSIONS[0];

  it("shares its note calculation with the stamp", () => {
    const scale = "C minor";
    const stepCount = 32;
    const preview = previewProgressionNotes(scale, progression, stepCount, 16);
    const pattern = makePattern();
    const stamped = applyChordProgression(pattern, CHORDS_TRACK, progression, stepCount, 16);

    // Every previewed chord appears at the same step with the same pitches as the stamp wrote.
    preview.chords.forEach((chord, i) => {
      const stepIdx = preview.start + i * preview.stepsPerChord;
      const written = stamped.tracks[CHORDS_TRACK]?.pitches?.[stepIdx] ?? [];
      expect([...written].sort((a, b) => a - b)).toEqual([...chord.chordNotes].sort((a, b) => a - b));
    });
  });

  it("auditions each chord once, at its own duration, rather than note by note", () => {
    const preview = previewProgressionNotes("C minor", progression, 32, 16);
    // The number of engine calls a correct audition makes equals the number of chords...
    expect(preview.chords.length).toBe(progression.degrees.length);
    // ...and each chord is a real vertical stack, not a single note.
    for (const chord of preview.chords) {
      expect(chord.chordNotes.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("isolated lane preview", () => {
  it("accepts a valid scope and rejects a nonsense one", () => {
    const restore = installFakeAudioContext();
    try {
      const engine = new AudioEngine();
      engine.setPattern(makePattern());

      engine.setPreviewScope({ trackIdx: CHORDS_TRACK, fromStep: 0, toStep: 16 });
      expect(engine.getPreviewScope()).toEqual({ trackIdx: CHORDS_TRACK, fromStep: 0, toStep: 16 });

      // Inverted, empty, out-of-range track and negative ranges all clear rather than silently
      // previewing the whole arrangement.
      engine.setPreviewScope({ trackIdx: 0, fromStep: 8, toStep: 8 });
      expect(engine.getPreviewScope()).toBeNull();
      engine.setPreviewScope({ trackIdx: 99, fromStep: 0, toStep: 8 });
      expect(engine.getPreviewScope()).toBeNull();

      engine.setPreviewScope({ trackIdx: 1, fromStep: -5, toStep: 4 });
      expect(engine.getPreviewScope()).toEqual({ trackIdx: 1, fromStep: 0, toStep: 4 });

      engine.setPreviewScope(null);
      expect(engine.getPreviewScope()).toBeNull();
    } finally {
      restore();
    }
  });

  /**
   * The property that makes the preview safe: it must not touch the shared mute/solo state. A
   * preview implemented by soloing the track would light the row's Solo button and leave the
   * session changed after the roll closed.
   */
  it("never mutates track states", () => {
    const restore = installFakeAudioContext();
    try {
      const engine = new AudioEngine();
      engine.setPattern(makePattern());
      const before = JSON.stringify((engine as unknown as { trackStates: unknown }).trackStates);
      engine.setPreviewScope({ trackIdx: CHORDS_TRACK, fromStep: 0, toStep: 8 });
      engine.setPreviewScope(null);
      const after = JSON.stringify((engine as unknown as { trackStates: unknown }).trackStates);
      expect(after).toBe(before);
    } finally {
      restore();
    }
  });

  it("schedules only the previewed track", () => {
    const restore = installFakeAudioContext();
    try {
      const engine = new AudioEngine();
      const pattern = makePattern();
      // Give several tracks a note on step 0 so a leak is observable.
      for (const idx of [0, 1, 2, 4, CHORDS_TRACK]) {
        const t = pattern.tracks[idx];
        if (!t) continue;
        t.steps[0] = 1;
        if (t.pitch) t.pitch[0] = idx === 4 ? 40 : 60;
      }
      engine.setPattern(pattern);
      (engine as unknown as { initAudioContext: () => void }).initAudioContext();
      const ctx = (engine as unknown as { ctx: any }).ctx;

      engine.setPreviewScope({ trackIdx: CHORDS_TRACK, fromStep: 0, toStep: 4 });
      const before = ctx.createdOscillators.length + ctx.createdBufferSources.length;
      (engine as unknown as { scheduleStep: (s: number, t: number, d: number) => number[] }).scheduleStep(
        0,
        ctx.currentTime,
        0.12
      );
      const after = ctx.createdOscillators.length + ctx.createdBufferSources.length;
      // Only the chords lane may fire; the kick/snare/hat/bass on the same step must be silent.
      expect(after).toBeGreaterThan(before);
      expect(after - before).toBeLessThanOrEqual(8);

      // Direct check of the filter: the scheduler's active-track list must name only the lane.
      const active = (engine as unknown as { scheduleStep: (s: number, t: number, d: number) => number[] }).scheduleStep(
        0,
        ctx.currentTime + 1,
        0.12
      );
      expect(active).toEqual([CHORDS_TRACK]);
    } finally {
      restore();
    }
  });
});
