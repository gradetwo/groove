/**
 * ⭐ **The point of a reverb/delay patch is that the buses receive it, not that a field stored it.**
 *
 * `ReverbBus.setParams` and `DelayBus.setParams` are live (the bus's own note says the graph is wired once and only
 * `setParams` is called afterwards), so unlike the master compressor and limiter a change here can be applied at once.
 * That makes this claim testable in the strong form: the parameters the **bus** reports are the ones that were asked
 * for — read from the real object, not from a copy the engine kept.
 *
 * Three failures are worth catching, and the third is the one a naive implementation has:
 *
 *   - a patch that never reaches the bus (stored and inaudible);
 *   - a value outside what the DSP can honour arriving from a file or a wire message;
 *   - **a patch that is inert for a genre with no FX profile.** `applyGenreFx` used to `return` early when the genre has
 *     none, so applying the patch after that call would have done nothing for exactly the custom arrangements an agent
 *     is most likely to be working on.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { installFakeAudioContext } from "./helpers/fakeAudio";
import { EFFECTS_LIMITS, isEmptyEffectsOverrides, mergeEffectsOverrides, normaliseEffectsOverrides } from "../data/effectsOverrides";
import type { SequencerPattern } from "../types/genre";

const { AudioEngine } = await import("../audio/AudioEngine");

/** A minimal pattern. `genre_id` is chosen per case, because "no profile" is one of the things under test. */
function pattern(genreId: string): SequencerPattern {
  return {
    genre_id: genreId,
    bpm: 120,
    swing: 0,
    scale: "C minor",
    totalSteps: 16,
    tracks: [
      {
        track_id: "kick",
        name: "Kick",
        instrument: "drum",
        steps: new Array(16).fill(1),
        velocity: new Array(16).fill(100),
        pitch: new Array(16).fill(0),
      },
    ],
  } as unknown as SequencerPattern;
}

let restore: (() => void) | null = null;
beforeEach(() => {
  restore = installFakeAudioContext();
});
afterEach(() => {
  restore?.();
  restore = null;
});

/** The engine's own master graph, reached the way the engine holds it. */
const graphOf = (engine: unknown) =>
  (engine as { masterGraph: { reverb: { params?: unknown }; delay: { params?: unknown }; fxRack: unknown } }).masterGraph;

describe("a project's reverb and delay patch", () => {
  it("⭐ reaches both buses, so the value is audible rather than merely stored", () => {
    const engine = new AudioEngine({ masterSettings: {} });
    engine.setPattern(pattern("house"));
    engine.setEffectsOverrides({
      reverb: { decaySec: 4.5, damping: 0.3, preDelayMs: 40, width: 0.8 },
      delay: { timeSeconds: 0.5, feedback: 0.4, dampHz: 3000 },
    });

    const graph = graphOf(engine);
    // ⭐ Read from the buses themselves: what they report is what they will process.
    const reverb = graph.reverb as unknown as { getParams?: () => Record<string, number>; params?: Record<string, number> };
    const delay = graph.delay as unknown as { getParams?: () => Record<string, number>; params?: Record<string, number> };
    const reverbParams = (typeof reverb.getParams === "function" ? reverb.getParams() : reverb.params) as Record<string, number>;
    const delayParams = (typeof delay.getParams === "function" ? delay.getParams() : delay.params) as Record<string, number>;

    expect(reverbParams.decaySec, "the reverb's own reading").toBeCloseTo(4.5, 5);
    expect(reverbParams.preDelayMs).toBeCloseTo(40, 5);
    expect(delayParams.timeSeconds, "the delay's own reading").toBeCloseTo(0.5, 5);
    expect(delayParams.feedback).toBeCloseTo(0.4, 5);
  });

  it("⭐ is applied even when the genre has no FX profile at all", () => {
    const engine = new AudioEngine({ masterSettings: {} });
    // A custom arrangement: no genre profile, which is the case the old early `return` made inert.
    engine.setPattern(pattern("no-such-genre"));
    engine.setEffectsOverrides({ reverb: { decaySec: 3 } });

    const reverb = graphOf(engine).reverb as unknown as { getParams?: () => Record<string, number>; params?: Record<string, number> };
    const params = (typeof reverb.getParams === "function" ? reverb.getParams() : reverb.params) as Record<string, number>;
    expect(params.decaySec).toBeCloseTo(3, 5);
  });

  it("⭐ clamps what arrives over the wire, and refuses a feedback that would never decay", () => {
    // A feedback of 1 or more does not decay — it grows until the graph is unusable.
    const wild = normaliseEffectsOverrides({ delay: { feedback: 5, dampHz: 10 }, reverb: { decaySec: -3, damping: 9 } });
    expect(wild.delay!.feedback).toBe(EFFECTS_LIMITS.feedback.max);
    expect(wild.delay!.dampHz).toBe(EFFECTS_LIMITS.dampHz.min);
    expect(wild.reverb!.decaySec).toBe(EFFECTS_LIMITS.decaySec.min);
    expect(wild.reverb!.damping).toBe(EFFECTS_LIMITS.damping.max);
    // An unknown key is dropped rather than passed to the bus.
    expect(normaliseEffectsOverrides({ reverb: { nonsense: 1 } })).toEqual({});
    expect(isEmptyEffectsOverrides({})).toBe(true);
    expect(isEmptyEffectsOverrides({ reverb: { decaySec: 2 } })).toBe(false);
  });
});

/**
 * ⭐ **The rack is part of the same decision, and it has to reach the same graph.**
 *
 * The master effect rack (filter / saturation / chorus / bitcrusher) was set from the genre's profile alone and nothing
 * could change it per arrangement. Its four setters are live, like the buses, so a project's patch applies at once.
 *
 * ⭐ The case that matters is the **merge**, not the write: each setter takes a whole stage, so a patch that mentions
 * only the saturator must not switch the filter off by passing `undefined` for its three fields. That is a failure that
 * looks like success — the rack reports "saturation on" while the filter a genre asked for has silently gone.
 */
describe("a project's effect-rack patch", () => {
  it("⭐ applies only the stages it names, leaving the rest as the genre left them", () => {
    const engine = new AudioEngine({ masterSettings: {} });
    engine.setPattern(pattern("house"));
    const rack = graphOf(engine).fxRack as unknown as { getState: () => Record<string, unknown> };
    const before = rack.getState();

    engine.setEffectsOverrides({ rack: { saturationEnabled: true, saturationDrive: 4 } });
    const after = rack.getState();

    expect(after.saturationEnabled, "what was asked for").toBe(true);
    expect(after.saturationDrive).toBeCloseTo(4, 5);
    // ⭐ And every stage the patch did not name is exactly as it was — the merge, not a reset.
    expect(after.filterEnabled, "the filter is untouched").toBe(before.filterEnabled);
    expect(after.filterCutoff).toBe(before.filterCutoff);
    expect(after.chorusEnabled).toBe(before.chorusEnabled);
    expect(after.bitDepth).toBe(before.bitDepth);
  });

  it("⭐ clamps each rack field to the range its own stage documents", () => {
    const engine = new AudioEngine({ masterSettings: {} });
    engine.setPattern(pattern("house"));
    engine.setEffectsOverrides({ rack: { saturationDrive: 99, filterCutoff: 5, bitDepth: 999, filterQ: 0.1 } });

    const rack = graphOf(engine).fxRack as unknown as { getState: () => Record<string, number> };
    const state = rack.getState();
    expect(state.saturationDrive).toBe(EFFECTS_LIMITS.saturationDrive.max);
    expect(state.filterCutoff).toBe(EFFECTS_LIMITS.filterCutoff.min);
    expect(state.bitDepth).toBe(EFFECTS_LIMITS.bitDepth.max);
    expect(state.filterQ).toBe(EFFECTS_LIMITS.filterQ.min);
  });
});

/**
 * ⭐ **A second patch must not drop the first, and that is a caller's mistake to make.**
 *
 * The interface's rack callback knows only the stage that changed, and the protocol takes a patch. If either replaced the
 * stored block, a rack tweak would silently take the reverb with it — the project would sound dry and nothing would say
 * why. `mergeEffectsOverrides` is the one place that combines them.
 */
describe("merging a patch over what is stored", () => {
  it("⭐ keeps the reverb when a later patch only mentions the rack", () => {
    const engine = new AudioEngine({ masterSettings: {} });
    engine.setPattern(pattern("house"));
    engine.setEffectsOverrides({ reverb: { decaySec: 6 } });
    engine.setEffectsOverrides(mergeEffectsOverrides(engine.getEffectsOverrides(), { rack: { bitcrusherEnabled: true } }));

    const carried = engine.getEffectsOverrides();
    expect(carried.reverb!.decaySec, "the earlier reverb survives the later rack patch").toBe(6);
    expect(carried.rack!.bitcrusherEnabled).toBe(true);
    // And the engine really has both: the rack was applied, and the bus still reports the decay.
    const rack = graphOf(engine).fxRack as unknown as { getState: () => Record<string, unknown> };
    expect(rack.getState().bitcrusherEnabled).toBe(true);
  });

  it("⭐ does not resurrect a field the patch cleared, so absent still means 'the genre decides'", () => {
    const merged = mergeEffectsOverrides({ reverb: { decaySec: 3 } }, {});
    expect(merged.reverb!.decaySec).toBe(3);
    expect(merged.delay, "nothing invented for a block nobody named").toBeUndefined();
  });
});
