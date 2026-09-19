#!/usr/bin/env node
/**
 * Slow-track handoff packer — run the long gates somewhere fast, hand back one file.
 *
 *   node scripts/slow_pack.mjs list                     # print the plan, run nothing
 *   node scripts/slow_pack.mjs export [--out <dir>]     # package THIS exact tree for transfer
 *   node scripts/slow_pack.mjs run [flags]              # run every gate, package the evidence
 *   node scripts/slow_pack.mjs verify <dir|tar.gz>      # check a package that came back
 *
 * Why this exists: the slow track is fail-fast and writes its results to a terminal, so a
 * multi-hour run on a slow machine either dies at the first red gate or leaves its evidence
 * behind. This script runs *every* gate regardless of earlier failures, tees each one to its
 * own log, extracts the numbers that matter, and packs the whole thing (logs + artifacts +
 * exact git state + per-file SHA-256) into one tarball that can be sent back and re-verified.
 *
 * `run` flags:
 *   --label <name>      package name (default v<version>_<sha7>)
 *   --out <dir>         output directory (default ./slowpack-out)
 *   --measure           also run the hours-long baseline measurements (writes into the
 *                       package via `--out`, never over the committed baselines)
 *   --install           npm ci before the gates (fresh machine)
 *   --only <slugs>      comma-separated subset of gate slugs
 *   --skip <slugs>      comma-separated gates to skip (recorded as skipped, not passed)
 *   --no-tarball        leave the package as a directory
 *   --quiet             package only; do not stream gate output to the terminal
 *   --timeout-scale <n> multiply every per-gate timeout (slow machines: try 2)
 *
 * Exit codes: 0 all green · 3 package written but some gate failed · 4 the packer itself failed.
 */
import { spawn } from "node:child_process";
import { execFileSync, execSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const SELF = path.relative(ROOT, fileURLToPath(import.meta.url)) || "scripts/slow_pack.mjs";
const argv = process.argv.slice(2);
const MODES = ["run", "export", "verify", "list", "help"];
const mode = MODES.includes(argv[0]) ? argv[0] : "run";
const hasFlag = (name) => argv.includes(`--${name}`);
const argValue = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const nowStamp = () => new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);

/**
 * Past this, a run should be handed off rather than watched.
 *
 * The rule (from the user): anything expected to take more than ~20 minutes becomes a script the
 * user runs on a faster machine, with result collection and packaging built in — which is what this
 * packer already is. The number is reported so the decision is made on data, not on a hunch.
 */
const HANDOFF_THRESHOLD_MINUTES = 20;

/* ------------------------------------------------------------------ the plan */

// Mirrors `scripts/track.mjs slow` exactly (same commands, same order), plus the GS-1
// contract check that `npm run verify` runs but the slow lane does not. Each gate is
// independent here: a red gate no longer prevents the rest from producing evidence.
const SLOW_GATES = [
  { slug: "typecheck", label: "TypeScript typecheck", cmd: "npx", args: ["tsc", "--noEmit"], timeoutMin: 15 },
  { slug: "lint", label: "ESLint (all sources)", cmd: "npx", args: ["eslint", "src/**/*.{ts,tsx}"], timeoutMin: 15 },
  { slug: "data-lint", label: "Genre data lint", cmd: "npx", args: ["vitest", "run", "src/test/schema.test.ts", "--reporter=dot"], timeoutMin: 20 },
  { slug: "genre-audit", label: "Genre database audit (relations + timeline)", cmd: "npx", args: ["vite-node", "scripts/lint_genres.ts"], timeoutMin: 20 },
  { slug: "docs", label: "Documentation baseline check", cmd: "node", args: ["scripts/check_docs.mjs"], timeoutMin: 5 },
  { slug: "suite", label: "Full suite + coverage", cmd: "npx", args: ["vitest", "run", "--coverage", "--reporter=dot"], timeoutMin: 90 },
  { slug: "build", label: "Production build", cmd: "npm", args: ["run", "build"], timeoutMin: 30 },
  { slug: "budget", label: "Bundle budget gate", cmd: "node", args: ["scripts/check_budgets.js"], timeoutMin: 10 },
  { slug: "gs1-contract", label: "GS-1 contract + asset identity", cmd: "node", args: ["scripts/check-gs1.mjs"], timeoutMin: 10, extra: true },
  { slug: "e2e", label: "Cross-device E2E matrix", cmd: "node", args: ["scripts/test_matrix.js"], timeoutMin: 60 },
  { slug: "perf", label: "Real-browser performance gate", cmd: "node", args: ["scripts/measure_live_perf.mjs", "--local"], timeoutMin: 30 },
  { slug: "redlines", label: "Red-line checks", cmd: "node", args: ["scripts/redlines.mjs"], timeoutMin: 10 },
  { slug: "loudness-spread", label: "Genre loudness spread gate", cmd: "node", args: ["scripts/check_loudness_spread.mjs"], timeoutMin: 10 },
  { slug: "timbre-spread", label: "Genre timbre spread gate", cmd: "node", args: ["scripts/check_timbre_spread.mjs"], timeoutMin: 10 },
  { slug: "gs1-load", label: "GS-1 budget evidence gate", cmd: "node", args: ["scripts/check_gs1_load.mjs"], timeoutMin: 10 },
  { slug: "gs1-jitter", label: "GS-1 live timing jitter gate", cmd: "node", args: ["scripts/check_gs1_jitter.mjs"], timeoutMin: 10 },
];

// The hours-long measurements. They write to `--out` inside the package on purpose: the
// committed baselines under scripts/*.baseline.json must not be rewritten by a run on
// another machine, and a fresh measurement is far more useful as a cross-machine diff.
const MEASUREMENTS = [
  {
    slug: "measure-loudness",
    label: "Measure genre loudness (all genres)",
    cmd: "node",
    args: ["scripts/measure_genre_loudness.mjs"],
    timeoutMin: 240,
    outFile: "loudness.measured.json",
    compareTo: "scripts/loudness.baseline.json",
    metric: "lufs",
  },
  {
    slug: "measure-timbre",
    label: "Measure genre timbre (all genres)",
    cmd: "node",
    args: ["scripts/measure_genre_timbre.mjs"],
    timeoutMin: 240,
    outFile: "timbre.measured.json",
    compareTo: "scripts/timbre.baseline.json",
    metric: "timbre",
  },
  {
    slug: "measure-gs1-load",
    label: "Measure GS-1 voice load",
    cmd: "node",
    args: ["scripts/measure_gs1_load.mjs"],
    timeoutMin: 60,
    outFile: "gs1.load.measured.json",
    compareTo: "scripts/gs1.load.baseline.json",
    metric: "gs1load",
  },
  {
    slug: "measure-gs1-jitter",
    label: "Measure GS-1 live jitter",
    cmd: "node",
    args: ["scripts/measure_gs1_jitter.mjs"],
    timeoutMin: 60,
    outFile: "gs1.jitter.measured.json",
    compareTo: "scripts/gs1.jitter.baseline.json",
    metric: "gs1jitter",
  },
];

/* ------------------------------------------------------------------ helpers */

function capture(cmd, args) {
  try {
    return execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

/**
 * Like `capture` but keeps the bytes exactly.
 *
 * `git diff` must NOT be trimmed: losing its trailing newline makes the patch "corrupt" to
 * `git apply`, which is how the smoke run first failed to attribute its own package.
 */
function captureRaw(cmd, args) {
  try {
    return execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
}

function gitState() {
  // An `export`ed tree (built with `git archive`) has no .git directory at all, so the commit
  // has to come from the COMMIT.txt the export writes. Without this the results package would
  // come back with an empty sha — unattributable, which is the one thing it must never be.
  if (capture("git", ["rev-parse", "--is-inside-work-tree"]) !== "true") {
    const lines = fs.existsSync(path.join(ROOT, "COMMIT.txt"))
      ? fs.readFileSync(path.join(ROOT, "COMMIT.txt"), "utf8").split("\n")
      : [];
    return {
      available: false,
      sha: (lines[0] ?? "").trim(),
      branch: (lines[1] ?? "").trim(),
      describe: (lines[2] ?? "").trim(),
      subject: (lines[3] ?? "").trim(),
      dirty: false,
      statusLines: ["(no .git in this tree: it is an exported source package; the commit comes from COMMIT.txt)"],
      diff: "",
      untracked: [],
      trackedChanges: [],
      cwd: ROOT,
      toplevel: "",
      // The commit above came from COMMIT.txt, and `verify` needs to be told so rather than
      // reporting "neither .git nor COMMIT.txt" for a package that is in fact fully attributable.
      localSha: "",
      fromCommitTxt: true,
    };
  }
  const localSha = capture("git", ["rev-parse", "HEAD"]);
  // An exported package carries COMMIT.txt; that is the upstream revision, and the package's own
  // git (if any) is a tooling artefact, never the truth about what was measured.
  const commitTxt = fs.existsSync(path.join(ROOT, "COMMIT.txt"))
    ? fs.readFileSync(path.join(ROOT, "COMMIT.txt"), "utf8").split("\n").map((l) => l.trim())
    : null;
  const sha = commitTxt?.[0] || localSha;
  const branch = commitTxt?.[1] || capture("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  const status = capture("git", ["status", "--porcelain"]);
  const diff = captureRaw("git", ["diff", "HEAD"]);
  // "Dirty" must mean "the *tracked* tree differs from HEAD", because that is the only thing the
  // patch can carry. Counting untracked files here made a perfectly attributable run look
  // unattributable: on the v2.0.18 run, one unpacked source directory (`?? slowpack-v2.0.18-src/`)
  // was enough for `verify` to reject the package even though no tracked file had changed.
  const trackedChanges = [
    ...capture("git", ["diff", "--name-only", "HEAD"]).split("\n"),
    ...capture("git", ["diff", "--name-only", "--cached"]).split("\n"),
  ].filter(Boolean);
  return {
    available: true,
    sha,
    branch,
    dirty: trackedChanges.length > 0,
    trackedChanges,
    statusLines: status ? status.split("\n") : [],
    diff,
    describe: commitTxt?.[2] || capture("git", ["describe", "--tags", "--always", "--dirty"]),
    localSha,
    fromCommitTxt: Boolean(commitTxt),
    subject: capture("git", ["log", "-1", "--pretty=%s"]),
    untracked: capture("git", ["ls-files", "--others", "--exclude-standard"]).split("\n").filter(Boolean),
    /** Where the packer ran, and the worktree that owns it — the pair that explains most
     *  "the test suite could not even collect" reports (see `preflightProblems`). */
    cwd: ROOT,
    toplevel: capture("git", ["rev-parse", "--show-toplevel"]),
  };
}

/**
 * Reasons this tree cannot produce trustworthy gate results.
 *
 * Written from a real failure: a v2.0.18 run on another machine reported **120 test files failed
 * to collect** with `Failed to load url …/src/test/setup.ts … Does the file exist?`, and two gates
 * went red for it. The code was fine — the gates had been started from the *unpacked source
 * directory inside the existing checkout*, so Vite/Vitest resolved the test setup against the
 * outer worktree instead of the package. Two minutes of gates produced a package that looked like
 * a regression.
 *
 * A preflight is the honest fix: refuse to run in a tree that cannot mean what the results claim,
 * and say exactly how to fix it. `--continue-anyway` exists for someone who knows better.
 */
function preflightProblems() {
  const problems = [];
  for (const required of ["package.json", "vitest.config.ts", "src/test/setup.ts"]) {
    if (!fs.existsSync(path.join(ROOT, required))) problems.push(`missing ${required} — this is not the project root`);
  }
  if (!fs.existsSync(path.join(ROOT, "node_modules"))) {
    problems.push("node_modules is missing — run `npm ci` first, or pass --install");
  }
  return problems;
}

/**
 * Non-fatal observations about the tree. Printed, not enforced: the two things that made a nested
 * run fail (a relative test-setup path, and git-based gates) are fixed at the source now, so a
 * nested extraction is a smell worth reporting rather than a reason to refuse.
 */
function preflightWarnings() {
  const warnings = [];
  const toplevel = capture("git", ["rev-parse", "--show-toplevel"]);
  if (toplevel && path.resolve(toplevel) !== path.resolve(ROOT)) {
    warnings.push(
      `this directory is nested inside the git worktree at ${toplevel}. Test setup is resolved` +
        ` absolutely and git-based gates use the packer's own throwaway repository, so the results are` +
        ` still valid — but extracting outside any checkout is the configuration that was tested.`
    );
  }
  return warnings;
}

/**
 * A throwaway git repository for trees that have none.
 *
 * The exported source package is built with `git archive`, so it carries no `.git` — and one
 * red-line check (`git ls-files`, which is how R4a/R5a/R9a know which files are tracked) needs a
 * repository. On the v2.0.18 re-run that was the single remaining red gate:
 *
 *     fatal: not a git repository (or any of the parent directories): .git
 *
 * Rather than requiring the user to keep a checkout around — being *inside* one is what broke the
 * previous run — the packer builds a one-commit repository in a temp directory, points `GIT_DIR` /
 * `GIT_WORK_TREE` at it for every gate, and deletes it afterwards. `COMMIT.txt` stays the
 * authoritative revision; the synthetic repository exists only so the gates can run.
 */
function createGateGit(git) {
  const realRepoAtRoot = Boolean(git.available && git.toplevel && path.resolve(git.toplevel) === path.resolve(ROOT));
  if (realRepoAtRoot) return null;

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slowpack-git-"));
  const env = { ...process.env, GIT_DIR: dir, GIT_WORK_TREE: ROOT };
  const gitIn = (args) => execFileSync("git", args, { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
  try {
    gitIn(["init", "-q"]);
    gitIn(["config", "user.name", "Groove Lab slow pack"]);
    gitIn(["config", "user.email", "noreply@example.invalid"]);
    gitIn(["add", "-A"]);
    gitIn(["commit", "-qm", `slow-pack snapshot of ${git.sha || "unknown revision"}`]);
  } catch (err) {
    fs.rmSync(dir, { recursive: true, force: true });
    return { error: String(err?.stderr ?? err?.message ?? err).trim(), dir: null, env: null };
  }
  return { dir, env };
}

function hostInfo() {
  const cpus = os.cpus();
  return {
    hostname: os.hostname(),
    platform: `${os.platform()} ${os.release()}`,
    arch: os.arch(),
    cpuModel: cpus[0]?.model ?? "unknown",
    cpuCount: cpus.length,
    totalMemGB: +(os.totalmem() / 1024 ** 3).toFixed(1),
    freeMemGB: +(os.freemem() / 1024 ** 3).toFixed(1),
    node: process.version,
    npm: capture("npm", ["--version"]),
    playwright: capture("npx", ["playwright", "--version"]) || "not installed",
    playwrightBrowsers: (() => {
      const dir = path.join(os.homedir(), ".cache", "ms-playwright");
      try {
        return fs.readdirSync(dir).filter((d) => !d.startsWith(".")).join(", ");
      } catch {
        return "none";
      }
    })(),
  };
}

/** Truncate a log line for the summary table. */
const clip = (line, max = 180) => {
  const clean = line.replace(/\u001b\[[0-9;]*m/g, "").replace(/\s+$/, "");
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
};

const HIGHLIGHT_PATTERNS = [
  /✅/,
  /❌/,
  /\bFAIL(ED)?\b/,
  /p90\s*[−-]?\s*p10/i,
  /true peak/i,
  /distinct/i,
  /closest/i,
  /LUFS/i,
  /jitter/i,
  /real-?time/i,
  /Tests?\s+\d+/,
  /All files/,
  /budget/i,
  /综合|结论|结果|门禁/,
];

/** Pull the lines worth reading out of a gate log, so the summary is self-sufficient. */
function extractHighlights(logText, max = 14) {
  const lines = logText.split("\n");
  const seen = new Set();
  const out = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 4) continue;
    if (!HIGHLIGHT_PATTERNS.some((re) => re.test(trimmed))) continue;
    const clipped = clip(trimmed);
    if (seen.has(clipped)) continue;
    seen.add(clipped);
    out.push(clipped);
    if (out.length >= max) break;
  }
  return out;
}

function tailLines(logText, count = 12) {
  return logText
    .split("\n")
    .map((l) => clip(l))
    .filter(Boolean)
    .slice(-count);
}

/* ------------------------------------------------------------ step execution */

function killTree(child) {
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      /* already gone */
    }
  }
  setTimeout(() => {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }, 10_000).unref?.();
}

async function runStep(step, ctx) {
  const logName = `${String(ctx.order).padStart(2, "0")}-${step.slug}.log`;
  const logPath = path.join(ctx.logDir, logName);
  const startedAt = new Date();
  const t0 = Date.now();
  const env = { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1", ...(ctx.gateEnv ?? {}), ...(step.env ?? {}) };

  if (!ctx.quiet) {
    console.log(`\n\u2500\u2500 ${step.label}\n   $ ${step.cmd} ${step.args.join(" ")}`);
  }

  const child = spawn(step.cmd, step.args, {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });

  let captured = "";
  const onData = (buf) => {
    const text = buf.toString();
    captured += text;
    if (captured.length > 4_000_000) captured = captured.slice(-2_000_000); // keep memory bounded
    if (!ctx.quiet) process.stdout.write(text);
    if (ctx.streamFile) fs.appendFileSync(ctx.streamFile, text);
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);

  let timedOut = false;
  const timeoutMs = (step.timeoutMin ?? 30) * 60_000 * ctx.timeoutScale;
  const timer = setTimeout(() => {
    timedOut = true;
    killTree(child);
  }, timeoutMs);

  let exitCode = null;
  let signal = null;
  try {
    const [code, sig] = await once(child, "close");
    exitCode = code;
    signal = sig;
  } catch (err) {
    exitCode = -1;
    signal = String(err?.message ?? err);
  }
  clearTimeout(timer);

  const seconds = +((Date.now() - t0) / 1000).toFixed(1);
  const status = timedOut ? "timeout" : exitCode === 0 ? "pass" : "fail";

  const header = [
    `# ${step.label}`,
    `# slug    : ${step.slug}`,
    `# command : ${step.cmd} ${step.args.join(" ")}`,
    `# git     : ${ctx.git.sha}${ctx.git.dirty ? " (dirty tree)" : ""}`,
    `# started : ${startedAt.toISOString()}`,
    `# status  : ${status}${timedOut ? ` (timeout after ${Math.round(timeoutMs / 60000)} min)` : ""}`,
    `# exit    : ${exitCode}${signal ? ` signal=${signal}` : ""}`,
    `# seconds : ${seconds}`,
    "",
    "",
  ].join("\n");
  fs.writeFileSync(logPath, header + captured);

  const icon = status === "pass" ? "\u2705" : status === "timeout" ? "\u23f1" : "\u274c";
  console.log(`${icon} ${step.label} (${seconds}s, ${status})`);

  return {
    slug: step.slug,
    label: step.label,
    lane: step.extra ? "verify-extra" : "slow",
    command: `${step.cmd} ${step.args.join(" ")}`,
    status,
    exitCode,
    signal: signal ?? null,
    timedOut,
    seconds,
    startedAt: startedAt.toISOString(),
    log: `logs/${logName}`,
    bytes: Buffer.byteLength(captured),
    highlights: extractHighlights(captured),
    tail: extractHighlights(captured).length ? [] : tailLines(captured),
  };
}

/* ------------------------------------------------- baseline cross-comparison */

function readJsonSafe(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Compare a freshly measured file against the committed baseline.
 *
 * This is the question a second machine is uniquely able to answer: does the baseline we
 * committed still describe reality, or did it encode one machine's quirk?
 *
 * The first version of this function *guessed* at the report shapes (looking for a `genres`
 * array and an `id` field). Every report actually keys its genres by **object map**, and the
 * GS-1 reports are not genre-keyed at all, so a run that spent 22 minutes measuring four
 * baselines came back with four "no matching genre ids" non-answers. The adapters below are
 * therefore explicit per report: each one names the exact fields it reads, and an unrecognised
 * shape returns `ok:false` with a reason instead of quietly comparing nothing.
 */
const round = (v, digits = 3) => (typeof v === "number" && Number.isFinite(v) ? +v.toFixed(digits) : null);

/** Sorted worst-first deltas plus the summary statistics every adapter reports. */
function deltaSummary(pairs) {
  const deltas = pairs
    .map((p) => ({ id: p.id, baseline: round(p.baseline, 4), measured: round(p.measured, 4), delta: round(p.measured - p.baseline) }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const abs = deltas.map((d) => Math.abs(d.delta));
  return {
    ok: true,
    compared: deltas.length,
    maxAbsDelta: round(abs[0]),
    meanAbsDelta: round(abs.reduce((s, v) => s + v, 0) / abs.length),
    worst: deltas.slice(0, 5),
  };
}

const mapEntries = (report) => (report && typeof report.genres === "object" && !Array.isArray(report.genres) ? report.genres : null);

/** Post-trim loudness per genre — the level a listener actually hears. */
function compareLoudness(committed, measured) {
  const a = mapEntries(committed);
  const b = mapEntries(measured);
  if (!a || !b) return { ok: false, reason: "report has no `genres` object map" };
  const pairs = Object.keys(a)
    .map((id) => ({ id, baseline: a[id]?.trimmedLufs, measured: b[id]?.trimmedLufs }))
    .filter((p) => typeof p.baseline === "number" && typeof p.measured === "number");
  if (!pairs.length) return { ok: false, reason: "no numeric `trimmedLufs` on both sides" };
  const summary = deltaSummary(pairs);
  const spread = (r) => round(r?.spread?.after?.p90p10, 4);
  return {
    ...summary,
    unit: "dB (LUFS, post-trim)",
    headline:
      `post-trim loudness · ${summary.compared} genres · max |Δ| ${summary.maxAbsDelta} dB · mean ${summary.meanAbsDelta} dB` +
      ` · spread p90−p10 ${spread(committed)} → ${spread(measured)} dB (gate 1.5)`,
  };
}

/** Level-normalised 13-band shape distance: the same metric the V-10 gate uses. */
function compareTimbre(committed, measured) {
  const a = mapEntries(committed);
  const b = mapEntries(measured);
  if (!a || !b) return { ok: false, reason: "report has no `genres` object map" };
  const shapeDistance = (x, y) => {
    if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length || x.length === 0) return null;
    const mx = x.reduce((s, v) => s + v, 0) / x.length;
    const my = y.reduce((s, v) => s + v, 0) / y.length;
    return Math.sqrt(x.reduce((s, v, i) => s + ((v - mx) - (y[i] - my)) ** 2, 0) / x.length);
  };
  const pairs = [];
  const centroid = [];
  for (const id of Object.keys(a)) {
    const dist = shapeDistance(a[id]?.bandDb, b[id]?.bandDb);
    if (dist !== null) pairs.push({ id, baseline: 0, measured: dist }); // baseline is the reference shape; delta = distance
    if (typeof a[id]?.centroidHz === "number" && typeof b[id]?.centroidHz === "number") {
      centroid.push(Math.abs(b[id].centroidHz - a[id].centroidHz));
    }
  }
  if (!pairs.length) return { ok: false, reason: "no comparable `bandDb` vectors on both sides" };
  // Every delta here is a distance from the reference, so report distances rather than deltas.
  const sorted = pairs.map((p) => ({ id: p.id, distance: round(p.measured, 4) })).sort((x, y) => y.distance - x.distance);
  const distances = sorted.map((d) => d.distance);
  const closest = (r) => r?.distinctness?.closestPair ?? null;
  const fmtPair = (p) => (p ? `${p.a} ↔ ${p.b} at ${round(p.distance, 4)} dB` : "n/a");
  return {
    ok: true,
    compared: sorted.length,
    maxAbsDelta: round(distances[0]),
    meanAbsDelta: round(distances.reduce((s, v) => s + v, 0) / distances.length),
    worst: sorted.slice(0, 5).map((d) => ({ id: d.id, baseline: null, measured: d.distance, delta: d.distance })),
    unit: "dB (band-shape distance from baseline)",
    centroidMaxDeltaHz: round(Math.max(...centroid), 2),
    headline:
      `timbre shape · ${sorted.length} genres · max distance ${round(distances[0], 4)} dB · mean ${round(distances.reduce((s, v) => s + v, 0) / distances.length, 4)} dB` +
      ` · closest pair ${fmtPair(closest(committed))} → ${fmtPair(closest(measured))}` +
      (centroid.length ? ` · centroid max |Δ| ${round(Math.max(...centroid), 2)} Hz` : ""),
  };
}

/** GS-1 load is reported per requested voice count, not per genre. */
function compareGs1Load(committed, measured) {
  const a = committed?.results;
  const b = measured?.results;
  if (!Array.isArray(a) || !Array.isArray(b)) return { ok: false, reason: "report has no `results` array" };
  const rows = [];
  for (const row of a) {
    const other = b.find((r) => r.requestedVoices === row.requestedVoices);
    if (!other) continue;
    rows.push({
      id: `${row.requestedVoices} voices`,
      loadBaseline: round(row.loadP90, 4),
      loadMeasured: round(other.loadP90, 4),
      realtimeBaseline: round(row.realtimeRatio, 3),
      realtimeMeasured: round(other.realtimeRatio, 3),
      voicesBaseline: row.voicesMax,
      voicesMeasured: other.voicesMax,
    });
  }
  if (!rows.length) return { ok: false, reason: "no matching `requestedVoices` rows" };
  const deltas = rows.map((r) => ({ id: r.id, baseline: r.loadBaseline, measured: r.loadMeasured }));
  const summary = deltaSummary(deltas);
  return {
    ...summary,
    unit: "load p90 (0..1 of the audio budget)",
    perVoice: rows,
    headline:
      `GS-1 load p90 by polyphony · ` +
      rows.map((r) => `${r.id.split(" ")[0]}: ${r.loadBaseline} → ${r.loadMeasured}`).join(" · ") +
      ` · realtime ratio at the top row ${rows[rows.length - 1].realtimeBaseline} → ${rows[rows.length - 1].realtimeMeasured}`,
  };
}

/** GS-1 jitter is keyed by scheduling strategy (schedule-ahead / last-moment / …). */
function compareGs1Jitter(committed, measured) {
  const a = committed?.results;
  const b = measured?.results;
  if (!a || !b || typeof a !== "object") return { ok: false, reason: "report has no `results` object" };
  const rows = [];
  for (const key of Object.keys(a)) {
    const ca = a[key]?.summary;
    const cb = b[key]?.summary;
    if (!ca || !cb) continue;
    rows.push({
      id: key,
      medianBaseline: round(ca.medianErrorMs, 2),
      medianMeasured: round(cb.medianErrorMs, 2),
      p90Baseline: round(ca.p90AbsErrorMs, 2),
      p90Measured: round(cb.p90AbsErrorMs, 2),
    });
  }
  if (!rows.length) return { ok: false, reason: "no matching strategy summaries" };
  // The median is a signed lead/lag; the interesting question is whether it moved.
  const deltas = rows.map((r) => ({ id: r.id, baseline: r.medianBaseline, measured: r.medianMeasured }));
  const summary = deltaSummary(deltas);
  return {
    ...summary,
    unit: "ms (median schedule error, negative = scheduled early)",
    perStrategy: rows,
    headline:
      `GS-1 jitter · ` +
      rows.map((r) => `${r.id}: median ${r.medianBaseline} → ${r.medianMeasured} ms, p90|err| ${r.p90Baseline} → ${r.p90Measured} ms`).join(" · "),
  };
}

const BASELINE_ADAPTERS = {
  lufs: compareLoudness,
  timbre: compareTimbre,
  gs1load: compareGs1Load,
  gs1jitter: compareGs1Jitter,
};

function compareBaseline(measuredPath, committedPath, metric) {
  const measured = readJsonSafe(measuredPath);
  const committed = readJsonSafe(committedPath);
  if (!measured || !committed) {
    return { ok: false, reason: "one side missing or unparsable", metric };
  }
  const adapter = BASELINE_ADAPTERS[metric];
  if (!adapter) return { ok: false, reason: `no adapter for metric "${metric}"`, metric };
  try {
    return { metric, ...adapter(committed, measured) };
  } catch (err) {
    return { ok: false, reason: `adapter threw: ${err?.message ?? err}`, metric };
  }
}

/* ---------------------------------------------------------------- packaging */

function walkFiles(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full, base));
    else if (entry.isFile()) out.push(path.relative(base, full));
  }
  return out;
}

function buildManifest(pkgDir, meta) {
  return {
    schema: "groove.slowpack/1",
    createdAt: new Date().toISOString(),
    label: meta.label,
    version: meta.version,
    git: {
      sha: meta.git.sha,
      branch: meta.git.branch,
      dirty: meta.git.dirty,
      available: meta.git.available,
      trackedChanges: meta.git.trackedChanges,
      cwd: meta.git.cwd,
      toplevel: meta.git.toplevel,
      describe: meta.git.describe,
      subject: meta.git.subject,
      statusLines: meta.git.statusLines,
      untracked: meta.git.untracked,
      localSha: meta.git.localSha,
      fromCommitTxt: meta.git.fromCommitTxt,
      attribution: meta.git.fromCommitTxt
        ? "COMMIT.txt (authoritative upstream revision recorded by the exporter)"
        : meta.git.available
          ? "working tree (.git present)"
          : "none — this tree has neither .git nor COMMIT.txt",
    },
    host: meta.host,
    args: meta.args,
    steps: meta.steps,
    measurements: meta.measurements,
    baselineComparison: meta.baselineComparison,
    counts: {
      steps: meta.steps.length,
      pass: meta.steps.filter((s) => s.status === "pass").length,
      fail: meta.steps.filter((s) => s.status === "fail").length,
      timeout: meta.steps.filter((s) => s.status === "timeout").length,
      skipped: meta.steps.filter((s) => s.status === "skipped").length,
    },
    files: [],
  };
}

/**
 * Hash every file in the finished package. Runs last on purpose: SUMMARY.md has to exist
 * before this, or the one document a human reads would be the one file nothing vouches for.
 */
function finalizeManifest(pkgDir, manifest) {
  manifest.files = walkFiles(pkgDir)
    .filter((rel) => rel !== "MANIFEST.json")
    .sort()
    .map((rel) => {
      const buf = fs.readFileSync(path.join(pkgDir, rel));
      return { path: rel, bytes: buf.length, sha256: sha256(buf) };
    });
  return manifest;
}

function writeJson(p, value) {
  fs.writeFileSync(p, `${JSON.stringify(value, null, 2)}\n`);
}

function statusIcon(status) {
  return status === "pass" ? "\u2705" : status === "timeout" ? "\u23f1" : status === "skipped" ? "\u23ed" : "\u274c";
}

function buildSummary(manifest) {
  const partial = Array.isArray(manifest.args?.only) || (manifest.args?.skip ?? []).length > 0;
  const lines = [];
  lines.push(`# Slow-track handoff package · ${manifest.label}`);
  lines.push("");
  if (partial) {
    lines.push(
      `> ⚠️ **PARTIAL RUN** — ${manifest.args.only ? `\`--only ${manifest.args.only.join(",")}\`` : `\`--skip ${manifest.args.skip.join(",")}\``}. ` +
        "This package does not cover the full slow-lane plan and must not be read as a release gate."
    );
    lines.push("");
  }
  lines.push(`- commit: \`${manifest.git.sha}\` (${manifest.git.branch})${manifest.git.dirty ? " **dirty tree — see `git/changes.patch`**" : ""}`);
  if (!manifest.git.available) {
    lines.push(`- ⚠️ attribution: this tree has **no \`.git\`** (exported source package); the commit comes from \`COMMIT.txt\`.`);
  }
  lines.push(`- commit subject: ${manifest.git.subject}`);
  lines.push(`- version: v${manifest.version}`);
  lines.push(`- created: ${manifest.createdAt}`);
  lines.push(`- host: ${manifest.host.hostname} · ${manifest.host.platform}/${manifest.host.arch} · ${manifest.host.cpuModel} ×${manifest.host.cpuCount} · ${manifest.host.totalMemGB} GB`);
  lines.push(`- toolchain: node ${manifest.host.node} · npm ${manifest.host.npm} · playwright ${manifest.host.playwright}`);
  lines.push("");
  lines.push(`## Gates — ${manifest.counts.pass} pass / ${manifest.counts.fail} fail / ${manifest.counts.timeout} timeout / ${manifest.counts.skipped} skipped`);
  lines.push("");
  lines.push("| # | gate | status | time | evidence |");
  lines.push("|---|------|--------|------|----------|");
  manifest.steps.forEach((s, i) => {
    const evidence = (s.highlights.length ? s.highlights.slice(0, 3) : s.tail.slice(-2))
      .map((h) => h.replace(/\|/g, "\\|"))
      .join("<br>");
    lines.push(`| ${i + 1} | ${s.label} | ${statusIcon(s.status)} ${s.status} | ${s.seconds}s | ${evidence || "—"} |`);
  });
  lines.push("");

  if (manifest.measurements.length) {
    lines.push("## Measurements");
    lines.push("");
    lines.push("| measurement | status | time | output |");
    lines.push("|-------------|--------|------|--------|");
    for (const m of manifest.measurements) {
      lines.push(`| ${m.label} | ${statusIcon(m.status)} ${m.status} | ${m.seconds}s | ${m.output ?? "—"} |`);
    }
    lines.push("");
  }

  if (manifest.baselineComparison.length) {
    lines.push("## Fresh measurement vs committed baseline");
    lines.push("");
    lines.push("The same measurement run on a second machine. A drift is not automatically a bug");
    lines.push("(different CPU/browser moves numbers), but it must be *seen* — and a baseline that");
    lines.push("reproduces elsewhere is evidence that it describes the code, not one machine.");
    lines.push("");
    for (const c of manifest.baselineComparison) {
      if (!c.ok) {
        lines.push(`- **${c.metric}**: NOT COMPARABLE — ${c.reason}`);
        continue;
      }
      lines.push(`- ${c.headline ?? `**${c.metric}**: ${c.compared} compared`}`);
      for (const w of c.worst ?? []) {
        lines.push(`  - \`${w.id}\`: ${w.baseline} → ${w.measured} (Δ ${w.delta})`);
      }
    }
    lines.push("");
  }

  lines.push("## Per-gate logs");
  lines.push("");
  for (const s of manifest.steps) {
    lines.push(`### ${statusIcon(s.status)} ${s.label} — ${s.status} (${s.seconds}s)`);
    lines.push("");
    lines.push(`\`${s.command}\` · log: \`${s.log}\` · exit ${s.exitCode}${s.signal ? ` signal ${s.signal}` : ""}`);
    lines.push("");
    const highlights = s.highlights.length ? s.highlights : s.tail;
    if (highlights.length) {
      lines.push("```");
      highlights.forEach((h) => lines.push(h));
      lines.push("```");
      lines.push("");
    }
  }

  lines.push("## What this package does and does not prove");
  lines.push("");
  lines.push("- Every gate listed above ran on the machine described in `MANIFEST.json`, on the exact commit (and patch) recorded in `git/`.");
  lines.push("- A green gate means the *automated* check passed there. It is not a listening test and not a correctness proof.");
  lines.push("- Anything recorded as `skipped` was not run; the reason is in the `args` block of `MANIFEST.json`.");
  lines.push("- Timings are only comparable within the same machine; a faster host is exactly why this file exists.");
  lines.push("");
  return lines.join("\n");
}

function tarPackage(pkgDir, tarPath) {
  // Deterministic-ish archive: sorted entries, no mtime noise beyond the files themselves.
  execFileSync("tar", ["-czf", tarPath, "-C", path.dirname(pkgDir), path.basename(pkgDir)], { stdio: "inherit" });
  const buf = fs.readFileSync(tarPath);
  const digest = sha256(buf);
  fs.writeFileSync(`${tarPath}.sha256`, `${digest}  ${path.basename(tarPath)}\n`);
  return { digest, bytes: buf.length };
}

/* ------------------------------------------------------------------- modes */

function commandRun() {
  const label = argValue("label", null);
  const outRoot = path.resolve(ROOT, argValue("out", "slowpack-out"));
  const quiet = hasFlag("quiet");
  const withMeasure = hasFlag("measure");
  const timeoutScale = Number(argValue("timeout-scale", "1")) || 1;
  const only = argValue("only") ? new Set(argValue("only").split(",").map((s) => s.trim())) : null;
  const skip = new Set((argValue("skip") ?? "").split(",").map((s) => s.trim()).filter(Boolean));

  return (async () => {
    const git = gitState();
    const host = hostInfo();
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    const pkgLabel = label ?? `v${pkg.version}_${git.sha.slice(0, 7)}_${nowStamp()}`;
    const pkgDir = path.join(outRoot, `slowpack-${pkgLabel}`);
    fs.rmSync(pkgDir, { recursive: true, force: true });
    fs.mkdirSync(path.join(pkgDir, "logs"), { recursive: true });
    fs.mkdirSync(path.join(pkgDir, "git"), { recursive: true });
    fs.mkdirSync(path.join(pkgDir, "artifacts"), { recursive: true });

    console.log("===============================================================");
    console.log(`  \u{1F4E6} SLOW PACK \u2014 ${pkgLabel}`);
    console.log("===============================================================");
    console.log(`  commit   : ${git.sha || "(unknown)"}${git.dirty ? "  (dirty tree!)" : ""}${git.available ? "" : "  [no .git: exported tree, via COMMIT.txt]"}`);
    if (!git.sha) {
      console.log("  \u26a0\ufe0f  no commit available (no .git and no COMMIT.txt): these results cannot be attributed to a commit.");
    }
    console.log(`  host     : ${host.hostname} \u00b7 ${host.cpuModel} \u00d7${host.cpuCount} \u00b7 ${host.totalMemGB} GB`);
    console.log(`  node/npm : ${host.node} / ${host.npm}  \u00b7 playwright ${host.playwright}`);
    console.log(`  browsers : ${host.playwrightBrowsers}`);
    console.log(`  output   : ${pkgDir}`);

    // Refuse to spend minutes of gates in a tree whose results would not mean what they claim.
    const preflight = preflightProblems();
    if (preflight.length > 0) {
      console.error("\n\u274c PREFLIGHT FAILED \u2014 this tree cannot produce trustworthy gate results:\n");
      for (const problem of preflight) console.error(`   \u2022 ${problem}\n`);
      if (!hasFlag("continue-anyway")) {
        console.error("   Re-run with --continue-anyway to run the gates regardless.");
        return 4;
      }
      console.error("   --continue-anyway given: running the gates anyway.\n");
    }
    for (const warning of preflightWarnings()) console.log(`  \u26a0\ufe0f  ${warning}`);

    // Git-based gates (redlines) need a repository; an exported package has none.
    const gateGit = createGateGit(git);
    if (gateGit?.error) {
      console.log(`  \u26a0\ufe0f  could not prepare a git repository for the git-based gates: ${gateGit.error}`);
    } else if (gateGit?.dir) {
      console.log("  git      : no repository in this tree \u2014 using a throwaway one for the git-based gates (redlines)");
    }

    // Exact tree state travels with the results; without it the numbers are unattributable.
    fs.writeFileSync(path.join(pkgDir, "git", "status.txt"), git.statusLines.join("\n") + (git.statusLines.length ? "\n" : ""));
    fs.writeFileSync(path.join(pkgDir, "git", "changes.patch"), git.diff);
    fs.writeFileSync(path.join(pkgDir, "git", "log.txt"), capture("git", ["log", "--oneline", "-15"]) + "\n");
    fs.copyFileSync(path.join(ROOT, "package.json"), path.join(pkgDir, "package.json"));
    if (fs.existsSync(path.join(ROOT, "public", "version.json"))) {
      fs.copyFileSync(path.join(ROOT, "public", "version.json"), path.join(pkgDir, "version.json"));
    }
    const streamFile = path.join(pkgDir, "logs", "00-full-stream.log");
    fs.writeFileSync(streamFile, "");

    const ctx = {
      quiet,
      logDir: path.join(pkgDir, "logs"),
      order: 1,
      git,
      timeoutScale,
      streamFile,
      // `GIT_DIR`/`GIT_WORK_TREE` for the throwaway repository, when the tree has none of its own.
      gateEnv: gateGit?.env ?? null,
    };

    if (hasFlag("install")) {
      await runStep({ slug: "install", label: "npm ci (fresh dependencies)", cmd: "npm", args: ["ci"], timeoutMin: 30 }, ctx);
      ctx.order += 1;
    }

    const steps = [];
    const gatePlan = hasFlag("selftest")
      ? [
          {
            slug: "selftest-pass",
            label: "Self-test: a gate that passes",
            cmd: "node",
            args: ["-e", "console.log('\u2705 selftest: pass line'); console.log('p90-p10 0.319 dB, worst true peak -1.094 dBTP');"],
            timeoutMin: 2,
          },
          {
            slug: "selftest-fail",
            label: "Self-test: a gate that fails (intentional)",
            cmd: "node",
            args: ["-e", "console.log('\u274c selftest: intentional failure'); console.log('Tests 3 failed | 119 passed'); process.exit(7);"],
            timeoutMin: 2,
          },
        ]
      : SLOW_GATES;
    for (const gate of gatePlan) {
      if (only && !only.has(gate.slug)) continue;
      if (skip.has(gate.slug)) {
        steps.push({ slug: gate.slug, label: gate.label, lane: gate.extra ? "verify-extra" : "slow", command: `${gate.cmd} ${gate.args.join(" ")}`, status: "skipped", exitCode: null, signal: null, timedOut: false, seconds: 0, startedAt: new Date().toISOString(), log: null, bytes: 0, highlights: [], tail: [] });
        console.log(`\u23ed  ${gate.label} (skipped by --skip)`);
        continue;
      }
      steps.push(await runStep(gate, ctx));
      ctx.order += 1;
    }

    const measurements = [];
    const baselineComparison = [];
    if (withMeasure) {
      for (const m of MEASUREMENTS) {
        if (skip.has(m.slug)) continue;
        const outPath = path.join(pkgDir, "artifacts", m.outFile);
        const step = { ...m, args: [...m.args, "--out", outPath] };
        const result = await runStep(step, ctx);
        result.output = fs.existsSync(outPath) ? `artifacts/${m.outFile}` : null;
        measurements.push(result);
        ctx.order += 1;
        if (result.status === "pass" && result.output) {
          baselineComparison.push(compareBaseline(outPath, path.join(ROOT, m.compareTo), m.metric));
        }
      }
    }

    // The E2E matrix persists its own `matrix.json` + `summary.md`; carry the newest run into the
    // package so the result is machine-readable without parsing a log.
    const e2eOut = path.join(ROOT, "e2e-out");
    if (fs.existsSync(e2eOut)) {
      const runs = fs
        .readdirSync(e2eOut, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => ({ name: e.name, at: fs.statSync(path.join(e2eOut, e.name)).mtimeMs }))
        .sort((a, b) => b.at - a.at);
      if (runs[0]) {
        for (const file of ["matrix.json", "summary.md"]) {
          const from = path.join(e2eOut, runs[0].name, file);
          if (fs.existsSync(from)) fs.copyFileSync(from, path.join(pkgDir, "artifacts", `e2e-${file}`));
        }
      }
    }

    // Coverage: keep the machine-readable summary, not the 31 MB HTML report.
    const covSummary = ["coverage-summary.json", "coverage/coverage-summary.json", "coverage/coverage-final.json"]
      .map((rel) => path.join(ROOT, rel))
      .find((p) => fs.existsSync(p));
    if (covSummary) {
      const size = fs.statSync(covSummary).size;
      if (size < 5_000_000) fs.copyFileSync(covSummary, path.join(pkgDir, "artifacts", path.basename(covSummary)));
    }
    if (fs.existsSync(path.join(ROOT, "dist"))) {
      const distFiles = walkFiles(path.join(ROOT, "dist"));
      const distBytes = distFiles.reduce((s, f) => s + fs.statSync(path.join(ROOT, "dist", f)).size, 0);
      writeJson(path.join(pkgDir, "artifacts", "dist-inventory.json"), {
        files: distFiles.length,
        bytes: distBytes,
        note: "Build output itself is not packaged; run `npm run build` to reproduce it.",
      });
    }

    // SUMMARY.md must exist before the manifest is built, or it would be the one file in the
    // package that no hash vouches for (the smoke run caught exactly that).
    const manifest = buildManifest(pkgDir, {
      label: pkgLabel,
      version: pkg.version,
      git,
      host,
      args: {
        mode: "run",
        withMeasure,
        only: only ? [...only] : null,
        skip: [...skip],
        selftest: hasFlag("selftest"),
        timeoutScale,
        command: `node ${SELF} run ${argv.slice(1).join(" ")}`.trim(),
      },
      steps,
      measurements,
      baselineComparison,
    });
    fs.writeFileSync(path.join(pkgDir, "SUMMARY.md"), buildSummary(manifest));
    writeJson(path.join(pkgDir, "MANIFEST.json"), finalizeManifest(pkgDir, manifest));

    const counts = manifest.counts;
    let tarInfo = null;
    if (!hasFlag("no-tarball")) {
      const tarPath = path.join(outRoot, `slowpack-${pkgLabel}.tar.gz`);
      tarInfo = tarPackage(pkgDir, tarPath);
      console.log(`\n\u{1F4E6} package : ${tarPath}`);
      console.log(`   sha256  : ${tarInfo.digest}`);
      console.log(`   size    : ${(tarInfo.bytes / 1024 / 1024).toFixed(1)} MB`);
    } else {
      console.log(`\n\u{1F4E6} package directory : ${pkgDir}`);
    }

    console.log("\n===============================================================");
    console.log(`  RESULT: ${counts.pass} pass / ${counts.fail} fail / ${counts.timeout} timeout / ${counts.skipped} skipped`);
    console.log("===============================================================");
    for (const s of [...steps, ...measurements]) {
      console.log(`  ${statusIcon(s.status)} ${s.slug.padEnd(18)} ${String(s.seconds).padStart(7)}s  ${s.label}`);
    }
    console.log(`\n  summary : ${path.join(pkgDir, "SUMMARY.md")}`);
    if (tarInfo) console.log(`  send back: slowpack-${pkgLabel}.tar.gz  (sha256 ${tarInfo.digest.slice(0, 16)}…)`);
    else console.log(`  send back: ${pkgDir}`);

    if (gateGit?.dir) fs.rmSync(gateGit.dir, { recursive: true, force: true });

    const observedSeconds = [...steps, ...measurements].reduce((sum, x) => sum + (x.seconds ?? 0), 0);
    const observedMinutes = +(observedSeconds / 60).toFixed(1);
    console.log(`\n  observed: ${observedMinutes} min of gate time (wall clock is longer on a busy machine)`);
    if (observedMinutes > HANDOFF_THRESHOLD_MINUTES) {
      console.log(
        `  \u2139\ufe0f  over ${HANDOFF_THRESHOLD_MINUTES} min: run this on the faster machine next time and send the package back —` +
          "\n      `node scripts/slow_pack.mjs export` here, then `node scripts/slow_pack.mjs run` there."
      );
    }

    const failed = counts.fail + counts.timeout;
    return failed === 0 ? 0 : 3;
  })();
}

/* ---------------------------------------------------------------- export mode */

function commandExport() {
  const outRoot = path.resolve(ROOT, argValue("out", "slowpack-out"));
  const git = gitState();
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const label = argValue("label", `src-v${pkg.version}_${git.sha.slice(0, 7)}`);
  fs.mkdirSync(outRoot, { recursive: true });
  const stage = path.join(outRoot, `slowpack-${label}`);
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });

  const inner = path.join(stage, "src.tar.gz");
  execFileSync("git", ["archive", "--format=tar.gz", "-o", inner, "HEAD"], { cwd: ROOT, stdio: "inherit" });
  execFileSync("tar", ["-xzf", inner, "-C", stage], { stdio: "inherit" });
  fs.rmSync(inner);

  fs.writeFileSync(path.join(stage, "changes.patch"), git.diff);
  fs.writeFileSync(path.join(stage, "COMMIT.txt"), `${git.sha}\n${git.branch}\n${git.describe}\n${git.subject}\n`);
  fs.writeFileSync(
    path.join(stage, "HANDOFF.md"),
    [
      `# Groove Lab slow-pack source · ${label}`,
      "",
      `Exact tree: commit \`${git.sha}\` on \`${git.branch}\`${git.dirty ? ", **plus `changes.patch`** (the tree was dirty)" : ""}.`,
      "",
      "## On the fast machine",
      "",
      "> **Unpack it OUTSIDE any git checkout.** Unpacking inside an existing clone nests the",
      "> package in that worktree, and Vitest/Vite then resolve the test setup against the outer",
      "> repo — which is exactly how a v2.0.18 run reported `120 test files failed to collect`",
      "> (`Failed to load url …/src/test/setup.ts`) with two gates red for no code reason.",
      "",
      "```bash",
      `tar xzf slowpack-${label}.tar.gz`,
      `cd slowpack-${label}`,
      git.dirty ? "git apply --whitespace=nowarn changes.patch   # reproduce the exact tree" : "# tree is exactly the committed state",
      "npm ci",
      "npx playwright install chromium firefox webkit   # the E2E matrix + perf gate need real browsers",
      "",
      "# quick sanity: the packer itself",
      "node scripts/slow_pack.mjs list",
      "",
      "# full regression, all gates, packaged (30-60 min depending on the machine):",
      "node scripts/slow_pack.mjs run --label " + label,
      "",
      "# plus the hours-long baseline measurements (loudness/timbre/GS-1), if asked for:",
      "node scripts/slow_pack.mjs run --label " + label + "-measured --measure",
      "```",
      "",
      "The run prints the tarball path and its SHA-256. Send back `slowpack-*.tar.gz` (and the `.sha256`);",
      "it contains every gate log, the fresh measurement artifacts, the exact git state, and a SUMMARY.md.",
      "",
      "Nothing in the repo is modified by the run: measurements are written with `--out` into the package,",
      "so the committed baselines under `scripts/*.baseline.json` are never overwritten.",
      "",
    ].join("\n")
  );

  const tarPath = path.join(outRoot, `slowpack-${label}.tar.gz`);
  execFileSync("tar", ["-czf", tarPath, "-C", outRoot, path.basename(stage)], { stdio: "inherit" });
  const buf = fs.readFileSync(tarPath);
  const digest = sha256(buf);
  fs.writeFileSync(`${tarPath}.sha256`, `${digest}  ${path.basename(tarPath)}\n`);
  fs.rmSync(stage, { recursive: true, force: true });

  console.log("\u{1F4E6} source package ready for the fast machine");
  console.log(`   file   : ${tarPath}`);
  console.log(`   sha256 : ${digest}`);
  console.log(`   size   : ${(buf.length / 1024 / 1024).toFixed(1)} MB`);
  console.log(`   commit : ${git.sha}${git.dirty ? "  (+ changes.patch)" : ""}`);
  return 0;
}

/* ---------------------------------------------------------------- verify mode */

function extractIfNeeded(input) {
  if (fs.statSync(input).isDirectory()) return input;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slowpack-verify-"));
  execFileSync("tar", ["-xzf", input, "-C", tmp], { stdio: "inherit" });
  const entries = fs.readdirSync(tmp, { withFileTypes: true }).filter((e) => e.isDirectory());
  if (entries.length === 1) return path.join(tmp, entries[0].name);
  return tmp;
}

function commandVerify() {
  const input = argv[1] && !argv[1].startsWith("--") ? path.resolve(ROOT, argv[1]) : null;
  if (!input || !fs.existsSync(input)) {
    console.error("usage: node scripts/slow_pack.mjs verify <package-dir|package.tar.gz>");
    return 4;
  }
  const pkgDir = extractIfNeeded(input);
  const manifestPath = path.join(pkgDir, "MANIFEST.json");
  if (!fs.existsSync(manifestPath)) {
    console.error(`\u274c no MANIFEST.json in ${pkgDir} — not a slow-pack`);
    return 4;
  }
  // If the tarball travelled with its .sha256, check the container before trusting anything inside.
  let tarballDigest = null;
  const sibling = `${input}.sha256`;
  if (!fs.statSync(input).isDirectory() && fs.existsSync(sibling)) {
    const expected = fs.readFileSync(sibling, "utf8").trim().split(/\s+/)[0];
    const actual = sha256(fs.readFileSync(input));
    tarballDigest = { expected, actual, ok: expected === actual };
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const problems = [];

  console.log("===============================================================");
  console.log(`  \u{1F50E} SLOW PACK VERIFY \u2014 ${manifest.label}`);
  console.log("===============================================================");
  if (manifest.schema !== "groove.slowpack/1") problems.push(`unexpected schema: ${manifest.schema}`);
  if (tarballDigest) {
    if (tarballDigest.ok) console.log(`  tarball   : sha256 matches ${path.basename(sibling)}`);
    else problems.push(`tarball sha256 mismatch: ${tarballDigest.actual} != ${tarballDigest.expected}`);
  }

  // 1) Integrity: every listed file must be present with the recorded bytes and hash.
  let checked = 0;
  for (const entry of manifest.files ?? []) {
    const full = path.join(pkgDir, entry.path);
    if (!fs.existsSync(full)) {
      problems.push(`missing file: ${entry.path}`);
      continue;
    }
    const buf = fs.readFileSync(full);
    if (buf.length !== entry.bytes) problems.push(`size mismatch: ${entry.path} (${buf.length} != ${entry.bytes})`);
    if (sha256(buf) !== entry.sha256) problems.push(`sha256 mismatch: ${entry.path}`);
    checked += 1;
  }
  // Files that appeared after packaging are worth knowing about, but not fatal.
  const onDisk = walkFiles(pkgDir).filter((rel) => rel !== "MANIFEST.json").sort();
  const listed = new Set((manifest.files ?? []).map((f) => f.path));
  // macOS re-tarring (`tar czf` on a Mac, or a Finder copy) adds AppleDouble `._name` resource
  // forks for every entry. They are metadata, not package contents, and reporting them as
  // mysterious extras hides the real question of whether anything important travelled unhashed.
  const macMetadata = onDisk.filter((rel) => rel.split("/").some((part) => part.startsWith("._")));
  const unlisted = onDisk.filter((rel) => !listed.has(rel) && !macMetadata.includes(rel));

  // 2) Completeness: the plan must be fully accounted for (pass / fail / timeout / skipped).
  // A run narrowed with `--only` is *documented* as partial in `args`, so compare against
  // what it promised to run instead of the full plan — an honest subset is not a defect.
  const requestedOnly = Array.isArray(manifest.args?.only) ? manifest.args.only : null;
  const selfTest = manifest.args?.selftest === true;
  // What did this run promise to cover? A subset run promises its subset; the self-test
  // promises nothing about the real plan; a normal run promises the whole slow lane.
  const expected = requestedOnly ?? (selfTest ? (manifest.steps ?? []).map((s) => s.slug) : SLOW_GATES.map((g) => g.slug));
  const seen = new Set((manifest.steps ?? []).map((s) => s.slug));
  const absent = expected.filter((slug) => !seen.has(slug));
  const noLog = (manifest.steps ?? []).filter((s) => s.status !== "skipped" && (!s.log || !fs.existsSync(path.join(pkgDir, s.log))));
  const partial = requestedOnly !== null || (manifest.args?.skip ?? []).length > 0 || selfTest;

  // 3) Attribution: does the recorded commit exist here, and does the patch still apply?
  const sha = manifest.git?.sha;
  const shaKnown = sha ? capture("git", ["cat-file", "-t", sha]) === "commit" : false;
  let patchState = null;
  const patchPath = path.join(pkgDir, "git", "changes.patch");
  const hasPatch = fs.existsSync(patchPath) && fs.statSync(patchPath).size > 0;
  if (hasPatch && shaKnown) {
    // A forward-applying patch means this tree is at the base commit; a *reverse*-applying
    // patch means the tree already contains the change (the normal local case, because the
    // package was made from this very tree). Neither is a problem — only "neither" is.
    const applies = (extra) => {
      try {
        execFileSync("git", ["apply", "--check", ...extra, patchPath], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
        return true;
      } catch {
        return false;
      }
    };
    if (applies([])) patchState = "forward (tree is at the base commit)";
    else if (applies(["--reverse"])) patchState = "already applied (tree matches the package)";
    else patchState = "neither direction applies";
  }

  const counts = manifest.counts ?? {};
  const statusTracked = (manifest.git?.statusLines ?? []).filter((l) => l && !l.startsWith("??") && !l.startsWith("!!"));
  const trackedForDisplay = manifest.git?.trackedChanges ?? statusTracked;
  console.log(
    `  commit    : ${sha || "(none)"}${trackedForDisplay.length ? " (tracked files modified: patch included)" : " (tracked tree clean)"} ${shaKnown ? "\u2714 known here" : "\u26a0 not a commit in this repo"}`
  );
  if (!manifest.git?.available) console.log(`  attribution: ${manifest.git?.attribution ?? "unknown"}`);
  if (patchState) console.log(`  tree      : ${patchState}`);
  console.log(`  host      : ${manifest.host?.hostname} \u00b7 ${manifest.host?.cpuModel} \u00d7${manifest.host?.cpuCount} \u00b7 node ${manifest.host?.node}`);
  console.log(`  created   : ${manifest.createdAt}`);
  console.log(`  scope     : ${partial ? `\u26a0 PARTIAL (${requestedOnly ? `--only ${requestedOnly.join(",")}` : `--skip ${(manifest.args?.skip ?? []).join(",")}`})` : "full slow-lane plan"}`);
  console.log(`  gates     : ${counts.pass} pass / ${counts.fail} fail / ${counts.timeout} timeout / ${counts.skipped} skipped`);
  console.log(`  files     : ${checked} hash-checked${unlisted.length ? `, ${unlisted.length} unlisted (extra)` : ""}`);
  if (unlisted.length) {
    // Name them: "28 extra" tells you nothing, "artifacts/x.json, logs/y.log" tells you whether
    // anything important travelled outside the manifest.
    console.log(`  extra     : ${unlisted.slice(0, 6).join(", ")}${unlisted.length > 6 ? ` … (+${unlisted.length - 6} more)` : ""}`);
  }
  if (macMetadata.length) {
    console.log(`  macOS     : ${macMetadata.length} AppleDouble \`._*\` resource forks ignored (re-tarred on a Mac)`);
  }
  console.log("");
  for (const s of manifest.steps ?? []) {
    console.log(`  ${statusIcon(s.status)} ${String(s.slug).padEnd(18)} ${String(s.seconds).padStart(7)}s  ${s.label}`);
  }
  for (const m of manifest.measurements ?? []) {
    console.log(`  ${statusIcon(m.status)} ${String(m.slug).padEnd(18)} ${String(m.seconds).padStart(7)}s  ${m.label}`);
  }
  for (const c of manifest.baselineComparison ?? []) {
    if (!c.ok) {
      console.log(`  \u26a0\ufe0f  ${c.metric}: NOT COMPARABLE — ${c.reason}`);
      continue;
    }
    console.log(`  \u{1F4CA} ${c.headline ?? `${c.metric}: ${c.compared} compared, max |\u0394| ${c.maxAbsDelta}`}`);
  }

  console.log("\n  --- failing gate evidence ---");
  const red = (manifest.steps ?? []).filter((s) => s.status === "fail" || s.status === "timeout");
  if (red.length === 0) console.log("  (none)");
  for (const s of red) {
    console.log(`\n  \u274c ${s.label} (exit ${s.exitCode}${s.timedOut ? ", timed out" : ""})`);
    for (const h of (s.highlights.length ? s.highlights : s.tail).slice(0, 10)) console.log(`     ${h}`);
    const logText = s.log && fs.existsSync(path.join(pkgDir, s.log)) ? fs.readFileSync(path.join(pkgDir, s.log), "utf8") : "";
    if (/Failed to load url|no tests\b|failed to collect/i.test(logText)) {
      console.log(
        "     \u2139\ufe0f  This gate never collected: the runner could not load its own setup file. That is an"
      );
      console.log(
        "        environment/config problem in the tree it ran in, not a failing assertion — re-run from a"
      );
      console.log("        clean checkout (see the preflight notes at the top of this script).");
    }
  }

  // Re-run the cross-machine comparison against THIS repo's committed baselines. The manifest
  // carries the packer's own comparison, but that was produced by whatever version of this
  // script travelled inside the package; recomputing here means a package made by an older
  // packer still gets read correctly, and a broken adapter shows up as NOT COMPARABLE instead
  // of as four silent non-answers (which is exactly what the first v2.0.17 package returned).
  const artifactsDir = path.join(pkgDir, "artifacts");
  const recomputed = [];
  if (fs.existsSync(artifactsDir)) {
    for (const m of MEASUREMENTS) {
      const measuredPath = path.join(artifactsDir, m.outFile);
      if (!fs.existsSync(measuredPath)) continue;
      recomputed.push({ slug: m.slug, ...compareBaseline(measuredPath, path.join(ROOT, m.compareTo), m.metric) });
    }
  }
  if (recomputed.length) {
    console.log("\n  --- fresh measurement vs committed baseline (recomputed against this repo) ---");
    for (const r of recomputed) {
      console.log(r.ok ? `  \u{1F4CA} ${r.headline}` : `  \u26a0\ufe0f  ${r.slug}: NOT COMPARABLE \u2014 ${r.reason}`);
    }
    const stored = manifest.baselineComparison ?? [];
    const storedFailed = stored.filter((s) => !s.ok);
    const fixedHere = recomputed.filter((r) => r.ok && storedFailed.some((s) => s.metric === r.metric));
    if (fixedHere.length) {
      console.log(
        `  \u2139\ufe0f  ${fixedHere.length} comparison(s) failed inside the package (${storedFailed
          .map((s) => `${s.metric}: ${s.reason}`)
          .join("; ")}) but succeed here \u2014 that package was made by an older packer.`
      );
    }
  }

  if (absent.length) problems.push(`gates missing from the package: ${absent.join(", ")}`);
  for (const s of noLog) problems.push(`log missing for ${s.slug}: ${s.log}`);
  // Attribution is decided by *evidence*, not by the recorded `dirty` flag: a package written by
  // an older packer can say `dirty: true` purely because an untracked directory existed (that is
  // exactly what happened to the v2.0.18 package). Only tracked modifications need a patch.
  const trackedChanges =
    manifest.git?.trackedChanges ??
    (manifest.git?.statusLines ?? []).filter((line) => line && !line.startsWith("??") && !line.startsWith("!!"));
  if (trackedChanges.length > 0 && (!fs.existsSync(patchPath) || fs.statSync(patchPath).size === 0)) {
    problems.push(
      `tracked files differ from the recorded commit (${trackedChanges.slice(0, 4).join(", ")}) but git/changes.patch is empty — results are unattributable`
    );
  }
  // A package can be perfectly attributable and still have run somewhere the gates could not see
  // the right config. Say so, because that failure is silent in the gate table.
  const ranIn = manifest.git?.cwd;
  const ownedBy = manifest.git?.toplevel;
  if (ranIn && ownedBy && path.resolve(ownedBy) !== path.resolve(ranIn)) {
    console.log(`\n  \u26a0\ufe0f  the packer ran in ${ranIn}, which is nested inside the git worktree ${ownedBy}.`);
    console.log("      Vite/Vitest resolve the test setup against the worktree, so a suite failure in");
    console.log("      this package may be an environment artefact rather than a code failure.");
  }
  if (patchState === "neither direction applies") {
    problems.push("git/changes.patch applies in neither direction — cannot attribute these results to a tree");
  }
  if (partial) {
    console.log("\n  \u26a0 PARTIAL package: it does not cover the full slow-lane plan. Do not read it as a release gate.");
  }

  console.log("\n===============================================================");
  if (problems.length === 0) {
    console.log("  \u2705 INTEGRITY OK \u2014 package is complete and every file matches its hash");
    console.log(`     gate verdicts: ${counts.pass} pass / ${counts.fail} fail / ${counts.timeout} timeout / ${counts.skipped} skipped`);
    console.log("===============================================================");
    return 0;
  }
  console.log(`  \u274c ${problems.length} INTEGRITY PROBLEM(S)`);
  for (const p of problems) console.log(`     - ${p}`);
  console.log("===============================================================");
  return 1;
}

/* -------------------------------------------------------------------- list */

function commandList() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const state = gitState();
  console.log(`Groove Lab slow pack · v${pkg.version} · ${state.sha ? state.sha.slice(0, 7) : "no .git (exported tree)"}`);
  console.log(`\nGates (${SLOW_GATES.length}), in this order:`);
  for (const g of SLOW_GATES) {
    console.log(`  ${g.slug.padEnd(18)} ${String(g.timeoutMin).padStart(4)} min  ${g.label}${g.extra ? "  [extra: not in the slow lane]" : ""}`);
  }
  console.log(`\nMeasurements (${MEASUREMENTS.length}), only with --measure:`);
  for (const m of MEASUREMENTS) {
    console.log(`  ${m.slug.padEnd(18)} ${String(m.timeoutMin).padStart(4)} min  ${m.label}  -> artifacts/${m.outFile}`);
  }
  const worst = SLOW_GATES.reduce((s, g) => s + g.timeoutMin, 0);
  console.log(`\nWorst-case timeout budget (not a runtime estimate): ${worst} min for the gates`);
  if (MEASUREMENTS.length) console.log(`plus ${MEASUREMENTS.reduce((s, m) => s + m.timeoutMin, 0)} min for the measurements.`);
  console.log("\nRun `node scripts/slow_pack.mjs run --measure --label <name>` on the fast machine.");
  return 0;
}

function commandHelp() {
  console.log(`slow_pack — run the long gates, package the evidence, verify it on the way back.

  node ${SELF} list                     print the plan (no side effects)
  node ${SELF} export [--out <dir>]     package this exact tree for a faster machine
  node ${SELF} run [flags]              run every gate and package the results
  node ${SELF} verify <dir|tar.gz>      verify a returned package (hashes + completeness)

run flags: --label --out --measure --install --only --skip --no-tarball --quiet --timeout-scale`);
  return 0;
}

/* -------------------------------------------------------------------- main */

const dispatch = {
  run: commandRun,
  export: commandExport,
  verify: commandVerify,
  list: commandList,
  help: commandHelp,
};

try {
  const result = dispatch[mode]();
  const code = result && typeof result.then === "function" ? await result : result;
  process.exit(typeof code === "number" ? code : 0);
} catch (err) {
  console.error(`\u274c slow_pack failed: ${err?.stack ?? err}`);
  process.exit(4);
}
