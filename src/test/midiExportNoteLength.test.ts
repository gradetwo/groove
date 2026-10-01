import { describe, expect, it } from "vitest";
import { generateMidiBytes } from "../audio/MidiExporter";
import { fromMidi } from "../data/midiToArrangement";
import type { SequencerPattern } from "../types/genre";

/**
 * ⭐ **A long note survives export, because an arrangement states a length and the grid's cap is not its business.**
 *
 * `MAX_NOTE_GATE_STEPS = 16` is the step grid's own editing limit: a piano roll resize, a genre library's authored
 * gate, the piano roll's chord audition. It has no business capping what an arrangement exports, because the
 * arrangement's `lengthBeats` has no upper bound, the compile now hands that length to every lane, and the WAV
 * renderer reads `gate` without clamping (`WavExporter.ts:1387`). Both exporters used to clamp anyway —
 * `MidiExporter.ts:167` and `AbletonExporter.ts:203` — so a four-bar pad rendered for four bars and exported as
 * one, a file that disagreed with the take the creator had just auditioned.
 *
 * Measured as a round trip rather than against the bytes: a note written four bars long must come back four bars
 * long. The floor stays (`Math.max(0.1, …)`) because a zero gate is a degenerate note rather than a long one, and
 * the criterion below checks that a normal note is untouched, so removing the ceiling is not a blunt change.
 */
const STEP_BEATS = 0.25; // sixteenths
const BEATS_PER_BAR = 4;

const patternWith = (gate: number): SequencerPattern => ({
  genre_id: "custom",
  bpm: 120,
  swing: 0,
  scale: "chromatic",
  resolution: "1/16",
  timeSignature: "4/4",
  totalSteps: 64,
  tracks: [
    {
      track_id: "lead",
      name: "Lead",
      instrument: "synth",
      steps: [1, ...new Array(63).fill(0)],
      velocity: [100, ...new Array(63).fill(0)],
      pitch: [48, ...new Array(63).fill(0)],
      gate: [gate, ...new Array(63).fill(0)],
      pan: 0,
      mute: false,
      solo: false,
    },
  ],
});

/** The longest note a track came back with, in beats — the length the export preserved. */
const longestImportedBeats = (gate: number): number => {
  const { parts } = fromMidi(generateMidiBytes({ bpm: 120, pattern: patternWith(gate), genreName: "custom" }));
  const notes = parts.flatMap((part) => part.notes ?? []);
  expect(notes.length, "the round trip must produce notes at all").toBeGreaterThan(0);
  return Math.max(...notes.map((note) => note.lengthBeats));
};

describe("a note's length through MIDI export and back", () => {
  it("⭐ keeps a four-bar note four bars long, where the grid's cap used to cut it to one", () => {
    // A step is a sixteenth, so four bars is sixty-four steps and sixteen beats. Before the ceilings came off,
    // `Math.min(MAX_NOTE_GATE_STEPS, …)` cut this to sixteen steps — one bar — whatever the arrangement said.
    expect(longestImportedBeats(4 * BEATS_PER_BAR / STEP_BEATS)).toBeCloseTo(4 * BEATS_PER_BAR, 6);
  });

  it("⭐ and the cap's own length is the discriminator: sixteen steps must stay sixteen", () => {
    // The old ceiling was sixteen steps, which is four beats. An exporter that ignored the note's length entirely
    // would return the same four beats for both of these, so the pair is what makes the first case meaningful.
    expect(longestImportedBeats(1 * BEATS_PER_BAR / STEP_BEATS)).toBeCloseTo(BEATS_PER_BAR, 6);
    expect(longestImportedBeats(2 * BEATS_PER_BAR / STEP_BEATS)).toBeCloseTo(2 * BEATS_PER_BAR, 6);
  });

  it("holds a floor without a ceiling: a degenerate gate still exports as something audible", () => {
    // `Math.max(0.1, …)` stays. A zero gate is not a long note, and dropping the floor would make silence.
    expect(longestImportedBeats(0)).toBeGreaterThan(0);
  });
});
