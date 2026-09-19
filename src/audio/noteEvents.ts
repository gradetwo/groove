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
