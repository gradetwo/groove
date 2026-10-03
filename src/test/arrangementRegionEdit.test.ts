/**
 * The region drag's arithmetic, and the model edit it ends in — without a browser.
 *
 * `docs/ARRANGEMENT_UI_DESIGN.md` §4 settles what a region *is* here (option (a): one region per track spanning the
 * arrangement, and nothing in the model to say otherwise), and the drag is the moment that stopped being enough: a
 * region the user has moved is a position the model has to hold, so `TrackV2.region` is option (b) in its smallest
 * form. These criteria are about the three claims that shape makes:
 *
 * 1. **a declared range is what the lane draws** (and absent still means the whole arrangement, unchanged);
 * 2. **a gesture is quantised by the snap value and clamped by the model** — the ported line from `ArrangementPanel`,
 *    `Math.round((event.clientX - startX) / pixelsPerBar)`, with the unit as a parameter;
 * 3. **one gesture is one action**, whose inverse is the range that was there — and a gesture that lands where it
 *    started is **not** an action at all.
 *
 * Every case here is a pure function, so what the pointer and the arrow keys do can be checked without either of them.
 */
import { describe, expect, it } from "vitest";
import {
  MIN_REGION_BARS,
  deriveArrangementRegions,
  regionBars,
  sameTrackRegion,
} from "../data/arrangementLanes";
import { setTrackRegion } from "../data/arrangementEdits";
import {
  EMPTY_ARRANGEMENT_HISTORY,
  recordCommand,
  redoArrangement,
  setTrackRegionCommand,
  undoArrangement,
} from "../data/arrangementHistory";
import { validateArrangementV2 } from "../features/sequencer/projectDb";
import {
  KEYBOARD_STEP_BARS,
  applyRegionCommand,
  dragRegion,
  quantiseBars,
  regionAfter,
  regionCommandForKey,
  regionStepBars,
} from "../features/arrangement/regionEdit";
import type { ArrangementV2, TrackRegion } from "../types/arrangementV2";

const arrangement = (overrides: Partial<ArrangementV2> = {}): ArrangementV2 => ({
  songId: "s",
  tracks: [{ id: "bass", kind: "synth", name: "Bass" }],
  notesByTrack: { bass: [] },
  bars: 8,
  sourceSlots: [],
  ...overrides,
});

describe("a region's range is the model's, and absent still means the whole arrangement", () => {
  it("⭐ draws the declared range, in bars and in beats", () => {
    // Option (b): the lane reads `track.region` when a track has one, and converts with the same `BEATS_PER_BAR` it
    // always used — so a moved region and a miniature inside it cannot disagree about where the region is.
    const [region] = deriveArrangementRegions(
      arrangement({ tracks: [{ id: "bass", kind: "synth", name: "Bass", region: { startBar: 2, endBar: 6 } }] })
    );
    expect(region!.startBar).toBe(2);
    expect(region!.endBar).toBe(6);
    expect(region!.startBeats).toBe(8);
    expect(region!.endBeats).toBe(24);
  });

  it("draws the whole arrangement for a track that declares nothing, which is every arrangement written before this", () => {
    const [region] = deriveArrangementRegions(arrangement());
    expect(region!.startBar).toBe(0);
    expect(region!.endBar).toBe(8);
  });

  it("clamps a range that arrived from a file, rather than drawing past the end", () => {
    // A number the model cannot honour is normalised on the way *in*, so the lane and the edit path cannot disagree.
    const [region] = deriveArrangementRegions(
      arrangement({ tracks: [{ id: "bass", kind: "synth", name: "Bass", region: { startBar: -4, endBar: 90 } }] })
    );
    expect(region!.startBar).toBe(0);
    expect(region!.endBar).toBe(8);
  });
});

describe("setTrackRegion, the one edit a region gesture makes", () => {
  it("stores the range, and returns the arrangement itself for an unknown track", () => {
    const before = arrangement();
    const after = setTrackRegion(before, "bass", { startBar: 1, endBar: 4 });
    expect(after.tracks[0]!.region).toEqual({ startBar: 1, endBar: 4 });
    // The signal every caller in this code base uses for "no edit happened" — and what keeps a stale id out of history.
    expect(setTrackRegion(before, "gone", { startBar: 1, endBar: 4 })).toBe(before);
  });

  it("⭐⭐ drops the field when the range is the default span, so 'moved back' and 'never moved' are the same bytes", () => {
    /**
     * The rule a label, a mute and a transpose already follow one file over. It is also what makes the ported gesture
     * reversible *exactly*: undoing a drag back to the whole arrangement leaves an arrangement with no `region` key,
     * deep-equal to the one before the drag ever happened.
     */
    const before = arrangement();
    const moved = setTrackRegion(before, "bass", { startBar: 2, endBar: 6 });
    const back = setTrackRegion(moved, "bass", { startBar: 0, endBar: 8 });
    expect("region" in back.tracks[0]!).toBe(false);
    expect(back).toEqual(before);
  });

  it("clamps to the model's limits, and refuses a non-finite range", () => {
    const before = arrangement();
    // Shorter than a bar: `MIN_REGION_BARS` is the finest thing the ruler and the lane can show.
    expect(setTrackRegion(before, "bass", { startBar: 3, endBar: 3 }).tracks[0]!.region).toEqual({ startBar: 3, endBar: 4 });
    // Past the end.
    expect(setTrackRegion(before, "bass", { startBar: 4, endBar: 12 }).tracks[0]!.region).toEqual({ startBar: 4, endBar: 8 });
    // A value that is not a number is not a position.
    expect(setTrackRegion(before, "bass", { startBar: Number.NaN, endBar: 4 })).toBe(before);
  });

  it("returns the arrangement itself when the range normalises to what the track already declares", () => {
    const moved = setTrackRegion(arrangement(), "bass", { startBar: 2, endBar: 6 });
    // A drag that ends where it started must not enter the undo stack, and this is the check that stops it.
    expect(setTrackRegion(moved, "bass", { startBar: 2, endBar: 6 })).toBe(moved);
    // A grid step is an exact binary fraction, so "the same place" compares by value and never nearly.
    expect(setTrackRegion(moved, "bass", { startBar: 2, endBar: 6 + 0.0625 })).not.toBe(moved);
  });

  it("⭐ survives a save/load round trip, because the validator reads the field", () => {
    /**
     * `validateArrangementV2` is hand-written and **drops a field it does not know**, which is deliberate. Without the
     * `region` branch a dragged region would come back covering the whole arrangement after a reload — the defect this
     * criterion exists to catch.
     */
    const stored = JSON.parse(JSON.stringify(setTrackRegion(arrangement(), "bass", { startBar: 1, endBar: 4 }))) as ArrangementV2;
    expect(validateArrangementV2(stored)).toEqual(stored);
    // And a stored arrangement with no region still reads, which is every project already on disk.
    const plain = JSON.parse(JSON.stringify(arrangement())) as ArrangementV2;
    expect(validateArrangementV2(plain)).toEqual(plain);
  });
});

describe("the drag's arithmetic: pixels → bars → the snap grid → a clamped range", () => {
  it("⭐⭐ quantises the delta to the snap unit — the ported Studio editor line, with the unit as a parameter", () => {
    // `ArrangementPanel` had `Math.round((clientX - startX) / ARRANGEMENT_BAR_WIDTH)`: a whole bar. With the unit at
    // one bar this is that expression, and 1.4 bars of pointer travel lands on bar 1.
    expect(dragRegion({ startBar: 0, endBar: 4 }, "move", 1.4 * 64, 64, 1, 8)).toEqual({ startBar: 1, endBar: 5 });
    // A beat is 0.25 of a 4/4 bar, so the same travel now lands on the beat grid instead (1.4 rounds up to 1.5).
    expect(dragRegion({ startBar: 0, endBar: 4 }, "move", 1.4 * 64, 64, 0.25, 8)).toEqual({ startBar: 1.5, endBar: 5.5 });
  });

  it("lands where the pointer is when the unit is `undefined` — which is what the bypass means", () => {
    const landed = dragRegion({ startBar: 0, endBar: 4 }, "move", 1.4 * 64, 64, undefined, 8);
    expect(landed.startBar).toBeCloseTo(1.4, 12);
    expect(landed.endBar).toBeCloseTo(5.4, 12);
  });

  it("⭐⭐ a region that already fills the arrangement cannot be moved — the ported editor's own behaviour, deliberately", () => {
    /**
     * This is the one thing about the port that looks like a missing feature and is not. The Studio editor's move is
     * `moveSection(song, id, dropIndexForBar(song, startBar + barsMoved))`, and with a single section the drop index
     * clamps to the only slot there is: **a lone section cannot be dragged either**. Here the region is one range inside
     * the arrangement (`arrangement.bars` is the bound the ruler and the lane are drawn from), so a region that spans
     * all of it has nowhere to go — the same answer, one model over.
     *
     * It is pinned as a criterion so that it is a decision rather than an accident: a drag of a full-length region
     * returns the range it started with, and the lane therefore reports no edit at all (see the commit test below).
     */
    const whole = { startBar: 0, endBar: 8 };
    expect(dragRegion(whole, "move", 3 * 64, 64, 1, 8)).toEqual(whole);
    expect(dragRegion(whole, "move", -3 * 64, 64, 1, 8)).toEqual(whole);
    // The right edge is still a real gesture on it — that is how a region comes to have somewhere to move to.
    expect(dragRegion(whole, "resize", -2 * 64, 64, 1, 8)).toEqual({ startBar: 0, endBar: 6 });
  });

  it("moves the whole region, keeping its length, and stops at the edges instead of wrapping", () => {
    expect(regionAfter({ startBar: 2, endBar: 5 }, "move", 2, 8)).toEqual({ startBar: 4, endBar: 7 });
    expect(regionAfter({ startBar: 2, endBar: 5 }, "move", -99, 8)).toEqual({ startBar: 0, endBar: 3 });
    expect(regionAfter({ startBar: 2, endBar: 5 }, "move", 99, 8)).toEqual({ startBar: 5, endBar: 8 });
  });

  it("resizes the right edge only, with the region never shorter than a bar", () => {
    expect(regionAfter({ startBar: 2, endBar: 5 }, "resize", 2, 8)).toEqual({ startBar: 2, endBar: 7 });
    expect(regionAfter({ startBar: 2, endBar: 5 }, "resize", -99, 8)).toEqual({ startBar: 2, endBar: 3 });
    expect(regionAfter({ startBar: 2, endBar: 5 }, "resize", 99, 8)).toEqual({ startBar: 2, endBar: 8 });
    expect(MIN_REGION_BARS).toBe(1);
  });

  it("is a total function over a range an old file could hold", () => {
    // Nothing a file can contain may produce `NaN`, a negative start, or an inverted range.
    const wild = regionAfter({ startBar: -3, endBar: -1 }, "move", Number.POSITIVE_INFINITY, 8);
    expect(Number.isFinite(wild.startBar)).toBe(true);
    expect(wild.startBar).toBeLessThanOrEqual(wild.endBar);
    expect(wild.startBar).toBeGreaterThanOrEqual(0);
  });

  it("a drag of less than half a unit is not a move at all, which is what makes a click a selection", () => {
    expect(quantiseBars(0.4, 1)).toBe(0);
    expect(quantiseBars(0.6, 1)).toBe(1);
    expect(quantiseBars(-0.4, 1)).toBe(-0);
    // The unit list is all exact binary fractions, so a quantised position is exact rather than nearly.
    expect(quantiseBars(1.4, 0.03125)).toBe(1.40625);
  });
});

describe("the keyboard's whole vocabulary, ported from the Studio editor", () => {
  it("arrows nudge and Shift+arrows change the length — and every other key is left alone", () => {
    // `songEdit.commandForKey`'s own bindings. `null` matters: swallowing a key the region does not own would break
    // the surface around it.
    expect(regionCommandForKey("ArrowLeft")).toBe("move-left");
    expect(regionCommandForKey("ArrowRight")).toBe("move-right");
    expect(regionCommandForKey("ArrowLeft", true)).toBe("shrink");
    expect(regionCommandForKey("ArrowRight", true)).toBe("grow");
    expect(regionCommandForKey("ArrowUp")).toBeNull();
    expect(regionCommandForKey("Tab")).toBeNull();
    expect(regionCommandForKey("Delete")).toBeNull();
  });

  it("runs the same two functions the drag runs, so the alternative cannot land somewhere else", () => {
    const range: TrackRegion = { startBar: 2, endBar: 5 };
    expect(applyRegionCommand(range, "move-right", 1, 8)).toEqual({ startBar: 3, endBar: 6 });
    expect(applyRegionCommand(range, "move-left", 1, 8)).toEqual({ startBar: 1, endBar: 4 });
    expect(applyRegionCommand(range, "grow", 1, 8)).toEqual({ startBar: 2, endBar: 6 });
    expect(applyRegionCommand(range, "shrink", 1, 8)).toEqual({ startBar: 2, endBar: 4 });
    // Clamped by the same `regionAfter` the pointer path uses — not by a second set of limits.
    expect(applyRegionCommand({ startBar: 0, endBar: 3 }, "move-left", 1, 8)).toEqual({ startBar: 0, endBar: 3 });
  });

  it("steps by the snap grid when one is on, and by a bar when it is off", () => {
    // A key press cannot be unquantised: something has to move, and a bar is what the ruler's cells and the ported
    // gesture are both in.
    expect(regionStepBars(0.25)).toBe(0.25);
    expect(regionStepBars(undefined)).toBe(KEYBOARD_STEP_BARS);
    expect(KEYBOARD_STEP_BARS).toBe(1);
  });
});

describe("one gesture is one action", () => {
  it("⭐⭐ a region command undoes to the range that was there, and redoes to the one that landed", () => {
    const before = arrangement();
    const command = setTrackRegionCommand("bass", { startBar: 0, endBar: 8 }, { startBar: 2, endBar: 6 });
    const history = recordCommand(EMPTY_ARRANGEMENT_HISTORY, command);
    const after = command.redo(before);

    const undone = undoArrangement(history, after);
    expect(undone).not.toBeNull();
    expect(undone!.action).toBe("region");
    // Deep-equal, not merely "the same numbers": undoing a drag has to leave the arrangement it started from.
    expect(undone!.arrangement).toEqual(before);
    expect(undone!.history.past).toHaveLength(0);

    const redone = redoArrangement(undone!.history, undone!.arrangement);
    expect(redone!.arrangement).toEqual(after);
  });

  it("is one entry however many times the range moved during the gesture", () => {
    /**
     * The lane reports the range **once**, on pointer up (`ArrangementLaneV2` holds it while the finger is down), so
     * the stack this command lands in has one entry for a forty-move drag. This is the arithmetic half of that claim:
     * the command's payload is the two ends, not the path between them — so twenty commits are not twenty commands,
     * and the criterion that proves the wiring does the same thing through the DOM.
     */
    const before = arrangement();
    const command = setTrackRegionCommand("bass", { startBar: 0, endBar: 8 }, { startBar: 3, endBar: 8 });
    const history = recordCommand(EMPTY_ARRANGEMENT_HISTORY, command);
    expect(history.past).toHaveLength(1);
    expect(undoArrangement(history, command.redo(before))!.arrangement).toEqual(before);
  });

  it("compares ranges by value, so 'unchanged' has one reading", () => {
    expect(sameTrackRegion({ startBar: 1, endBar: 4 }, { startBar: 1, endBar: 4 })).toBe(true);
    expect(sameTrackRegion({ startBar: 1, endBar: 4 }, { startBar: 1, endBar: 5 })).toBe(false);
    // `undefined` on both sides is the default span, and it is equal to itself.
    expect(sameTrackRegion(undefined, undefined)).toBe(true);
    expect(sameTrackRegion(undefined, { startBar: 0, endBar: 8 })).toBe(false);
  });

  it("reads the arrangement's own length from one place", () => {
    expect(regionBars(arrangement())).toBe(8);
    expect(regionBars(arrangement({ bars: undefined }))).toBe(8);
    expect(regionBars(arrangement({ bars: 16 }))).toBe(16);
  });
});
