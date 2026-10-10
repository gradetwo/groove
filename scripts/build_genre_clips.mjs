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
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";

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
/**
 * ⭐ **Remember the repeats that landed in the window, so a re-run renders once instead of twice** (measured 2026-10-10:
 * a clip takes ~350–650 s and the length search costs a **second full render**; the first pass guessed six repeats, saw
 * 12.6 s, and asked for ten). The cache is a side file in the untracked output directory, not the shipped manifest — the
 * manifest is written only by `--merge`, and a batch must never edit it in passing.
 */
const BARS_CACHE = `${OUT}/bars.json`;
const barsCache = existsSync(BARS_CACHE) ? JSON.parse(readFileSync(BARS_CACHE, "utf8")) : {};
const MERGE = args.includes("--merge");
const ONLY = flag("only", undefined);
const ALL = args.includes("--all");
const RECIPE_VERSION = "1";
/** ⭐ `--format wav` exists for one question only: the **WAV path reports `integratedLufs`** and the MP3 path does not. */
/**
 * ⭐ **Render WAV, then encode with ffmpeg** (owner's suggestion, 2026-10-10: *"直接生成wav，然后再用ffmpeg之类压成mp3应该
 * 能快很多"*). Two reasons it is right: the browser's MP3 encoder is JavaScript running inside the render, so every clip pays
 * for it, and the **WAV path is also the one that reports `integratedLufs`** — the MP3 path answered `null`. So this is
 * faster *and* it measures more.
 */
const FORMAT = flag("format", "wav");
const KEEP_WAV = args.includes("--keep-wav");
/**
 * ⭐ **Where the audio will actually live** (owner's decision ③, 2026-10-10: *"MP3 放 Cloudflare Worker 静态资源"*). The
 * clip's `url` is written into the committed manifest, and `src/data/genreClips.ts` says it is "absolute or root-relative" —
 * so the batch needs a way to name the Worker rather than a bare filename. The **merge** is the single writer of the shipped
 * list, which is why this applies there too: re-running the merge with a base is enough to re-point a batch that is already
 * rendered, with no re-render.
 */
const BASE = String(flag("base", "")).replace(/\/+$/, "");
const withBase = (url) => (BASE && !/^https?:\/\//.test(url) ? `${BASE}/${url.replace(/^\//, "")}` : url);

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
/** ⭐ Declared **after** the shard is parsed: an earlier version referenced `shardIndex` before its `const`, and every shard died on startup. */
const PART = `${OUT}/manifest-${shardIndex}.json`;
console.log(`${ALL ? "all" : "only"}: ${genreIds.length} genre(s)`);
/**
 * ⚠️ **A single-genre rerun writes the batch's own shard name.** With `--shard` unset it defaults to `0/1`, so
 * `--only <genre>` writes `manifest-0.json` — the very file a full first shard leaves behind. Measured 2026-10-10: a
 * six-genre repair loop silently replaced a 53-clip shard with one clip. Nothing was lost (the MP3s and the committed
 * manifest both survived), but the parts layer is exactly what a merge trusts, so the trap gets a warning rather than a note.
 */
if (ONLY && !args.includes("--out")) {
  console.log(`   ⚠ --only without --out writes ${PART}, the same name a full shard uses; pass --out <dir> to keep them apart`);
}
if (MERGE) {
  /**
   * ⭐ **One writer for the committed manifest.** Each shard leaves its part in the (untracked) output directory; merging is a
   * separate act so a half-finished batch can never replace the shipped list — the same rule the empty-run guard enforces.
   */
  const parts = readdirSync(OUT).filter((name) => /^manifest-\d+\.json$/.test(name));
  const fromParts = parts.flatMap((name) => JSON.parse(readFileSync(`${OUT}/${name}`, "utf8")).clips ?? []);
  /** ⭐ The manifest may only name files that are actually in the output directory. */
  const merged = fromParts.filter((clip) => {
    const present = existsSync(`${OUT}/${clip.url}`);
    if (!present) console.error(`merge: ${clip.genreId} names ${clip.url}, which is not in ${OUT}/ — left out`);
    return present;
  });
  if (merged.length === 0) {
    console.error(`no shard manifests in ${OUT}/; nothing to merge`);
    process.exit(1);
  }
  writeFileSync("public/genre-clips.json", JSON.stringify({ bars: 8, clips: merged.map((clip) => ({ ...clip, url: withBase(clip.url) })) }, null, 2) + "\n");
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
  const remembered = Number(barsCache[genreId] ?? 0);
  const firstGuess = remembered > 0 ? remembered : Number(flag("bars", 6));
  if (remembered > 0) console.log(`   using the remembered ${remembered} repeat(s) for ${genreId}`);
  let banner = asObject(await callTool("render_arrangement", { arrangementId, format: FORMAT, bitrateKbps: 192, bars: firstGuess, ...(flag("sample-rate", undefined) ? { sampleRate: Number(flag("sample-rate")) } : {}), ...(flag("channels", undefined) ? { channels: Number(flag("channels")) } : {}) }));
  let passes = Number(banner.passes ?? flag("bars", 6)) || 1;
  /**
   * ⭐ **Ask the artifact, not the reply.** Measured 2026-10-10: a reply for `chicago-house` printed
   * `bars=8 passes=6 totalSteps=128 durationSec=96.6` — a real number — while the *range check* had seen `undefined` and so
   * fell back to "six repeats", which is how one clip came out **96.6 seconds** long and another recorded **0**. The reply
   * names its own file (`path`), so the length can be read from the artifact before deciding anything; the reply's number is
   * only the fallback. This is the same rule the manifest already follows ("the file is the ground truth for its own length"),
   * applied one step earlier, where it changes the decision instead of only the record.
   */
  const measuredReply = (() => {
    const at = typeof banner.path === "string" ? banner.path : "";
    if (!at || !existsSync(at)) return 0;
    const out = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", at], { encoding: "utf8" });
    return Number(String(out.stdout ?? "").trim()) || 0;
  })();
  const truth = measuredReply > 0 ? measuredReply : Number(banner.durationSec ?? 0);
  if (!IN_RANGE(truth)) {
    const one = truth / passes;
    const wanted = one > 0 ? Math.max(1, Math.round(TARGET_SECONDS / one)) : passes;
    console.log(`   ${truth}s (measured ${measuredReply > 0 ? "from the artifact" : "from the reply"}) is outside 15–30s; asking for ${wanted} repeat(s) instead`);
    banner = asObject(await callTool("render_arrangement", { arrangementId, format: FORMAT, bitrateKbps: 192, bars: wanted, ...(flag("sample-rate", undefined) ? { sampleRate: Number(flag("sample-rate")) } : {}), ...(flag("channels", undefined) ? { channels: Number(flag("channels")) } : {}) }));
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
  /** ⭐ Record what worked, so the next batch pays for one render per clip rather than two. */
  barsCache[genreId] = passes;
  writeFileSync(BARS_CACHE, JSON.stringify(barsCache, null, 2) + "\n");
  const clipWarnings = [];
  if (skipped.length > 0) {
    clipWarnings.push({ code: "skipped-lanes", detail: `${skipped.length} lane(s) had nothing to resolve and are not in the clip` });
  }
  const recorded = tracks.filter((track) => track?.sound?.source === "catalogue-asset").length;
  if (recorded === 0) {
    clipWarnings.push({ code: "no-recordings", detail: "no lane in this clip sounds through a real recording — the owner's requirement is that a clip carries its genre's own instruments" });
  }
  /** ⭐ Measured, not merely reported: the range check moves below, after the file has been read (see the ffprobe step). */
  let seconds = Number(banner.durationSec ?? 0);
  const file = banner.file ?? banner.output ?? banner.path ?? banner.outputPath ?? banner.writtenTo;
  let bytes;
  let copied;
  if (typeof file === "string" && existsSync(file)) {
    const wav = `${OUT}/${genreId}.wav`;
    copyFileSync(file, wav);
    const mp3 = `${OUT}/${genreId}.mp3`;
    const encoded = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", wav, "-codec:a", "libmp3lame", "-b:a", "192k", mp3], { stdio: ["ignore", "ignore", "pipe"] });
    if (encoded.status === 0 && existsSync(mp3)) {
      bytes = statSync(mp3).size;
      copied = mp3;
      if (!KEEP_WAV) rmSync(wav, { force: true });
    } else {
      // ⚠ A missing ffmpeg must not lose the clip: the WAV is a real, playable result, and the manifest says which it is.
      bytes = statSync(wav).size;
      copied = wav;
      clipWarnings.push({ code: "ffmpeg-failed", detail: `ffmpeg could not encode the MP3 (${String(encoded.stderr ?? "").slice(0, 120)}); the WAV was kept` });
    }
  }
  /**
   * ⭐ **No duration, no clip either.** The first batch wrote `seconds: 0` for a render whose reply carried no `durationSec`
   * — and the app's reader rejects a clip whose length is not positive, so that entry could never have been shown; it only
   * ever existed to be wrong. A render that cannot say how long the audio is, is a render that failed.
   */
  if (!(Number(banner.durationSec) > 0)) {
    console.error(`${genreId}: the render reported durationSec=${String(banner.durationSec)} — skipped, nothing written`);
    continue;
  }

  /**
   * ⭐ **No file, no clip.** A render whose reply carried no `durationSec` (the logs said `undefineds is outside 15–30s`) is a
   * render whose result cannot be trusted, and appending it anyway is how a list comes to name audio that does not exist —
   * the one failure this whole pipeline is built to avoid. The file is the evidence.
   */
  const produced = copied && existsSync(copied) && statSync(copied).size > 0 ? copied : undefined;
  /**
   * ⭐ **A file is not a sound.** The previous guard proves bytes exist; this one proves the audio is actually there, because
   * a failed render can leave a perfectly sized file of digital silence (measured earlier: thirteen bands at −120 dB, which
   * `analyze_audio` can see but **only for WAV** — its own description says "there is no MP3 decoder here"). ffmpeg reads
   * both, so it is the check this batch uses, and its reading goes into the manifest as a warning rather than being thrown
   * away.
   */
  let peakDb;
  if (produced) {
    const probe = spawnSync("ffmpeg", ["-hide_banner", "-i", produced, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" });
    const found = String(probe.stderr ?? "").match(/max_volume:\s*(-?[\d.]+) dB/);
    peakDb = found ? Number(found[1]) : undefined;
    /**
     * ⭐ **The file is the ground truth for its own length.** The render reply left `durationSec` undefined for some genres
     * (the logs said `undefineds is outside 15–30s`), which produced a 0-second entry and a fallback to six repeats; asking
     * the file removes that whole class of lie, and it costs one ffprobe.
     */
    const probed = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", produced], { encoding: "utf8" });
    const measured = Number(String(probed.stdout ?? "").trim());
    if (measured > 0) {
      seconds = measured;
    } else {
      clipWarnings.push({ code: "duration-unmeasured", detail: "the clip's real length could not be measured, so the render's own number stands" });
    }
    if (!(seconds >= 15 && seconds <= 30)) {
      clipWarnings.push({ code: "length-out-of-range", detail: `${seconds.toFixed(1)}s is outside the owner's 15–30s window` });
    }
    if (peakDb === undefined || !(peakDb > -60)) {
      clipWarnings.push({
        code: "silent-clip",
        detail: `the clip's peak measures ${peakDb === undefined ? "unmeasurable" : `${peakDb} dB`}, so it may carry no sound`,
      });
    }
  }
  if (!produced) {
    console.error(`${genreId}: the render produced no file (durationSec=${String(banner.durationSec)}) — skipped, nothing written`);
    continue;
  }
  clips.push({
    genreId,
    /**
     * ⭐ **The manifest names the file that is actually delivered.** It used to name `${FORMAT}`, which meant a batch that
     * rendered WAV and then encoded MP3 recorded `.wav` — the intermediate — and the merge could no longer find any of them
     * (measured 2026-10-10: all 159 clips "left out" for naming files that had already been rewritten to MP3). The pipeline's
     * whole point is that the list and the files agree.
     */
    url: withBase(`${genreId}.${produced.endsWith(".wav") ? "wav" : "mp3"}`),
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
