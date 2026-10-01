#!/usr/bin/env node
/**
 * Which Web Audio primitive do the two hosts disagree on?
 *
 * The companion to `probe_headless_parity.ts`. That one says whether the hosts agree on the app's own render; this one
 * says *which built-in node* is responsible when they do not. It builds a set of minimal graphs from ONE builder source,
 * runs that same source in Chromium and in node-web-audio-api, and compares the returned samples one at a time in Node.
 * No app modules and no Vite: the page only needs `OfflineAudioContext`, so the browser half runs against `about:blank`.
 *
 * Measured on 2026-10-01 (node-web-audio-api 2.2.0, Chromium 1243, 44.1 kHz stereo, 0.5 s). The bracketed number is the
 * largest sample difference relative to peak, in dB below it.
 *
 * Divergent, isolated on host-identical inputs:
 *   osc-saw / osc-square          +1.40 dB RMS in the Node host   band-limiting of the non-sine waveforms
 *   osc-triangle                  shape differs (-46.9 dB), level equal
 *   DynamicsCompressorNode        2.4-4.5 dB relative             on saw, sine and noise alike
 *
 * Bit-equal or below -88 dB, so ruled out:
 *   osc-sine (-98.2)   gain linear ramp (-109.0)   gain exponential ramp (-112.5)
 *   frequency exponential sweep (-99.8)            biquad lowpass on noise (-125.7)
 *   biquad highpass Q8 on noise (-113.1)           waveshaper with a curve (-88.6)
 *   AudioBufferSource noise (0.00e+0)              convolver with an IR (-99.4)
 *   stereo panner on a sine (-91.7)
 *
 * A confound worth knowing: `biquad-*` and `stereo-panner` fed by a sawtooth *do* differ, and entirely because the
 * sawtooth differs. Feed them a host-identical input (sine or the deterministic noise buffer) and they agree. That is
 * why the noise-fed and sine-fed variants are in the list next to the saw-fed ones.
 *
 * Usage:  npm i -D node-web-audio-api && npx vite-node scripts/probe_host_primitives.ts
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let wa: any = null;
try {
  wa = require("node-web-audio-api");
} catch {
  console.log(
    "SKIP  host primitive A/B skipped: `node-web-audio-api` is not installed.\n" +
      "   install it to run this probe:  npm i -D node-web-audio-api"
  );
  process.exit(0);
}
const { chromium } = require("playwright");

const SR = 44100;
const SECONDS = 0.5;
const FRAMES = Math.round(SR * SECONDS);

/**
 * The one builder both hosts execute. Deterministic: no Math.random, no clock.
 * Each branch builds a graph on the supplied context and connects it to the destination.
 */
const BUILDER = `function build(ctx, name) {
  const sr = ctx.sampleRate;
  const len = Math.round(sr * 0.5);
  const tone = (type, hz) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = hz;
    o.start(0);
    o.stop(0.48);
    return o;
  };
  if (name === "osc-sine") {
    const g = ctx.createGain(); g.gain.value = 0.5;
    tone("sine", 110).connect(g); g.connect(ctx.destination); return;
  }
  if (name === "osc-saw") {
    const g = ctx.createGain(); g.gain.value = 0.5;
    tone("sawtooth", 220).connect(g); g.connect(ctx.destination); return;
  }
  if (name === "osc-square") {
    const g = ctx.createGain(); g.gain.value = 0.5;
    tone("square", 220).connect(g); g.connect(ctx.destination); return;
  }
  if (name === "gain-exp-decay") {
    const g = ctx.createGain();
    g.gain.setValueAtTime(1, 0);
    g.gain.exponentialRampToValueAtTime(0.0005, 0.4);
    tone("sine", 110).connect(g); g.connect(ctx.destination); return;
  }
  if (name === "gain-linear-decay") {
    const g = ctx.createGain();
    g.gain.setValueAtTime(1, 0);
    g.gain.linearRampToValueAtTime(0, 0.4);
    tone("sine", 110).connect(g); g.connect(ctx.destination); return;
  }
  if (name === "frequency-exp-sweep") {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(120, 0);
    o.frequency.exponentialRampToValueAtTime(45, 0.25);
    o.start(0); o.stop(0.48);
    const g = ctx.createGain(); g.gain.value = 0.5;
    o.connect(g); g.connect(ctx.destination); return;
  }
  if (name === "biquad-lowpass") {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = 1000; f.Q.value = 0.7;
    tone("sawtooth", 220).connect(f); f.connect(ctx.destination); return;
  }
  if (name === "biquad-highpass-res") {
    const f = ctx.createBiquadFilter();
    f.type = "highpass"; f.frequency.value = 500; f.Q.value = 8;
    tone("sawtooth", 220).connect(f); f.connect(ctx.destination); return;
  }
  if (name === "waveshaper-curve") {
    const n = 1024;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(3 * x);
    }
    const w = ctx.createWaveShaper();
    w.curve = curve;
    w.oversample = "none";
    tone("sine", 110).connect(w); w.connect(ctx.destination); return;
  }
  if (name === "dynamics-compressor") {
    const d = ctx.createDynamicsCompressor();
    d.threshold.value = -30; d.knee.value = 6; d.ratio.value = 8;
    d.attack.value = 0.003; d.release.value = 0.1;
    const g = ctx.createGain(); g.gain.value = 0.9;
    tone("sawtooth", 110).connect(g); g.connect(d); d.connect(ctx.destination); return;
  }
  if (name === "osc-triangle") {
    const g = ctx.createGain(); g.gain.value = 0.5;
    tone("triangle", 220).connect(g); g.connect(ctx.destination); return;
  }
  if (name === "noise-then-lowpass") {
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    let s2 = 12345;
    for (let i = 0; i < len; i += 1) { s2 = (s2 * 1103515245 + 12345) & 0x7fffffff; d[i] = (s2 / 0x3fffffff) - 1; }
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 1000; f.Q.value = 0.7;
    const g = ctx.createGain(); g.gain.value = 0.5;
    src.connect(g); g.connect(f); f.connect(ctx.destination); src.start(0); return;
  }
  if (name === "noise-then-highpass-res") {
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    let s2 = 12345;
    for (let i = 0; i < len; i += 1) { s2 = (s2 * 1103515245 + 12345) & 0x7fffffff; d[i] = (s2 / 0x3fffffff) - 1; }
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 500; f.Q.value = 8;
    const g = ctx.createGain(); g.gain.value = 0.5;
    src.connect(g); g.connect(f); f.connect(ctx.destination); src.start(0); return;
  }
  if (name === "noise-then-compressor") {
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    let s2 = 12345;
    for (let i = 0; i < len; i += 1) { s2 = (s2 * 1103515245 + 12345) & 0x7fffffff; d[i] = (s2 / 0x3fffffff) - 1; }
    const src = ctx.createBufferSource(); src.buffer = buf;
    const c = ctx.createDynamicsCompressor();
    c.threshold.value = -30; c.knee.value = 6; c.ratio.value = 8; c.attack.value = 0.003; c.release.value = 0.1;
    const g = ctx.createGain(); g.gain.value = 0.9;
    src.connect(g); g.connect(c); c.connect(ctx.destination); src.start(0); return;
  }
  if (name === "sine-then-panner") {
    const p = ctx.createStereoPanner(); p.pan.value = -0.6;
    const g = ctx.createGain(); g.gain.value = 0.5;
    tone("sine", 220).connect(g); g.connect(p); p.connect(ctx.destination); return;
  }
  if (name === "sine-then-compressor") {
    const c = ctx.createDynamicsCompressor();
    c.threshold.value = -30; c.knee.value = 6; c.ratio.value = 8; c.attack.value = 0.003; c.release.value = 0.1;
    const g = ctx.createGain(); g.gain.value = 0.9;
    tone("sine", 110).connect(g); g.connect(c); c.connect(ctx.destination); return;
  }
  if (name === "kick-chain-no-comp") {
    const o = ctx.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(120, 0);
    o.frequency.exponentialRampToValueAtTime(45, 0.25);
    o.start(0); o.stop(0.48);
    const env = ctx.createGain();
    env.gain.setValueAtTime(1, 0);
    env.gain.exponentialRampToValueAtTime(0.0005, 0.4);
    const n = 1024; const curve = new Float32Array(n);
    for (let i = 0; i < n; i += 1) { const x = (i / (n - 1)) * 2 - 1; curve[i] = Math.tanh(2 * x); }
    const w = ctx.createWaveShaper(); w.curve = curve; w.oversample = "none";
    const g = ctx.createGain(); g.gain.value = 0.8;
    o.connect(env); env.connect(w); w.connect(g); g.connect(ctx.destination); return;
  }
  if (name === "kick-chain-with-comp") {
    const o = ctx.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(120, 0);
    o.frequency.exponentialRampToValueAtTime(45, 0.25);
    o.start(0); o.stop(0.48);
    const env = ctx.createGain();
    env.gain.setValueAtTime(1, 0);
    env.gain.exponentialRampToValueAtTime(0.0005, 0.4);
    const n = 1024; const curve = new Float32Array(n);
    for (let i = 0; i < n; i += 1) { const x = (i / (n - 1)) * 2 - 1; curve[i] = Math.tanh(2 * x); }
    const w = ctx.createWaveShaper(); w.curve = curve; w.oversample = "none";
    const c = ctx.createDynamicsCompressor();
    c.threshold.value = -24; c.knee.value = 6; c.ratio.value = 6; c.attack.value = 0.003; c.release.value = 0.1;
    const g = ctx.createGain(); g.gain.value = 0.8;
    o.connect(env); env.connect(w); w.connect(c); c.connect(g); g.connect(ctx.destination); return;
  }
  if (name === "noise-buffer") {
    const buf = ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    let s = 12345;
    for (let i = 0; i < len; i += 1) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      data[i] = (s / 0x3fffffff) - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain(); g.gain.value = 0.5;
    src.connect(g); g.connect(ctx.destination); src.start(0); return;
  }
  if (name === "convolver-ir") {
    const ir = ctx.createBuffer(1, Math.round(sr * 0.2), sr);
    const d = ir.getChannelData(0);
    let s = 999;
    for (let i = 0; i < d.length; i += 1) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      d[i] = ((s / 0x3fffffff) - 1) * Math.exp(-i / (sr * 0.05));
    }
    const c = ctx.createConvolver();
    c.normalize = false;
    c.buffer = ir;
    const g = ctx.createGain(); g.gain.value = 0.5;
    tone("sine", 110).connect(g); g.connect(c); c.connect(ctx.destination); return;
  }
  if (name === "stereo-panner") {
    const p = ctx.createStereoPanner(); p.pan.value = -0.6;
    const g = ctx.createGain(); g.gain.value = 0.5;
    tone("sawtooth", 220).connect(g); g.connect(p); p.connect(ctx.destination); return;
  }
  throw new Error("unknown primitive " + name);
}`;

const NAMES = [
  "osc-sine",
  "osc-saw",
  "osc-square",
  "osc-triangle",
  "noise-then-lowpass",
  "noise-then-highpass-res",
  "noise-then-compressor",
  "sine-then-panner",
  "sine-then-compressor",
  "kick-chain-no-comp",
  "kick-chain-with-comp",
  "gain-exp-decay",
  "gain-linear-decay",
  "frequency-exp-sweep",
  "biquad-lowpass",
  "biquad-highpass-res",
  "waveshaper-curve",
  "dynamics-compressor",
  "noise-buffer",
  "convolver-ir",
  "stereo-panner",
];

interface Render {
  left: Float32Array;
  right: Float32Array;
}

const measure = (r: Render) => {
  let peak = 0;
  let energy = 0;
  let n = 0;
  for (const ch of [r.left, r.right]) {
    for (let i = 0; i < ch.length; i += 1) {
      peak = Math.max(peak, Math.abs(ch[i]));
      energy += ch[i] * ch[i];
      n += 1;
    }
  }
  return { peak, rmsDb: 20 * Math.log10(Math.max(Math.sqrt(energy / n), 1e-12)) };
};

const compare = (a: Render, b: Render) => {
  let maxDiff = 0;
  let peak = 0;
  for (const [x, y] of [
    [a.left, b.left],
    [a.right, b.right],
  ] as Array<[Float32Array, Float32Array]>) {
    for (let i = 0; i < x.length; i += 1) {
      maxDiff = Math.max(maxDiff, Math.abs(x[i] - y[i]));
      peak = Math.max(peak, Math.abs(x[i]), Math.abs(y[i]));
    }
  }
  return { maxDiff, relDiffDb: 20 * Math.log10(Math.max(maxDiff, 1e-12) / Math.max(peak, 1e-12)) };
};

/* ---------------------------------------------------------------- headless */

const identity = (bytes: Uint8Array, channels: number): Render => {
  const per = bytes.length / channels / 4;
  const out: Float32Array[] = [];
  for (let c = 0; c < channels; c += 1) {
    const copy = bytes.subarray(c * per * 4, (c + 1) * per * 4);
    out.push(new Float32Array(copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength)));
  }
  return { left: out[0]!, right: out[1] ?? out[0]! };
};

async function renderHeadlessAsync(name: string): Promise<Render> {
  const RealOAC = wa.OfflineAudioContext;
  const build = new Function(`return (${BUILDER})`)() as (ctx: unknown, name: string) => void;
  const ctx = new RealOAC(2, FRAMES, SR);
  build(ctx, name);
  const buffer = await ctx.startRendering();
  const left = new Float32Array(buffer.getChannelData(0));
  const right = new Float32Array(buffer.getChannelData(1) ?? buffer.getChannelData(0));
  return { left, right };
}

/* ---------------------------------------------------------------- browser */

async function renderBrowserAll(): Promise<Record<string, Render>> {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.goto("about:blank");
    const expression = `(async () => {
      const build = ${BUILDER};
      const names = ${JSON.stringify(NAMES)};
      const out = {};
      for (const name of names) {
        const ctx = new OfflineAudioContext(2, ${FRAMES}, ${SR});
        build(ctx, name);
        const buffer = await ctx.startRendering();
        const chans = [buffer.getChannelData(0), buffer.getChannelData(1)];
        const bytes = new Uint8Array(chans[0].byteLength * 2);
        chans.forEach((d, c) => bytes.set(new Uint8Array(d.buffer, d.byteOffset, d.byteLength), c * d.byteLength));
        let binary = "";
        const chunk = 1 << 15;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
        }
        out[name] = btoa(binary);
      }
      return out;
    })()`;
    const raw = (await page.evaluate(expression)) as Record<string, string>;
    const decoded: Record<string, Render> = {};
    for (const name of NAMES) decoded[name] = identity(new Uint8Array(Buffer.from(raw[name], "base64")), 2);
    return decoded;
  } finally {
    await browser.close();
  }
}

/* ---------------------------------------------------------------- run */

console.log(`host primitive A/B — ${FRAMES} frames, ${SR} Hz, same builder source in both hosts`);
const browserRenders = await renderBrowserAll();
console.log("browser done.\n");
console.log("primitive                browserRmsDb  headlessRmsDb   dRmsDb   maxDiff     relDiffDb");
const offenders: string[] = [];
for (const name of NAMES) {
  const b = browserRenders[name]!;
  const h = await renderHeadlessAsync(name);
  const mb = measure(b);
  const mh = measure(h);
  const d = compare(b, h);
  const dRms = mh.rmsDb - mb.rmsDb;
  const rel = d.relDiffDb;
  const flag = rel > -60 ? "  <-- differs" : "";
  if (rel > -60) offenders.push(name);
  console.log(
    `${name.padEnd(24)} ${mb.rmsDb.toFixed(2).padStart(12)} ${mh.rmsDb.toFixed(2).padStart(14)} ${dRms
      .toFixed(2)
      .padStart(8)} ${d.maxDiff.toExponential(2).padStart(9)} ${rel.toFixed(1).padStart(12)}${flag}`
  );
}
console.log(`\nprimitives differing by more than -60 dB relative: ${offenders.length ? offenders.join(", ") : "none"}`);
