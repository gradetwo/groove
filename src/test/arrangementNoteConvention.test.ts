import { describe, expect, it } from "vitest";
import { summariseArrangement } from "../../mcp/arrangement";
import { arrangementSeededFromGenre } from "../data/arrangementProjection";
import { GENRES_MAP } from "../data/genres";
import type { ArrangementV2 } from "../types/arrangementV2";

/**
 * ⭐ **The convention a project carries, ported from the older song model.**
 *
 * A note number is the truth and a name is a display choice, so a project only has to carry the choice. A file that states none
 * reads as C4, and the criterion that matters most is the second: changing the convention must not move a note number.
 */
const seeded = (): ArrangementV2 => arrangementSeededFromGenre("new", Object.values(GENRES_MAP)[0]!);

describe("the note-name convention an arrangement carries", () => {
  it("reads a project that states none as C4, and says so instead of leaving a reader to guess", () => {
    const summary = summariseArrangement("new", seeded());
    expect(summary.noteConvention).toBeUndefined();
    expect(summary.pitchNote).toContain("no note-name convention");
    expect(summary.pitchNote).toContain("no migration");
    expect(summary.pitchNote).toContain("C4");
  });

  it("⭐ changes a label and not a single note number — which is what makes migration unnecessary", () => {
    const before = seeded();
    const stated: ArrangementV2 = { ...before, noteConvention: "C3" };
    const summary = summariseArrangement("new", stated);
    expect(summary.noteConvention).toBe("C3");
    expect(summary.pitchNote).toBeUndefined();
    expect(JSON.stringify(stated.notesByTrack)).toBe(JSON.stringify(before.notesByTrack));
  });

  it("clears back to the state a project that never stated one is in", () => {
    const stated: ArrangementV2 = { ...seeded(), noteConvention: "C5" };
    const cleared: ArrangementV2 = { ...stated };
    delete cleared.noteConvention;
    expect(summariseArrangement("new", cleared).noteConvention).toBeUndefined();
    expect(summariseArrangement("new", cleared).pitchNote).toBeDefined();
  });
});
