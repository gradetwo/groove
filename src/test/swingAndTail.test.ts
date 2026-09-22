import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { SWING_MAX, swingMovesStep, swingOffsetSeconds, swingPositionScale } from "../audio/swing";
import {
  RENDER_TAIL_MAX_SEC,
  RENDER_TAIL_MIN_SEC,
  resolveRenderTailSec,
} from "../audio/renderTail";
import { DEFAULT_DELAY_PARAMS } from "../audio/DelayBus";
import { DEFAULT_REVERB_PARAMS } from "../audio/ReverbBus";

/**
 * P0.5 — swing has to reach the notes that are actually playing.
 *
 * The old rule (`step % 2 === 1`) delayed the odd 16ths, so an 8th-note pattern — which is most of the library's
 * kick and hat writing — received no swing at all, and boom-bap (declared swing 60, the highest in the sample)
 * measured perfectly straight.
 */
describe("P0.5 · the swing position rule", () => {
  it("moves the off-8th fully, the off-16ths half, and never the beat", () => {
    // Within a beat: 1 (0), e (1), & (2), a (3).
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(swingPositionScale)).toEqual([0, 0.5, 1, 0.5, 0, 0.5, 1, 0.5]);
    // Negative or huge step indices still land inside a beat (the transport wraps, the maths must not).
    expect(swingPositionScale(-1)).toBe(0.5);
    expect(swingPositionScale(-2)).toBe(1);
  });

  it("gives an 8th-note pattern real swing", () => {
    // The regression this exists for: steps 0,2,4,6,... are the 8th grid, and step 2 is the "&".
    const stepDur = 0.125;
    const straight = [0, 2, 4, 6].map((step) => swingOffsetSeconds(step, 0, stepDur));
    expect(straight).toEqual([0, 0, 0, 0]);
    const swung = [0, 2, 4, 6].map((step) => swingOffsetSeconds(step, 0.6, stepDur));
    expect(swung[0]).toBe(0);
    expect(swung[1]).toBeCloseTo(0.6 * 0.5 * stepDur, 12);
    expect(swung[2]).toBe(0);
    expect(swung[3]).toBeCloseTo(0.6 * 0.5 * stepDur, 12);
  });

  it("keeps the off-8th ahead of the next off-16th at maximum swing", () => {
    // A swung off-8th at 0.75 lands 37.5% of a step late, i.e. short of the following "a" — the note order can
    // never invert, which is the property that makes the rule safe for any pattern.
    const stepDur = 0.1;
    const off8th = 2 * stepDur + swingOffsetSeconds(2, SWING_MAX, stepDur);
    const nextOff16th = 3 * stepDur + swingOffsetSeconds(3, SWING_MAX, stepDur);
    expect(off8th).toBeLessThan(nextOff16th);
    expect(4 * stepDur).toBeGreaterThan(nextOff16th);
  });

  it("clamps the amount and ignores nonsense", () => {
    expect(swingOffsetSeconds(2, 2, 0.1)).toBeCloseTo(swingOffsetSeconds(2, SWING_MAX, 0.1), 12);
    expect(swingOffsetSeconds(2, -1, 0.1)).toBe(0);
    expect(swingOffsetSeconds(2, Number.NaN, 0.1)).toBe(0);
    expect(swingOffsetSeconds(2, 0.5, 0)).toBe(0);
    expect(swingMovesStep(0)).toBe(false);
    expect(swingMovesStep(2)).toBe(true);
  });

  it("is used by both engines, so a bounce swings like the audition", () => {
    const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "..", "audio", file), "utf8");
    for (const file of ["AudioEngine.ts", "WavExporter.ts"]) {
      const source = read(file);
      expect(source, file).toMatch(/from "\.\/swing"/);
      expect(source, file).toMatch(/swingOffsetSeconds\(/);
      // The old odd-step-only rule must not survive in either engine.
      expect(source, file).not.toMatch(/step % 2 === 1 && (this\.swing|effSwing)/);
    }
  });
});

/**
 * P0.6 — the render tail.
 *
 * boom-bap measured −29.1 dBFS in its final 50 ms: with a fixed 0.6 s tail the file stops while the delay is
 * still audible.
 */
describe("P0.6 · the render tail follows the genre's own decay", () => {
  const delay = { ...DEFAULT_DELAY_PARAMS, timeSeconds: 0.25, feedback: 0.5 };
  const reverb = { ...DEFAULT_REVERB_PARAMS, decaySec: 1.8 };

  it("never goes below the old floor and never above the ceiling", () => {
    expect(resolveRenderTailSec(null, 120)).toBe(RENDER_TAIL_MIN_SEC);
    expect(resolveRenderTailSec({}, 120)).toBe(RENDER_TAIL_MIN_SEC);
    expect(resolveRenderTailSec({ reverb: { decaySec: 10 }, delay: { ...delay, feedback: 0.95 } }, 60)).toBe(
      RENDER_TAIL_MAX_SEC
    );
  });

  it("covers the reverb's RT60", () => {
    expect(resolveRenderTailSec({ reverb }, 120)).toBeCloseTo(1.8, 6);
    // A 0.4 s room still needs the floor, not 0.4 s.
    expect(resolveRenderTailSec({ reverb: { decaySec: 0.4 } }, 120)).toBe(RENDER_TAIL_MIN_SEC);
  });

  it("covers the delay's repeats until they are 60 dB down", () => {
    // feedback 0.25 falls 12 dB per repeat, so 5 repeats then the tail of the last one: 6 x 0.25 s.
    const quiet = { ...delay, feedback: 0.25 };
    expect(resolveRenderTailSec({ delay: quiet, reverb: { decaySec: 0 } }, 120)).toBeCloseTo(0.25 * 6, 6);
    // A shorter repeat interval needs proportionally less silence, and a longer one proportionally more.
    expect(resolveRenderTailSec({ delay: { ...quiet, timeSeconds: 0.125 } }, 120)).toBeCloseTo(0.125 * 6, 6);
    expect(resolveRenderTailSec({ delay: { ...quiet, timeSeconds: 0.5 } }, 120)).toBeCloseTo(3, 6);
    // A tempo-synced division is resolved at the *playing* tempo, exactly as the graph resolves it.
    const at60 = resolveRenderTailSec({ delay: { ...quiet, timeSeconds: 0 }, delayDivision: "1/8" }, 60);
    const at240 = resolveRenderTailSec({ delay: { ...quiet, timeSeconds: 0 }, delayDivision: "1/8" }, 240);
    expect(at60).toBeCloseTo(0.5 * 6, 6);
    expect(at240).toBeCloseTo(0.125 * 6, 6);
    expect(at60).toBeGreaterThan(at240);
  });

  it("is what the renderer uses for its length", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "..", "audio", "WavExporter.ts"), "utf8");
    expect(source).toMatch(/resolveRenderTailSec\(tailGenreFx, bpm\)/);
    expect(source).toMatch(/totalSteps \* stepDur \+ tailSec/);
    // The literal that cut boom-bap's tail must be gone.
    expect(source).not.toMatch(/totalSteps \* stepDur \+ 0\.6/);
  });
});
