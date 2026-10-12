/**
 * The measurement probes are scripts, and a script's arguments are easy to parse and then never thread through.
 *
 * ⭐ That is exactly what happened here, and it cost two CI runs of twenty-eight minutes each: `probe_arrangement_audio.mjs` read `--only=lane` and `--lanes=N` in Node, destructured `only` and `laneCount` in its page callback — and then called `page.evaluate(fn, { genreId, ramp })`. So the page saw `only === undefined` and ran **the whole probe**, every block and every render, which is the one thing that flag exists to avoid: the design's own note says a browser in CI does not survive many renders. The lane curve then reported "no result within 420s" for all four lane counts, with no page output at all, because the curve block runs late in the full flow.
 *
 * A criterion cannot run the probe here (it needs a browser, and an offline render kills one on this machine), so it holds the **contract between the two sides** instead: every name the callback destructures must be in the object the call passes. That is checkable from the source, and it is the property whose absence was invisible.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..");
const probeSource = readFileSync(join(root, "scripts/probe_arrangement_audio.mjs"), "utf8");
/**
 * Comments are stripped before the ordering check, and that is a correction: the first version searched the raw source and matched the phrase inside **its own explanation** of the bug, so it reported the early path as coming after the full summary when the code had it right. A criterion that can be tripped by prose about the criterion is not measuring the code.
 */
const probeCode = probeSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** The single `page.evaluate(async ({ … }) => { … }, { … });` call, split into what it destructures and what it is handed. */
function evaluateCall(source: string) {
  const open = source.indexOf("page.evaluate(async ({");
  expect(open, "the page.evaluate call moved; this criterion is looking in the wrong place").toBeGreaterThan(0);
  const destructured = source.slice(open + "page.evaluate(async ({".length).split("}")[0]!;
  const names = destructured
    .split(",")
    .map((part) => part.split(":")[0]!.trim())
    .filter(Boolean);
  const tail = source.slice(open);
  const passedBlock = tail.slice(tail.indexOf("}, {") + "}, {".length).split("})")[0]!;
  const passed = passedBlock
    .split(",")
    .map((part) => part.split(":")[0]!.trim())
    .filter(Boolean);
  return { names, passed };
}

describe("the arrangement probe threads its flags through", () => {
  it("hands the page every name the page destructures", () => {
    // The regression: `only` and `laneCount` were parsed in Node, destructured in the page, and never passed.
    const { names, passed } = evaluateCall(probeSource);
    const missing = names.filter((name) => !passed.includes(name));
    expect(missing, `the page destructures ${missing.join(", ")} but the call passes only ${passed.join(", ")}`).toEqual([]);
  });

  it("passes the two flags the lane-curve caller depends on", () => {
    // Named explicitly as well, so a rewrite that renames the destructuring cannot quietly drop the wiring this file exists for.
    const { passed } = evaluateCall(probeSource);
    expect(passed).toContain("only");
    expect(passed).toContain("laneCount");
  });

  it("returns a lane-only run before it reads the full summary", () => {
    /**
     * The other half of the early return: the page returns `{ only, renderLaneCurve }` before any other render, so Node has to print and exit on that shape — otherwise the next line reads `measured.fillBars` and crashes. Order matters, so it is asserted rather than assumed.
     */
    const early = probeCode.indexOf('measured.only === "lane"');
    const full = probeCode.indexOf("measured.fillBars");
    expect(early, "the lane-only early path is gone").toBeGreaterThan(0);
    expect(full, "the full-summary path moved; check this criterion still means something").toBeGreaterThan(0);
    expect(early, "the early path must come before the full summary is read").toBeLessThan(full);
  });
});

describe("the lane curve survives a browser that dies after the render", () => {
  const outerSource = readFileSync(join(root, "scripts/measure_lane_curve.mjs"), "utf8");

  it("announces each point from the page, because the summary is what gets lost", () => {
    /**
     * ⭐ **The failure this exists for, measured in CI.** Four lane counts rendered in about four seconds each, and the run reported "the browser process did not finish the render" for all four: the render kills the browser on that runner, so `page.evaluate` never returned and the results died with it. The summary alone cannot survive that; an announcement per point can.
     */
    expect(probeCode).toContain("LANE_CURVE");
    expect(outerSource, "the caller stopped reading the announcements, so a dead browser loses the curve again").toContain("LANE_CURVE");
  });

  it("writes the marker the caller parses, character for character", () => {
    // The two halves live in different files, which is exactly how a marker drifts. This is the contract, spelled once on each side.
    const producer = /console\.log\(`([A-Z_]+) \$\{JSON\.stringify\(point\)\}`\)/.exec(probeSource);
    expect(producer, "the probe no longer announces a point in the shape the caller expects").not.toBeNull();
    const consumer = /match\(\/([A-Z_]+) \(\\n?\{\.\*\\\}\)/.exec(outerSource) ?? /match\(\/([A-Z_]+) /.exec(outerSource);
    expect(consumer, "the caller no longer parses the announcement").not.toBeNull();
    expect(consumer![1]).toBe(producer![1]);
  });

  it("still reads the summary as a fallback", () => {
    // A run where nothing dies should not have to depend on console output, and a caller that dropped the summary would make the announcement the only path.
    expect(outerSource).toContain("renderLaneCurve?.points?.[0]");
  });
});
