import { describe, expect, it } from "vitest";
import { defaultChunksFor, DEFAULT_CHUNKS_MAX } from "../../mcp/render/spanHosts";

/**
 * ⭐ **How many spans a render uses when nobody says.**
 *
 * The owner's decision (2026-10-08) is that a long piece is chunked by default, and the measurement behind it is one
 * pass 753 s vs K=8 297 s on an eight-core machine. The two ways that decision can be wrong are both pinned here: a
 * short piece paying per-process setup for nothing, and a small machine being handed more spans than it has cores.
 */
describe("the default span count", () => {
  it("⭐ leaves a short piece alone, and never asks for more spans than the machine has cores", () => {
    expect(defaultChunksFor(8, 8)).toBe(1);
    expect(defaultChunksFor(15, 8)).toBe(1);
    expect(defaultChunksFor(16, 8)).toBe(4);
    expect(defaultChunksFor(126, 8)).toBe(DEFAULT_CHUNKS_MAX);
    // Four cores: the same long piece gets four spans, not eight — the count is clamped, not promised.
    expect(defaultChunksFor(126, 4)).toBe(4);
    expect(defaultChunksFor(126, 3)).toBe(3);
    // Two cores or fewer is contention, not throughput: one pass.
    expect(defaultChunksFor(126, 2)).toBe(1);
    expect(defaultChunksFor(126, 1)).toBe(1);
  });
});
