import { describe, it, expect } from "vitest";
import {
  isOnGrid,
  laneFromNotes,
  laneNotesToTimed,
  laneStaysOnGrid,
  notesFromLane,
  stepPitches,
} from "../data/noteLayer";
import type { SequencerTrack } from "../types/genre";

/**
 * The note layer, phase P1 of `docs/PRO_EDITOR_PLAN.md`.
 *
 * The catalogue speaks in step arrays; the editor's direction is a note list. These cases pin the two things that make
 * that migration safe: the expansion is faithful (a genre's lane becomes the same notes), and the write-back **refuses**
 * anything a step array cannot say rather than rounding it away.
 */
const lane = (over: Partial<SequencerTrack> = {}): SequencerTrack =>
  ({
    track_id: "kick",
    name: "Kick",
    instrument: "punchy_kick",
    steps: [1, 0, 0, 0, 1, 0, 0, 0],
    ...over,
  }) as SequencerTrack;

describe("expanding a lane into notes", () => {
  it("turns each active step into one note, with the step's own velocity and gate", () => {
    const notes = notesFromLane(
      lane({ velocity: [100, 0, 0, 0, 64, 0, 0, 0], gate: [0.5, 0.8, 0.8, 0.8, 2, 0.8, 0.8, 0.8] }),
      8
    );
    expect(notes).toHaveLength(2);
    expect(notes[0]).toMatchObject({ startStep: 0, durationSteps: 0.5, velocity: 100 / 127, pitch: 0 });
    expect(notes[1]).toMatchObject({ startStep: 4, durationSteps: 2, velocity: 64 / 127, pitch: 0 });
  });

  it("expands a stored chord into one note per pitch on the step", () => {
    const notes = notesFromLane(
      lane({
        track_id: "chords",
        steps: [1, 0, 0, 0, 0, 0, 0, 0],
        pitches: [[48, 55, 60], null, null, null, null, null, null, null],
      }),
      8
    );
    expect(notes.map((n) => n.pitch)).toEqual([48, 55, 60]);
    expect(new Set(notes.map((n) => n.startStep))).toEqual(new Set([0]));
  });

  it("expands a ratchet into evenly spaced hits inside the step", () => {
    const notes = notesFromLane(
      lane({ steps: [1, 0, 0, 0, 0, 0, 0, 0], gate: [1, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8], ratchet: [4, 1, 1, 1, 1, 1, 1, 1] }),
      8
    );
    expect(notes.map((n) => n.startStep)).toEqual([0, 0.25, 0.5, 0.75]);
    expect(notes.every((n) => n.durationSteps === 0.25)).toBe(true);
  });

  it("reads a step's pitches as the stack first, then the root, then nothing", () => {
    const track = lane({ track_id: "chords", pitch: [60, 62, null, null, null, null, null, null], pitches: [[60, 64], null, null, null, null, null, null, null] });
    expect(stepPitches(track, 0)).toEqual([60, 64]);
    expect(stepPitches(track, 1)).toEqual([62]);
    expect(stepPitches(track, 2)).toEqual([]);
  });
});

describe("writing notes back as a step array", () => {
  it("round-trips a grid-aligned lane, notes → arrays → notes", () => {
    const track = lane({
      velocity: [100, 0, 0, 0, 64, 0, 0, 0],
      gate: [0.5, 0.8, 0.8, 0.8, 2, 0.8, 0.8, 0.8],
      pitch: [36, null, null, null, 38, null, null, null],
    });
    const notes = notesFromLane(track, 8);
    const arrays = laneFromNotes(notes, 8);
    expect(arrays).not.toBeNull();
    expect(arrays!.steps).toEqual(track.steps);
    expect(arrays!.pitch).toEqual(track.pitch);
    expect(arrays!.velocity).toEqual(track.velocity);
    expect(arrays!.gate).toEqual(track.gate);
    expect(notesFromLane({ ...track, ...arrays! } as SequencerTrack, 8)).toEqual(notes);
  });

  it("keeps a stored chord as a stored chord", () => {
    const track = lane({
      track_id: "chords",
      steps: [1, 0, 0, 0, 0, 0, 0, 0],
      pitches: [[48, 55, 60], null, null, null, null, null, null, null],
    });
    const arrays = laneFromNotes(notesFromLane(track, 8), 8);
    expect(arrays!.pitches?.[0]).toEqual([48, 55, 60]);
    // The root stays in `pitch`, which is the track type's own contract.
    expect(arrays!.pitch[0]).toBe(48);
  });

  it("refuses what a step array cannot say, instead of rounding", () => {
    const offGrid = notesFromLane(lane(), 8).map((note) => ({ ...note, startStep: note.startStep + 0.25 }));
    expect(laneFromNotes(offGrid, 8)).toBeNull();
    expect(laneStaysOnGrid(offGrid, 8)).toBe(false);

    // …but a fractional *duration* is free: `gate` is a float, and 0.5 or 2.5 steps is a normal pattern value.
    const fractional = notesFromLane(lane(), 8).map((note) => ({ ...note, durationSteps: 1.5 }));
    expect(laneFromNotes(fractional, 8)?.gate?.[0]).toBe(1.5);

    // Two hits on one step with different velocities is a sequence, not a chord.
    const twoOnOneStep = [
      { trackId: "kick" as const, pitch: 0, startStep: 0, durationSteps: 1, velocity: 1 },
      { trackId: "kick" as const, pitch: 1, startStep: 0, durationSteps: 1, velocity: 0.5 },
    ];
    expect(laneFromNotes(twoOnOneStep, 8)).toBeNull();
  });

  it("accepts a chord whose notes agree, and only then", () => {
    const chord = [48, 55, 60].map((pitch) => ({
      trackId: "chords" as const,
      pitch,
      startStep: 2,
      durationSteps: 4,
      velocity: 0.8,
    }));
    expect(laneStaysOnGrid(chord, 8)).toBe(true);
    const disagreeing = chord.map((note, i) => ({ ...note, velocity: i === 0 ? 0.4 : 0.8 }));
    expect(laneStaysOnGrid(disagreeing, 8)).toBe(false);
  });
});

/**
 * The bridge to the scheduler.
 *
 * `planGs1Notes` already takes `{ note, time, duration, velocity }` in seconds, so the note layer needs one conversion —
 * and it is where an **off-grid** note finally means something, which is the whole reason the layer exists.
 */
describe("steps to seconds", () => {
  it("converts a step position to seconds at the tempo's 16th", () => {
    const [first] = laneNotesToTimed(
      [{ trackId: "lead", pitch: 72, startStep: 4, durationSteps: 2, velocity: 0.9 }],
      { bpm: 120 }
    );
    // 120 bpm, 16th steps: each step is 60 / 120 / 4 = 0.125 s.
    expect(first.time).toBeCloseTo(0.5, 9);
    expect(first.duration).toBeCloseTo(0.25, 9);
    expect(first.note).toBe(72);
  });

  it("keeps an off-grid start as an off-grid time", () => {
    const [note] = laneNotesToTimed(
      [{ trackId: "lead", pitch: 72, startStep: 4.5, durationSteps: 1, velocity: 0.9 }],
      { bpm: 120 }
    );
    expect(note.time).toBeCloseTo(0.5625, 9);
  });

  it("carries per-note pan and tuning through, and never invents them", () => {
    const [withExtras] = laneNotesToTimed(
      [{ trackId: "lead", pitch: 72, startStep: 0, durationSteps: 1, velocity: 0.9, pan: -0.4, cents: 7 }],
      { bpm: 100 }
    );
    expect(withExtras.pan).toBe(-0.4);
    expect(withExtras.cents).toBe(7);
    const [plain] = laneNotesToTimed([{ trackId: "lead", pitch: 72, startStep: 0, durationSteps: 1, velocity: 0.9 }], { bpm: 100 });
    expect("pan" in plain).toBe(false);
    expect("cents" in plain).toBe(false);
  });

  it("refuses a nonsense tempo instead of dividing by it", () => {
    expect(laneNotesToTimed([{ trackId: "lead", pitch: 72, startStep: 0, durationSteps: 1, velocity: 1 }], { bpm: 0 })).toEqual([]);
  });

  it("answers whether a lane is on the grid, which is what chooses the editor's view", () => {
    const onGrid = [{ trackId: "lead" as const, pitch: 72, startStep: 4, durationSteps: 1.5, velocity: 1 }];
    const offGrid = [{ ...onGrid[0], startStep: 4.25 }];
    expect(isOnGrid(onGrid)).toBe(true);
    expect(isOnGrid(offGrid)).toBe(false);
  });
});
