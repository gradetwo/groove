import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { ALL_GENRES } from "../data/genres";
import {
  CATEGORY_MIX_PROFILES,
  GENRE_MIX,
  GENRE_MIX_RESOLVED,
  LOUDNESS_TRIM_MAX_DB,
  LOUDNESS_TRIM_MIN_DB,
  MIX_TRACK_IDS,
} from "../data/genreMix";

/**
 * The committed loudness baseline (`scripts/loudness.baseline.json`) and the trims in
 * `src/data/genreMix.ts` are two halves of one decision: the table is what playback
 * applies, the report is the evidence that it makes all 159 genres land together. This
 * test fails the moment they drift, without needing a browser.
 */
const REPORT_PATH = path.resolve(process.cwd(), "scripts/loudness.baseline.json");

interface SpreadStats {
  p10: number;
  p90: number;
  p90p10: number;
  min: number;
  max: number;
  minGenre: string | null;
  maxGenre: string | null;
  fullRange: number;
}

interface MetricSpread {
  legacyBefore: SpreadStats;
  arrangedBefore: SpreadStats;
  after: SpreadStats;
}

interface LoudnessReport {
  subset: boolean;
  limit: number | null;
  genreCount: number;
  bars: number;
  repeats: number;
  targetLufs: number;
  metric: { primary: string; primaryLabel: string };
  trimRangeDb: { min: number; max: number };
  clampHits: { min: number; max: number; total: number };
  /** Primary-metric passes, plus both metric views for the LUFS-vs-RMS tradeoff. */
  spread: MetricSpread & { metric: string; lufs: MetricSpread; rms: MetricSpread };
  genres: Record<
    string,
    {
      category: string;
      arrangedLufs: number;
      legacyLufs: number;
      trimDb: number;
      trimmedLufs: number | null;
      trimmedPeakDb: number | null;
      withinGenreSpreadDb: number;
    }
  >;
  unmeasured: unknown[];
}

function loadReport(): LoudnessReport {
  expect(fs.existsSync(REPORT_PATH), `missing ${REPORT_PATH}`).toBe(true);
  return JSON.parse(fs.readFileSync(REPORT_PATH, "utf8")) as LoudnessReport;
}

describe("committed loudness baseline", () => {
  it("covers exactly the 159 genres and is a full-library run", () => {
    const report = loadReport();
    expect(report.subset).toBe(false);
    expect(report.limit).toBeNull();
    expect(report.genreCount).toBe(159);
    expect(Object.keys(report.genres).sort()).toEqual(ALL_GENRES.map((g) => g.id).sort());
    expect(report.unmeasured).toEqual([]);
  });

  it("carries a post-trim measurement and peak for every genre", () => {
    const report = loadReport();
    for (const [id, entry] of Object.entries(report.genres)) {
      expect(Number.isFinite(entry.trimmedLufs), `${id} trimmedLufs`).toBe(true);
      expect(Number.isFinite(entry.trimmedPeakDb), `${id} trimmedPeakDb`).toBe(true);
      expect(Number.isFinite(entry.arrangedLufs), `${id} arrangedLufs`).toBe(true);
      expect(Number.isFinite(entry.legacyLufs), `${id} legacyLufs`).toBe(true);
    }
  });

  it("matches the trim table that playback and export actually apply", () => {
    const report = loadReport();
    const drifted = Object.entries(report.genres)
      .filter(([id, entry]) => GENRE_MIX[id]?.loudnessTrimDb !== entry.trimDb)
      .map(([id, entry]) => `${id}: table ${GENRE_MIX[id]?.loudnessTrimDb} vs report ${entry.trimDb}`);
    expect(drifted).toEqual([]);
  });

  it("keeps the documented clamp range in sync with the code", () => {
    const report = loadReport();
    expect(report.trimRangeDb).toEqual({ min: LOUDNESS_TRIM_MIN_DB, max: LOUDNESS_TRIM_MAX_DB });
    for (const [id, entry] of Object.entries(report.genres)) {
      expect(entry.trimDb, id).toBeGreaterThanOrEqual(LOUDNESS_TRIM_MIN_DB);
      expect(entry.trimDb, id).toBeLessThanOrEqual(LOUDNESS_TRIM_MAX_DB);
    }
  });

  it("records the before and after spreads the matching claims", () => {
    const report = loadReport();
    const before = report.spread.arrangedBefore;
    const after = report.spread.after;
    expect(before).toBeTruthy();
    expect(after).toBeTruthy();
    // The trim must actually equalise the library, not just look plausible.
    expect(after.p90p10).toBeLessThan(before.p90p10);
    expect(after.fullRange).toBeLessThan(before.fullRange);
    // Both metric views are committed so the LUFS-vs-RMS tradeoff is visible in the
    // artefact itself, not only in prose.
    expect(report.metric.primary).toBe("lufs");
    for (const view of ["lufs", "rms"] as const) {
      expect(report.spread[view], `${view} view`).toBeTruthy();
      for (const pass of ["legacyBefore", "arrangedBefore", "after"] as const) {
        expect(Number.isFinite(report.spread[view][pass].p90p10), `${view}.${pass}`).toBe(true);
      }
    }
    // The gate's own threshold: the committed post-trim LUFS spread must pass it.
    expect(report.spread.lufs.after.p90p10).toBeLessThanOrEqual(1.5);
    expect(report.spread.lufs.after.fullRange).toBeLessThanOrEqual(4);
    // The offline renderer re-creates its noise buffer per render, so run-to-run
    // variation is real but tiny; the report must show it when it measured repeats.
    expect(report.repeats).toBeGreaterThanOrEqual(1);
    expect(report.bars).toBeGreaterThanOrEqual(1);
    if (report.repeats > 1) {
      for (const [id, entry] of Object.entries(report.genres)) {
        expect(entry.withinGenreSpreadDb, `${id} render noise`).toBeLessThan(0.5);
      }
    }
  });

  it("measures the arranged per-genre mix, not the legacy six-bucket placeholder", () => {
    const report = loadReport();
    const perCategory = new Map<string, number>();
    let deviating = 0;
    for (const [id, entry] of Object.entries(report.genres)) {
      const genre = ALL_GENRES.find((g) => g.id === id)!;
      perCategory.set(genre.category, (perCategory.get(genre.category) ?? 0) + 1);
      expect(entry.category).toBe(genre.category);
      const base = CATEGORY_MIX_PROFILES[genre.category];
      const resolved = GENRE_MIX_RESOLVED[id];
      if (MIX_TRACK_IDS.some((track) => resolved[track].volume !== base[track].volume || resolved[track].pan !== base[track].pan)) {
        deviating++;
      }
    }
    // Every category is represented, and most genres genuinely step away from their
    // category base (the per-genre "arranged for this genre" part of the request).
    expect(perCategory.size).toBe(6);
    expect([...perCategory.values()].reduce((a, b) => a + b, 0)).toBe(159);
    expect(deviating).toBeGreaterThanOrEqual(100);
  });
});
