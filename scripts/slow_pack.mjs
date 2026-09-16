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
  const sha = capture("git", ["rev-parse", "HEAD"]);
  const branch = capture("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  const status = capture("git", ["status", "--porcelain"]);
  const diff = captureRaw("git", ["diff", "HEAD"]);
  return {
    sha,
    branch,
    dirty: status.length > 0,
    statusLines: status ? status.split("\n") : [],
    diff,
    describe: capture("git", ["describe", "--tags", "--always", "--dirty"]),
    subject: capture("git", ["log", "-1", "--pretty=%s"]),
    untracked: capture("git", ["ls-files", "--others", "--exclude-standard"]).split("\n").filter(Boolean),
  };
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
  const env = { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1", ...(step.env ?? {}) };

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
 * committed still describe reality, or did it encode one machine's quirk? A large drift is
 * not automatically a bug (different browser, different CPU), but it must be *seen*.
 */
function compareBaseline(measuredPath, committedPath, metric) {
  const measured = readJsonSafe(measuredPath);
  const committed = readJsonSafe(committedPath);
  if (!measured || !committed) {
    return { ok: false, reason: "one side missing or unparsable", metric };
  }
  const pick = (report) => {
    const out = new Map();
    const list = Array.isArray(report) ? report : report.genres ?? report.results ?? report.entries ?? [];
    if (Array.isArray(list)) {
      for (const entry of list) {
        const id = entry.genre_id ?? entry.genreId ?? entry.id;
        if (id) out.set(id, entry);
      }
    }
    return out;
  };
  const a = pick(committed);
  const b = pick(measured);
  const common = [...a.keys()].filter((k) => b.has(k));
  if (common.length === 0) {
    return { ok: false, reason: "no matching genre ids between baseline and measurement", metric };
  }
  const valueOf = (entry) => {
    if (metric === "lufs") return entry.lufs ?? entry.integratedLufs ?? entry.loudnessLufs ?? null;
    if (metric === "timbre") {
      const fp = entry.fingerprint ?? entry.bands ?? entry.timbre;
      if (Array.isArray(fp)) return fp.reduce((s, v) => s + (Number(v) || 0), 0);
      return null;
    }
    if (metric === "gs1load") return entry.loadP90 ?? entry.p90Load ?? entry.load ?? null;
    if (metric === "gs1jitter") return entry.spreadMs ?? entry.jitterMs ?? entry.medianAbsMs ?? null;
    return null;
  };
  const deltas = [];
  for (const id of common) {
    const va = valueOf(a.get(id));
    const vb = valueOf(b.get(id));
    if (typeof va !== "number" || typeof vb !== "number") continue;
    deltas.push({ id, baseline: va, measured: vb, delta: +(vb - va).toFixed(3) });
  }
  if (deltas.length === 0) {
    return { ok: false, reason: "no comparable numeric field found", metric };
  }
  deltas.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  const abs = deltas.map((d) => Math.abs(d.delta));
  const mean = abs.reduce((s, v) => s + v, 0) / abs.length;
  return {
    ok: true,
    metric,
    compared: deltas.length,
    missingInMeasurement: [...a.keys()].filter((k) => !b.has(k)).length,
    maxAbsDelta: abs[0],
    meanAbsDelta: +mean.toFixed(3),
    worst: deltas.slice(0, 5),
  };
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
      describe: meta.git.describe,
      subject: meta.git.subject,
      statusLines: meta.git.statusLines,
      untracked: meta.git.untracked,
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
    for (const c of manifest.baselineComparison) {
      if (!c.ok) {
        lines.push(`- **${c.metric}**: not comparable — ${c.reason}`);
        continue;
      }
      lines.push(
        `- **${c.metric}**: ${c.compared} genres compared · max |Δ| **${c.maxAbsDelta}** · mean |Δ| ${c.meanAbsDelta}`
      );
      for (const w of c.worst) {
        lines.push(`  - \`${w.id}\`: baseline ${w.baseline} → measured ${w.measured} (Δ ${w.delta})`);
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
    console.log(`  commit   : ${git.sha}${git.dirty ? "  (dirty tree!)" : ""}`);
    console.log(`  host     : ${host.hostname} \u00b7 ${host.cpuModel} \u00d7${host.cpuCount} \u00b7 ${host.totalMemGB} GB`);
    console.log(`  node/npm : ${host.node} / ${host.npm}  \u00b7 playwright ${host.playwright}`);
    console.log(`  browsers : ${host.playwrightBrowsers}`);
    console.log(`  output   : ${pkgDir}`);

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

    const ctx = { quiet, logDir: path.join(pkgDir, "logs"), order: 1, git, timeoutScale, streamFile };

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
  const unlisted = onDisk.filter((rel) => !listed.has(rel));

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
  console.log(`  commit    : ${sha}${manifest.git?.dirty ? " (dirty: patch included)" : ""} ${shaKnown ? "\u2714 known here" : "\u26a0 unknown locally"}`);
  if (patchState) console.log(`  tree      : ${patchState}`);
  console.log(`  host      : ${manifest.host?.hostname} \u00b7 ${manifest.host?.cpuModel} \u00d7${manifest.host?.cpuCount} \u00b7 node ${manifest.host?.node}`);
  console.log(`  created   : ${manifest.createdAt}`);
  console.log(`  scope     : ${partial ? `\u26a0 PARTIAL (${requestedOnly ? `--only ${requestedOnly.join(",")}` : `--skip ${(manifest.args?.skip ?? []).join(",")}`})` : "full slow-lane plan"}`);
  console.log(`  gates     : ${counts.pass} pass / ${counts.fail} fail / ${counts.timeout} timeout / ${counts.skipped} skipped`);
  console.log(`  files     : ${checked} hash-checked${unlisted.length ? `, ${unlisted.length} unlisted (extra)` : ""}`);
  console.log("");
  for (const s of manifest.steps ?? []) {
    console.log(`  ${statusIcon(s.status)} ${String(s.slug).padEnd(18)} ${String(s.seconds).padStart(7)}s  ${s.label}`);
  }
  for (const m of manifest.measurements ?? []) {
    console.log(`  ${statusIcon(m.status)} ${String(m.slug).padEnd(18)} ${String(m.seconds).padStart(7)}s  ${m.label}`);
  }
  for (const c of manifest.baselineComparison ?? []) {
    if (!c.ok) continue;
    console.log(`  \u{1F4CA} ${c.metric}: ${c.compared} compared, max |\u0394| ${c.maxAbsDelta}, mean |\u0394| ${c.meanAbsDelta}`);
  }

  console.log("\n  --- failing gate evidence ---");
  const red = (manifest.steps ?? []).filter((s) => s.status === "fail" || s.status === "timeout");
  if (red.length === 0) console.log("  (none)");
  for (const s of red) {
    console.log(`\n  \u274c ${s.label} (exit ${s.exitCode}${s.timedOut ? ", timed out" : ""})`);
    for (const h of (s.highlights.length ? s.highlights : s.tail).slice(0, 10)) console.log(`     ${h}`);
  }

  if (absent.length) problems.push(`gates missing from the package: ${absent.join(", ")}`);
  for (const s of noLog) problems.push(`log missing for ${s.slug}: ${s.log}`);
  if (manifest.git?.dirty && (!fs.existsSync(patchPath) || fs.statSync(patchPath).size === 0)) {
    problems.push("tree was dirty but git/changes.patch is empty — results are unattributable");
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
  console.log(`Groove Lab slow pack · v${pkg.version} · ${gitState().sha.slice(0, 7)}`);
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
