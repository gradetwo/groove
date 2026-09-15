/**
 * Diatonic chord voicing (E-01 in AUDIO_QUALITY_AND_SYNTH_PLAN.md).
 *
 * The defect this fixes: the `chords` track was **monophonic**. `AudioEngine.playChord`
 * triggered exactly one note from the step's `pitch`, so although every genre declares
 * a progression in `genre.common_chords` (e.g. `"i–VI–III–VII"`) that information only
 * ever reached the UI. All 159 genres therefore had no harmony at all — the "pad" was a
 * single-note melody wearing a pad preset, which is the largest single reason a genre
 * did not sound arranged.
 *
 * The approach: harmonise the step's own root pitch **diatonically in the pattern's
 * scale**, rather than trying to parse the roman-numeral progression. The sequencer's
 * `pitch` array already encodes the real roots (`house.ts` chords are `60, …, 63, …,
 * 65`), so stacking scale tones above each root produces the idiomatically correct
 * chord for that degree — and it needs **zero genre-file edits**.
 *
 * This module is deliberately pure and deterministic, and it is imported by BOTH the
 * live engine and the offline renderer. "Exporter parity" is a hard rule in this
 * project; duplicating voicing logic in two places is exactly how the two drift apart.
 */
import { parseScaleString, SCALES, NOTE_NAMES } from "../utils/scaleTheory";

/** Triad (3 notes) or seventh (4 notes). */
export type VoicingDensity = "triad" | "seventh";

export interface ChordVoicingOptions {
  density?: VoicingDensity;
  /**
   * Largest interval allowed between the root and the top voice, in semitones.
   * Voicings that would exceed it are folded down an octave so a pad does not smear
   * into the lead register. This is a safety net: a diatonic triad spans at most 8
   * semitones and a seventh at most 11, so it rarely engages.
   */
  span?: number;
}

/**
 * The interval stack for scales that cannot be harmonised by degree-stacking.
 *
 * A chromatic "scale" contains every semitone, so stacking scale degrees above a root
 * would produce a semitone cluster rather than a chord. Such material gets an open
 * root–fifth–octave instead: neutral, and it cannot clash with atonal writing.
 */
const CHROMATIC_STACK = [0, 7, 12];

/**
 * Builds the note list for one chord step.
 *
 * `rootMidi` is the step's own pitch (the caller supplies the `60` default when the
 * data has none). Returns a list whose first element is always `rootMidi`, so the
 * original bass note is preserved exactly as authored. Returns `[rootMidi]` unchanged
 * for a non-positive root, so callers can pass values through without special-casing.
 */
export function chordVoicingForStep(
  rootMidi: number,
  scale: string | undefined,
  options: ChordVoicingOptions = {}
): number[] {
  if (!Number.isFinite(rootMidi) || rootMidi <= 0) return [rootMidi];

  const density = options.density ?? "triad";
  const span = options.span ?? 16;
  const { root: keyRoot, scaleId } = parseScaleString(scale);

  // Chromatic material cannot be harmonised by stacking scale degrees — every semitone
  // is "in scale", so a stack would be a cluster. `parseScaleString` does not know the
  // word "Atonal" (it falls back to minor), so the raw string is checked too; one genre
  // in the library uses it.
  if (scaleId === "chromatic" || /atonal|chrom/i.test(scale ?? "")) {
    const stack = density === "seventh" ? [0, 7, 12, 19] : CHROMATIC_STACK;
    return stack.map((semi) => rootMidi + semi);
  }

  const degrees = (SCALES[scaleId] ?? SCALES.minor).intervals;
  if (degrees.length === 0) return [rootMidi];

  const keyRootPc = NOTE_NAMES.indexOf(keyRoot as (typeof NOTE_NAMES)[number]);
  const rootPc = ((rootMidi % 12) + 12) % 12;
  const relInterval = (((rootPc - keyRootPc) % 12) + 12) % 12;

  // Which scale degree is this chord root? This is what makes the harmony follow the
  // key: in C minor the b3 degree (Eb) must produce an Eb MAJOR triad, not another
  // minor one. A stack that ignores this always returns the tonic chord.
  let degreeIndex = degrees.indexOf(relInterval);
  if (degreeIndex === -1) {
    // Authored data can sit outside its declared key. Snap to the nearest degree so the
    // chord still belongs to the key rather than silently becoming the tonic.
    degreeIndex = 0;
    let best = Infinity;
    for (let i = 0; i < degrees.length; i++) {
      const distance = Math.abs(degrees[i] - relInterval);
      if (distance < best) {
        best = distance;
        degreeIndex = i;
      }
    }
  }

  const degreeSteps = density === "seventh" ? [0, 2, 4, 6] : [0, 2, 4];

  return degreeSteps.map((step) => {
    const idx = degreeIndex + step;
    const octave = Math.floor(idx / degrees.length);
    const semitone = degrees[idx % degrees.length] + octave * 12;
    // Measure from the degree we resolved (not from `relInterval`): when the authored
    // root sits outside its declared key the two differ, and measuring from
    // `relInterval` produced a negative offset — a note *below* the authored bass note.
    let offset = semitone - degrees[degreeIndex];
    // Fold a too-wide upper voice down an octave, but never below/onto the root.
    while (offset > span && offset - 12 > 0) offset -= 12;
    return rootMidi + offset;
  });
}

/**
 * Per-voice amplitude scale so a 3- or 4-note voicing is not simply louder than the
 * single note it replaces.
 *
 * Voices are uncorrelated, so their power sums: scaling each by `1/sqrt(n)` holds the
 * chord's RMS at roughly the single-note level while staying inside the same headroom.
 * Without this, adding harmony would read as a level jump and push the master limiter
 * harder on every genre at once — the opposite of the intended improvement.
 */
export function chordVoiceGain(voiceCount: number): number {
  if (!Number.isFinite(voiceCount) || voiceCount <= 0) return 1;
  return 1 / Math.sqrt(voiceCount);
}

/**
 * Stagger between the notes of one voicing, in seconds.
 *
 * This is an onset-realism choice, not a level fix. Every oscillator starts at phase 0,
 * so a triad's three notes otherwise begin as one flat "clack"; a few milliseconds of
 * roll is how a keyboardist or guitarist actually plays a chord.
 *
 * **It was tried as a level fix and does not work as one.** The hope was that
 * decorrelating the attacks would stop the triad's peaks summing into the master
 * limiter, but a full 159-genre re-measure showed the library only moved from −16.95 to
 * −17.09 LUFS target — i.e. 0.14 dB *worse*, within run-to-run noise. A constant time
 * offset is a constant phase offset, so sustained tones stay mutually coherent; it
 * shifts the sum rather than decorrelating it. (It does not comb-filter either: the
 * chord tones are at different frequencies, so nothing is a delayed copy of itself.)
 *
 * The real cause of the level shift is that a three-note chord has a higher peak, which
 * engages the master limiter harder and pumps the *whole* mix down — the behaviour
 * behind N-15. It is handled the sanctioned way, by re-measuring and re-fitting the
 * per-genre trims, and it is further evidence for E-12 (a true-peak lookahead limiter).
 */
export const CHORD_STRUM_SEC = 0.003;
