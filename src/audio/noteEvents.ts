/**
 * Shared, deterministic note-decision helpers for the offline exporters (N-04).
 *
 * The three exporters used to disagree about per-step probability:
 *   - `MidiExporter` / `AbletonExporter` only skipped `probability <= 0`, so a hit
 *     with a 30% chance was exported 100% of the time;
 *   - `WavExporter` rolled `Math.random()`, so two renders of the same pattern
 *     produced different audio and could not be reproduced.
 *
 * Live playback should stay random (that is the point of the feature), but an export
 * is a document: the same project must produce the same notes, in every format.
 * These helpers give every exporter the SAME decision for a given (track, step,
 * sub-hit) without forcing them into one shared traversal.
 */

/** Deterministic 32-bit hash of a string (FNV-1a). */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Stable seed for a pattern, so the same project always exports the same notes. */
export function patternSeed(pattern: { genre_id?: string; bpm?: number; totalSteps?: number }): string {
  return `${pattern.genre_id ?? "pattern"}|${pattern.bpm ?? 120}|${pattern.totalSteps ?? 16}`;
}

/**
 * Rolls a per-trigger 0..99 value from a stable key. Two exporters computing this
 * with the same key always agree, and re-exporting the same project is idempotent.
 */
export function deterministicRoll(seed: string, trackIdx: number, stepIdx: number, subIdx = 0): number {
  return hashString(`${seed}:${trackIdx}:${stepIdx}:${subIdx}`) % 100;
}

/** Probability 0..100 (undefined = always). Returns true when the hit should sound. */
export function probabilityPasses(
  probability: number | undefined,
  seed: string,
  trackIdx: number,
  stepIdx: number,
  subIdx = 0
): boolean {
  if (probability === undefined) return true;
  if (!Number.isFinite(probability)) return true;
  if (probability >= 100) return true;
  if (probability <= 0) return false;
  return deterministicRoll(seed, trackIdx, stepIdx, subIdx) < probability;
}

/** Ratchet/subdivision count for a step: explicit ratchet wins, hat triplets default to 3. */
export function resolveRatchet(
  explicit: number | undefined,
  isHatTriplet: boolean
): number {
  if (explicit !== undefined && Number.isFinite(explicit) && explicit > 1) {
    return Math.max(1, Math.min(8, Math.floor(explicit)));
  }
  return isHatTriplet ? 3 : 1;
}

/** Velocity taper applied across ratchet sub-hits (identical in every exporter). */
export function ratchetVelocityScale(subIdx: number, ratchet: number): number {
  return 0.85 + (subIdx / ratchet) * 0.15;
}

/**
 * P0.2 — the velocity range a humanised hit may move, in MIDI steps, at `amount === 1`.
 *
 * Fourteen is a little over 10% of the 1..127 range. With the per-category amounts in
 * `genreMix` (0.07..0.34) that is a ±1..5 step spread per lane: wide enough that a lane
 * stops reading as one machine-gun value, narrow enough that the mix does not appear to
 * wobble between two passes of the same loop.
 */
export const HUMANISE_MAX_VELOCITY = 14;

/** Clamp into the MIDI velocity range every renderer and exporter agrees on (1..127). */
export function clampVelocity(velocity: number): number {
  if (!Number.isFinite(velocity)) return 100;
  return Math.max(1, Math.min(127, Math.round(velocity)));
}

/**
 * P0.2 — deterministic per-hit velocity humanisation.
 *
 * A pattern's velocities are authored, then repeated: a lane written as "all 100s" renders
 * as a MIDI dump, and `check:groove` counts it (`flatTracks`). This spreads each sounding
 * hit around its authored value by a stable amount, so the same project always produces
 * the same notes — the property the rest of this file exists to protect.
 *
 * The roll is salted (`:vel`) on purpose. `probabilityPasses` reads `deterministicRoll` at
 * the same `(track, step)` key, so an unsalted roll would correlate the two: a 30% gate
 * keeps `roll < 30`, which would then always receive the *quiet* half of the humanisation.
 *
 * `amount <= 0`, a non-finite amount, or an unknown genre (the caller's job) is the
 * identity, which keeps every pre-P0.2 fixture and every custom genre bit-identical.
 */
export function humaniseVelocity(
  velocity: number,
  seed: string,
  trackIdx: number,
  stepIdx: number,
  amount: number,
  subIdx = 0
): number {
  if (!(amount > 0) || !Number.isFinite(amount)) return clampVelocity(velocity);
  const roll = deterministicRoll(`${seed}:vel`, trackIdx, stepIdx, subIdx);
  const signed = (roll / 99) * 2 - 1; // -1..1 across the full 0..99 roll space
  return clampVelocity(velocity + signed * amount * HUMANISE_MAX_VELOCITY);
}
