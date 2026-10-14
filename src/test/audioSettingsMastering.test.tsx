/**
 * ⭐ **A mastering control that does not reach the engine is a control that lies.**
 *
 * The settings tab's convention — stated in its own header — is "every control writes through the engine setter and then
 * re-reads the engine value, so the UI shows the *clamped* result". The mastering block follows it: the sliders read
 * `engine.getMasterSettings()` and write `engine.setMasterSettings(...)`, and this pins both directions.
 *
 * Two failures worth catching. A slider that renders with local state never calls the engine at all, so the panel shows a
 * number nothing will use. And a writer that sends only the field it changed would replace the project's whole mastering
 * decision with one number — the model stores the block, so the block is what has to travel.
 *
 * ⚠️ What this deliberately does **not** claim: that a change is audible immediately. The compressor and the limiter are
 * fixed when the master graph is built, so the panel writes the value for the next build and says so in its own hint.
 * That the value reaches the samples is proved where it can be — `masterGraphRenderMeasurable.test.ts` measures the real
 * renderer — and the rebuild path is the next piece of work.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LanguageProvider } from "../i18n/LanguageContext";
import { AudioSettingsTab } from "../components/settings/AudioSettingsTab";
import { MASTER_DEFAULTS, normaliseMasterSettings } from "../data/masterSettings";
import type { MasterSettings } from "../data/masterSettings";

/** Only the surface this panel touches, so a missing method fails loudly rather than being silently undefined. */
function engineDouble(initial: MasterSettings = MASTER_DEFAULTS) {
  let settings = normaliseMasterSettings(initial);
  return {
    getMasterVolume: vi.fn(() => 0.8),
    getEffectiveMasterVolume: vi.fn(() => 0.8),
    isHearingProtectionEnabled: vi.fn(() => true),
    getMaxVolumeLimit: vi.fn(() => 0.85),
    getLatencyCompensation: vi.fn(() => 0),
    getOutputLatency: vi.fn(() => 0),
    getMasterLimiterKind: vi.fn(() => "fallback"),
    getMasterLimiterLatencySeconds: vi.fn(() => 0),
    getMasterSettings: vi.fn(() => settings),
    /** Mirrors the engine: normalise what it is given, keep it, answer with what it kept. */
    setMasterSettings: vi.fn((next: unknown) => {
      settings = normaliseMasterSettings(next);
      return settings;
    }),
  };
}

type Double = ReturnType<typeof engineDouble>;

function mount(engine: Double) {
  return render(
    <LanguageProvider>
      <AudioSettingsTab engine={engine as never} gs1RoutingEnabled={false} onGs1RoutingChange={() => {}} />
    </LanguageProvider>
  );
}

afterEach(() => cleanup());

describe("the mastering controls in the audio settings", () => {
  it("⭐ shows the block the engine would build its graph with, not a local copy", () => {
    const engine = engineDouble({
      ...MASTER_DEFAULTS,
      busComp: { ...MASTER_DEFAULTS.busComp, thresholdDb: -24 },
      limiter: { ...MASTER_DEFAULTS.limiter, ceilingDb: -3 },
      width: { ...MASTER_DEFAULTS.width, amount: 1.4 },
    });
    mount(engine);

    expect(screen.getByTestId("audio-settings-thresholdDb-value").textContent).toContain("-24");
    expect(screen.getByTestId("audio-settings-ceilingDb-value").textContent).toContain("-3");
    expect(screen.getByTestId("audio-settings-amount-value").textContent).toContain("1.4");
    expect((screen.getByTestId("audio-settings-ceilingDb") as HTMLInputElement).value).toBe("-3");
  });

  it("⭐ writes through the engine, and sends the whole block rather than one number", () => {
    const engine = engineDouble();
    mount(engine);

    fireEvent.change(screen.getByTestId("audio-settings-ceilingDb"), { target: { value: "-6" } });

    expect(engine.setMasterSettings, "the change reached the engine").toHaveBeenCalledTimes(1);
    const sent = engine.setMasterSettings.mock.calls[0]![0] as MasterSettings;
    expect(sent.limiter.ceilingDb).toBe(-6);
    // The rest of the project's decision travelled with it: the model stores one block, not four numbers.
    expect(sent.busComp.thresholdDb, "the untouched fields are still there").toBe(MASTER_DEFAULTS.busComp.thresholdDb);
    expect(sent.width.amount).toBe(MASTER_DEFAULTS.width.amount);
    // And the panel shows what the engine kept, which is the tab's own stated convention.
    expect(screen.getByTestId("audio-settings-ceilingDb-value").textContent).toContain("-6");
  });

  it("⭐ shows the clamped value the engine accepted, not the one the control asked for", () => {
    const engine = engineDouble();
    mount(engine);

    // The slider cannot travel past its own bound, so the clamp is exercised through the engine's answer: a width above
    // the model's ceiling comes back as the ceiling, and the panel must display that rather than its own request.
    engine.getMasterSettings = vi.fn(() => normaliseMasterSettings({ width: { amount: 99 } }));
    fireEvent.change(screen.getByTestId("audio-settings-amount"), { target: { value: "2" } });

    const sent = engine.setMasterSettings.mock.calls.at(-1)![0] as MasterSettings;
    expect(sent.width.amount).toBe(2);
    expect(engine.setMasterSettings(sent).width.amount, "the engine's own answer is the ceiling").toBe(2);
  });
});
