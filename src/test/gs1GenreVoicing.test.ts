/**
 * A lane is voiced the way **its genre** plays it, not the way its instrument is spelled.
 *
 * The owner's rule, after hearing the UK-garage lead: one patch for every genre is wrong, and it is wrong for the other
 * lanes too. The instrument table says what an instrument *is* (`m1_organ` is a drawbar organ); it cannot say what a
 * genre does with it, and a UK-garage lead is a short wet stab while the same instrument under a Latin montuno is a
 * warm pad.
 *
 * These cases hold the mechanism: an override is consulted first, it is keyed by instrument so it follows a lane
 * through an instrument swap, a genre that says nothing is byte-identical to before, and both paths that voice a lane
 * (the live pool's planner and the exporter) ask the same question.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  GENRE_GS1_PATCH_OVERRIDES,
  genreGs1Overrides,
  resolveGs1Patch,
} from "../data/gs1Patches";
import { gs1PatchFor, planGs1Notes, resolveRoutedPatch, setGs1RoutingEnabled, DEFAULT_GS1_ROUTING_ENABLED } from "../audio/gs1/gs1Tracks";

describe("per-genre GS-1 voicing", () => {
  beforeEach(() => setGs1RoutingEnabled(true));
  afterEach(() => setGs1RoutingEnabled(DEFAULT_GS1_ROUTING_ENABLED));

  it("gives uk-garage's lead its own organ, and leaves other genres on the shared one", () => {
    // The genre the report came from, and the instrument that was heard as harsh and short.
    expect(resolveGs1Patch("lead", "m1_organ", "uk-garage")?.patch).toBe("organStab");
    // A genre that has not asked for its own voice keeps the instrument table's answer, exactly as before.
    expect(resolveGs1Patch("lead", "m1_organ", "latin-house")?.patch).toBe("organStack");
    // …and saying nothing at all is the old behaviour, which is what every existing caller relies on.
    expect(resolveGs1Patch("lead", "m1_organ")?.patch).toBe("organStack");
  });

  it("keys the override by instrument, so a lane keeps its voice through an instrument swap", () => {
    // The override is for `m1_organ`; a different instrument on the same lane is not covered by it.
    expect(genreGs1Overrides("uk-garage")).toEqual({ m1_organ: "organStab" });
    expect(resolveGs1Patch("lead", "square_lead", "uk-garage")?.patch).toBe(
      resolveGs1Patch("lead", "square_lead")?.patch
    );
  });

  it("resolves the same way through the texture fallback and the enabled-routing check", () => {
    expect(resolveRoutedPatch("lead", "m1_organ", "uk-garage")?.patch).toBe("organStab");
    expect(gs1PatchFor("lead", "m1_organ", "uk-garage")?.patch).toBe("organStab");
    setGs1RoutingEnabled(false);
    expect(gs1PatchFor("lead", "m1_organ", "uk-garage")).toBeNull();
  });

  it("carries the genre into the note plan the pool and the exporter both build", () => {
    const notes = [{ note: 72, time: 0, duration: 0.2, velocity: 0.9 }];
    const genrePlan = planGs1Notes({ role: "lead", instrument: "m1_organ", notes, sampleRate: 44100, genreId: "uk-garage" });
    const plainPlan = planGs1Notes({ role: "lead", instrument: "m1_organ", notes, sampleRate: 44100 });
    expect(genrePlan?.patch).toBe("organStab");
    expect(plainPlan?.patch).toBe("organStack");
    // The voicing differs; the schedule does not — a patch is not allowed to move a note.
    expect(genrePlan?.notes).toEqual(plainPlan?.notes);
  });

  it("keeps the override registry deliberate, and names each reason", () => {
    /**
     * Every entry is here for a measurement, and this case is the list. It was written when the registry held one
     * genre, and the overnight voicing sweep added four more — each of which had a number attached to it before it was
     * added: `disco` (+15.2 dB with the shared strings), `reggaeton` (−6.1 dB with the shared lead), `dub-techno` and
     * `ambient-techno` (the pair whose distance the shared patches could not keep above the distinctness floor).
     * A new key without a reason now has to change this line on purpose.
     */
    expect(Object.keys(GENRE_GS1_PATCH_OVERRIDES).sort()).toEqual(
      ["ambient-techno", "disco", "dub-techno", "reggaeton", "uk-garage"].sort()
    );
    for (const [genre, overrides] of Object.entries(GENRE_GS1_PATCH_OVERRIDES)) {
      expect(Object.keys(overrides).length, `${genre} must override at least one lane`).toBeGreaterThan(0);
    }
  });
});
