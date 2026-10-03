/**
 * ⭐ **A project made from a template was one bar long while its ruler drew eight.**
 *
 * `createArrangementFromTemplate` returned an arrangement with **no `bars`**, and the two readers of that absence
 * disagree:
 *
 *   · the arrangement view's ruler falls back to **eight** (`DEFAULT_REGION_BARS`) — eight `<button>`s, each labelled
 *     「跳到第 N 小节」 with `cursor: pointer`;
 *   · the compile falls back to **one** (`stepCountFor(notes, arrangement.bars, …)` with the notes of a one-bar
 *     starter figure) — a sixteen-step pattern.
 *
 * So the ruler offered seven bars the transport did not have. Measured end to end before this change
 * (`src/test/arrangementRulerSeek.test.tsx`'s own reading): a click on `ruler-bar-6` in a `"drums-bass"` project was
 * clamped to step **15** and the position read `1.4`. The blank path never had the problem — `createArrangement`
 * states `DEFAULT_BARS` — which is why this is two answers to one question rather than a length preference.
 *
 * ## The two claims, and how they are read red
 *
 * 1. **The two creation paths agree.** Delete `bars: DEFAULT_BARS` from the template path and the first loop goes
 *    red with the template's `bars` `undefined` against the blank path's `8`.
 * 2. ⭐ **The ruler's bar count and the compile's are one arithmetic, for every template.** `totalSteps` divided by
 *    `stepsPerBarFor(timeSignature)` is the number of bars the transport will actually hold, and it must equal the
 *    `bars` the view draws against. This is the reading the whole change turns on, and it is taken from the compile
 *    rather than from a second copy of the rule.
 *
 * ⚠️ **The length is not chosen here.** `DEFAULT_BARS` (eight) is what `createArrangement` already states, and every
 * template's material is a one-bar starter figure (`defaultContentFor` → `steps(4)`, sixteen steps) — so eight bars
 * is the existing answer, applied to the path that was missing it. A template that one day carries more than one bar
 * of content would have to state its own length in its own entry, which is why the criterion reads the compile
 * rather than trusting the constant.
 */
import { describe, expect, it } from "vitest";
import { createArrangement, createArrangementFromTemplate, DEFAULT_BARS, TEMPLATES } from "../data/arrangementEdits";
import { compileArrangementToPattern } from "../data/arrangementCompile";
import { stepsPerBarFor } from "../data/noteEvents";

/** How many bars the pattern the transport will be handed actually holds. */
const transportBarsOf = (arrangement: ReturnType<typeof createArrangementFromTemplate>): number => {
  const compiled = compileArrangementToPattern(arrangement, {});
  const patternSteps = compiled.totalSteps ?? compiled.tracks[0]?.steps.length ?? 0;
  return patternSteps / stepsPerBarFor(arrangement.timeSignature ?? "4/4");
};

describe("⭐ a template project is as long as the blank one, and as long as its own ruler says", () => {
  it("states the length on both creation paths, so `bars`' absence is nobody's answer", () => {
    const blank = createArrangement("s");
    expect(blank.bars).toBe(DEFAULT_BARS);

    for (const template of TEMPLATES) {
      const created = createArrangementFromTemplate("s", template.id);
      /**
       * ⭐ **Red without the fix**: `expected undefined to be 8`. The ruler draws `arrangement.bars ?? 8` bars and the
       * compile draws `arrangement.bars ?? 1`, so `undefined` is the two of them disagreeing by seven bars.
       */
      expect(created.bars, `template ${template.id} states no length, so its ruler and its transport disagree`).toBe(DEFAULT_BARS);
    }

    // An unknown id is the blank path, and it states the length too.
    expect(createArrangementFromTemplate("s", "no-such-template", "synth").bars).toBe(DEFAULT_BARS);
  });

  it("⭐ the ruler's bar count is the compile's bar count — one arithmetic, not two fallbacks", () => {
    for (const template of TEMPLATES) {
      const created = createArrangementFromTemplate("s", template.id);
      const patternSteps = compileArrangementToPattern(created, {}).totalSteps ?? 0;
      /**
       * What the transport will hold, in bars. Before the fix this was **1** for every template while the view drew
       * **8** — the seven-bar lie. Read from the compile, because a criterion that read `DEFAULT_BARS` back would
       * pass for a template whose content is longer than it states.
       */
      const transportBars = transportBarsOf(created);
      expect(patternSteps, `template ${template.id} compiled to an empty pattern`).toBeGreaterThan(0);
      expect(transportBars, `template ${template.id}: the ruler draws ${created.bars} bars, the transport holds ${transportBars}`).toBe(created.bars);
      // And eight bars is long enough for the one-bar material every template is built from.
      expect(transportBars).toBeGreaterThanOrEqual(1);
    }
    // The blank path answers the same question the same way, which is the whole of this criterion.
    expect(transportBarsOf(createArrangement("s"))).toBe(DEFAULT_BARS);
  });
});
