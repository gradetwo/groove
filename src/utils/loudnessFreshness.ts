/**
 * Is the committed loudness baseline still describing reality?
 *
 * ## Why this exists
 *
 * `check_loudness_spread.mjs` validates the report against *itself*: the spread, the clamp hits, and
 * the trims in `src/data/genreMix.ts` matching the report's own numbers. Every one of those checks
 * passes when the report is stale, because a stale report is perfectly self-consistent. That is not
 * hypothetical — measured while adding the bell's partials, three control genres matched the
 * committed baseline within ±0.04 dB while five genres were off by 0.57–3.78 dB, and nothing in the
 * repository could see it. Those five genres' trims had been fitted to the old numbers, and a trim
 * can only *cut*, so they played below their category target.
 *
 * So one check has to re-render. Re-rendering all 159 genres belongs to the slow track; a
 * deterministic *sample* of them is cheap enough for `verify` and still fails the moment the report
 * stops describing the code. The pure parts live here (which genres to sample, and what counts as
 * drift) so both are unit-testable; the script does the rendering.
 */

/** One genre's rendered loudness, as measured now. */
export interface FreshLoudness {
  genreId: string;
  arrangedLufs: number;
}

/** The committed report's rows, keyed by genre id. */
export type LoudnessBaseline = Record<string, { arrangedLufs?: number } | undefined>;

export interface LoudnessDrift {
  genreId: string;
  expected: number;
  actual: number;
  /** `actual - expected`, in dB. Negative means the code now renders quieter than the report says. */
  delta: number;
}

/**
 * `count` genre ids spread evenly across the catalog, in catalog order.
 *
 * Evenly rather than randomly: the report is grouped by family, so every k-th genre samples every
 * part of the library, the selection is reproducible from the id list alone (no seed to record), and
 * a drift that affects one family — which is exactly what the bell incident was — cannot hide in an
 * unsampled block. `count >= ids.length` returns the whole catalog, which is how a full check is
 * asked for.
 */
export function sampleGenreIds(ids: readonly string[], count: number): string[] {
  if (count <= 0 || ids.length === 0) return [];
  if (count >= ids.length) return [...ids];
  const step = ids.length / count;
  const picked: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const id = ids[Math.floor(i * step)];
    // Duplicates are possible only through rounding at the very end of the list; skipping them
    // would silently sample fewer genres than asked for, so take the next one instead.
    let candidate = id;
    let probe = Math.floor(i * step);
    while (picked.includes(candidate) && probe < ids.length - 1) {
      probe += 1;
      candidate = ids[probe];
    }
    if (!picked.includes(candidate)) picked.push(candidate);
  }
  return picked;
}

/**
 * The rows whose re-rendered value no longer matches the report, worst first.
 *
 * A row missing from either side is reported as drift too: a genre that was renamed or dropped makes
 * both the report and the code wrong, and a check that skipped it would be checking less than it
 * claims. `toleranceDb` is the noise floor between two renders of the same arrangement — the
 * measurement's own repeat stability — not a margin for real drift.
 */
export function loudnessDrift(
  measured: readonly FreshLoudness[],
  baseline: LoudnessBaseline,
  toleranceDb: number
): LoudnessDrift[] {
  const drift: LoudnessDrift[] = [];
  for (const row of measured) {
    const expected = baseline[row.genreId]?.arrangedLufs;
    if (typeof expected !== "number" || !Number.isFinite(expected)) {
      drift.push({
        genreId: row.genreId,
        expected: Number.NaN,
        actual: row.arrangedLufs,
        delta: Number.NaN,
      });
      continue;
    }
    const delta = row.arrangedLufs - expected;
    if (!Number.isFinite(delta) || Math.abs(delta) > toleranceDb) {
      drift.push({ genreId: row.genreId, expected, actual: row.arrangedLufs, delta });
    }
  }
  return drift.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/**
 * How far two renders of the same arrangement may differ before it counts as drift.
 *
 * Measured: re-rendering the same genre twice moves the gated integrated loudness by ~0.05 dB, and
 * the report's own repeat-stability block records the same order of magnitude. 0.35 dB is wide
 * enough that noise cannot fail the check and an order of magnitude tighter than the 0.57 dB
 * smallest drift the stale report actually had.
 */
export const LOUDNESS_FRESHNESS_TOLERANCE_DB = 0.35;
