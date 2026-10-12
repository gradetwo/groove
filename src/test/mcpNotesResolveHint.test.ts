/**
 * ⭐ **The bulk note tool must point at the cheap way to find out whether a pitch sounds.**
 *
 * A creation run wrote notes without knowing the instrument's real range — the zither's samples are named G4 to C7 while
 * its regions cover 40 to 72 — and only learned which notes were dropped after rendering the whole song, about two
 * minutes per track, three times over. No tool exposes an SFZ's keyranges, which the arrangement messages already say,
 * but a single note can be resolved cheaply. The bulk tool's own text should say so, because that is where a caller
 * decides whether to write notes it has not checked.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * ⭐ The note tools live in their own module: `registryArrangement` was split so it stays under its measured size, and the bulk note tool went
 * with the other four.
 */
const registry = readFileSync("mcp/registryArrangementNotes.ts", "utf8");

describe("add_arrangement_notes", () => {
  it("⭐ names the tool that resolves one pitch before an expensive render", () => {
    const start = registry.indexOf('name: "add_arrangement_notes"');
    expect(start, "add_arrangement_notes is gone").toBeGreaterThan(-1);
    const end = registry.indexOf("handler:", start);
    const block = registry.slice(start, end);
    expect({ namesTheProbe: block.includes("get_pitch_report") }).toEqual({ namesTheProbe: true });
  });
});
