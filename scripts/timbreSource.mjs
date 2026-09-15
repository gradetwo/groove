/**
 * Shared, browser-free source readers + calibration constants for the V-10 timbre
 * fingerprint baseline (`scripts/measure_genre_timbre.mjs`) and its gate
 * (`scripts/check_timbre_spread.mjs`).
 *
 * WHY THIS FILE EXISTS
 *  The measurement needs two things a browser cannot give it — the authoritative genre
 *  id list and a *source-level* fingerprint of the insert tables a baseline was recorded
 *  against — and the gate needs to recompute both from disk with identical logic. Keeping
 *  one implementation here means the two scripts cannot drift apart: if the readers were
 *  copied, a "fix" applied to only one of them would make every genre look stale rather
 *  than silently pass, but one shared copy removes even that failure mode.
 *
 * HOW TS DATA IS READ
 *  This is a plain `.mjs`, so it cannot `import` a `.ts` module. It follows the repo's
 *  established static-gate convention (`scripts/redlines.mjs` R2/R9b/R10,
 *  `scripts/check_loudness_spread.mjs`): read the source text and extract the data.
 *  Everything extracted here is checked for the invariants that make the extraction
 *  sound (count, uniqueness, per-genre track count), so a file whose formatting defeats
 *  the reader fails loudly instead of producing a plausible-looking wrong digest.
 *
 *  What is NOT read from source: the *resolved* per-role insert chain. That requires
 *  evaluating TypeScript object spreads and `applyInsertPatch`'s partial merge, which a
 *  regex reader cannot do faithfully. The measurement resolves it inside Chromium and
 *  records a hash of the resolved value (`roleChainDigest`); the gate reconciles the
 *  *sources* those values are a pure function of. See the gate header for the exact
 *  scope of that check.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

/**
 * The committed V-10 calibration. One source of truth: the measurement writes this
 * object into `scripts/timbre.baseline.json` as `thresholds`, and the gate enforces the
 * same numbers (with CLI overrides for experiments). Every value is justified from a
 * measured fact in the gate header — none is a round-number convenience.
 *
 * `distinctFingerprintsMin` / `closestPairFloorDb` are calibrated in
 * `scripts/check_timbre_spread.mjs`; see the comment block there for the measured pair
 * distances they came from and the margin taken.
 */
export const TIMBRE_THRESHOLDS = Object.freeze({
  /**
   * Minimum number of pairwise-distinct band shapes, where two shapes count as the same
   * only when all 13 `bandDb` values round to the same 0.01 dB bucket. Equal to the
   * genre count: a collision means two genres render the same timbre, which is the exact
   * failure V-10 exists to catch.
   */
  distinctFingerprintsMin: 159,
  /**
   * Minimum mean-|ΔbandDb| of the closest genre pair, in dB. Calibrated from the 8-genre
   * smoke subset's measured closest pair (future-house ↔ electro-house = 1.0641 dB) with
   * a 4.3x discount — the full library can only lower that minimum, and 0.25 dB is still
   * ~8x the 0.03 dB same-tone residual the unit suite measures, so it cannot be noise.
   */
  closestPairFloorDb: 0.25,
  /**
   * Lowest `bandDb` a real render may report, dB. Over a combined 20-genre probe (the 8
   * house genres plus 12 deliberately diverse/high-frequency-poor genres: ambient, dub,
   * doom-metal, delta-blues, bossa-nova, lofi-hip-hop, drift-phonk, dream-trance, trap-rap,
   * traditional-jazz, downtempo, microhouse) the lowest band measured was −43.645 dB
   * (downtempo, band 12). The module floors a zero-energy band at −120 dB. −72 dB sits
   * 28 dB below anything measured and 48 dB above the module floor: loose enough that a
   * sparse mix cannot false-fail, tight enough to catch a vector collapsed toward the
   * module's −120 dB floor.
   */
  bandDbMinDb: -72,
  /** Highest `bandDb` — a ratio cannot exceed 1, so a normalised shape cannot exceed 0 dB. */
  bandDbMaxDb: 0,
  /** A shape whose bands are all (near) equal is not a shape. */
  bandShapeSpreadMinDb: 1,
  /** Relative slack for "centroid lies inside the band-centre hull" (convex combination). */
  centroidToleranceRatio: 1e-6,
  /** Slack for "correlation lies in [−1, 1]" (Pearson is 1 ± float round-off). */
  correlationTolerance: 1e-6,
  /** `rmsDb` must be strictly below this (a real render is never 0 dBFS RMS). */
  rmsDbMax: 0,
  /** `rmsDb` must be strictly above this — the module's documented all-zero floor. */
  rmsDbFloorDb: -200,
});

/** sha256 of a UTF-8 string, full 64-hex form (used for whole-source staleness). */
export function sha256Hex(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** sha256 truncated to 16 hex chars — the "short stable digest" the report stores. */
export function shortDigest(text) {
  return sha256Hex(text).slice(0, 16);
}

export function readSource(root, relPath) {
  return fs.readFileSync(path.join(root, relPath), "utf8");
}

/** The per-genre data files, sorted for a stable digest; `index.ts` is not data. */
export function genreDataFiles(root) {
  return fs
    .readdirSync(path.join(root, "src/data/genres"))
    .filter((f) => f.endsWith(".ts") && f !== "index.ts")
    .sort();
}

/**
 * One segment per genre: the source text from the genre's own `"id": "..."` up to (not
 * including) the next genre's id in the same file. This is faithful because
 * `scripts/redlines.mjs` R2 already proves the genre files carry exactly one `"id"` per
 * genre and that the ids are unique (`{count: 159, unique: 159}` at the time of writing);
 * the reader re-asserts both.
 */
export function readGenreSegments(root) {
  const segments = [];
  for (const file of genreDataFiles(root)) {
    const source = readSource(root, `src/data/genres/${file}`);
    const marks = [...source.matchAll(/"id":\s*"([^"]+)"/g)].map((m) => ({
      id: m[1],
      at: m.index ?? 0,
    }));
    for (let i = 0; i < marks.length; i++) {
      const end = i + 1 < marks.length ? marks[i + 1].at : source.length;
      segments.push({ id: marks[i].id, file, text: source.slice(marks[i].at, end) });
    }
  }

  const ids = segments.map((s) => s.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error(
      `genre id extraction is not unique (${ids.length} segments, ${new Set(ids).size} unique) — ` +
        `the "id": "..." reader in scripts/timbreSource.mjs needs attention`
    );
  }
  return segments;
}

/** The real genre ids, in file order — the gate's ground truth for check 2. */
export function readGenreIds(root) {
  return readGenreSegments(root).map((s) => s.id);
}

/**
 * `genreId -> ["acoustic_kick", ...]` from each genre's `sequencer_pattern.tracks[]`.
 *
 * Precondition, checked by the caller: every track declares exactly one `"instrument"`
 * (1272 track_id / 1272 instrument fields at the time of writing). `"instrumentation"`
 * metadata is a different key and is not matched.
 */
export function readGenreInstruments(root) {
  const map = new Map();
  for (const segment of readGenreSegments(root)) {
    map.set(
      segment.id,
      [...segment.text.matchAll(/"instrument":\s*"([^"]+)"/g)].map((m) => m[1])
    );
  }
  return map;
}

/** Collapse whitespace and drop `//` line comments so formatting is not a "change". */
function normalizeSource(text) {
  return text
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip comments from a block before scanning it for object keys. */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

/** Index of the `}` matching the `{` at `openIndex` (assumes balanced input). */
function matchingBrace(text, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return text.length - 1;
}

/**
 * Top-level entries of the `GENRE_INSERT` object literal.
 *
 * Scans with a brace-depth counter and only accepts a key at depth 1 at a line start, so
 * a wrapped inline patch (`bass: { ... }` nested at depth 2) can never be mistaken for a
 * genre entry. Comments are stripped first so a comment containing `foo: {` cannot match.
 */
function scanInsertTable(body) {
  const entries = [];
  const KEY_RE = /^[ \t]*("?)([A-Za-z0-9_-]+)\1[ \t]*:[ \t]*\{/;
  const text = stripComments(body);
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") {
      depth++;
      continue;
    }
    if (ch === "}") {
      depth--;
      continue;
    }
    if (depth !== 1) continue;
    if (i !== 0 && text[i - 1] !== "\n") continue;
    const match = KEY_RE.exec(text.slice(i));
    if (!match) continue;
    const open = i + match[0].length - 1;
    const end = matchingBrace(text, open);
    entries.push({ id: match[2], text: text.slice(i, end + 1) });
    i = end; // the skipped region is brace-balanced, so `depth` stays correct
  }
  return entries;
}

/** The named `const X: TrackInsertPatch = { ... }` patches shared by many genres. */
function scanNamedPatches(source) {
  const named = new Map();
  const RE = /\bconst\s+([A-Z][A-Z0-9_]*)\s*:\s*TrackInsertPatch\s*=\s*\{/g;
  let match;
  while ((match = RE.exec(source))) {
    const open = match.index + match[0].length - 1;
    named.set(match[1], normalizeSource(source.slice(match.index, matchingBrace(source, open) + 1)));
  }
  return named;
}

/**
 * `genreId -> { digest, roles }` for the genre's raw `GENRE_INSERT` entry.
 *
 * The digest covers the entry text *and* the full source of every named patch it
 * references, so editing `DUB_BASS` moves the digest of every dub genre (which is the
 * attribution the gate needs) rather than only the shared definition. One level of
 * indirection is expanded, which is all this table uses.
 */
export function readInsertEntries(root) {
  const source = readSource(root, "src/data/genreInsert.ts");
  const start = source.indexOf("export const GENRE_INSERT");
  if (start < 0) throw new Error("src/data/genreInsert.ts: GENRE_INSERT not found");
  const endMarker = source.indexOf("\n};", start);
  const body = source.slice(start, endMarker < 0 ? source.length : endMarker);
  const named = scanNamedPatches(source);

  const map = new Map();
  for (const entry of scanInsertTable(body)) {
    const refs = [
      ...new Set(
        [...entry.text.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g)]
          .map((m) => m[1])
          .filter((name) => named.has(name))
      ),
    ].sort();
    const canonical = [normalizeSource(entry.text), ...refs.map((n) => `${n}=${named.get(n)}`)].join("\n");
    map.set(entry.id, {
      digest: shortDigest(canonical),
      roles: refs,
    });
  }
  return map;
}

/** `{ files: [{path, sha256}], digest }` over a list of source files, in the given order. */
export function sourceReport(root, relPaths) {
  const files = relPaths.map((rel) => ({ path: rel, sha256: sha256Hex(readSource(root, rel)) }));
  return {
    files,
    digest: sha256Hex(files.map((f) => `${f.path}:${f.sha256}`).join("\n")),
  };
}

/** Raw-byte digest of the two files the resolved insert chains are built from. */
export function insertSourceReport(root) {
  return sourceReport(root, ["src/data/genreInsert.ts", "src/data/trackInsert.ts"]);
}

/** Raw-byte digest of every genre data file (informational — see the gate header). */
export function instrumentSourceReport(root) {
  return sourceReport(
    root,
    genreDataFiles(root).map((f) => `src/data/genres/${f}`)
  );
}

/**
 * `TIMBRE_BAND_COUNT`, read from the module that owns it rather than hard-coded here, so
 * a change to the bank geometry makes the gate fail against a stale baseline instead of
 * silently reading a different number.
 */
export function readTimbreBandCount(root) {
  const source = readSource(root, "src/test/helpers/timbre.ts");
  const match = source.match(/export const TIMBRE_BAND_COUNT\s*=\s*(\d+)/);
  if (!match) throw new Error("src/test/helpers/timbre.ts: TIMBRE_BAND_COUNT not found");
  return Number(match[1]);
}

/** Round to 4 significant digits — the rule `buildBandCentres()` in the helper implements. */
function roundTo4SignificantDigits(value) {
  if (!Number.isFinite(value) || value === 0) return value;
  const exponent = Math.ceil(Math.log10(Math.abs(value)));
  const scale = 10 ** (4 - exponent);
  return Math.round(value * scale) / scale;
}

/**
 * The band-centre table recomputed from the module's documented formula
 * (`31.5 * 2**(k * 2/3)`, 4 significant digits). The gate compares the baseline's
 * recorded `bandCentresHz` against this, which proves the browser recorded the same
 * geometry this offline copy reasons about.
 */
export function expectedBandCentres(bandCount) {
  const centres = [];
  for (let k = 0; k < bandCount; k++) {
    centres.push(roundTo4SignificantDigits(31.5 * 2 ** (k * (2 / 3))));
  }
  return centres;
}

/**
 * Mean absolute `bandDb` difference — the same formula as `fingerprintDistance()` in
 * `src/test/helpers/timbre.ts`. Duplicated because the gate is deliberately browser-free
 * and cannot import TS; the gate cross-checks its recomputation against the report's
 * `distinctness` block, which the *real* helper produced, so a drift between the two
 * shows up as a failure rather than as a silently different number.
 */
export function bandShapeDistance(aBandDb, bBandDb) {
  const n = Math.min(aBandDb.length, bBandDb.length);
  if (n === 0) return 0;
  let sum = 0;
  for (let k = 0; k < n; k++) sum += Math.abs(aBandDb[k] - bBandDb[k]);
  return sum / n;
}

/**
 * Distinctness key for one band shape, quantised to `decimals` (0.01 dB by default).
 * Two genres collide only when all 13 bands land in the same 0.01 dB bucket — i.e. their
 * shapes are identical to well under any audible difference.
 */
export function distinctShapeKey(bandDb, decimals = 2) {
  return bandDb.map((v) => v.toFixed(decimals)).join(",");
}

/** Median of a numeric array (does not mutate the input). */
export function median(values) {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Min / max / median of one per-genre field, with the genre ids holding min and max. */
export function spreadOf(entries, key) {
  const values = entries.filter((e) => Number.isFinite(e[key]));
  if (values.length === 0) {
    return { min: null, minGenre: null, max: null, maxGenre: null, median: null };
  }
  let min = values[0];
  let max = values[0];
  for (const entry of values) {
    if (entry[key] < min[key]) min = entry;
    if (entry[key] > max[key]) max = entry;
  }
  return {
    min: min[key],
    minGenre: min.id,
    max: max[key],
    maxGenre: max.id,
    median: median(values.map((e) => e[key])),
  };
}
