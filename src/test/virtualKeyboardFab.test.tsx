import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  loadKeyboardFabPref,
  saveKeyboardFabPref,
  FAB_STORAGE_KEY,
} from "../features/sequencer/keyboardFabPref";
import { SettingsModal } from "../components/settings/SettingsModal";
import { AudioEngine } from "../audio/AudioEngine";
import { LanguageProvider } from "../i18n/LanguageContext";

describe("Virtual Keyboard FAB & Settings Integration", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to enabled when no localStorage entry exists", () => {
    expect(loadKeyboardFabPref()).toBe(true);
  });

  it("saves and loads disabled state properly", () => {
    saveKeyboardFabPref(false);
    expect(localStorage.getItem(FAB_STORAGE_KEY)).toBe("false");
    expect(loadKeyboardFabPref()).toBe(false);

    saveKeyboardFabPref(true);
    expect(localStorage.getItem(FAB_STORAGE_KEY)).toBe("true");
    expect(loadKeyboardFabPref()).toBe(true);
  });

  it("renders FAB toggle in SettingsModal interface tab and toggles value", () => {
    const mockEngine = {
      getMasterVolume: () => 0.8,
      getEffectiveMasterVolume: () => 0.8,
      isHearingProtectionEnabled: () => true,
      getMaxVolumeLimit: () => 0.85,
      getLatencyCompensation: () => 0,
      getOutputLatency: () => 10,
      getMasterLimiterKind: () => "worklet",
      getMasterLimiterLatencySeconds: () => 0.003,
      isGs1Enabled: () => true,
      setMasterVolume: vi.fn(),
      setHearingProtection: vi.fn(),
      setMaxVolumeLimit: vi.fn(),
      setLatencyCompensation: vi.fn(),
    } as unknown as AudioEngine;

    render(
      <LanguageProvider>
        <SettingsModal
          isOpen={true}
          onClose={vi.fn()}
          initialTab="interface"
          engine={mockEngine}
          gs1Enabled={true}
          onToggleGs1={vi.fn()}
        />
      </LanguageProvider>
    );

    const toggleBtn = screen.getByTestId("settings-keyboard-fab-toggle");
    expect(toggleBtn).toBeInTheDocument();
    expect(toggleBtn).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(toggleBtn);
    expect(toggleBtn).toHaveAttribute("aria-pressed", "false");
    expect(localStorage.getItem(FAB_STORAGE_KEY)).toBe("false");
    expect(loadKeyboardFabPref()).toBe(false);

    fireEvent.click(toggleBtn);
    expect(toggleBtn).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem(FAB_STORAGE_KEY)).toBe("true");
    expect(loadKeyboardFabPref()).toBe(true);
  });
});
