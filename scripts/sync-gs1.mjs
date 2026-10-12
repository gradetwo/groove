#!/usr/bin/env node
/**
 * GS-1 vendoring sync — ONE DIRECTION ONLY.
 *
 * Copies the pinned subset of the sibling synthesizer project
 * ("GROOVE SYNTH GS-1", MIT, ABI 8) out of an upstream checkout and into
 * `vendor/gs1/`, then writes `vendor/gs1/UPSTREAM.json` recording what was
 * pinned: the upstream version, the upstream commit SHA, the ABI version the
 * artifacts actually export, and a SHA-256 for every vendored file.
 *
 * ---------------------------------------------------------------------------
 * DIRECTION OF DATA FLOW — the whole point of this script
 * ---------------------------------------------------------------------------
 *
 *     UPSTREAM_ROOT (--from)   ── read-only ──▶   DEST_ROOT (vendor/gs1)
 *
 * There is no `--to`, no `--reverse`, and no update mode. Every read of the
 * upstream tree goes through `readUpstream()`. Every write — without exception —
 * goes through `writeVendored()`, which refuses any path that does not resolve
 * inside DEST_ROOT and refuses DEST_ROOT itself if it would ever resolve inside
 * UPSTREAM_ROOT. `/home/crow/music/synth` is treated as read-only input.
 *
 * Why vendoring and not a submodule / subtree / npm package:
 *   - submodule: neither repo has a git remote, so there is nothing to point at;
 *   - subtree:   it would splice GS-1's unrelated history into this repo's;
 *   - npm:       GS-1 is `private: true` and publishes no package.
 *
 * Usage:
 *   node scripts/sync-gs1.mjs [--from <path>]   (default /home/crow/music/synth)
 *   node scripts/sync-gs1.mjs --help
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEST_ROOT = path.join(REPO_ROOT, "vendor", "gs1");
const DEFAULT_UPSTREAM = "/home/crow/music/synth";

/**
 * The pinned subset — the minimum needed to run the GS-1 engine.
 *
 *   src/audio/worklet-processor.js  AudioWorklet processor (self-contained: it
 *                                   drives the Rust core through the block ABI)
 *   src/audio/params.ts             Parameter table (ids are the wire format)
 *   src/audio/engine.ts             TypeScript host engine
 *   src/generated/synth_core.wasm   SIMD core (build artifact, gitignored upstream)
 *   src/generated/synth_core_scalar.wasm  Scalar fallback core (same)
 *   LICENSE                         MIT licence — required to redistribute
 *
 * Paths are kept relative to the upstream repository root so the pin mirrors
 * the upstream layout exactly and a future integration can remap one alias.
 */
const VENDORED_FILES = [
  "src/audio/worklet-processor.js",
  "src/audio/params.ts",
  "src/audio/engine.ts",
  "src/generated/synth_core.wasm",
  "src/generated/synth_core_scalar.wasm",
  "LICENSE",
];

/** Hand-written files that live in `vendor/gs1/` but are not upstream copies. */
/**
 * Files under `vendor/gs1/` that are *ours*, not upstream copies, and must survive a sync.
 *
 * `pruneToManagedSet` deletes anything not in the manifest, which is right for upstream files (a
 * renamed upstream module must not linger) but wrong for the two documents we add: the README
 * explaining the pin, and the third-party notices that discharge the licence obligation the
 * upstream artifacts do not. Without this list a routine `--from` sync silently deleted the
 * notices file — which is exactly the compliance gap the file exists to close.
 */
const KEEP_FILES = ["README.md", "THIRD_PARTY_NOTICES.md"];

/**
 * The runtime copies served from `public/gs1/`, as `vendored path -> public path`.
 *
 * The worklet and the two cores are fetched by URL at runtime, so they ship as static files
 * rather than through the bundler: an AudioWorklet module and a `.wasm` binary are fetched by URL
 * regardless, and keeping them out of the JS module graph is also what stops a test runner from
 * having to load a `.wasm` import. Writing them here keeps the pin as the single source of truth;
 * `check-gs1.mjs` asserts the copies are byte-identical, so a hand-edit cannot survive a gate.
 */
const PUBLIC_COPIES = {
  "src/audio/worklet-processor.js": "workletProcessor.js",
  "src/generated/synth_core.wasm": "synth_core.wasm",
  "src/generated/synth_core_scalar.wasm": "synth_core_scalar.wasm",
};

const WASM_FILES = VENDORED_FILES.filter((f) => f.endsWith(".wasm"));

// ---------------------------------------------------------------------------
// Path helpers + the two guarded I/O primitives
// ---------------------------------------------------------------------------

function isInside(parent, child) {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** The ONLY way this script reads upstream bytes. Read-only by construction. */
function readUpstream(rel) {
  const abs = path.resolve(UPSTREAM_ROOT, rel);
  if (!isInside(UPSTREAM_ROOT, abs)) {
    throw new Error(`refusing to read outside the upstream root: ${rel}`);
  }
  return readFileSync(abs);
}

/** The ONLY way this script writes anything. Cannot land in the upstream tree. */
function writeVendored(rel, data) {
  const abs = path.resolve(DEST_ROOT, rel);
  if (!isInside(DEST_ROOT, abs)) {
    throw new Error(`refusing to write outside vendor/gs1: ${rel}`);
  }
  if (isInside(UPSTREAM_ROOT, abs)) {
    throw new Error(`refusing to write inside the upstream tree: ${abs}`);
  }
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, data);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function fail(lines) {
  console.error("\n❌ sync-gs1: " + lines[0]);
  for (const line of lines.slice(1)) console.error(line);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  let upstream = DEFAULT_UPSTREAM;
  let upstreamSet = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      console.log(
        [
          "Usage: node scripts/sync-gs1.mjs [--from <path>]",
          "",
          `  --from <path>   GS-1 checkout to read (default ${DEFAULT_UPSTREAM})`,
          "",
          "Reads the upstream tree, copies the pinned subset into vendor/gs1/,",
          "and rewrites vendor/gs1/UPSTREAM.json. Never writes upstream.",
        ].join("\n"),
      );
      process.exit(0);
    }
    if (arg === "--from") {
      upstream = argv[i + 1];
      if (!upstream) fail(["`--from` needs a path", "  node scripts/sync-gs1.mjs --from /path/to/synth"]);
      upstreamSet = true;
      i += 1;
      continue;
    }
    if (arg.startsWith("--from=")) {
      upstream = arg.slice("--from=".length);
      upstreamSet = true;
      continue;
    }
    fail([`unknown argument: ${arg}`, "  node scripts/sync-gs1.mjs [--from <path>]"]);
  }
  if (!upstreamSet && process.env.GS1_UPSTREAM) upstream = process.env.GS1_UPSTREAM;
  return path.resolve(upstream);
}

let UPSTREAM_ROOT = parseArgs(process.argv.slice(2));

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function readUpstreamPackage(rel = "package.json") {
  const abs = path.resolve(UPSTREAM_ROOT, rel);
  try {
    return JSON.parse(readFileSync(abs, "utf8"));
  } catch (error) {
    fail([
      `cannot read ${abs}: ${error.message}`,
      `Point --from at a GS-1 checkout (default ${DEFAULT_UPSTREAM}).`,
    ]);
  }
}

function gitReadOnly(args) {
  return execFileSync("git", ["-C", UPSTREAM_ROOT, "--no-optional-locks", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function upstreamCommit() {
  try {
    return gitReadOnly(["rev-parse", "HEAD"]);
  } catch {
    fail([
      `${UPSTREAM_ROOT} is not a git checkout (or git is unavailable).`,
      "A pin has to record the upstream commit SHA, so vendoring needs git.",
      "Run this against a real checkout of GS-1, not an exported tarball.",
    ]);
  }
}

function assertDirection() {
  if (isInside(UPSTREAM_ROOT, DEST_ROOT)) {
    fail([
      `refusing to run: the destination ${DEST_ROOT} is inside the upstream tree ${UPSTREAM_ROOT}.`,
      "vendor/gs1/ must live in this repository, and this script must never write upstream.",
    ]);
  }
  if (isInside(DEST_ROOT, UPSTREAM_ROOT)) {
    fail([
      `refusing to run: the upstream tree ${UPSTREAM_ROOT} is inside the destination ${DEST_ROOT}.`,
      "The vendor directory is owned by this repository; the upstream checkout is not.",
    ]);
  }
}

/** Read a .wasm through Node's own validator and report the ABI it exports. */
function inspectWasm(absPath, label) {
  const bytes = readFileSync(absPath);
  if (bytes.length === 0) {
    fail([`${label} is empty (0 bytes): ${absPath}`, "Rebuild the core before syncing."]);
  }
  let abi;
  try {
    const module = new WebAssembly.Module(bytes);
    const exports = new WebAssembly.Instance(module, {}).exports;
    if (typeof exports.gs_abi_version !== "function") {
      fail([
        `${label} does not export gs_abi_version(): ${absPath}`,
        "That is not a GS-1 core. Rebuild with `npm run build:wasm` upstream.",
      ]);
    }
    abi = exports.gs_abi_version();
  } catch (error) {
    fail([
      `${label} is not a valid WebAssembly module: ${absPath}`,
      `  ${error.message}`,
      "Refusing to vendor a broken set. Rebuild with `npm run build:wasm` upstream.",
    ]);
  }
  if (typeof abi !== "number" || !Number.isInteger(abi) || abi <= 0) {
    fail([`${label} reported a nonsense ABI version (${abi}): ${absPath}`]);
  }
  return { bytes, abi };
}

function pruneToManagedSet() {
  const keep = new Set([...VENDORED_FILES, ...KEEP_FILES].map((f) => path.resolve(DEST_ROOT, f)));
  const stale = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (!keep.has(abs)) stale.push(abs);
    }
  };
  if (!existsSync(DEST_ROOT)) return;
  walk(DEST_ROOT);
  for (const abs of stale) {
    rmSync(abs);
    console.log(`  🧹 removed stale ${path.relative(REPO_ROOT, abs)}`);
  }
  // Drop directories left empty by the prune (top-down, deepest first).
  const dirs = [];
  const collect = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const abs = path.join(dir, entry.name);
        collect(abs);
        dirs.push(abs);
      }
    }
  };
  collect(DEST_ROOT);
  for (const dir of dirs) {
    if (readdirSync(dir).length === 0) rmSync(dir, { recursive: true });
  }
}

function main() {
  assertDirection();

  console.log("===============================================================");
  console.log("  🔄 GS-1 vendoring sync (one direction: --from ─▶ vendor/gs1)");
  console.log("===============================================================\n");
  console.log(`  from: ${UPSTREAM_ROOT}`);
  console.log(`  to:   ${DEST_ROOT}\n`);

  if (!existsSync(UPSTREAM_ROOT)) {
    fail([
      `upstream path does not exist: ${UPSTREAM_ROOT}`,
      `Pass the GS-1 checkout explicitly:`,
      `  node scripts/sync-gs1.mjs --from /path/to/synth`,
    ]);
  }

  // ---- 1. Refuse to vendor an incomplete set -------------------------------
  // The .wasm artifacts are build outputs and are gitignored upstream, so a
  // fresh clone legitimately has none. Vendoring the sources without them would
  // produce a package this repo's CI cannot rebuild (no Rust toolchain), so the
  // only safe move is to stop with instructions.
  const missingWasm = WASM_FILES.filter((rel) => !existsSync(path.resolve(UPSTREAM_ROOT, rel)));
  if (missingWasm.length > 0) {
    fail([
      `GS-1 build artifact(s) missing — nothing was written to vendor/gs1/`,
      "",
      ...missingWasm.map((rel) => `    missing: ${path.resolve(UPSTREAM_ROOT, rel)}`),
      "",
      "  The two .wasm core artifacts are build outputs and are gitignored upstream,",
      "  so a fresh clone does not have them. Build them first:",
      "",
      `    cd ${UPSTREAM_ROOT} && npm run build:wasm`,
      "",
      "  That needs a Rust toolchain with the wasm32 target:",
      "    rustup target add wasm32-unknown-unknown",
      "",
      "  Then re-run this script. The sources alone are NOT vendored, because this",
      "  repository's CI has no Rust toolchain and could never rebuild them.",
    ]);
  }

  // ---- 2. Inspect the cores before copying anything ------------------------
  const simd = inspectWasm(path.resolve(UPSTREAM_ROOT, WASM_FILES[0]), "SIMD core");
  const scalar = inspectWasm(path.resolve(UPSTREAM_ROOT, WASM_FILES[1]), "scalar core");
  if (simd.abi !== scalar.abi) {
    fail([
      `the two cores disagree about the ABI: ${WASM_FILES[0]} says ${simd.abi}, ` +
        `${WASM_FILES[1]} says ${scalar.abi}.`,
      "A mixed build would ship two incompatible engines. Rebuild both.",
    ]);
  }

  // ---- 3. Read metadata ----------------------------------------------------
  const pkg = readUpstreamPackage();
  const commit = upstreamCommit();
  const version = pkg.version ?? "0.0.0";

  // The commit SHA only identifies the *text* we vendored if those files were
  // clean. The artifacts are gitignored, so they never show up here.
  const tracked = VENDORED_FILES.filter((f) => !f.endsWith(".wasm"));
  let dirty = false;
  try {
    const modified = gitReadOnly(["diff", "--name-only", "HEAD", "--", ...tracked]);
    const untracked = gitReadOnly(["ls-files", "--others", "--exclude-standard", "--", ...tracked]);
    dirty = modified.length > 0 || untracked.length > 0;
  } catch {
    /* metadata-only; a failure here must not stop the pin */
  }
  if (dirty) {
    console.warn(
      "  ⚠️  upstream working tree has uncommitted changes in the vendored sources:\n" +
        `      the recorded commit ${commit.slice(0, 12)} will not reproduce these bytes.\n` +
        "      Commit upstream (or accept a non-reproducible pin) and re-sync.\n",
    );
  }

  // ---- 4. Vendor the files -------------------------------------------------
  const manifest = {};
  for (const rel of VENDORED_FILES) {
    const bytes = readUpstream(rel);
    writeVendored(rel, bytes);
    manifest[rel] = { sha256: sha256(bytes), bytes: bytes.length };
    const kb = (bytes.length / 1024).toFixed(1);
    console.log(`  ✅ vendored ${rel.padEnd(38)} ${kb.padStart(8)} KB  ${manifest[rel].sha256.slice(0, 16)}…`);
  }

  pruneToManagedSet();

  // ---- 5. Write the pin ----------------------------------------------------
  // Written last, and never hashed into itself. Deliberately has no timestamp:
  // an unchanged upstream must reproduce a byte-identical UPSTREAM.json so
  // `git diff` staying clean is itself a drift signal.
  const upstreamManifest = {
    $comment:
      "Generated by scripts/sync-gs1.mjs — do not hand-edit. One-directional pin of the GS-1 core; re-run the sync to refresh.",
    upstream: {
      name: pkg.name ?? "groove-synth-gs1",
      version,
      commit,
      license: pkg.license ?? "MIT",
      dirty,
    },
    abi: simd.abi,
    files: Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b))),
  };
  writeVendored("UPSTREAM.json", JSON.stringify(upstreamManifest, null, 2) + "\n");

  console.log(`\n  📌 wrote vendor/gs1/UPSTREAM.json`);
  console.log(`     upstream ${upstreamManifest.upstream.name} v${version} @ ${commit.slice(0, 12)}`);
  console.log(`     ABI ${simd.abi}, ${VENDORED_FILES.length} files pinned`);
  // Publish the runtime copies (see PUBLIC_COPIES).
  const publicGs1 = path.join(REPO_ROOT, "public", "gs1");
  mkdirSync(publicGs1, { recursive: true });
  for (const [from, to] of Object.entries(PUBLIC_COPIES)) {
    copyFileSync(path.join(DEST_ROOT, from), path.join(publicGs1, to));
    console.log(`  📦 published public/gs1/${to}`);
  }

  console.log("\n🎉 GS-1 vendored. Run `node scripts/check-gs1.mjs` to verify the pin.\n");
}

main();
