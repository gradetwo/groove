#!/usr/bin/env node
/**
 * The lane cost curve, measured one lane count per browser process.
 *
 * **Why it is chunked.** A single browser process here does not survive a series of renders: the probe's runs ended in `[browser] disconnected` with no crash event and no page error, at a different point each time, and a single render of a two-bar song
 * was enough to kill one. An idle browser in the same environment lives for at least eight minutes, so it is the rendering rather than the environment. This repository already knew the shape of the problem — `manual-verify.yml` says the loudness
 * sweep is chunked "because a single browser process exhausts the WASM budget after roughly forty renders and the run aborts on its own sentinel (which is why it never completed on a laptop either)" — so the curve is measured the same way.
 *
 * A failure is reported per lane count rather than aborting the run: the point of the curve is that 1, 4, 16 and 64 lanes cost different amounts, and knowing that three of them measured while the fourth could not is better than losing all four.
 *
 * Usage: node scripts/measure_lane_curve.mjs [--genre=chicago-house] [--lanes=1,4,16,64] [--json]
 */
import { spawnSync } from "node:child_process";

const argv = process.argv.slice(2);
const genre = (argv.find((a) => a.startsWith("--genre=")) ?? "--genre=chicago-house").split("=")[1];
const counts = ((argv.find((a) => a.startsWith("--lanes=")) ?? "--lanes=1,4,16,64").split("=")[1] ?? "")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isFinite(value) && value > 0);
const asJson = argv.includes("--json");
/**
 * **A timeout per lane count, because a probe that hangs is worse than one that fails.** The first version had none, and a CI run sat for the better part of an hour with no output — a job that never finishes reports nothing, while a job that gives up reports which count could not be measured.
 *
 * **180 s rather than 420 s, and the reason is measured rather than guessed.** The probe was being asked for one lane count and running the whole probe instead (see the note in `probe_arrangement_audio.mjs`): four counts then cost **28 minutes** of a CI runner to learn nothing. With one count per process actually working, a lane count is seconds of rendering plus a Vite start and a browser
 * launch, so 180 s is generous — and a count that genuinely needs longer will say so instead of hiding inside a quarter of an hour.
 */
const timeoutMs = Number((argv.find((a) => a.startsWith("--timeout=")) ?? "--timeout=180000").split("=")[1]);

const points = [];
const failures = [];
for (const lanes of counts) {
  process.stdout.write(`  ${String(lanes).padStart(3)} lane(s) … `);
  // `--json` so the number comes back as data rather than as a line of prose to parse; the probe's own log is passed through so a failure still says why.
  const result = spawnSync(
    process.execPath,
    ["scripts/probe_arrangement_audio.mjs", `--genre=${genre}`, "--only=lane", `--lanes=${lanes}`, "--json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], timeout: timeoutMs }
  );
  // `spawnSync` reports a timeout through `signal`, and it is a result rather than an exception: the curve simply has one fewer point.
  const timedOut = result.signal !== null || result.error?.code === "ETIMEDOUT";
  /**
   * ⭐ **The announced point first, the summary second, and the order is the point.**
   *
   * The probe announces each lane count as it finishes (`LANE_CURVE {…}`) because the summary only arrives when `page.evaluate` returns — and on this runner the render can kill the browser, so the evaluate never returns and every count measured seconds earlier is thrown away with it. That is exactly what two CI runs did: four counts rendered in about four seconds each and the log said "the browser process did not finish the render" for all four.
   *
   * The summary is still read as a fallback, because a run where nothing dies should not depend on parsing console output.
   */
  let point;
  for (const candidate of (result.stdout ?? "").split("\n")) {
    const announced = candidate.match(/LANE_CURVE (\{.*\})\s*$/);
    if (!announced) continue;
    try {
      const parsed = JSON.parse(announced[1]);
      if (parsed?.lanes === lanes) point = parsed;
    } catch {
      // A truncated line means the browser died mid-write; the next count is unaffected, and a summary fallback may still be there.
    }
  }
  if (!point) {
    const line = (result.stdout ?? "").split("\n").find((candidate) => candidate.trim().startsWith("{"));
    try {
      const parsed = JSON.parse(line ?? "");
      point = parsed?.renderLaneCurve?.points?.[0];
    } catch {
      point = undefined;
    }
  }
  if (!point) {
    failures.push(lanes);
    console.log(
      timedOut
        ? `could not be measured (no result within ${Math.round(timeoutMs / 1000)}s — the probe is left behind by this limit)`
        : "could not be measured (the browser process did not finish the render)"
    );
    continue;
  }
  points.push(point);
  console.log(`${point.seconds}s${point.peakHeapMB === undefined ? "" : ` · peak heap sampled ${point.peakHeapMB} MB`}`);
}

if (asJson) {
  console.log(JSON.stringify({ genre, points, failures }, null, 2));
  process.exit(failures.length === counts.length ? 1 : 0);
}

console.log("");
for (const point of points) {
  console.log(`  ${String(point.lanes).padStart(3)} lane(s)  ${String(point.seconds).padStart(8)}s  ${String(point.frames).padStart(9)} frames${point.peakHeapMB === undefined ? "" : `  peak heap sampled ${point.peakHeapMB} MB`}`);
}
if (failures.length > 0) console.log(`  not measured: ${failures.join(", ")} lane(s)`);
console.log("  time is wall clock inside the browser; peak heap is sampled every 10ms, Chromium-only, and page-wide rather than the render alone");
process.exit(failures.length === counts.length ? 1 : 0);
