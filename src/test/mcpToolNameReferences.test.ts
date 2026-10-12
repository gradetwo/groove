import { describe, expect, it } from "vitest";
import { TOOLS } from "../../mcp/registry";

/**
 * ⭐ **A description may only name tools that exist** (third evaluation, L02).
 *
 * The evaluation read `analyze_audio`'s description, found a **retired** tool name in it, and compared it against the live
 * `tools/list`: an agent following the description would build a call that cannot succeed. Descriptions are the half of
 * the surface a model reads before acting, and nothing was holding them to the schemas beside them — `mcpCoverage` checks
 * that operations map to tools, not that prose maps to tools.
 *
 * The rule is narrow on purpose: only identifiers that **look like tool names** (a verb the surface uses, an underscore,
 * a noun) are checked, so an ordinary phrase cannot trip it. A name that is deliberately not a tool goes in `ALLOWED`
 * with its reason, the same explicit-decision style the other gates use.
 */
const TOOL_NAMES = new Set(TOOLS.map((tool) => tool.name));

/** ⭐ Names that are not tools and are named on purpose, each with the reason it stays. */
const ALLOWED = new Map<string, string>([
  // e.g. ["get_song", "the retired v1 tool, named in a migration note"] — empty until a name earns a reason.
]);

const LOOKS_LIKE_A_TOOL = /\b(get|list|add|set|render|export|analyze|validate|import|create|remove|move|quantize|vary|transpose|collect|search|read|write|delete|update)_[a-z][a-z0-9_]*\b/g;

describe("the MCP descriptions name the tools that exist", () => {
  it("⭐ every tool-looking identifier in a description is on the surface, or allowed with a reason", () => {
    const offenders: Array<{ tool: string; name: string }> = [];
    for (const tool of TOOLS) {
      const text = `${tool.title ?? ""}\n${tool.description ?? ""}`;
      for (const match of text.matchAll(LOOKS_LIKE_A_TOOL)) {
        const name = match[0];
        if (TOOL_NAMES.has(name) || ALLOWED.has(name)) continue;
        offenders.push({ tool: tool.name, name });
      }
    }
    const unique = [...new Map(offenders.map((entry) => [`${entry.tool}→${entry.name}`, entry])).values()];
    expect(
      unique,
      `descriptions name ${unique.length} identifier(s) that are not tools: ${unique.map((entry) => `${entry.name} (in ${entry.tool})`).join(", ")}`
    ).toEqual([]);
  });
});
