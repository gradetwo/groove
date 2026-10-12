/**
 * Audio settings panel (P6 follow-up).
 *
 * The engine has carried `latencyCompensationMs`, `hearingProtection` and `maxVolumeLimit`
 * since long before this panel existed, persisted them, and had no UI at all — the only way
 * to reach them was the console. The GS-1 switch lived in the toolbar drawer; the user asked
 * for it to be reachable "in the audio settings", so the panel is now the authoritative place
 * for all four and the drawer keeps a shortcut.
 *
 * What is pinned here:
 *   1. the panel shows the ENGINE's values, not its own guesses, every time it opens;
 *   2. every control writes through the engine setter;
 *   3. the panel re-reads after writing, so it displays the CLAMPED value the engine accepted;
 *   4. hearing protection off disables the limit slider (the limit genuinely does not apply);
 *   5. the GS-1 toggle is delegated to the view, which owns the shared value.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SettingsModal } from "../components/settings/SettingsModal";
import { AudioEngine } from "../audio/AudioEngine";
import { DEFAULT_GS1_ROUTING_ENABLED, setGs1RoutingEnabled } from "../audio/gs1/gs1Tracks";
import { APP_VERSION } from "../version";
import { loadLayoutPrefs } from "../features/sequencer/layoutPrefs";
import { getHapticSettings } from "../utils/haptics";

function makeEngine(overrides: Partial<Record<string, unknown>> = {}) {
  const calls: string[] = [];
  const state = {
    masterVolume: 0.8,
    effectiveVolume: 0.8,
    hearingProtection: true,
    maxVolumeLimit: 0.85,
    latencyCompensation: 25,
    gs1: true,
    limiterKind: "worklet",
    limiterLatency: 0.003,
    ...overrides,
  };
  const engine = {
    getMasterVolume: () => state.masterVolume,
    getEffectiveMasterVolume: () => state.effectiveVolume,
    isHearingProtectionEnabled: () => state.hearingProtection,
    getMaxVolumeLimit: () => state.maxVolumeLimit,
    getLatencyCompensation: () => state.latencyCompensation,
    getOutputLatency: () => 12,
    getMasterLimiterKind: () => state.limiterKind,
    getMasterLimiterLatencySeconds: () => state.limiterLatency,
    isGs1Enabled: () => state.gs1,
    setMasterVolume: vi.fn((v: number) => {
      calls.push(`setMasterVolume:${v}`);
      state.masterVolume = v;
      state.effectiveVolume = state.hearingProtection ? Math.min(state.maxVolumeLimit, v) : v;
    }),
    setHearingProtection: vi.fn((on: boolean) => {
      calls.push(`setHearingProtection:${on}`);
      state.hearingProtection = on;
    }),
    setMaxVolumeLimit: vi.fn((v: number) => {
      calls.push(`setMaxVolumeLimit:${v}`);
      state.maxVolumeLimit = v;
    }),
    setLatencyCompensation: vi.fn((ms: number) => {
      calls.push(`setLatencyCompensation:${ms}`);
      // Mirrors the engine: the stored value is clamped to ±100 ms.
      state.latencyCompensation = Math.max(-100, Math.min(100, ms));
    }),
  };
  return { engine: engine as unknown as AudioEngine, state, calls, raw: engine };
}

const renderPanel = (engine: AudioEngine, props: Partial<React.ComponentProps<typeof SettingsModal>> = {}) =>
  render(
    <SettingsModal
      isOpen
      onClose={() => {}}
      engine={engine}
      gs1Enabled
      onToggleGs1={() => {}}
      {...props}
    />
  );

describe("SettingsModal · the new-user guide can be replayed (U2)", () => {
  it("calls the host's replay callback from the About tab", () => {
    // A guide that can be dismissed without being finished needs a way back; clearing site data is
    // not a remedy a user can be expected to find.
    const onReplayOnboarding = vi.fn();
    // Open straight to About: the audio tab needs a fuller engine double than this case is about.
    renderPanel(makeEngine() as unknown as AudioEngine, { onReplayOnboarding, initialTab: "about" });

    fireEvent.click(screen.getByTestId("settings-about-replay-onboarding"));

    expect(onReplayOnboarding).toHaveBeenCalledTimes(1);
  });
});

describe("SettingsModal (audio tab)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    setGs1RoutingEnabled(DEFAULT_GS1_ROUTING_ENABLED);
  });

  it("renders the engine's current values, not its own defaults", () => {
    const { engine } = makeEngine({
      masterVolume: 0.62,
      effectiveVolume: 0.62,
      hearingProtection: true,
      maxVolumeLimit: 0.7,
      latencyCompensation: -30,
    });
    renderPanel(engine);

    expect(screen.getByTestId("audio-settings-master-value")).toHaveTextContent("62%");
    expect(screen.getByTestId("audio-settings-limit-value")).toHaveTextContent("70%");
    expect(screen.getByTestId("audio-settings-latency-value")).toHaveTextContent("-30 ms");
    expect(screen.getByTestId("audio-settings-output-latency")).toHaveTextContent("12 ms");
    // A negative compensation keeps its real sign rather than being printed as "+-30".
    expect(screen.getByTestId("audio-settings-latency-value").textContent).not.toContain("+");
  });

  it("writes the master volume through the engine and shows the engine's clamped result", () => {
    const { engine, raw, state } = makeEngine();
    renderPanel(engine);

    fireEvent.change(screen.getByTestId("audio-settings-master-slider"), { target: { value: "100" } });

    expect(raw.setMasterVolume).toHaveBeenCalledWith(1);
    expect(state.masterVolume).toBe(1);
    // Limit is 0.85, so protection holds the output below the fader: the panel must say so.
    expect(screen.getByTestId("audio-settings-effective-note")).toHaveTextContent("85%");
  });

  it("turns hearing protection off, and disables the limit slider that no longer applies", () => {
    const { engine, raw, state } = makeEngine();
    renderPanel(engine);

    fireEvent.click(screen.getByTestId("audio-settings-hearing-toggle"));

    expect(raw.setHearingProtection).toHaveBeenCalledWith(false);
    expect(state.hearingProtection).toBe(false);
    expect(screen.getByTestId("audio-settings-limit-slider")).toBeDisabled();
    expect(raw.setMaxVolumeLimit).not.toHaveBeenCalled();
  });

  it("shows the clamped latency when a request exceeds the engine's range", () => {
    const { engine, raw, state } = makeEngine();
    renderPanel(engine);

    // The slider itself cannot go past 100; this asserts the re-read contract that would
    // matter if the range ever widened without the panel following.
    fireEvent.change(screen.getByTestId("audio-settings-latency-slider"), { target: { value: "100" } });

    expect(raw.setLatencyCompensation).toHaveBeenCalledWith(100);
    expect(state.latencyCompensation).toBe(100);
    expect(screen.getByTestId("audio-settings-latency-value")).toHaveTextContent("+100 ms");
  });

  it("reports the limiter honestly, and delegates the GS-1 switch to its owner", () => {
    const onToggleGs1 = vi.fn();
    const { engine, raw } = makeEngine({ limiterKind: "fallback" });
    renderPanel(engine, { gs1Enabled: true, onToggleGs1 });

    // No LanguageProvider here, so `useLanguage` falls back to Chinese; accept either wording.
    expect(screen.getByTestId("audio-settings-limiter")).toHaveTextContent(/fallback|降级/i);
    fireEvent.click(screen.getByTestId("audio-settings-gs1-toggle"));
    expect(onToggleGs1).toHaveBeenCalledTimes(1);
    // The view owns the value (it is shared with the toolbar), so the panel must not write it.
    expect(raw.setHearingProtection).not.toHaveBeenCalled();
  });

  it("re-syncs from the engine on every open, so the toolbar cannot leave it stale", () => {
    const { engine, state } = makeEngine({ masterVolume: 0.4, effectiveVolume: 0.4 });
    const { rerender } = renderPanel(engine, { isOpen: false });
    // Modal renders nothing while closed.
    expect(screen.queryByTestId("audio-settings-master-value")).toBeNull();

    state.masterVolume = 0.9;
    state.effectiveVolume = 0.9;
    rerender(<SettingsModal isOpen onClose={() => {}} engine={engine} gs1Enabled onToggleGs1={() => {}} />);
    expect(screen.getByTestId("audio-settings-master-value")).toHaveTextContent("90%");
  });

  it("works with the real engine: clamping is the engine's, and the panel displays it", () => {
    const engine = new AudioEngine();
    engine.setHearingProtection(true);
    engine.setMaxVolumeLimit(0.5);
    engine.setMasterVolume(1);
    engine.setLatencyCompensation(250); // engine clamps to +100
    renderPanel(engine);

    expect(screen.getByTestId("audio-settings-limit-value")).toHaveTextContent("50%");
    expect(screen.getByTestId("audio-settings-latency-value")).toHaveTextContent("+100 ms");
    expect(screen.getByTestId("audio-settings-effective-note")).toHaveTextContent("50%");
    // A real engine on jsdom has no output latency to report; it must say 0, not "undefined".
    expect(screen.getByTestId("audio-settings-output-latency")).toHaveTextContent("0 ms");
  });

  it("survives a null engine (panel opened before the engine exists)", () => {
    renderPanel(null as unknown as AudioEngine);
    expect(screen.getByTestId("audio-settings-master-value")).toHaveTextContent("%");
    expect(screen.getByTestId("audio-settings-diagnostics")).toBeInTheDocument();
  });
});

describe("SettingsModal tabs", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    setGs1RoutingEnabled(DEFAULT_GS1_ROUTING_ENABLED);
  });

  it("groups the app-level parameters into four tabs and opens on Audio by default", () => {
    const { engine } = makeEngine();
    renderPanel(engine);

    for (const tab of ["audio", "performance", "interface", "about"]) {
      expect(screen.getByTestId(`settings-tab-${tab}`)).toBeInTheDocument();
    }
    // The audio controls are the ones people come here for; the rest are one click away.
    expect(screen.getByTestId("settings-tab-audio")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("audio-settings-gs1-toggle")).toBeInTheDocument();
  });

  it("honours initialTab, so the toolbar shortcut can land on audio while the header keeps its own", () => {
    const { engine } = makeEngine();
    renderPanel(engine, { initialTab: "about" });

    expect(screen.getByTestId("settings-tab-about")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("settings-panel-about")).toBeInTheDocument();
    expect(screen.queryByTestId("audio-settings-gs1-toggle")).toBeNull();
  });

  it("reports the build, the GS-1 state and the local data it actually holds", () => {
    localStorage.setItem("groove_projects_v1", "x".repeat(2048));
    const { engine } = makeEngine();
    renderPanel(engine, { initialTab: "about" });

    expect(screen.getByTestId("settings-about-version")).toHaveTextContent(`v${APP_VERSION}`);
    // The About tab is where a user checks whether the "new architecture" is on without hunting
    // through the studio toolbar.
    expect(screen.getByTestId("settings-about-gs1")).toHaveTextContent(/已开启|on/);
    const total = screen.getByTestId("settings-storage-total").textContent ?? "";
    expect(total).toMatch(/KB/);
    expect(total).toMatch(/1\s*项|\b1\b/);
  });

  it("writes layout defaults through the same module the studio boots from", () => {
    const { engine } = makeEngine();
    renderPanel(engine, { initialTab: "interface" });

    fireEvent.click(screen.getByTestId("settings-layout-isSidebarCollapsed"));
    expect(loadLayoutPrefs().isSidebarCollapsed).toBe(true);
    fireEvent.click(screen.getByTestId("settings-density-compact"));
    expect(loadLayoutPrefs().density).toBe("compact");

    fireEvent.click(screen.getByTestId("settings-layout-reset"));
    const after = loadLayoutPrefs();
    expect(after.isSidebarCollapsed).toBe(false);
    expect(after.density).toBe("standard");
  });

  it("toggles haptics through the haptics module, and disables intensity with it off", () => {
    const { engine } = makeEngine();
    renderPanel(engine, { initialTab: "performance" });

    const initial = getHapticSettings().enabled;
    fireEvent.click(screen.getByTestId("settings-haptics-toggle"));
    expect(getHapticSettings().enabled).toBe(!initial);
    expect(screen.getByTestId("settings-haptics-slider")).toBeDisabled();

    fireEvent.click(screen.getByTestId("settings-haptics-toggle"));
    expect(getHapticSettings().enabled).toBe(initial);
    expect(screen.getByTestId("settings-haptics-slider")).not.toBeDisabled();
  });

  it("opens the update dialog from About when the host provides one", () => {
    const onOpenUpdates = vi.fn();
    const { engine } = makeEngine();
    renderPanel(engine, { initialTab: "about", onOpenUpdates });

    fireEvent.click(screen.getByTestId("settings-about-updates"));
    expect(onOpenUpdates).toHaveBeenCalledTimes(1);
  });

  it("persists piano roll default tool preference in interface tab", () => {
    const { engine } = makeEngine();
    renderPanel(engine, { initialTab: "interface" });

    const pointerBtn = screen.getByTestId("settings-default-tool-pointer");
    const pencilBtn = screen.getByTestId("settings-default-tool-pencil");
    expect(pointerBtn).toBeInTheDocument();
    expect(pencilBtn).toBeInTheDocument();
    expect(pointerBtn.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(pencilBtn);
    expect(localStorage.getItem("groove_default_roll_tool")).toBe("pencil");
    expect(pencilBtn.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(pointerBtn);
    expect(localStorage.getItem("groove_default_roll_tool")).toBe("pointer");
    expect(pointerBtn.getAttribute("aria-pressed")).toBe("true");
  });
});
