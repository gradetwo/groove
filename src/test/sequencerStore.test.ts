import { describe, it, expect } from "vitest";
import {
  sequencerReducer,
  createInitialSequencerState,
  clonePattern,
} from "../features/sequencer/useSequencerStore";
import { GENRES_MAP } from "../data/genres";

describe("Sequencer Store & Pure Immutable Reducer (P2-04)", () => {
  const testGenre = GENRES_MAP["future-bass"] || Object.values(GENRES_MAP)[0];

  it("initializes state correctly from genre", () => {
    const state = createInitialSequencerState(testGenre);
    expect(state.currentGenre.id).toBe(testGenre.id);
    expect(state.pattern.tracks.length).toBeGreaterThan(0);
    expect(state.bpm).toBe(testGenre.default_bpm || 140);
    expect(state.resolution).toBe("1/16");
  });

  it("SET_STEP updates only the target track and maintains object reference for other tracks (React.memo preservation)", () => {
    const state = createInitialSequencerState(testGenre);
    const initialTrack0 = state.pattern.tracks[0];
    const initialTrack1 = state.pattern.tracks[1];

    const nextState = sequencerReducer(state, {
      type: "SET_STEP",
      trackIdx: 0,
      stepIdx: 2,
      value: 1,
    });

    // Track 0 must be updated with the step
    expect(nextState.pattern.tracks[0].steps[2]).toBe(1);
    expect(nextState.pattern.tracks[0]).not.toBe(initialTrack0);

    // Track 1 must preserve EXACT object identity for React.memo
    expect(nextState.pattern.tracks[1]).toBe(initialTrack1);
  });

  it("SET_VELOCITY updates velocity and preserves other tracks", () => {
    const state = createInitialSequencerState(testGenre);
    const initialTrack0 = state.pattern.tracks[0];
    const initialTrack1 = state.pattern.tracks[1];

    const nextState = sequencerReducer(state, {
      type: "SET_VELOCITY",
      trackIdx: 1,
      stepIdx: 4,
      velocity: 127,
    });

    expect(nextState.pattern.tracks[1].velocity?.[4]).toBe(127);
    expect(nextState.pattern.tracks[0]).toBe(initialTrack0);
  });

  it("TOGGLE_MUTE toggles mute status on track directly", () => {
    const state = createInitialSequencerState(testGenre);
    const initialMute = Boolean(state.pattern.tracks[0].mute);

    const mutedState = sequencerReducer(state, {
      type: "TOGGLE_MUTE",
      trackIdx: 0,
    });
    expect(mutedState.pattern.tracks[0].mute).toBe(!initialMute);

    const unmutedState = sequencerReducer(mutedState, {
      type: "TOGGLE_MUTE",
      trackIdx: 0,
    });
    expect(unmutedState.pattern.tracks[0].mute).toBe(initialMute);
  });

  it("TOGGLE_SOLO toggles solo status on track directly", () => {
    const state = createInitialSequencerState(testGenre);
    const nextState = sequencerReducer(state, {
      type: "TOGGLE_SOLO",
      trackIdx: 2,
    });
    expect(nextState.pattern.tracks[2].solo).toBe(true);
  });

  it("SET_VOLUME clamps track volume", () => {
    const state = createInitialSequencerState(testGenre);
    const nextState = sequencerReducer(state, {
      type: "SET_VOLUME",
      trackIdx: 0,
      volume: 0.65,
    });
    expect(nextState.pattern.tracks[0].volume).toBe(0.65);
  });

  it("SHIFT_TRACK shifts steps forward and backward with wrap-around", () => {
    const state = createInitialSequencerState(testGenre);
    // Set a known step
    const withStep = sequencerReducer(state, {
      type: "SET_STEP",
      trackIdx: 0,
      stepIdx: 0,
      value: 1,
    });

    const shiftedRight = sequencerReducer(withStep, {
      type: "SHIFT_TRACK",
      trackIdx: 0,
      direction: 1,
    });
    expect(shiftedRight.pattern.tracks[0].steps[1]).toBe(1);
    expect(shiftedRight.pattern.tracks[0].steps[0]).toBe(0);

    const shiftedLeft = sequencerReducer(shiftedRight, {
      type: "SHIFT_TRACK",
      trackIdx: 0,
      direction: -1,
    });
    expect(shiftedLeft.pattern.tracks[0].steps[0]).toBe(1);
  });

  it("CLEAR_TRACK zeros out all steps of a track", () => {
    const state = createInitialSequencerState(testGenre);
    const cleared = sequencerReducer(state, {
      type: "CLEAR_TRACK",
      trackIdx: 0,
    });
    expect(cleared.pattern.tracks[0].steps.every((s) => s === 0)).toBe(true);
  });

  it("SMART_FILL_TRACK generates standard rhythms", () => {
    const state = createInitialSequencerState(testGenre);
    const filled = sequencerReducer(state, {
      type: "SMART_FILL_TRACK",
      trackIdx: 0,
    });
    expect(filled.pattern.tracks[0].steps.some((s) => s > 0)).toBe(true);
  });

  it("APPLY_EUCLIDEAN computes distributed rhythms", () => {
    const state = createInitialSequencerState(testGenre);
    const euclid = sequencerReducer(state, {
      type: "APPLY_EUCLIDEAN",
      trackIdx: 0,
      hits: 4,
      offset: 0,
    });
    const activeSteps = euclid.pattern.tracks[0].steps.filter((s) => s > 0).length;
    expect(activeSteps).toBe(4);
  });

  it("clonePattern performs a fast deep clone without JSON.parse", () => {
    const original = testGenre.sequencer_pattern;
    const cloned = clonePattern(original);
    expect(cloned).not.toBe(original);
    expect(cloned.tracks[0]).not.toBe(original.tracks[0]);
    expect(cloned.tracks[0].steps).toEqual(original.tracks[0].steps);
  });
});
