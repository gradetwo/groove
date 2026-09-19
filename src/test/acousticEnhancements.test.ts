import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AudioEngine } from "../audio/AudioEngine";
import { renderPatternOffline } from "../audio/WavExporter";
import { installFakeAudioContext, installFakeOfflineAudioContext, FakeAudioContext, FakeOfflineAudioContext } from "./helpers/fakeAudio";
import type { SequencerPattern, SequencerTrack } from "../types/genre";

describe("Phase 2.3 Acoustic Enhancements: Hi-Hat Choke Group & Kick/Bass Ducking", () => {
  let restoreFakeAudio: () => void;
  let restoreFakeOfflineAudio: () => void;

  beforeEach(() => {
    restoreFakeAudio = installFakeAudioContext();
    restoreFakeOfflineAudio = installFakeOfflineAudioContext();
  });

  afterEach(() => {
    restoreFakeOfflineAudio();
    restoreFakeAudio();
  });

  it("AudioEngine includes duckGain in every TrackChannelStrip initialized to 1.0", () => {
    const engine = new AudioEngine();
    engine.initAudioContext();

    const strips = engine.getTrackStrips();
    expect(strips.length).toBeGreaterThanOrEqual(16);
    for (const strip of strips) {
      expect(strip.duckGain).toBeDefined();
      expect(strip.duckGain.gain.value).toBe(1);
    }
  });

  it("AudioEngine applies sidechain ducking to bass strip when kick triggers, but not to other tracks", () => {
    const engine = new AudioEngine();
    engine.initAudioContext();

    const kickTrack: SequencerTrack = {
      name: "Kick",
      track_id: "kick",
      instrument: "kick",
      steps: [1, 0, 0, 0],
      velocity: [127, 0, 0, 0],
      pitch: [0, 0, 0, 0],
      volume: 0.8,
      pan: 0,
    };

    const bassTrack: SequencerTrack = {
      name: "Bass",
      track_id: "bass",
      instrument: "synth",
      steps: [1, 0, 0, 0],
      velocity: [100, 0, 0, 0],
      pitch: [36, 0, 0, 0],
      volume: 0.8,
      pan: 0,
    };

    const leadTrack: SequencerTrack = {
      name: "Lead",
      track_id: "lead",
      instrument: "synth",
      steps: [1, 0, 0, 0],
      velocity: [90, 0, 0, 0],
      pitch: [60, 0, 0, 0],
      volume: 0.8,
      pan: 0,
    };

    const pattern: SequencerPattern = {
      genre_id: "acoustic_test",
      bpm: 120,
      totalSteps: 4,
      scale: "C major",
      tracks: [kickTrack, bassTrack, leadTrack],
    };

    engine.setPattern(pattern);

    const bassDuckParam = (engine.getTrackStrips()[1].duckGain.gain as any);
    const leadDuckParam = (engine.getTrackStrips()[2].duckGain.gain as any);

    // Initial event count
    const initialBassEvents = bassDuckParam.events.length;
    const initialLeadEvents = leadDuckParam.events.length;

    // Trigger Kick Note
    engine.triggerNote(0, "Kick", 1.0, 0, 1, 0.8);

    // Bass strip must receive ducking events (linear dip ~0.7 then exponential recovery to 1.0)
    const newBassEvents = bassDuckParam.events.slice(initialBassEvents);
    expect(newBassEvents.length).toBeGreaterThanOrEqual(2);

    const rampDown = newBassEvents.find((e: any) => e.type === "linearRampToValueAtTime");
    expect(rampDown).toBeDefined();
    expect(rampDown.value).toBeLessThanOrEqual(0.75); // -3dB dip

    const rampUp = newBassEvents.find((e: any) => e.type === "exponentialRampToValueAtTime");
    expect(rampUp).toBeDefined();
    expect(rampUp.value).toBe(1.0);

    // Lead strip must NOT receive any ducking
    const newLeadEvents = leadDuckParam.events.slice(initialLeadEvents);
    expect(newLeadEvents.length).toBe(0);
  });

  it("AudioEngine Hi-Hat Choke Group: closed hat chokes currently sounding open hat", () => {
    const engine = new AudioEngine();
    engine.initAudioContext();

    const hihatTrack: SequencerTrack = {
      name: "HiHat",
      track_id: "hihat",
      instrument: "hihat",
      steps: [2, 1, 0, 0], // step 0: open hat (2), step 1: closed hat (1)
      velocity: [110, 110, 0, 0],
      pitch: [0, 0, 0, 0],
      volume: 0.8,
      pan: 0,
    };

    const pattern: SequencerPattern = {
      genre_id: "acoustic_test_hat",
      bpm: 120,
      totalSteps: 4,
      scale: "C major",
      tracks: [hihatTrack],
    };

    engine.setPattern(pattern);

    // Trigger Open Hat (stepVal 2) at t = 0
    engine.triggerNote(0, "HiHat", 0.9, 0, 2, 0.8);

    // Get active open hat voice gains
    const activeOpenHats = (engine as any).openHiHatVoices;
    expect(activeOpenHats.length).toBe(1);
    const openHatGainParam = (activeOpenHats[0].gains[0].gain as any);
    const initialEvents = openHatGainParam.events.length;

    // Trigger Closed Hat (stepVal 1) at t = 0.25 (before open hat decay finishes)
    engine.triggerNote(0, "HiHat", 0.8, 0, 1, 0.8);

    // The open hat gain node must have received choke commands (cancel + quick ramp to 0.0001)
    const chokeEvents = openHatGainParam.events.slice(initialEvents);
    const chokeRamp = chokeEvents.find((e: any) => e.type === "exponentialRampToValueAtTime");
    expect(chokeRamp).toBeDefined();
    expect(chokeRamp.value).toBe(0.0001);
  });

  it("WavExporter offline render mirrors kick-bass ducking and hi-hat choking", async () => {
    const kickTrack: SequencerTrack = {
      name: "Kick",
      track_id: "kick",
      instrument: "kick",
      steps: [1, 0, 0, 0],
      velocity: [127, 0, 0, 0],
      pitch: [0, 0, 0, 0],
      volume: 0.8,
      pan: 0,
    };

    const bassTrack: SequencerTrack = {
      name: "Bass",
      track_id: "bass",
      instrument: "synth",
      steps: [1, 0, 0, 0],
      velocity: [100, 0, 0, 0],
      pitch: [36, 0, 0, 0],
      volume: 0.8,
      pan: 0,
    };

    const hihatTrack: SequencerTrack = {
      name: "HiHat",
      track_id: "hihat",
      instrument: "hihat",
      steps: [2, 1, 0, 0],
      velocity: [100, 100, 0, 0],
      pitch: [0, 0, 0, 0],
      volume: 0.8,
      pan: 0,
    };

    const pattern: SequencerPattern = {
      genre_id: "wav_acoustic_test",
      bpm: 120,
      totalSteps: 4,
      scale: "C major",
      tracks: [kickTrack, bassTrack, hihatTrack],
    };

    await renderPatternOffline(pattern);

    const offlineCtx = FakeOfflineAudioContext.lastInstance;
    expect(offlineCtx).toBeDefined();

    // Verify that at least one gain node received ducking linearRamp
    const duckedGains = offlineCtx!.createdGains.filter((g) =>
      g.gain.events.some((e: any) => e.type === "linearRampToValueAtTime" && e.value < 0.8)
    );
    expect(duckedGains.length).toBeGreaterThanOrEqual(1);

    // Verify that hi-hat choke happened (exponential ramp to 0.0001)
    const chokedGains = offlineCtx!.createdGains.filter((g) =>
      g.gain.events.some((e: any) => e.type === "exponentialRampToValueAtTime" && e.value === 0.0001)
    );
    expect(chokedGains.length).toBeGreaterThanOrEqual(1);
  });
});
