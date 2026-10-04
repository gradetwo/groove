/**
 * ⭐ **The composition skill carries the facts the owner's report asked for** (docs/skills/groove-composition/SKILL.md).
 *
 * The skill lives in the repository so that this can hold it: the installed copy under `~/skills/` is derived from this
 * file, and a criterion cannot reach outside the tree. Every assertion here fails if the corresponding advice is
 * deleted, which is the point — advice that silently disappears is advice an agent will not follow.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const skill = readFileSync("docs/skills/groove-composition/SKILL.md", "utf8");

describe("the groove-composition skill", () => {
  it("⭐ keeps the four things that stop a piano part sounding mechanical", () => {
    for (const fact of ["velocity", "CC64", "±10–20 ticks", "fades at its end"])
      expect({ fact, present: skill.includes(fact) }).toEqual({ fact, present: true });
  });

  it("⭐ keeps the tool facts that were each measured", () => {
    for (const fact of ["an object, not a string", "virtuosity-drums-basic", "export_arrangement_midi", "render_arrangement_preview"])
      expect({ fact, present: skill.includes(fact) }).toEqual({ fact, present: true });
  });

  it("⭐ says that a preview hands back a file rather than playing it", () => {
    expect(skill).toContain("hand back files");
    expect(skill).toContain("playing them is the caller's job");
  });
});
