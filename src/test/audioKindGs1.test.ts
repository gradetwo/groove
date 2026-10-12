import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GS1_ROUTED_ROLES } from "../audio/gs1/gs1Tracks";

/**
 * The ninth kind, `audio`, versus GS-1's voice hosts (owner decision 2026-09-28).
 *
 * The exclusion the decision record asks for is **correct by absence** today: `GS1_ROUTED_ROLES` is `["chords", "lead"]` and an audio lane is neither. But absence is
 * exactly the kind of correctness that stops being true without anyone noticing — a palette, a routing table or a "voice everything melodic" loop is all it takes —
 * so it is pinned here rather than left as a property of the current contents.
 */
describe("an audio lane and the GS-1 hosts", () => {
  it("is not among the roles GS-1 voices", () => {
    expect(GS1_ROUTED_ROLES).not.toContain("audio");
    // And the set is the documented two, so widening it is a deliberate act rather than a drift.
    expect([...GS1_ROUTED_ROLES]).toEqual(["chords", "lead"]);
  });

  it("is refused by the planner's own role test, read where that test lives", () => {
    /**
     * The behavioural version of this assertion needs a **complete** planner fixture, and the one I wrote produced `null` for `lead` as well as for `audio` — which
     * means it proved nothing about the role. Rather than keep a control I cannot vouch for, the second fact is read from the source at the place that decides it:
     * `planGs1Notes` returns null unless the role is one of the four it knows. That is a weaker instrument than a behavioural assertion and it is an **honest** one,
     * and the stronger version is a task, not a claim.
     */
    const source = readFileSync("src/audio/gs1/gs1Tracks.ts", "utf8");
    const gate = source.match(/if \(role !== [^)]*\) return null;/);
    expect(gate, "the planner's role gate was not found").not.toBeNull();
    expect(gate![0]).not.toContain('"audio"');
    for (const role of ["chords", "lead"]) expect(gate![0]).toContain(`"${role}"`);
  });
});
