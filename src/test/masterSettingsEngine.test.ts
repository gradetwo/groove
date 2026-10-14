/**
 * ⭐ **The point of the settings is that the graph is built with them, not with the constants next to them.**
 *
 * The master chain's glue compressor, limiter and makeup were build-time constants (`MASTER_BUS_COMP_*`,
 * `MASTER_MAKEUP_DB`) that nothing could change, which is why no panel and no tool could expose them. The model
 * (`data/masterSettings.ts`) is only worth having if the values reach `buildMasterGraph`, so this watches the builder
 * itself: the options object it is handed is the measurement, and it is read from the real call rather than inferred
 * from the field the engine stored.
 *
 * The failure this catches is specific and quiet: an engine that stores a project's settings and then builds the graph
 * from its own constants still reports `getMasterSettings()` correctly — the panel would show the user's value while
 * the audio used another, which is exactly the defect the module was written to remove.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { installFakeAudioContext } from "./helpers/fakeAudio";
import { MASTER_DEFAULTS, normaliseMasterSettings } from "../data/masterSettings";

const { buildMasterGraphSpy } = vi.hoisted(() => ({ buildMasterGraphSpy: vi.fn() }));

vi.mock("../audio/masterGraph", async () => {
  const actual = await vi.importActual<typeof import("../audio/masterGraph")>("../audio/masterGraph");
  return {
    ...actual,
    buildMasterGraph: (ctx: unknown, options: unknown) => {
      buildMasterGraphSpy(options);
      return (actual.buildMasterGraph as unknown as (c: unknown, o: unknown) => unknown)(ctx, options);
    },
  };
});

const { AudioEngine } = await import("../audio/AudioEngine");

let restore: (() => void) | null = null;
beforeEach(() => {
  buildMasterGraphSpy.mockClear();
  restore = installFakeAudioContext();
});
afterEach(() => {
  restore?.();
  restore = null;
});

/** The options the engine handed the graph builder on its last build. */
function optionsUsed(): Record<string, unknown> {
  expect(buildMasterGraphSpy, "the graph was actually built").toHaveBeenCalled();
  return buildMasterGraphSpy.mock.calls.at(-1)![0] as Record<string, unknown>;
}

describe("the engine's mastering settings", () => {
  it("⭐ applies a change at once by rebuilding the graph, so a panel's knob is not dead", () => {
    const engine = new AudioEngine();
    buildMasterGraphSpy.mockClear();

    engine.setMasterSettings({ limiter: { ceilingDb: -8 } });

    // ⭐ The whole point: the constructor already built a graph, and `initAudioContext` early-returns, so without the
    // rebuild this change would only take effect on a build that never comes.
    expect(buildMasterGraphSpy, "a new graph was built").toHaveBeenCalled();
    const used = buildMasterGraphSpy.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(used.limiterCeilingDb, "and it was built with the new ceiling").toBe(-8);
    expect(engine.getMasterSettings().limiter.ceilingDb).toBe(-8);
  });

  it("⭐ leaves the strips pointing at the fresh chain, so the change is heard and not just stored", () => {
    const engine = new AudioEngine();
    const strips = (engine as unknown as { trackStrips: unknown[] }).trackStrips;
    const before = strips.length;
    expect(before, "the constructor's build made strips").toBeGreaterThan(0);

    engine.setMasterSettings({ busComp: { thresholdDb: -30 } });

    // `releaseTrackStrips` + `setupTrackStrips` is the pair the worklet-arrival path already uses; a rebuild that
    // dropped the second half would leave the engine silent, which is the regression this pins.
    expect((engine as unknown as { trackStrips: unknown[] }).trackStrips.length, "the strips were remade for the new chain").toBe(before);
  });

  it("⭐ builds the graph with the project's values instead of the build-time constants", () => {
    // ⭐ The settings are handed over **at construction**: the constructor is what builds the graph, and
    // `initAudioContext` returns early once a context exists — so this is the only moment that can take them.
    new AudioEngine({
      masterSettings: {
        busComp: { enabled: false, thresholdDb: -24, kneeDb: 12, ratio: 4, releaseSec: 0.5, makeupDb: 2 },
        limiter: { ceilingDb: -3, lookaheadMs: 5, releaseFastMs: 80, releaseSlowMs: 500 },
        width: { amount: 1 },
      },
    });

    const used = optionsUsed();
    expect(used.masterBusCompThresholdDb, "the project's threshold, not MASTER_BUS_COMP_THRESHOLD_DB").toBe(-24);
    expect(used.masterBusCompKneeDb).toBe(12);
    expect(used.masterBusCompRatio).toBe(4);
    expect(used.masterBusCompReleaseSec).toBe(0.5);
    expect(used.busCompMakeupDb).toBe(2);
    expect(used.masterBusCompEnabled, "switching it off travels too").toBe(false);
    // The ceiling is the one the user set rather than the limiter's internal constant.
    expect(used.limiterCeilingDb).toBe(-3);
    expect(used.limiterReleaseFastMs).toBe(80);
    expect(used.limiterReleaseSlowMs).toBe(500);
  });

  it("builds with the defaults when nobody has said otherwise, so an untouched project is unchanged", () => {
    new AudioEngine();
    const used = optionsUsed();
    expect(used.masterBusCompThresholdDb).toBe(MASTER_DEFAULTS.busComp.thresholdDb);
    expect(used.masterBusCompRatio).toBe(MASTER_DEFAULTS.busComp.ratio);
    expect(used.busCompMakeupDb).toBe(MASTER_DEFAULTS.busComp.makeupDb);
    expect(used.limiterCeilingDb).toBe(MASTER_DEFAULTS.limiter.ceilingDb);
  });

  it("⭐ clamps on the way in, so a hand-edited project cannot put a wild value into an AudioParam", () => {
    const engine = new AudioEngine({ masterSettings: { busComp: { thresholdDb: -9999, ratio: 500 }, limiter: { ceilingDb: 12 } } });
    const accepted = normaliseMasterSettings({ busComp: { thresholdDb: -9999, ratio: 500 }, limiter: { ceilingDb: 12 } });
    const used = optionsUsed();

    expect(engine.getMasterSettings(), "what was accepted is reported back, clamped").toEqual(accepted);
    expect(used.masterBusCompThresholdDb).toBe(-60);
    expect(used.masterBusCompRatio).toBe(20);
    // A ceiling above 0 dBTP would clip, which is the one thing the ceiling exists to prevent.
    expect(used.limiterCeilingDb).toBe(0);
    expect(engine.getMasterSettings(), "and the engine reports what it will use").toEqual(accepted);
  });
});
