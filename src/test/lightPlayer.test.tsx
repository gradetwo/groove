import React from "react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LanguageProvider } from "../i18n/LanguageContext";
import { LightPlayerToggle } from "../mobile/LightPlayerToggle";
import { applyLightPlayer, applyStoredLightPlayer } from "../hooks/useLightPlayer";
import { LIGHT_PLAYER_CLASS, LIGHT_PLAYER_STORAGE_KEY } from "../features/settings/lightPlayerPrefs";

/**
 * The "lighter player" switch (更多 → 播放器).
 *
 * What it must do: remember the choice, publish it as a class so the stylesheet can shed the decorative animation, and be
 * a real switch to a screen reader. What it must **not** do is touch the sound — the canvas keeps its clock either way,
 * which is why the class is the only mechanism here and the audio path never reads this preference.
 */
describe("the lighter-player switch", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove(LIGHT_PLAYER_CLASS);
  });
  afterEach(() => {
    document.documentElement.classList.remove(LIGHT_PLAYER_CLASS);
  });

  it("applies the class from storage, before any component renders", () => {
    expect(applyStoredLightPlayer()).toBe(false);
    expect(document.documentElement.classList.contains(LIGHT_PLAYER_CLASS)).toBe(false);

    window.localStorage.setItem(LIGHT_PLAYER_STORAGE_KEY, "1");
    expect(applyStoredLightPlayer()).toBe(true);
    expect(document.documentElement.classList.contains(LIGHT_PLAYER_CLASS)).toBe(true);
  });

  it("treats anything unexpected as off", () => {
    window.localStorage.setItem(LIGHT_PLAYER_STORAGE_KEY, "yes please");
    expect(applyStoredLightPlayer()).toBe(false);
    applyLightPlayer(true);
    expect(document.documentElement.classList.contains(LIGHT_PLAYER_CLASS)).toBe(true);
    applyLightPlayer(false);
    expect(document.documentElement.classList.contains(LIGHT_PLAYER_CLASS)).toBe(false);
  });

  it("is a switch that toggles, and remembers", async () => {
    render(
      <LanguageProvider>
        <LightPlayerToggle />
      </LanguageProvider>
    );
    const toggle = screen.getByTestId("mobile-light-player-switch");
    expect(toggle.getAttribute("aria-checked")).toBe("false");

    fireEvent.click(toggle);
    await waitFor(() => expect(screen.getByTestId("mobile-light-player-switch").getAttribute("aria-checked")).toBe("true"));
    // Stored, published, and applied to the document without a reload.
    expect(window.localStorage.getItem(LIGHT_PLAYER_STORAGE_KEY)).toBe("1");
    expect(document.documentElement.classList.contains(LIGHT_PLAYER_CLASS)).toBe(true);

    fireEvent.click(screen.getByTestId("mobile-light-player-switch"));
    await waitFor(() => expect(screen.getByTestId("mobile-light-player-switch").getAttribute("aria-checked")).toBe("false"));
    expect(document.documentElement.classList.contains(LIGHT_PLAYER_CLASS)).toBe(false);
  });
});
