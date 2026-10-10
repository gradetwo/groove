/**
 * ⭐ **Cut the phone's genre clips** (owner's decision, 2026-10-10: pre-generate MP3s into a Cloudflare Worker's static
 * assets, keep them out of git, and regenerate them in a batch).
 *
 * It drives **one MCP session** rather than two shell calls, because the server keeps arrangements in-process: measured
 * 2026-10-10, `create_arrangement` then `render_arrangement` in two `mcp_call.mjs` invocations answered
 * *unknown arrangementId* — the second process had never seen the first's work.
 *
 * Each clip is rendered through **the application's own offline renderer** (`render_arrangement`), which is what makes the
 * owner's hard requirement true by construction: the arrangement resolves its own lanes, so a genre that maps six of eight
 * lanes to recordings is *heard* with those recordings (`describe_arrangement {format:"json"}` counts them and the count is
 * written into the manifest rather than claimed).
 *
 * Usage:
 *   node scripts/build_genre_clips.mjs --only bossa-nova [--out <dir>] [--seconds 20]
 *   node scripts/build_genre_clips.mjs --all [--out <dir>]
 *
 * The MP3s go to `--out` (default `dist-clips/`), which is **not** in git; the manifest is rewritten at
 * `public/genre-clips.json`, which is.
 */
/**
 * Probe (not a gate): **does a real eight-bar render finish inside the budget, and does it report progress?**
 *
 *   npm run mcp:build && node scripts/probe_eight_bar_render.mjs
 *
 * The profile records that a browser process runs out of GS-1 budget after roughly 40–124 renders and
 * disappears. The other probes for that ceiling ask whether the browser is reaped and whether the audio
 * drifts; this one asks the question a long session actually depends on: after the browser is **gone**,
 * does the next render (a) rebuild it and succeed, or (b) fail for the rest of the session.
 *
 * The kill targets the Chromium processes this server started, found by walking `/proc/<pid>/cmdline` rather
 * than by name: `pgrep -f chromium_headless` was measured to find 4 of 50 leaked processes.
 */
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";

const BUNDLE = "dist-mcp/groove-mcp.mjs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Chromium processes whose command line mentions the headless shell this project launches. */
function chromiumPids() {
  const pids = [];
  for (const entry of readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      const cmd = readFileSync(`/proc/${entry}/cmdline`, "utf8").replaceAll("\0", " ");
      if (/chromium_headless|chrome-linux|headless_shell/.test(cmd) && !cmd.includes("probe_browser_death")) pids.push(Number(entry));
    } catch {
      /* gone */
    }
  }
  return pids;
}

const child = spawn(process.execPath, [BUNDLE], { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env } });
let id = 0;
const pending = new Map();
let buffer = "";
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, index);
    buffer = buffer.slice(index + 1);
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    } catch {
      /* not JSON-RPC */
    }
  }
});
const request = (method, params) =>
  new Promise((resolve) => {
    const myId = ++id;
    pending.set(myId, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: myId, method, params }) + "\n");
  });
const callTool = async (name, args) => {
  const reply = await request("tools/call", { name, arguments: args });
  const text = reply?.result?.content?.[0]?.text ?? JSON.stringify(reply?.error ?? reply);
  return { ok: !reply?.error && !reply?.result?.isError, text: String(text) };
};

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};
const OUT = flag("out", "dist-clips");
const MERGE = args.includes("--merge");
const PART = `${OUT}/manifest-${shardIndex}.json`;
const ONLY = flag("only", undefined);
const ALL = args.includes("--all");
const RECIPE_VERSION = "1";
/** ⭐ `--format wav` exists for one question only: the **WAV path reports `integratedLufs`** and the MP3 path does not. */
const FORMAT = flag("format", "mp3");

/** ⭐ `callTool` answers with the reply already parsed when it is JSON, and with text when it is not: accept both. */
const asObject = (value) => {
  /**
   * ⭐ **The harness answers `{ok, text}`** (measured 2026-10-10: `{"ok":true,"text":"{\n  \"arrangementId\": \"arrangement-1\"…"}`)
   * — the reply's JSON is a *string* inside `text`, so unwrapping it is the step that turns the tool's answer into data.
   */
  if (value && typeof value === "object" && typeof value.text === "string") {
    try {
      return JSON.parse(value.text);
    } catch {
      return value;
    }
  }
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return {};
  }
};

/**
 * ⭐ **The genre ids come from the reply's own JSON** (the first version scraped them with a regex, which is how a list of
 * fifty becomes eleven). `list_genres` answers `{ genres: [{ id, … }] }`, so unwrapping it is the whole job — the same
 * `asObject` the tool calls use.
 */
/**
 * ⭐ ** is not decoration: the tool's default is 50** (measured 2026-10-10 — the owner asked why only fifty genres
 * were being cut, and the answer is that  pages at fifty while the library holds **159**). A batch that
 * silently cuts a third of the library is the same class of mistake as the regex that scraped eleven.
 */
const listed = asObject(await callTool("list_genres", { limit: 200 }));
const allGenres = (Array.isArray(listed.genres) ? listed.genres : Array.isArray(listed) ? listed : [])
  .map((entry) => (typeof entry === "string" ? entry : entry?.id))
  .filter((id) => typeof id === "string" && id.length > 0);
/**
 * ⭐ **Shards, because one clip costs minutes and the library holds 159 genres** (measured 2026-10-10: chicago-house took
 * **353 s**; 159 × that is over fifteen hours serially). `--shard 3/8` takes every eighth genre, interleaved rather than
 * sliced so the slow ones spread evenly, and each shard writes its **own** manifest part — two processes must never write
 * the same file. `--merge` joins the parts into the committed manifest.
 */
const SHARD = flag("shard", undefined);
const [shardIndex, shardCount] = SHARD ? SHARD.split("/").map((value) => Number(value)) : [0, 1];
const genreIds = (ALL ? allGenres : [ONLY].filter(Boolean)).filter((_, index) =>
  shardCount > 1 ? index % shardCount === shardIndex : true
);
console.log(`${ALL ? "all" : "only"}: ${genreIds.length} genre(s)`);
if (MERGE) {
  /**
   * ⭐ **One writer for the committed manifest.** Each shard leaves its part in the (untracked) output directory; merging is a
   * separate act so a half-finished batch can never replace the shipped list — the same rule the empty-run guard enforces.
   */
  const parts = readdirSync(OUT).filter((name) => /^manifest-\d+\.json$/.test(name));
  const merged = parts.flatMap((name) => JSON.parse(readFileSync(`${OUT}/${name}`, "utf8")).clips ?? []);
  if (merged.length === 0) {
    console.error(`no shard manifests in ${OUT}/; nothing to merge`);
    process.exit(1);
  }
  writeFileSync("public/genre-clips.json", JSON.stringify({ bars: 8, clips: merged }, null, 2) + "\n");
  console.log(`merged ${merged.length} clip(s) from ${parts.length} shard manifest(s)`);
  process.exit(0);
}
if (genreIds.length === 0) {
  console.error("nothing to do: pass --only <genreId>, --all or --merge");
  process.exit(2);
}

mkdirSync(OUT, { recursive: true });
const version = JSON.parse(readFileSync("public/version.json", "utf8")).version;
const clips = [];
for (const genreId of genreIds) {
  const started = Date.now();
  /**
   * ⭐ **One create, then one render** — the create reply already carries everything the manifest needs. Measured
   * 2026-10-10 with `mcp_call.mjs`: it answers with `arrangementId`, `trackCount`, and a `tracks[]` whose entries carry
   * `kind`, `name` and `sound: { source, assetId, detail }`. Asking `describe_arrangement` for the same facts would be a
   * second round trip that can disagree with the first.
   */
  /**
   * ⭐ **Ask for the genre's own content** — without this the arrangement carries no notes at all (the MCP surface drops
   * starter notes by default, at two field reports' request), and a genre-seeded render is **digital silence**:
   * measured 2026-10-10, thirteen bands at −120 dB. With the opt-in the same call carried 188 notes.
   */
  const created = asObject(await callTool("create_arrangement", { genreId, withGenreNotes: true }));
  const arrangementId = created.arrangementId ?? created.id;
  if (!arrangementId) {
    console.error(`${genreId}: could not create an arrangement: ${JSON.stringify(created).slice(0, 200)}`);
    continue;
  }
  const tracks = Array.isArray(created.tracks) ? created.tracks : [];
  /**
   * ⭐ **A lane that should be a recording and is not is the failure this batch must not hide.** The create reply's own
   * `sound.detail` says it: "a configured sample mirror must serve it, **or the lane falls back to the built-in preset**".
   * A clip cut while the mirror was unreachable would look complete and sound like the synth — precisely the silent
   * downgrade the owner's requirement forbids.
   */
  const fallbacks = tracks.filter((track) => {
    const source = track?.sound?.source;
    return source !== undefined && source !== "catalogue-asset" && track?.sound?.assetId === undefined;
  });
  /**
   * ⭐ **Only the arguments the tool declares** (measured 2026-10-10): `render_arrangement` takes `arrangementId`,
   * `format`, `bitrateKbps`, `bars`, `sampleRate` and `channels` — **not** `outputDir`/`filename`. The first run passed
   * those two anyway; they were ignored (the reply's own `unknownArgs` is the mechanism that says so) and the file landed
   * in the server's temporary directory. The reply names where it went, so the script copies it where the batch wants it.
   */
  /**
   * ⭐ **A genre's arrangement is one bar long** (measured 2026-10-10: `bars=1 passes=1 totalSteps=16 durationSec=2.6`), and
   * the owner wants a **15–30 second** clip. `render_arrangement`'s `bars` argument **repeats the arrangement** and "drives
   * the duration", so the clip's length is a choice this script has to make rather than inherit.
   *
   * It asks for six repeats first — a rough guess at 15–20 s for the tempos in this library — then, **only if the answer is
   * outside the window**, works out the repeats that would land at ~20 s from what the first render actually measured. One
   * render in the common case, two in the rare one.
   */
  const TARGET_SECONDS = 20;
  const IN_RANGE = (seconds) => seconds >= 15 && seconds <= 30;
  let banner = asObject(await callTool("render_arrangement", { arrangementId, format: FORMAT, bitrateKbps: 192, bars: flag("bars", 6) }));
  let passes = Number(banner.passes ?? flag("bars", 6)) || 1;
  if (!IN_RANGE(Number(banner.durationSec ?? 0))) {
    const one = Number(banner.durationSec ?? 0) / passes;
    const wanted = one > 0 ? Math.max(1, Math.round(TARGET_SECONDS / one)) : passes;
    console.log(`   ${String(banner.durationSec)}s is outside 15–30s; asking for ${wanted} repeat(s) instead`);
    banner = asObject(await callTool("render_arrangement", { arrangementId, format: FORMAT, bitrateKbps: 192, bars: wanted }));
    passes = wanted;
  }
  /**
   * ⭐ **`skippedLanes` is a health check the renderer hands over for free**: a lane whose bytes could not be resolved is
   * named there with its reason, rather than dropped in silence. It belongs in the manifest beside the lane counts.
   */
  const skipped = Array.isArray(banner.skippedLanes) ? banner.skippedLanes : [];
  /**
   * ⭐ **Say the numbers that explain the clip's length** (measured 2026-10-10: the first clip came out **2.6 s** while the
   * render took 21.9 s of wall clock — two different quantities, and only the reply's own `bars`/`passes`/`durationSec` can
   * tell which one is the clip). And print every skipped lane with its reason, because "3 lanes skipped" is the difference
   * between a clip that carries the genre's instruments and one that quietly does not.
   */
  console.log(
    `   bars=${String(banner.bars)} passes=${String(banner.passes)} totalSteps=${String(banner.totalSteps)} ` +
      `durationSec=${String(banner.durationSec)} sampleRate=${String(banner.sampleRate)} channels=${String(banner.channels)} ` +
      `lufs=${String(banner.integratedLufs)}`
  );
  for (const lane of skipped) console.log(`   ⚠ skipped: ${JSON.stringify(lane).slice(0, 240)}`);
  console.log(`   reply keys: ${Object.keys(banner).join(", ")}`);
  const clipWarnings = [];
  if (skipped.length > 0) {
    clipWarnings.push({ code: "skipped-lanes", detail: `${skipped.length} lane(s) had nothing to resolve and are not in the clip` });
  }
  const recorded = tracks.filter((track) => track?.sound?.source === "catalogue-asset").length;
  if (recorded === 0) {
    clipWarnings.push({ code: "no-recordings", detail: "no lane in this clip sounds through a real recording — the owner's requirement is that a clip carries its genre's own instruments" });
  }
  const seconds = Number(banner.durationSec ?? 0);
  if (!(seconds >= 15 && seconds <= 30)) {
    clipWarnings.push({ code: "length-out-of-range", detail: `${seconds.toFixed(1)}s is outside the owner's 15–30s window` });
  }
  const file = banner.file ?? banner.output ?? banner.path ?? banner.outputPath ?? banner.writtenTo;
  let bytes;
  let copied = file;
  if (typeof file === "string" && existsSync(file)) {
    copied = `${OUT}/${genreId}.mp3`;
    copyFileSync(file, copied);
    bytes = statSync(copied).size;
  }
  clips.push({
    genreId,
    url: `${genreId}.${FORMAT}`,
    /**
     * ⭐ **The reply's own names** (measured 2026-10-10, printed from a real render): `durationSec`, `bytes`,
     * `integratedLufs`, `skippedLanes`. My first version guessed four other spellings of the duration and wrote 0 —
     * a manifest that says a 20-second clip is 0 seconds long is the kind of lie this batch must not ship.
     */
    seconds: Number(banner.durationSec ?? 0) || 0,
    ...(bytes === undefined ? {} : { bytes }),
    ...(typeof banner.integratedLufs === "number" ? { lufs: banner.integratedLufs } : {}),
    /** ⭐ The repeats the clip was cut with, so its length is reproducible rather than "about twenty seconds". */
    bars: passes,
    engineVersion: version,
    recipeVersion: RECIPE_VERSION,
    generatedAt: new Date().toISOString().slice(0, 10),
    /** ⭐ Counted from the create reply, and the sources are carried into the log so a fallback cannot pass unnoticed. */
    recordedLanes: tracks.filter((track) => track?.sound?.source === "catalogue-asset").length,
    /**
     * ⭐ **Built-in voices, not "tracks whose kind is synth"** — the first run counted by kind and reported 3 while the
     * truth was 2 (the snare and the fx lane: a synth *kind* can still sound through a recording, and a drumkit lane can
     * sound through the built-in drums). `recordedLanes + builtInLanes` is the track count, and this is the honest split.
     */
    builtInLanes: tracks.filter((track) => track?.sound?.source !== "catalogue-asset").length,
    ...(skipped.length === 0 ? {} : { skippedLanes: skipped.length }),
    /**
     * ⭐ **The observables this batch can judge for itself** (owner's instruction 2026-10-10: the clips must be checked, not
     * just cut). The musical half belongs to `genrePatternHealth`, which the test suite runs over the whole library; these
     * are the ones the renderer's own reply answers, and each one is a fact rather than a taste.
     */
    ...(clipWarnings.length === 0 ? {} : { warnings: clipWarnings }),
  });
  console.log(
    `${genreId}: ${((Date.now() - started) / 1000).toFixed(1)}s, ${bytes ?? "?"} bytes, ` +
      `${clips.at(-1).recordedLanes}/${tracks.length} lanes with a recording` +
      (fallbacks.length ? ` — ⚠ ${fallbacks.length} lane(s) fell back to the built-in preset` : "")
  );
  for (const track of tracks) {
    console.log(`   ${String(track?.id ?? track?.name)}: ${String(track?.sound?.source ?? "?")} ${String(track?.sound?.assetId ?? "")}`);
  }
}
/**
 * ⭐ **A failed batch must not replace the manifest with an empty one.** The first run of this script did exactly that
 * (measured 2026-10-10): it wrote `{"bars":8,"clips":[]}` with no reason, which the manifest's own reader refuses —
 * "an empty clip manifest must say why it is empty". Leaving the committed manifest untouched is the honest outcome of a
 * run that produced nothing.
 */
if (clips.length === 0) {
  console.error("no clips were produced; public/genre-clips.json was left as it was");
  process.exit(1);
}
writeFileSync(PART, JSON.stringify({ bars: 8, clips }, null, 2) + "\n");
console.log(`wrote ${PART} with ${clips.length} clip(s); MP3s are in ${OUT}/ (not in git). Merge with --merge`);
process.exit(0);
