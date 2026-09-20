/**
 * Vinyl player maths: the geometry, the audio-clock rotation, the tonearm spring and the play-mode
 * cycle, all as pure functions.
 *
 * These are the parts of the full-screen player that are expensive to eyeball and easy to get subtly
 * wrong (a disc that drifts from the beat, an arm that oscillates for ever, a mode cycle that skips
 * a mode). Asserting them here means the canvas component only has to *draw* what they return.
 */
import { describe, it, expect } from "vitest";
import {
  discAngle,
  loopProgress,
  needleRadius,
  nextGenreForMode,
  nextPlayMode,
  normalisePlayMode,
  PLAY_MODES,
  stepDotPosition,
  scrubAngleOffset,
  scrubBpmDelta,
  scrubFlickBpmDelta,
  stepScrubReturn,
  stepTonearm,
  TONEARM_PLAY_POSITION,
  TONEARM_REST_POSITION,
  tonearmAngle,
  tonearmLift,
  vinylGeometry,
} from "../mobile/vinyl/vinylMath";

const LIBRARY = [
  { id: "a", category: "Electronic" },
  { id: "b", category: "Electronic" },
  { id: "c", category: "Hip Hop" },
];

describe("vinyl · geometry", () => {
  it("keeps the disc inside the box with an 8px inset, bottom-centred", () => {
    const geometry = vinylGeometry(300, 352);
    expect(geometry.maxR).toBe(142);
    expect(geometry.cx).toBe(150);
    expect(geometry.cy).toBe(202);
    expect(geometry.cy + geometry.maxR).toBeLessThanOrEqual(352 - 8);
    expect(geometry.labelR).toBeCloseTo(142 * 0.42, 6);
  });

  it("leaves the top of the box free for the tonearm", () => {
    const geometry = vinylGeometry(300, 352);
    expect(geometry.pivotY).toBeLessThan(geometry.cy - geometry.maxR);
  });

  it("never returns a zero or negative radius, even for a collapsed box", () => {
    for (const [width, height] of [
      [0, 0],
      [10, 4],
      [300, 0],
    ]) {
      const geometry = vinylGeometry(width, height);
      expect(geometry.maxR).toBeGreaterThan(0);
    }
  });
});

describe("vinyl · the disc follows the audio clock", () => {
  it("advances by exactly one step per step, and one turn per 16", () => {
    expect(discAngle(1, 0) - discAngle(0, 0)).toBeCloseTo((Math.PI * 2) / 16, 9);
    expect(discAngle(16, 0) - discAngle(0, 0)).toBeCloseTo(Math.PI * 2, 9);
  });

  it("interpolates inside a step and clamps a fraction outside 0..1", () => {
    expect(discAngle(0, 0.5)).toBeCloseTo(discAngle(0, 0) + (Math.PI * 2) / 32, 9);
    expect(discAngle(0, 4)).toBeCloseTo(discAngle(1, 0), 9);
    expect(discAngle(0, -1)).toBeCloseTo(discAngle(0, 0), 9);
  });

  it("reports loop progress that agrees with the angle", () => {
    expect(loopProgress(0, 0)).toBe(0);
    expect(loopProgress(8, 0)).toBeCloseTo(0.5, 9);
    expect(loopProgress(15, 1)).toBeCloseTo(1, 9);
    // A 32-step pattern is two turns; progress must still be the fraction of the loop.
    expect(loopProgress(16, 0, 32)).toBeCloseTo(0.5, 9);
    expect(loopProgress(0, 0, 0)).toBe(0);
  });
});

describe("vinyl · the tonearm", () => {
  const step = (state: { position: number; velocity: number }, target: number, frames = 200) => {
    let current = state;
    for (let i = 0; i < frames; i += 1) current = stepTonearm(current, target, 16);
    return current;
  };

  it("starts at rest and reaches the groove when asked to play", () => {
    const settled = step({ position: TONEARM_REST_POSITION, velocity: 0 }, TONEARM_PLAY_POSITION);
    expect(settled.position).toBeGreaterThan(0.99);
    expect(settled.position).toBeLessThanOrEqual(1.12);
    expect(Math.abs(settled.velocity)).toBeLessThan(0.01);
  });

  it("settles instead of oscillating for ever", () => {
    let state = { position: TONEARM_REST_POSITION, velocity: 0 };
    const samples: number[] = [];
    for (let i = 0; i < 400; i += 1) {
      state = stepTonearm(state, TONEARM_PLAY_POSITION, 16);
      if (i > 300) samples.push(state.position);
    }
    const spread = Math.max(...samples) - Math.min(...samples);
    expect(spread).toBeLessThan(0.001);
  });

  it("cannot be flung past its travel by a huge frame delta", () => {
    const after = stepTonearm({ position: 1, velocity: 0 }, TONEARM_REST_POSITION, 5000);
    expect(after.position).toBeLessThanOrEqual(1.12);
    expect(after.position).toBeGreaterThanOrEqual(-0.06);
  });

  it("lifts the arm mid-swing, at both ends and nowhere else", () => {
    expect(tonearmLift(0)).toBeCloseTo(0, 9);
    expect(tonearmLift(1)).toBeCloseTo(0, 9);
    expect(tonearmLift(0.5)).toBeCloseTo(1, 9);
    expect(tonearmAngle(0)).toBe(0);
    expect(tonearmAngle(1)).toBeCloseTo(0.21, 9);
  });

  it("puts the needle off the label at rest and on the outer groove when playing", () => {
    const geometry = vinylGeometry(300, 352);
    expect(needleRadius(geometry, 0)).toBeLessThan(geometry.labelR);
    expect(needleRadius(geometry, 1)).toBeCloseTo(geometry.maxR * 0.9, 6);
  });

  it("places step dots inside the disc, one lane per ring", () => {
    const geometry = vinylGeometry(300, 352);
    for (let lane = 0; lane < 4; lane += 1) {
      for (const step of [0, 7, 15]) {
        const dot = stepDotPosition(geometry, lane, step);
        const distance = Math.hypot(dot.x - geometry.cx, dot.y - geometry.cy);
        expect(distance).toBeLessThanOrEqual(geometry.maxR);
        expect(distance).toBeGreaterThanOrEqual(geometry.labelR);
      }
    }
    // Lane 0 is the outer ring: strictly farther out than lane 3.
    const outer = stepDotPosition(geometry, 0, 0);
    const inner = stepDotPosition(geometry, 3, 0);
    expect(Math.hypot(outer.x - geometry.cx, outer.y - geometry.cy)).toBeGreaterThan(
      Math.hypot(inner.x - geometry.cx, inner.y - geometry.cy)
    );
  });
});

describe("vinyl · play modes", () => {
  it("cycles one -> genre -> all -> one", () => {
    expect(PLAY_MODES).toEqual(["one", "genre", "all"]);
    expect(nextPlayMode("one")).toBe("genre");
    expect(nextPlayMode("genre")).toBe("all");
    expect(nextPlayMode("all")).toBe("one");
  });

  it("treats a stale persisted value as 'one'", () => {
    expect(normalisePlayMode("nonsense")).toBe("one");
    expect(normalisePlayMode(null)).toBe("one");
    expect(normalisePlayMode("all")).toBe("all");
  });

  it("repeats in one, walks the category in genre, and the library in all", () => {
    expect(nextGenreForMode("one", "a", LIBRARY)).toBe("a");
    expect(nextGenreForMode("genre", "a", LIBRARY)).toBe("b");
    expect(nextGenreForMode("genre", "b", LIBRARY)).toBe("a");
    expect(nextGenreForMode("all", "c", LIBRARY)).toBe("a");
    expect(nextGenreForMode("all", "a", LIBRARY)).toBe("b");
  });

  it("walks backwards too, and never returns nothing", () => {
    expect(nextGenreForMode("all", "a", LIBRARY, -1)).toBe("c");
    expect(nextGenreForMode("all", "ghost", LIBRARY)).toBe("a");
    expect(nextGenreForMode("all", "a", [])).toBe("a");
  });
});

describe("vinyl · the jog (drag the record)", () => {
  it("maps a drag to BPM the way the reference does", () => {
    expect(scrubBpmDelta(50)).toBeCloseTo(10, 6);
    expect(scrubBpmDelta(-50)).toBeCloseTo(-10, 6);
    expect(scrubBpmDelta(0)).toBe(0);
  });

  it("keeps the disc's drag offset inside ±1.6 rad", () => {
    expect(scrubAngleOffset(0, 100)).toBeCloseTo(0.7, 6);
    let offset = 0;
    for (let i = 0; i < 50; i += 1) offset = scrubAngleOffset(offset, 100);
    expect(offset).toBeLessThanOrEqual(1.6);
    for (let i = 0; i < 100; i += 1) offset = scrubAngleOffset(offset, -100);
    expect(offset).toBeGreaterThanOrEqual(-1.6);
  });

  it("only adds a flick when the release actually had momentum", () => {
    expect(scrubFlickBpmDelta(0.1)).toBe(0);
    expect(scrubFlickBpmDelta(-0.25)).toBe(0);
    expect(scrubFlickBpmDelta(0.5)).toBeCloseTo(3, 6);
    // …and it cannot exceed the reference's 10 BPM.
    expect(scrubFlickBpmDelta(9)).toBe(10);
    expect(scrubFlickBpmDelta(-9)).toBe(-10);
  });

  it("springs the disc back to its groove instead of leaving it offset", () => {
    let state = { offset: 1.2, velocity: 0 };
    for (let i = 0; i < 200; i += 1) state = stepScrubReturn(state.offset, state.velocity, 16);
    expect(Math.abs(state.offset)).toBeLessThan(0.01);
    expect(Math.abs(state.velocity)).toBeLessThan(0.01);
  });
});
