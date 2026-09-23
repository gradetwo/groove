import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * P0.2 — the groove gate's measurement integrity.
 *
 * `check:groove` is only worth its runtime if the numbers it ratchets mean what their claim says. Three
 * times in one day they did not, and each time the failure was invisible: the gate passed, or failed,
 * for a reason that had nothing to do with the audio a user hears.
 *
 *   1. the analyser rendered `genre.sequencer_pattern` — the authored skeleton — so `flatTracks` and
 *      `staticHarmony` counted values the genre-entry expansion had already replaced;
 *   2. the duck metric rendered the bass alone, where the sidechain is never even *scheduled*, so it
 *      reported the bass part's own envelope and a bass note starting on the kick read as +2..+5 dB;
 *   3. the summed pair (kick + bass) reads the kick's own onset, which is not a duck either.
 *
 * These are source assertions on purpose. The properties cannot be exercised from a unit test — every
 * one needs the browser renderer — so what is pinned is the *construction* that makes the measurement
 * honest, and the alternative each line is protecting against is named.
 */
const root = path.resolve(__dirname, "..", "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("P0.2 · the groove gate measures the pattern the user hears", () => {
  const analyser = read("scripts/analyze_export_audio.mjs");

  it("renders the genre-entry pattern, not the authored skeleton", () => {
    // `patternFromGenre` is where the mix, the expression rules and the P0.2 humanisation are applied.
    expect(analyser).toMatch(/const pattern = mixModule\.patternFromGenre\(genre\)/);
    // The skeleton must not reach a render call: `renderPatternOffline(genre.sequencer_pattern` was the bug.
    expect(analyser).not.toMatch(/renderPatternOffline\(\s*genre\.sequencer_pattern/);
    expect(analyser).not.toMatch(/const pattern = genre\.sequencer_pattern/);
  });

  it("resolves the mix the render used instead of a helper that does not exist", () => {
    // `mixModule.getGenreMix` was never exported, so `mix` was silently always null.
    expect(analyser).not.toMatch(/getGenreMix/);
    expect(analyser).toMatch(/mixModule\.resolveGenreMix\(/);
  });

  it("reports unmatched sample ids rather than dropping them", () => {
    // Three of the first twelve sample ids did not exist and vanished, so the budgets described nine genres.
    expect(analyser).toMatch(/do not exist and were skipped/);
  });
});

describe("P0.2 · the duck is measured as a duck", () => {
  const analyser = read("scripts/analyze_export_audio.mjs");

  it("compares a paired render whose kick triggers but does not sound", () => {
    // The ducked render keeps the kick's steps (so the trigger fires) and zeroes its strip.
    expect(analyser).toMatch(/only\(\["bass", "kick"\]\)/);
    expect(analyser).toMatch(/kickSilentStates/);
    expect(analyser).toMatch(/volume: t\.track_id === "kick" \? 0/);
    // ...and the control is the same bass without the kick, so the only difference is the duck gain.
    expect(analyser).toMatch(/only\(\["bass"\]\)/);
  });

  it("only counts onsets where the bass is actually sounding", () => {
    // A fixed −80 dBFS floor counted decaying tails as "the bass is playing here", and with a sparse bass line
    // those meaningless windows were the majority — they made a real duck measure as a 0.5 dB mean.
    expect(analyser).toMatch(/duckOnsets/);
    expect(analyser).toMatch(/rms\(unducked, 0, unducked\.length\) \* 0\.15/);
    expect(analyser).toMatch(/reference <= floor/);
  });

  it("anchors the window to the scheduled kick, not to a detected peak", () => {
    // An 808's peak lands tens of milliseconds after its trigger, so a peak-anchored window measured the
    // release and reported a 6 dB duck as a 0.5 dB one. The grid mirrors the renderer's own loop.
    expect(analyser).toMatch(/patternSteps \* barsArg/);
    expect(analyser).toMatch(/effectiveSwing \* 0\.5 \* stepDur/);
    expect(analyser).toMatch(/noteEvents\.probabilityPasses/);
    // ...and the kick-only render is kept as a cross-check that the mirror still lines up.
    expect(analyser).toMatch(/kickOnsets: energyOnsets/);
  });

  it("measures the deepest short window, so the release length cannot flatter the depth", () => {
    // A 25 ms mean measured a slow release as a deeper duck than a fast one at the same depth.
    expect(analyser).toMatch(/rate \* 0\.005/);
    expect(analyser).toMatch(/rate \* 0\.06/);
    expect(analyser).toMatch(/deepest = deepest === null \? ratio : Math\.min\(deepest, ratio\)/);
    expect(analyser).toMatch(/duckMedianDb/);
  });

  it("separates the sidechain from the mastering chain's give-back", () => {
    // Both pairs, one with the mastering dynamics out of the way: the difference is the ceiling/glue compressor
    // refilling the dip, which is a different defect from a shallow sidechain.
    expect(analyser).toMatch(/masterBusCompEnabled: busComp/);
    expect(analyser).toMatch(/duckMasterMedianDb/);
    expect(analyser).toMatch(/duckErasedInMaster/);
  });

  it("does not fall back to the kick's own onset level", () => {
    // Measuring the summed pair (the first attempt at a paired render) reads +9..+25 dB of "duck".
    expect(analyser).not.toMatch(/const kick = withKick\.getChannelData/);
  });
});

describe("P0.2 · the tail claim cannot fail on the render's nondeterminism", () => {
  const analyser = read("scripts/analyze_export_audio.mjs");

  it("re-renders once before reporting a cut tail", () => {
    // scripts/diagnose_repeat_determinism.mjs: two renders of one project are not sample-identical, and
    // detroit-techno's tail measured −65.5 dBFS in four runs and −24.7 in two.
    expect(analyser).toMatch(/TAIL_CLAIM_DB/);
    expect(analyser).toMatch(/tailRenders = 2/);
    expect(analyser).toMatch(/tailRmsDb = Math\.max\(tailRmsDb, confirmed\)/);
  });
});

describe("P0.2 · the gate and the analyser agree on what a claim is", () => {
  const gate = read("scripts/check_groove.mjs");
  const analyser = read("scripts/analyze_export_audio.mjs");

  it("counts the audible-sidechain claim over measurable onsets", () => {
    expect(gate).toMatch(/duck\.duckOnsets > 0/);
    // `kickOnsets` is the wrong denominator: a kick over a bass rest has nothing to duck.
    expect(gate).not.toMatch(/duck\.kickOnsets > 0/);
  });

  it("budgets every claim the analyser defines for the musical ratchet", () => {
    for (const claim of ["flatTracks", "weakDuck", "narrowStereo", "thinMids", "staticHarmony", "cutTail"]) {
      expect(analyser, `${claim} must exist in the analyser`).toMatch(new RegExp(`\\b${claim}: \\(row\\)`));
      expect(gate, `${claim} must have a budget`).toMatch(new RegExp(`\\b${claim}: \\d+`));
    }
  });

  it("keeps the gate's accumulator able to fail", () => {
    // The first version accumulated into a local named `counts` inside a function named `counts`, so every
    // comparison was `NaN > budget` and the gate passed unconditionally.
    expect(gate).toMatch(/const tally = \{/);
    expect(gate).toMatch(/spec\.worse\(measured\[claim\], budget\)/);
  });
});

describe("P0.9 · the loudness reference is measured on a warm page", () => {
  const script = read("scripts/measure_genre_loudness.mjs");

  it("recycles the page before it takes the sentinel's reference", () => {
    /**
     * The abort that made the 2026-09-20 re-record unpublishable, reproduced on 2026-09-23 with a 14-genre run:
     * `chicago-house` read −12.349 LUFS on the page the run opened in and −11.589 after the first reload
     * (Δ +0.760 dB against a 0.3 dB tolerance), and every row after that reload agreed with the *later* value.
     * The opening page is the only page in a run whose module graph was fetched over the network for the first
     * time; a reloaded page is stable from its first measurement. So the reference has to be taken with the same
     * procedure the later checks use — reload, discard one render, measure — or a sentinel "drift" is really two
     * page states being compared.
     */
    const recycle = script.indexOf("await recyclePage(");
    const reference = script.indexOf('await checkSentinel("reference (warm page)")');
    expect(recycle, "the reference must be preceded by a page recycle").toBeGreaterThan(-1);
    expect(reference).toBeGreaterThan(recycle);
  });

  it("keeps the reload in one place, so the reference and the checks cannot drift apart", () => {
    // Two copies of "reload, discard, measure" is how the reference would stop being comparable with the checks
    // that use it — the failure this whole describe block is about.
    expect((script.match(/await page\.reload\(/g) ?? []).length).toBe(1);
    expect(script).toMatch(/const recyclePage = async/);
    expect(script).toMatch(/await recyclePage\(`after \$\{reloadEvery\} measurement\(s\)`\)/);
  });

  it("kills the dev server on the abort path too", () => {
    /**
     * The sentinel exits with `process.exit(1)`, which bypasses the `finally` — and the analyser's port is fixed
     * (`--strictPort`), so the *next* run failed with "Port 3150 is already in use", which reads like a broken
     * script rather than a leftover process. Cost one debugging round on 2026-09-23.
     */
    expect(script).toMatch(/process\.on\("exit"/);
    expect(script.indexOf('process.on("exit"')).toBeLessThan(script.indexOf("await checkSentinel("));
  });
});
