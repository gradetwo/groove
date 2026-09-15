import { describe, it, expect, beforeEach } from "vitest";
import { AudioEngine } from "../audio/AudioEngine";
import { DEFAULT_GS1_ROUTING_ENABLED, isGs1RoutingEnabled, setGs1RoutingEnabled } from "../audio/gs1/gs1Tracks";

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

/**
 * GS-1 voices for `chords`/`lead` (P6): on by default, switchable, persisted.
 *
 * The default matters: it is the difference between "GS-1 is wired" and "GS-1 is what you hear".
 * The user asked for on-by-default with a manual off switch in the audio settings, so both halves
 * are pinned here — the default **and** the fact that turning it off takes effect immediately.
 */
describe("AudioEngine · GS-1 chord/lead voices", () => {
  beforeEach(() => {
    localStorage.clear();
    setGs1RoutingEnabled(DEFAULT_GS1_ROUTING_ENABLED);
  });

  it("is on by default, and the routing switch agrees", () => {
    const engine = new AudioEngine();
    expect(engine.isGs1Enabled()).toBe(true);
    expect(isGs1RoutingEnabled()).toBe(true);
    expect(DEFAULT_GS1_ROUTING_ENABLED).toBe(true);
  });

  it("turns the routing switch off immediately, not just on the next load", () => {
    const engine = new AudioEngine();
    engine.setGs1Enabled(false);
    expect(engine.isGs1Enabled()).toBe(false);
    // The engines consult the module switch, so it has to change now.
    expect(isGs1RoutingEnabled()).toBe(false);
    engine.setGs1Enabled(true);
    expect(isGs1RoutingEnabled()).toBe(true);
  });

  it("persists the choice across engines", () => {
    const first = new AudioEngine();
    first.setGs1Enabled(false);

    const stored = JSON.parse(localStorage.getItem("groove_audio_settings_v1")!);
    expect(stored.gs1Enabled).toBe(false);

    const second = new AudioEngine();
    expect(second.isGs1Enabled()).toBe(false);
    // …and the restored setting is applied to the switch, so a reload really is off.
    expect(isGs1RoutingEnabled()).toBe(false);
  });

  it("ignores a corrupt stored value instead of switching silently", () => {
    localStorage.setItem(
      "groove_audio_settings_v1",
      JSON.stringify({ gs1Enabled: "yes please", hearingProtection: true })
    );
    const engine = new AudioEngine();
    expect(engine.isGs1Enabled()).toBe(true);
    expect(isGs1RoutingEnabled()).toBe(true);
  });
});
