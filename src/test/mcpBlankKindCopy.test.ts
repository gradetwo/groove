/**
 * ⭐ **The blank-kind description survives truncation** (owner's MCP report, 2026-10-04).
 *
 * The report could not find the piano recipe: the description did contain it, but the sentence naming it came *after*
 * the `synth` default, so a client that shortens long descriptions showed the default and hid the answer. The report's
 * own remedy was "write it out, or say plainly that a piano is a sampler plus an asset"; the description is reordered
 * so the fact comes first and this criterion holds it there.
 *
 * It fails if the piano fact moves past the first 120 characters, which is what the old order did.
 */
import { describe, expect, it } from "vitest";
import { TOOLS } from "../../mcp/registry";

describe("the blank-kind description", () => {
  it("⭐ names the piano recipe in its first 120 characters", () => {
    const tool = TOOLS.find((t) => t.name === "create_arrangement");
    expect(tool, "create_arrangement is gone").toBeDefined();
    const described = String((tool!.inputSchema as Record<string, { description?: string }>).blankKind?.description ?? "");
    expect(described.slice(0, 120)).toContain("sampler");
    expect(described).toContain("assetId");
    // The facts the report needed are all still there, not just the first one.
    expect(described).toContain("synth");
    expect(described).toContain("templateId");
  });
});
