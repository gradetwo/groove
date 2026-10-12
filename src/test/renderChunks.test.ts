import { describe, expect, it } from "vitest";
import { planRenderChunks } from "../../mcp/render/chunks";

/**
 * The chunk plan for a long render (fifth report, P0). Pure on purpose: the failure this protects against — a missing or repeated bar — is invisible in a
 * twenty-minute probe and obvious here.
 */
const covers = (chunks: Array<{ fromBar: number; toBar: number }>, total: number) => {
  if (total === 0) return chunks.length === 0;
  if (chunks[0]?.fromBar !== 0) return false;
  if (chunks[chunks.length - 1]?.toBar !== total) return false;
  for (let i = 1; i < chunks.length; i += 1) if (chunks[i]!.fromBar !== chunks[i - 1]!.toBar) return false;
  return true;
};

describe("planRenderChunks", () => {
  it("covers the song exactly once, in order, with no gap and no overlap", () => {
    for (const [total, boundaries, cap] of [
      [100, [40], 64],
      [348, [0, 40, 96, 160, 240, 300], 64],
      [513, [], 64],
      [8, [], 64],
      [200, [50, 100, 150], 30],
    ] as const) {
      const chunks = planRenderChunks(total, boundaries, cap);
      expect(covers(chunks, total), `${total}/${cap}: ${JSON.stringify(chunks)}`).toBe(true);
    }
  });

  it("never asks for more bars than the exporter accepts", () => {
    const chunks = planRenderChunks(1000, [100, 300, 700], 64);
    for (const chunk of chunks) expect(chunk.toBar - chunk.fromBar).toBeLessThanOrEqual(64);
  });

  it("prefers to end a chunk where a section ends", () => {
    // 100 bars with a section boundary at 40, cap 64: two chunks, cut at the boundary rather than at 64.
    expect(planRenderChunks(100, [40], 64)).toEqual([
      { fromBar: 0, toBar: 40 },
      { fromBar: 40, toBar: 100 },
    ]);
  });

  it("splits a section that is longer than the cap, because the cap is a hard limit", () => {
    const chunks = planRenderChunks(100, [90], 30);
    expect(chunks).toEqual([
      { fromBar: 0, toBar: 30 },
      { fromBar: 30, toBar: 60 },
      { fromBar: 60, toBar: 90 },
      { fromBar: 90, toBar: 100 },
    ]);
  });

  it("handles the degenerate cases: no bars, one bar, one bar per chunk, and boundaries outside the song", () => {
    expect(planRenderChunks(0, [10], 64)).toEqual([]);
    expect(planRenderChunks(1, [], 64)).toEqual([{ fromBar: 0, toBar: 1 }]);
    expect(planRenderChunks(3, [], 1)).toEqual([
      { fromBar: 0, toBar: 1 },
      { fromBar: 1, toBar: 2 },
      { fromBar: 2, toBar: 3 },
    ]);
    // Boundaries at or past the edges are the song's own edges, and duplicates or disorder must not produce a second cut.
    expect(planRenderChunks(50, [0, 50, 99, 25, 25], 64)).toEqual([
      { fromBar: 0, toBar: 25 },
      { fromBar: 25, toBar: 50 },
    ]);
  });
});
