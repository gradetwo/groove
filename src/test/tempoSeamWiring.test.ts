import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The tempo seam's **inert** half, pinned as a source contract.
 *
 * A render cannot be inspected from here (it needs a browser), and the guard that actually measures byte-identity is CI's audio scope — the determinism probe's
 * six rows, the 159-genre timbre baseline and the fresh loudness re-renders. What this file can hold is the property that makes those guards decide the right
 * thing: **the no-map path is the existing expressions**, not a prefix sum that happens to agree in real arithmetic.
 *
 * `Σ (n copies of c)` and `n * c` are the same real number and not always the same float, so this is not pedantry: an unconditional prefix sum would move the
 * total duration and every event time in the last bits, and the probe resolves 0.005 dB.
 */
const source = readFileSync("src/audio/WavExporter.ts", "utf8");

describe("the tempo seam", () => {
  it("reads a map off the pattern and branches on whether one is there", () => {
    expect(source).toMatch(/const patternTempo = \(pattern as \{ tempoTrack\?: TempoPoint\[\] \}\)\.tempoTrack \?\? \[\];/);
    expect(source).toMatch(/const tempoAware = patternTempo\.length > 0;/);
  });

  it("keeps the literal old expressions on the no-map side", () => {
    // These two are the source of byte-identity: the existing arithmetic, verbatim.
    expect(source).toMatch(/const stepTimeAt = \(step: number\): number => \(timing \? timing\.starts\[step\]! : step \* stepDur\);/);
    expect(source).toMatch(/const stepLengthAt = \(step: number\): number => \(timing \? timing\.lengthAt\(step\) : stepDur\);/);
    expect(source).toMatch(/const totalDurationSec = \(timing \? timing\.total : totalSteps \* stepDur\) \+ tailSec;/);
    // And the extracted timing is only consulted when there is a map, so the no-map arithmetic is never even computed the other way.
    // Whitespace-tolerant, and no longer pinned to `totalSteps` as the second argument: a chunk legitimately
    // needs timing past the pattern's own steps, so that argument is `Math.max(totalSteps, …)` now. What this
    // guard is for is the branch — the timing is chosen by `tempoAware` through `stepTiming` — so that is what
    // it asserts. Remove the branch and it goes red; move the call onto another line and it does not.
    expect(source).toMatch(/const timing = tempoAware\s*\?\s*stepTiming\(/);
    expect(source).toMatch(/const timing = tempoAware[\s\S]{0,200}?:\s*null;/);
  });

  it("uses them at the two sites that were linear in the constant", () => {
    // The offset is subtracted after the tempo-aware time, which is the point: the site no longer uses the
    // constant. Allowing the trailing shift keeps the guard on the helper rather than on the arithmetic.
    expect(source).toMatch(/const unswungTime = stepTimeAt\(step\)(\s*-\s*[A-Za-z0-9_.]+)?;/);
    expect(source).toMatch(/const swingOffset = swingOffsetSeconds\(step, effSwing, stepLengthAt\(step\)\);/);
  });
});
