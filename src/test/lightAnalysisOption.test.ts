import { describe, expect, it } from "vitest";
import { measure } from "../../mcp/render/worker";

/**
 * ⭐ **Loudness without the per-sample scan** (the evaluation's F07 recommendation and its section 6 ask for a light
 * analysis).
 *
 * The discontinuity scan is the one expensive metric in `measure`: 287 s on five minutes of audio before it was rolled,
 * 10 s after, against well under a second for loudness, peaks, correlation and the spectral balance. A caller checking a
 * mix level paid for it anyway. The option skips it — and, importantly, **omits** its three fields rather than filling
 * them with zero, because a zero count reads as "no clicks found" when it means "not measured".
 */
const tone = (seconds: number) => {
  const sampleRate = 44_100;
  const channel = new Float32Array(sampleRate * seconds);
  for (let i = 0; i < channel.length; i += 1) channel[i] = Math.sin((2 * Math.PI * 220 * i) / sampleRate) * 0.4;
  return { channel, sampleRate };
};

describe("the analysis's light mode", () => {
  it("⭐ omits the discontinuity readings instead of reporting zero of them", () => {
    const { channel, sampleRate } = tone(2);
    const full = measure([channel], sampleRate);
    const light = measure([channel], sampleRate, { discontinuities: false });

    /**
     * ⭐ **What a caller receives is JSON**, and this is where "absent" has to hold: an object property set to
     * `undefined` is dropped by serialisation, so the wire reply has no such field — while a `0` would survive and read as
     * "no clicks found". Checking the serialised reply is checking the thing the caller acts on.
     */
    const wireFull = JSON.parse(JSON.stringify(full)) as Record<string, unknown>;
    const wireLight = JSON.parse(JSON.stringify(light)) as Record<string, unknown>;
    for (const field of ["discontinuities", "worstDiscontinuityDb", "worstDiscontinuitySec"]) {
      expect(field in wireFull, `${field} is in the full reply`).toBe(true);
      expect(field in wireLight, `${field} must be absent, not zero, when the scan was skipped`).toBe(false);
    }
    // ⭐ The cheap metrics are still there: this is a narrower answer, not an emptier one.
    for (const field of ["integratedLufs", "truePeakDb", "samplePeakDb", "correlation", "centroidHz", "bandDb"]) {
      expect(light[field], `${field} survives the light mode`).toBeDefined();
      expect(light[field]).toEqual((full as Record<string, unknown>)[field]);
    }
  });
});
