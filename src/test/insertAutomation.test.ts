/**
 * ⭐ **An EQ band's own value can be a curve, and the two halves of that fail differently.**
 *
 * The insert chain's fields (`low.gainDb`, `mid.hz`, `high.q`, …) are numbers a person already sets with a knob, so a lane
 * on one is a curve on a value that exists — the shape `pan` and the sends already have.
 *
 *   - **the compile must carry the curve per step**, keyed by the lane's own name. A fixed key per field would mean a table
 *     row per band per field, and the next band added would be forgotten;
 *   - **the strip must schedule it without re-routing.** `setParams` recomputes the routing signature and can rewire the
 *     strip when an `enabled` flag changes — right for a UI edit, catastrophic once per step. So the value goes straight at
 *     the `AudioParam`, which is what `applyParams` does for a static value.
 *
 * ⭐ And the failure that reads as success: **a curve on a bypassed band is inaudible.** Somebody who draws an EQ sweep on
 * a band they had switched off would hear nothing and call the feature broken, so a running lane switches its own band on —
 * the one routing change this path makes, and the reason it is asserted rather than assumed.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ChannelStrip } from "../audio/ChannelStripDsp";
import { resolveTrackInsert, type TrackInsertParams } from "../data/trackInsert";
import { INSERT_AUTOMATION_PARAMETERS, AUTOMATION_RANGES } from "../data/automation";

/** A minimal context that records the biquads the strip builds, so a scheduled value can be read back. */
class RecordingContext {
  currentTime = 0;
  sampleRate = 44100;
  readonly createdFilters: Array<{ type: string; frequency: { events: Array<{ value: number; time: number }> }; Q: { events: Array<{ value: number; time: number }> }; gain: { events: Array<{ value: number; time: number }> } }> = [];
  readonly createdGains: unknown[] = [];
  readonly createdOscillators: unknown[] = [];

  private param() {
    return { value: 0, events: [] as Array<{ value: number; time: number }>, setValueAtTime(v: number, t: number) { this.value = v; this.events.push({ value: v, time: t }); return this; }, cancelScheduledValues() { return this; }, setTargetAtTime(v: number) { this.value = v; return this; }, linearRampToValueAtTime() { return this; } };
  }
  createGain() {
    const node = { gain: this.param(), connect: () => node, disconnect: () => {}, };
    this.createdGains.push(node);
    return node as never;
  }
  createBiquadFilter() {
    // A biquad is connected and disconnected by `rewire`/the teardown, so the double needs both.
    const node = {
      type: "lowpass",
      frequency: this.param(),
      Q: this.param(),
      gain: this.param(),
      connect: () => node,
      disconnect: () => {},
    };
    this.createdFilters.push(node as never);
    return node as never;
  }
  createDynamicsCompressor() {
    return { threshold: this.param(), knee: this.param(), ratio: this.param(), attack: this.param(), release: this.param(), reduction: 0, connect: () => {}, disconnect: () => {} } as never;
  }
  createWaveShaper() {
    return { curve: null, oversample: "none", connect: () => {}, disconnect: () => {} } as never;
  }
  createDelay() { return { delayTime: this.param(), connect: () => {}, disconnect: () => {} } as never; }
  createOscillator() { return { frequency: this.param(), start: () => {}, stop: () => {}, connect: () => {}, disconnect: () => {} } as never; }
  createChannelSplitter() { return { connect: () => {}, disconnect: () => {} } as never; }
  createChannelMerger() { return { connect: () => {}, disconnect: () => {} } as never; }
}

/**
 * The strip's three bands, **found by their filter type** rather than by index: the high-pass is built first, so
 * `slice(0, 3)` would have taken it as the low shelf — which is exactly the mistake this indirection prevents.
 */
const bands = (ctx: RecordingContext) => [
  ctx.createdFilters.find((f) => f.type === "lowshelf")!,
  ctx.createdFilters.find((f) => f.type === "peaking")!,
  ctx.createdFilters.find((f) => f.type === "highshelf")!,
];

function build(params?: Partial<TrackInsertParams>) {
  const ctx = new RecordingContext();
  const strip = new ChannelStrip(ctx as unknown as BaseAudioContext, { ...resolveTrackInsert("chords"), ...params });
  return { ctx, strip, bands: bands(ctx) };
}

let built: ReturnType<typeof build> | null = null;
beforeEach(() => {
  built = null;
});
afterEach(() => {
  built = null;
});

describe("an automated EQ band", () => {
  it("⭐ schedules onto the band's own AudioParam, at the time it was given", () => {
    built = build();
    built.strip.scheduleInsertParam("low.gainDb", 6, 1.25);

    const low = built.bands[0]!;
    // The low shelf's own gain parameter took the value, at the step's time — not at `currentTime`.
    expect(low.gain.events.at(-1)).toEqual({ value: 6, time: 1.25 });

    built.strip.scheduleInsertParam("mid.hz", 1200, 2);
    expect(built.bands[1]!.frequency.events.at(-1)).toEqual({ value: 1200, time: 2 });

    built.strip.scheduleInsertParam("high.q", 3, 3);
    expect(built.bands[2]!.Q.events.at(-1)).toEqual({ value: 3, time: 3 });
  });

  it("⭐ switches a bypassed band on when its lane runs, because a curve on a silent band is inaudible", () => {
    built = build({ low: { enabled: false, hz: 200, gainDb: 0, q: 0.8 } });
    expect(built.strip.getParams().low.enabled, "the static state is off to begin with").toBe(false);

    built.strip.scheduleInsertParam("low.gainDb", 5, 0.5);

    // The band is now enabled — through the ordinary path, so `routingSignature` stays truthful.
    expect(built.strip.getParams().low.enabled, "a running lane switches its own band on").toBe(true);
    // And the value lands on the next call, which is the step after the rewire.
    built.strip.scheduleInsertParam("low.gainDb", 5, 0.75);
    expect(built.bands[0]!.gain.events.at(-1)).toEqual({ value: 5, time: 0.75 });
  });

  it("⭐ clamps to the band's own range rather than to the level's", () => {
    built = build();
    // A gain beyond ±18 dB would be outside what `trackInsert` allows the panel to ask for.
    built.strip.scheduleInsertParam("mid.gainDb", 99, 0);
    expect(built.bands[1]!.gain.events.at(-1)!.value).toBe(AUTOMATION_RANGES["mid.gainDb"].max);
    // A frequency below the EQ's floor is brought to it, not passed to the filter.
    built.strip.scheduleInsertParam("high.hz", 1, 0);
    expect(built.bands[2]!.frequency.events.at(-1)!.value).toBe(AUTOMATION_RANGES["high.hz"].min);
  });

  it("ignores a name that is not a band field, rather than failing a step", () => {
    built = build();
    expect(() => built!.strip.scheduleInsertParam("nope.nope", 1, 0)).not.toThrow();
    expect(() => built!.strip.scheduleInsertParam("compThresholdDb", 1, 0)).not.toThrow();
  });

  it("⭐ offers exactly the band fields it can carry, so a selector cannot offer a lane with no axis", () => {
    expect(INSERT_AUTOMATION_PARAMETERS.length, "three bands × three fields").toBe(9);
    for (const parameter of INSERT_AUTOMATION_PARAMETERS) {
      expect(parameter.split(".")).toHaveLength(2);
      expect(AUTOMATION_RANGES[parameter], `${parameter} has a range`).toBeDefined();
    }
  });
});
