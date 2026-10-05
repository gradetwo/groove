import { describe, expect, it } from "vitest";
import { MEASURED_RENDER_COST } from "../../mcp/render/budget";
import { CLIENT_TIMEOUT_FACTOR, estimateRenderCost } from "../../mcp/render/estimate";

/**
 * ⭐ **The point of the estimate is that its numbers come from measurements, not from this test's opinion.**
 */
describe("the render estimate", () => {
  it("scales the audio seconds with bars and tempo, and keeps the measured ratio", () => {
    const eight = estimateRenderCost({ bars: 8, bpm: 120 });
    expect(eight.audioSeconds).toBe(16); // 8 bars * 4 beats / 2 beats per second
    expect(eight.basis.fullRateRatio).toBe(MEASURED_RENDER_COST.fullRateRatio);
    const sixteen = estimateRenderCost({ bars: 16, bpm: 120 });
    expect(sixteen.audioSeconds).toBe(32);
    // ⭐ Twice the audio costs twice the render, with the same start.
    expect(sixteen.estimatedWallSec - eight.estimatedWallSec).toBeCloseTo(16 * MEASURED_RENDER_COST.fullRateRatio, 0);
  });

  it("suggests a client timeout above its own estimate, by the stated factor", () => {
    const estimate = estimateRenderCost({ bars: 32, bpm: 120, notes: 1200 });
    expect(estimate.suggestedClientTimeoutSec).toBeGreaterThanOrEqual(Math.ceil(estimate.estimatedWallSec * CLIENT_TIMEOUT_FACTOR));
    expect(estimate.estimatedWallSecRange[0]).toBeLessThan(estimate.estimatedWallSec);
    expect(estimate.estimatedWallSecRange[1]).toBeGreaterThan(estimate.estimatedWallSec);
  });

  it("refuses an input it cannot reason about rather than returning a number", () => {
    expect(() => estimateRenderCost({ bars: 0, bpm: 120 })).toThrow(/bars/);
    expect(() => estimateRenderCost({ bars: 8, bpm: 0 })).toThrow(/bpm/);
  });
});
