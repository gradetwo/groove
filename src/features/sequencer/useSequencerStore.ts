import { useReducer, useCallback, useRef, useEffect, useState } from "react";
import { Genre, SequencerPattern, SequencerTrack } from "../../types/genre";
import { resolveTrackInsertForGenre } from "../../data/genreInsert";
import type { TrackInsertParams } from "../../data/trackInsert";
import { ChordDefinition, noteToMidi, getChordMidiNotes } from "../../utils/chordTheory";
import { chordVoicingForStep } from "../../audio/chordVoicing";
import { BakedArpeggioResult } from "../../utils/arpeggiatorTheory";
// The one helper every genre-entry point uses: clone + seed the genre's arranged mix.
// `clonePattern` stays untouched because slot copies and undo must preserve user values.
import { patternFromGenre, migrateLegacyPlaceholderMix } from "../../data/genreMix";
import { sectionsFromSongChain, sectionsToSongChain, type SongSection } from "../../types/song";
import {
  debounceSaveProject,
  loadSavedProject,
  clearSavedProject,
} from "./projectStorage";
import { EffectsRackState, DEFAULT_FX_STATE } from "../../audio/EffectsRack";

export interface StudioHistorySnapshot {
  pattern: SequencerPattern;
  bpm: number;
  swing: number;
  timeSignature: string;
  resolution: "1/8" | "1/16" | "1/32";
  /**
   * D-03: the master FX rack belongs in the undo stack too. Without it, "change FX →
   * Ctrl+Z" rolled the notes back and silently kept the FX edit — a half-undo that made
   * users distrust the button. Optional so snapshots captured by older code (and the
   * existing tests) still type-check; `restore` treats a missing rack as "leave as is".
   */
  effectsRack?: EffectsRackState;
  patterns?: {
    A: SequencerPattern;
    B: SequencerPattern;
  };
  activeSlot?: "A" | "B";
  /** F-04: transport/song settings that used to consume a history entry without being restored. */
  stepCount?: number;
  songMode?: boolean;
  songChain?: Array<"A" | "B">;
  loopRange?: [number, number] | null;
  isMetronome?: boolean;
  isCountIn?: boolean;
  parameterDimension?: "velocity" | "probability" | "ratchet" | "gate";
}

/**
 * A-04: undo history used to be capped at a fixed 50 *entries*, but one entry is a
 * deep clone of three patterns (current + slots A/B). At 8 tracks × 64 steps × 6
 * arrays that is roughly 75 KB per entry, so a full stack retained several MB of
 * plain JS arrays. We now also cap by an estimated byte budget and evict oldest-first.
 */
const HISTORY_MAX_ENTRIES = 50;
const HISTORY_MAX_BYTES = 4 * 1024 * 1024;
const BYTES_PER_NUMBER = 8; // JS number slots in a typed-ish dense array
const SNAPSHOT_FIXED_OVERHEAD = 2048;

export function estimateSnapshotBytes(snapshot: StudioHistorySnapshot): number {
  let numbers = 0;
  const countPattern = (pattern?: SequencerPattern) => {
    if (!pattern?.tracks) return;
    for (const track of pattern.tracks) {
      numbers += track.steps?.length ?? 0;
      numbers += track.velocity?.length ?? 0;
      numbers += track.pitch?.length ?? 0;
      numbers += track.gate?.length ?? 0;
      numbers += track.ratchet?.length ?? 0;
      numbers += track.probability?.length ?? 0;
    }
  };
  countPattern(snapshot.pattern);
  countPattern(snapshot.patterns?.A);
  countPattern(snapshot.patterns?.B);
  return numbers * BYTES_PER_NUMBER + SNAPSHOT_FIXED_OVERHEAD;
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
  /**
   * The arrangement (B1), and the source of truth for the bar order.
   *
   * `songChain` is kept as a derived view (see `sectionsToSongChain`) because the studio, the project hub and the
   * share codec still speak it: deriving it here is what stops the two from disagreeing, which hand-writing both
   * would guarantee.
   */
  sections: SongSection[];
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
  /**
   * D-03: master FX rack. Held in the store (not just in `StudioView`'s local state) so
   * undo/redo — which only replays reducer snapshots — can restore it.
   */
  effectsRack: EffectsRackState;
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
  /**
   * E-10: an insert-chain edit. `patch` is merged over the track's current chain, and a
   * missing chain resolves from the role's factory default first — so the first edit on a
   * track starts from the strip the user is actually hearing, not from a blank one.
   */
  | { type: "SET_TRACK_INSERT"; trackIdx: number; patch: Partial<TrackInsertParams> }
  /** Replaces the whole chain, e.g. "reset to the role default" or "bypass everything". */
  | { type: "REPLACE_TRACK_INSERT"; trackIdx: number; insert: TrackInsertParams }
  | { type: "REORDER_TRACKS"; fromIndex: number; toIndex: number }
  | { type: "TOGGLE_MUTE"; trackIdx: number }
  | { type: "TOGGLE_SOLO"; trackIdx: number }
  | { type: "TOGGLE_PHASE_INVERT"; trackIdx: number }
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
  | {
      type: "LOAD_PROJECT";
      genre: Genre;
      patterns: { A: SequencerPattern; B: SequencerPattern };
      activeSlot: "A" | "B";
      bpm: number;
      swing: number;
      timeSignature: string;
      resolution: "1/8" | "1/16" | "1/32";
      stepCount: number;
      songMode?: boolean;
      songChain?: ("A" | "B")[];
      /** B1: the arrangement, when the project carries one. */
      sections?: SongSection[];
      loopRange?: [number, number] | null;
      isMetronome?: boolean;
      isCountIn?: boolean;
      /**
       * D-03/D-04: a project carries its FX rack. Optional so existing callers that do
       * not have one keep the current rack instead of silently resetting it.
       */
      effectsRack?: EffectsRackState;
    }
  | { type: "SWITCH_PATTERN_SLOT"; slot: "A" | "B" }
  | { type: "COPY_PATTERN_SLOT"; from: "A" | "B"; to: "A" | "B" }
  | { type: "TOGGLE_SONG_MODE" }
  | { type: "SET_SONG_CHAIN"; chain: ("A" | "B")[] }
  | { type: "SET_SECTIONS"; sections: SongSection[] }
  | { type: "TOGGLE_BLIND_TEST" }
  | { type: "SET_LOOP_RANGE"; range: [number, number] | null }
  | { type: "SET_METRONOME"; enabled: boolean }
  | { type: "SET_COUNT_IN"; enabled: boolean }
  | { type: "SET_PARAMETER_DIMENSION"; dimension: "velocity" | "probability" | "ratchet" | "gate" }
  /**
   * D-03: partial update of the master FX rack. Goes through `commit`/`commitCoalesced`
   * like every other user edit, so it is captured by `StudioHistorySnapshot` and undone
   * together with a pattern change made in the same tick (one tick = one history entry).
   */
  | { type: "SET_EFFECTS_RACK"; effectsRack: Partial<EffectsRackState> }
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
  const patternA = patternFromGenre(genre);
  const patternB = patternFromGenre(genre);

  if (saved && saved.genreId === genre.id) {
    const activeSlot = saved.activeSlot || "A";
    // Migration, per track: a channel still on the pre-feature placeholder mix was
    // never touched by the user, so it is re-seeded from the genre's arranged mix; a
    // channel the user moved in the console keeps its saved value. Without this, a
    // returning user would keep hearing the old flat mix forever, because this
    // snapshot wins over `patternFromGenre` whenever the genre id matches.
    const restoredA = migrateLegacyPlaceholderMix(saved.patterns.A, genre.id);
    const restoredB = migrateLegacyPlaceholderMix(saved.patterns.B, genre.id);
    const currentPattern = activeSlot === "B" ? restoredB : restoredA;
    return {
      currentGenre: genre,
      pattern: currentPattern,
      patterns: {
        A: restoredA,
        B: restoredB,
      },
      activeSlot,
      songMode: saved.songMode || false,
      // B1: prefer the arrangement; a snapshot from before it migrates its chain losslessly, one bar per letter.
      sections: saved.sections?.length
        ? saved.sections
        : sectionsFromSongChain("session", saved.songChain || ["A", "B"]),
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
      // D-03: FX is not part of `PersistedProject` yet (that is D-04), so a reload always
      // starts from the documented defaults; undo still restores it within the session.
      effectsRack: { ...DEFAULT_FX_STATE },
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
    sections: sectionsFromSongChain("session", ["A", "B"]),
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
    effectsRack: { ...DEFAULT_FX_STATE },
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
      const patternA = patternFromGenre(g);
      const patternB = patternFromGenre(g);
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
      const patternA = patternFromGenre(state.currentGenre);
      const patternB = patternFromGenre(state.currentGenre);
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
      /**
       * The studio's chain editor is still the phone/desktop UI for the bar order, so a chain edit recreates the
       * sections from it (one bar each). That is lossy for a section with `bars: 4` — the arrangement view (B3) is
       * the editor that replaces this path, and until it lands the chain remains the only way to edit the order.
       */
      return {
        ...state,
        songChain: [...action.chain],
        sections: sectionsFromSongChain("session", action.chain),
      };

    case "SET_SECTIONS":
      return { ...state, sections: [...action.sections], songChain: sectionsToSongChain(action.sections) };

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
        const velocity = t.velocity ? [...t.velocity] : Array(steps.length).fill(100);
        const trackLen = t.trackLength && t.trackLength > 0 && t.trackLength < steps.length ? t.trackLength : null;
        if (trackLen) {
          const baseIdx = action.stepIdx % trackLen;
          for (let i = baseIdx; i < steps.length; i += trackLen) {
            steps[i] = action.value;
            if (action.value > 0 && !velocity[i]) {
              velocity[i] = 100;
            }
          }
        } else {
          steps[action.stepIdx] = action.value;
          if (action.value > 0 && !velocity[action.stepIdx]) {
            velocity[action.stepIdx] = 100;
          }
        }
        return { ...t, steps, velocity };
      });
      return withUpdatedPattern({ ...state.pattern, tracks });
    }

    case "SET_VELOCITY": {
      const tracks = updateTrack(state.pattern.tracks, action.trackIdx, (t) => {
        const velocity = t.velocity ? [...t.velocity] : Array(t.steps.length).fill(100);
        const trackLen = t.trackLength && t.trackLength > 0 && t.trackLength < t.steps.length ? t.trackLength : null;
        if (trackLen) {
          const baseIdx = action.stepIdx % trackLen;
          for (let i = baseIdx; i < t.steps.length; i += trackLen) {
            velocity[i] = action.velocity;
          }
        } else {
          velocity[action.stepIdx] = action.velocity;
        }
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
        const trackLen = t.trackLength && t.trackLength > 0 && t.trackLength < t.steps.length ? t.trackLength : null;
        if (trackLen) {
          const baseIdx = action.stepIdx % trackLen;
          for (let i = baseIdx; i < t.steps.length; i += trackLen) {
            gate[i] = action.gate;
          }
        } else {
          gate[action.stepIdx] = action.gate;
        }
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

    case "SET_TRACK_INSERT":
    case "REPLACE_TRACK_INSERT": {
      const tracks = updateTrack(state.pattern.tracks, action.trackIdx, (t) => {
        const current =
          t.insert ?? resolveTrackInsertForGenre(t.track_id, state.pattern.genre_id);
        const next =
          action.type === "REPLACE_TRACK_INSERT"
            ? action.insert
            : { ...current, ...action.patch, low: { ...current.low, ...(action.patch.low ?? {}) }, mid: { ...current.mid, ...(action.patch.mid ?? {}) }, high: { ...current.high, ...(action.patch.high ?? {}) } };
        return { ...t, insert: next };
      });
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
        let pitches = t.pitches ? [...t.pitches] : undefined;
        const isChords = t.track_id === "chords" || (t.name ? t.name.toLowerCase().includes("chord") : false);
        const trackLen = t.trackLength && t.trackLength > 0 && t.trackLength < t.steps.length ? t.trackLength : null;

        const updateAt = (idx: number) => {
          const oldRoot = pitch[idx];
          pitch[idx] = action.pitch;
          if (action.pitch === null) {
            if (pitches) pitches[idx] = null;
            return;
          }
          if (pitches && pitches[idx] && Array.isArray(pitches[idx])) {
            const oldStack = pitches[idx]!;
            if (oldStack.length > 1 && typeof oldRoot === "number" && oldRoot > 0) {
              const delta = action.pitch - oldRoot;
              pitches[idx] = oldStack.map((n) => Math.max(0, Math.min(127, n + delta)));
            } else if (isChords) {
              pitches[idx] = chordVoicingForStep(action.pitch, state.pattern.scale);
            } else {
              pitches[idx] = [action.pitch];
            }
          } else if (isChords) {
            if (!pitches) pitches = Array(t.steps.length).fill(null);
            pitches[idx] = chordVoicingForStep(action.pitch, state.pattern.scale);
          }
        };

        if (trackLen) {
          const baseIdx = action.stepIdx % trackLen;
          for (let i = baseIdx; i < t.steps.length; i += trackLen) {
            updateAt(i);
          }
        } else {
          updateAt(action.stepIdx);
        }
        return { ...t, pitch, ...(pitches ? { pitches } : {}) };
      });
      return withUpdatedPattern({ ...state.pattern, tracks });
    }

    case "BATCH_SET_PITCH": {
      const tracks = updateTrack(state.pattern.tracks, action.trackIdx, (t) => {
        const pitch = [...action.pitches];
        let pitches = t.pitches ? [...t.pitches] : undefined;
        if (pitches) {
          pitches = pitches.map((stack, i) => {
            const newP = action.pitches[i];
            const oldP = t.pitch?.[i];
            if (newP === null || newP === undefined) return null;
            if (Array.isArray(stack) && stack.length > 0 && typeof oldP === "number" && oldP > 0) {
              const delta = newP - oldP;
              return stack.map((n) => Math.max(0, Math.min(127, n + delta)));
            }
            return [newP];
          });
        }
        return {
          ...t,
          pitch,
          ...(pitches ? { pitches } : {}),
        };
      });
      return withUpdatedPattern({ ...state.pattern, tracks });
    }

    case "SET_SCALE": {
      return withUpdatedPattern({ ...state.pattern, scale: action.scale });
    }

    case "SET_RATCHET": {
      const tracks = updateTrack(state.pattern.tracks, action.trackIdx, (t) => {
        const ratchet = t.ratchet ? [...t.ratchet] : Array(t.steps.length).fill(1);
        const trackLen = t.trackLength && t.trackLength > 0 && t.trackLength < t.steps.length ? t.trackLength : null;
        if (trackLen) {
          const baseIdx = action.stepIdx % trackLen;
          for (let i = baseIdx; i < t.steps.length; i += trackLen) {
            ratchet[i] = action.ratchet;
          }
        } else {
          ratchet[action.stepIdx] = action.ratchet;
        }
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
        const trackLen = t.trackLength && t.trackLength > 0 && t.trackLength < t.steps.length ? t.trackLength : null;
        if (trackLen) {
          const baseIdx = action.stepIdx % trackLen;
          for (let i = baseIdx; i < t.steps.length; i += trackLen) {
            probability[i] = action.probability;
          }
        } else {
          probability[action.stepIdx] = action.probability;
        }
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

    case "TOGGLE_PHASE_INVERT": {
      const tracks = updateTrack(state.pattern.tracks, action.trackIdx, (t) => ({
        ...t,
        phaseInvert: !t.phaseInvert,
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
        const steps = [...t.steps];
        const velocity = t.velocity ? [...t.velocity] : Array(steps.length).fill(100);
        const pitch = t.pitch ? [...t.pitch] : Array(steps.length).fill(null);
        const gate = t.gate ? [...t.gate] : Array(steps.length).fill(0.8);
        const ratchet = t.ratchet ? [...t.ratchet] : Array(steps.length).fill(1);
        const probability = t.probability ? [...t.probability] : Array(steps.length).fill(100);

        if (targetSteps <= steps.length) {
          const cut = <T,>(arr: T[]) => arr.slice(0, targetSteps);
          return {
            ...t,
            steps: cut(steps),
            velocity: cut(velocity),
            pitch: cut(pitch),
            gate: cut(gate),
            ratchet: cut(ratchet),
            probability: cut(probability),
            trackLength: targetSteps,
          };
        }

        /**
         * Growing tiles the existing pattern instead of padding with silence.
         *
         * This used to be `[...steps, ...steps.slice(0, diff)]`, which only works while `diff`
         * is smaller than the source: 16 → 128 asked for a 112-step tail from a 16-step array,
         * got 16, and produced a 32-step grid whose upper three quarters were empty. The
         * user-visible result was "选择 64/128 步后大半格子是死的，导出也大半是静音".
         * Repeating by modulo reaches the target for every source and target length.
         */
        const tile = <T,>(arr: T[], fill: T): T[] => {
          const cycle = arr.length > 0 ? arr : [fill];
          return Array.from({ length: targetSteps }, (_, i) => cycle[i % cycle.length]);
        };

        return {
          ...t,
          steps: tile(steps, 0),
          velocity: tile(velocity, 100),
          pitch: tile(pitch, null),
          gate: tile(gate, 0.8),
          ratchet: tile(ratchet, 1),
          probability: tile(probability, 100),
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
        const pitches: (number[] | null)[] = Array(total).fill(null);
        const velocity = Array(total).fill(100);

        const chordCount = chords.length;
        const stepInterval = Math.max(1, Math.floor(total / chordCount));

        chords.forEach((chordDef, idx) => {
          const stepPos = idx * stepInterval;
          if (stepPos < total) {
            steps[stepPos] = 1;
            const midis = getChordMidiNotes(chordDef.root, chordDef.quality, 4, chordDef.inversion);
            pitches[stepPos] = midis;
            pitch[stepPos] = midis[0] ?? noteToMidi(chordDef.root, 4);
            velocity[stepPos] = 105;
          }
        });

        return { ...t, steps, pitch, pitches, velocity };
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

    case "LOAD_PROJECT": {
      const activeSlot = action.activeSlot || "A";
      const patA = clonePattern(action.patterns.A);
      const patB = clonePattern(action.patterns.B || action.patterns.A);
      const currentPattern = activeSlot === "B" ? clonePattern(patB) : clonePattern(patA);
      const loadedSections = action.sections?.length
        ? action.sections
        : sectionsFromSongChain("project", action.songChain || ["A", "B"]);
      return {
        ...state,
        currentGenre: action.genre,
        pattern: currentPattern,
        patterns: {
          A: patA,
          B: patB,
        },
        activeSlot,
        bpm: action.bpm,
        swing: action.swing,
        timeSignature: action.timeSignature,
        resolution: action.resolution,
        stepCount: action.stepCount,
        songMode: Boolean(action.songMode),
        sections: loadedSections,
        // Derived when the project brings an arrangement, so `songChain` can never contradict it on load.
        songChain: action.sections?.length ? sectionsToSongChain(loadedSections) : action.songChain || ["A", "B"],
        loopRange: action.loopRange !== undefined ? action.loopRange : null,
        isMetronome: Boolean(action.isMetronome),
        isCountIn: Boolean(action.isCountIn),
        // D-03: keep the loaded rack when the project carries one.
        effectsRack: action.effectsRack ? { ...action.effectsRack } : state.effectsRack,
        canUndo: false,
        canRedo: false,
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

    case "SET_EFFECTS_RACK":
      // D-03: merge, so a single slider only writes its own field.
      return { ...state, effectsRack: { ...state.effectsRack, ...action.effectsRack } };

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
        // F-04: restore everything the snapshot captured. These fields used to
        // consume a history entry (and a visible "undo did nothing") without ever
        // being put back.
        stepCount: s.stepCount ?? s.pattern.tracks[0]?.steps?.length ?? state.stepCount,
        songMode: s.songMode ?? state.songMode,
        songChain: s.songChain ? [...s.songChain] : state.songChain,
        loopRange: s.loopRange !== undefined ? s.loopRange : state.loopRange,
        isMetronome: s.isMetronome ?? state.isMetronome,
        isCountIn: s.isCountIn ?? state.isCountIn,
        parameterDimension: s.parameterDimension ?? state.parameterDimension,
        // D-03: FX is restored on the same step as the pattern, so undoing a combined
        // tick rolls notes and rack back together. A snapshot without a rack (older
        // shape) leaves the current rack untouched rather than resetting it.
        effectsRack: s.effectsRack ? { ...s.effectsRack } : state.effectsRack,
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
  const historyBytesRef = useRef(0);

  /** Pushes a snapshot and trims the stack to the entry/byte budget (oldest first). */
  const pushHistory = useCallback((snapshot: StudioHistorySnapshot) => {
    historyRef.current.push(snapshot);
    historyBytesRef.current += estimateSnapshotBytes(snapshot);
    while (
      historyRef.current.length > HISTORY_MAX_ENTRIES ||
      (historyBytesRef.current > HISTORY_MAX_BYTES && historyRef.current.length > 1)
    ) {
      const evicted = historyRef.current.shift();
      if (!evicted) break;
      historyBytesRef.current -= estimateSnapshotBytes(evicted);
    }
    if (historyBytesRef.current < 0) historyBytesRef.current = 0;
  }, []);

  const clearHistory = useCallback(() => {
    historyRef.current = [];
    futureRef.current = [];
    historyBytesRef.current = 0;
  }, []);

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
      sections: state.sections,
      songChain: state.songChain,
      loopRange: state.loopRange,
      isMetronome: state.isMetronome,
      isCountIn: state.isCountIn,
    });
  }, [state]);

  // F-04: history is driven by the *live* state, not by the render closure the
  // handler was created in. `stateRef` always points at the newest state object,
  // so several `commit` calls inside one tick all describe the same "before" state.
  const stateRef = useRef(state);
  stateRef.current = state;

  // Snapshot identity dedupe: while the state object has not actually been replaced
  // (i.e. all commits in this tick), only the first one records history.
  const lastRecordedStateRef = useRef<SequencerState | null>(null);

  // `canUndo`/`canRedo` used to be read straight off refs during render, so the
  // toolbar's disabled state never updated. They now live in React state.
  const [historyFlags, setHistoryFlags] = useState({ canUndo: false, canRedo: false });
  const syncHistoryFlags = useCallback(() => {
    setHistoryFlags((prev) => {
      const canUndo = historyRef.current.length > 0;
      const canRedo = futureRef.current.length > 0;
      return prev.canUndo === canUndo && prev.canRedo === canRedo ? prev : { canUndo, canRedo };
    });
  }, []);

  const createSnapshot = useCallback(
    (overridePattern?: SequencerPattern): StudioHistorySnapshot => {
      const s = stateRef.current;
      return {
        pattern: clonePattern(overridePattern || s.pattern),
        bpm: s.bpm,
        swing: s.swing,
        timeSignature: s.timeSignature,
        resolution: s.resolution,
        patterns: {
          A: clonePattern(s.patterns.A),
          B: clonePattern(s.patterns.B),
        },
        activeSlot: s.activeSlot,
        stepCount: s.stepCount,
        songMode: s.songMode,
        songChain: [...s.songChain],
        loopRange: s.loopRange ? ([s.loopRange[0], s.loopRange[1]] as [number, number]) : null,
        isMetronome: s.isMetronome,
        isCountIn: s.isCountIn,
        parameterDimension: s.parameterDimension,
        // D-03: clone the rack so later slider edits cannot mutate the snapshot in place.
        effectsRack: { ...s.effectsRack },
      };
    },
    []
  );

  const commit = useCallback(
    (action: SequencerAction, recordHistory = true) => {
      if (action.type === "LOAD_PROJECT") {
        clearHistory();
        lastRecordedStateRef.current = null;
        recordHistory = false;
      } else if (recordHistory) {
        const source = stateRef.current;
        if (lastRecordedStateRef.current !== source) {
          pushHistory(createSnapshot());
          lastRecordedStateRef.current = source;
          futureRef.current = [];
          lastCoalescedRef.current = null;
        }
      }
      dispatch(action);
      syncHistoryFlags();
    },
    [createSnapshot, pushHistory, syncHistoryFlags, clearHistory]
  );

  const undo = useCallback((): StudioHistorySnapshot | null => {
    if (historyRef.current.length === 0) return null;
    const prev = historyRef.current.pop()!;
    futureRef.current.push(createSnapshot());
    lastRecordedStateRef.current = null;
    lastCoalescedRef.current = null;
    dispatch({ type: "RESTORE_SNAPSHOT", snapshot: prev });
    syncHistoryFlags();
    return prev;
  }, [createSnapshot, syncHistoryFlags]);

  const redo = useCallback((): StudioHistorySnapshot | null => {
    if (futureRef.current.length === 0) return null;
    const next = futureRef.current.pop()!;
    historyRef.current.push(createSnapshot());
    lastRecordedStateRef.current = null;
    lastCoalescedRef.current = null;
    dispatch({ type: "RESTORE_SNAPSHOT", snapshot: next });
    syncHistoryFlags();
    return next;
  }, [createSnapshot, syncHistoryFlags]);

  // F-05: high-frequency controls (BPM typing, swing dragging, velocity painting)
  // used to push one history entry per event, so a single gesture evicted the whole
  // 50-entry undo stack. Coalescing by key collapses a continuous gesture into one
  // undo step without changing how the value itself is applied.
  const lastCoalescedRef = useRef<{ key: string; at: number } | null>(null);

  const commitCoalesced = useCallback(
    (action: SequencerAction, key: string, windowMs = 600) => {
      const now = Date.now();
      const last = lastCoalescedRef.current;
      const source = stateRef.current;
      // Never record twice for the same state object: several commits inside one
      // tick all describe the same "before" state and must share one undo entry.
      const alreadyRecorded = lastRecordedStateRef.current === source;
      const shouldRecord = !alreadyRecorded && (!last || last.key !== key || now - last.at > windowMs);

      if (shouldRecord) {
        pushHistory(createSnapshot());
        futureRef.current = [];
        lastRecordedStateRef.current = source;
        lastCoalescedRef.current = { key, at: now };
      } else if (last && last.key === key) {
        last.at = now;
      }

      dispatch(action);
      syncHistoryFlags();
    },
    [createSnapshot, pushHistory, syncHistoryFlags]
  );

  /** Drops the redo stack — call after changes made outside `commit` (e.g. live recording). */
  const invalidateRedo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    futureRef.current = [];
    syncHistoryFlags();
  }, [syncHistoryFlags]);

  const resetHistory = useCallback(() => {
    clearHistory();
    lastRecordedStateRef.current = null;
    lastCoalescedRef.current = null;
    syncHistoryFlags();
  }, [clearHistory, syncHistoryFlags]);

  /** Retained undo-history size estimate in bytes (A-04 diagnostics). */
  const getHistoryStats = useCallback(
    () => ({
      entries: historyRef.current.length,
      bytes: historyBytesRef.current,
      futureEntries: futureRef.current.length,
    }),
    []
  );

  const canUndo = historyFlags.canUndo;
  const canRedo = historyFlags.canRedo;

  return {
    state,
    dispatch,
    commit,
    undo,
    redo,
    canUndo,
    canRedo,
    createSnapshot,
    invalidateRedo,
    resetHistory,
    commitCoalesced,
    getHistoryStats,
  };
}
