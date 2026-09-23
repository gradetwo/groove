/**
 * Per-note timbre variation (P2.2 / A3) — a seeded nudge so consecutive stabs are not clones.
 *
 * A 16-step loop repeats the same stab twelve times a bar, and the synth is deterministic, so those twelve hits are
 * *identical*: same oscillators, same detune, same filter, same everything. That is what makes a programmed loop
 * read as a machine rather than a performance, and it is measurable — the spectral centroid of consecutive stabs
 * does not move.
 *
 * The nudge is deliberately tiny and deliberately **seeded**, not random:
 *
 *  · `detuneCents` moves the second oscillator by a few cents, so the beating between the pair is a little different
 *    on every stab — the movement a player's hand gives a chord;
 *  · `cutoffScale` moves the filter by a few percent, which is what actually shifts the centroid the gate measures.
 *
 * `Math.random()` is not an option here: an export that did not match the audition it was rendered from would break
 * the project's exporter-parity rule (and `WavExporter` already carries the note about it). Everything comes from
 * `hashSeed`, so the same pattern renders the same file, twice, on any machine — and a *different* pattern gets a
 * different set of nudges, because the seed is the pattern's own.
 */
import { hashSeed } from "./noise";

/** The widest a per-note detune may move the second oscillator, cents. Small on purpose: this is not a pitch bend. */
export const NOTE_VARIATION_MAX_DETUNE_CENTS = 6;

/** The widest a per-note filter nudge may move the cutoff, as a fraction (0.08 = ±8 %). */
export const NOTE_VARIATION_MAX_CUTOFF_SCALE = 0.08;

export interface PolyVoiceVariation {
  /** Cents added to the preset's own second-oscillator detune. */
  detuneCents: number;
  /** Multiplier on the note's cutoff (1 = as written). */
  cutoffScale: number;
}

/** A hash in [0, 1). Two draws use different salts so detune and cutoff cannot correlate. */
function hashUnit(seed: number, trackIndex: number, step: number, noteIndex: number, salt: number): number {
  // The multiply by 0x9e3779b1 (`hashSeed`'s own mixing constant in spirit) keeps neighbouring steps from landing in
  // the same bucket, which is the failure mode `noise.ts` already documents for its own position→offset mapping.
  const mixed = hashSeed((seed ^ Math.imul(trackIndex + 1, 0x9e3779b1) ^ (step << 8) ^ noteIndex ^ salt) >>> 0);
  return mixed / 0x100000000;
}

/**
 * The variation for one note.
 *
 * `step` is the step *within the pattern* (not the bar), so a note on step 4 gets the same nudge in every bar — which
 * is what makes a loop still a loop, and what keeps the variation from smearing across a bar line.
 */
export function polyVoiceVariation(
  seed: number,
  trackIndex: number,
  step: number,
  noteIndex = 0
): PolyVoiceVariation {
  const safeSeed = Number.isFinite(seed) ? Math.floor(seed) >>> 0 : 0;
  const detuneDraw = hashUnit(safeSeed, trackIndex, step, noteIndex, 0x51ed2701);
  const cutoffDraw = hashUnit(safeSeed, trackIndex, step, noteIndex, 0x1b873593);
  return {
    detuneCents: (detuneDraw * 2 - 1) * NOTE_VARIATION_MAX_DETUNE_CENTS,
    // A *multiplier* on the cutoff, so the same nudge is a few Hz on a dark pad and a few hundred on an open lead —
    // a fixed number of Hz would be inaudible on one and a wobble on the other.
    cutoffScale: 1 + (cutoffDraw * 2 - 1) * NOTE_VARIATION_MAX_CUTOFF_SCALE,
  };
}

/**
 * The seed a render should use: the pattern's own string seed, hashed.
 *
 * `patternSeed` returns a string (it is a *label*: genre, bpm, length), so it is hashed once per render rather than
 * once per note.
 */
export function variationSeedFrom(patternSeedString: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < patternSeedString.length; i += 1) {
    h ^= patternSeedString.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
