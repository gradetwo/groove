/**
 * ⭐ **The development-workflow skill keeps the facts it was written to carry** (docs/skills/groove-dev-workflow/SKILL.md).
 *
 * The skill lives in the repository so a criterion can hold it: the installed copy under the home skills directory is
 * derived from this file, and a check cannot reach outside the tree. Every assertion fails if the corresponding rule is
 * deleted — advice that disappears silently is advice an agent will not follow.
 *
 * The rules pinned here are the ones that were each paid for by a real failure, so deleting one is deleting a lesson.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const skill = readFileSync("docs/skills/groove-dev-workflow/SKILL.md", "utf8");

describe("the development workflow skill", () => {
  it("⭐ keeps the rules that failures produced", () => {
    for (const rule of [
      "Measure before changing",
      "A criterion must be able to fail",
      "Gate the commit on the type checker",
      "Never pipe a gate",
          "Never let a test be the last command",
      "run the checks that derive the count",
      "Find the touched set by searching",
      "is not \"it is needed\"",
      "patch equivalence",
      "One writer per file",
          "Profile the big contributor",
          "the criterion that watches it",
          "more than one criterion derived from it",
    ])
      expect({ rule, present: skill.includes(rule) }).toEqual({ rule, present: true });
  });

  it("⭐ keeps the workflow, the parallel method and the deletion order", () => {
    for (const part of [
      "## Per-change workflow",
      "## Fast multi-line iteration",
      "One worktree per line of work",
      "## Before deleting anything",
      "read back",
      "## Honesty rules",
      "Local green is not green",
    ])
      expect({ part, present: skill.includes(part) }).toEqual({ part, present: true });
  });

  it("⭐ keeps the licence discipline for outside work", () => {
    const reach = skill.slice(skill.indexOf("## Reach outside before you invent"));
    expect(reach.length, "the section is gone").toBeGreaterThan(0);
    for (const fact of ["MIT/Apache", "GPL", "attribution", "do not copy the code", "record the search"])
      expect({ fact, present: reach.includes(fact) }).toEqual({ fact, present: true });
  });
});
