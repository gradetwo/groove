/**
 * Piano-roll model (item ⑦).
 *
 * The roll edits the studio's own pattern — `steps` / `pitch` / `gate` / `velocity` on one track —
 * so these ops are the entire contract between the roll and the rest of the app. They are pure, so
 * the behaviour that matters (a note moves where you dropped it, lengths stay in the engine's
 * 0.1–2.0 range, array lengths never change) is tested without a browser.
 *
 * The ported editor from the sibling `synth` project assumes free-floating notes in beats; this
 * model deliberately does not. See `AUDIO_QUALITY_AND_SYNTH_PLAN.md` §5.18 for why.
 */
import { describe, expect, it } from "vitest";
import {
  addNote,
  isRollEditableTrack,
  loopLengthOf,
  moveNote,
  noteEndStep,
  notesFromTrack,
  removeNote,
  resizeNote,
  setNoteVelocity,
  stepBeatsFor,
  transposeTrack,
  visiblePitchRange,
  withTrackNotes,
} from "../features/sequencer/rollModel";
import type { SequencerPattern, SequencerTrack } from "../types/genre";

function makeTrack(over: Partial<SequencerTrack> = {}): SequencerTrack {
  return {
    track_id: "lead",
    name: "Lead",
    instrument: "saw_lead",
    steps: [1, 0, 0, 0, 1, 0, 0, 0],
    ...over,
  } as SequencerTrack;
}

function makePattern(track: SequencerTrack): SequencerPattern {
  return { genre_id: "test", bpm: 120, scale: "C minor", totalSteps: 8, tracks: [track] } as SequencerPattern;
}

describe("roll model · reading a track", () => {
  it("reads notes at the steps that are on, with the engine's pitch fallback", () => {
    const notes = notesFromTrack(makeTrack({ pitch: [64, null, null, null, 67, null, null, null] }));
    expect(notes.map((n) => [n.stepIdx, n.midi])).toEqual([
      [0, 64],
      [4, 67],
    ]);
    // No pitch at all: the engine plays C4, so the roll must show C4 rather than an empty row.
    expect(notesFromTrack(makeTrack()).map((n) => n.midi)).toEqual([60, 60]);
  });

  it("defaults length and velocity the way the engine does", () => {
    const notes = notesFromTrack(makeTrack());
    expect(notes[0].gate).toBe(0.8);
    expect(notes[0].velocity).toBe(100);
  });

  it("only offers pitch editing where pitch is musically meaningful", () => {
    for (const role of ["bass", "chords", "lead"] as const) {
      expect(isRollEditableTrack(makeTrack({ track_id: role }))).toBe(true);
    }
    for (const role of ["kick", "snare", "hihat", "percussion", "fx"] as const) {
      expect(isRollEditableTrack(makeTrack({ track_id: role }))).toBe(false);
    }
    expect(isRollEditableTrack(undefined)).toBe(false);
  });

  it("reports where a note ends, and never a zero-width one", () => {
    expect(noteEndStep({ stepIdx: 2, midi: 60, gate: 1.5, velocity: 100 })).toBeCloseTo(3.5);
    expect(noteEndStep({ stepIdx: 2, midi: 60, gate: 0, velocity: 100 })).toBeCloseTo(2.1);
  });

  it("shows a padded range so a single-note track is still a grid", () => {
    const [lo, hi] = visiblePitchRange([{ stepIdx: 0, midi: 60, gate: 1, velocity: 100 }]);
    expect(lo).toBeLessThan(60);
    expect(hi).toBeGreaterThan(60);
    expect(hi - lo + 1).toBeGreaterThanOrEqual(13);
    // Never leaves the MIDI range, even for the extremes.
    const [loLow] = visiblePitchRange([{ stepIdx: 0, midi: 0, gate: 1, velocity: 100 }]);
    const [, hiHigh] = visiblePitchRange([{ stepIdx: 0, midi: 127, gate: 1, velocity: 100 }]);
    expect(loLow).toBeGreaterThanOrEqual(0);
    expect(hiHigh).toBeLessThanOrEqual(127);
  });
});

describe("roll model · editing", () => {
  it("adds a note without disturbing the other tracks or the array lengths", () => {
    const pattern = makePattern(makeTrack());
    const other = makeTrack({ track_id: "bass", steps: [0, 1, 0, 0, 0, 0, 0, 0] });
    pattern.tracks.push(other);

    const next = addNote(pattern, 0, 2, 72, 8);
    const track = next.tracks[0];
    expect(notesFromTrack(track).map((n) => [n.stepIdx, n.midi])).toEqual([
      [0, 60],
      [2, 72],
      [4, 60],
    ]);
    // `stepCount` derives from tracks[0].steps.length on COMMIT_PATTERN, so lengths are sacred.
    expect(track.steps).toHaveLength(8);
    expect(track.pitch).toHaveLength(8);
    expect(track.gate).toHaveLength(8);
    // The untouched track is the same object, so React memoization still works.
    expect(next.tracks[1]).toBe(other);
    // And the original pattern was not mutated.
    expect(pattern.tracks[0].steps[2]).toBe(0);
  });

  it("replaces rather than stacks when drawing onto an occupied step", () => {
    const pattern = makePattern(makeTrack({ pitch: [60, null, null, null, 67, null, null, null] }));
    const next = addNote(pattern, 0, 0, 55, 8);
    expect(notesFromTrack(next.tracks[0]).filter((n) => n.stepIdx === 0)).toHaveLength(1);
    expect(notesFromTrack(next.tracks[0])[0].midi).toBe(55);
  });

  it("deletes one note and leaves the rest", () => {
    const pattern = makePattern(makeTrack());
    const next = removeNote(pattern, 0, 0, 8);
    expect(notesFromTrack(next.tracks[0]).map((n) => n.stepIdx)).toEqual([4]);
    expect(next.tracks[0].steps[0]).toBe(0);
  });

  it("moves a note in time and pitch, replacing whatever it lands on", () => {
    const pattern = makePattern(makeTrack());
    pattern.tracks[0].pitch = [60, null, null, null, 67, null, null, null];

    const next = moveNote(pattern, 0, 0, 4, 65, 8);
    const notes = notesFromTrack(next.tracks[0]);
    // The note that was at step 4 is gone (monophonic grid) and the moved one carries its length.
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ stepIdx: 4, midi: 65 });

    // Out-of-range destinations are refused rather than clamped onto a neighbour.
    expect(moveNote(pattern, 0, 0, 99, null, 8)).toBe(pattern);
    expect(moveNote(pattern, 0, 0, -1, null, 8)).toBe(pattern);
    // Moving with `midi: null` keeps the pitch (a horizontal drag).
    expect(notesFromTrack(moveNote(pattern, 0, 0, 1, null, 8).tracks[0])[0].midi).toBe(60);
  });

  it("resizes through `gate`, inside the engine's 0.1–2.0 range", () => {
    const pattern = makePattern(makeTrack());
    expect(notesFromTrack(resizeNote(pattern, 0, 0, 1.5, 8).tracks[0])[0].gate).toBe(1.5);
    // The engine clamps to 0.1..2.0, so the roll clamps too rather than writing a value that
    // would silently sound different from what the handle shows.
    expect(notesFromTrack(resizeNote(pattern, 0, 0, 5, 8).tracks[0])[0].gate).toBe(2);
    expect(notesFromTrack(resizeNote(pattern, 0, 0, 0, 8).tracks[0])[0].gate).toBe(0.1);
  });

  it("sets velocity and transposes within the MIDI range", () => {
    const pattern = makePattern(makeTrack({ pitch: [60, null, null, null, 120, null, null, null] }));
    expect(notesFromTrack(setNoteVelocity(pattern, 0, 0, 42, 8).tracks[0])[0].velocity).toBe(42);
    const up = transposeTrack(pattern, 0, 12, 8);
    expect(notesFromTrack(up.tracks[0]).map((n) => n.midi)).toEqual([72, 127]);
  });

  it("keeps a stale pitch array aligned with the step count", () => {
    // A pattern edited elsewhere can carry a shorter pitch array; the roll must pad, not crash.
    const track = makeTrack({ pitch: [62], gate: [1], velocity: [90] });
    const next = withTrackNotes(makePattern(track), 0, notesFromTrack(track), 8);
    expect(next.tracks[0].pitch).toHaveLength(8);
    expect(next.tracks[0].gate).toHaveLength(8);
    expect(next.tracks[0].velocity).toHaveLength(8);
    expect(next.tracks[0].pitch?.[0]).toBe(62);
  });
});

describe("roll model · grid geometry", () => {
  it("marks the polymeter boundary so silent steps are visible", () => {
    expect(loopLengthOf(makeTrack(), 16)).toBe(16);
    expect(loopLengthOf(makeTrack({ trackLength: 12 }), 16)).toBe(12);
    // A stale trackLength longer than the pattern cannot extend the grid.
    expect(loopLengthOf(makeTrack({ trackLength: 32 }), 16)).toBe(16);
  });

  it("knows how long a step is at each resolution", () => {
    expect(stepBeatsFor("1/8")).toBe(0.5);
    expect(stepBeatsFor("1/16")).toBe(0.25);
    expect(stepBeatsFor("1/32")).toBe(0.125);
    expect(stepBeatsFor(undefined)).toBe(0.25);
  });
});
