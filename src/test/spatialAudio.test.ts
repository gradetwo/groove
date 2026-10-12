import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AudioEngine } from "../audio/AudioEngine";
import type { SequencerPattern } from "../types/genre";
import { FakeAudioContext, installFakeAudioContext } from "./helpers/fakeAudio";

/**
 * N-02 (roadmap P8-03): binaural HRTF monitoring.
 *
 * The engine must be able to place the 8 sequencer tracks on a semicircle around the
 * listener using `PannerNode` with `panningModel: "HRTF"`, and it must not pay for
 * that model when the mode is off (the default).
 */
function makePattern(tracks = 8): SequencerPattern {
  const steps = 8;
  return {
    genre_id: "spatial-test",
    bpm: 120,
    swing: 0,
    scale: "C minor",
    totalSteps: steps,
    tracks: Array.from({ length: tracks }, (_, i) => ({
      track_id: ["kick", "snare", "hihat", "percussion", "bass", "chords", "lead", "fx"][i % 8],
      name: `Track ${i}`,
      instrument: "synth",
      steps: new Array(steps).fill(i === 0 ? 1 : 0),
      velocity: new Array(steps).fill(100),
      pitch: new Array(steps).fill(0),
      gate: new Array(steps).fill(0.8),
      volume: 0.8,
      pan: 0,
      mute: false,
      solo: false,
    })),
  } as unknown as SequencerPattern;
}

describe("N-02 · HRTF spatial monitoring", () => {
  let restore: (() => void) | null = null;
  beforeEach(() => {
    restore = installFakeAudioContext();
  });
  afterEach(() => {
    restore?.();
    restore = null;
  });

  it("is off by default and uses the plain stereo panner", () => {
    const engine = new AudioEngine();
    expect(engine.getSpatialMode()).toBe(false);

    const ctx = engine.getAudioContext() as unknown as FakeAudioContext;
    // Strips are built during initAudioContext, before any spatial mode is enabled.
    expect(ctx.createdSpatialPanners.length).toBe(0);
    expect(ctx.createdPanners.length).toBeGreaterThan(0);

    engine.destroy();
  });

  it("creates one HRTF panner per track when enabled", () => {
    const engine = new AudioEngine();
    engine.setPattern(makePattern(8));

    engine.setSpatialMode(true);
    expect(engine.getSpatialMode()).toBe(true);

    const ctx = engine.getAudioContext() as unknown as FakeAudioContext;
    const spatial = ctx.createdSpatialPanners;
    expect(spatial.length).toBe(16); // strips are always provisioned for 16 slots
    for (const panner of spatial) {
      expect(panner.panningModel).toBe("HRTF");
      expect(panner.distanceModel).toBe("inverse");
    }

    engine.destroy();
  });

  it("fans the tracks across a semicircle with distinct front/left/right positions", () => {
    const engine = new AudioEngine();

    const layout = engine.getSpatialLayout(8);
    expect(layout).toHaveLength(8);
    expect(layout[0].azimuth).toBeLessThan(0);
    expect(layout[layout.length - 1].azimuth).toBeGreaterThan(0);

    // Azimuth increases strictly from left to right.
    for (let i = 1; i < layout.length; i++) {
      expect(layout[i].azimuth).toBeGreaterThan(layout[i - 1].azimuth);
    }
    // Everything stays inside the frontal semicircle and at a sane distance.
    for (const slot of layout) {
      expect(Math.abs(slot.azimuth)).toBeLessThanOrEqual(90);
      expect(slot.distance).toBeGreaterThan(0.5);
      expect(slot.distance).toBeLessThan(3);
    }
    // No two tracks share the exact same position.
    const fingerprints = new Set(layout.map((s) => `${s.azimuth}|${s.distance}|${s.elevation}`));
    expect(fingerprints.size).toBe(layout.length);

    engine.destroy();
  });

  it("writes real panner positions (x/y/z AudioParams)", () => {
    const engine = new AudioEngine();
    engine.setPattern(makePattern(8));
    engine.setSpatialMode(true);

    const ctx = engine.getAudioContext() as unknown as FakeAudioContext;
    const first = ctx.createdSpatialPanners[0];
    const last = ctx.createdSpatialPanners[7];

    // Left-most track has a negative x, right-most a positive x, both in front (z < 0).
    expect(first.positionX.value).toBeLessThan(0);
    expect(last.positionX.value).toBeGreaterThan(0);
    expect(first.positionZ.value).toBeLessThan(0);
    expect(last.positionZ.value).toBeLessThan(0);

    engine.destroy();
  });

  it("maps the pan control onto azimuth while in binaural mode", () => {
    const engine = new AudioEngine();
    engine.setPattern(makePattern(8));
    engine.setSpatialMode(true);

    const ctx = engine.getAudioContext() as unknown as FakeAudioContext;
    const panner = ctx.createdSpatialPanners[0];
    const beforeX = panner.positionX.value;

    engine.setTrackState(0, { pan: 1 });
    expect(panner.positionX.value).toBeGreaterThan(beforeX);

    engine.destroy();
  });

  it("switching back to stereo restores stereo panners and drops the HRTF nodes", () => {
    const engine = new AudioEngine();
    engine.setPattern(makePattern(8));

    engine.setSpatialMode(true);
    const ctx = engine.getAudioContext() as unknown as FakeAudioContext;
    const spatialCount = ctx.createdSpatialPanners.length;

    engine.setSpatialMode(false);
    expect(engine.getSpatialMode()).toBe(false);
    // Strips were rebuilt with stereo panners, and no extra HRTF nodes were created.
    expect(ctx.createdSpatialPanners.length).toBe(spatialCount);

    engine.destroy();
  });

  it("keeps the transport working after a mode switch", async () => {
    const engine = new AudioEngine();
    engine.setPattern(makePattern(8));

    engine.setSpatialMode(true);
    await engine.play();

    const health = engine.getSchedulerHealth();
    expect(engine.getIsPlaying()).toBe(true);
    expect(health.schedulingErrors).toBe(0);

    engine.stop();
    engine.destroy();
  });
});
