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
const loadProcessor = (): new (options: { processorOptions?: Record<string, unknown> }) => {
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
    port = { postMessage: () => {} };
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
