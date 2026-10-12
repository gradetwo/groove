/**
 * How long an arrangement is, and what that length does.
 *
 * It exists because a note has a position in **musical time** and musical time has to have somewhere to be: without a length, a roll could only show the sixteen steps a lane happened to hold, and "write something in bar 3" was not a thing a person could do.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_BARS, MAX_BARS, createArrangement, setArrangementBars, addTrack, addTrackNote } from "../data/arrangementEdits";
import { compileArrangementToLanes } from "../data/arrangementCompile";
import { stepCountFor, STEPS_PER_BAR } from "../data/noteEvents";

const note = (startBeats: number) => ({ pitch: 60, startBeats, lengthBeats: 1, velocity: 100 });

describe("an arrangement's length", () => {
  it("starts long enough to hold more than a pattern", () => {
    // One bar was the v1 pattern's length leaking into a surface that is not a pattern.
    expect(createArrangement("song").bars).toBe(DEFAULT_BARS);
    expect(DEFAULT_BARS).toBeGreaterThan(1);
  });

  it("is clamped rather than refused, because a slider's end is not an error", () => {
    const arrangement = createArrangement("song");
    expect(setArrangementBars(arrangement, 4).bars).toBe(4);
    expect(setArrangementBars(arrangement, 0).bars).toBe(1);
    expect(setArrangementBars(arrangement, 9999).bars).toBe(MAX_BARS);
  });

  it("spans its stated length, and at least as far as its notes reach", () => {
    /**
     * **The longer of the two.** A stated length shorter than the notes would be a deletion — the compile would drop everything past the end — while a stated length longer than the notes is just silence, which an arrangement may contain.
     */
    expect(stepCountFor([], 2)).toBe(2 * STEPS_PER_BAR);
    // A note in bar three makes a one-bar arrangement span three bars, because cutting it would be losing content.
    expect(stepCountFor([note(8)], 1)).toBe(3 * STEPS_PER_BAR);
    // And a long arrangement with one note stays long: the length is a decision, not a measurement.
    expect(stepCountFor([note(0)], 8)).toBe(8 * STEPS_PER_BAR);
  });

  it("compiles a grid as long as the arrangement, not a fixed sixteen steps", () => {
    const withTrack = addTrack(createArrangement("song"), "synth", "Keys");
    const id = withTrack.tracks[0]!.id;
    const fourBars = setArrangementBars(withTrack, 4);
    const lanes = compileArrangementToLanes(fourBars, { [id]: [] });
    expect(lanes[0]!.track.steps).toHaveLength(4 * STEPS_PER_BAR);
  });

  it("keeps a note written past a short arrangement rather than truncating it", () => {
    // The audible form of "the length must not delete": the note is in bar three and the arrangement says one bar.
    const withTrack = addTrack(createArrangement("song"), "synth", "Keys");
    const id = withTrack.tracks[0]!.id;
    const written = addTrackNote(setArrangementBars(withTrack, 1), id, { pitch: 64, startBeats: 8, lengthBeats: 1, velocity: 100 });
    const lanes = compileArrangementToLanes(written, written.notesByTrack);
    const steps = lanes[0]!.track.steps ?? [];
    // Bar three begins at step 32, so the lane has to reach past it.
    expect(steps.length).toBeGreaterThan(32);
    expect(steps[32]).not.toBe(0);
  });
});
