#!/usr/bin/env node
/**
 * Render a genre to a WAV file, so a **musical** decision can be auditioned rather than inferred.
 *
 * Every measurement in this repository says what a change did to a number; none of them says whether it sounds
 * right, and the audio-review workflow (`agy -p "@/tmp/x.mp3 分析下"`) needs a file to listen to. The app can export
 * — a user clicks a button — but nothing on the command line could, so a change like "widen the pad and lead to fix
 * the near-mono claim" could only be argued from correlation figures. This closes that gap.
 *
 * It renders through the **app's own** offline path and encoder (`renderPatternOffline` →
 * `encodeAudioBufferToWav`), because an audition of a different renderer is an audition of a different mix.
 *
 * Usage:
 *   node scripts/render_genre_wav.mjs --genre=chicago-house [--bars=2] [--out=/tmp/chicago-house.wav]
 *                                     [--port=5350] [--seamless-loop]
 *
 * The dev server is used rather than `dist/` for the same reason the analyser does: the point is to hear the tree
 * under the cursor, including a change that has not been built.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const playwright = require("playwright");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const arg = (name, fallback = "") => {
  const inline = process.argv.find((a) => a.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const at = process.argv.indexOf(name);
  return at !== -1 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
};

const genre = arg("--genre");
if (!genre) {
  console.error("usage: node scripts/render_genre_wav.mjs --genre=<id> [--bars=2] [--out=path.wav] [--seamless-loop]");
  process.exit(2);
}
const bars = Math.max(1, Number(arg("--bars", "2")) || 2);
const out = path.resolve(arg("--out", `/tmp/${genre}.wav`));
const port = Number(arg("--port", "5350")) || 5350;
const seamlessLoop = process.argv.includes("--seamless-loop");
/**
 * Render with the GS-1 pool switched off, which is how a routed instrument's **native fallback** is auditioned.
 *
 * Needed for exactly the question that came up: "did the texture lane play its recording, or the native preset?"
 * Listening cannot tell you (the two are different sounds, but which one you heard is a guess unless you have the
 * other); rendering both can.
 */
const noGs1 = process.argv.includes("--no-gs1");
/**
 * Render **one lane**, by `track_id` (`--stem=hihat`).
 *
 * The exporter's own stem option, which is how "check every track of this genre" gets done: eight files that can be
 * listened to one at a time instead of one file that has to be argued about as a whole.
 */
const stemRole = arg("--stem", "");
/**
 * Solo one lane, the way the app's S button does (`--solo=lead`).
 *
 * The bug this reproduces: solo a lane, export stems, and the soloed lane's stem contained a single note. The mixer
 * state is what the exporter gates on, so setting it here is the same input the app gives it.
 */
const soloRole = arg("--solo", "");
/**
 * Override one GS-1 parameter on **every** patch, for an A/B without a build (`--gs1-param=13=0`).
 *
 * Which parameters matter is a question about the *voice*, and a rebuild per guess would make each answer cost a minute
 * and a deployed artefact. The patch table is a plain object in the page, so the probe can edit it before rendering.
 */
const gs1Param = arg("--gs1-param", "");
/** Render the authored skeleton instead of the shipping pattern (see the note at the call site). */
const raw = process.argv.includes("--raw");
/**
 * Which engine to render in: `chromium` (default), `webkit` or `firefox`.
 *
 * Safari is the reason this exists. A report that a genre's lead track sounds wrong on Safari (desktop *and* phone)
 * while Chrome is fine cannot be investigated from a Chromium-only tool — the difference between the engines is the
 * subject, not the noise. All three are installed for the e2e matrix, so the same render can be taken twice and
 * compared byte for byte, which is the only way to tell "the browser sounds different" from "the mix is different".
 */
const browserName = (arg("--browser", "chromium") || "chromium").toLowerCase();

const waitForServer = (url, timeoutMs = 30000) =>
  new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      http
        .get(url, (res) => {
          res.resume();
          resolve();
        })
        .on("error", () => {
          if (Date.now() - started > timeoutMs) reject(new Error(`dev server never came up on ${url}`));
          else setTimeout(tick, 250);
        });
    };
    tick();
  });

const viteBin = path.join(ROOT, "node_modules", "vite", "bin", "vite.js");
const server = spawn(process.execPath, [viteBin, "--port", String(port), "--strictPort"], {
  cwd: ROOT,
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (chunk) => {
  serverLog += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  serverLog += chunk.toString();
});

let exitCode = 0;
try {
  const url = `http://127.0.0.1:${port}/`;
  await waitForServer(url);
  const engine = playwright[browserName];
  if (!engine) throw new Error(`unknown browser ${browserName} (chromium | webkit | firefox)`);
  const browser = await engine.launch({ args: browserName === "chromium" ? ["--no-sandbox"] : [] });
  const page = await browser.newPage();
  page.on("pageerror", (error) => console.error("[page]", error.message));
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

  const result = await page.evaluate(
    async ({ genreId, bars, seamlessLoop, noGs1, stemRole, soloRole, gs1Param, raw }) => {
      const [genres, wav, mix, trackStates, gs1Tracks] = await Promise.all([
        import("/src/data/genres/index.ts"),
        import("/src/audio/WavExporter.ts"),
        import("/src/data/genreMix.ts"),
        // The same derivation the engine uses, so the audition honours mute/solo/volume/pan instead of rendering
        // everything at the table's defaults.
        import("/src/audio/trackStates.ts"),
        import("/src/audio/gs1/gs1Tracks.ts"),
      ]);
      if (noGs1) gs1Tracks.setGs1RoutingEnabled(false);
      if (gs1Param) {
        const [rawId, rawValue] = String(gs1Param).split("=");
        const patches = await import("/src/data/gs1Patches.ts");
        const id = Number(rawId);
        const value = Number(rawValue);
        if (!Number.isFinite(id) || !Number.isFinite(value)) return { error: `bad --gs1-param ${gs1Param}` };
        for (const patch of Object.values(patches.GS1_PATCHES)) patch[id] = value;
      }
      const entry = genres.ALL_GENRES.find((g) => g.id === genreId);
      if (!entry) return { error: `unknown genre ${genreId}` };
      /**
       * The **shipping** pattern, not the authored skeleton.
       *
       * `patternFromGenre` is what the app plays: it applies the mix defaults, writes the genre's chords as real
       * note stacks, grows the pattern to the progression's length and runs the humanisation/texture passes. The
       * first version of this tool rendered `entry.sequencer_pattern` — the raw data — so a review of "the genre"
       * was a review of a pattern nobody hears: it reported "mechanical, no accents or ghosts" for a lane whose
       * ghosts the humanisation pass adds. `--raw` renders the skeleton, for when that is what is being asked.
       */
      const pattern = raw ? entry.sequencer_pattern : mix.patternFromGenre(entry);
      const stemIndex = stemRole
        ? pattern.tracks.findIndex((track) => track.track_id === stemRole)
        : undefined;
      if (stemRole && (stemIndex === undefined || stemIndex < 0)) {
        return { error: `no track with track_id ${stemRole}` };
      }
      const mixerStates = trackStates.deriveTrackStates(pattern);
      if (soloRole) {
        const soloIndex = pattern.tracks.findIndex((track) => track.track_id === soloRole);
        if (soloIndex < 0) return { error: `no track with track_id ${soloRole}` };
        mixerStates[soloIndex] = { ...mixerStates[soloIndex], solo: true };
      }
      const buffer = await wav.renderPatternOffline(pattern, {
        bars,
        seamlessLoop,
        trackStates: mixerStates,
        ...(stemIndex === undefined ? {} : { stemTrackIdx: stemIndex }),
      });
      const bytes = new Uint8Array(wav.encodeAudioBufferToWav(buffer));
      /**
       * Base64 in chunks, and the chunk is 32 KB rather than 1 MB: `String.fromCharCode.apply` passes every byte as
       * an argument, so a megabyte overflows the call stack (`RangeError: Maximum call stack size exceeded`).
       */
      const chunk = 1 << 15;
      const parts = [];
      for (let i = 0; i < bytes.length; i += chunk) {
        parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunk)));
      }
      const binary = parts.join("");
      return {
        base64: btoa(binary),
        seconds: Number(buffer.duration.toFixed(2)),
        frames: buffer.length,
        sampleRate: buffer.sampleRate,
        channels: buffer.numberOfChannels,
        limiterKind: null,
        bpm: pattern.bpm,
        tracks: pattern.tracks.length,
        // The resolved table is already the track map (`ResolvedGenreMix = Record<MixTrackId, TrackMix>`).
        mix: mix.GENRE_MIX_RESOLVED[genreId]
          ? Object.fromEntries(
              Object.entries(mix.GENRE_MIX_RESOLVED[genreId]).map(([id, t]) => [id, Number(t.pan.toFixed(3))])
            )
          : null,
      };
    },
    { genreId: genre, bars, seamlessLoop, noGs1, stemRole, soloRole, gs1Param, raw }
  );

  await browser.close();

  if (result.error) throw new Error(result.error);
  const bytes = Buffer.from(result.base64, "base64");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, bytes);
  const peak = (() => {
    // A cheap sanity check on the encoded file: the header must be RIFF/WAVE and the size must match.
    const riff = bytes.subarray(0, 4).toString("ascii");
    const wave = bytes.subarray(8, 12).toString("ascii");
    return `${riff}/${wave}`;
  })();
  console.log(
    `✅ ${genre}: ${result.seconds}s, ${result.channels}ch @ ${result.sampleRate} Hz, ${result.tracks} tracks, ` +
      `${(bytes.length / 1048576).toFixed(2)} MB -> ${out} (${peak})`
  );
  console.log(`   pans: ${JSON.stringify(result.mix)}`);
} catch (error) {
  console.error(`❌ ${error.message}`);
  if (serverLog) console.error(serverLog.split("\n").slice(-6).join("\n"));
  exitCode = 1;
} finally {
  server.kill("SIGTERM");
}
process.exit(exitCode);
