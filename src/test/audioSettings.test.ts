import { describe, it, expect, beforeEach } from "vitest";
import { AudioEngine } from "../audio/AudioEngine";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

/**
 * The toolbar's GS-1 switch (P6) — the user's "default on, but I can turn it off" control.
 *
 * The toolbar is a presentational component: it reflects the value and asks for a change. What is
 * pinned here is that a *user* toggling it reaches the engine's persisted setting and back, which
 * is the whole contract; the button's own rendering is covered by the toolbar snapshot suite.
 */
describe("GS-1 toolbar switch", () => {
  const read = (relative: string) =>
    readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", relative), "utf8");

  it("renders only when a handler is supplied, and defaults to on", () => {
    const source = read("components/sequencer/Toolbar.tsx");
    // Optional props, like the console toggle: the control is absent when nobody wires it, and an
    // unwired toolbar still renders (which is what the toolbar test factories rely on).
    expect(source).toContain("gs1Enabled?: boolean;");
    expect(source).toContain("onToggleGs1?: () => void;");
    expect(source).toContain("gs1Enabled = true");
    expect(source).toMatch(/\{onToggleGs1 && \(/);
    expect(source).toContain('data-testid="studio-gs1-toggle"');
  });

  it("is wired to the engine's persisted setting through the one shared source of truth", () => {
    const studio = read("views/StudioView.tsx");
    // The switch used to be mirrored in local state (one `useState` per surface), which is how the
    // toolbar and the settings panel could disagree. The value now comes from the shared hook,
    // which subscribes to the module state the schedulers read; the engine keeps ownership of the
    // persistent setting. Behaviour is covered by `gs1SettingSync.test.tsx` — this guard only
    // ensures nobody quietly reintroduces a private mirror.
    expect(studio).toContain("useGs1Setting(engineRef.current)");
    expect(studio).not.toMatch(/const \[gs1Enabled, setGs1Enabled\] = useState/);
    expect(studio).toContain("gs1Enabled={gs1Enabled}");
    expect(studio).toContain("onToggleGs1={() => setGs1Enabled(!gs1Enabled)}");

    const hook = read("features/sequencer/useGs1Setting.ts");
    expect(hook).toContain("engine.setGs1Enabled(next)");
    expect(hook).toContain("useSyncExternalStore(subscribeGs1Routing, isGs1RoutingEnabled, isGs1RoutingEnabled)");

    // The header entry point (item ⑤) must host a panel that can flip the same switch.
    const app = read("App.tsx");
    expect(app).toContain("<SettingsModal");
    expect(app).toContain("engine={engineInstance}");
    expect(app).toContain("gs1Enabled={gs1Enabled}");
    expect(app).toContain("onToggleGs1={() => setGs1Enabled(!gs1Enabled)}");
  });

  it("keeps a global settings entry point between the language switch and the version button", () => {
    const header = read("components/Header.tsx");
    const language = header.indexOf('data-testid="header-language-switch"');
    const settings = header.indexOf('data-testid="header-settings-open"');
    const version = header.indexOf('data-testid="header-version-button"');
    // The user asked for exactly this placement, and it must not drift with future edits.
    expect(language).toBeGreaterThan(-1);
    expect(settings).toBeGreaterThan(language);
    expect(version).toBeGreaterThan(settings);
  });
});
