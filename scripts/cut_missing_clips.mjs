/**
 * ⭐ **Cut the clips that are missing, with the watchdog that the previous attempt lacked.**
 *
 * The last batch was an ad-hoc shell loop, and it lost the whole pipeline twice over: once to a render whose reply never
 * came (the client's timeout never fired) and once to a render whose event loop simply stopped (`vocal-trance` sat silent
 * for over twenty minutes past a 900 s deadline and had to be killed by hand). Both of those are in-process timers, so
 * neither can survive the failure they are supposed to catch — see `scripts/lib/watchdog.mjs`.
 *
 * This script therefore runs **each genre in its own process group** under that watchdog, and a genre that hangs is
 * killed, named, and left behind while the batch carries on. It never invents a clip: a genre with no artifact stays out
 * of the manifest, which is what `--merge` enforces anyway.
 */
import fs from "node:fs";
import path from "node:path";
import { runWithWatchdog } from "./lib/watchdog.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback = undefined) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);

const OUT = flag("out", "dist-missing");
const LIMIT_MIN = Number(flag("limit-min", "20"));
const ASSEMBLY = "public/genre-clips.json";
const BASELINE = "scripts/loudness.baseline.json";

const have = new Set(JSON.parse(fs.readFileSync(ASSEMBLY, "utf8")).clips.map((c) => c.genreId));
const baseline = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
const universe = Object.keys(baseline.genres ?? baseline);
const explicitlyAsked = args.filter((a) => !a.startsWith("--") && universe.includes(a));
const wanted = explicitlyAsked.length ? explicitlyAsked : universe.filter((g) => !have.has(g));

console.log(`clips present: ${have.size} | universe: ${universe.length} | to cut: ${wanted.length}`);
console.log(`watchdog: ${LIMIT_MIN} min per genre, killed by process group`);
if (has("dry-run") || wanted.length === 0) {
  for (const g of wanted) console.log(`  would cut: ${g}`);
  process.exit(0);
}

const results = [];
for (const genre of wanted) {
  const startedAt = Date.now();
  const run = await runWithWatchdog(process.execPath, ["scripts/build_genre_clips.mjs", "--only", genre, "--out", OUT], {
    limitMs: LIMIT_MIN * 60_000,
    onOutput: (text) => process.stdout.write(text.split("\n").filter((l) => l.trim()).slice(-1).map((l) => `    ${l}\n`).join("")),
  });
  const mp3 = path.join(OUT, `${genre}.mp3`);
  const verdict = run.killedByWatchdog
    ? `KILLED BY WATCHDOG after ${LIMIT_MIN} min — the batch carries on`
    : fs.existsSync(mp3) ? "cut" : `no artifact (exit ${run.code}${run.signal ? `, ${run.signal}` : ""})`;
  results.push({ genre, verdict, seconds: Math.round((Date.now() - startedAt) / 1000) });
  console.log(`  ${genre.padEnd(20)} ${verdict} (${results.at(-1).seconds}s)`);
}

console.log("\nsummary:");
for (const r of results) console.log(`  ${r.genre.padEnd(20)} ${r.verdict}`);
const cut = results.filter((r) => r.verdict === "cut").length;
console.log(`${cut} cut, ${results.length - cut} without an artifact (they stay out of the manifest).`);
