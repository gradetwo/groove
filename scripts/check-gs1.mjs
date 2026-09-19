#!/usr/bin/env node
/**
 * GS-1 vendored-core contract gate.
 *
 * Fails loudly when `vendor/gs1/` has drifted from the pin recorded in
 * `vendor/gs1/UPSTREAM.json`, or when the vendored core was built wrong:
 *
 *   1. every file listed in UPSTREAM.json exists and its SHA-256 matches
 *      (and nothing unexpected has been dropped into the vendor tree);
 *   2. each .wasm validates and instantiates in Node (`WebAssembly.validate`
 *      + `new WebAssembly.Instance`);
 *   3. the module's own `gs_abi_version()` equals `UPSTREAM.json.abi`, and
 *      `gs_max_voices()` / `gs_max_block_size()` / `gs_spectrum_bins()` equal
 *      the documented contract — all four are *read out of the module*, never
 *      trusted from the manifest alone;
 *   4. the core renders a note without producing silence, and
 *      `gs_alloc_violations() === 0`;
 *   5. the vendored parameter table declares no duplicate ids.
 *
 * Skip vs fail
 * ------------
 * The two `.wasm` artifacts are build outputs that are gitignored upstream, so
 * a checkout that has not run `scripts/sync-gs1.mjs` legitimately has no core at
 * all. With **no `UPSTREAM.json`** the gate *skips* (exit 0) with the reason, so
 * the build is not blocked by a pin that was never taken.
 *
 * Once `UPSTREAM.json` exists the pin is a committed promise: the gate then
 * *fails* on anything missing or mismatched. A manifest without its files is
 * exactly the broken state this gate exists to catch, so it must not be allowed
 * to silently downgrade to a skip.
 *
 * Offline; Node built-ins only. Same contract as `src/test/gs1Contract.test.ts`.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const VENDOR_ROOT = path.join(REPO_ROOT, "vendor", "gs1");
const MANIFEST_PATH = path.join(VENDOR_ROOT, "UPSTREAM.json");

/** The published ABI contract this integration is written against (GS-1 v8). */
const EXPECTED = {
  abiVersion: 8,
  maxVoices: 32,
  maxBlockSize: 1024,
  spectrumBins: 36,
};

/** Files in vendor/gs1 that are ours, not upstream copies, and so unhashed. */
const LOCAL_METADATA = new Set(["UPSTREAM.json", "README.md", "THIRD_PARTY_NOTICES.md"]);

/**
 * The runtime copies served from `public/gs1/` (`sync-gs1.mjs` writes them). They are fetched by
 * URL at runtime, so nothing in the build graph would notice a drift from the pin — this gate is
 * the only thing standing between "vendored" and "whatever happens to be in public/".
 */
const PUBLIC_COPIES = {
  "src/audio/worklet-processor.js": "workletProcessor.js",
  "src/generated/synth_core.wasm": "synth_core.wasm",
  "src/generated/synth_core_scalar.wasm": "synth_core_scalar.wasm",
};

/** The filename whose ABI the manifest pins (the SIMD core). */
const PRIMARY_WASM = "src/generated/synth_core.wasm";

const failures = [];
let checks = 0;

const ok = (name, detail = "") => {
  checks += 1;
  console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ""}`);
};
const bad = (name, detail = "") => {
  checks += 1;
  console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
};
const assert = (name, condition, detail = "") =>
  condition ? ok(name, detail) : bad(name, detail);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function walkFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(abs));
    else out.push(abs);
  }
  return out;
}

/**
 * Parse the `Param` table out of the vendored `params.ts`.
 * The table is a flat `{ NAME: <int>, ... } as const` literal; ids are the wire
 * format shared with the Rust core, so a duplicate id is a real defect.
 */
function parseParamTable(source) {
  const start = source.indexOf("export const Param = {");
  if (start === -1) return { error: "`export const Param = {` not found" };
  const end = source.indexOf("} as const;", start);
  if (end === -1) return { error: "closing `} as const;` not found" };
  const body = source.slice(start, end);
  const entries = [...body.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(-?\d+)\s*,/gm)].map(
    (m) => [m[1], Number(m[2])],
  );
  if (entries.length === 0) return { error: "no `NAME: <int>,` entries parsed" };

  const names = new Set();
  const byId = new Map();
  const byName = new Map();
  const duplicateNames = [];
  const duplicateIds = [];
  for (const [name, id] of entries) {
    if (names.has(name)) duplicateNames.push(name);
    names.add(name);
    byName.set(name, id);
    if (byId.has(id)) duplicateIds.push(`${id} (${byId.get(id)} and ${name})`);
    else byId.set(id, name);
  }
  return { entries, byId, byName, duplicateNames, duplicateIds };
}

// ---------------------------------------------------------------------------

function skip(reason) {
  console.log(`  ⏭️  SKIP: ${reason}`);
  console.log(
    "\n      The GS-1 core has not been vendored into this checkout. That is a",
  );
  console.log(
    "      valid state (its .wasm artifacts are build outputs), so this gate does",
  );
  console.log("      not fail the build. To vendor it:");
  console.log("\n        node scripts/sync-gs1.mjs --from /path/to/gs1-checkout");
  console.log(
    "\n      ...after building the upstream artifacts there with `npm run build:wasm`.",
  );
  console.log("\n      Once vendor/gs1/UPSTREAM.json exists, this gate becomes strict.\n");
  process.exit(0);
}

function main() {
  console.log("===============================================================");
  console.log("  🎹 GS-1 Vendored-Core Contract Gate");
  console.log("===============================================================\n");
  console.log(`  vendor root: ${VENDOR_ROOT}\n`);

  if (!existsSync(MANIFEST_PATH)) {
    skip("vendor/gs1/UPSTREAM.json not found.");
  }

  // -- manifest ------------------------------------------------------------
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  } catch (error) {
    bad("UPSTREAM.json is valid JSON", error.message);
    return finish();
  }
  const listed = manifest.files && typeof manifest.files === "object" ? manifest.files : null;
  if (!listed || Object.keys(listed).length === 0) {
    bad("UPSTREAM.json lists vendored files");
    return finish();
  }
  if (!Number.isInteger(manifest.abi)) {
    bad("UPSTREAM.json pins an integer abi", `got ${JSON.stringify(manifest.abi)}`);
  }
  const upstream = manifest.upstream ?? {};
  ok(
    "pin metadata",
    `${upstream.name ?? "?"} v${upstream.version ?? "?"} @ ${String(upstream.commit ?? "?").slice(0, 12)}`,
  );

  // -- 1. hashes -----------------------------------------------------------
  console.log("\n  ── 1. vendored file hashes ─────────────────────────────────");
  for (const [rel, meta] of Object.entries(listed)) {
    const abs = path.resolve(VENDOR_ROOT, rel);
    if (!abs.startsWith(VENDOR_ROOT + path.sep)) {
      bad(`manifest path escapes vendor/gs1`, rel);
      continue;
    }
    if (!existsSync(abs)) {
      bad(`missing vendored file`, rel);
      continue;
    }
    const bytes = readFileSync(abs);
    const digest = sha256(bytes);
    const sizeOk = !Number.isInteger(meta.bytes) || meta.bytes === bytes.length;
    const hashOk = meta.sha256 === digest;
    assert(
      `sha256 ${rel}`,
      hashOk && sizeOk,
      hashOk && sizeOk
        ? `${digest.slice(0, 16)}… (${bytes.length} B)`
        : `expected ${String(meta.sha256).slice(0, 16)}…/${meta.bytes} B, got ${digest.slice(0, 16)}…/${bytes.length} B`,
    );
  }

  const unexpected = walkFiles(VENDOR_ROOT)
    .map((abs) => path.relative(VENDOR_ROOT, abs).split(path.sep).join("/"))
    .filter((rel) => !(rel in listed) && !LOCAL_METADATA.has(rel));
  assert(
    "no unlisted files in vendor/gs1",
    unexpected.length === 0,
    unexpected.length === 0 ? `${Object.keys(listed).length} listed files accounted for` : unexpected.join(", "),
  );

  for (const [from, to] of Object.entries(PUBLIC_COPIES)) {
    const vendored = path.join(VENDOR_ROOT, from);
    const published = path.join(REPO_ROOT, "public", "gs1", to);
    const same =
      existsSync(vendored) && existsSync(published) && readFileSync(vendored).equals(readFileSync(published));
    assert(
      `public/gs1/${to} is byte-identical to the vendored ${from}`,
      same,
      same ? `${readFileSync(vendored).length} B` : "missing or drifted — run scripts/sync-gs1.mjs",
    );
  }

  // -- 2. wasm validates + instantiates ------------------------------------
  console.log("\n  ── 2. wasm validation ──────────────────────────────────────");
  const wasmFiles = Object.keys(listed).filter((f) => f.endsWith(".wasm"));
  if (wasmFiles.length === 0) bad("at least one vendored .wasm", "none listed in UPSTREAM.json");

  const modules = new Map();
  for (const rel of wasmFiles) {
    const abs = path.resolve(VENDOR_ROOT, rel);
    if (!existsSync(abs)) {
      bad(`loads ${path.basename(rel)}`, "file is missing (see hash check above)");
      continue;
    }
    const bytes = readFileSync(abs);
    const validates = WebAssembly.validate(bytes);
    assert(`WebAssembly.validate(${path.basename(rel)})`, validates);
    if (!validates) continue;
    try {
      const exports = new WebAssembly.Instance(new WebAssembly.Module(bytes), {}).exports;
      modules.set(rel, exports);
      ok(`instantiates ${path.basename(rel)}`);
    } catch (error) {
      bad(`instantiates ${path.basename(rel)}`, error.message);
    }
  }

  const primaryRel = modules.has(PRIMARY_WASM) ? PRIMARY_WASM : wasmFiles.find((f) => modules.has(f));
  if (!primaryRel) {
    bad("a usable primary core", "no .wasm could be instantiated");
    return finish();
  }
  const ex = modules.get(primaryRel);
  console.log(`      primary core: ${primaryRel}`);

  // -- 3. ABI values, read out of the module -------------------------------
  console.log("\n  ── 3. ABI contract (values read from the module) ───────────");
  const required = {
    gs_abi_version: EXPECTED.abiVersion,
    gs_max_voices: EXPECTED.maxVoices,
    gs_max_block_size: EXPECTED.maxBlockSize,
    gs_spectrum_bins: EXPECTED.spectrumBins,
  };
  for (const [fn, expected] of Object.entries(required)) {
    if (typeof ex[fn] !== "function") {
      bad(`exports ${fn}()`, "not a function");
      continue;
    }
    const actual = ex[fn]();
    assert(`${fn}() === ${expected}`, actual === expected, `module reports ${actual}`);
  }
  // The pin records the ABI; the module must agree with the pin too.
  if (typeof ex.gs_abi_version === "function") {
    assert(
      `gs_abi_version() === UPSTREAM.json.abi (${manifest.abi})`,
      ex.gs_abi_version() === manifest.abi,
      `module ${ex.gs_abi_version()} vs manifest ${manifest.abi}`,
    );
  }
  for (const rel of wasmFiles) {
    const other = modules.get(rel);
    if (other && rel !== primaryRel && typeof other.gs_abi_version === "function") {
      assert(
        `${path.basename(rel)} agrees on ABI`,
        other.gs_abi_version() === manifest.abi,
        `reports ${other.gs_abi_version()}`,
      );
    }
  }

  // -- 4. parameter table --------------------------------------------------
  console.log("\n  ── 4. parameter table ──────────────────────────────────────");
  const paramsRel = "src/audio/params.ts";
  const paramsAbs = path.resolve(VENDOR_ROOT, paramsRel);
  const table =
    listed[paramsRel] && existsSync(paramsAbs)
      ? parseParamTable(readFileSync(paramsAbs, "utf8"))
      : { error: listed[paramsRel] ? `${paramsRel} is missing (see hash check above)` : `${paramsRel} is not vendored` };
  if (table.error) {
    bad("parameter table parses", table.error);
  } else {
    assert(
      "parameter ids are unique",
      table.duplicateIds.length === 0,
      table.duplicateIds.length === 0
        ? `${table.entries.length} ids, max ${Math.max(...table.byId.keys())}`
        : `duplicates: ${table.duplicateIds.join(", ")}`,
    );
    assert(
      "parameter names are unique",
      table.duplicateNames.length === 0,
      table.duplicateNames.length === 0 ? "" : table.duplicateNames.join(", "),
    );
  }

  // -- 5. renders a note, no allocation violations -------------------------
  console.log("\n  ── 5. render smoke test ────────────────────────────────────");
  if (table.error) {
    bad("render smoke test", "parameter table unavailable");
    return finish();
  }
  const P = (name) => table.byName.get(name);
  const needed = [
    "MASTER_VOLUME",
    "OSC1_ON",
    "OSC1_WAVE",
    "OSC1_LEVEL",
    "OSC1_DETUNE",
    "OSC2_ON",
    "FILTER_TYPE",
    "FILTER_CUTOFF",
    "FILTER_RES",
    "FILTER_ENV_AMT",
    "ENV_ATTACK",
    "ENV_SUSTAIN",
    "LFO_ON",
    "FX_REVERB_ON",
    "FX_DELAY_ON",
  ];
  const unnamed = needed.filter((n) => P(n) === undefined);
  if (unnamed.length > 0) {
    bad("parameter table has the render patch names", `missing: ${unnamed.join(", ")}`);
    return finish();
  }

  const need = (fn) => typeof ex[fn] === "function";
  if (!need("gs_init") || !need("gs_process") || !need("gs_note_on") || !need("gs_left_ptr")) {
    bad("core exposes the block-ABI render surface");
    return finish();
  }

  ex.gs_init(48000, 16);
  const patch = [
    [P("MASTER_VOLUME"), 0.8],
    [P("OSC1_ON"), 1],
    [P("OSC1_WAVE"), 0], // sine
    [P("OSC1_LEVEL"), 1],
    [P("OSC1_DETUNE"), 0],
    [P("OSC2_ON"), 0],
    [P("FILTER_TYPE"), 0],
    [P("FILTER_CUTOFF"), 20000],
    [P("FILTER_RES"), 0],
    [P("FILTER_ENV_AMT"), 0],
    [P("ENV_ATTACK"), 0.001],
    [P("ENV_SUSTAIN"), 1],
    [P("LFO_ON"), 0],
    [P("FX_REVERB_ON"), 0],
    [P("FX_DELAY_ON"), 0],
  ];
  for (const [id, value] of patch) ex.gs_set_param(id, value);

  if (typeof ex.gs_all_notes_off === "function") ex.gs_all_notes_off();
  ex.gs_note_on(69, 1); // A4
  let peak = 0;
  for (let block = 0; block < 40; block += 1) {
    ex.gs_process(128);
    const view = new Float32Array(ex.memory.buffer, ex.gs_left_ptr(), 128);
    for (const sample of view) peak = Math.max(peak, Math.abs(sample));
  }
  assert(
    "renders a note without silence",
    peak > 0.01,
    `peak ${peak.toFixed(4)} over 40×128 frames`,
  );

  const canMeasureAlloc =
    need("gs_reset_alloc_violations") && need("gs_alloc_violations");
  if (!canMeasureAlloc) {
    bad("core exposes gs_alloc_violations()");
  } else {
    ex.gs_reset_alloc_violations();
    for (let block = 0; block < 200; block += 1) ex.gs_process(128);
    const violations = ex.gs_alloc_violations();
    assert("gs_alloc_violations() === 0", violations === 0, `reported ${violations}`);
  }
  if (typeof ex.gs_all_notes_off === "function") ex.gs_all_notes_off();

  return finish();
}

function finish() {
  console.log("\n===============================================================");
  if (failures.length > 0) {
    console.error(`❌ GS-1 CONTRACT GATE FAILED — ${failures.length} of ${checks} checks failed:`);
    for (const failure of failures) console.error(`   • ${failure}`);
    console.error(
      "\n   vendor/gs1 no longer matches its pin. Re-run " +
        "`node scripts/sync-gs1.mjs --from <gs1-checkout>` and review the diff.",
    );
    console.error("===============================================================\n");
    process.exit(1);
  }
  console.log(`🎉 GS-1 vendored core satisfies the ABI ${EXPECTED.abiVersion} contract (${checks} checks).\n`);
  console.log("===============================================================\n");
  process.exit(0);
}

try {
  main();
} catch (error) {
  console.error("\n❌ GS-1 CONTRACT GATE CRASHED — unexpected error:");
  console.error(`   ${error && error.stack ? error.stack : String(error)}`);
  console.error("\n   Either a gate bug or a badly broken vendor/gs1 tree; refusing to pass.\n");
  process.exit(1);
}
