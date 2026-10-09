import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { unknownArguments } from "../../mcp/toolKit";
import { loudnessReport } from "../../mcp/exporting";

/**
 * ⭐ **The two P2s of the MCP deep test on v2.35.9** (2026-10-10).
 *
 * 1. `export_arrangement_midi` was called with `path` where the tool declares `outputDir` + `filename`; zod removed the
 *    unknown key without a word and the file was written to a directory the caller never named. Nothing errored, which is
 *    what made it silent rather than rejected — the same shape as the v1 passthrough defect, in the arguments this time.
 * 2. `get_loudness_report` answered with `generatedAt: 2026-09-26`, two weeks before the run: it returns the **committed
 *    genre baseline**, which is correct data and was reported as if it were this session's measurement.
 */
describe("what a tool says about the arguments it never declared", () => {
  it("⭐ names every unknown key, so a typo becomes a sentence instead of a missing field", () => {
    const shape = { arrangementId: z.string(), outputDir: z.string().optional() };
    expect(unknownArguments(shape, { arrangementId: "a1", path: "/tmp/x" })).toEqual(["path"]);
    expect(unknownArguments(shape, { arrangementId: "a1", outputDir: "/tmp", filename: "x.groove" })).toEqual(["filename"]);
  });

  it("says nothing when every argument is declared", () => {
    const shape = { path: z.string() };
    expect(unknownArguments(shape, { path: "/tmp/a.wav" })).toEqual([]);
  });

  it("⭐ and the server's own wrapper asks it, rather than each tool remembering to", () => {
    const server = readFileSync(resolve(__dirname, "../../mcp/server.ts"), "utf8");
    expect(server, "the wrapper computes the unknown keys").toContain("unknownArguments(tool.inputSchema");
    expect(server, "and puts them in the reply").toContain("unknownArgs");
  });
});

describe("what the loudness report says it is", () => {
  it("⭐ names itself a committed baseline, not a measurement of this session", () => {
    const report = loudnessReport();
    expect(report.source).toBe("committed-baseline");
    const note = String(report.note);
    expect(note, "the date is explained").toMatch(/generatedAt/);
    expect(note, "and the reply says where a real measurement comes from").toMatch(/render/);
    expect(typeof report.generatedAt, "the baseline's own date is still reported").toBe("string");
  });
});
