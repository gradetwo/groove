import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AudioEngine } from "../audio/AudioEngine";
import { MasterclassAudioEngine } from "../audio/MasterclassAudioEngine";
import { AnatomyKickEngine } from "../audio/AnatomyKickEngine";
import { installFakeAudioContext } from "./helpers/fakeAudio";
import type { SequencerPattern, SequencerTrack } from "../types/genre";

describe("AudioEngine & Sub-Engines Expansion & Protection", () => {
  let restoreFakeAudio: () => void;

  beforeEach(() => {
    restoreFakeAudio = installFakeAudioContext();
  });

  afterEach(() => {
    restoreFakeAudio();
  });

  it("dynamically expands trackStrips when pattern has 24 or 32 tracks (e.g. CompareView)", () => {
    const engine = new AudioEngine();
    engine.initAudioContext();

    // Default strip count is at least 16
    expect(engine.getTrackStrips().length).toBeGreaterThanOrEqual(16);

    // Build a 24-track pattern (e.g. 3 genres merged in CompareView)
    const tracks24: SequencerTrack[] = Array.from({ length: 24 }, (_, i) => ({
      name: `Track ${i}`,
      track_id: i % 2 === 0 ? "kick" : "lead",
      instrument: i % 2 === 0 ? "kick" : "lead",
      steps: [1, 0, 0, 0],
      volume: 0.75,
      pan: 0.1,
    }));

    const pattern24: SequencerPattern = {
      genre_id: "compare_test_24",
      bpm: 124,
      totalSteps: 16,
      scale: "C major",
      tracks: tracks24,
    };

    engine.setPattern(pattern24);

    // Assert that strips have expanded to at least 24
    expect(engine.getTrackStrips().length).toBeGreaterThanOrEqual(24);

    // Assert that every track destination resolves to its strip insert input rather than masterGain
    for (let i = 0; i < 24; i++) {
      const dest = engine.getTrackDestination(i);
      expect(dest).toBeDefined();
      expect(dest).toBe(engine.getTrackStrips()[i].insert.input);
    }

    // Now expand to 32 tracks (e.g. 4 genres merged)
    const tracks32: SequencerTrack[] = Array.from({ length: 32 }, (_, i) => ({
      name: `Track ${i}`,
      track_id: "lead",
      instrument: "synth",
      steps: [1, 0, 1, 0],
      volume: 0.6,
      pan: -0.2,
    }));

    const pattern32: SequencerPattern = {
      genre_id: "compare_test_32",
      bpm: 128,
      totalSteps: 16,
      scale: "C major",
      tracks: tracks32,
    };

    engine.setPattern(pattern32);
    expect(engine.getTrackStrips().length).toBeGreaterThanOrEqual(32);

    for (let i = 0; i < 32; i++) {
      const dest = engine.getTrackDestination(i);
      expect(dest).toBe(engine.getTrackStrips()[i].insert.input);
    }

    engine.destroy();
  });

  it("wires MasterLimiter into MasterclassAudioEngine master bus", () => {
    const engine = new MasterclassAudioEngine();
    // Trigger audio context initialization
    engine.triggerSound("woodblock");

    const limiter = (engine as unknown as { masterLimiter: { input: unknown; output: unknown } | null })
      .masterLimiter;
    expect(limiter).toBeDefined();
    expect(limiter?.input).toBeDefined();
    expect(limiter?.output).toBeDefined();

    engine.destroy();
    const limiterAfterDestroy = (engine as unknown as { masterLimiter: unknown }).masterLimiter;
    expect(limiterAfterDestroy).toBeNull();
  });

  it("wires MasterLimiter into AnatomyKickEngine and disposes cleanly on destroy", () => {
    const engine = new AnatomyKickEngine();
    const ctx = engine.ensureContext();
    expect(ctx).toBeDefined();

    const limiter = (engine as unknown as { masterLimiter: { input: unknown; output: unknown } | null })
      .masterLimiter;
    expect(limiter).toBeDefined();
    expect(limiter?.input).toBeDefined();
    expect(limiter?.output).toBeDefined();

    engine.destroy();
    const limiterAfter = (engine as unknown as { masterLimiter: unknown }).masterLimiter;
    expect(limiterAfter).toBeNull();
  });
});
