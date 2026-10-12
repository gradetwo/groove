/**
 * Binding a lyric to a melody, and checking the two against each other while doing it.
 *
 * The dev-branch report's third item, and the last capability gap the three evaluations named: a vocal lead was "a step array like any other
 * synth, with the lyric as an annotation beside it". Worse than untidy, that left the **倒字** problem unguarded — nothing connected a syllable's
 * tone to the note it was sung on, so a melody could reverse a tone and nobody could see it.
 *
 * Three decisions, all of them the ones this project keeps making:
 *
 *   * the tones are **input**, not guessed. An LLM's pinyin is the least reliable link in the chain (`validate_prosody` says so in its own
 *     description), so this takes `tones` and never invents them;
 *   * the binding is **additive on the track** (`SequencerTrack.syllables`), so an instrumental line is unchanged and old projects stay valid;
 *   * and it **checks as it binds**, because the moment a caller has both a syllable and its note is the moment the warning is useful.
 */
import { generateMelody } from "./melody";
import { validateProsody } from "./prosody";
import type { SequencerPattern, SequencerTrack } from "../src/types/genre";

export interface SetVocalMelodyInput {
  pattern: SequencerPattern;
  /** The lane to sing on; default `lead`, which is the lane every genre in the library reserves for a voice. */
  track?: string;
  /** One syllable per note, in order. */
  syllables: string[];
  /** One tone per syllable: 1 阴平, 2 阳平, 3 上声, 4 去声, 0/5 neutral. */
  tones: number[];
  /** The notes to sing them on. Omitted, a melody is written with `generateMelody` in the same key. */
  pitches?: number[];
  /** Passed to `generateMelody` when `pitches` is omitted. */
  seed?: number;
  tonic?: number;
  mode?: "major" | "minor";
}

export interface SetVocalMelodyResult {
  pattern: SequencerPattern;
  trackId: string;
  /** The notes each syllable actually landed on, so a caller can check the binding rather than trust it. */
  notes: Array<{ index: number; syllable: string; tone: number; pitch: number; step: number }>;
  /** The prosody check on the result — the same rules `validate_prosody` applies, run at the moment it matters. */
  prosody: ReturnType<typeof validateProsody>;
  warnings: string[];
}

export function setVocalMelody(input: SetVocalMelodyInput): SetVocalMelodyResult {
  const trackId = input.track ?? "lead";
  const lane = input.pattern.tracks?.find((track) => track.track_id === trackId);
  if (!lane) {
    throw new Error(
      `no "${trackId}" lane on this pattern (it has ${(input.pattern.tracks ?? []).map((track) => track.track_id).join(", ") || "none"})`
    );
  }
  if (!input.syllables.length) throw new Error("provide at least one syllable");
  if (input.tones.length !== input.syllables.length) {
    throw new Error(`got ${input.syllables.length} syllable(s) and ${input.tones.length} tone(s) — one tone per syllable`);
  }

  /**
   * The notes come from the caller, or from the same contour-first generator the melody tool uses — in which case the syllable count decides how
   * much melody to write, so a caller who supplies a lyric does not also have to compose.
   */
  let pitches = input.pitches;
  if (!pitches) {
    const stepsPerNote = Math.max(2, Math.floor((lane.steps?.length ?? 16) / Math.max(1, input.syllables.length)));
    const bars = Math.max(1, Math.ceil((input.syllables.length * stepsPerNote) / 16));
    const generated = generateMelody({
      tonic: input.tonic ?? 60,
      mode: input.mode ?? "major",
      bars,
      seed: input.seed ?? 1,
      density: 1,
      form: "AABA",
    });
    // Take the generated notes in order — density 1 means one per eighth — and cut to the syllable count.
    const sounding = generated.pitch.filter((_, index) => generated.steps[index] > 0);
    if (sounding.length < input.syllables.length) {
      throw new Error(
        `the generated melody has ${sounding.length} note(s) but there are ${input.syllables.length} syllable(s) — pass explicit \`pitches\``
      );
    }
    pitches = sounding.slice(0, input.syllables.length);
  }
  if (pitches.length !== input.syllables.length) {
    throw new Error(`got ${input.syllables.length} syllable(s) and ${pitches.length} pitch(es) — one note per syllable`);
  }

  const slots = lane.steps?.length ?? 16;
  const stepsPerNote = Math.max(1, Math.floor(slots / pitches.length));
  const steps = new Array(slots).fill(0);
  const velocity = new Array(slots).fill(0);
  const gate = new Array(slots).fill(1);
  const nextPitch = new Array(slots).fill(null) as (number | null)[];
  const syllables = new Array(slots).fill(null) as (string | null)[];
  const notes: SetVocalMelodyResult["notes"] = [];
  const warnings: string[] = [];

  pitches.forEach((pitch, index) => {
    const step = Math.min(slots - 1, index * stepsPerNote);
    if (steps[step]) {
      warnings.push(`syllable ${index} ("${input.syllables[index]}") landed on step ${step}, which is already sung — the lane is too short`);
      return;
    }
    steps[step] = 1;
    velocity[step] = 100;
    nextPitch[step] = pitch;
    syllables[step] = input.syllables[index] ?? null;
    notes.push({ index, syllable: input.syllables[index]!, tone: input.tones[index]!, pitch, step });
  });

  const sung: SequencerTrack = { ...lane, steps, velocity, gate, pitch: nextPitch, syllables };
  const pattern: SequencerPattern = {
    ...input.pattern,
    tracks: (input.pattern.tracks ?? []).map((track) => (track.track_id === trackId ? sung : track)),
  };

  const prosody = validateProsody({
    tones: input.tones,
    pitches: notes.map((note) => note.pitch),
    syllables: notes.map((note) => note.syllable),
  });
  return { pattern, trackId, notes, prosody, warnings };
}
