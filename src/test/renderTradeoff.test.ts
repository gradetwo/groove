import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderBudgetSentence, renderCostSentence } from "../../mcp/render/budget";

/**
 * The render trade-off must be **stated**, not discovered (fifth report P0, resolved by measurement in the audio scope).
 *
 * Per-section rendering and a whole-song bounce are **not the same master** — reverb tails, the bus compressor and the parallel drum path span the entire piece, so a
 * chunk rendered alone never has them. The numbers came from the probe (max 1.7, mean 0.14 on a ±1 scale, with the difference running through the whole chunk rather
 * than sitting at its start), and a composer who discovers this by comparing two bounces with no explanation has been failed by the documentation rather than by the
 * engine.
 *
 * Two assertions below were corrected when the timeout work landed, and both are corrections rather than weakenings:
 *
 * 1. `render_song`'s description used to say the call **reports no progress**. That was true of a call with no `progressToken` and became false of one with a token —
 *    the tool now emits a phase then a heartbeat — so the assertion is that it says *which* progress it can report and why a bar counter is not one of them;
 * 2. the "about 6 seconds per minute of audio" figure was the preview's, quoted as a floor. The descriptions now quote the measured eight-bar cost from
 *    `docs/RENDER_PROFILE.md`, and the assertion reads that measurement from the module that holds it rather than from a paraphrase.
 */
const registry = readFileSync("mcp/registry.ts", "utf8");

describe("what render_song says about its own limits", () => {
  it("says which progress it reports, and why a bar counter is not one of them", () => {
    // The heartbeat is the honest unit: `OfflineAudioContext.startRendering()` is one call holding 96-99.9% of the wall clock.
    expect(registry).toMatch(/heartbeat every 15 s/);
    expect(registry).toMatch(/no per-bar figure to report/);
    expect(registry).toMatch(/startRendering\(\)/);
    // And progress is not promised to a caller that did not ask for it.
    expect(registry).toMatch(/caller that sent a progressToken/);
  });

  it("quotes the measured costs and marks what has not been measured", () => {
    /**
     * The **source** is read here, so the assertion is on the derivation rather than on the sentence: the description is
     * assembled from `renderCostSentence()` and `renderBudgetSentence()`, and the file has to name both. (A test that
     * wanted the assembled string would have to read the descriptions, which `budgetHonesty.test.ts` does — and
     * `check:mcp` does it again over the wire, which is where "the caller actually sees it" is decided.)
     */
    expect(registry).toMatch(/renderCostSentence\(\)/);
    expect(registry).toMatch(/renderBudgetSentence\(\)/);
    // The measured facts, in the module that holds them.
    expect(renderCostSentence()).toMatch(/17\.18 s of audio in 17\.95-24\.25 s/);
    expect(renderCostSentence()).toMatch(/125\.56 s of audio in 445\.71-511\.28 s/);
    // The unmeasured claim stays, because it is the difference between a floor and a promise.
    expect(registry).toMatch(/has \*\*not\*\* measured a whole-song full-rate bounce/);
    // The pre-refusal stays, because it is the other defence this call has.
    expect(registry).toMatch(/maxDurationSec/);
  });

  it("states the trade-off between progress and one master, with the numbers", () => {
    expect(registry).toMatch(/not\*\* the same master as a single bounce/);
    expect(registry).toMatch(/max 1\.7, mean 0\.14/);
    expect(registry).toMatch(/span the entire piece/);
  });
});
