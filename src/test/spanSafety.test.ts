import { describe, expect, it } from "vitest";
import { spanSafety } from "../../mcp/render/spanHosts";

/**
 * ⭐ **Spans are only used where they are the same music.**
 *
 * The measurement behind this: a template arrangement renders **sample-identical** through the span path (K=2,
 * cross-process, pre-roll + crossfade + merge), while a pattern whose sample lane carries no notes differs by
 * **−1.3 dBFS** — because that lane's one-shot plays at the start of *whatever* is rendered, so a window starts it again.
 * A guard that can be wrong is worse than no guard, so it is checked here rather than trusted.
 */
describe("span safety", () => {
  it("⭐ refuses a lane that has a sample and no notes, and names the lane", () => {
    const verdict = spanSafety({
      tracks: [{ track_id: "audio", assetId: "virtuosity-drums-basic" }],
      notes: {},
    } as never);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("audio");
  });

  it("accepts a sample lane that has notes, and a lane with no sample at all", () => {
    expect(spanSafety({ tracks: [{ track_id: "audio", assetId: "salamander-grand" }], notes: { audio: [{ step: 0 }] } } as never).ok).toBe(true);
    expect(spanSafety({ tracks: [{ track_id: "lead", role: "lead" }], notes: {} } as never).ok).toBe(true);
    expect(spanSafety({ tracks: [], notes: {} } as never).ok).toBe(true);
  });
});
