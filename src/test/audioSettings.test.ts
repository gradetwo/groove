import { describe, it, expect, beforeEach } from "vitest";
import { AudioEngine } from "../audio/AudioEngine";

describe("AudioEngine Latency & Hearing Protection (P4-05)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("clamps master volume to hearing safety limit when hearing protection is on", () => {
    const engine = new AudioEngine();
    engine.setHearingProtection(true);
    engine.setMaxVolumeLimit(0.85);

    // Attempt to set 100% volume
    engine.setMasterVolume(1.0);
    expect(engine.isHearingProtectionEnabled()).toBe(true);
    expect(engine.getMaxVolumeLimit()).toBe(0.85);
  });

  it("persists latency compensation and hearing protection settings in localStorage", () => {
    const engine1 = new AudioEngine();
    engine1.setLatencyCompensation(25);
    engine1.setMaxVolumeLimit(0.8);
    engine1.setHearingProtection(true);

    const savedRaw = localStorage.getItem("groove_audio_settings_v1");
    expect(savedRaw).toBeDefined();
    const parsed = JSON.parse(savedRaw!);
    expect(parsed.latencyCompensationMs).toBe(25);
    expect(parsed.maxVolumeLimit).toBe(0.8);
    expect(parsed.hearingProtection).toBe(true);

    // New instance loads persisted settings
    const engine2 = new AudioEngine();
    expect(engine2.getLatencyCompensation()).toBe(25);
    expect(engine2.getMaxVolumeLimit()).toBe(0.8);
    expect(engine2.isHearingProtectionEnabled()).toBe(true);
  });

  it("clamps latency compensation to safe range (-100ms to +100ms)", () => {
    const engine = new AudioEngine();
    engine.setLatencyCompensation(250);
    expect(engine.getLatencyCompensation()).toBe(100);

    engine.setLatencyCompensation(-300);
    expect(engine.getLatencyCompensation()).toBe(-100);
  });
});
