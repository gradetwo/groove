#!/usr/bin/env node
/**
 * GS-1 vendoring sync — ONE DIRECTION ONLY.
 *
 * Copies the pinned subset of the upstream synthesizer project
 * ("GROOVE SYNTH GS-1", MIT, ABI 9) into `vendor/gs1/`, then writes
 * `vendor/gs1/UPSTREAM.json` recording what was pinned: the upstream version,
 * the upstream commit SHA, the ABI the artifacts actually export, and a
 * SHA-256 for every vendored file.
 *
 * ---------------------------------------------------------------------------
 * THE SOURCE: GITHUB BY DEFAULT
 * ---------------------------------------------------------------------------
 *
 * The dependency points at the public upstream repository:
 *
 *     https://github.com/gradetwo/synth
 *
 * `--ref <tag|commit>` pins the revision; with no `--ref` the script asks the
 * remote for its `v*` tags and takes the newest one. It makes a **shallow,
 * throwaway clone** of that ref under `os.tmpdir()` and reads *that*. A local
 * checkout is a documented, secondary override — `--from <path>` (or the
 * `GS1_UPSTREAM` env var) — for when you already have one sitting there.
 *
 * The two `.wasm` cores are build outputs and are **gitignored upstream**, so a
 * clone does not contain them. In the default GitHub mode the script builds
 * them from the clone's own Rust sources (`crates/synth-core`, using the same
 * cargo invocation as the upstream `npm run build:wasm`, without the optional
 * `wasm-opt` pass so the result is reproducible from cargo alone) with
 * `CARGO_TARGET_DIR` pointed *outside* the clone. Nothing is ever written into
 * the tree this script reads. A `--from` checkout must already be built; if its
 * cores are missing the script stops with the build instructions rather than
 * vendoring a partial set.
 *
 * ---------------------------------------------------------------------------
 * DIRECTION OF DATA FLOW — the whole point of this script
 * ---------------------------------------------------------------------------
 *
 *     UPSTREAM (GitHub clone / --from)  ── read-only ──▶  DEST_ROOT (vendor/gs1)
 *
 * There is no `--to`, no `--reverse`, and no update mode. Every read of the
 * upstream tree goes through `readUpstream()`. Every write — without exception —
 * goes through `writeVendored()`, which refuses any path that does not resolve
 * inside DEST_ROOT and refuses DEST_ROOT itself if it would ever resolve inside
 * UPSTREAM_ROOT. The upstream checkout is read-only input; the clone as much as
 * a `--from` directory.
 *
 * Why vendoring and not a submodule / subtree / npm package:
 *   - submodule: the upstream now has a git remote, but a submodule would track
 *     a moving ref, and this repo needs a fixed, ABI-validated set of *build
 *     artifacts* that upstream does not commit;
 *   - subtree:   it would splice GS-1's unrelated history into this repo's;
 *   - npm:       GS-1 is `private: true` and publishes no package.
 *
 * Usage:
 *   node scripts/sync-gs1.mjs [--ref <tag|commit>]  # GitHub (default)
 *   node scripts/sync-gs1.mjs --from <path>         # local checkout (override)
 *   node scripts/sync-gs1.mjs --help
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEST_ROOT = path.join(REPO_ROOT, "vendor", "gs1");

/** The upstream dependency. This is the default source; `--from` is an override. */
const DEFAULT_REMOTE = "https://github.com/gradetwo/synth";

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

/**
 * Files under `vendor/gs1/` that are *ours*, not upstream copies, and must survive a sync.
 *
 * `pruneToManagedSet` deletes anything not in the manifest, which is right for upstream files (a
 * renamed upstream module must not linger) but wrong for the two documents we add: the README
 * explaining the pin, and the third-party notices that discharge the licence obligation the
 * upstream artifacts do not. Without this list a routine sync silently deleted the notices file —
 * which is exactly the compliance gap the file exists to close.
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

/** The two cargo builds the upstream `npm run build:wasm` performs, in its order. */
const CARGO_VARIANTS = [
  { file: "src/generated/synth_core.wasm", simd: true },
  { file: "src/generated/synth_core_scalar.wasm", simd: false },
];

// ---------------------------------------------------------------------------
// Temp scratch (the clone + cargo target dir), always removed on exit
// ---------------------------------------------------------------------------

const TEMP_DIRS = [];

function makeTemp(prefix) {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  TEMP_DIRS.push(dir);
  return dir;
}

process.on("exit", () => {
  for (const dir of TEMP_DIRS) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best-effort scratch cleanup */
    }
  }
});

// ---------------------------------------------------------------------------
// Path helpers + the two guarded I/O primitives
// ---------------------------------------------------------------------------

function isInside(parent, child) {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * Bytes this run produced outside the upstream tree (the cargo-built `.wasm`
 * cores), keyed by upstream-relative path. `readUpstream` consults it first so
 * the built artifacts flow through the same read gate as cloned sources.
 */
const OVERLAY = new Map();

function sourceOf(rel) {
  return OVERLAY.has(rel)
    ? `${rel} (built from the clone's crates/synth-core)`
    : path.resolve(UPSTREAM_ROOT, rel);
}

function upstreamHas(rel) {
  return OVERLAY.has(rel) || existsSync(path.resolve(UPSTREAM_ROOT, rel));
}

/** The ONLY way this script reads upstream bytes. Read-only by construction. */
function readUpstream(rel) {
  if (OVERLAY.has(rel)) return OVERLAY.get(rel);
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

const firstLine = (text) =>
  String(text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)[0] ?? "";

function fail(lines) {
  console.error("\n❌ sync-gs1: " + lines[0]);
  for (const line of lines.slice(1)) console.error(line);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function usage() {
  return [
    "Usage: node scripts/sync-gs1.mjs [--ref <tag|commit>] [--from <path>] [--remote <url>]",
    "",
    `  (default)            clone ${DEFAULT_REMOTE} and pin its newest v* tag`,
    "  --ref <tag|commit>   pin a specific upstream tag or commit SHA",
    "  --from <path>        read an existing local checkout instead (optional override;",
    "                       it must already contain the built .wasm cores)",
    `  --remote <url>       override the GitHub remote (default ${DEFAULT_REMOTE})`,
    "",
    "Reads the upstream tree, builds the .wasm cores from its Rust sources when the",
    "clone does not carry them, copies the pinned subset into vendor/gs1/, and",
    "rewrites vendor/gs1/UPSTREAM.json. Never writes the upstream tree.",
  ].join("\n");
}

function parseArgs(argv) {
  let from = null;
  let ref = null;
  let remote = process.env.GS1_REMOTE || DEFAULT_REMOTE;
  let remoteSet = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (arg === "--from" || arg.startsWith("--from=")) {
      from = arg.includes("=") ? arg.slice("--from=".length) : argv[++i];
      if (!from) fail(["`--from` needs a path", "  node scripts/sync-gs1.mjs --from /path/to/synth"]);
      continue;
    }
    if (arg === "--ref" || arg.startsWith("--ref=")) {
      ref = arg.includes("=") ? arg.slice("--ref=".length) : argv[++i];
      if (!ref) fail(["`--ref` needs a tag or commit", "  node scripts/sync-gs1.mjs --ref v2.1.9"]);
      continue;
    }
    if (arg === "--remote" || arg.startsWith("--remote=")) {
      remote = arg.includes("=") ? arg.slice("--remote=".length) : argv[++i];
      if (!remote) fail(["`--remote` needs a URL", `  node scripts/sync-gs1.mjs --remote ${DEFAULT_REMOTE}`]);
      remoteSet = true;
      continue;
    }
    fail([`unknown argument: ${arg}`, "  node scripts/sync-gs1.mjs [--ref <tag|commit>] [--from <path>]"]);
  }

  if (!from && process.env.GS1_UPSTREAM) from = process.env.GS1_UPSTREAM;
  if (from) {
    if (ref) {
      fail([
        "`--from` and `--ref` cannot be combined.",
        "`--ref` checks out a GitHub revision; `--from` reads a local checkout exactly as it is.",
      ]);
    }
    if (remoteSet) {
      fail(["`--from` and `--remote` cannot be combined.", "Pick one source: GitHub (default) or a local checkout."]);
    }
  }

  return { from: from ? path.resolve(from) : null, ref, remote };
}

const MODE = parseArgs(process.argv.slice(2));

/** The upstream root for this run: a local checkout, or the fresh clone. */
let UPSTREAM_ROOT = null;

// ---------------------------------------------------------------------------
// GitHub source: ref resolution + shallow clone
// ---------------------------------------------------------------------------

function ensureGit() {
  try {
    execFileSync("git", ["--version"], { stdio: ["ignore", "ignore", "ignore"] });
  } catch {
    fail([
      "git is not available on PATH, and the default source is a GitHub clone.",
      "Install git, or pass `--from <path>` for a checkout that is already built.",
    ]);
  }
}

function gitLsRemote(remote, args) {
  try {
    return execFileSync("git", ["ls-remote", ...args, remote], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    fail([
      `cannot reach ${remote} (no network, a bad URL, or git refused it).`,
      `  ${firstLine(error.stderr || error.message)}`,
      "Refusing to fall back to a local directory. Pass `--from <path>` to read a checkout explicitly.",
    ]);
  }
}

/** Numeric compare for `v<major>.<minor>.<patch>` tags (multi-digit safe). */
function compareVersions(a, b) {
  const pa = a.slice(1).split(".").map(Number);
  const pb = b.slice(1).split(".").map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

/** The newest `v<major>.<minor>.<patch>` tag the remote advertises. */
function latestTag(remote) {
  const out = gitLsRemote(remote, ["--tags", "--refs"]);
  const tags = out
    .split("\n")
    .map((line) => line.split("\t")[1])
    .filter(Boolean)
    .map((ref) => ref.replace(/^refs\/tags\//, ""))
    .filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag));
  if (tags.length === 0) {
    fail([`${remote} advertises no v* release tags.`, "Pass `--ref <tag|commit>` to pin one explicitly."]);
  }
  tags.sort(compareVersions);
  return tags[tags.length - 1];
}

/** Shallow-clone one ref into a throwaway temp dir. Returns the clone path. */
function cloneRef(remote, ref) {
  const dir = makeTemp("gs1-sync-");
  const git = (args) =>
    execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  try {
    execFileSync("git", ["init", "--quiet", dir], { stdio: ["ignore", "ignore", "ignore"] });
    git(["remote", "add", "origin", remote]);
    git(["fetch", "--quiet", "--depth", "1", "origin", ref]);
    git(["checkout", "--quiet", "--detach", "FETCH_HEAD"]);
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    fail([
      `cannot resolve or fetch ref "${ref}" from ${remote}.`,
      `  ${firstLine(error.stderr || error.message)}`,
      `Check the ref with:  git ls-remote --tags ${remote}`,
      "Refusing to fall back to a local directory.",
    ]);
  }
  return dir;
}

// ---------------------------------------------------------------------------
// Building the gitignored .wasm cores from the clone's Rust sources
// ---------------------------------------------------------------------------

/**
 * Build both cores from the clone's `crates/synth-core` into OVERLAY.
 *
 * Mirrors the cargo invocation of the upstream `npm run build:wasm`, but with
 * `CARGO_TARGET_DIR` outside the clone so the tree we read stays untouched, and
 * deliberately without the optional `wasm-opt` pass: the committed cores are the
 * unoptimised cargo output, and cargo alone is reproducible (verified — a fresh
 * v2.1.9 clone rebuilds the vendored bytes exactly).
 */
function buildWasmCores(cloneDir) {
  const crateDir = path.join(cloneDir, "crates", "synth-core");
  if (!existsSync(path.join(crateDir, "Cargo.toml"))) {
    fail([
      `the clone has no .wasm cores and no ${path.relative(cloneDir, crateDir)}/Cargo.toml to build them from.`,
      "Pass `--from <path>` for a checkout that already has the built artifacts.",
    ]);
  }
  const targetDir = path.join(makeTemp("gs1-build-"), "cargo-target");
  console.log("  🔨 the clone has no .wasm (upstream gitignores them) — building from its Rust sources…");
  for (const variant of CARGO_VARIANTS) {
    try {
      execFileSync("cargo", ["build", "--locked", "--target", "wasm32-unknown-unknown", "--release"], {
        cwd: crateDir,
        env: {
          ...process.env,
          CARGO_TARGET_DIR: targetDir,
          GS_SIMD: variant.simd ? "1" : "0",
          RUSTFLAGS: `-C target-feature=${variant.simd ? "+" : "-"}simd128`,
        },
        encoding: "utf8",
        stdio: ["ignore", "ignore", "pipe"],
      });
    } catch (error) {
      fail([
        `cargo could not build ${variant.file} from ${crateDir}.`,
        `  ${firstLine(error.stderr || error.message)}`,
        "  It needs the Rust toolchain with the wasm target:  rustup target add wasm32-unknown-unknown",
        "Refusing to vendor a partial set.",
      ]);
    }
    const built = path.join(targetDir, "wasm32-unknown-unknown", "release", "synth_core.wasm");
    if (!existsSync(built)) {
      fail([`cargo reported success but ${built} does not exist.`, "Refusing to vendor a partial set."]);
    }
    OVERLAY.set(variant.file, readFileSync(built));
    console.log(`  🔨 built ${variant.file} (${(OVERLAY.get(variant.file).length / 1024).toFixed(1)} KB)`);
  }
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

function readUpstreamPackage(rel = "package.json") {
  const abs = path.resolve(UPSTREAM_ROOT, rel);
  try {
    return JSON.parse(readFileSync(abs, "utf8"));
  } catch (error) {
    fail([
      `cannot read ${abs}: ${error.message}`,
      "That does not look like a GS-1 checkout. Use --ref to pick a revision, or --from for a local one.",
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
      "Point --from at a real checkout of GS-1, not an exported tarball.",
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
function inspectWasm(bytes, label) {
  if (bytes.length === 0) {
    fail([`${label} is empty (0 bytes)`, "Rebuild the core before syncing."]);
  }
  let abi;
  try {
    const module = new WebAssembly.Module(bytes);
    const exports = new WebAssembly.Instance(module, {}).exports;
    if (typeof exports.gs_abi_version !== "function") {
      fail([
        `${label} does not export gs_abi_version().`,
        "That is not a GS-1 core. Rebuild with `npm run build:wasm` upstream.",
      ]);
    }
    abi = exports.gs_abi_version();
  } catch (error) {
    fail([
      `${label} is not a valid WebAssembly module.`,
      `  ${error.message}`,
      "Refusing to vendor a broken set. Rebuild with `npm run build:wasm` upstream.",
    ]);
  }
  if (typeof abi !== "number" || !Number.isInteger(abi) || abi <= 0) {
    fail([`${label} reported a nonsense ABI version (${abi}).`]);
  }
  return abi;
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function resolveUpstream() {
  if (MODE.from) {
    if (!existsSync(MODE.from)) {
      fail([
        `local checkout does not exist: ${MODE.from}`,
        "Pass a real GS-1 checkout, or drop `--from` to use the default GitHub source.",
      ]);
    }
    UPSTREAM_ROOT = MODE.from;
    console.log(`  source: ${UPSTREAM_ROOT}  (local checkout — optional override)\n`);
    return;
  }
  ensureGit();
  const ref = MODE.ref ?? latestTag(MODE.remote);
  console.log(`  source: ${MODE.remote} @ ${ref}${MODE.ref ? "" : "  (newest v* tag)"}`);
  console.log("  cloning shallowly into a temp dir…\n");
  UPSTREAM_ROOT = cloneRef(MODE.remote, ref);
}

function main() {
  console.log("===============================================================");
  console.log("  🔄 GS-1 vendoring sync (upstream ─▶ vendor/gs1)");
  console.log("===============================================================\n");

  resolveUpstream();

  // Set as soon as the upstream root is known, so the clone path gets the same
  // guarantee as a `--from` checkout: DEST_ROOT can never be inside it.
  assertDirection();
  console.log(`  to:     ${DEST_ROOT}\n`);

  // ---- 1. The .wasm artifacts --------------------------------------------
  // They are build outputs and are gitignored upstream, so a fresh clone
  // legitimately has none. In GitHub mode we build them from the clone's own
  // Rust sources (writing the cargo output outside the clone); a `--from`
  // checkout has to arrive built, because this repository's CI has no Rust
  // toolchain and could never rebuild them.
  const missingWasm = WASM_FILES.filter((rel) => !upstreamHas(rel));
  if (missingWasm.length > 0) {
    if (MODE.from) {
      fail([
        `GS-1 build artifact(s) missing from the local checkout — nothing was written to vendor/gs1/`,
        "",
        ...missingWasm.map((rel) => `    missing: ${path.resolve(UPSTREAM_ROOT, rel)}`),
        "",
        "  The two .wasm cores are build outputs and are gitignored upstream, so a",
        "  `--from` checkout must already have them. Build them first:",
        "",
        `    cd ${UPSTREAM_ROOT} && npm run build:wasm`,
        "",
        "  That needs a Rust toolchain with the wasm32 target:",
        "    rustup target add wasm32-unknown-unknown",
        "",
        "  Or drop `--from` and let the default GitHub path clone + build them.",
      ]);
    }
    buildWasmCores(UPSTREAM_ROOT);
  }

  // ---- 2. Inspect the cores before copying anything ------------------------
  const simd = inspectWasm(readUpstream(WASM_FILES[0]), sourceOf(WASM_FILES[0]));
  const scalar = inspectWasm(readUpstream(WASM_FILES[1]), sourceOf(WASM_FILES[1]));
  if (simd !== scalar) {
    fail([
      `the two cores disagree about the ABI: ${WASM_FILES[0]} says ${simd}, ` +
        `${WASM_FILES[1]} says ${scalar}.`,
      "A mixed build would ship two incompatible engines. Rebuild both.",
    ]);
  }

  // ---- 3. Read metadata ----------------------------------------------------
  const pkg = readUpstreamPackage();
  const commit = upstreamCommit();
  const version = pkg.version ?? "0.0.0";

  // The commit SHA only identifies the *text* we vendored if those files were
  // clean. The artifacts are gitignored, so they never show up here; the clone
  // is clean by construction, while a `--from` checkout may not be.
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
    abi: simd,
    files: Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b))),
  };
  writeVendored("UPSTREAM.json", JSON.stringify(upstreamManifest, null, 2) + "\n");

  console.log(`\n  📌 wrote vendor/gs1/UPSTREAM.json`);
  console.log(`     upstream ${upstreamManifest.upstream.name} v${version} @ ${commit.slice(0, 12)}`);
  console.log(`     ABI ${simd}, ${VENDORED_FILES.length} files pinned`);
  // Publish the runtime copies (see PUBLIC_COPIES).
  const publicGs1 = path.join(REPO_ROOT, "public", "gs1");
  mkdirSync(publicGs1, { recursive: true });
  for (const [from, to] of Object.entries(PUBLIC_COPIES)) {
    copyFileSync(path.join(DEST_ROOT, from), path.join(publicGs1, to));
    console.log(`  📦 published public/gs1/${to}`);
  }

  console.log("\n🎉 GS-1 vendored. Run `node scripts/check-gs1.mjs` to verify the pin.\n");
}

try {
  main();
} catch (error) {
  console.error("\n❌ sync-gs1 crashed — unexpected error:");
  console.error(`   ${error && error.stack ? error.stack : String(error)}\n`);
  process.exit(1);
}
