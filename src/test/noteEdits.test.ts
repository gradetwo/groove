import { describe, it, expect } from "vitest";
import { quantiseNotes, setNoteLength, snapNotesToScale, swingNotes, transposeNotes } from "../data/noteEdits";
import type { LaneNote } from "../data/noteLayer";

/**
 * Note transforms: the pure half of the note editor.
 *
 * Each case here states a *definition* — what quantise, swing and scale snapping mean — because those words each mean
 * several things in different software, and the difference is exactly the kind of thing that should be argued with a test
 * rather than by ear.
 */
const note = (over: Partial<LaneNote> = {}): LaneNote => ({
  trackId: "lead",
  pitch: 72,
  startStep: 4,
  durationSteps: 1,
  velocity: 0.9,
  ...over,
});

describe("quantise", () => {
  it("moves a start towards the nearest grid line by the strength", () => {
    expect(quantiseNotes([note({ startStep: 4.4 })], 1, 1)[0].startStep).toBeCloseTo(4, 9);
    expect(quantiseNotes([note({ startStep: 4.4 })], 1, 0.5)[0].startStep).toBeCloseTo(4.2, 9);
    expect(quantiseNotes([note({ startStep: 4.4 })], 1, 0)[0].startStep).toBeCloseTo(4.4, 9);
  });

  it("is idempotent, and leaves everything but the start alone", () => {
    const source = [note({ startStep: 4.4, durationSteps: 0.5, velocity: 0.31, cents: 7 })];
    const once = quantiseNotes(source, 1, 1);
    const twice = quantiseNotes(once, 1, 1);
    expect(twice).toEqual(once);
    expect(once[0]).toMatchObject({ durationSteps: 0.5, velocity: 0.31, cents: 7, pitch: 72 });
  });

  it("quantises to a finer grid when asked", () => {
    expect(quantiseNotes([note({ startStep: 4.3 })], 0.25, 1)[0].startStep).toBeCloseTo(4.25, 9);
    // …and a coarse grid takes it further than a fine one would.
    expect(quantiseNotes([note({ startStep: 4.6 })], 2, 1)[0].startStep).toBeCloseTo(4, 9);
  });

  it("refuses a nonsense grid by returning the notes unchanged", () => {
    expect(quantiseNotes([note({ startStep: 4.4 })], 0, 1)[0].startStep).toBeCloseTo(4.4, 9);
    expect(quantiseNotes([note({ startStep: 4.4 })], -1, 1)[0].startStep).toBeCloseTo(4.4, 9);
  });
});

describe("swing", () => {
  it("delays the off-beat and leaves the downbeat alone", () => {
    const swung = swingNotes([note({ startStep: 0 }), note({ startStep: 2 })], 1, 4);
    expect(swung[0].startStep).toBeCloseTo(0, 9);
    // A beat of 4 steps: the off-beat at 2 lands two thirds of the way through, i.e. at 2 + 2/3.
    expect(swung[1].startStep).toBeCloseTo(2 + 2 / 3, 9);
  });

  it("scales the delay with the amount, and clamps at the triplet feel", () => {
    expect(swingNotes([note({ startStep: 2 })], 0.5, 4)[0].startStep).toBeCloseTo(2 + 1 / 3, 9);
    expect(swingNotes([note({ startStep: 2 })], 4, 4)[0].startStep).toBeCloseTo(2 + 2 / 3, 9);
  });

  it("does nothing at zero, and never moves a note on a different beat", () => {
    expect(swingNotes([note({ startStep: 2 })], 0, 4)[0].startStep).toBeCloseTo(2, 9);
    expect(swingNotes([note({ startStep: 1 })], 1, 4)[0].startStep).toBeCloseTo(1, 9);
    // The second beat's off-beat is 6, not 2 — the pattern repeats every beat, not once per bar.
    expect(swingNotes([note({ startStep: 6 })], 1, 4)[0].startStep).toBeCloseTo(6 + 2 / 3, 9);
  });
});

describe("scale snapping", () => {
  const minorPentatonic = [0, 3, 5, 7, 10];

  it("leaves notes that are already in the scale untouched", () => {
    const notes = [60, 63, 67, 70].map((pitch) => note({ pitch }));
    expect(snapNotesToScale(notes, minorPentatonic).map((n) => n.pitch)).toEqual([60, 63, 67, 70]);
  });

  it("moves an out-of-scale note to the nearest degree", () => {
    // 62 is one semitone below 63 (in scale) and two above 60 (in scale), so it goes up…
    expect(snapNotesToScale([note({ pitch: 62 })], minorPentatonic)[0].pitch).toBe(63);
    // …while 64 is one above 63 and three below 67, so it goes down. In both cases the nearest degree wins, which is the
    // whole rule; an exact tie cannot arise with integer pitches, and the scan order resolves one downwards by design.
    expect(snapNotesToScale([note({ pitch: 64 })], minorPentatonic)[0].pitch).toBe(63);
    expect(snapNotesToScale([note({ pitch: 61 })], minorPentatonic)[0].pitch).toBe(60);
  });

  it("stays in the same octave, and leaves drums alone", () => {
    expect(snapNotesToScale([note({ pitch: 71 })], minorPentatonic)[0].pitch).toBe(70);
    expect(snapNotesToScale([note({ pitch: 0 })], minorPentatonic)[0].pitch).toBe(0);
  });

  it("does nothing with an empty scale", () => {
    expect(snapNotesToScale([note({ pitch: 62 })], [])[0].pitch).toBe(62);
  });
});

describe("transpose and length", () => {
  it("moves melodic notes and clamps at the MIDI range", () => {
    expect(transposeNotes([note({ pitch: 72 })], -12)[0].pitch).toBe(60);
    expect(transposeNotes([note({ pitch: 120 })], 12)[0].pitch).toBe(127);
    expect(transposeNotes([note({ pitch: 0 })], 5)[0].pitch).toBe(0);
  });

  it("gives a selection one length with a floor, so a zero-length note cannot be written", () => {
    const notes = [note({ durationSteps: 0.5 }), note({ durationSteps: 4, startStep: 6 })];
    const staccato = setNoteLength(notes, 0.25);
    expect(staccato.map((n) => n.durationSteps)).toEqual([0.25, 0.25]);
    expect(staccato.map((n) => n.startStep)).toEqual([4, 6]);
    expect(setNoteLength(notes, 0)[0].durationSteps).toBeCloseTo(1 / 32, 9);
  });
});
