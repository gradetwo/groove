/**
 * Growing the pattern length (item ③ of the plan: "128 步只有 32 步有数据").
 *
 * `SET_STEP_COUNT` used to append `steps.slice(0, diff)` to itself. That only reaches the target
 * while `diff` is smaller than the source array: going 16 → 128 asked for a 112-step tail from a
 * 16-step array, received 16, and produced a **32-step grid** whose upper three quarters were
 * empty. The same arithmetic ran for velocity, pitch, gate, ratchet and probability, so the six
 * parallel arrays stayed consistent with each other — which is why nothing crashed and the bug
 * survived: the grid simply had dead cells, and a 128-step export was mostly silence.
 *
 * Two invariants matter and neither was asserted anywhere: every parallel array must end up
 * exactly `totalSteps` long, and the existing pattern must actually be **repeated** rather than
 * padded, or "make it 4 bars" produces one bar of music and three of nothing.
 */
import { describe, it, expect } from "vitest";
import { sequencerReducer, createInitialSequencerState } from "../features/sequencer/useSequencerStore";
import { GENRES_MAP } from "../data/genres";
import type { SequencerState } from "../features/sequencer/useSequencerStore";

const genre = GENRES_MAP["future-bass"] || Object.values(GENRES_MAP)[0];

/** A state whose arrays are all 16 long, with a recognisable per-step pattern. */
function seeded(): SequencerState {
  const base = createInitialSequencerState(genre);
  const tracks = base.pattern.tracks.map((t, trackIdx) => ({
    ...t,
    steps: Array.from({ length: 16 }, (_, i) => ((i + trackIdx) % 4 === 0 ? 1 : 0)),
    velocity: Array.from({ length: 16 }, (_, i) => 60 + i),
    pitch: Array.from({ length: 16 }, (_, i) => 40 + i),
    gate: Array.from({ length: 16 }, (_, i) => 0.5 + i / 100),
    ratchet: Array.from({ length: 16 }, (_, i) => (i % 3) + 1),
    probability: Array.from({ length: 16 }, (_, i) => 50 + i),
  }));
  return { ...base, stepCount: 16, pattern: { ...base.pattern, totalSteps: 16, tracks } };
}

const PARALLEL_KEYS = ["steps", "velocity", "pitch", "gate", "ratchet", "probability"] as const;

describe("SET_STEP_COUNT grows by tiling, not by truncating", () => {
  it("reaches the requested length for every target, from a 16-step pattern", () => {
    for (const target of [16, 32, 64, 128]) {
      const next = sequencerReducer(seeded(), { type: "SET_STEP_COUNT", count: target });
      expect(next.stepCount).toBe(target);
      expect(next.pattern.totalSteps).toBe(target);
      for (const track of next.pattern.tracks) {
        for (const key of PARALLEL_KEYS) {
          expect((track[key] as unknown[]).length, `${key} at ${target} steps`).toBe(target);
        }
        expect(track.trackLength).toBe(target);
      }
    }
  });

  it("repeats the written pattern instead of padding with silence", () => {
    const state = seeded();
    const source = state.pattern.tracks[0];
    const next = sequencerReducer(state, { type: "SET_STEP_COUNT", count: 128 });
    const grown = next.pattern.tracks[0];
    // The six parallel arrays are all required to be `number[]` by this test's own seeding, but
    // the track type marks five of them optional, so read them through one widened view.
    const at = (track: typeof source) => track as unknown as Record<(typeof PARALLEL_KEYS)[number], number[]>;
    const src = at(source);
    const dst = at(grown);

    for (let i = 0; i < 128; i += 1) {
      const k = i % 16;
      expect(dst.steps[i], `steps[${i}]`).toBe(src.steps[k]);
      expect(dst.velocity[i], `velocity[${i}]`).toBe(src.velocity[k]);
      expect(dst.gate[i], `gate[${i}]`).toBeCloseTo(src.gate[k], 6);
      expect(dst.ratchet[i], `ratchet[${i}]`).toBe(src.ratchet[k]);
      expect(dst.probability[i], `probability[${i}]`).toBe(src.probability[k]);
    }
    // The old code left everything past index 31 at the default, so this is the assertion that
    // would have failed: the second bar must equal the first, not be empty.
    expect(dst.steps.slice(16, 32)).toEqual(src.steps);
    expect(dst.steps.slice(112, 128)).toEqual(src.steps);
  });

  it("still truncates cleanly when shrinking, keeping the front of the pattern", () => {
    const state = sequencerReducer(seeded(), { type: "SET_STEP_COUNT", count: 64 });
    const next = sequencerReducer(state, { type: "SET_STEP_COUNT", count: 16 });
    for (const track of next.pattern.tracks) {
      for (const key of PARALLEL_KEYS) {
        expect((track[key] as unknown[]).length).toBe(16);
      }
    }
    expect(next.pattern.tracks[0].velocity).toEqual(Array.from({ length: 16 }, (_, i) => 60 + i));
  });

  it("survives an empty source array without producing holes", () => {
    const base = seeded();
    const tracks = base.pattern.tracks.map((t) => ({ ...t, steps: [], velocity: [], pitch: [] }));
    const state: SequencerState = { ...base, pattern: { ...base.pattern, tracks } };
    const next = sequencerReducer(state, { type: "SET_STEP_COUNT", count: 8 });
    for (const track of next.pattern.tracks) {
      expect(track.steps).toHaveLength(8);
      expect(track.steps.every((v) => v === 0)).toBe(true);
      expect(track.velocity).toHaveLength(8);
    }
  });

  it("is a no-op on length when the count already matches", () => {
    const state = seeded();
    const next = sequencerReducer(state, { type: "SET_STEP_COUNT", count: 16 });
    expect(next.pattern.tracks[0].steps).toEqual(state.pattern.tracks[0].steps);
    expect(next.pattern.tracks[0].velocity).toEqual(state.pattern.tracks[0].velocity);
  });
});
