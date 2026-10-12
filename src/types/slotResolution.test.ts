import { describe, expect, it } from "vitest";
import { patternForSlot } from "./project";
import type { SequencerPattern } from "./genre";
import type { ClipSlot } from "../types/song";

/**
 * The slot resolver — the one place a `ClipSlot` becomes a pattern.
 *
 * `ClipSlot` has been `ClipSlot | "C" | "D"` since the song layer was written and the MCP tools compose with all four, while the
 * editor's model held two. Adding the extras is **additive** (`extraClips` is optional), and every lookup by slot goes through
 * here so the two required slots and the optional ones cannot be confused — which is exactly what the type checker reported when
 * `songChain` was widened (`docs/DAW_MCP_REFACTOR.md`).
 */
const pattern = (name: string) => ({ name, tracks: [] }) as unknown as SequencerPattern;

describe("patternForSlot", () => {
  const project = { patterns: { A: pattern("a"), B: pattern("b") }, extraClips: { C: pattern("c") } };

  it("reads the two required slots", () => {
    expect(patternForSlot(project, "A")).toBe(project.patterns.A);
    expect(patternForSlot(project, "B")).toBe(project.patterns.B);
  });

  it("reads a slot beyond them, and answers undefined when there is none", () => {
    expect(patternForSlot(project, "C")).toBe(project.extraClips!.C);
    expect(patternForSlot(project, "D")).toBeUndefined();
    expect(patternForSlot({ patterns: project.patterns }, "C")).toBeUndefined();
  });
});
