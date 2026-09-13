import { useReducer, useCallback, useRef, useEffect } from "react";
import { Genre, SequencerPattern, SequencerTrack } from "../../types/genre";
import { ChordDefinition, noteToMidi } from "../../utils/chordTheory";
import { BakedArpeggioResult } from "../../utils/arpeggiatorTheory";
import {
  debounceSaveProject,
  loadSavedProject,
  clearSavedProject,
} from "./projectStorage";

export interface StudioHistorySnapshot {
  pattern: SequencerPattern;
  bpm: number;
  swing: number;
  timeSignature: string;
  resolution: "1/8" | "1/16" | "1/32";
  patterns?: {
    A: SequencerPattern;
    B: SequencerPattern;
  };
  activeSlot?: "A" | "B";
}

export interface SequencerState {
  currentGenre: Genre;
  pattern: SequencerPattern;
  patterns: {
    A: SequencerPattern;
    B: SequencerPattern;
  };
  activeSlot: "A" | "B";
  songMode: boolean;
  songChain: ("A" | "B")[];
  blindTestMode: boolean;
  bpm: number;
  swing: number;
  timeSignature: string;
  resolution: "1/8" | "1/16" | "1/32";
  stepCount: number;
  loopRange: [number, number] | null;
  isMetronome: boolean;
  isCountIn: boolean;
  parameterDimension: "velocity" | "probability" | "ratchet" | "gate";
  canUndo: boolean;
  canRedo: boolean;
}

export type SequencerAction =
  | { type: "SET_GENRE"; genre: Genre; resetPattern?: boolean }
  | { type: "COMMIT_PATTERN"; pattern: SequencerPattern; recordHistory?: boolean }
  | { type: "SET_STEP"; trackIdx: number; stepIdx: number; value: number }
  | { type: "SET_VELOCITY"; trackIdx: number; stepIdx: number; velocity: number }
  | { type: "BATCH_SET_VELOCITY"; trackIdx: number; velocities: number[] }
  | { type: "SET_PITCH"; trackIdx: number; stepIdx: number; pitch: number | null }
  | { type: "BATCH_SET_PITCH"; trackIdx: number; pitches: (number | null)[] }
  | { type: "SET_SCALE"; scale: string }
  | { type: "SET_RATCHET"; trackIdx: number; stepIdx: number; ratchet: number }
  | { type: "BATCH_SET_RATCHET"; trackIdx: number; ratchets: number[] }
  | { type: "SET_PROBABILITY"; trackIdx: number; stepIdx: number; probability: number }
  | { type: "BATCH_SET_PROBABILITY"; trackIdx: number; probabilities: number[] }
  | { type: "SET_GATE"; trackIdx: number; stepIdx: number; gate: number }
  | { type: "BATCH_SET_GATE"; trackIdx: number; gates: number[] }
  | { type: "SET_TRACK_PAN"; trackIdx: number; pan: number }
  | { type: "SET_TRACK_SWING"; trackIdx: number; swing: number }
  | { type: "SET_TRACK_SENDS"; trackIdx: number; sendA?: number; sendB?: number }
  | { type: "SET_TRACK_INSTRUMENT"; trackIdx: number; instrument: string }
  | { type: "REORDER_TRACKS"; fromIndex: number; toIndex: number }
  | { type: "TOGGLE_MUTE"; trackIdx: number }
  | { type: "TOGGLE_SOLO"; trackIdx: number }
  | { type: "SET_VOLUME"; trackIdx: number; volume: number }
  | { type: "SET_TRACK_LENGTH"; trackIdx: number; length: number }
  | { type: "CLEAR_TRACK"; trackIdx: number }
  | { type: "SHIFT_TRACK"; trackIdx: number; direction: -1 | 1 }
  | { type: "SMART_FILL_TRACK"; trackIdx: number }
  | { type: "APPLY_EUCLIDEAN"; trackIdx: number; hits: number; offset: number }
  | { type: "SET_BPM"; bpm: number }
  | { type: "SET_SWING"; swing: number }
  | { type: "SET_TIME_SIGNATURE"; timeSignature: string; targetSteps?: number }
  | { type: "SET_RESOLUTION"; resolution: "1/8" | "1/16" | "1/32" }
  | { type: "SET_STEP_COUNT"; count: number }
  | { type: "LOAD_CHORDS"; chords: ChordDefinition[] }
  | { type: "LOAD_ARPEGGIATED_SEQUENCE"; baked: BakedArpeggioResult }
  | { type: "LOAD_MASTERCLASS_PATTERN"; pattern: SequencerPattern; bpm?: number; timeSignature?: string }
  | { type: "SWITCH_PATTERN_SLOT"; slot: "A" | "B" }
  | { type: "COPY_PATTERN_SLOT"; from: "A" | "B"; to: "A" | "B" }
  | { type: "TOGGLE_SONG_MODE" }
  | { type: "SET_SONG_CHAIN"; chain: ("A" | "B")[] }
  | { type: "TOGGLE_BLIND_TEST" }
  | { type: "SET_LOOP_RANGE"; range: [number, number] | null }
  | { type: "SET_METRONOME"; enabled: boolean }
  | { type: "SET_COUNT_IN"; enabled: boolean }
  | { type: "SET_PARAMETER_DIMENSION"; dimension: "velocity" | "probability" | "ratchet" | "gate" }
  | { type: "RESET_TO_GENRE_DEFAULT" }
  | { type: "RESTORE_SNAPSHOT"; snapshot: StudioHistorySnapshot };

/**
 * Pure clone helper for a single track without JSON.parse
 */
function cloneTrack(track: SequencerTrack): SequencerTrack {
  return {
    ...track,
    steps: [...track.steps],
    velocity: track.velocity ? [...track.velocity] : undefined,
    pitch: track.pitch ? [...track.pitch] : undefined,
    gate: track.gate ? [...track.gate] : undefined,
    ratchet: track.ratchet ? [...track.ratchet] : undefined,
    probability: track.probability ? [...track.probability] : undefined,
    pan: track.pan,
    swing: track.swing,
    sendA: track.sendA,
    sendB: track.sendB,
    instrument: track.instrument,
  };
}

/**
 * Deep clone of a pattern without using JSON.parse(JSON.stringify())
 */
export function clonePattern(pattern: SequencerPattern): SequencerPattern {
  return {
    ...pattern,
    tracks: pattern.tracks.map(cloneTrack),
  };
}

function updateTrack(
  tracks: SequencerTrack[],
  trackIdx: number,
  updater: (track: SequencerTrack) => SequencerTrack
): SequencerTrack[] {
  return tracks.map((t, idx) => (idx === trackIdx ? updater(cloneTrack(t)) : t));
}

export function createInitialSequencerState(genre: Genre): SequencerState {
  const saved = loadSavedProject();
  const patternA = clonePattern(genre.sequencer_pattern);
  const patternB = clonePattern(genre.sequencer_pattern);

  if (saved && saved.genreId === genre.id) {
    const activeSlot = saved.activeSlot || "A";
    const currentPattern = activeSlot === "B" ? clonePattern(saved.patterns.B) : clonePattern(saved.patterns.A);
    return {
      currentGenre: genre,
      pattern: currentPattern,
      patterns: {
        A: clonePattern(saved.patterns.A),
        B: clonePattern(saved.patterns.B),
      },
      activeSlot,
      songMode: saved.songMode || false,
      songChain: saved.songChain || ["A", "B"],
      blindTestMode: false,
      bpm: saved.bpm || genre.default_bpm || 120,
      swing: saved.swing || 0,
      timeSignature: saved.timeSignature || genre.time_signature || "4/4",
      resolution: saved.resolution || "1/16",
      stepCount: saved.stepCount || 16,
      loopRange: saved.loopRange || null,
      isMetronome: saved.isMetronome || false,
      isCountIn: saved.isCountIn || false,
      parameterDimension: "velocity",
      canUndo: false,
      canRedo: false,
    };
  }

  const stepCount = patternA.tracks[0]?.steps?.length || 16;
  return {
    currentGenre: genre,
    pattern: patternA,
    patterns: {
      A: patternA,
      B: patternB,
    },
    activeSlot: "A",
    songMode: false,
    songChain: ["A", "B"],
    blindTestMode: false,
    bpm: genre.default_bpm || 140,
    swing: patternA.swing || 0,
    timeSignature: genre.time_signature || "4/4",
    resolution: "1/16",
    stepCount,
    loopRange: null,
    isMetronome: false,
    isCountIn: false,
    parameterDimension: "velocity",
    canUndo: false,
    canRedo: false,
  };
}

export function sequencerReducer(state: SequencerState, action: SequencerAction): SequencerState {
  // Helper to update active pattern while keeping patterns[activeSlot] in sync
  const withUpdatedPattern = (nextPattern: SequencerPattern): SequencerState => {
    return {
      ...state,
      pattern: nextPattern,
      patterns: {
        ...state.patterns,
        [state.activeSlot]: nextPattern,
      },
    };
  };

  switch (action.type) {
    case "SET_GENRE": {
      const g = action.genre;
      const patternA = clonePattern(g.sequencer_pattern);
      const patternB = clonePattern(g.sequencer_pattern);
      const stepCount = patternA.tracks[0]?.steps?.length || 16;
      return {
        ...state,
        currentGenre: g,
        pattern: patternA,
        patterns: {
          A: patternA,
          B: patternB,
        },
        activeSlot: "A",
        bpm: g.default_bpm || 120,
        swing: patternA.swing || 0,
        timeSignature: g.time_signature || "4/4",
        resolution: "1/16",
        stepCount,
      };
    }

    case "RESET_TO_GENRE_DEFAULT": {
      clearSavedProject();
      const patternA = clonePattern(state.currentGenre.sequencer_pattern);
      const patternB = clonePattern(state.currentGenre.sequencer_pattern);
      const stepCount = patternA.tracks[0]?.steps?.length || 16;
      return {
        ...state,
        pattern: patternA,
        patterns: {
          A: patternA,
          B: patternB,
        },
        activeSlot: "A",
        bpm: state.currentGenre.default_bpm || 120,
        swing: patternA.swing || 0,
        timeSignature: state.currentGenre.time_signature || "4/4",
        resolution: "1/16",
        stepCount,
        loopRange: null,
      };
    }

    case "SWITCH_PATTERN_SLOT": {
      if (action.slot === state.activeSlot) return state;
      const updatedPatterns = {
        ...state.patterns,
        [state.activeSlot]: state.pattern,
      };
      const nextPattern = clonePattern(updatedPatterns[action.slot]);
      const stepCount = nextPattern.tracks[0]?.steps?.length || state.stepCount;
      return {
        ...state,
        patterns: updatedPatterns,
        activeSlot: action.slot,
        pattern: nextPattern,
        stepCount,
      };
    }

    case "COPY_PATTERN_SLOT": {
      const sourcePattern = clonePattern(action.from === state.activeSlot ? state.pattern : state.patterns[action.from]);
      const updatedPatterns = {
        ...state.patterns,
        [action.to]: sourcePattern,
      };
      if (action.to === state.activeSlot) {
        return {
          ...state,
          patterns: updatedPatterns,
          pattern: sourcePattern,
        };
      }
      return {
        ...state,
        patterns: updatedPatterns,
      };
    }

    case "TOGGLE_SONG_MODE":
      return { ...state, songMode: !state.songMode };

    case "SET_SONG_CHAIN":
      return { ...state, songChain: [...action.chain] };

    case "TOGGLE_BLIND_TEST":
      return { ...state, blindTestMode: !state.blindTestMode };

    case "COMMIT_PATTERN": {
      const stepCount = action.pattern.tracks[0]?.steps?.length || state.stepCount;
      return {
        ...withUpdatedPattern(action.pattern),
        stepCount,
      };
    }

    case "SET_STEP": {
      const tracks = updateTrack(state.pattern.tracks, action.trackIdx, (t) => {
        const steps = [...t.steps];
        steps[action.stepIdx] = action.value;
        const velocity = t.velocity ? [...t.velocity] : Array(steps.length).fill(100);
        if (action.value > 0 && !velocity[action.stepIdx]) {
          velocity[action.stepIdx] = 100;
        }
        return { ...t, steps, velocity };
      });
      return withUpdatedPattern({ ...state.pattern, tracks });
    }

    case "SET_VELOCITY": {
      const tracks = updateTrack(state.pattern.tracks, action.trackIdx, (t) => {
        const velocity = t.velocity ? [...t.velocity] : Array(t.steps.length).fill(100);
        velocity[action.stepIdx] = action.velocity;
        return { ...t, velocity };
      });
      return withUpdatedPattern({ ...state.pattern, tracks });
    }

    case "BATCH_SET_VELOCITY": {
      const tracks = updateTrack(state.pattern.tracks, action.trackIdx, (t) => ({
        ...t,
        velocity: [...action.velocities],
      }));
      return withUpdatedPattern({ ...state.pattern, tracks });
    }

    case "SET_GATE": {
      const tracks = updateTrack(state.pattern.tracks, action.trackIdx, (t) => {
        const gate = t.gate ? [...t.gate] : Array(t.steps.length).fill(0.8);
        gate[action.stepIdx] = action.gate;
        return { ...t, gate };
      });
      return withUpdatedPattern({ ...state.pattern, tracks });
    }

    case "BATCH_SET_GATE": {
      const tracks = updateTrack(state.pattern.tracks, action.trackIdx, (t) => ({
        ...t,
        gate: [...action.gates],
      }));
      return withUpdatedPattern({ ...state.pattern, tracks });
    }

    case "SET_TRACK_PAN": {
      const tracks = updateTrack(state.pattern.tracks, action.trackIdx, (t) => ({
        ...t,
        pan: action.pan,
      }));
      return withUpdatedPattern({ ...state.pattern, tracks });
    }

    case "SET_TRACK_SWING": {
      const tracks = updateTrack(state.pattern.tracks, action.trackIdx, (t) => ({
        ...t,
        swing: action.swing,
      }));
      return withUpdatedPattern({ ...state.pattern, tracks });
    }

    case "SET_TRACK_SENDS": {
      const tracks = updateTrack(state.pattern.tracks, action.trackIdx, (t) => ({
        ...t,
        sendA: action.sendA !== undefined ? action.sendA : t.sendA,
        sendB: action.sendB !== undefined ? action.sendB : t.sendB,
      }));
      return withUpdatedPattern({ ...state.pattern, tracks });
    }

    case "SET_TRACK_INSTRUMENT": {
      const tracks = updateTrack(state.pattern.tracks, action.trackIdx, (t) => ({
        ...t,
        instrument: action.instrument,
      }));
      return withUpdatedPattern({ ...state.pattern, tracks });
    }

    case "REORDER_TRACKS": {
      const { fromIndex, toIndex } = action;
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return state;
      const tracks = [...state.pattern.tracks];
      const [moved] = tracks.splice(fromIndex, 1);
      if (!moved) return state;
      tracks.splice(toIndex, 0, moved);
      return withUpdatedPattern({ ...state.pattern, tracks });
    }

    case "SET_PITCH": {
      const tracks = updateTrack(state.pattern.tracks, action.trackIdx, (t) => {
        const pitch = t.pitch ? [...t.pitch] : Array(t.steps.length).fill(null);
        pitch[action.stepIdx] = action.pitch;
        return { ...t, pitch };
      });
      return withUpdatedPattern({ ...state.pattern, tracks });
    }

    case "BATCH_SET_PITCH": {
      const tracks = updateTrack(state.pattern.tracks, action.trackIdx, (t) => ({
        ...t,
        pitch: [...action.pitches],
      }));
      return withUpdatedPattern({ ...state.pattern, tracks });
    }

    case "SET_SCALE": {
      return withUpdatedPattern({ ...state.pattern, scale: action.scale });
    }

    case "SET_RATCHET": {
      const tracks = updateTrack(state.pattern.tracks, action.trackIdx, (t) => {
        const ratchet = t.ratchet ? [...t.ratchet] : Array(t.steps.length).fill(1);
        ratchet[action.stepIdx] = action.ratchet;
        return { ...t, ratchet };
      });
      return withUpdatedPattern({ ...state.pattern, tracks });
    }

    case "BATCH_SET_RATCHET": {
      const tracks = updateTrack(state.pattern.tracks, action.trackIdx, (t) => ({
        ...t,
        ratchet: [...action.ratchets],
      }));
      return withUpdatedPattern({ ...state.pattern, tracks });
    }

    case "SET_PROBABILITY": {
      const tracks = updateTrack(state.pattern.tracks, action.trackIdx, (t) => {
        const probability = t.probability ? [...t.probability] : Array(t.steps.length).fill(100);
        probability[action.stepIdx] = action.probability;
        return { ...t, probability };
      });
      return withUpdatedPattern({ ...state.pattern, tracks });
    }

    case "BATCH_SET_PROBABILITY": {
      const tracks = updateTrack(state.pattern.tracks, action.trackIdx, (t) => ({
        ...t,
        probability: [...action.probabilities],
      }));
      return withUpdatedPattern({ ...state.pattern, tracks });
    }

    case "TOGGLE_MUTE": {
      const tracks = updateTrack(state.pattern.tracks, action.trackIdx, (t) => ({
        ...t,
        mute: !t.mute,
      }));
      return withUpdatedPattern({ ...state.pattern, tracks });
    }

    case "TOGGLE_SOLO": {
      const tracks = updateTrack(state.pattern.tracks, action.trackIdx, (t) => ({
        ...t,
        solo: !t.solo,
      }));
      return withUpdatedPattern({ ...state.pattern, tracks });
    }

    case "SET_VOLUME": {
      const tracks = updateTrack(state.pattern.tracks, action.trackIdx, (t) => ({
        ...t,
        volume: action.volume,
      }));
      return withUpdatedPattern({ ...state.pattern, tracks });
    }

    case "SET_TRACK_LENGTH": {
      const tracks = updateTrack(state.pattern.tracks, action.trackIdx, (t) => ({
        ...t,
        trackLength: action.length,
      }));
      return withUpdatedPattern({ ...state.pattern, tracks });
    }

    case "CLEAR_TRACK": {
      const tracks = updateTrack(state.pattern.tracks, action.trackIdx, (t) => ({
        ...t,
        steps: Array(t.steps.length).fill(0),
      }));
      return withUpdatedPattern({ ...state.pattern, tracks });
    }

    case "SHIFT_TRACK": {
      const dir = action.direction;
      const tracks = updateTrack(state.pattern.tracks, action.trackIdx, (t) => {
        const len = t.steps.length;
        const shiftArr = <T>(arr?: T[]): T[] | undefined => {
          if (!arr) return undefined;
          if (dir === 1) {
            return [arr[len - 1], ...arr.slice(0, len - 1)];
          } else {
            return [...arr.slice(1), arr[0]];
          }
        };
        return {
          ...t,
          steps: shiftArr(t.steps)!,
          velocity: shiftArr(t.velocity),
          pitch: shiftArr(t.pitch),
          gate: shiftArr(t.gate),
          ratchet: shiftArr(t.ratchet),
          probability: shiftArr(t.probability),
        };
      });
      return withUpdatedPattern({ ...state.pattern, tracks });
    }

    case "SMART_FILL_TRACK": {
      const tracks = updateTrack(state.pattern.tracks, action.trackIdx, (t) => {
        const id = t.track_id.toLowerCase();
        const name = t.name.toLowerCase();
        const len = t.steps.length;
        const steps = Array(len).fill(0);
        const velocity = Array(len).fill(100);

        if (id.includes("kick") || name.includes("kick")) {
          for (let i = 0; i < len; i += 4) {
            steps[i] = 1;
            velocity[i] = 115;
          }
        } else if (id.includes("snare") || name.includes("snare") || name.includes("clap")) {
          for (let i = 4; i < len; i += 8) {
            steps[i] = 1;
            velocity[i] = 110;
          }
        } else if (id.includes("hat") || name.includes("hat")) {
          for (let i = 2; i < len; i += 4) {
            steps[i] = 1;
            velocity[i] = 95;
          }
        } else {
          for (let i = 0; i < len; i += 8) {
            steps[i] = 1;
            velocity[i] = 100;
          }
        }

        return { ...t, steps, velocity };
      });
      return withUpdatedPattern({ ...state.pattern, tracks });
    }

    case "APPLY_EUCLIDEAN": {
      const { trackIdx, hits, offset } = action;
      const tracks = updateTrack(state.pattern.tracks, trackIdx, (t) => {
        const len = t.steps.length;
        const k = Math.min(hits, len);
        const rawSteps = Array(len).fill(0);

        if (k > 0) {
          let bucket = 0;
          for (let i = 0; i < len; i++) {
            bucket += k;
            if (bucket >= len) {
              bucket -= len;
              rawSteps[i] = 1;
            }
          }
        }

        const steps = Array(len).fill(0);
        for (let i = 0; i < len; i++) {
          const targetIdx = (i + offset + len) % len;
          steps[targetIdx] = rawSteps[i];
        }

        const velocity = t.velocity ? [...t.velocity] : Array(len).fill(100);
        steps.forEach((s, idx) => {
          if (s > 0 && (!velocity[idx] || velocity[idx] < 60)) {
            velocity[idx] = 105;
          }
        });

        return { ...t, steps, velocity };
      });
      return withUpdatedPattern({ ...state.pattern, tracks });
    }

    case "SET_BPM":
      return { ...state, bpm: Math.max(40, Math.min(240, action.bpm)) };

    case "SET_SWING":
      return { ...state, swing: Math.max(0, Math.min(75, action.swing)) };

    case "SET_TIME_SIGNATURE": {
      const targetSteps = action.targetSteps || state.stepCount;
      const tracks = state.pattern.tracks.map((t) => {
        let steps = [...t.steps];
        if (targetSteps > steps.length) {
          const diff = targetSteps - steps.length;
          steps = [...steps, ...Array(diff).fill(0)];
        } else if (targetSteps < steps.length) {
          steps = steps.slice(0, targetSteps);
        }
        return {
          ...t,
          steps,
          trackLength: targetSteps,
        };
      });
      const nextPattern = { ...state.pattern, tracks, totalSteps: targetSteps };
      return {
        ...withUpdatedPattern(nextPattern),
        timeSignature: action.timeSignature,
        stepCount: targetSteps,
      };
    }

    case "SET_RESOLUTION":
      return { ...state, resolution: action.resolution };

    case "SET_STEP_COUNT": {
      const targetSteps = action.count;
      const tracks = state.pattern.tracks.map((t) => {
        let steps = [...t.steps];
        let velocity = t.velocity ? [...t.velocity] : Array(steps.length).fill(100);
        let pitch = t.pitch ? [...t.pitch] : Array(steps.length).fill(null);
        let gate = t.gate ? [...t.gate] : Array(steps.length).fill(0.8);
        let ratchet = t.ratchet ? [...t.ratchet] : Array(steps.length).fill(1);
        let probability = t.probability ? [...t.probability] : Array(steps.length).fill(100);

        if (targetSteps > steps.length) {
          const diff = targetSteps - steps.length;
          steps = [...steps, ...steps.slice(0, diff)];
          velocity = [...velocity, ...velocity.slice(0, diff)];
          pitch = [...pitch, ...pitch.slice(0, diff)];
          gate = [...gate, ...gate.slice(0, diff)];
          ratchet = [...ratchet, ...ratchet.slice(0, diff)];
          probability = [...probability, ...probability.slice(0, diff)];
        } else if (targetSteps < steps.length) {
          steps = steps.slice(0, targetSteps);
          velocity = velocity.slice(0, targetSteps);
          pitch = pitch.slice(0, targetSteps);
          gate = gate.slice(0, targetSteps);
          ratchet = ratchet.slice(0, targetSteps);
          probability = probability.slice(0, targetSteps);
        }

        return {
          ...t,
          steps,
          velocity,
          pitch,
          gate,
          ratchet,
          probability,
          trackLength: targetSteps,
        };
      });
      const nextPattern = { ...state.pattern, tracks, totalSteps: targetSteps };
      return {
        ...withUpdatedPattern(nextPattern),
        stepCount: targetSteps,
      };
    }

    case "LOAD_CHORDS": {
      const chords = action.chords;
      if (chords.length === 0) return state;

      let chordTrackIdx = state.pattern.tracks.findIndex(
        (t) => t.track_id === "chords" || t.name.toLowerCase().includes("chord")
      );
      if (chordTrackIdx === -1 && state.pattern.tracks.length > 0) {
        chordTrackIdx = state.pattern.tracks.length - 1;
      }
      if (chordTrackIdx === -1) return state;

      const tracks = updateTrack(state.pattern.tracks, chordTrackIdx, (t) => {
        const total = t.steps.length;
        const steps = Array(total).fill(0);
        const pitch = Array(total).fill(null);
        const velocity = Array(total).fill(100);

        const chordCount = chords.length;
        const stepInterval = Math.max(1, Math.floor(total / chordCount));

        chords.forEach((chordDef, idx) => {
          const stepPos = idx * stepInterval;
          if (stepPos < total) {
            steps[stepPos] = 1;
            pitch[stepPos] = noteToMidi(chordDef.root, 4);
            velocity[stepPos] = 105;
          }
        });

        return { ...t, steps, pitch, velocity };
      });

      return withUpdatedPattern({ ...state.pattern, tracks });
    }

    case "LOAD_ARPEGGIATED_SEQUENCE": {
      const { baked } = action;
      if (!baked || baked.steps.length === 0) return state;

      const targetId = baked.targetTrackId || "lead";
      let targetTrackIdx = state.pattern.tracks.findIndex(
        (t) => t.track_id === targetId || t.name.toLowerCase().includes(targetId)
      );
      if (targetTrackIdx === -1) {
        targetTrackIdx = state.pattern.tracks.findIndex(
          (t) => t.track_id === "lead" || t.track_id === "chords" || t.name.toLowerCase().includes("synth")
        );
      }
      if (targetTrackIdx === -1 && state.pattern.tracks.length > 0) {
        targetTrackIdx = state.pattern.tracks.length - 1;
      }
      if (targetTrackIdx === -1) return state;

      const tracks = updateTrack(state.pattern.tracks, targetTrackIdx, (t) => {
        const total = t.steps.length;
        const steps = Array(total).fill(0);
        const pitch = Array(total).fill(null);
        const velocity = Array(total).fill(100);

        for (let i = 0; i < total; i++) {
          const srcIdx = i % baked.steps.length;
          steps[i] = baked.steps[srcIdx];
          pitch[i] = baked.pitches[srcIdx];
          velocity[i] = baked.velocities[srcIdx] ?? 105;
        }

        return { ...t, steps, pitch, velocity };
      });

      return withUpdatedPattern({ ...state.pattern, tracks });
    }

    case "LOAD_MASTERCLASS_PATTERN": {
      const stepCount = action.pattern.tracks[0]?.steps?.length || state.stepCount;
      const bpm = action.bpm || action.pattern.bpm || state.bpm;
      const swing = action.pattern.swing !== undefined ? action.pattern.swing : state.swing;
      const timeSignature = action.timeSignature || action.pattern.timeSignature || state.timeSignature;
      return {
        ...withUpdatedPattern(action.pattern),
        bpm,
        swing,
        timeSignature,
        stepCount,
      };
    }

    case "SET_LOOP_RANGE":
      return { ...state, loopRange: action.range };

    case "SET_METRONOME":
      return { ...state, isMetronome: action.enabled };

    case "SET_COUNT_IN":
      return { ...state, isCountIn: action.enabled };

    case "SET_PARAMETER_DIMENSION":
      return { ...state, parameterDimension: action.dimension };

    case "RESTORE_SNAPSHOT": {
      const s = action.snapshot;
      const restoredPattern = clonePattern(s.pattern);
      return {
        ...state,
        pattern: restoredPattern,
        patterns: s.patterns ? {
          A: clonePattern(s.patterns.A),
          B: clonePattern(s.patterns.B),
        } : {
          ...state.patterns,
          [state.activeSlot]: restoredPattern,
        },
        activeSlot: s.activeSlot || state.activeSlot,
        bpm: s.bpm,
        swing: s.swing,
        timeSignature: s.timeSignature,
        resolution: s.resolution,
        stepCount: s.pattern.tracks[0]?.steps?.length || state.stepCount,
      };
    }

    default:
      return state;
  }
}

export function useSequencerStore(initialGenre: Genre) {
  const [state, dispatch] = useReducer(sequencerReducer, initialGenre, createInitialSequencerState);

  const historyRef = useRef<StudioHistorySnapshot[]>([]);
  const futureRef = useRef<StudioHistorySnapshot[]>([]);

  // Debounced auto-save project on state change (P3-04)
  useEffect(() => {
    debounceSaveProject({
      genreId: state.currentGenre.id,
      bpm: state.bpm,
      swing: state.swing,
      timeSignature: state.timeSignature,
      resolution: state.resolution,
      stepCount: state.stepCount,
      patterns: {
        A: state.activeSlot === "A" ? state.pattern : state.patterns.A,
        B: state.activeSlot === "B" ? state.pattern : state.patterns.B,
      },
      activeSlot: state.activeSlot,
      songMode: state.songMode,
      songChain: state.songChain,
      loopRange: state.loopRange,
      isMetronome: state.isMetronome,
      isCountIn: state.isCountIn,
    });
  }, [state]);

  const createSnapshot = useCallback(
    (overridePattern?: SequencerPattern): StudioHistorySnapshot => ({
      pattern: clonePattern(overridePattern || state.pattern),
      bpm: state.bpm,
      swing: state.swing,
      timeSignature: state.timeSignature,
      resolution: state.resolution,
      patterns: {
        A: clonePattern(state.patterns.A),
        B: clonePattern(state.patterns.B),
      },
      activeSlot: state.activeSlot,
    }),
    [state]
  );

  const commit = useCallback(
    (action: SequencerAction, recordHistory = true) => {
      if (recordHistory) {
        historyRef.current.push(createSnapshot());
        if (historyRef.current.length > 50) {
          historyRef.current.shift();
        }
        futureRef.current = [];
      }
      dispatch(action);
    },
    [createSnapshot]
  );

  const undo = useCallback((): StudioHistorySnapshot | null => {
    if (historyRef.current.length === 0) return null;
    const prev = historyRef.current.pop()!;
    futureRef.current.push(createSnapshot());
    dispatch({ type: "RESTORE_SNAPSHOT", snapshot: prev });
    return prev;
  }, [createSnapshot]);

  const redo = useCallback((): StudioHistorySnapshot | null => {
    if (futureRef.current.length === 0) return null;
    const next = futureRef.current.pop()!;
    historyRef.current.push(createSnapshot());
    dispatch({ type: "RESTORE_SNAPSHOT", snapshot: next });
    return next;
  }, [createSnapshot]);

  const canUndo = historyRef.current.length > 0;
  const canRedo = futureRef.current.length > 0;

  return {
    state,
    dispatch,
    commit,
    undo,
    redo,
    canUndo,
    canRedo,
    createSnapshot,
  };
}
