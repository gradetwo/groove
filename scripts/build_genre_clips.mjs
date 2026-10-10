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
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";

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
const ONLY = flag("only", undefined);
const ALL = args.includes("--all");
const RECIPE_VERSION = "1";

/** ⭐ `callTool` answers with the reply already parsed when it is JSON, and with text when it is not: accept both. */
const asObject = (value) => {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return {};
  }
};

const genreIds = ALL
  ? (await callTool("list_genres", {})).match(/"?id"?\s*[:=]\s*"([a-z0-9-]+)"/g)?.map((m) => m.split('"')[3] ?? m.replace(/.*"([a-z0-9-]+)"$/, "$1")) ?? []
  : [ONLY].filter(Boolean);
if (genreIds.length === 0) {
  console.error("nothing to do: pass --only <genreId> or --all");
  process.exit(2);
}

mkdirSync(OUT, { recursive: true });
const version = JSON.parse(readFileSync("public/version.json", "utf8")).version;
const clips = [];
for (const genreId of genreIds) {
  const started = Date.now();
  const created = asObject(await callTool("create_arrangement", { genreId }));
  const arrangementId = created.arrangementId ?? created.id ?? undefined;
  if (!arrangementId) {
    console.error(`${genreId}: could not create an arrangement: ${created.slice(0, 120)}`);
    continue;
  }
  const described = asObject(await callTool("describe_arrangement", { arrangementId, format: "json" }));
  const banner = asObject(await callTool("render_arrangement", { arrangementId, format: "mp3", outputDir: OUT, filename: `${genreId}.mp3` }));
  const file = banner.file ?? banner.output ?? banner.path ?? undefined;
  const bytes = file && existsSync(file) ? statSync(file).size : undefined;
  const tracks = Array.isArray(described.tracks) ? described.tracks : [];
  clips.push({
    genreId,
    url: `${genreId}.mp3`,
    seconds: Number(banner.durationSeconds ?? banner.seconds ?? 0) || 0,
    ...(bytes === undefined ? {} : { bytes }),
    ...(typeof banner.lufs === "number" ? { lufs: banner.lufs } : {}),
    engineVersion: version,
    recipeVersion: RECIPE_VERSION,
    generatedAt: new Date().toISOString().slice(0, 10),
    recordedLanes: tracks.filter((track) => track?.sample?.assetId || /:[a-z0-9-]+$/.test(String(track?.sound?.detail ?? ""))).length,
    synthLanes: tracks.filter((track) => track?.kind === "synth").length,
  });
  console.log(`${genreId}: ${((Date.now() - started) / 1000).toFixed(1)}s, ${bytes ?? "?"} bytes, ${clips.at(-1).recordedLanes}/${tracks.length} lanes with a recording`);
}
writeFileSync("public/genre-clips.json", JSON.stringify({ bars: 8, clips }, null, 2) + "\n");
console.log(`wrote public/genre-clips.json with ${clips.length} clip(s); MP3s are in ${OUT}/ (not in git)`);
process.exit(0);
