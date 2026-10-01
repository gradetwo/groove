#!/usr/bin/env node
/**
 * The graph split: attribute the offline render's cost to the parts of the graph.
 *
 * **What it measures.** A song is rendered once per variant with exactly one part of the graph left
 * out — the voices, the per-track insert chain, the send buses, the master true-peak limiter — and
 * each variant reports wall clock and sampled peak heap. The attribution is then the difference
 * between the full render and the render without one part, not an estimate of what each part
 * "should" cost. `scripts/measure_lane_curve.mjs` measures the whole graph as a function of lane
 * count; this measures the inside of one graph at one lane count.
 *
 * **Why it is chunked.** For the same reason the curve is: a single browser process here does not
 * survive a series of offline renders — the probe's runs ended in `[browser] disconnected` with no
 * crash event and no page error, at a different point each time, and one render of a two-bar song
 * was enough to kill one. So one variant is rendered per fresh process.
 *
 * **A variant that cannot be measured is reported, not retried.** Knowing that three variants
 * measured while the fourth could not is worth more than losing all four, and a run where every
 * variant failed is the only one that exits non-zero.
 *
 * Usage:
 *   node scripts/measure_graph_split.mjs [--genre=chicago-house] [--lanes=16]
 *                                        [--variants=full,no-voices,no-effects,no-sends,no-limiter]
 *                                        [--samples=3] [--timeout=600000] [--json]
 *
 * `--samples` is renders per variant, with one discarded warm-up before them: a single reading of
 * this render was measured to disagree with itself by a factor of seven, so the median and every
 * sample are both reported. Lower it when the browser will not survive the full count.
 */
import { spawnSync } from "node:child_process";

const argv = process.argv.slice(2);
const USAGE = `The graph split: render the same song without each named part and report time and heap.

Usage: node scripts/measure_graph_split.mjs [options]

  --genre=<id>        genre fixture to render (default chicago-house)
  --lanes=<n>         lane count for every variant (default 16)
  --variants=<list>   comma-separated subset of
                      full,no-voices,no-effects,no-sends,no-limiter
  --samples=<n>       renders per variant after one discarded warm-up (default 3)
  --timeout=<ms>      limit per variant process (default 600000)
  --json              print the points as JSON instead of prose
  --help              print this text

Each variant runs in its own browser process, because one offline render here can kill a browser.
A variant that does not finish is reported as unmeasured; only a run where every variant failed
exits non-zero. The numbers are CI-only: run this in the manual-verify 'audio' scope.
`;

if (argv.includes("--help") || argv.includes("-h")) {
  console.log(USAGE);
  process.exit(0);
}

const genre = (argv.find((a) => a.startsWith("--genre=")) ?? "--genre=chicago-house").split("=")[1];
const lanes = Number((argv.find((a) => a.startsWith("--lanes=")) ?? "--lanes=16").split("=")[1]) || 16;
const samples = Number((argv.find((a) => a.startsWith("--samples=")) ?? "--samples=3").split("=")[1]) || 1;
const variants = (
  (argv.find((a) => a.startsWith("--variants=")) ?? "--variants=full,no-voices,no-effects,no-sends,no-limiter").split("=")[1] ?? ""
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const asJson = argv.includes("--json");
/**
 * A timeout per variant, because a probe that hangs is worse than one that fails: the first version
 * of the lane curve had none and a CI run sat for the better part of an hour with no output. The
 * default is generous — each process starts a dev server and a browser.
 */
const timeoutMs = Number((argv.find((a) => a.startsWith("--timeout=")) ?? "--timeout=600000").split("=")[1]);

/**
 * The first line that parses as JSON. The probe prints its `--json` result on one line, but a page
 * `console.log` line could in principle start with `{`, so a failed parse keeps looking rather than
 * declaring the variant unmeasured.
 */
function extractJson(stdout) {
  for (const line of (stdout ?? "").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      return JSON.parse(trimmed);
    } catch {
      /* not the result line; keep looking */
    }
  }
  return undefined;
}

const points = [];
const failures = [];
for (const variant of variants) {
  process.stdout.write(`  ${variant.padEnd(11)} … `);
  // `--json` so the number comes back as data rather than as a line of prose to parse; the probe's
  // own log is passed through so a failure still says why.
  const result = spawnSync(
    process.execPath,
    [
      "scripts/probe_arrangement_audio.mjs",
      `--genre=${genre}`,
      "--only=graphSplit",
      `--variant=${variant}`,
      `--lanes=${lanes}`,
      `--samples=${samples}`,
      "--json",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], timeout: timeoutMs }
  );
  // `spawnSync` reports a timeout through `signal`, and it is a result rather than an exception:
  // the split simply has one fewer point.
  const timedOut = result.signal !== null || result.error?.code === "ETIMEDOUT";
  const parsed = extractJson(result.stdout);
  const point = parsed?.graphSplit?.points?.[0];
  if (!point) {
    failures.push(variant);
    console.log(
      timedOut
        ? `could not be measured (no result within ${Math.round(timeoutMs / 1000)}s — the probe is left behind by this limit)`
        : `could not be measured (the browser process did not finish the render)`
    );
    continue;
  }
  points.push(point);
  console.log(`${point.seconds}s${point.peakHeapMB === undefined ? "" : ` · peak heap sampled ${point.peakHeapMB} MB`}`);
}

/**
 * The differences, and only where the full render was measured in the same run: with one variant per
 * process, a run that was asked for a single variant has no baseline and says so by printing none.
 */
const full = points.find((point) => point.variant === "full");
const deltas = full
  ? points
      .filter((point) => point.variant !== "full")
      .map((point) => ({
        variant: point.variant,
        fullMinusVariantSeconds: Number((full.seconds - point.seconds).toFixed(4)),
      }))
  : [];

if (asJson) {
  console.log(JSON.stringify({ genre, lanes, samples, points, deltas, failures }, null, 2));
  process.exit(failures.length === variants.length ? 1 : 0);
}

console.log("");
console.log(`  ${genre}, ${lanes} lane(s), the probe's two-bar song, ${samples} sample(s) per variant`);
for (const point of points) {
  const heap = point.peakHeapMB === undefined ? "" : `  peak heap sampled ${point.peakHeapMB} MB`;
  const delta = full && point.variant !== "full" ? `  full − ${point.variant} = ${(full.seconds - point.seconds).toFixed(4)}s` : "";
  console.log(
    `  ${point.variant.padEnd(11)} ${String(point.seconds).padStart(8)}s  ${String(point.frames).padStart(9)} frames${heap}${delta}`
  );
  if (point.samples && point.samples.length > 1) console.log(`              samples ${JSON.stringify(point.samples)}`);
}
if (failures.length > 0) console.log(`  not measured: ${failures.join(", ")}`);
console.log("  time is wall clock inside the browser, median of the samples; a difference is only a");
console.log("  difference when it is larger than the spread printed beside it");
console.log("  peak heap is sampled every 10ms, so it is a lower bound; Chromium-only and page-wide");
console.log("  rather than the render alone");
process.exit(failures.length === variants.length ? 1 : 0);
