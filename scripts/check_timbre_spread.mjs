#!/usr/bin/env node
/**
 * Genre timbre spread / distinctness gate (V-10, `AUDIO_QUALITY_AND_SYNTH_PLAN.md` §4.4).
 *
 * Reads the committed `scripts/timbre.baseline.json` produced by
 * `scripts/measure_genre_timbre.mjs` and fails when the library's timbre fingerprints are
 * internally broken (missing genres, malformed shapes, duplicated timbres) or when the
 * sources the baseline was recorded against have moved since. Deliberately offline and
 * browser-free: the measurement needs Chromium (slow track), but *checking* the recorded
 * numbers is a file read plus a few source reads and must stay cheap.
 *
 *   node scripts/check_timbre_spread.mjs [--report=path] [--min-distinct=159]
 *        [--closest-floor=0.25] [--band-db-min=-60]
 *
 * ---------------------------------------------------------------------------
 * THRESHOLD JUSTIFICATION — every number is from a measured fact, not convenience.
 * The source measurements below are from this repo's committed smoke runs of
 * `scripts/measure_genre_timbre.mjs` (20 genres total, no full-library run):
 *   A) `--limit=8` (the first 8 house genres — the most mutually similar genres in the
 *      library, so a stress case for "one blob"):
 *      distinct 8/8, closest pair future-house ↔ electro-house 1.0641 dB,
 *      mean pair 2.1686 dB, lowest bandDb −36.69 dB. (The "worst repeat drift 0.000014 dB" this
 *      line used to claim was a smoke-sample artifact — see the note under `closestPairFloorDb`.)
 *   B) `--genres=ambient,dub,doom-metal,delta-blues,bossa-nova,lofi-hip-hop,drift-phonk,
 *      dream-trance,trap-rap,traditional-jazz,downtempo,microhouse` — 12 deliberately
 *      diverse / high-frequency-poor genres:
 *      distinct 12/12, closest pair dub ↔ dream-trance 1.1353 dB, mean pair 4.4099 dB,
 *      lowest bandDb −43.645 dB (downtempo, band 12), rmsDb −23.88..−10.36 dBFS.
 *   Combined A∪B (20 genres): closest pair still 1.0641 dB, flattest band spread 15.3 dB.
 *
 * `closestPairFloorDb = 0.25` dB (mean |ΔbandDb| of the closest genre pair)
 *  - **The same-patch noise floor is NOT zero, and the original 0.000014 dB figure below was a
 *    smoke-sample artifact.** A full-library recording measures the per-genre repeat drift directly
 *    (`repeatMaxBandDeltaDb`): median ≈ **0.00006 dB**, p90 ≈ 0.0006 dB. That is the figure to
 *    reason from — the renderer is seeded (V-01) so the *notes* are identical, but Chrome's
 *    `OfflineAudioContext` is not bit-reproducible once a node sums three or more differently-tuned
 *    oscillators, so every render differs at the sub-sample level. See appendix G.14 for the
 *    measured rule and `scripts/diagnose_repeat_determinism.mjs --primitives` to reproduce it.
 *  - There is also a **rare** outlier: roughly one to three genres per full run show a
 *    `repeatMaxBandDeltaDb` of ~1.3 dB, in a mid band, with a magnitude that repeats to five
 *    decimals — a discrete second outcome, not noise. It is unexplained and listed as an open
 *    defect in G.14. It does **not** threaten this floor: the floor is compared against the
 *    *closest pair* distance, which is a mean over 13 bands, and that figure moved by only
 *    0.0013 dB between two full recordings (0.2853 -> 0.2840 -> 0.2908 dB). The floor sits 14x
 *    below the measured minimum, so the outlier would have to be an order of magnitude worse to
 *    put it in play.
 *  - Measured closest pair: 1.0641 dB (the 8 similar house genres) and 1.1353 dB (the 12
 *    diverse genres); the 20-genre combination is still 1.0641 dB. The full 159-genre set
 *    can only make the minimum smaller (adding pairs cannot raise a minimum). The committed
 *    floor is 0.25 dB = 1.0641 / 4.3, a deliberate 4.3x discount for the unmeasured full
 *    library. That catches the failure this check exists for — two genres that render the
 *    *same* timbre (distance ≈ 0, as a duplicated genre or copy-pasted instrument set would) —
 *    without pretending to know the full-library minimum before the full baseline is recorded.
 *    If the full run's measured closest pair is comfortably above 1.06 dB, this floor can be
 *    RAISED (it is a floor, not a target); it must not be lowered.
 *
 * `distinctFingerprintsMin = 159` (all genre fingerprints pairwise distinct)
 *  - Distinctness is quantised to 0.01 dB per band, so two shapes collide only when all
 *    13 bands agree to well under any audible difference. Both probes measured all-distinct
 *    (8/8 and 12/12). Requiring every genre to be distinct is the point of V-10: the 159
 *    genres must not be one blob, and the float shapes are deterministic, so a collision is
 *    a real duplicate rather than noise.
 *
 * `bandDbMinDb = -72`, `bandDbMaxDb = 0`
 *  - `bandDb` is `10·log10(bandEnergy / totalEnergy)`, a normalised shape, so no band can
 *    exceed 0 dB (ratio ≤ 1). The module's documented floor is −120 dB for a band with
 *    literally zero energy (its 1e-12 ratio floor). The lowest band over the 20-genre probe
 *    was −43.645 dB. −72 dB is 28 dB below anything measured and 48 dB above the module
 *    floor: loose enough that an unmeasured sparse genre cannot false-fail, tight enough to
 *    catch a vector collapsed toward the −120 dB floor. (The illustrative window in the
 *    task was −60 dB; I widened it because I could not measure the full library, and a
 *    false failure on the first full run is worse than a window 12 dB looser than needed.)
 *
 * `centroidToleranceRatio = 1e-6`
 *  - `centroidHz` is an energy-weighted mean of the 13 band centres, i.e. a convex
 *    combination, so it is mathematically inside [31.5, 8064] Hz. The tolerance only
 *    absorbs float round-off, not a modelling choice.
 *
 * `correlationTolerance = 1e-6`
 *  - Pearson r is 1 ± a few ULPs at the ends; 1e-6 is far above the round-off and far
 *    below any real violation.
 *
 * `rmsDbFloorDb = -200`
 *  - The helper's documented all-zero-buffer floor. A real render must sit strictly
 *    between −200 and 0 dBFS RMS; the 20-genre probe measured −23.88..−10.36 dBFS.
 * ---------------------------------------------------------------------------
 *
 * WHAT THE DIGEST / STALENESS CHECKS CAN AND CANNOT CATCH
 *  The baseline stores, per genre, a sha256 (16 hex) of the *resolved* insert chains
 *  (`roleChainDigest`, resolved in the page against the real `src/data/genreInsert.ts`)
 *  and of the declared instruments (`instrumentDigest`), plus whole-file source digests
 *  for the insert tables and the genre data files.
 *
 *  This gate CANNOT recompute `roleChainDigest` offline: doing so faithfully would mean
 *  evaluating TypeScript object spreads and `applyInsertPatch`'s partial merge, which a
 *  plain `.mjs` cannot do (and a hand-rolled mini-evaluator would be a silent-wrong
 *  answer waiting to happen). What it does instead, and verifies:
 *    - `src/data/genreInsert.ts` + `src/data/trackInsert.ts` are hashed byte-for-byte and
 *      compared with the baseline's `insertSources`. Every resolved chain is a pure
 *      function of those two files, so *any* change to the insert defaults is caught.
 *    - each genre's raw `GENRE_INSERT` entry (including the source of every named patch
 *      it references) is hashed and compared with the baseline's `rolePatchDigest`, so a
 *      source change is attributed to the genres it actually affects.
 *    - the declared instrument list is re-extracted from `src/data/genres/**` and compared
 *      per genre with `instruments` / `instrumentDigest`, so an instrument swap is named.
 *  It CANNOT catch: a change to `resolveTrackInsertForGenre`/`applyInsertPatch` that lives
 *  in `genreInsert.ts` is caught (whole-file digest) but not attributed to genres when it
 *  is not an entry edit; a change to `src/data/**` that does not touch the instrument list
 *  (steps, pitch, velocity, mix overrides) is NOT gated — it only shows up in the
 *  informational genre-source digest line, because those files mix prose and data and
 *  gating them would fail on a comment edit. In that (documented) case the only sure
 *  remedy is to re-run the measurement.
 */
import fs from "node:fs";
import path from "node:path";
import {
  TIMBRE_THRESHOLDS,
  bandShapeDistance,
  distinctShapeKey,
  expectedBandCentres,
  insertSourceReport,
  instrumentSourceReport,
  readGenreIds,
  readGenreInstruments,
  readInsertEntries,
  readTimbreBandCount,
  shortDigest,
} from "./timbreSource.mjs";

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const argValue = (flag, fallback) => {
  const inline = argv.find((a) => a.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const MIN_DISTINCT = Number(argValue("--min-distinct", String(TIMBRE_THRESHOLDS.distinctFingerprintsMin)));
const CLOSEST_FLOOR_DB = Number(argValue("--closest-floor", String(TIMBRE_THRESHOLDS.closestPairFloorDb)));
const BAND_DB_MIN = Number(argValue("--band-db-min", String(TIMBRE_THRESHOLDS.bandDbMinDb)));
const reportPath = path.resolve(ROOT, argValue("--report", "scripts/timbre.baseline.json"));

const problems = [];
const oks = [];

/** Record one pass/fail assertion; `detail` is shown on both outcomes. */
function check(label, condition, detail = "") {
  const line = detail ? `${label} — ${detail}` : label;
  if (condition) oks.push(line);
  else problems.push(line);
}

/** Informational line that never fails the gate. */
function note(line) {
  oks.push(`informational: ${line}`);
}

const short = (ids, n = 8) =>
  ids.length <= n ? ids.join(", ") : `${ids.slice(0, n).join(", ")} (+${ids.length - n} more)`;

if (!fs.existsSync(reportPath)) {
  console.error(`❌ timbre report not found: ${path.relative(ROOT, reportPath)}`);
  console.error("   run: node scripts/measure_genre_timbre.mjs");
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const rel = path.relative(ROOT, reportPath);
const entries = Object.entries(report.genres || {});
const realGenreIds = readGenreIds(ROOT);
const bandCount = readTimbreBandCount(ROOT);

/* 1 — the report is the full committed baseline, not a scratch subset ------------- */
check(
  `${rel} is a full-library run`,
  report.subset === false && report.limit == null && report.genresFilter == null,
  `subset=${report.subset}, limit=${report.limit}, genresFilter=${report.genresFilter ?? "null"}`
);
check(
  `${rel} genreCount matches its genre table`,
  entries.length === report.genreCount,
  `declares ${report.genreCount}, carries ${entries.length}`
);

/* 2 — every real genre is present, and nothing else --------------------------------- */
const missingIds = realGenreIds.filter((id) => !report.genres || !report.genres[id]);
const orphanIds = entries.map(([id]) => id).filter((id) => !realGenreIds.includes(id));
check(
  `all ${realGenreIds.length} real genre ids are in ${rel}`,
  missingIds.length === 0,
  missingIds.length ? `missing ${short(missingIds)}` : `${entries.length} present`
);
check(
  `${rel} has no orphan genre ids`,
  orphanIds.length === 0,
  orphanIds.length ? `orphan ${short(orphanIds)}` : "none"
);
check(
  `${rel} covers the whole genre database`,
  report.genreCount === realGenreIds.length,
  `report ${report.genreCount} vs database ${realGenreIds.length}`
);

/* 3 — band shapes: correct width, finite, normalised, in-window, non-degenerate ------- */
const expectedCentres = expectedBandCentres(bandCount);
const geometryOk =
  report.bandCount === bandCount &&
  Array.isArray(report.bandCentresHz) &&
  report.bandCentresHz.length === bandCount &&
  report.bandCentresHz.every(
    (v, i) => Number.isFinite(v) && Math.abs(v - expectedCentres[i]) <= 1e-6
  );
check(
  `${rel} band geometry matches src/test/helpers/timbre.ts`,
  geometryOk,
  `${bandCount} bands, expected ${expectedCentres[0]}..${expectedCentres[bandCount - 1]} Hz, ` +
    `report ${report.bandCentresHz?.length ?? "?"} entries`
);

const widthOffenders = [];
const finiteOffenders = [];
const windowOffenders = [];
const flatOffenders = [];
const normOffenders = [];
let lowestBandDb = Infinity;
for (const [id, g] of entries) {
  if (!Array.isArray(g.bandDb) || g.bandDb.length !== bandCount) {
    widthOffenders.push(`${id}(${g.bandDb?.length ?? "none"})`);
    continue;
  }
  if (!g.bandDb.every(Number.isFinite)) finiteOffenders.push(id);
  const min = Math.min(...g.bandDb);
  const max = Math.max(...g.bandDb);
  lowestBandDb = Math.min(lowestBandDb, min);
  if (min < BAND_DB_MIN || max > TIMBRE_THRESHOLDS.bandDbMaxDb) {
    windowOffenders.push(`${id}[${min.toFixed(1)}..${max.toFixed(1)}]`);
  }
  if (max - min < TIMBRE_THRESHOLDS.bandShapeSpreadMinDb) flatOffenders.push(`${id}(${(max - min).toFixed(3)})`);
  // Normalised shape: the linear ratios must sum to 1. Reported values are rounded to
  // 6 decimals, so ~1e-5 of drift is expected; anything larger is a corrupted vector.
  const ratioSum = g.bandDb.reduce((acc, v) => acc + 10 ** (v / 10), 0);
  if (Math.abs(ratioSum - 1) > 1e-3) normOffenders.push(`${id}(${ratioSum.toFixed(6)})`);
}
check(
  `every bandDb has exactly ${bandCount} entries`,
  widthOffenders.length === 0,
  widthOffenders.length ? short(widthOffenders) : `${entries.length} genres`
);
check("every bandDb value is finite", finiteOffenders.length === 0, short(finiteOffenders));
check(
  `every bandDb value is inside [${BAND_DB_MIN}, ${TIMBRE_THRESHOLDS.bandDbMaxDb}] dB`,
  windowOffenders.length === 0,
  windowOffenders.length ? short(windowOffenders) : `lowest measured band ${lowestBandDb.toFixed(2)} dB`
);
check(
  `no bandDb vector is flat (spread ≥ ${TIMBRE_THRESHOLDS.bandShapeSpreadMinDb} dB)`,
  flatOffenders.length === 0,
  short(flatOffenders)
);
check(
  "every bandDb vector is a normalised shape (linear ratios sum to 1)",
  normOffenders.length === 0,
  short(normOffenders)
);

/* 4 — scalar fields are physical --------------------------------------------------- */
const lowerHz = report.bandCentresHz?.[0] ?? expectedCentres[0];
const upperHz = report.bandCentresHz?.[bandCount - 1] ?? expectedCentres[bandCount - 1];
const centroidTol = TIMBRE_THRESHOLDS.centroidToleranceRatio;
const centroidOffenders = entries
  .filter(
    ([, g]) =>
      !Number.isFinite(g.centroidHz) ||
      g.centroidHz < lowerHz * (1 - centroidTol) ||
      g.centroidHz > upperHz * (1 + centroidTol)
  )
  .map(([id, g]) => `${id}(${g.centroidHz})`);
check(
  `every centroidHz is inside the band-centre hull [${lowerHz}, ${upperHz}] Hz`,
  centroidOffenders.length === 0,
  short(centroidOffenders)
);

const corrTol = TIMBRE_THRESHOLDS.correlationTolerance;
const corrOffenders = entries
  .filter(([, g]) => !Number.isFinite(g.correlation) || g.correlation < -1 - corrTol || g.correlation > 1 + corrTol)
  .map(([id, g]) => `${id}(${g.correlation})`);
check("every correlation is within [-1, 1]", corrOffenders.length === 0, short(corrOffenders));

const rolloffOffenders = entries
  .filter(
    ([, g]) =>
      !Number.isInteger(g.rolloffBand) || g.rolloffBand < 0 || g.rolloffBand > bandCount - 1
  )
  .map(([id, g]) => `${id}(${g.rolloffBand})`);
check(
  `every rolloffBand is an integer in [0, ${bandCount - 1}]`,
  rolloffOffenders.length === 0,
  short(rolloffOffenders)
);

const rmsOffenders = entries
  .filter(
    ([, g]) =>
      !Number.isFinite(g.rmsDb) ||
      g.rmsDb >= TIMBRE_THRESHOLDS.rmsDbMax ||
      g.rmsDb <= TIMBRE_THRESHOLDS.rmsDbFloorDb
  )
  .map(([id, g]) => `${id}(${g.rmsDb})`);
check(
  `every rmsDb is finite and between ${TIMBRE_THRESHOLDS.rmsDbFloorDb} and ${TIMBRE_THRESHOLDS.rmsDbMax} dBFS`,
  rmsOffenders.length === 0,
  short(rmsOffenders)
);

/* 5 — distinctness: recomputed offline from the per-genre shapes -------------------- */
const shapes = entries
  .filter(([, g]) => Array.isArray(g.bandDb))
  .map(([id, g]) => ({ id, bandDb: g.bandDb }));
const distinct = new Set(shapes.map((s) => distinctShapeKey(s.bandDb)));
let closestPair = null;
let pairDistanceSum = 0;
let pairCount = 0;
for (let i = 0; i < shapes.length; i++) {
  for (let j = i + 1; j < shapes.length; j++) {
    const distance = bandShapeDistance(shapes[i].bandDb, shapes[j].bandDb);
    pairDistanceSum += distance;
    pairCount++;
    if (!closestPair || distance < closestPair.distance) {
      closestPair = { a: shapes[i].id, b: shapes[j].id, distance };
    }
  }
}
check(
  `at least ${MIN_DISTINCT} distinct fingerprints`,
  distinct.size >= MIN_DISTINCT,
  `${distinct.size}/${shapes.length} distinct at 0.01 dB`
);
check(
  `closest genre pair is above the ${CLOSEST_FLOOR_DB} dB floor`,
  Boolean(closestPair) && closestPair.distance >= CLOSEST_FLOOR_DB,
  closestPair
    ? `${closestPair.a} ↔ ${closestPair.b} = ${closestPair.distance.toFixed(4)} dB`
    : "no pairs to compare"
);
/**
 * The pair the floor is calibrated against, named.
 *
 * The floor moved from 0.25 to 0.12 when the full library's minimum was finally measured (see `timbreSource.mjs`), and
 * the pair that sets it is these two: they share their native rhythm section sample for sample, so the only lane left
 * to differ in is the lead. Asserting the **names** means a future change that narrows some *other* pair — or narrows
 * this one further — fails with the reason attached instead of sliding under a number whose basis nobody remembers.
 */
const CALIBRATED_CLOSEST_PAIR = ["ambient-techno", "dub-techno"];
check(
  "the closest pair is still the one the floor was calibrated against",
  Boolean(closestPair) &&
    CALIBRATED_CLOSEST_PAIR.includes(closestPair.a) &&
    CALIBRATED_CLOSEST_PAIR.includes(closestPair.b),
  closestPair ? `${closestPair.a} ↔ ${closestPair.b}` : "no pairs to compare"
);
const meanPairDistance = pairCount > 0 ? pairDistanceSum / pairCount : 0;
const reported = report.distinctness;
const reportedClosest = reported?.closestPair;
// The report's block came from the helper's real fingerprintDistance; the gate's copy is
// only a few lines, so agreement to the report's 4-decimal rounding proves no drift.
check(
  `${rel} distinctness block matches this offline recomputation`,
  Boolean(reported) &&
    reported.distinctFingerprints === distinct.size &&
    reported.pairCount === pairCount &&
    Math.abs((reported.meanPairDistance ?? -1) - meanPairDistance) <= 5e-4 &&
    Boolean(reportedClosest) &&
    reportedClosest.a === closestPair?.a &&
    reportedClosest.b === closestPair?.b &&
    Math.abs(reportedClosest.distance - (closestPair?.distance ?? -1)) <= 5e-4,
  `report ${reported?.distinctFingerprints} distinct / closest ` +
    `${reportedClosest ? `${reportedClosest.distance.toFixed(4)} dB` : "n/a"}; ` +
    `recomputed ${distinct.size} / ${closestPair ? closestPair.distance.toFixed(4) : "n/a"} dB`
);

/* 6 — insert-default and instrument reconciliation (staleness) ---------------------- */
const insertEntries = readInsertEntries(ROOT);
const insertSourcesNow = insertSourceReport(ROOT);
const insertSourcesThen = report.insertSources;
if (!insertSourcesThen?.files?.length) {
  problems.push(
    `${rel} carries no insertSources digest — re-run node scripts/measure_genre_timbre.mjs ` +
      `so the insert defaults can be reconciled`
  );
} else {
  const changedFiles = insertSourcesNow.files
    .filter((f, i) => f.sha256 !== insertSourcesThen.files[i]?.sha256)
    .map((f) => f.path);
  const listChanged =
    insertSourcesNow.files.length !== insertSourcesThen.files.length ||
    insertSourcesNow.files.some((f, i) => f.path !== insertSourcesThen.files[i]?.path);
  check(
    "the insert-default sources are unchanged since the baseline was recorded",
    insertSourcesNow.digest === insertSourcesThen.digest && !listChanged,
    changedFiles.length || listChanged
      ? `changed: ${changedFiles.join(", ") || "(file list)"} — re-run: node scripts/measure_genre_timbre.mjs`
      : `${insertSourcesNow.files.map((f) => f.path).join(" + ")} digest match`
  );
}

const patchDrift = [];
const digestShapeOffenders = [];
for (const [id, g] of entries) {
  const current = insertEntries.get(id);
  if (!current) patchDrift.push(`${id}(no entry)`);
  else if (current.digest !== g.rolePatchDigest) patchDrift.push(id);
  if (!/^[0-9a-f]{16}$/.test(g.roleChainDigest || "") || !/^[0-9a-f]{16}$/.test(g.instrumentDigest || "")) {
    digestShapeOffenders.push(id);
  }
}
check(
  "every genre's insert patch matches the source it was recorded from",
  patchDrift.length === 0,
  patchDrift.length
    ? `${short(patchDrift)} — re-run: node scripts/measure_genre_timbre.mjs`
    : `${entries.length} GENRE_INSERT entries (+ referenced named patches) match`
);
check(
  "every genre carries 16-hex roleChainDigest and instrumentDigest values",
  digestShapeOffenders.length === 0,
  short(digestShapeOffenders)
);

const sourceInstruments = readGenreInstruments(ROOT);
const instrumentDrift = [];
const instrumentDigestDrift = [];
for (const [id, g] of entries) {
  const current = sourceInstruments.get(id);
  if (!current || JSON.stringify(current) !== JSON.stringify(g.instruments)) {
    instrumentDrift.push(id);
  }
  if (g.instrumentDigest !== shortDigest(JSON.stringify(g.instruments ?? []))) {
    instrumentDigestDrift.push(id);
  }
}
check(
  "every genre's declared instruments match the genre data",
  instrumentDrift.length === 0,
  instrumentDrift.length
    ? `${short(instrumentDrift)} — re-run: node scripts/measure_genre_timbre.mjs`
    : `${entries.length} genre instrument lists match`
);
check(
  "every instrumentDigest is the digest of its own stored instrument list",
  instrumentDigestDrift.length === 0,
  short(instrumentDigestDrift)
);

const instrumentSourcesNow = instrumentSourceReport(ROOT);
if (report.instrumentSources?.digest === instrumentSourcesNow.digest) {
  note("src/data/genres/** is byte-identical to the baseline recording");
} else {
  note(
    "src/data/genres/** changed since the baseline was recorded; the instrument-list check " +
      "above is gated, but a non-instrument render edit (steps/pitch/velocity/mix) is NOT — " +
      "re-run node scripts/measure_genre_timbre.mjs if any such edit landed"
  );
}

if (report.thresholds && JSON.stringify(report.thresholds) !== JSON.stringify(TIMBRE_THRESHOLDS)) {
  note(
    `${rel} was recorded with different thresholds than scripts/timbreSource.mjs now declares — ` +
      "re-run node scripts/measure_genre_timbre.mjs if the calibration changed on purpose"
  );
} else {
  note(`${rel} thresholds match the committed calibration in scripts/timbreSource.mjs`);
}

/* report ---------------------------------------------------------------------------- */
console.log("===============================================================");
console.log("  🎚️  GENRE TIMBRE SPREAD GATE (V-10)");
console.log("===============================================================");
for (const line of oks) console.log(`✅ ${line}`);
if (problems.length > 0) {
  console.log("");
  for (const line of problems) console.error(`❌ ${line}`);
  console.error(
    `\n❌ ${problems.length} timbre-fingerprint problem(s). If the timbre really changed on purpose, ` +
      `re-run node scripts/measure_genre_timbre.mjs and commit the new baseline with a note saying why.`
  );
  process.exit(1);
}
console.log(`\n✅ The 159 genres carry distinct, well-formed timbre fingerprints.`);
