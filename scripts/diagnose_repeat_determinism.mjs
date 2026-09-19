#!/usr/bin/env node
/**
 * Why do two repeats of the *same* genre render differ, when the renderer is seeded?
 *
 *   node scripts/diagnose_repeat_determinism.mjs [genreId] [repeats]
 *
 * ## What this found (kept so the next run does not have to rediscover it)
 *
 * Measured on `chicago-house`, 3 repeats in one page, hashing the raw float samples:
 *
 *   repeat 0: sampleHash=fde40084  rmsDb=-9.503720
 *   repeat 1: sampleHash=4763563d  rmsDb=-9.503711
 *   repeat 2: sampleHash=0f01baf5  rmsDb=-9.467722   -> 3 distinct hashes
 *
 * So the **audio itself really differs**; it is not the fingerprint amplifying float noise in a
 * quiet band. The shape of the difference is what makes it interpretable: overall RMS differs by
 * 0.036 dB, bands 6-10 (roughly 500 Hz - 4 kHz) differ by 0.6-1.3 dB, and the *loudest* bands 0-4
 * differ by only 0.02-0.04 dB. A gain difference would move every band by the same number of dB, so
 * this is a **midrange content** change, not a level change.
 *
 * ## Ruled out by measurement, not by reading code
 *
 *  - **per-track**: all eight tracks rendered alone (others zeroed) are UNSTABLE, so no single voice
 *    is responsible;
 *  - **per-stage**: dry (`sendA=sendB=0`), reverb-only and delay-only are all UNSTABLE, so no send
 *    bus is responsible;
 *  - **probability**: neither probed genre has any `probability` array, and the exporter rolls it
 *    from `probabilityPasses()` with a seed derived from `genre_id|bpm|totalSteps`;
 *  - **reverb IR randomness**: `ReverbBus` uses fixed constant seeds and `noise.ts` is a pure LCG;
 *  - **limiter worklet race**: `WavExporter` awaits `graph.limiter.ready` before `startRendering()`.
 *
 * That leaves the master chain every dry render still passes through (master limiter / master
 * saturator / channel strips) or module-level state. The smallest next experiment is to bypass the
 * limiter and re-run: stable means the limiter, still unstable means look at the saturator and the
 * module-level caches.
 *
 * ## Why it matters
 *
 * "Exporting the same project twice gives the same file" is one of this project's central claims,
 * and both audio gates' threshold justifications rest on the repeat noise floor being ~0
 * (`check_timbre_spread.mjs` cites 0.000014 dB). The pre-existing baseline recorded 1.317172 dB for
 * this genre and the post-per-hit-variation one 1.317833 dB, so this predates the drum work and is
 * not a measurement artifact of it.
 */
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const ROOT = process.cwd();

const genreId = process.argv[2] ?? "chicago-house";
const repeats = Math.max(2, Number(process.argv[3] ?? 4) || 4);
const port = 3161;

function startDevServer() {
  return new Promise((resolve, reject) => {
    const viteBin = path.join(ROOT, "node_modules/vite/bin/vite.js");
    const child = spawn(process.execPath, [viteBin, "--port", String(port), "--strictPort"], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const onData = (chunk) => {
      output += chunk.toString();
      if (/Local:\s+http/.test(output) || /ready in/.test(output)) resolve(child);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => reject(new Error(`vite exited early (${code}):\n${output}`)));
    setTimeout(() => reject(new Error(`vite did not become ready in 60s:\n${output}`)), 60000);
  });
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`dev server never answered at ${url}`);
}

const server = await startDevServer();
const baseUrl = `http://127.0.0.1:${port}`;
await waitForServer(baseUrl);
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage();
page.on("console", (m) => {
  if (m.type() === "error") console.log("   [page error]", m.text());
});
await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });

const result = await page.evaluate(
  async ({ id, n }) => {
    const wav = await import("/src/audio/WavExporter.ts");
    const timbre = await import("/src/test/helpers/timbre.ts");
    const mixModule = await import("/src/data/genreMix.ts");
    const genres = await import("/src/data/genres/index.ts");
    const trackUtils = await import("/src/utils/trackUtils.ts");

    const genre = genres.ALL_GENRES.find((g) => g.id === id);
    if (!genre) throw new Error(`unknown genre: ${id}`);
    const drumKit = trackUtils.getDefaultDrumKitForGenre(genre);

    /** FNV-1a over the raw float bits — equality here means "the audio is the same". */
    const hashChannels = (channels) => {
      let h = 0x811c9dc5;
      const view = new DataView(new ArrayBuffer(4));
      for (const ch of channels) {
        for (let i = 0; i < ch.length; i++) {
          view.setFloat32(0, ch[i]);
          const word = view.getUint32(0);
          for (let b = 0; b < 4; b++) {
            h ^= (word >>> (b * 8)) & 0xff;
            h = Math.imul(h, 0x01000193) >>> 0;
          }
        }
      }
      return h.toString(16).padStart(8, "0");
    };

    const rows = [];
    for (let r = 0; r < n; r++) {
      const buffer = await wav.renderPatternOffline(
        mixModule.applyGenreMixDefaults(genre.sequencer_pattern, genre.id),
        { bars: 3, drumKit, loudnessTrimDb: 0 }
      );
      const channels = [];
      for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
      const fp = timbre.fingerprintChannels(channels, buffer.sampleRate);
      rows.push({
        repeat: r,
        sampleHash: hashChannels(channels),
        bandDb: fp.bandDb,
        rmsDb: fp.rmsDb,
      });
    }

    /**
     * Which track is responsible? Renders each track alone (every other track's steps zeroed) twice
     * and reports whether that pair is stable. A single culprit track turns "the renderer is
     * non-deterministic" into one place to look.
     */
    const base = mixModule.applyGenreMixDefaults(genre.sequencer_pattern, genre.id);
    const soloRows = [];
    for (let trackIdx = 0; trackIdx < base.tracks.length; trackIdx++) {
      const build = () => ({
        ...base,
        tracks: base.tracks.map((t, i) => ({
          ...t,
          steps: i === trackIdx ? t.steps : t.steps.map(() => 0),
        })),
      });
      const hashes = [];
      for (let r = 0; r < 2; r++) {
        const buffer = await wav.renderPatternOffline(build(), {
          bars: 3,
          drumKit,
          loudnessTrimDb: 0,
        });
        const channels = [];
        for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
        hashes.push(hashChannels(channels));
      }
      soloRows.push({
        track: base.tracks[trackIdx].track_id,
        instrument: base.tracks[trackIdx].instrument,
        stable: hashes[0] === hashes[1],
        hashes,
      });
    }

    /**
     * Which *stage* is responsible? Every track showed the instability in isolation, so the cause is
     * in the chain every track shares. These configurations remove one shared stage at a time by
     * zeroing the per-track sends; whichever one restores bit-stability names the culprit bus.
     */
    const stageRows = [];
    const stages = [
      ["all sends on (baseline)", () => base],
      [
        "no sends (dry)",
        () => ({
          ...base,
          tracks: base.tracks.map((t) => ({ ...t, sendA: 0, sendB: 0 })),
        }),
      ],
      [
        "reverb send only",
        () => ({
          ...base,
          tracks: base.tracks.map((t) => ({ ...t, sendA: t.sendA ?? 0, sendB: 0 })),
        }),
      ],
      [
        "delay send only",
        () => ({
          ...base,
          tracks: base.tracks.map((t) => ({ ...t, sendA: 0, sendB: t.sendB ?? 0 })),
        }),
      ],
    ];
    for (const [label, build] of stages) {
      const hashes = [];
      for (let r = 0; r < 2; r++) {
        const buffer = await wav.renderPatternOffline(build(), {
          bars: 3,
          drumKit,
          loudnessTrimDb: 0,
        });
        const channels = [];
        for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
        hashes.push(hashChannels(channels));
      }
      stageRows.push({ label, stable: hashes[0] === hashes[1], hashes });
    }

    return { rows, soloRows, stageRows };
  },
  { id: genreId, n: repeats }
);

await browser.close();
server.kill();

console.log(`\n=== ${genreId}: ${repeats} repeats in one page ===\n`);
const out = result.rows;
const distinctHashes = new Set(out.map((r) => r.sampleHash));
for (const r of out) {
  console.log(`  repeat ${r.repeat}: sampleHash=${r.sampleHash}  rmsDb=${r.rmsDb.toFixed(6)}`);
}
console.log(
  `\n  distinct sample hashes : ${distinctHashes.size} / ${out.length}` +
    (distinctHashes.size === 1
      ? "   -> the AUDIO is bit-identical; the band delta is a fingerprint artifact"
      : "   -> the AUDIO really differs; something is non-deterministic in the render")
);
console.log(`\n  per-repeat bandDb (dB) for the bands that move:`);
for (let k = 0; k < out[0].bandDb.length; k++) {
  const values = out.map((r) => r.bandDb[k]);
  const spread = Math.max(...values) - Math.min(...values);
  if (spread > 1e-9) {
    console.log(
      `   band ${String(k).padStart(2)}  ${values.map((v) => v.toFixed(6).padStart(11)).join("  ")}   spread ${spread.toFixed(6)}`
    );
  }
}
console.log(`\n  per-track isolation (two renders each, other tracks zeroed):`);
for (const s of result.soloRows) {
  console.log(
    `   ${s.track.padEnd(11)} ${String(s.instrument).padEnd(16)} ${s.stable ? "stable" : "UNSTABLE  <-- this track is the cause"}`
  );
}
console.log(`\n  per-stage isolation (two renders each, one shared stage removed at a time):`);
for (const s of result.stageRows) {
  console.log(`   ${s.label.padEnd(24)} ${s.stable ? "stable" : "UNSTABLE  <-- this stage is the cause"}`);
}
console.log();
