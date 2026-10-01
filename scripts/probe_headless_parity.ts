#!/usr/bin/env node
/**
 * Headless-core parity probe: is a Node Web Audio host the same sound as the browser?
 *
 * ## Why this exists
 *
 * `docs/Z2_ADJUDICATION.md` marked "Phase 0 headless core" ⛔ on one argument, written in
 * `mcp/render/worker.ts`: a renderer rewritten in Node would be a second sound. That is true of a
 * *rewrite*. It is not true of running the same `renderPatternOffline`, the same worklets and the
 * same vendored GS-1 WASM under a different Web Audio host — which is what this probe measures.
 *
 * The claim "one sound" is not a flag here, it is four renders and four of the project's own metrics:
 *
 *   browser  with GS-1 routing ON   ─┐
 *   browser  with GS-1 routing OFF  ─┤ one Vite + Chromium page, four `renderPatternOffline` calls
 *   headless with GS-1 routing ON   ─┤
 *   headless with GS-1 routing OFF  ─┘
 *
 * and three assertions:
 *
 *   1. the same voice: `browser ON ≈ headless ON` within tolerance (13-band fingerprint, LUFS, true peak);
 *   2. the same native lanes: `browser OFF ≈ headless OFF` within the same tolerance — a host that
 *      only agreed while GS-1 was absent would pass (1) by accident;
 *   3. GS-1 is actually engaged: `ON − OFF` is far larger than the tolerance *in both hosts*, which is
 *      what forbids a silent fallback from passing as parity. The exporter's own note puts a failed GS-1
 *      host at 0.71 dB in band 6 and 3.66 dB in band 9 — inside a 1 dB band tolerance — so a numeric
 *      tolerance alone cannot catch drift. This third assertion can.
 *
 * ## The tolerance, and why it is this number
 *
 * The browser is not one sound either: `scripts/probe_engine_parity.mjs` measured Chromium and WebKit
 * agreeing on the native lanes to "0.0–0.9 dB rms" while differing wildly on GS-1 (WebKit renders it
 * silent). So ~1 dB per band is this project's existing, measured definition of "two hosts running the
 * same engine", and 0.005 dB — the same-runtime determinism line — is a *within-one-implementation*
 * number that no cross-host comparison can hold. Defaults: 1.0 dB per 13-band fingerprint band,
 * 0.5 dB integrated LUFS, 0.1 dB true peak, with the GS-1 engagement guard at 5 dB (13-band L1).
 *
 * ## Running it
 *
 *     npm i -D node-web-audio-api && npx vite-node scripts/probe_headless_parity.ts
 *     npx vite-node scripts/probe_headless_parity.ts -- --bars=1 --rate=8000 --channels=1 --keep
 *
 * It skips, loudly, when `node-web-audio-api` is not installed, exactly like `sfizzAgreement.test.ts`
 * skips without `sfizz_render`: a probe that fails for a missing optional dependency teaches people to
 * ignore it. The dependency is deliberately *not* declared in `package.json` yet — see
 * `docs/HEADLESS_CORE_PLAN.md`.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");

/* ------------------------------------------------------------------ optional dependency */

const require = createRequire(import.meta.url);
let wa: any = null;
try {
  wa = require("node-web-audio-api");
} catch {
  console.log(
    "SKIP  headless parity probe skipped: `node-web-audio-api` is not installed.\n" +
      "   install it to run this probe:  npm i -D node-web-audio-api\n" +
      "   (deliberately not a declared dependency yet — see docs/HEADLESS_CORE_PLAN.md)"
  );
  process.exit(0);
}

/* ------------------------------------------------------------------ arguments */

const arg = (name: string, fallback: string): string => {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : fallback;
};
const bars = Math.max(1, Number(arg("--bars", "1")) || 1);
const rate = Number(arg("--rate", "44100")) || 44100;
const channels = Number(arg("--channels", "2")) === 1 ? 1 : 2;
const keep = process.argv.includes("--keep");
const TOL_BAND_DB = Number(arg("--tolerance-band-db", "1.0"));
const TOL_LUFS_DB = Number(arg("--tolerance-lufs-db", "0.5"));
const TOL_TRUE_PEAK_DB = Number(arg("--tolerance-true-peak-db", "0.1"));
const GUARD_DB = Number(arg("--gs1-guard-db", "5.0"));
/**
 * Bisect overrides, applied identically to both hosts. The first step of `docs/HEADLESS_CORE_PLAN.md` is to
 * find which stage of the shared graph the host difference lives in; these flags are how that is done without a
 * second build: `--no-bus-comp`, `--no-fx-rack`, `--direct-out` (bypass the master graph entirely).
 */
const overrides: Record<string, unknown> = {
  ...(process.argv.includes("--no-bus-comp") ? { masterBusCompEnabled: false } : {}),
  ...(process.argv.includes("--no-fx-rack") ? { bypassFxRack: true } : {}),
  ...(process.argv.includes("--direct-out") ? { directOut: true } : {}),
};
if (Object.keys(overrides).length > 0) console.log(`bisect overrides: ${JSON.stringify(overrides)}`);

/* ------------------------------------------------------------------ the fixture */

/**
 * One bar, three lanes: two native (kick, bass) and one GS-1-routed (`chords` is in
 * `GS1_ROUTED_ROLES`), so the same render exercises both halves of the engine and the master limiter.
 * A literal pattern — not a genre from the library — so the probe measures the *hosts* and cannot drift
 * when a genre's data changes.
 */
const steps = 16;
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
      instrument: "warm_pad",
      steps: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      velocity: new Array(steps).fill(90),
      pitch: [60, 60, 60, 60, 62, 62, 62, 62, 64, 64, 64, 64, 67, 67, 67, 67],
      gate: new Array(steps).fill(0.9),
      volume: 0.8,
      pan: 0,
      mute: false,
      solo: false,
    },
  ],
};

/* ------------------------------------------------------------------ measurement, one implementation */

const loudness: any = await import("../src/test/helpers/loudness.ts");
const timbre: any = await import("../src/test/helpers/timbre.ts");
const { energyCurveDb } = await import("../mcp/render/worker.ts");

interface Measured {
  truePeakDb: number;
  lufs: number;
  centroidHz: number;
  bandDb: number[];
  energySpreadDb: number;
  frames: number;
  sampleRate: number;
  limiterKind: string;
}

function measure(chans: Float32Array[], sampleRate: number, limiterKind = "?"): Measured {
  const fp = timbre.fingerprintChannels(chans, sampleRate);
  return {
    truePeakDb: loudness.truePeakDbChannels(chans),
    lufs: loudness.measureLoudness(chans, sampleRate).integratedLufs,
    centroidHz: fp.centroidHz,
    bandDb: fp.bandDb,
    energySpreadDb: energyCurveDb(chans, sampleRate).spreadDb,
    frames: chans[0]?.length ?? 0,
    sampleRate,
    limiterKind,
  };
}

/* ------------------------------------------------------------------ headless host */

async function renderHeadless(withGs1: boolean): Promise<Measured> {
  const RealOAC = wa.OfflineAudioContext;
  // Rewrite the app's root-relative worklet asset URLs ("/gs1/workletProcessor.js") to real files.
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
      return { ok: true, status: 200, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
    }
    return (origFetch as any)(url, init);
  };

  const wav: any = await import("../src/audio/WavExporter.ts");
  const gs1: any = await import("../src/audio/gs1/gs1Tracks.ts");
  gs1.setGs1RoutingEnabled(withGs1);
  let limiterKind = "?";
  try {
    const buffer = await wav.renderPatternOffline(pattern, {
      bars,
      sampleRate: rate,
      channels,
      ...overrides,
      onLimiterKind: (kind: string) => {
        limiterKind = kind;
      },
    });
    const chans: Float32Array[] = [];
    for (let c = 0; c < buffer.numberOfChannels; c += 1) chans.push(buffer.getChannelData(c));
    return measure(chans, buffer.sampleRate, limiterKind);
  } finally {
    gs1.setGs1RoutingEnabled(true);
    (globalThis as any).fetch = origFetch;
  }
}

/* ------------------------------------------------------------------ browser host */

async function aFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => (port > 0 ? resolve(port) : reject(new Error("no free port"))));
    });
  });
}

async function renderBrowserBoth(): Promise<{ on: Measured; off: Measured; onRepeat: Measured }> {
  const port = await aFreePort();
  const viteBin = path.join(ROOT, "node_modules", "vite", "bin", "vite.js");
  if (!existsSync(viteBin)) throw new Error(`cannot render in a browser: ${viteBin} not found`);
  const child: ChildProcess = spawn(process.execPath, [viteBin, "--port", String(port), "--strictPort"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const { chromium } = await import("playwright");
  let browser: any = null;
  try {
    await new Promise<void>((resolve, reject) => {
      let output = "";
      const onData = (chunk: Buffer) => {
        output += chunk.toString();
        if (/Local:\s+http/.test(output) || /ready in/.test(output)) resolve();
      };
      child.stdout?.on("data", onData);
      child.stderr?.on("data", onData);
      child.on("exit", (code) => reject(new Error(`vite exited early (${code}):\n${output}`)));
      setTimeout(() => reject(new Error(`vite did not become ready in 60s:\n${output}`)), 60000);
    });
    browser = await chromium.launch({ args: ["--no-sandbox"] });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}`, { waitUntil: "domcontentloaded" });
    /**
     * The page code is a string, not a function literal.
     *
     * `mcp/render/worker.ts` gets away with a function passed to `page.evaluate` because it is bundled by esbuild;
     * this file is run by `vite-node`, whose SSR transform rewrites a dynamic `import()` inside the function body into
     * `__vite_ssr_dynamic_import__` — a symbol that does not exist in the browser (`ReferenceError`, measured). A
     * string expression is never transformed, and the page resolves `/src/...` through the Vite dev server exactly as
     * the worker's does.
     */
    const render = (withGs1: boolean) => {
      const args = JSON.stringify({ pattern, bars, rate, channels, withGs1, overrides });
      const expression = `(async () => {
        const args = ${args};
        const [wav, gs1] = await Promise.all([
          import("/src/audio/WavExporter.ts"),
          import("/src/audio/gs1/gs1Tracks.ts"),
        ]);
        gs1.setGs1RoutingEnabled(args.withGs1);
        let limiterKind = "?";
        const buffer = await wav.renderPatternOffline(args.pattern, {
          bars: args.bars,
          sampleRate: args.rate,
          channels: args.channels,
          ...args.overrides,
          onLimiterKind: (kind) => {
            limiterKind = kind;
          },
        });
        const chans = [];
        for (let c = 0; c < buffer.numberOfChannels; c += 1) chans.push(buffer.getChannelData(c));
        const bytes = new Uint8Array(chans[0].byteLength * chans.length);
        chans.forEach((data, c) => bytes.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), c * data.byteLength));
        let binary = "";
        const chunk = 1 << 15;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
        }
        gs1.setGs1RoutingEnabled(true);
        return { base64: btoa(binary), sampleRate: buffer.sampleRate, channels: buffer.numberOfChannels, limiterKind };
      })()`;
      return page.evaluate(expression);
    };
    const decode = (r: { base64: string; sampleRate: number; channels: number; limiterKind: string }): Measured => {
      const bytes = Buffer.from(r.base64, "base64");
      const chans: Float32Array[] = [];
      const per = bytes.length / r.channels;
      for (let c = 0; c < r.channels; c += 1) {
        const copy = bytes.subarray(c * per, (c + 1) * per);
        chans.push(new Float32Array(copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength)));
      }
      return measure(chans, r.sampleRate, r.limiterKind);
    };
    const on = decode(await render(true));
    const off = decode(await render(false));
    // A second identical ON render: the repo's same-runtime determinism is 0.005 dB, so this is the floor
    // the browser-vs-headless delta must be read against.
    const onRepeat = decode(await render(true));
    return { on, off, onRepeat };
  } finally {
    await browser?.close().catch(() => undefined);
    child.kill("SIGTERM");
  }
}

/* ------------------------------------------------------------------ run */

console.log(`headless-core parity probe — ${bars} bar(s), ${channels}ch @ ${rate} Hz`);
console.log("browser: starting Vite + Chromium …");
const browserResults = await renderBrowserBoth();
console.log("browser: done. headless: rendering …");
const headlessOn = await renderHeadless(true);
const headlessOnRepeat = await renderHeadless(true);
const headlessOff = await renderHeadless(false);

const bandDelta = (a: Measured, b: Measured): { worst: number; band: number } => {
  let worst = 0;
  let band = -1;
  for (let i = 0; i < a.bandDb.length; i += 1) {
    const d = Math.abs(a.bandDb[i] - b.bandDb[i]);
    if (d > worst) {
      worst = d;
      band = i;
    }
  }
  return { worst, band };
};
/**
 * The GS-1 presence metric: the sum of absolute per-band differences, not the worst band.
 *
 * Measured why: on the 8 kHz fixture the worst single band moves only 2.66 dB when GS-1 is switched off, while the
 * change is broad — seven bands move, and the L1 sum is ~10 dB. A worst-band guard would report "GS-1 not engaged"
 * for a render where it plainly is, which is exactly the kind of false failure this project refuses.
 */
const bandL1 = (a: Measured, b: Measured) => a.bandDb.reduce((sum, v, i) => sum + Math.abs(v - b.bandDb[i]), 0);

console.log("\n=== the four renders ===");
const row = (label: string, m: Measured) =>
  console.log(
    `${label.padEnd(22)} frames=${String(m.frames).padStart(7)} truePeak=${m.truePeakDb.toFixed(2).padStart(6)} dB  LUFS=${m.lufs
      .toFixed(2)
      .padStart(6)}  centroid=${m.centroidHz.toFixed(1).padStart(6)} Hz`
  );
row("browser  GS-1 ON", browserResults.on);
row("browser  GS-1 OFF", browserResults.off);
row("headless GS-1 ON", headlessOn);
row("headless GS-1 OFF", headlessOff);
console.log(
  `limiter: browser=${browserResults.on.limiterKind}  headless=${headlessOn.limiterKind}` +
    (browserResults.on.limiterKind === headlessOn.limiterKind
      ? "  (same path)"
      : "  ⚠ different limiter path — the deltas below measure that, not the host DSP")
);

/** Each host against itself: the floor below which a host-to-host delta means nothing. */
const browserSelf = bandDelta(browserResults.on, browserResults.onRepeat);
const headlessSelf = bandDelta(headlessOn, headlessOnRepeat);
console.log(
  `self-determinism (worst band): browser ${browserSelf.worst.toFixed(3)} dB, headless ${headlessSelf.worst.toFixed(3)} dB`
);

const sameVoice = bandDelta(browserResults.on, headlessOn);
const sameNative = bandDelta(browserResults.off, headlessOff);
const gs1Browser = bandL1(browserResults.on, browserResults.off);
const gs1Headless = bandL1(headlessOn, headlessOff);

/** The band table, printed so a delta is read against the level it sits on: 3 dB at −90 dB is not 3 dB at −20 dB. */
console.log("\n=== 13-band fingerprint (dB) ===");
console.log("band   browserON  headlessON  deltaON   browserOFF headlessOFF deltaOFF");
for (let i = 0; i < browserResults.on.bandDb.length; i += 1) {
  const dOn = Math.abs(browserResults.on.bandDb[i] - headlessOn.bandDb[i]);
  const dOff = Math.abs(browserResults.off.bandDb[i] - headlessOff.bandDb[i]);
  console.log(
    `${String(i).padStart(3)}  ${browserResults.on.bandDb[i].toFixed(2).padStart(10)}  ${headlessOn.bandDb[i]
      .toFixed(2)
      .padStart(10)}  ${dOn.toFixed(2).padStart(7)}  ${browserResults.off.bandDb[i].toFixed(2).padStart(10)} ${headlessOff.bandDb[i]
      .toFixed(2)
      .padStart(11)} ${dOff.toFixed(2).padStart(7)}`
  );
}

console.log("\n=== assertions ===");
const checks: Array<[string, boolean, string]> = [];
checks.push([
  "same frame count",
  browserResults.on.frames === headlessOn.frames,
  `browser=${browserResults.on.frames} headless=${headlessOn.frames}`,
]);
checks.push([
  `same voice: browser ON vs headless ON, worst band ≤ ${TOL_BAND_DB} dB`,
  sameVoice.worst <= TOL_BAND_DB,
  `worst ${sameVoice.worst.toFixed(2)} dB (band ${sameVoice.band})`,
]);
checks.push([
  `same native lanes: browser OFF vs headless OFF, worst band ≤ ${TOL_BAND_DB} dB`,
  sameNative.worst <= TOL_BAND_DB,
  `worst ${sameNative.worst.toFixed(2)} dB (band ${sameNative.band})`,
]);
checks.push([
  `true peak: |Δ| ≤ ${TOL_TRUE_PEAK_DB} dB`,
  Math.abs(browserResults.on.truePeakDb - headlessOn.truePeakDb) <= TOL_TRUE_PEAK_DB,
  `Δ ${Math.abs(browserResults.on.truePeakDb - headlessOn.truePeakDb).toFixed(3)} dB`,
]);
checks.push([
  `loudness: |Δ| ≤ ${TOL_LUFS_DB} LU`,
  Math.abs(browserResults.on.lufs - headlessOn.lufs) <= TOL_LUFS_DB,
  `Δ ${Math.abs(browserResults.on.lufs - headlessOn.lufs).toFixed(3)} LU`,
]);
checks.push([
  `GS-1 engaged in BOTH hosts (13-band L1 ON−OFF > ${GUARD_DB} dB)`,
  gs1Browser > GUARD_DB && gs1Headless > GUARD_DB,
  `browser ${gs1Browser.toFixed(2)} dB, headless ${gs1Headless.toFixed(2)} dB`,
]);

for (const [label, ok, detail] of checks) console.log(`${ok ? "ok  " : "FAIL"} ${label} — ${detail}`);

if (keep) {
  const dir = path.join(os.tmpdir(), `headless-parity-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  console.log(`\n(numbers only; use --keep if you later add WAV output; dir would be ${dir})`);
}

const failed = checks.filter(([, ok]) => !ok);
console.log(failed.length === 0 ? "\nPASS headless host is the same sound within tolerance" : `\nFAIL ${failed.length} check(s) failed`);
process.exit(failed.length === 0 ? 0 : 1);
