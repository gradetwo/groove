#!/usr/bin/env node
/**
 * Track runner — fast track (per small version) & slow track (periodic full regression).
 *
 *   node scripts/track.mjs fast [--base <ref>] [--with-build]
 *   node scripts/track.mjs slow
 *
 * Fast track  : typecheck + eslint(changed only) + affected unit tests (+ optional build/budget).
 * Slow track  : typecheck + full lint + data lint + full coverage suite + build + budget + e2e + redlines.
 *
 * Both tracks are fail-fast and return a non-zero exit code on the first failing gate.
 * Port isolation: no gate binds a fixed port (e2e uses an ephemeral one), so several
 * worktrees can run tracks concurrently.
 */
import { spawnSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const mode = argv[0] === "slow" ? "slow" : "fast";

function argValue(flag, fallback = null) {
  const idx = argv.indexOf(flag);
  return idx !== -1 && argv[idx + 1] ? argv[idx + 1] : fallback;
}
const withBuild = argv.includes("--with-build");
const quiet = argv.includes("--quiet");

function run(label, command, args, options = {}) {
  if (!quiet) console.log(`\n\u2500\u2500 ${label}\n   $ ${command} ${args.join(" ")}`);
  const started = Date.now();
  const res = spawnSync(command, args, {
    stdio: quiet ? ["ignore", "pipe", "pipe"] : "inherit",
    cwd: options.cwd ?? ROOT,
    env: { ...process.env, ...(options.env ?? {}) },
    shell: false,
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (res.status !== 0) {
    if (quiet && res.stdout) process.stdout.write(res.stdout.toString());
    if (quiet && res.stderr) process.stderr.write(res.stderr.toString());
    console.error(`\n\u274c GATE FAILED: ${label} (${seconds}s, exit ${res.status ?? "signal"})`);
    process.exit(res.status || 1);
  }
  console.log(`\u2705 ${label} (${seconds}s)`);
}

function capture(command, args) {
  try {
    return execSync([command, ...args].join(" "), { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function resolveBase() {
  const explicit = argValue("--base");
  if (explicit) return explicit;
  // Default: only the current working tree (what the next commit will contain).
  // `--since-tag` widens the window to everything since the last release tag,
  // which is what a small-version gate wants before bumping the version.
  if (argv.includes("--since-tag")) {
    const tag = capture("git", ["describe", "--tags", "--abbrev=0"]);
    if (tag) return tag;
  }
  return "HEAD";
}

function collectChangedFiles(base) {
  const committed = capture("git", ["diff", "--name-only", `${base}...HEAD`]);
  const working = capture("git", ["status", "--porcelain"]);
  const unstaged = working
    .split("\n")
    .map((line) => line.slice(3).trim())
    .filter(Boolean);
  const all = new Set(
    [...committed.split("\n"), ...unstaged].map((f) => f.trim()).filter(Boolean)
  );
  return [...all].filter((f) => fs.existsSync(path.join(ROOT, f)));
}

function runRedlinesIfPresent() {
  if (fs.existsSync(path.join(ROOT, "scripts/redlines.mjs"))) {
    run("Red-line checks", "node", ["scripts/redlines.mjs"]);
  }
}

if (mode === "fast") {
  const base = resolveBase();
  const changed = collectChangedFiles(base);
  const changedSource = changed.filter((f) => /^src\/.*\.(ts|tsx)$/.test(f));
  const changedLintable = changed.filter((f) => /\.(ts|tsx)$/.test(f) || f.startsWith("scripts/"));

  console.log("===============================================================");
  console.log("  \u26a1 FAST TRACK (small version)");
  console.log(`  base ref : ${base}`);
  console.log(`  changed  : ${changed.length} file(s), ${changedSource.length} source file(s)`);
  console.log("===============================================================");

  run("TypeScript typecheck", "npx", ["tsc", "--noEmit"]);

  if (changedLintable.length > 0) {
    run("ESLint (changed files)", "npx", ["eslint", "--quiet", ...changedLintable]);
  } else {
    console.log("\u23ed  ESLint skipped (no lintable changes)");
  }

  if (changedSource.length > 0) {
    run("Affected unit tests", "npx", ["vitest", "run", "--changed", base, "--reporter=dot"]);
  } else {
    console.log("\u23ed  Unit tests skipped (no source changes)");
  }

  if (withBuild) {
    run("Production build", "npm", ["run", "build"]);
    run("Bundle budget gate", "node", ["scripts/check_budgets.js"]);
  }
  runRedlinesIfPresent();

  console.log("\n\ud83c\udf89 FAST TRACK PASSED");
  process.exit(0);
}

console.log("===============================================================");
console.log("  \ud83d\udc22 SLOW TRACK (full regression)");
console.log("===============================================================");
run("TypeScript typecheck", "npx", ["tsc", "--noEmit"]);
run("ESLint (all sources)", "npx", ["eslint", "src/**/*.{ts,tsx}"]);
run("Genre data lint", "npx", ["vitest", "run", "src/test/schema.test.ts", "--reporter=dot"]);
run("Full suite + coverage", "npx", ["vitest", "run", "--coverage", "--reporter=dot"]);
run("Production build", "npm", ["run", "build"]);
run("Bundle budget gate", "node", ["scripts/check_budgets.js"]);
run("Cross-device E2E matrix", "node", ["scripts/test_matrix.js"]);
runRedlinesIfPresent();
console.log("\n\ud83c\udf89 SLOW TRACK PASSED");
