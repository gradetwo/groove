/**
 * The loudness-baseline freshness check, at the level a unit test can reach.
 *
 * The rendering half lives in `scripts/measure_genre_loudness.mjs --sample=N` (it needs the same
 * Vite + Chromium path every other audio measurement uses). These tests cover the two decisions that
 * make the sample evidence: *which* genres get re-rendered, and *what* counts as drift.
 *
 * The self-checks matter as much as the assertions: a sampler that quietly returned the first N
 * genres, or a drift check that reported nothing, would both look like a passing gate.
 */
import { describe, it, expect } from "vitest";
import {
  LOUDNESS_FRESHNESS_TOLERANCE_DB,
  freshnessToleranceFor,
  loudnessDrift,
  sampleGenreIds,
  type LoudnessBaseline,
} from "../utils/loudnessFreshness";

const CATALOG = Array.from({ length: 159 }, (_, i) => `genre-${String(i).padStart(3, "0")}`);

describe("loudness freshness · which genres to re-render", () => {
  it("spreads the sample across the whole catalog instead of taking a prefix", () => {
    const sample = sampleGenreIds(CATALOG, 3);
    expect(sample).toHaveLength(3);
    // The catalog is grouped by family, so a prefix would sample one family — and the incident this
    // guard exists for was family-shaped (every bell user drifted together).
    expect(sample[0]).toBe("genre-000");
    expect(sample[1]).toBe("genre-053");
    expect(sample[2]).toBe("genre-106");
    expect(sample.filter((id) => CATALOG.indexOf(id) < 53)).toHaveLength(1);
  });

  it("is deterministic and never repeats a genre", () => {
    expect(sampleGenreIds(CATALOG, 7)).toEqual(sampleGenreIds(CATALOG, 7));
    const sample = sampleGenreIds(CATALOG, 7);
    expect(new Set(sample).size).toBe(sample.length);
  });

  it("returns the whole catalog when asked for as many as it has — and nothing for nonsense", () => {
    expect(sampleGenreIds(CATALOG, 159)).toEqual(CATALOG);
    expect(sampleGenreIds(CATALOG, 500)).toEqual(CATALOG);
    expect(sampleGenreIds(CATALOG, 0)).toEqual([]);
    expect(sampleGenreIds(CATALOG, -3)).toEqual([]);
    expect(sampleGenreIds([], 3)).toEqual([]);
  });

  it("can actually reach every genre with enough samples", () => {
    // Guards the sampler's arithmetic: a step that rounded badly could make some ids unreachable.
    const reached = new Set(sampleGenreIds(CATALOG, 159));
    expect(reached.size).toBe(CATALOG.length);
  });
});

describe("loudness freshness · what counts as drift", () => {
  const baseline = (rows: Record<string, number>): LoudnessBaseline =>
    Object.fromEntries(Object.entries(rows).map(([id, arrangedLufs]) => [id, { arrangedLufs }]));

  it("says nothing when the re-render matches the report", () => {
    const measured = [
      { genreId: "a", arrangedLufs: -12.5 },
      { genreId: "b", arrangedLufs: -11.0 },
    ];
    expect(loudnessDrift(measured, baseline({ a: -12.5, b: -11.0 }), LOUDNESS_FRESHNESS_TOLERANCE_DB)).toEqual(
      []
    );
  });

  it("reports drift past the tolerance, worst first, with the signed delta", () => {
    const measured = [
      { genreId: "a", arrangedLufs: -12.0 }, // 0.5 louder than the report
      { genreId: "b", arrangedLufs: -15.5 }, // 3.8 quieter (the kawaii-future-bass case)
      { genreId: "c", arrangedLufs: -11.2 }, // inside the tolerance
    ];
    const drift = loudnessDrift(measured, baseline({ a: -12.5, b: -11.7, c: -11.0 }), 0.35);
    expect(drift.map((d) => d.genreId)).toEqual(["b", "a"]);
    expect(drift[0].delta).toBeCloseTo(-3.8, 6);
    expect(drift[1].delta).toBeCloseTo(0.5, 6);
  });

  it("treats a genre missing from the report as drift, not as something to skip", () => {
    // A renamed genre makes both sides wrong; skipping it would mean checking less than promised.
    const drift = loudnessDrift(
      [{ genreId: "ghost", arrangedLufs: -12 }],
      baseline({}),
      LOUDNESS_FRESHNESS_TOLERANCE_DB
    );
    expect(drift).toHaveLength(1);
    expect(drift[0].genreId).toBe("ghost");
  });

  it("is not vacuous: a report that disagrees everywhere is reported everywhere", () => {
    const measured = [
      { genreId: "a", arrangedLufs: -20 },
      { genreId: "b", arrangedLufs: -20 },
    ];
    expect(loudnessDrift(measured, baseline({ a: -12, b: -12 }), LOUDNESS_FRESHNESS_TOLERANCE_DB)).toHaveLength(2);
  });

  it("keeps the tolerance tighter than the smallest drift the stale report had", () => {
    // The stale report's smallest real drift was 0.57 dB; noise between two renders is ~0.05 dB.
    expect(LOUDNESS_FRESHNESS_TOLERANCE_DB).toBeGreaterThan(0.05);
    expect(LOUDNESS_FRESHNESS_TOLERANCE_DB).toBeLessThan(0.57);
  });
});

describe("the tolerance is the row's own noise floor", () => {
  const baseline = {
    quiet: { arrangedLufs: -12, withinGenreSpreadDb: 0.0 },
    noisy: { arrangedLufs: -12, withinGenreSpreadDb: 0.524 },
    unmeasured: { arrangedLufs: -12 },
  };

  it("keeps the documented floor for a deterministic row and widens only for a noisy one", () => {
    expect(freshnessToleranceFor("quiet", baseline.quiet)).toBe(LOUDNESS_FRESHNESS_TOLERANCE_DB);
    expect(freshnessToleranceFor("unmeasured", baseline.unmeasured)).toBe(LOUDNESS_FRESHNESS_TOLERANCE_DB);
    // The 2026-09-23 report: `synthwave`'s repeats differ by 0.524 dB, which is *wider* than the 0.35 dB floor — so
    // the gate would fail on a fresh, correct report whenever its sample included that row.
    expect(freshnessToleranceFor("noisy", baseline.noisy)).toBeCloseTo(1.048, 3);
    expect(freshnessToleranceFor("missing", undefined)).toBe(LOUDNESS_FRESHNESS_TOLERANCE_DB);
  });

  it("judges each sampled row at its own tolerance", () => {
    const measured = [
      { genreId: "quiet", arrangedLufs: -12.3 },
      { genreId: "noisy", arrangedLufs: -12.6 },
    ];
    // 0.3 dB of movement is not drift for either row (the floor covers it) …
    expect(loudnessDrift(measured, baseline, freshnessToleranceFor)).toEqual([]);
    // A move past the row's own band is still caught — 1.2 dB beats the noisy row's 1.048 dB, and the quiet row's
    // 0.4 dB beats the 0.35 dB floor — worst first.
    const bigger = [
      { genreId: "quiet", arrangedLufs: -12.4 },
      { genreId: "noisy", arrangedLufs: -13.2 },
    ];
    expect(loudnessDrift(bigger, baseline, freshnessToleranceFor).map((row) => row.genreId)).toEqual([
      "noisy",
      "quiet",
    ]);
    // …and a plain number keeps the old behaviour exactly, which is what makes the widening visible: the very same
    // 0.6 dB that is noise for `noisy` is drift under the library-wide floor.
    expect(loudnessDrift(measured, baseline, LOUDNESS_FRESHNESS_TOLERANCE_DB).map((row) => row.genreId)).toEqual([
      "noisy",
    ]);
  });
});
