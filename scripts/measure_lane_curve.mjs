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

const points = [];
const failures = [];
for (const lanes of counts) {
  process.stdout.write(`  ${String(lanes).padStart(3)} lane(s) … `);
  // `--json` so the number comes back as data rather than as a line of prose to parse; the probe's own log is passed through so a failure still says why.
  const result = spawnSync(
    process.execPath,
    ["scripts/probe_arrangement_audio.mjs", `--genre=${genre}`, "--only=lane", `--lanes=${lanes}`, "--json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }
  );
  const line = (result.stdout ?? "").split("\n").find((candidate) => candidate.trim().startsWith("{"));
  let point;
  try {
    const parsed = JSON.parse(line ?? "");
    point = parsed?.renderLaneCurve?.points?.[0];
  } catch {
    point = undefined;
  }
  if (!point) {
    failures.push(lanes);
    console.log("could not be measured (the browser process did not finish the render)");
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
