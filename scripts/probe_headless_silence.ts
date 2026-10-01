/**
 * Hunt the intermittent whole-render silence in the Node host, without a browser anywhere.
 *
 * `docs/HEADLESS_CORE_PLAN.md` records a blocking defect: the Node host intermittently returns a render of
 * silence. That is the first thing to fix before any parity tolerance is worth arguing about, and it is a defect
 * of the **headless host alone** — the browser side of `probe_headless_parity.ts` exists only to compare against,
 * so hunting this through the full parity probe would mean paying for a browser, a server and four renders per
 * attempt to learn one bit. This renders the same fixture in the Node host repeatedly and reports, per attempt,
 * the frame count and the peak, so silence shows up as what it is.
 *
 * Silence is judged on the returned buffer, not on a symptom: `OfflineAudioContext.startRendering()` has no
 * progress callback, and a render that returns zeros looks exactly like a render that worked until you read it.
 * Both a full silence (peak 0) and a partial one (a peak far below its siblings) are reported, because "all the
 * frames are zero" and "the tail is zero" are different defects.
 *
 * Run:
 *   npx vite-node scripts/probe_headless_silence.ts --runs 20
 *
 * **Optional dependency, like the parity probe.** Without `node-web-audio-api` it prints SKIP and exits 0, so a
 * checkout that has not installed it is not a red gate — see the cost rule in the plan.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PUBLIC = path.join(ROOT, "public");
const require = createRequire(import.meta.url);

let wa: any;
try {
  wa = require("node-web-audio-api");
} catch {
  console.log(
    "SKIP  headless silence probe skipped: `node-web-audio-api` is not installed.\n" +
      "   install it to run this probe:  npm i -D node-web-audio-api"
  );
  process.exit(0);
}

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const runs = Math.max(1, Number(arg("runs", "20")) || 20);
const bars = Math.max(1, Number(arg("bars", "1")) || 1);
const rate = Number(arg("rate", "44100")) || 44100;
const channels = Number(arg("channels", "2")) === 1 ? 1 : 2;
const steps = bars * 16;

/** The same fixture the parity probe uses, so a silence here is the same event seen from closer. */
const pattern = {
  genre_id: "chicago-house",
  bpm: 120,
  swing: 0,
  scale: "C minor",
  totalSteps: steps,
  tracks: [
    {
      track_id: "kick",
      name: "Kick",
      instrument: "drum",
      steps: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      velocity: new Array(steps).fill(110),
      pitch: new Array(steps).fill(0),
      gate: new Array(steps).fill(0.8),
      volume: 0.9,
      pan: 0,
      mute: false,
      solo: false,
    },
    {
      track_id: "bass",
      name: "Bass",
      instrument: "bass",
      steps: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
      velocity: new Array(steps).fill(95),
      pitch: [36, 36, 36, 36, 38, 38, 38, 38, 36, 36, 36, 36, 41, 41, 41, 41],
      gate: new Array(steps).fill(0.7),
      volume: 0.85,
      pan: 0,
      mute: false,
      solo: false,
    },
    {
      track_id: "chords",
      name: "Chords",
      instrument: "synth",
      steps: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      velocity: new Array(steps).fill(80),
      pitch: [60, 63, 67, 60, 60, 63, 67, 60, 62, 65, 69, 62, 62, 65, 69, 62],
      gate: new Array(steps).fill(0.9),
      volume: 0.7,
      pan: 0,
      mute: false,
      solo: false,
    },
  ],
};

/** Peak, RMS, and how many samples are exactly zero — three views of the same silence. */
function inspect(buffer: any): { frames: number; peak: number; rms: number; zeroRatio: number } {
  const frames = buffer.length;
  const count = buffer.numberOfChannels;
  let peak = 0;
  let sumSq = 0;
  let zeros = 0;
  let total = 0;
  for (let c = 0; c < count; c += 1) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i += 1) {
      const v = data[i];
      const a = v < 0 ? -v : v;
      if (a > peak) peak = a;
      sumSq += v * v;
      if (v === 0) zeros += 1;
      total += 1;
    }
  }
  return { frames, peak, rms: Math.sqrt(sumSq / Math.max(1, total)), zeroRatio: zeros / Math.max(1, total) };
}

/** What the probe's `renderHeadless` does, kept in step with it deliberately: same shims, same entry point. */
function installHost(): void {
  const RealOAC = wa.OfflineAudioContext;
  function HostOfflineAudioContext(this: unknown, c: number, f: number, r: number) {
    const ctx = new RealOAC(c, f, r);
    const aw = ctx.audioWorklet;
    const orig = aw.addModule.bind(aw);
    aw.addModule = (u: string) => orig(u.startsWith("/") ? path.join(PUBLIC, u) : u);
    return ctx;
  }
  (globalThis as any).OfflineAudioContext = HostOfflineAudioContext;
  (globalThis as any).AudioWorkletNode = wa.AudioWorkletNode;
  (globalThis as any).AudioWorkletProcessor = wa.AudioWorkletProcessor;
  (globalThis as any).BaseAudioContext = wa.BaseAudioContext;
  const origFetch = globalThis.fetch;
  (globalThis as any).fetch = async (url: unknown, init?: unknown) => {
    const u = String(url);
    if (u.startsWith("/")) {
      const b = readFileSync(path.join(PUBLIC, u));
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
      };
    }
    return (origFetch as any)(url, init);
  };
}

installHost();

const wav: any = await import("../src/audio/WavExporter.ts");
const gs1: any = await import("../src/audio/gs1/gs1Tracks.ts");
gs1.setGs1RoutingEnabled(true);

console.log(`headless silence probe: ${runs} render(s), ${bars} bar(s), ${rate} Hz, ${channels} ch\n`);

const results: Array<{ run: number; frames: number; peak: number; rms: number; zeroRatio: number; ms: number }> = [];
for (let run = 1; run <= runs; run += 1) {
  const started = Date.now();
  const buffer = await wav.renderPatternOffline(pattern, { bars, sampleRate: rate, channels });
  const info = inspect(buffer);
  results.push({ run, ...info, ms: Date.now() - started });
  console.log(
    `  run ${String(run).padStart(3)}  frames=${String(info.frames).padStart(7)}  peak=${info.peak.toFixed(6)}  ` +
      `rms=${info.rms.toFixed(6)}  zero=${(info.zeroRatio * 100).toFixed(1)}%  ${Date.now() - started} ms`
  );
}

/**
 * The judgement. A full silence is a peak of exactly zero; a partial one is a peak far below the others. Both are
 * named, because they point at different code, and the threshold for "far below" is relative so it does not
 * depend on this fixture's absolute level.
 */
const silent = results.filter((r) => r.peak === 0);
const quietest = results.reduce((min, r) => (r.peak < min.peak ? r : min), results[0]!);
const loudest = results.reduce((max, r) => (r.peak > max.peak ? r : max), results[0]!);
const partial = results.filter((r) => r.peak > 0 && r.peak < loudest.peak * 0.5);

console.log("");
console.log(`  full silences:    ${silent.length} / ${runs}${silent.length ? ` — runs ${silent.map((r) => r.run).join(", ")}` : ""}`);
console.log(`  partial (peak < half the loudest): ${partial.length} / ${runs}${partial.length ? ` — runs ${partial.map((r) => r.run).join(", ")}` : ""}`);
console.log(`  peak range:       ${quietest.peak.toFixed(6)} … ${loudest.peak.toFixed(6)} (run ${quietest.run} … ${loudest.run})`);

if (silent.length > 0 || partial.length > 0) {
  console.log("\nREPRODUCED  the Node host returned a silent or short render.");
  process.exit(1);
}
console.log(`\nNOT REPRODUCED  ${runs} render(s), every one with a real signal.`);
