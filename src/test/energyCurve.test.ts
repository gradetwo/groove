import { describe, expect, it } from "vitest";
import { energyCurveDb } from "../../mcp/render/worker";

/**
 * The energy curve, on a buffer whose answer is known.
 *
 * The gate cannot hold this check — it is deliberately browser-free and a curve needs a rendered WAV — so it lives here, over a
 * synthetic buffer with a build in it. That is the acceptance line from `docs/V4_REVIEW_PLAN.md` in its cheapest honest form: a curve
 * that distinguishes a quiet half from a loud half, at one value per second, with no renderer involved.
 */
const channel = (seconds: number, amplitude: number, sampleRate = 8000) => {
  const data = new Float32Array(seconds * sampleRate);
  for (let i = 0; i < data.length; i += 1) data[i] = amplitude * Math.sin((2 * Math.PI * 220 * i) / sampleRate);
  return data;
};

describe("energyCurveDb", () => {
  it("rises across a build and reports the spread", () => {
    // Four quiet seconds, then four at four times the amplitude: +12 dB by definition.
    const samples = new Float32Array(8 * 8000);
    samples.set(channel(4, 0.05), 0);
    samples.set(channel(4, 0.2), 4 * 8000);

    const { curve, spreadDb } = energyCurveDb([samples], 8000);

    expect(curve).toHaveLength(8);
    expect(spreadDb).toBeGreaterThan(10); // ≈ 12 dB for a 4× amplitude step
    expect(spreadDb).toBeLessThan(14);
    // The last second is louder than the first, which is what "the build rises into the drop" looks like as data.
    expect(curve[curve.length - 1]).toBeGreaterThan(curve[0]);
  });

  it("is flat for a flat signal, so a curve cannot invent a build", () => {
    const { curve, spreadDb } = energyCurveDb([channel(4, 0.1)], 8000);
    expect(curve).toHaveLength(4);
    expect(spreadDb).toBeLessThan(1);
  });
});
