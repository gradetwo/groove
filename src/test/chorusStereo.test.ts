/**
 * The stereo chorus must stay stereo, and its two taps must not move together.
 *
 * Both defects were in the wet branch of `EffectsRack`:
 *
 *  1. the taps were fed straight from the crusher and merged back through a `ChannelMergerNode`,
 *     whose inputs are one channel wide — so the merger down-mixed the stereo bus and **both taps
 *     carried the same mono sum**. The effect that exists to widen the image was collapsing it, and
 *     the only thing separating the sides was the fixed 15/22 ms delay;
 *  2. one LFO gain fed both delay times, so the sides modulated in lockstep — a dual-mono chorus
 *     rather than a stereo one.
 *
 * The fix splits the wet branch (`ChannelSplitter` → per-side delay → merger) with an explicit
 * two-channel up-mix in front, and drives the two taps with **anti-phase** depth. These assertions
 * are on the graph because that is where the defect is: the fakes record nodes and edges, and the
 * edge indices are what tell a splitter's two outputs apart.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { EffectsRack } from "../audio/EffectsRack";
import {
  FakeAudioContext,
  FakeChannelMergerNode,
  FakeGainNode,
  FakeNode,
  installFakeAudioContext,
} from "./helpers/fakeAudio";

interface ChorusInternals {
  chorusStereo: FakeGainNode;
  chorusSplitter: FakeNode | null;
  chorusDelayL: FakeNode;
  chorusDelayR: FakeNode;
  chorusWet: FakeGainNode;
  chorusLfoGainL: FakeGainNode | null;
  chorusLfoGainR: FakeGainNode | null;
}

describe("stereo chorus · wet branch", () => {
  let restore: (() => void) | null = null;
  beforeEach(() => {
    restore = installFakeAudioContext();
  });
  afterEach(() => {
    restore?.();
    restore = null;
  });

  function rack(chorus = true): { ctx: FakeAudioContext; r: EffectsRack; inner: ChorusInternals } {
    const ctx = new FakeAudioContext();
    // The fake context is deliberately not a full `BaseAudioContext`; the rack only touches the
    // factory methods the fake does implement.
    const r = new EffectsRack(ctx as unknown as BaseAudioContext);
    if (chorus) r.setChorus(true, 0.5, 0.8);
    const inner = r as unknown as ChorusInternals;
    return { ctx, r, inner };
  }

  it("gives each tap its own channel instead of the mono sum", () => {
    const { ctx, r, inner } = rack();

    const splitter = ctx.createdChannelSplitters[0] as FakeNode & { numberOfOutputs: number };
    expect(splitter, "the wet branch was not split").toBeTruthy();
    expect(splitter.numberOfOutputs).toBe(2);
    expect(inner.chorusSplitter).toBe(splitter);

    // Left tap = channel 0, right tap = channel 1.
    expect(inner.chorusSplitter!.outgoing).toContainEqual({
      node: inner.chorusDelayL,
      outputIndex: 0,
      inputIndex: 0,
    });
    expect(inner.chorusSplitter!.outgoing).toContainEqual({
      node: inner.chorusDelayR,
      outputIndex: 1,
      inputIndex: 0,
    });
    // …and the taps are no longer fed from the pre-split node.
    expect(inner.chorusDelayR.incoming).not.toContain(inner.chorusStereo.incoming[0]);

    r.destroy();
  });

  it("forces the wet branch to two channels so a mono mix keeps both taps", () => {
    // Without the up-mix a splitter hands a mono input to output 0 and silence to output 1, which
    // would mute the right tap on an all-centred mix.
    const { r, inner } = rack();
    expect(inner.chorusStereo.channelCount).toBe(2);
    expect(inner.chorusStereo.channelCountMode).toBe("explicit");
    expect(inner.chorusStereo.channelInterpretation).toBe("speakers");
    r.destroy();
  });

  it("merges the taps back on separate inputs", () => {
    const { ctx, r, inner } = rack();
    const merger = ctx.createdChannelMergers.find(
      (m) => (m as unknown as FakeChannelMergerNode).numberOfInputs === 2
    ) as FakeNode | undefined;
    expect(merger).toBeTruthy();

    expect(inner.chorusDelayL.outgoing).toContainEqual({ node: merger!, outputIndex: 0, inputIndex: 0 });
    expect(inner.chorusDelayR.outgoing).toContainEqual({ node: merger!, outputIndex: 0, inputIndex: 1 });
    r.destroy();
  });

  it("modulates the two taps in anti-phase, not together", () => {
    const { r, inner } = rack();
    expect(inner.chorusLfoGainL, "no left modulation depth").toBeTruthy();
    expect(inner.chorusLfoGainR, "no right modulation depth").toBeTruthy();

    const depthL = inner.chorusLfoGainL!.gain.value;
    const depthR = inner.chorusLfoGainR!.gain.value;
    expect(depthL).toBeGreaterThan(0);
    // Anti-phase: same amount, opposite sign — the sides move against each other.
    expect(depthR).toBeCloseTo(-depthL, 10);
    // Both base delays stay far enough from zero for the swing to stay positive.
    r.destroy();
  });

  it("releases both modulation depths when the chorus is switched off", () => {
    // A stray LFO left running was already a bug once (it put an oscillator into every offline
    // render), so switching off must release *both* new gains, not just one.
    const { r, inner } = rack();
    expect(inner.chorusLfoGainL).toBeTruthy();
    r.setChorus(false, 0.5, 0.8);
    expect(inner.chorusLfoGainL).toBeNull();
    expect(inner.chorusLfoGainR).toBeNull();
    r.destroy();
  });

  it("contributes nothing while the chorus is off, so a bypassed rack still renders as before", () => {
    // No genre enables the chorus by default (`chorusEnabled: false`, and no genre data turns it
    // on), which is why this re-wiring does not move the committed timbre or loudness baselines:
    // the new nodes cannot reach the output while the wet gain is zero, and no LFO is created.
    const { r, inner } = rack(false);
    expect(inner.chorusWet.gain.value).toBe(0);
    expect(inner.chorusLfoGainL).toBeNull();
    expect(inner.chorusLfoGainR).toBeNull();
    r.destroy();
  });
});
