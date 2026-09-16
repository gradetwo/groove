import { describe, it, expect } from "vitest";
import { expandGenrePattern, expressionStepCount, resolveGenreExpression } from "../data/genreExpression";
import { sequencerReducer, createInitialSequencerState } from "../features/sequencer/useSequencerStore";
import { withTrackNotes } from "../features/sequencer/rollModel";
import { GENRES_MAP } from "../data/genres";
import type { SequencerPattern, SequencerTrack } from "../types/genre";

const defaultRoles: Array<"kick" | "snare" | "hihat" | "percussion" | "bass" | "chords" | "lead" | "fx"> = [
  "kick",
  "bass",
  "chords",
  "snare",
  "hihat",
  "percussion",
  "lead",
  "fx",
];

function makePattern(tracks: Partial<SequencerTrack>[] = []): SequencerPattern {
  return {
    genre_id: "pop-rb",
    bpm: 120,
    scale: "C_MAJOR",
    resolution: "1/16",
    tracks: tracks.map((t, idx) => ({
      track_id: t.track_id || defaultRoles[idx % defaultRoles.length],
      name: t.name || `Track ${idx}`,
      instrument: t.instrument || "acoustic_snare",
      steps: t.steps || [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      velocity: t.velocity || Array(16).fill(100),
      pitch: t.pitch || Array(16).fill(null),
      pitches: t.pitches || Array(16).fill(null),
      gate: t.gate || Array(16).fill(0.8),
      ratchet: t.ratchet || Array(16).fill(1),
      probability: t.probability || Array(16).fill(100),
      ...(t.trackLength ? { trackLength: t.trackLength } : {}),
    })),
  };
}

describe("Sequencer visual and audio length parity (v2.0.28)", () => {
  const testGenre = GENRES_MAP["future-bass"] || Object.values(GENRES_MAP)[0];

  it("expandGenrePattern populates all totalSteps for drums and bass without dead bars", () => {
    const expr = resolveGenreExpression("Pop/R&B", "Pop/R&B");
    const base = makePattern([
      {
        track_id: "kick",
        name: "Kick",
        steps: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      },
      {
        track_id: "bass",
        name: "Bass",
        steps: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
        pitch: [36, null, 36, null, 38, null, 38, null, 40, null, 40, null, 41, null, 41, null],
      },
      {
        track_id: "chords",
        name: "Chords",
        steps: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
        pitch: [60, null, null, null, null, null, null, null, 64, null, null, null, null, null, null, null],
      },
    ]);

    const total = expressionStepCount(expr, base);
    expect(total).toBe(64);

    const expanded = expandGenrePattern(base, expr, { authoredStepCount: 16 });
    expect(expanded.totalSteps).toBe(64);

    const kick = expanded.tracks.find((t) => t.track_id === "kick")!;
    expect(kick.steps.length).toBe(64);
    // Bars 2, 3, 4 (steps 16..63) are populated with the repeating authored rhythm, NOT empty zeros!
    expect(kick.steps.slice(0, 16)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
    expect(kick.steps.slice(16, 32)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
    expect(kick.steps.slice(32, 48)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
    expect(kick.steps.slice(48, 64)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
    expect(kick.trackLength).toBe(16);

    const bass = expanded.tracks.find((t) => t.track_id === "bass")!;
    expect(bass.steps.length).toBe(64);
    expect(bass.pitch?.length).toBe(64);
    expect(bass.pitch?.[0]).toBe(36);
    expect(bass.pitch?.[16]).toBe(36);
    expect(bass.pitch?.[32]).toBe(36);
    expect(bass.pitch?.[48]).toBe(36);
  });

  it("useSequencerStore synchronizes SET_STEP across all loop repeats when trackLength < totalSteps", () => {
    const pattern = makePattern([
      {
        track_id: "kick",
        steps: Array(64).fill(0),
        trackLength: 16,
      },
    ]);

    const baseState = createInitialSequencerState(testGenre);
    const state = {
      ...baseState,
      pattern,
      patterns: { A: pattern, B: pattern },
      stepCount: 64,
    };

    // Edit step 4 (in bar 1) -> should synchronize to 20, 36, 52
    const next1 = sequencerReducer(state, {
      type: "SET_STEP",
      trackIdx: 0,
      stepIdx: 4,
      value: 1,
    });
    const tr1 = next1.pattern.tracks[0];
    expect(tr1.steps[4]).toBe(1);
    expect(tr1.steps[20]).toBe(1);
    expect(tr1.steps[36]).toBe(1);
    expect(tr1.steps[52]).toBe(1);

    // Edit step 20 (in bar 2) to 0 -> should synchronize back to 4, 20, 36, 52
    const next2 = sequencerReducer(next1, {
      type: "SET_STEP",
      trackIdx: 0,
      stepIdx: 20,
      value: 0,
    });
    const tr2 = next2.pattern.tracks[0];
    expect(tr2.steps[4]).toBe(0);
    expect(tr2.steps[20]).toBe(0);
    expect(tr2.steps[36]).toBe(0);
    expect(tr2.steps[52]).toBe(0);
  });

  it("useSequencerStore synchronizes SET_VELOCITY and SET_PITCH across all loop repeats", () => {
    const pattern = makePattern([
      {
        track_id: "bass",
        steps: Array(64).fill(1),
        trackLength: 16,
        pitch: Array(64).fill(36),
        velocity: Array(64).fill(100),
      },
    ]);

    const baseState = createInitialSequencerState(testGenre);
    const state = {
      ...baseState,
      pattern,
      patterns: { A: pattern, B: pattern },
      stepCount: 64,
    };

    const next = sequencerReducer(state, {
      type: "SET_VELOCITY",
      trackIdx: 0,
      stepIdx: 17, // Bar 2, step 1 (17 % 16 = 1)
      velocity: 125,
    });
    expect(next.pattern.tracks[0].velocity?.[1]).toBe(125);
    expect(next.pattern.tracks[0].velocity?.[17]).toBe(125);
    expect(next.pattern.tracks[0].velocity?.[33]).toBe(125);
    expect(next.pattern.tracks[0].velocity?.[49]).toBe(125);

    const nextPitch = sequencerReducer(next, {
      type: "SET_PITCH",
      trackIdx: 0,
      stepIdx: 33, // Bar 3, step 1 (33 % 16 = 1)
      pitch: 48,
    });
    expect(nextPitch.pattern.tracks[0].pitch?.[1]).toBe(48);
    expect(nextPitch.pattern.tracks[0].pitch?.[17]).toBe(48);
    expect(nextPitch.pattern.tracks[0].pitch?.[33]).toBe(48);
    expect(nextPitch.pattern.tracks[0].pitch?.[49]).toBe(48);
  });

  it("piano roll notes drawn into bar 2 expand trackLength so they sound in playback", () => {
    const pattern = makePattern([
      {
        track_id: "bass",
        steps: Array(64).fill(0),
        trackLength: 16,
      },
    ]);

    // Draw note at step 20 (bar 2)
    const notes = [
      { stepIdx: 0, midi: 36, gate: 1, velocity: 100 },
      { stepIdx: 20, midi: 40, gate: 1, velocity: 100 },
    ];

    const updated = withTrackNotes(pattern, 0, notes, 64);
    // Since maxAuthoredStep is 21 > 16, trackLength is expanded to 64 so playback doesn't truncate at 16
    expect(updated.tracks[0].trackLength).toBe(64);
    expect(updated.tracks[0].steps[20]).toBe(1);
    expect(updated.tracks[0].pitch?.[20]).toBe(40);
  });
});
