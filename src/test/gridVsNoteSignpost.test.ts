import { describe, expect, it } from "vitest";
import { TOOLS } from "../../mcp/registry";

/**
 * ⭐ **A caller who reaches the step tool must be told the note tool exists.**
 *
 * A report arrived saying the step grid makes narrative melody impossible — syllable lengths, dotted notes,
 * ties, notes held across a bar, a lyric line — and that a model writing melody through MCP can only chop it
 * into a `steps` array. The audit (`docs/DATA_MODEL_AUDIT.md`) found the capability was already there, in a
 * different model: `add_arrangement_note` takes `startBeats` with fractional values allowed and a `lengthBeats`
 * with no upper bound, the arrangement type carries a lyric on the note itself, and that tool's own description
 * already says it is "not limited to a grid — a note may begin between steps and last across several".
 *
 * So the gap was not a missing feature but a missing signpost. The description of the *right* tool cannot help
 * someone reading the *wrong* one, and `set_arrangement_track_steps` said nothing about it. These criteria pin
 * the signpost, and the note tool's own wording, so the two cannot drift apart silently.
 */
const tool = (name: string) => TOOLS.find((candidate) => candidate.name === name);

describe("the signpost between the step grid and the note model", () => {
  it("⭐ the step tool names `add_arrangement_note` as the way to write a melody", () => {
    const steps = tool("set_arrangement_track_steps");
    expect(steps, "set_arrangement_track_steps must exist").toBeDefined();
    // Without this, a caller who starts at the grid never learns there is a better model for a sung line.
    expect(steps!.description).toContain("add_arrangement_note");
    // And it says why, so the advice is actionable rather than a bare pointer.
    expect(steps!.description).toMatch(/one bar|dotted|ties|fractional/i);
  });

  it("the step tool still describes what it is for, so the signpost did not replace it", () => {
    const steps = tool("set_arrangement_track_steps")!;
    expect(steps.description).toContain("step pattern");
    // The pre-existing refusal behaviour stays stated: an effect or folder track has no steps.
    expect(steps.description).toMatch(/effect and folder/);
  });

  it("the note tool keeps the promise the signpost makes", () => {
    const note = tool("add_arrangement_note");
    expect(note, "add_arrangement_note must exist").toBeDefined();
    // The three claims the signpost sends a caller to: beats, no grid, no cap.
    expect(note!.description).toMatch(/\*\*beats\*\*|beats/);
    expect(note!.description).toMatch(/not limited to a grid/);
    expect(note!.description).toMatch(/across several/);
    // And the schema really has to allow it, or the signpost points at a promise the tool cannot keep.
    const shape = note!.inputSchema as Record<string, { safeParse?: (value: unknown) => { success: boolean } }>;
    expect(shape.startBeats?.safeParse?.({})?.success).toBe(false); // required
    expect(shape.startBeats?.safeParse?.(2.5)?.success).toBe(true); // fractional allowed, not just integers
    expect(shape.lengthBeats?.safeParse?.(64)?.success).toBe(true); // no cap at a bar
    expect(shape.lengthBeats?.safeParse?.(0.25)?.success).toBe(true);
  });
});
