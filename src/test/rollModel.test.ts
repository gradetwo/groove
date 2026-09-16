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
  removeNoteAt,
  selectedSteps,
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

  it("adds to the chord when drawing onto an occupied step", () => {
    // This is how a chord is built in the roll: draw the root, then draw the third and fifth onto
    // the same step. It used to *replace*, which made a chord impossible to enter by hand.
    const pattern = makePattern(makeTrack({ pitch: [60, null, null, null, 67, null, null, null] }));
    const withThird = addNote(pattern, 0, 0, 64, 8);
    const withFifth = addNote(withThird, 0, 0, 67, 8);
    const chord = notesFromTrack(withFifth.tracks[0]).filter((n) => n.stepIdx === 0);
    expect(chord.map((n) => n.midi).sort((a, b) => a - b)).toEqual([60, 64, 67]);
    // The step's root stays the lowest note and the stack is written for the renderers.
    expect(withFifth.tracks[0].pitch?.[0]).toBe(60);
    expect(withFifth.tracks[0].pitches?.[0]).toEqual([60, 64, 67]);
  });

  it("ignores a second draw of the same pitch (no duplicate notes)", () => {
    const pattern = makePattern(makeTrack({ pitch: [60, null, null, null, 67, null, null, null] }));
    expect(addNote(pattern, 0, 0, 60, 8)).toBe(pattern);
  });

  it("keeps a note added to a sounding step's length and velocity (they belong to the step)", () => {
    const pattern = makePattern(makeTrack({ steps: [1, 0, 0, 0], pitch: [60, null, null, null], gate: [1.5, 0.8, 0.8, 0.8], velocity: [70, 100, 100, 100] }));
    const stacked = addNote(pattern, 0, 0, 64, 4);
    expect(stacked.tracks[0].gate?.[0]).toBeCloseTo(1.5, 6);
    expect(stacked.tracks[0].velocity?.[0]).toBe(70);
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

/**
 * Piano-roll tools (v2.0.22): multi-note operations, and the places where Logic's feature set has
 * to be *reinterpreted* for a step grid rather than copied.
 *
 * The reinterpretations are the interesting part and are asserted as such: starts are already grid
 * steps, so there is no "quantise start" to offer — quantise acts on **lengths**, and legato fills
 * the gap to the next note. A monophonic grid has nowhere to put an overlapping note, so scissors
 * needs a free step and says so when it cannot cut.
 */
import {
  copyNotes,
  deleteNotes,
  legatoNotes,
  moveNotes,
  notesInRect,
  normalizeSelection,
  quantizeLengths,
  scaleHighlightFor,
  scaleNotesVelocity,
  setNotesVelocity,
  snapValue,
  splitNote,
} from "../features/sequencer/rollModel";

const rollPattern = () =>
  makePattern(
    makeTrack({
      steps: [1, 0, 0, 1, 0, 0, 1, 0],
      pitch: [60, null, null, 64, null, null, 67, null],
      gate: [0.5, 0.8, 0.8, 1.5, 0.8, 0.8, 0.8, 0.8],
      velocity: [100, 100, 100, 60, 100, 100, 90, 100],
    })
  );

describe("roll tools · selection and marquee", () => {
  it("normalises a selection (deduplicated, sorted by step then pitch)", () => {
    expect(normalizeSelection(["4:60", "1:64", "4:60", "0:67", "1:62"])).toEqual(["0:67", "1:62", "1:64", "4:60"]);
    // Garbage ids are dropped rather than reaching the ops.
    expect(normalizeSelection(["nope", "2:60"])).toEqual(["2:60"]);
  });

  it("selects the notes inside a marquee rectangle, in either drag direction", () => {
    const notes = notesFromTrack(rollPattern().tracks[0]);
    expect(notesInRect(notes, { stepFrom: 0, stepTo: 4, pitchFrom: 58, pitchTo: 66 })).toEqual(["0:60", "3:64"]);
    // Dragging up-left must select the same box.
    expect(notesInRect(notes, { stepFrom: 4, stepTo: 0, pitchFrom: 66, pitchTo: 58 })).toEqual(["0:60", "3:64"]);
    expect(notesInRect(notes, { stepFrom: 6, stepTo: 6, pitchFrom: 67, pitchTo: 67 })).toEqual(["6:67"]);
    expect(notesInRect(notes, { stepFrom: 1, stepTo: 2, pitchFrom: 0, pitchTo: 127 })).toEqual([]);
  });
});

describe("roll tools · moving and copying a selection", () => {
  it("moves every selected note together, and replaces what it lands on", () => {
    const pattern = rollPattern();
    const moved = moveNotes(pattern, 0, ["0:60", "3:64"], 1, 2, 8);
    const notes = notesFromTrack(moved.pattern.tracks[0]);
    expect(moved.selection).toEqual(["1:62", "4:66"]);
    expect(notes.map((n) => [n.stepIdx, n.midi]).sort((a, b) => a[0] - b[0])).toEqual([
      [1, 62],
      [4, 66],
      [6, 67],
    ]);
    // Length and velocity travel with the note.
    expect(notes.find((n) => n.stepIdx === 4)?.gate).toBe(1.5);
  });

  it("refuses a move that would push any note out of the pattern", () => {
    const pattern = rollPattern();
    expect(moveNotes(pattern, 0, ["6:67"], 4, 0, 8).pattern).toBe(pattern);
    expect(moveNotes(pattern, 0, ["0:60"], -1, 0, 8).pattern).toBe(pattern);
  });

  it("copies a selection without disturbing the originals", () => {
    const pattern = rollPattern();
    const copied = copyNotes(pattern, 0, ["0:60", "3:64"], 2, 8);
    expect(copied.selection).toEqual(["2:60", "5:64"]);
    const notes = notesFromTrack(copied.pattern.tracks[0]);
    // Originals still there (0 and 3) plus copies (2 and 5) — 2 and 5 were empty.
    expect(notes.map((n) => n.stepIdx).sort((a, b) => a - b)).toEqual([0, 2, 3, 5, 6]);
    // The original pattern is untouched.
    expect(notesFromTrack(pattern.tracks[0]).map((n) => n.stepIdx)).toEqual([0, 3, 6]);
  });

  it("deletes only the selection", () => {
    const remaining = notesFromTrack(deleteNotes(rollPattern(), 0, ["0:60", "6:67"], 8).tracks[0]);
    expect(remaining.map((n) => n.stepIdx)).toEqual([3]);
  });
});

describe("roll tools · velocity", () => {
  it("sets an absolute velocity on the selection (what a lane click does)", () => {
    const next = notesFromTrack(setNotesVelocity(rollPattern(), 0, ["0:60", "6:67"], 42, 8).tracks[0]);
    expect(next.find((n) => n.stepIdx === 0)?.velocity).toBe(42);
    expect(next.find((n) => n.stepIdx === 6)?.velocity).toBe(42);
    expect(next.find((n) => n.stepIdx === 3)?.velocity).toBe(60);
  });

  it("scales velocities by a delta (what a lane drag does), clamped to 1..127", () => {
    const louder = notesFromTrack(scaleNotesVelocity(rollPattern(), 0, ["0:60", "3:64"], 40, 8).tracks[0]);
    expect(louder.find((n) => n.stepIdx === 0)?.velocity).toBe(127); // 100 + 40 clamped
    expect(louder.find((n) => n.stepIdx === 3)?.velocity).toBe(100); // 60 + 40
    const quieter = notesFromTrack(scaleNotesVelocity(rollPattern(), 0, ["0:60"], -500, 8).tracks[0]);
    expect(quieter.find((n) => n.stepIdx === 0)?.velocity).toBe(1);
  });
});

describe("roll tools · quantise and legato, reinterpreted for a step grid", () => {
  it("snaps lengths (not starts — starts are already steps)", () => {
    expect(snapValue(0.73, "1/16")).toBeCloseTo(0.75, 6);
    expect(snapValue(0.73, "1/4")).toBeCloseTo(1, 6);
    expect(snapValue(0.73, "off")).toBeCloseTo(0.73, 6);

    // At a 1/4 grid the only grid points are whole steps, so 1.5 snaps to 2 (the nearest one).
    const quantised = notesFromTrack(quantizeLengths(rollPattern(), 0, ["3:64"], "1/4", 8).tracks[0]);
    expect(quantised.find((n) => n.stepIdx === 3)?.gate).toBeCloseTo(2, 6);
    // …and at 1/16 it snaps to 1.5 exactly, which is already on the grid.
    const fine = notesFromTrack(quantizeLengths(rollPattern(), 0, ["3:64"], "1/16", 8).tracks[0]);
    expect(fine.find((n) => n.stepIdx === 3)?.gate).toBeCloseTo(1.5, 6);
  });

  it("keeps the requested length inside the engine's 0.1–2 step clamp", () => {
    const pattern = makePattern(makeTrack({ steps: [1, 0], gate: [1.9, 0.8] }));
    const quantised = notesFromTrack(quantizeLengths(pattern, 0, ["0:60"], "off", 2).tracks[0]);
    expect(quantised[0].gate).toBeLessThanOrEqual(2);
    expect(quantised[0].gate).toBeGreaterThanOrEqual(0.1);
  });

  it("fills the gap to the next note, and the loop end for the last one", () => {
    const legato = notesFromTrack(legatoNotes(rollPattern(), 0, ["0:60", "6:67"], 8, 8).tracks[0]);
    // Step 0 → next note is at 3, so three steps… clamped to the engine's 2-step maximum.
    expect(legato.find((n) => n.stepIdx === 0)?.gate).toBe(2);
    // Step 6 → no later note, so it fills to the loop end (8 − 6 = 2).
    expect(legato.find((n) => n.stepIdx === 6)?.gate).toBe(2);
    // Unselected notes are untouched.
    expect(legato.find((n) => n.stepIdx === 3)?.gate).toBe(1.5);
  });

  it("legato sets the length to the gap, which can shorten a note as well as lengthen it", () => {
    // That is what legato means (the note ends where the next begins); the clamp only caps the
    // *upper* end, so a two-step note followed by a note one step later becomes one step.
    const pattern = makePattern(makeTrack({ steps: [1, 1], gate: [2, 0.8] }));
    const legato = notesFromTrack(legatoNotes(pattern, 0, ["0:60"], 2, 2).tracks[0]);
    expect(legato.find((n) => n.stepIdx === 0)?.gate).toBe(1);
  });
});

describe("roll tools · scissors", () => {
  it("splits a note into two halves when the next step is free", () => {
    const pattern = makePattern(makeTrack({ steps: [1, 0], gate: [1.4, 0.8] }));
    const { pattern: split, split: didSplit } = splitNote(pattern, 0, 0, 2);
    expect(didSplit).toBe(true);
    const notes = notesFromTrack(split.tracks[0]);
    expect(notes.map((n) => n.stepIdx)).toEqual([0, 1]);
    for (const note of notes) expect(note.gate).toBeCloseTo(0.7, 6);
  });

  it("says no rather than pretending, when there is nowhere to put the second half", () => {
    const occupied = makePattern(makeTrack({ steps: [1, 1], gate: [1.4, 0.8] }));
    expect(splitNote(occupied, 0, 0, 2).split).toBe(false);
    const atEnd = makePattern(makeTrack({ steps: [0, 1], gate: [0.8, 1.4] }));
    expect(splitNote(atEnd, 0, 1, 2).split).toBe(false);
    const empty = makePattern(makeTrack({ steps: [0, 0] }));
    expect(splitNote(empty, 0, 0, 2).split).toBe(false);
  });
});

describe("roll visuals · scale highlighting", () => {
  it("knows a major scale's pitch classes", () => {
    const c = scaleHighlightFor("C major");
    expect(c.rootPc).toBe(0);
    expect([...c.pcs].sort((a, b) => a - b)).toEqual([0, 2, 4, 5, 7, 9, 11]);
  });

  it("handles minors, flats and sharps", () => {
    expect([...scaleHighlightFor("A minor").pcs].sort((a, b) => a - b)).toEqual([0, 2, 4, 5, 7, 9, 11]);
    expect(scaleHighlightFor("A minor").rootPc).toBe(9);
    expect(scaleHighlightFor("Eb major").rootPc).toBe(3);
    expect(scaleHighlightFor("F# minor").rootPc).toBe(6);
    // Unknown text falls back to C major rather than throwing.
    expect(scaleHighlightFor(undefined).rootPc).toBe(0);
  });
});

/**
 * Chords in the pattern (the "the chords track shows one note in the roll" fix).
 *
 * A note is identified by **(step, midi)**, so a step can hold a chord. What matters for the rest
 * of the app is that the model keeps all three of the grid's views of that in step: `steps` (does
 * it sound), `pitch` (the **root**, which is what every older reader means by "the note") and
 * `pitches` (the whole stack, which is what the renderers play and the roll draws).
 */
describe("roll model · chords are real notes", () => {
  const chordPattern = () =>
    makePattern(
      makeTrack({
        steps: [1, 0, 0, 0],
        pitch: [60, null, null, null],
        pitches: [[60, 64, 67], null, null, null],
      })
    );

  it("reads every tone of a stored stack, not just the root", () => {
    const notes = notesFromTrack(chordPattern().tracks[0]);
    expect(notes.map((n) => n.midi)).toEqual([60, 64, 67]);
    expect(notes.every((n) => n.stepIdx === 0)).toBe(true);
  });

  it("shares the step's length and velocity across the chord (that is how the model stores them)", () => {
    const pattern = makePattern(
      makeTrack({ steps: [1, 0], pitch: [60, null], pitches: [[60, 64, 67], null], gate: [1.5, 0.8], velocity: [88, 100] })
    );
    for (const note of notesFromTrack(pattern.tracks[0])) {
      expect(note.gate).toBeCloseTo(1.5, 6);
      expect(note.velocity).toBe(88);
    }
  });

  it("writes the stack back with the root as the lowest note", () => {
    const written = withTrackNotes(makePattern(makeTrack()), 0, [
      { stepIdx: 2, midi: 67, gate: 0.8, velocity: 100 },
      { stepIdx: 2, midi: 60, gate: 0.8, velocity: 100 },
      { stepIdx: 2, midi: 64, gate: 0.8, velocity: 100 },
    ], 8);
    expect(written.tracks[0].pitches?.[2]).toEqual([60, 64, 67]);
    expect(written.tracks[0].pitch?.[2]).toBe(60);
    expect(written.tracks[0].steps[2]).toBe(1);
  });

  it("de-duplicates a stack that names the same pitch twice", () => {
    const written = withTrackNotes(makePattern(makeTrack()), 0, [
      { stepIdx: 0, midi: 60, gate: 0.8, velocity: 100 },
      { stepIdx: 0, midi: 60, gate: 0.8, velocity: 100 },
    ], 8);
    expect(written.tracks[0].pitches?.[0]).toEqual([60]);
  });

  it("removes one chord tone without touching the others", () => {
    const third = removeNoteAt(chordPattern(), 0, 0, 64, 4);
    expect(notesFromTrack(third.tracks[0]).map((n) => n.midi)).toEqual([60, 67]);
    // …and clearing the step removes them all.
    const cleared = removeNote(chordPattern(), 0, 0, 4);
    expect(notesFromTrack(cleared.tracks[0])).toHaveLength(0);
    expect(cleared.tracks[0].pitches?.[0]).toBeNull();
  });

  it("moves one chord tone and leaves the rest of the chord where it was", () => {
    const moved = moveNote(chordPattern(), 0, 0, 2, 64, 4, 64);
    const notes = notesFromTrack(moved.tracks[0]);
    expect(notes.filter((n) => n.stepIdx === 0).map((n) => n.midi)).toEqual([60, 67]);
    expect(notes.filter((n) => n.stepIdx === 2).map((n) => n.midi)).toEqual([64]);
  });

  it("moves a whole chord as a group, and lands it as a chord", () => {
    const moved = moveNotes(chordPattern(), 0, ["0:60", "0:64", "0:67"], 2, 0, 8);
    expect(moved.selection).toEqual(["2:60", "2:64", "2:67"]);
    expect(moved.pattern.tracks[0].pitches?.[2]).toEqual([60, 64, 67]);
    expect(moved.pattern.tracks[0].steps[0]).toBe(0);
  });

  it("refuses a group move that would push any tone out of the MIDI range", () => {
    const pattern = makePattern(makeTrack({ steps: [1, 0], pitch: [126, null], pitches: [[126, 127], null] }));
    expect(moveNotes(pattern, 0, ["0:126", "0:127"], 0, 4, 2).pattern).toBe(pattern);
  });

  it("applies length, velocity and quantise edits to the whole step", () => {
    const resized = resizeNote(chordPattern(), 0, 0, 1.75, 4);
    expect(resized.tracks[0].gate?.[0]).toBeCloseTo(1.75, 6);
    const louder = setNotesVelocity(chordPattern(), 0, ["0:64"], 120, 4);
    expect(louder.tracks[0].velocity?.[0]).toBe(120);
    expect(notesFromTrack(louder.tracks[0])).toHaveLength(3); // the chord is untouched
  });

  it("maps a selection of ids to the steps they occupy", () => {
    expect(selectedSteps(["0:60", "0:64", "4:67"])).toEqual([0, 4]);
  });

  it("leaves a monophonic pattern exactly as it was (old data must not change)", () => {
    const legacy = makePattern(makeTrack({ steps: [1, 0], pitch: [52, null] }));
    const written = withTrackNotes(legacy, 0, notesFromTrack(legacy.tracks[0]), 2);
    expect(written.tracks[0].pitch?.[0]).toBe(52);
    expect(written.tracks[0].pitches?.[0]).toEqual([52]);
    expect(written.tracks[0].steps).toEqual([1, 0]);
  });

  it("splits a chord as a chord (both halves keep every tone)", () => {
    const pattern = makePattern(makeTrack({ steps: [1, 0], pitch: [60, null], pitches: [[60, 64], null], gate: [1.6, 0.8] }));
    const { pattern: split, split: didSplit } = splitNote(pattern, 0, 0, 2);
    expect(didSplit).toBe(true);
    expect(split.tracks[0].pitches?.[0]).toEqual([60, 64]);
    expect(split.tracks[0].pitches?.[1]).toEqual([60, 64]);
  });
});
