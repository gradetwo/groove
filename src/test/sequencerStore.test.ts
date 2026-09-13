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

  describe("Phase 3 Sequencer Store Enhancements (P3-01, P3-02, P3-03, P3-07, P3-08)", () => {
    it("handles Pattern A/B slot switching and copying", () => {
      const state = createInitialSequencerState(testGenre);
      expect(state.activeSlot).toBe("A");

      // Edit pattern in slot A
      const editedA = sequencerReducer(state, {
        type: "SET_STEP",
        trackIdx: 0,
        stepIdx: 0,
        value: 1,
      });
      expect(editedA.pattern.tracks[0].steps[0]).toBe(1);

      // Copy A to B
      const copiedToB = sequencerReducer(editedA, {
        type: "COPY_PATTERN_SLOT",
        from: "A",
        to: "B",
      });
      expect(copiedToB.patterns.B.tracks[0].steps[0]).toBe(1);

      // Switch to slot B
      const switchedToB = sequencerReducer(copiedToB, {
        type: "SWITCH_PATTERN_SLOT",
        slot: "B",
      });
      expect(switchedToB.activeSlot).toBe("B");
      expect(switchedToB.pattern.tracks[0].steps[0]).toBe(1);

      // Modify B: clear step 0
      const modifiedB = sequencerReducer(switchedToB, {
        type: "SET_STEP",
        trackIdx: 0,
        stepIdx: 0,
        value: 0,
      });
      expect(modifiedB.pattern.tracks[0].steps[0]).toBe(0);

      // Switch back to A: slot A still has step 0 === 1
      const switchedBackToA = sequencerReducer(modifiedB, {
        type: "SWITCH_PATTERN_SLOT",
        slot: "A",
      });
      expect(switchedBackToA.activeSlot).toBe("A");
      expect(switchedBackToA.pattern.tracks[0].steps[0]).toBe(1);
    });

    it("handles Gate parameter editing (P3-01)", () => {
      const state = createInitialSequencerState(testGenre);
      const withGate = sequencerReducer(state, {
        type: "SET_GATE",
        trackIdx: 0,
        stepIdx: 2,
        gate: 1.5,
      });
      expect(withGate.pattern.tracks[0].gate?.[2]).toBe(1.5);

      const withBatchGates = sequencerReducer(withGate, {
        type: "BATCH_SET_GATE",
        trackIdx: 0,
        gates: Array(16).fill(0.6),
      });
      expect(withBatchGates.pattern.tracks[0].gate?.[0]).toBe(0.6);
      expect(withBatchGates.pattern.tracks[0].gate?.[15]).toBe(0.6);
    });

    it("handles Track Pan, Swing offset, Sends, and Instrument (P3-08)", () => {
      const state = createInitialSequencerState(testGenre);
      const withPan = sequencerReducer(state, {
        type: "SET_TRACK_PAN",
        trackIdx: 1,
        pan: -0.6,
      });
      expect(withPan.pattern.tracks[1].pan).toBe(-0.6);

      const withSwing = sequencerReducer(withPan, {
        type: "SET_TRACK_SWING",
        trackIdx: 1,
        swing: 15,
      });
      expect(withSwing.pattern.tracks[1].swing).toBe(15);

      const withSends = sequencerReducer(withSwing, {
        type: "SET_TRACK_SENDS",
        trackIdx: 1,
        sendA: 0.4,
        sendB: 0.25,
      });
      expect(withSends.pattern.tracks[1].sendA).toBe(0.4);
      expect(withSends.pattern.tracks[1].sendB).toBe(0.25);

      const withInstrument = sequencerReducer(withSends, {
        type: "SET_TRACK_INSTRUMENT",
        trackIdx: 1,
        instrument: "analog_snare_v2",
      });
      expect(withInstrument.pattern.tracks[1].instrument).toBe("analog_snare_v2");
    });

    it("reorders tracks cleanly without losing data (P3-08)", () => {
      const state = createInitialSequencerState(testGenre);
      const track0Name = state.pattern.tracks[0].name;
      const track1Name = state.pattern.tracks[1].name;

      const reordered = sequencerReducer(state, {
        type: "REORDER_TRACKS",
        fromIndex: 0,
        toIndex: 1,
      });

      expect(reordered.pattern.tracks[0].name).toBe(track1Name);
      expect(reordered.pattern.tracks[1].name).toBe(track0Name);
    });

    it("configures loop range, song mode, and parameter dimensions (P3-02, P3-03, P3-07)", () => {
      const state = createInitialSequencerState(testGenre);

      const withLoop = sequencerReducer(state, {
        type: "SET_LOOP_RANGE",
        range: [0, 8],
      });
      expect(withLoop.loopRange).toEqual([0, 8]);

      const withSongMode = sequencerReducer(withLoop, {
        type: "TOGGLE_SONG_MODE",
      });
      expect(withSongMode.songMode).toBe(true);

      const withChain = sequencerReducer(withSongMode, {
        type: "SET_SONG_CHAIN",
        chain: ["A", "A", "B", "B"],
      });
      expect(withChain.songChain).toEqual(["A", "A", "B", "B"]);

      const withDim = sequencerReducer(withChain, {
        type: "SET_PARAMETER_DIMENSION",
        dimension: "gate",
      });
      expect(withDim.parameterDimension).toBe("gate");
    });

    it("handles BATCH_SET_PITCH and SET_SCALE for scale-locked matrix (P6-02)", () => {
      const state = createInitialSequencerState(testGenre);

      const withScale = sequencerReducer(state, {
        type: "SET_SCALE",
        scale: "D dorian",
      });
      expect(withScale.pattern.scale).toBe("D dorian");

      const pitches = [38, 40, null, 43, 45, null, 48, 50];
      const withPitches = sequencerReducer(withScale, {
        type: "BATCH_SET_PITCH",
        trackIdx: 4, // Bass track
        pitches,
      });

      expect(withPitches.pattern.tracks[4].pitch).toEqual(pitches);
      // Other tracks reference preserved
      expect(withPitches.pattern.tracks[0]).toBe(state.pattern.tracks[0]);
    });
  });
});
