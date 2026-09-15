#!/usr/bin/env node
/**
 * Genre loudness spread gate (feat/genre-mix-loudness).
 *
 * Reads the committed baseline produced by `scripts/measure_genre_loudness.mjs` and
 * fails when the post-trim loudness spread across the 159 genres grows past what the
 * loudness-matching work claims. Deliberately offline and browser-free: the
 * measurement itself needs Chromium (slow track), but *checking* the recorded numbers
 * is a file read and must stay cheap.
 *
 *   node scripts/check_loudness_spread.mjs [--report=path] [--max-p90p10=1.5]
 *
 * Threshold justification (`MAX_P90P10_DB = 1.5`):
 *  - the pre-trim spread measured by the same script is ~5 dB, so this is a real gate,
 *    not a formality;
 *  - the renderer's noise-based drum voices move a single genre by <0.1 dB across
 *    repeats, so the gate is not sitting on measurement noise;
 *  - ~2 dB is roughly where a level step becomes obvious when switching genres, and
 *    1.5 dB keeps a margin under that while still being achievable with a pre-limiter
 *    master trim (the limiter absorbs a fraction of large corrections).
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const argValue = (flag, fallback) => {
  const inline = argv.find((a) => a.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const MAX_P90P10_DB = Number(argValue("--max-p90p10", "1.5"));
const MAX_FULL_RANGE_DB = Number(argValue("--max-range", "4"));
const reportPath = path.resolve(ROOT, argValue("--report", "scripts/loudness.baseline.json"));
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const problems = [];
const oks = [];

if (!fs.existsSync(reportPath)) {
  console.error(`❌ loudness report not found: ${path.relative(ROOT, reportPath)}`);
  console.error("   run: node scripts/measure_genre_loudness.mjs");
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const rel = path.relative(ROOT, reportPath);

if (report.subset || report.limit) {
  problems.push(`${rel} is a SUBSET run (limit=${report.limit}); the gate needs the full 159-genre baseline`);
}
if (!report.genres || typeof report.genres !== "object") {
  problems.push(`${rel} has no per-genre table`);
}

const entries = Object.entries(report.genres || {});
const expectedCount = report.genreCount;
if (entries.length !== expectedCount) {
  problems.push(`${rel} declares ${expectedCount} genres but carries ${entries.length}`);
}

const missingTrim = entries.filter(([, g]) => !Number.isFinite(g.trimmedLufs));
if (missingTrim.length > 0) {
  problems.push(
    `${missingTrim.length} genre(s) have no post-trim measurement: ${missingTrim
      .slice(0, 8)
      .map(([id]) => id)
      .join(", ")}`
  );
}

const { min, max } = report.trimRangeDb || {};
const outOfRange = entries.filter(
  ([, g]) => !Number.isFinite(g.trimDb) || g.trimDb < min || g.trimDb > max
);
if (outOfRange.length > 0) {
  problems.push(
    `${outOfRange.length} trim(s) outside [${min}, ${max}] dB: ${outOfRange
      .slice(0, 8)
      .map(([id]) => id)
      .join(", ")}`
  );
}

const after = report.spread?.after;
const before = report.spread?.arrangedBefore;
const gatedMetric = report.metric?.primary === "rms" ? "raw RMS (dBFS)" : "LUFS (BS.1770-4 gated integrated)";
if (!after) {
  problems.push(`${rel} has no spread.after block`);
} else {
  const okP90 = after.p90p10 <= MAX_P90P10_DB;
  const okRange = after.fullRange <= MAX_FULL_RANGE_DB;
  const line =
    `post-trim ${gatedMetric} spread p90−p10 ${after.p90p10.toFixed(2)} dB (limit ${MAX_P90P10_DB})` +
    `, full range ${after.fullRange.toFixed(2)} dB (limit ${MAX_FULL_RANGE_DB})` +
    (before ? `, pre-trim ${before.p90p10.toFixed(2)} dB` : "");
  if (okP90 && okRange) {
    oks.push(`${rel}: ${line}`);
  } else {
    problems.push(
      `[gated metric: ${gatedMetric}] ${rel}: ${line} — outliers: min ${after.minGenre} ` +
        `${after.min.toFixed(2)}, max ${after.maxGenre} ${after.max.toFixed(2)}`
    );
  }
}

// A silent clamp is exactly how a real outlier hides: the report must state the count.
if (!report.clampHits || !Number.isFinite(report.clampHits.total)) {
  problems.push(`${rel} does not report clampHits — a silent clamp would hide an unmatchable genre`);
} else {
  oks.push(
    `trim clamp hits: ${report.clampHits.total} of ${expectedCount} ` +
      `(min ${report.clampHits.min}, max ${report.clampHits.max})`
  );
}

// ---------------------------------------------------------------------------
// Report <-> table agreement, and proof the feature is actually wired.
//
// The spread check above validates the report against itself; on its own it passes
// happily while every genre plays at unity trim because `src/data/genreMix.ts` (what
// playback and export read) was never updated. These checks close that loop.
// ---------------------------------------------------------------------------
const MIX_PATH = "src/data/genreMix.ts";
const mixSource = read(MIX_PATH);
const tableTrims = new Map(
  [...mixSource.matchAll(/^\s{2}"([a-z0-9-]+)":\s*\{\s*category:\s*"[^"]+",\s*loudnessTrimDb:\s*(-?[\d.]+)/gm)].map(
    (m) => [m[1], Number(m[2])]
  )
);

const missingFromTable = entries.filter(([id]) => !tableTrims.has(id)).map(([id]) => id);
const orphansInTable = [...tableTrims.keys()].filter((id) => !report.genres[id]);
const trimDrift = entries
  .filter(([id, g]) => tableTrims.has(id) && Math.abs(tableTrims.get(id) - g.trimDb) > 0.01)
  .map(([id, g]) => `${id}: table ${tableTrims.get(id)} vs report ${g.trimDb}`);

if (missingFromTable.length || orphansInTable.length || trimDrift.length) {
  problems.push(
    `${MIX_PATH} and ${rel} disagree: ` +
      `${missingFromTable.length} missing from table, ${orphansInTable.length} orphan(s) in table, ` +
      `${trimDrift.length} drifted` +
      (trimDrift.length ? ` (${trimDrift.slice(0, 5).join("; ")})` : "") +
      " — run: node scripts/apply_loudness_trims.mjs"
  );
} else {
  oks.push(`${MIX_PATH}: all ${tableTrims.size} trims match the report`);
}

const allTableTrimsZero = [...tableTrims.values()].every((v) => v === 0);
const reportHasNonZero = entries.some(([, g]) => g.trimDb !== 0);
if (allTableTrimsZero && reportHasNonZero) {
  problems.push(
    `${MIX_PATH} has 159 zero trims while ${rel} has non-zero trims — the loudness feature is inert`
  );
}

/* Wiring: the loudness-trim stage must exist as its own node placed after the FX rack and
 * before the limiter, and the offline renderer must apply the same gain. If someone deletes
 * or reorders it, this gate fails even though every number in the report still looks perfect.
 *
 * Note what this gate can and cannot see: it checks the *recorded* numbers for internal
 * consistency (spread, clamp, trims matching the mix table) plus this topology. It never
 * re-renders, so a change that alters the actual loudness without touching the trim table
 * will not trip it — that is what the measurement (slow track) is for. That gap is exactly
 * how the baseline went stale after the chord-voicing and bus work while this gate stayed
 * green; see `AUDIO_QUALITY_AND_SYNTH_PLAN.md` §4.14. */
const audioSource = read("src/audio/AudioEngine.ts");
const wavSource = read("src/audio/WavExporter.ts");
const storeSource = read("src/features/sequencer/useSequencerStore.ts");
/**
 * E-17 moved the master chain (fader → FX rack → loudness trim → limiter) into one shared builder,
 * so asserting the chain edges inside each engine file would now fail on a graph that is
 * *more* correct than before — the two engines can no longer diverge at all. The assertions
 * below therefore check the builder for the topology and the engines for using it.
 */
const graphSource = read("src/audio/masterGraph.ts");
const wiring = [
  ["masterGraph declares the separate trim stage", /loudnessTrimGain = ctx\.createGain\(\)/],
  ["masterGraph feeds the FX rack from the fader", /masterGain\.connect\(fxRack\.inputNode\)/],
  // The trim must be the last LINEAR stage: placed before the rack, its correction is
  // absorbed by the rack's saturation (measured 2026-09-16: a +7.07 dB request moved the
  // integrated loudness by 1.74 dB). These two assertions are the topology that fixes it.
  ["masterGraph places the trim after the FX rack", /fxRack\.outputNode\.connect\(loudnessTrimGain\)/],
  ["masterGraph places the limiter after the trim", /loudnessTrimGain\.connect\(limiter\.input\)/],
  ["the live engine builds the shared graph", /buildMasterGraph\(this\.ctx/],
  ["the offline renderer builds the shared graph", /buildMasterGraph\(ctx/],
  ["AudioEngine derives the trim from the pattern's genre", /getGenreLoudnessTrimDb\(pattern\.genre_id\)/],
  ["the trim is written only through the graph", /setLoudnessTrimDb\(this\.appliedLoudnessTrimDb\)/],
  ["the studio seeds the arranged mix on genre entry", /patternFromGenre/],
];
const unwired = wiring
  .filter(([, pattern]) => !pattern.test(audioSource + wavSource + storeSource + graphSource))
  .map(([label]) => label);
if (unwired.length) {
  problems.push(`loudness wiring missing: ${unwired.join(", ")}`);
} else {
  oks.push(`wiring: master trim stage + offline parity + genre-entry seeding present`);
}
oks.push(`target loudness: ${report.target ?? report.targetLufs} (${report.targetMetric ?? "median of the library"})`);

/* N-15 / E-12 — the master ceiling must actually hold ---------------------------
 * Before the true-peak lookahead limiter landed, the master "limiter" was a
 * DynamicsCompressorNode with a 3 ms attack, and the 16-bit encoder hard-clipped the
 * result: **121 of 159 genres rendered sample peaks above 0 dBFS** (worst +1.63 dBFS).
 * Now that the ceiling is a real one, this gate keeps it from silently regressing —
 * measuring a true peak is the only way to see an inter-sample overshoot, and a
 * sample-peak-only check would miss exactly the failure the limiter exists to prevent.
 */
const CEILING_DBTP = Number(argValue("--ceiling-dbtp", "-1"));
/** The limiter's detector and this meter are separate estimators; a few thousandths of
 *  a dB of disagreement is numerical, not an audible overshoot. */
const TRUE_PEAK_TOLERANCE_DB = Number(argValue("--true-peak-tolerance", "0.02"));

const truePeakOf = (g) =>
  Number.isFinite(g.trimmedTruePeakDb)
    ? g.trimmedTruePeakDb
    : Number.isFinite(g.arrangedTruePeakDb)
      ? g.arrangedTruePeakDb
      : Number.isFinite(g.legacyTruePeakDb)
        ? g.legacyTruePeakDb
        : null;

const truePeaks = entries
  .map(([id, g]) => ({ id, db: truePeakOf(g), samplePeakDb: g.trimmedPeakDb ?? g.arrangedPeakDb ?? g.legacyPeakDb }))
  .filter((r) => r.db !== null);

if (truePeaks.length === 0) {
  problems.push(
    `${rel} carries no true-peak measurement — re-run the measurement so the N-15 ceiling can be verified`
  );
} else {
  const clipped = truePeaks.filter((r) => Number.isFinite(r.samplePeakDb) && r.samplePeakDb > 0);
  if (clipped.length > 0) {
    problems.push(
      `${clipped.length}/${truePeaks.length} genre(s) still exceed 0 dBFS sample peak (the 16-bit encoder hard-clips these): ` +
        clipped
          .sort((a, b) => b.samplePeakDb - a.samplePeakDb)
          .slice(0, 5)
          .map((r) => `${r.id} ${r.samplePeakDb.toFixed(2)}`)
          .join(", ")
    );
  } else {
    oks.push(`clipping: 0/${truePeaks.length} genres exceed 0 dBFS sample peak (N-15)`);
  }

  const overCeiling = truePeaks
    .filter((r) => r.db > CEILING_DBTP + TRUE_PEAK_TOLERANCE_DB)
    .sort((a, b) => b.db - a.db);
  if (overCeiling.length > 0) {
    problems.push(
      `${overCeiling.length}/${truePeaks.length} genre(s) exceed the ${CEILING_DBTP} dBTP ceiling by more than ${TRUE_PEAK_TOLERANCE_DB} dB: ` +
        overCeiling
          .slice(0, 5)
          .map((r) => `${r.id} ${r.db.toFixed(3)}`)
          .join(", ")
    );
  } else {
    const worst = [...truePeaks].sort((a, b) => b.db - a.db)[0];
    oks.push(
      `true peak: worst ${worst.db.toFixed(3)} dBTP (${worst.id}) vs a ${CEILING_DBTP} dBTP ceiling`
    );
  }
}

// The gate always runs on the report's primary metric; the other metric's post-trim
// spread is reported for transparency (see the metric notes in the report).
const otherKey = report.metric?.primary === "rms" ? "lufs" : "rms";
const other = report.spread?.[otherKey]?.after;
if (other) {
  oks.push(
    `informational: post-trim spread in the OTHER metric (${otherKey}) ` +
      `p90−p10 ${other.p90p10.toFixed(2)} dB, full range ${other.fullRange.toFixed(2)} dB`
  );
}

console.log("===============================================================");
console.log("  🔊 GENRE LOUDNESS SPREAD GATE");
console.log("===============================================================");
for (const line of oks) console.log(`✅ ${line}`);
if (problems.length > 0) {
  console.log("");
  for (const line of problems) console.error(`❌ ${line}`);
  console.error(
    `\n❌ ${problems.length} loudness-spread problem(s). Re-run node scripts/measure_genre_loudness.mjs and update src/data/genreMix.ts trims before landing.`
  );
  process.exit(1);
}
console.log(`\n✅ Genre loudness is matched within the documented threshold.`);
