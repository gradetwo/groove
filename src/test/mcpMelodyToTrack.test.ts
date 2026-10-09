import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { melodyNotes } from "../../mcp/melody";

/**
 * ⭐ **The arithmetic the creator was doing by hand** (MCP deep test of v2.35.9: *"創作者要自己拼 `startBeats = i*0.5`"*).
 *
 * `generate_melody` returns four parallel arrays on a sixteenth grid — `STEPS_PER_BAR = 16` is that module's own constant —
 * and putting them on a track meant zipping them and inferring the grid. `melodyNotes` is that step, with the default
 * derived from the constant rather than restated so the two cannot drift.
 */
describe("a generated melody as notes", () => {
  it("⭐ places a step on the sixteenth grid and a gate in the same steps", () => {
    const notes = melodyNotes({ steps: [0, 4, 8], pitch: [60, 62, 64], velocity: [100, 90, 80], gate: [2, 4, 1] });
    expect(notes).toEqual([
      { pitch: 60, startBeats: 0, lengthBeats: 0.5, velocity: 100 },
      { pitch: 62, startBeats: 1, lengthBeats: 1, velocity: 90 },
      { pitch: 64, startBeats: 2, lengthBeats: 0.25, velocity: 80 },
    ]);
  });

  it("uses the caller's grid when the melody is not on this one", () => {
    const notes = melodyNotes({ steps: [0, 1], pitch: [60, 62], velocity: [100, 100], gate: [1, 1] }, 0.5);
    expect(notes.map((note) => note.startBeats)).toEqual([0, 0.5]);
  });

  it("never writes a note shorter than a sixteenth, so a zero gate still sounds", () => {
    const notes = melodyNotes({ steps: [0], pitch: [60], velocity: [100], gate: [0] });
    expect(notes[0]!.lengthBeats).toBe(0.25);
  });

  it("stops at the shortest array rather than writing undefined pitches", () => {
    const notes = melodyNotes({ steps: [0, 1, 2], pitch: [60, 62], velocity: [100, 100, 100], gate: [1, 1, 1] });
    expect(notes).toHaveLength(2);
  });

  it("⭐ and the tool that uses it writes onto a named track through the writer that refuses unknown ones", () => {
    const registry = readFileSync(resolve(__dirname, "../../mcp/registryExamples.ts"), "utf8");
    expect(registry, "the tool exists").toContain('name: "melody_to_track"');
    expect(registry, "it converts through this function").toContain("melodyNotes(");
    expect(registry, "and writes through the existing writer, which refuses an unknown track (F04)").toContain("addMcpTrackNotes(");
  });
});
