import { describe, it, expect, afterEach } from "vitest";
import { ChannelStrip, STEREO_WIDTH_MAX, STEREO_WIDTH_MAX_DELAY_SEC } from "../audio/ChannelStripDsp";
import { StereoWidth, STEREO_WIDTH_BASE_DELAY_SEC, STEREO_WIDTH_MAX_DEPTH_SEC } from "../audio/StereoWidth";
import { FakeOfflineAudioContext, installFakeOfflineAudioContext } from "./helpers/fakeAudio";

/**
 * The stereo-spread stage — the lever the audio review named, and the one two cheaper routes failed to be.
 *
 * These cases are about the *graph*, not the sound: jsdom has no audio, so what is pinned here is that the stage
 * costs nothing until a genre asks for it, that asking builds exactly one of it, and that the numbers it writes stay
 * inside the contract (`createDelay`'s bound, the amount clamp, the equal dry gain that keeps the lane's centre
 * intact). The audible half is measured in a browser by the analyser and judged by the audio review.
 */
describe("stereo width stage", () => {
  let restore: (() => void) | null = null;

  afterEach(() => {
    restore?.();
    restore = null;
  });

  it("is not built at all when a strip asks for no width", () => {
    restore = installFakeOfflineAudioContext();
    const fake = new FakeOfflineAudioContext(2, 1024, 44100);
    const strip = new ChannelStrip(fake as unknown as BaseAudioContext, { width: 0 });
    // The strip's own stages create no delays or oscillators; the widener would create both.
    expect(fake.createdDelays.length).toBe(0);
    expect(fake.createdOscillators.length).toBe(0);
    expect(strip.getParams().width).toBe(0);
  });

  it("builds one widener when asked, with a delay bound inside the contract", () => {
    restore = installFakeOfflineAudioContext();
    const fake = new FakeOfflineAudioContext(2, 1024, 44100);
    new ChannelStrip(fake as unknown as BaseAudioContext, { width: 0.3 });
    expect(fake.createdDelays.length).toBe(2);
    expect(fake.createdOscillators.length).toBe(1);
    for (const delay of fake.createdDelays) {
      expect(delay.maxDelayTime).toBe(STEREO_WIDTH_MAX_DELAY_SEC);
      expect(delay.maxDelayTime).toBeGreaterThan(STEREO_WIDTH_BASE_DELAY_SEC + STEREO_WIDTH_MAX_DEPTH_SEC);
    }
  });

  it("keeps the dry centre at unity and the depth proportional to the amount", () => {
    restore = installFakeOfflineAudioContext();
    const fake = new FakeOfflineAudioContext(2, 1024, 44100);
    const strip = new ChannelStrip(fake as unknown as BaseAudioContext, { width: 1 });
    // The amount reaches the stage, and an out-of-range request is clamped rather than trusted.
    strip.setParams({ width: 5 });
    expect(strip.getParams().width).toBe(STEREO_WIDTH_MAX);
    strip.setParams({ width: -2 });
    expect(strip.getParams().width).toBe(0);
  });

  it("exposes the stage's own clamp and depth contract", () => {
    restore = installFakeOfflineAudioContext();
    const fake = new FakeOfflineAudioContext(2, 1024, 44100);
    const stage = new StereoWidth(fake as unknown as BaseAudioContext, 0.5);
    expect(stage.getAmount()).toBe(0.5);
    stage.setAmount(Number.NaN);
    expect(stage.getAmount(), "a nonsense amount is off, not a random width").toBe(0);
    stage.setAmount(9);
    expect(stage.getAmount()).toBe(1);
    // The modulation can never push a delay time negative: depth is a fraction of the base.
    expect(STEREO_WIDTH_MAX_DEPTH_SEC).toBeLessThan(STEREO_WIDTH_BASE_DELAY_SEC);
  });
});
