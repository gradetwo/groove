import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  TruePeakLimiterKernel,
  createMasterLimiter,
  limitBuffers,
  MASTER_LIMITER_CEILING_DB,
  MASTER_LIMITER_LOOKAHEAD_MS,
  MASTER_LIMITER_PROCESSOR_NAME,
  MASTER_LIMITER_WORKLET_URL,
} from "../audio/MasterLimiter";
import { truePeakDbChannels } from "./helpers/loudness";
import {
  FakeAudioContext,
  FakeCompressorNode,
  FakeNode,
  installFakeAudioContext,
} from "./helpers/fakeAudio";

/**
 * E-12 · true-peak brickwall master limiter.
 *
 * What is reachable in this environment, stated up front so nothing is overclaimed:
 *
 *  - The **DSP** is exercised for real: the TypeScript kernel processes sample buffers,
 *    and the AudioWorklet **processor source** (`public/limiterWorklet.js`) is loaded
 *    from disk and run in-process (its `AudioWorkletProcessor` base is a test double),
 *    so the shipped worklet code — not a re-implementation of it — is what these tests
 *    push samples through.
 *  - The **Web Audio AudioWorklet host** is *not* exercised here: jsdom has no
 *    `AudioContext` and no rendering thread, so `audioWorklet.addModule()` never
 *    actually fetches or runs the module. The graph-level tests below use a stubbed
 *    `AudioWorkletNode` to pin the async swap; the real ceiling is host-verified only
 *    by the offline browser measurement, never by this suite.
 *  - The **fallback** path (compressor) is what `AudioEngine` / `WavExporter` /
 *    `ChordAudioEngine` take under the test doubles, and it is asserted to install.
 */

const SAMPLE_RATE = 44100;
/** The ceiling is hard; this is only room for the meter's own float rounding. */
const CEILING_TOLERANCE_DB = 0.01;

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

function sine(freq: number, amplitude: number, frames: number, phase = 0): Float32Array {
  const out = new Float32Array(frames);
  for (let i = 0; i < out.length; i++) {
    out[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE + phase);
  }
  return out;
}

/** The canonical inter-sample overshoot: samples at −3.01 dBFS, waveform at 0 dBTP. */
function quarterRateSine(amplitude: number, frames: number): Float32Array {
  const out = new Float32Array(frames);
  for (let i = 0; i < out.length; i++) {
    out[i] = amplitude * Math.sin((Math.PI / 2) * i + Math.PI / 4);
  }
  return out;
}

function squareBurst(
  frames: number,
  startFrame: number,
  lengthFrames: number,
  amplitude = 1,
  halfPeriod = 22 // ≈1 kHz at 44.1 kHz
): Float32Array {
  const out = new Float32Array(frames);
  for (let i = 0; i < lengthFrames; i++) {
    out[startFrame + i] = Math.floor(i / halfPeriod) % 2 === 0 ? amplitude : -amplitude;
  }
  return out;
}

function noise(seed: number, frames: number, amplitude = 1): Float32Array {
  const out = new Float32Array(frames);
  let state = seed >>> 0;
  for (let i = 0; i < frames; i++) {
    state = (state * 1664525 + 1013904223) >>> 0;
    out[i] = ((state / 4294967296) * 2 - 1) * amplitude;
  }
  return out;
}

/** Runs a kernel over whole channels, honouring a block size exactly like a worklet does. */
function runKernel(
  kernel: TruePeakLimiterKernel,
  channels: Float32Array[],
  blockSize = 128
): Float32Array[] {
  const frames = channels.length > 0 ? channels[0].length : 0;
  const outputs = channels.map(() => new Float32Array(frames));
  for (let start = 0; start < frames; start += blockSize) {
    const count = Math.min(blockSize, frames - start);
    kernel.processBlock(
      channels.map((channel) => channel.subarray(start, start + count)),
      outputs.map((output) => output.subarray(start, start + count)),
      count
    );
  }
  return outputs;
}

function maxAbsDifference(a: Float32Array, b: Float32Array): number {
  let max = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = Math.abs(a[i] - b[i]);
    if (diff > max) max = diff;
  }
  return max;
}

/* ------------------------------------------------------------------ */
/* The shipped AudioWorklet processor, loaded from disk and run in-process. */
/* ------------------------------------------------------------------ */

class FakeAudioWorkletProcessor {
  port = { postMessage: (_message: unknown) => {}, onmessage: null as unknown };
  constructor(_options?: unknown) {}
}

interface WorkletKernelLike {
  processBlock(inputs: Float32Array[], outputs: Float32Array[], frames: number): void;
  gain: number;
}

interface WorkletProcessorLike {
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
}

interface LoadedWorklet {
  kernelFactory: (sampleRate: number, options?: Record<string, unknown>) => WorkletKernelLike;
  processorFactory: (options?: { processorOptions?: Record<string, unknown> }) => WorkletProcessorLike;
  registered: Array<{ name: string; processor: unknown }>;
}

/**
 * Evaluates `public/limiterWorklet.js` verbatim. The file is a real AudioWorklet module
 * (top-level classes + a guarded `registerProcessor`), which is also valid script body,
 * so `new Function` with the worklet globals injected runs the exact shipped source.
 */
function loadWorkletModule(sampleRate = SAMPLE_RATE): LoadedWorklet {
  // `import.meta.url` is an http URL under vitest's jsdom environment, so resolve from
  // the project root instead (the suite always runs from the repo root).
  const workletPath = path.resolve(process.cwd(), "public/limiterWorklet.js");
  const source = fs.readFileSync(workletPath, "utf8");
  const registered: Array<{ name: string; processor: unknown }> = [];
  const factory = new Function(
    "AudioWorkletProcessor",
    "registerProcessor",
    "sampleRate",
    "currentTime",
    `${source}\nreturn { TruePeakLimiterKernel, GrooveLimiterProcessor };`
  );
  const module = factory(
    FakeAudioWorkletProcessor,
    (name: string, processor: unknown) => registered.push({ name, processor }),
    sampleRate,
    0
  );
  return {
    kernelFactory: (rate, options) => new module.TruePeakLimiterKernel(rate, options),
    processorFactory: (options) => new module.GrooveLimiterProcessor(options),
    registered,
  };
}

/** Drives the worklet processor's `process()` exactly as the rendering thread would. */
function runProcessor(
  processor: WorkletProcessorLike,
  channels: Float32Array[],
  blockSize = 128
): Float32Array[] {
  const frames = channels.length > 0 ? channels[0].length : 0;
  const outputs = channels.map(() => new Float32Array(frames));
  for (let start = 0; start < frames; start += blockSize) {
    const count = Math.min(blockSize, frames - start);
    const inputBlock = channels.map((channel) => channel.subarray(start, start + count));
    const outputBlock = outputs.map((output) => output.subarray(start, start + count));
    processor.process([inputBlock], [outputBlock]);
  }
  return outputs;
}

describe("E-12 · limiter true-peak ceiling", () => {
  it("pins a 0 dBFS square burst at or below the −1 dBTP ceiling", () => {
    const frames = SAMPLE_RATE / 2;
    const input = squareBurst(frames, 2000, 2000, 1.0);
    const outputs = runKernel(new TruePeakLimiterKernel(SAMPLE_RATE), [input, input]);

    const outTruePeak = truePeakDbChannels(outputs);
    expect(outTruePeak).toBeLessThanOrEqual(MASTER_LIMITER_CEILING_DB + CEILING_TOLERANCE_DB);
    // It must also *use* the headroom rather than ducking the burst to nothing.
    expect(outTruePeak).toBeGreaterThan(MASTER_LIMITER_CEILING_DB - 1.5);
  });

  it("catches an inter-sample overshoot whose sample peak is only −3 dBFS", () => {
    const frames = SAMPLE_RATE / 2;
    const input = quarterRateSine(1.0, frames);
    // Sample peak is −3.01 dBFS, so a sample-peak ceiling would let this through.
    let samplePeak = 0;
    for (const value of input) samplePeak = Math.max(samplePeak, Math.abs(value));
    expect(20 * Math.log10(samplePeak)).toBeCloseTo(-3.0103, 2);

    const outputs = runKernel(new TruePeakLimiterKernel(SAMPLE_RATE), [input, input]);
    const outTruePeak = truePeakDbChannels(outputs);
    expect(outTruePeak).toBeLessThanOrEqual(MASTER_LIMITER_CEILING_DB + CEILING_TOLERANCE_DB);
    expect(outTruePeak).toBeGreaterThan(MASTER_LIMITER_CEILING_DB - 1.5);
  });

  it("holds the ceiling on the worklet processor path too (shipped source, same input)", () => {
    const loaded = loadWorkletModule();
    const frames = SAMPLE_RATE / 4;
    const input = squareBurst(frames, 1000, 1000, 1.0);
    const processor = loaded.processorFactory({
      processorOptions: { ceilingDb: MASTER_LIMITER_CEILING_DB, lookaheadMs: MASTER_LIMITER_LOOKAHEAD_MS },
    });
    const outputs = runProcessor(processor, [input, input]);
    expect(truePeakDbChannels(outputs)).toBeLessThanOrEqual(MASTER_LIMITER_CEILING_DB + CEILING_TOLERANCE_DB);

    const overshoot = runProcessor(
      loaded.processorFactory({ processorOptions: {} }),
      [quarterRateSine(1.0, frames), quarterRateSine(1.0, frames)]
    );
    expect(truePeakDbChannels(overshoot)).toBeLessThanOrEqual(MASTER_LIMITER_CEILING_DB + CEILING_TOLERANCE_DB);
  });

  it("honours a non-default ceiling", () => {
    const frames = SAMPLE_RATE / 4;
    const input = quarterRateSine(1.0, frames);
    const outputs = runKernel(new TruePeakLimiterKernel(SAMPLE_RATE, { ceilingDb: -6 }), [input, input]);
    const measured = truePeakDbChannels(outputs);
    expect(measured).toBeLessThanOrEqual(-6 + CEILING_TOLERANCE_DB);
    expect(measured).toBeGreaterThan(-7.5);
  });

  it("leaves material that is already below the ceiling untouched (apart from latency)", () => {
    const frames = SAMPLE_RATE / 4;
    const input = sine(220, 0.2, frames); // −14 dBFS: nowhere near the ceiling
    const kernel = new TruePeakLimiterKernel(SAMPLE_RATE);
    const outputs = runKernel(kernel, [input, input]);

    expect(kernel.gainReductionDb).toBe(0);
    const latency = kernel.latencySamples;
    let maxDiff = 0;
    for (let i = latency; i < frames; i++) {
      maxDiff = Math.max(maxDiff, Math.abs(outputs[0][i] - input[i - latency]));
    }
    expect(maxDiff).toBeLessThan(1e-6);
    // The lookahead really does delay the stream.
    for (let i = 0; i < latency; i++) expect(outputs[0][i]).toBe(0);
  });
});

describe("E-12 · limiter ballistics", () => {
  it("releases the gain after a transient instead of staying ducked", () => {
    const frames = SAMPLE_RATE;
    const burstStart = Math.round(0.02 * SAMPLE_RATE);
    const burstLength = Math.round(0.02 * SAMPLE_RATE);
    const probeStart = Math.round(0.5 * SAMPLE_RATE);
    const input = new Float32Array(frames);
    // A +6 dBFS burst: over the ceiling, and deep enough (>6 dB reduction) to exercise
    // the slow release slope as well as the fast one.
    input.set(squareBurst(burstLength, 0, burstLength, 2.0), burstStart);
    // Then a quiet probe tone that must come back at unity.
    input.set(sine(220, 0.1, frames - probeStart), probeStart);

    const kernel = new TruePeakLimiterKernel(SAMPLE_RATE);
    const outputs = runKernel(kernel, [input, input]);

    // The gain envelope really does reduce during the burst.
    const envelope = new TruePeakLimiterKernel(SAMPLE_RATE);
    const chunk = 128;
    let maxReduction = 0;
    for (let start = 0; start < frames; start += chunk) {
      const count = Math.min(chunk, frames - start);
      envelope.processBlock(
        [input.subarray(start, start + count), input.subarray(start, start + count)],
        [new Float32Array(count), new Float32Array(count)],
        count
      );
      maxReduction = Math.max(maxReduction, envelope.gainReductionDb);
    }
    expect(maxReduction).toBeGreaterThan(3);

    // …and by the end of the render the probe tone is passing at unity again.
    expect(kernel.gainReductionDb).toBeLessThan(0.05);
    const latency = kernel.latencySamples;
    let maxProbeDiff = 0;
    for (let i = Math.round(0.9 * SAMPLE_RATE); i < frames; i++) {
      maxProbeDiff = Math.max(maxProbeDiff, Math.abs(outputs[0][i] - input[i - latency]));
    }
    expect(maxProbeDiff).toBeLessThan(0.01);
  });

  it("is stereo-linked: a transient on one channel attenuates the other by the same gain", () => {
    const frames = SAMPLE_RATE / 4;
    const left = sine(110, 0.05, frames); // quiet, far below the ceiling on its own
    const right = squareBurst(frames, 2000, 2000, 1.0); // full-scale transient
    const kernel = new TruePeakLimiterKernel(SAMPLE_RATE);
    const outputs = runKernel(kernel, [left, right]);

    const latency = kernel.latencySamples;
    const probe = 2000 + latency + 200; // inside the steady burst, after the attack
    const gainFromLeft = outputs[0][probe] / left[probe - latency];
    const gainFromRight = outputs[1][probe] / right[probe - latency];

    expect(gainFromRight).toBeLessThan(0.95);
    // Independent per-channel limiting would leave `gainFromLeft` at 1.0.
    expect(gainFromLeft).toBeCloseTo(gainFromRight, 3);
  });

  it("is deterministic and block-size independent (realtime == offline)", () => {
    const frames = 4096;
    const left = noise(7, frames, 0.9);
    const right = sine(1000, 1.2, frames);
    const first = runKernel(new TruePeakLimiterKernel(SAMPLE_RATE), [left, right], 128);
    const second = runKernel(new TruePeakLimiterKernel(SAMPLE_RATE), [left, right], 128);
    expect(second[0]).toEqual(first[0]);
    expect(second[1]).toEqual(first[1]);

    // Split across render quanta differently: same arithmetic, same output. This is the
    // property the exporter-parity rule depends on.
    const whole = new TruePeakLimiterKernel(SAMPLE_RATE);
    const wholeOut = runKernel(whole, [left, right], frames);
    const odd = runKernel(new TruePeakLimiterKernel(SAMPLE_RATE), [left, right], 37);
    expect(odd[0]).toEqual(wholeOut[0]);
    expect(odd[1]).toEqual(wholeOut[1]);
  });

  it("reports the lookahead as latency and delays the stream by exactly that much", () => {
    const kernel = new TruePeakLimiterKernel(SAMPLE_RATE);
    const expected = Math.round((MASTER_LIMITER_LOOKAHEAD_MS / 1000) * SAMPLE_RATE);
    expect(kernel.latencySamples).toBe(expected);
    expect(kernel.latencySeconds).toBeCloseTo(expected / SAMPLE_RATE, 12);

    const input = new Float32Array(1024);
    input[0] = 0.25; // below the ceiling, so the gain stays at unity
    const outputs = runKernel(kernel, [input]);
    expect(outputs[0][expected]).toBeCloseTo(0.25, 6);
    for (let i = 0; i < expected; i++) expect(outputs[0][i]).toBe(0);
  });

  it("limits a full stereo mix through the convenience wrapper", () => {
    const frames = SAMPLE_RATE / 4;
    const mix = noise(99, frames, 1.4);
    const { channels, latencySamples } = limitBuffers([mix, mix], SAMPLE_RATE);
    expect(latencySamples).toBeGreaterThan(0);
    expect(truePeakDbChannels(channels)).toBeLessThanOrEqual(MASTER_LIMITER_CEILING_DB + CEILING_TOLERANCE_DB);
  });
});

describe("E-12 · worklet parity", () => {
  it("registers the processor under the name the loader instantiates", () => {
    const loaded = loadWorkletModule();
    expect(loaded.registered.map((entry) => entry.name)).toEqual([MASTER_LIMITER_PROCESSOR_NAME]);
  });

  it("produces sample-identical output to the TypeScript kernel", () => {
    const loaded = loadWorkletModule();
    const frames = 4096;
    const left = noise(3, frames, 0.8);
    const right = sine(1500, 1.1, frames);

    const tsKernel = new TruePeakLimiterKernel(SAMPLE_RATE);
    const tsOut = runKernel(tsKernel, [left, right], 128);

    const jsKernel = loaded.kernelFactory(SAMPLE_RATE, {});
    const jsOutputs = [new Float32Array(frames), new Float32Array(frames)];
    for (let start = 0; start < frames; start += 128) {
      const count = Math.min(128, frames - start);
      jsKernel.processBlock(
        [left.subarray(start, start + count), right.subarray(start, start + count)],
        [jsOutputs[0].subarray(start, start + count), jsOutputs[1].subarray(start, start + count)],
        count
      );
    }
    expect(maxAbsDifference(tsOut[0], jsOutputs[0])).toBeLessThan(1e-6);
    expect(maxAbsDifference(tsOut[1], jsOutputs[1])).toBeLessThan(1e-6);

    // Same again through the processor host class (the code the worklet thread runs).
    const processorOut = runProcessor(loaded.processorFactory({ processorOptions: {} }), [left, right], 128);
    expect(maxAbsDifference(tsOut[0], processorOut[0])).toBeLessThan(1e-6);
    expect(maxAbsDifference(tsOut[1], processorOut[1])).toBeLessThan(1e-6);
  });

  it("passes silence through when nothing is connected", () => {
    const loaded = loadWorkletModule();
    const processor = loaded.processorFactory({ processorOptions: {} });
    const output = new Float32Array(128).fill(0.5);
    expect(processor.process([], [[output]])).toBe(true);
    expect(Array.from(output)).toEqual(new Array(128).fill(0));
  });
});

describe("E-12 · master limiter graph wiring", () => {
  let restore: (() => void) | null = null;
  const originalWorkletNode = (globalThis as { AudioWorkletNode?: unknown }).AudioWorkletNode;

  afterEach(() => {
    (globalThis as { AudioWorkletNode?: unknown }).AudioWorkletNode = originalWorkletNode;
    restore?.();
    restore = null;
  });

  it("falls back to the configured compressor when AudioWorklet is unavailable", async () => {
    restore = installFakeAudioContext();
    const ctx = new FakeAudioContext();
    expect((ctx as unknown as { audioWorklet?: unknown }).audioWorklet).toBeUndefined();

    // The double intentionally implements only the subset of `BaseAudioContext` this
    // module touches, so the cast is the price of testing the real entry point rather
    // than a narrowed test-only copy of it.
    const handle = createMasterLimiter(ctx as unknown as BaseAudioContext);
    expect(handle.kind).toBe("fallback");
    expect(await handle.ready).toBe("fallback");
    // Single node: the fallback is the compressor itself, so the offline node order
    // (and the trim/limiter parity tests) is unchanged.
    expect(handle.input).toBe(handle.output);
    expect(handle.input).toBeInstanceOf(FakeCompressorNode);
    expect(handle.latencySamples).toBe(0);
    expect(handle.latencySeconds).toBe(0);
    const compressor = handle.input as unknown as FakeCompressorNode;
    expect(compressor.threshold.value).toBe(-1);
    expect(compressor.ratio.value).toBe(20);
  });

  it("upgrades to the worklet asynchronously without changing input/output identity", async () => {
    class FakeAudioWorkletNode extends FakeNode {
      port = { postMessage: (_message: unknown) => {}, onmessage: null as unknown };
      constructor(
        public context: unknown,
        public name: string,
        public options?: { processorOptions?: Record<string, number> }
      ) {
        super();
      }
    }
    (globalThis as { AudioWorkletNode?: unknown }).AudioWorkletNode = FakeAudioWorkletNode;

    restore = installFakeAudioContext();
    const ctx = new FakeAudioContext();
    const loadedModules: string[] = [];
    (ctx as unknown as { audioWorklet: unknown }).audioWorklet = {
      addModule: async (url: string) => {
        loadedModules.push(url);
      },
    };

    const handle = createMasterLimiter(ctx as unknown as BaseAudioContext);
    const inputNode = handle.input;
    const outputNode = handle.output;
    // Synchronously the graph is already limited (by the fallback, wired between the
    // two stable gain nodes), never open.
    expect(handle.kind).toBe("fallback");
    expect(handle.input).not.toBe(handle.output);

    expect(await handle.ready).toBe("worklet");
    expect(handle.kind).toBe("worklet");
    expect(loadedModules).toEqual([MASTER_LIMITER_WORKLET_URL]);
    // The handle's identity is stable across the swap, which is what lets a caller
    // wire the graph once during synchronous construction.
    expect(handle.input).toBe(inputNode);
    expect(handle.output).toBe(outputNode);
    expect(handle.input).not.toBe(handle.output);

    const workletNode = (outputNode as unknown as FakeNode).incoming.find(
      (node) => node instanceof FakeAudioWorkletNode
    ) as FakeAudioWorkletNode | undefined;
    expect(workletNode).toBeDefined();
    expect(workletNode!.name).toBe(MASTER_LIMITER_PROCESSOR_NAME);
    expect(workletNode!.options?.processorOptions?.ceilingDb).toBe(MASTER_LIMITER_CEILING_DB);
    // `input` feeds the worklet. (The fake `disconnect` is a no-op, so the stale
    // fallback edge also remains in `incoming`; the real graph drops it.)
    expect(workletNode!.incoming).toContain(inputNode);

    expect(handle.latencySamples).toBe(Math.round((MASTER_LIMITER_LOOKAHEAD_MS / 1000) * ctx.sampleRate));
    // Latency is quantised to whole samples, so 3 ms at 44.1 kHz is 132 samples
    // (2.993 ms) — reported as such rather than pretending to be exactly 3.000 ms.
    expect(handle.latencySeconds).toBeCloseTo(handle.latencySamples / ctx.sampleRate, 12);
    expect(Math.abs(handle.latencySeconds - MASTER_LIMITER_LOOKAHEAD_MS / 1000)).toBeLessThan(
      1 / ctx.sampleRate
    );

    handle.dispose();
  });

  it("keeps dbToLinear consistent with the documented −1 dBTP ceiling", () => {
    expect(dbToLinear(MASTER_LIMITER_CEILING_DB)).toBeCloseTo(0.891251, 6);
  });
});
