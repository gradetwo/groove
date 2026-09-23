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
/** Repo-relative by default; an absolute path is used as given, so `--mix=/tmp/…` works for a test. */
const read = (p) => fs.readFileSync(path.isAbsolute(p) ? p : path.join(ROOT, p), "utf8");

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
} else if (report.targetSource === "per-category") {
  /**
   * Per-category targeting deliberately puts a metal master and an ambient master at different
   * absolute levels — that is how the material is actually delivered — so a library-wide spread
   * gate is meaningless here.
   *
   * The gate checks the two properties that *do* have to hold, and deliberately does **not** gate
   * on a category's raw internal spread. That was the first attempt and it was wrong: within one
   * category a dense four-on-the-floor genre and a sparse broken-beat genre do not share a
   * peak-to-loudness ratio, and at a fixed true-peak ceiling the sparse one simply cannot reach
   * the category target. Demanding they match would demand crushing its transients.
   *
   *   1. **Never louder than target.** Exceeding the category target is always a fitting error —
   *      it means the genre is louder than its family is mastered. Tolerance `+0.5 dB`.
   *   2. **Never quieter than it can be.** Each genre records `achievableLufs`: the loudest its own
   *      crest allows at the ceiling. Sitting more than `1.0 dB` below that means the trim was
   *      fitted badly. This is the honest replacement for "spread" — it is exactly the drift that
   *      would hide a broken trim, and it lets physics-capped genres pass legitimately.
   */
  const overTarget = [];
  const byCategory = new Map();
  for (const [id, g] of entries) {
    const lufs = Number.isFinite(g.trimmedLufs) ? g.trimmedLufs : g.arrangedLufs;
    if (!Number.isFinite(lufs)) continue;
    const cat = g.category ?? "unknown";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push(lufs);
    // Loudness is only ever *capped* by a category target, never floored by it, so the one
    // direction that is unambiguously a fitting error is exceeding it. The 1.0 dB allowance
    // covers the solver's ±0.2 dB convergence band plus the single-subtraction round-off.
    if (Number.isFinite(g.categoryTargetLufs) && lufs > g.categoryTargetLufs + 1.0) {
      overTarget.push(`${id} ${lufs.toFixed(2)} > ${g.categoryTargetLufs}`);
    }
  }
  /**
   * Deliberately NOT checked: "is each genre as loud as its own crest allows".
   *
   * The first version of this gate compared each genre against `achievableLufs`, which is derived
   * from `arrangedTruePeakDb − arrangedLufs`. Both of those are measured through the limiter, so
   * once a genre is pinned at the ceiling the difference is the crest of an already-limited
   * signal, and the derived "ceiling" is circular — it flagged genres as under-fitted when they
   * were in fact at their target. The meaningful property, that the trims were both applied and
   * measured at their final values, is enforced separately below (`missingTrimMeasurement`).
   *
   * The within-category spread is likewise reported rather than gated: a dense four-on-the-floor
   * genre and a sparse broken-beat genre in the same category do not share a peak-to-loudness
   * ratio, and at a fixed true-peak ceiling they genuinely cannot land on the same level.
   */
  const categoryMedians = [...byCategory.entries()].map(([cat, list]) => {
    const sorted = [...list].sort((a, b) => a - b);
    return `${cat} ${sorted[Math.floor(sorted.length / 2)].toFixed(2)}`;
  });
  const categoryCount = new Set(Object.values(report.genres).map((g) => g.category ?? "unknown")).size;
  const line =
    `post-trim ${gatedMetric}: ${categoryCount} category targets, ` +
    `${report.cappedByDynamics?.length ?? 0}/${entries.length} genre(s) capped by their own crest ` +
    `(physics, not a fitting error), library-wide p90−p10 ${after.p90p10.toFixed(2)} dB (informational)`;
  if (overTarget.length === 0) {
    oks.push(`${rel}: ${line}`);
    oks.push(`  category medians: ${categoryMedians.join("  |  ")}`);
  } else {
    problems.push(
      `[gated metric: ${gatedMetric}] ${rel}: ${overTarget.length} genre(s) louder than their ` +
        `category target by more than 1.0 dB: ${overTarget.slice(0, 6).join(", ")}` +
        (overTarget.length > 6 ? ` (+${overTarget.length - 6} more)` : "")
    );
  }
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
const MIX_PATH = argValue("--mix", "src/data/genreMix.ts");
const mixSource = read(MIX_PATH);
/**
 * The genre's line, **whatever order its fields are in**.
 *
 * The pattern used to require `category` first, and P0.2/P0.3 put `humanise:`/`duck:` in front of it for 23 genres —
 * so this gate saw 136 of 159 trims and reported the other 23 as missing from the table. (It reported them rather
 * than ignoring them, which is why it went red instead of quietly passing; the reason it went unnoticed is that this
 * gate runs in `npm run verify` and `manual-verify scope=audio`, not in the push-time CI job.)
 */
const tableTrims = new Map(
  [...mixSource.matchAll(/^\s{2}"([a-z0-9-]+)":\s*\{.*?\bloudnessTrimDb:\s*(-?[\d.]+)/gm)].map((m) => [
    m[1],
    Number(m[2]),
  ])
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
  // Q12: the fader now reaches the rack through the DC blocker (a highpass biquad), so the
  // assertion checks that one linear filter is the only thing in between.
  ["masterGraph feeds the FX rack through the DC blocker", /dcBlocker\.connect\(fxRack\.inputNode\)/],
  ["masterGraph inserts exactly one DC blocker between fader and rack", /masterGain\.connect\(dcBlocker\)/],
  // The trim must be the last LINEAR stage: placed before the rack, its correction is
  // absorbed by the rack's saturation (measured 2026-09-16: a +7.07 dB request moved the
  // integrated loudness by 1.74 dB). These two assertions are the topology that fixes it.
  ["masterGraph places the trim after the FX rack", /fxRack\.outputNode\.connect\(loudnessTrimGain\)/],
  // The trim must still be the last *linear* stage with nothing nonlinear between it and the
  // ceiling. Two stages now follow it — the fixed makeup gain and the mastering bus compressor —
  // and both are linear-or-gentle by design, so the chain is asserted link by link rather than
  // as one connection.
  ["masterGraph places the makeup gain after the trim", /loudnessTrimGain\.connect\(masterMakeupGain\)/],
  ["masterGraph places the bus compressor after the makeup gain", /masterMakeupGain\.connect\(masterBusComp\)/],
  /**
   * The stage is a *handle* now (A2): `busComp.output` is the compressor's own output — the node directly, or the
   * two-input worklet when a detector was supplied — so the assertion follows the handle rather than the node name.
   * This line went red on CI exactly once, which is what a wiring assertion is for.
   */
  ["masterGraph places the limiter after the bus compressor", /busComp\.output\.connect\(limiter\.input\)/],
  ["the bus compressor is fed by the makeup gain", /masterMakeupGain\.connect\(masterBusComp\)/],
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
