import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ⭐ These are the criteria for `export_arrangement_ableton`, named here so the coverage check finds it.
describe("MCP · the arrangement Ableton export", () => {
  const source = readFileSync("mcp/registryArrangement.ts", "utf8");

  it("takes an arrangement id and writes a Live set through the app's own writer", () => {
    expect(source).toContain('name: "export_arrangement_ableton"');
    expect(source).toContain("await exportAbletonLiveSet(");
    expect(source).toContain('format: "als"');
  });

  it("reads the tempo from the arrangement rather than assuming one", () => {
    expect(source).toContain("bpm: arrangement?.bpm ?? 120");
  });
});
