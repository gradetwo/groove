/**
 * The worklet file and the kernel are the same DSP, proven rather than asserted.
 *
 * A worklet module cannot import from `src/**`, so `public/glueCompressorWorklet.js` duplicates
 * `GlueCompressorKernel` on purpose. This test evaluates the *served file* (the same technique
 * `limiterTruePeak.test.ts` uses for the ceiling) and drives it sample for sample against the kernel, with a
 * separate detector and without, so a change to one that is not made to the other fails here instead of in a render.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { GlueCompressorKernel } from "../audio/GlueCompressor";

const WORKLET_SOURCE = fs.readFileSync(
  path.resolve(process.cwd(), "public/glueCompressorWorklet.js"),
  "utf8"
);

/** The served file's processor class, built in a sandbox with the two globals a worklet scope provides. */
const loadProcessor = (sink?: unknown[]): new (options: { processorOptions?: Record<string, unknown> }) => {
  reduction: number;
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
} => {
  const registered: Record<string, unknown> = {};
  /**
   * The served file runs in a function scope with the two globals a worklet provides. `registerProcessor` is the
   * Node-side callback, so the class lands in `registered` — the first version of this returned `registered` from
   * *inside* the sandbox, where it does not exist.
   */
  const factory = new Function("AudioWorkletProcessor", "registerProcessor", "sampleRate", WORKLET_SOURCE) as (
    base: unknown,
    register: (name: string, ctor: unknown) => void,
    rate: number
  ) => void;

  class Base {
    /**
     * `sink` is how a test reads what the processor posted. Optional so every existing case is unchanged, and a port
     * is always present because the processor assigns `onmessage` in its constructor (the §8.12 road).
     */
    port = { postMessage: (message: unknown) => sink?.push(message) };
  }
  factory(Base, (name, ctor) => {
    registered[name] = ctor;
  }, 44100);
  const ctor = registered["groove-glue-compressor-processor"];
  expect(ctor, "the worklet registers its processor").toBeTruthy();
  return ctor as never;
};

const block = (value: number, frames = 128) => new Float32Array(frames).fill(value);

describe("the glue-compressor worklet mirrors the kernel", () => {
  it("is sample-identical with a separate detector, and without one", () => {
    const Processor = loadProcessor();
    const options = { thresholdDb: -16, kneeDb: 8, ratio: 2, attackSec: 0.03, releaseSec: 0.22, sampleRate: 44100 };

    for (const withDetector of [true, false]) {
      const kernel = new GlueCompressorKernel(options);
      const processor = new Processor({ processorOptions: options });

      // A programme that moves, so the gain computer and both one-poles are actually exercised.
      const levels = [0.8, 0.8, 0.05, 0.3, 0.9, 0.02, 0.6];
      for (const level of levels) {
        const programme = [block(level), block(level * 0.5)];
        const detector = withDetector ? [block(0.8)] : [];
        const outputs = [[new Float32Array(128), new Float32Array(128)]];
        processor.process([programme, detector], outputs);

        const expected = [block(level), block(level * 0.5)];
        kernel.process(expected, withDetector ? [block(0.8)] : null);

        for (let channel = 0; channel < 2; channel += 1) {
          for (let i = 0; i < 128; i += 1) {
            expect(outputs[0][channel][i], `ch${channel} frame ${i} (detector: ${withDetector})`).toBeCloseTo(
              expected[channel][i],
              6
            );
          }
        }
      }
    }
  });

  it("keeps the shipped defaults in the worklet, so an omitted option is not a silent zero", () => {
    const Processor = loadProcessor();
    const processor = new Processor({ processorOptions: {} }) as unknown as {
      thresholdDb: number;
      kneeDb: number;
      ratio: number;
      attackCoefficient: number;
    };
    expect(processor.thresholdDb).toBe(-16);
    expect(processor.kneeDb).toBe(8);
    expect(processor.ratio).toBe(2);
    expect(processor.attackCoefficient).toBeGreaterThan(0);
  });
});

/**
 * ⭐ **Settings can change after construction, because a channel strip rebuilds its chain.**
 *
 * The bus asks once and never changes its mind, which is why `processorOptions` alone was enough. A channel strip
 * does not work that way — `ChannelStripDsp` rebuilds its insert chain whenever a parameter moves — so a
 * compressor configured only at construction would go stale the first time anyone turned a knob. The worklet now
 * accepts a settings object over its port, and these cases drive that path rather than reading the source for it.
 */
describe("the glue-compressor worklet accepts settings after construction", () => {
  type Live = {
    thresholdDb: number;
    kneeDb: number;
    ratio: number;
    makeupGain: number;
    sampleRateHz: number;
    releaseCoefficient: number;
    port: { onmessage: ((event: { data: Record<string, unknown> }) => void) | null };
  };

  it("⭐ applies a later settings message, in every field a rebuild can move", () => {
    const Processor = loadProcessor();
    const processor = new Processor({ processorOptions: { thresholdDb: -16, ratio: 2 } }) as unknown as Live;
    expect(processor.thresholdDb).toBe(-16);
    expect(processor.ratio).toBe(2);

    expect(processor.port.onmessage, "the worklet listens for settings").toBeTypeOf("function");
    processor.port.onmessage!({ data: { thresholdDb: -24, kneeDb: 12, ratio: 4, makeupDb: 6, releaseSec: 0.5 } });

    expect(processor.thresholdDb).toBe(-24);
    expect(processor.kneeDb).toBe(12);
    expect(processor.ratio).toBe(4);
    // The makeup travels with the message too, so a rebuild's makeup is not left at the constructor's value.
    expect(processor.makeupGain).toBeCloseTo(Math.pow(10, 6 / 20), 10);
    expect(processor.releaseCoefficient).toBeGreaterThan(0);
  });

  it("⚠️ takes the rate from the worklet scope when a message omits one, which is the context's own rate", () => {
    /**
     * A settings message from a strip carries compressor values and nothing about the rate, so the omitted field
     * falls back to the scope's `sampleRate` global — and in a real worklet scope that global **is** the context's
     * rate, the same number the graph would have passed at construction. Nothing is lost, and the alternative is
     * worse: a constant would compute every one-pole for the wrong rate, which sounds nearly right.
     *
     * The sandbox runs at 44100 while the constructor is handed an explicit 48000, so this states the contract
     * rather than an imaginary mismatch between the two.
     */
    const Processor = loadProcessor();
    const processor = new Processor({ processorOptions: { sampleRate: 48000 } }) as unknown as Live;
    expect(processor.sampleRateHz, "an explicit rate is honoured at construction").toBe(48000);

    processor.port.onmessage!({ data: { thresholdDb: -20 } });
    expect(processor.sampleRateHz, "an omitted rate falls back to the scope's own").toBe(44100);
  });

  it("still answers the shipped constructor path, so the bus is unaffected by the new road", () => {
    // The bus never sends a message; its behaviour must be exactly what it was.
    const Processor = loadProcessor();
    const processor = new Processor({ processorOptions: { thresholdDb: -18, kneeDb: 6, ratio: 3 } }) as unknown as Live;
    expect(processor.thresholdDb).toBe(-18);
    expect(processor.kneeDb).toBe(6);
    expect(processor.ratio).toBe(3);
  });
});

/**
 * ⭐ **The gain reduction comes back, but only when a channel strip asks for it.**
 *
 * A strip's meter used to read `DynamicsCompressorNode.reduction`; it now reads the processor's own report, so the
 * worklet has to be able to answer — and the bus must not start posting messages on behalf of a reader that does not
 * exist. The report is edge-gated inside the processor, so a quiet or steady strip costs nothing.
 */
describe("the glue-compressor worklet reports gain reduction only when asked", () => {
  const block = (value: number, frames = 128) => new Float32Array(frames).fill(value);

  const drive = (
    processor: { process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean },
    level: number
  ): void => {
    processor.process([[block(level), block(level)]], [[new Float32Array(128), new Float32Array(128)]]);
  };

  it("posts nothing at all when the caller did not ask — the bus path is unchanged", () => {
    const sink: unknown[] = [];
    const Processor = loadProcessor(sink);
    const processor = new Processor({ processorOptions: { thresholdDb: -24, ratio: 8 } });
    for (let i = 0; i < 20; i += 1) drive(processor, i % 2 === 0 ? 0.9 : 0.02);
    expect(sink).toEqual([]);
  });

  it("⭐ posts a non-positive reduction, gated on change rather than once per block", () => {
    const sink: { type?: string; reductionDb?: number }[] = [];
    const Processor = loadProcessor(sink);
    const processor = new Processor({
      processorOptions: { thresholdDb: -24, ratio: 8, attackSec: 0, releaseSec: 0, reportReduction: true },
    });

    // A hard hit: reduction appears, and the message carries the same sign `DynamicsCompressorNode.reduction` does.
    drive(processor, 0.9);
    expect(sink.length).toBeGreaterThan(0);
    expect(sink[0].type).toBe("reduction");
    expect(sink[0].reductionDb!).toBeLessThanOrEqual(0);
    const afterHit = sink.length;

    // The same level again: the value cannot move, so the gate stops the stream.
    for (let i = 0; i < 10; i += 1) drive(processor, 0.9);
    expect(sink.length, "a steady note is not a message per block").toBe(afterHit);

    // A quiet passage releases the gain, which is a real change and therefore a real report.
    for (let i = 0; i < 200; i += 1) drive(processor, 0.001);
    expect(sink.length).toBeGreaterThan(afterHit);
    expect(sink.at(-1)!.reductionDb!).toBeLessThanOrEqual(0);

    /** Nothing the processor posts is a number a meter should not trust. */
    for (const message of sink) {
      expect(message.type).toBe("reduction");
      expect(Number.isFinite(message.reductionDb!)).toBe(true);
    }
  });
});
