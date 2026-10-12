import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { ArrangementViewV2 } from "../components/arrangement/ArrangementViewV2";
import { createArrangementFromTemplate } from "../data/arrangementEdits";
import { LanguageProvider } from "../i18n/LanguageContext";
import { DEFAULT_FX_STATE } from "../audio/EffectsRack";
import type { AudioEngine } from "../audio/AudioEngine";

const noCapture = async () => ({ ok: false as const, refusal: "unsupported" as const, summary: "no capture here" });
const renderView = (ui: React.ReactElement) => render(<LanguageProvider>{ui}</LanguageProvider>);

/**
 * ⭐ **The master rack is switchable from this surface, and its state is read rather than assumed.**
 *
 * The engine builds the rack and exposes four setters over it; the panel that drove them lived in the studio and went with it, so
 * the v2 surface had no way to reach the rack at all. These cases drive the switches and check the engine was given the whole
 * record -- including that the button starts from what the rack holds, not from a default this surface invented.
 */
describe("the master effects rack", () => {
  const engineWithRack = (overrides: Partial<typeof DEFAULT_FX_STATE> = {}) => {
    const state = { ...DEFAULT_FX_STATE, ...overrides };
    const rack = { getState: () => state };
    return {
      rack,
      setMasterFilter: vi.fn(),
      setMasterSaturation: vi.fn(),
      setMasterChorus: vi.fn(),
      setMasterBitcrusher: vi.fn(),
      // ⭐ The view also tells the engine about the click track, so a fake engine has to answer those too.
      setMetronome: vi.fn(),
      setCountIn: vi.fn(),
      getMasterFxRack: () => rack,
    };
  };

  it("⭐ starts from the rack's own state, and tells the engine on each press", () => {
    const engine = engineWithRack({ filterEnabled: true });
    const engineRef = { current: engine as unknown as AudioEngine };
    const arrangement = createArrangementFromTemplate("blank", "rack-probe");
    renderView(<ArrangementViewV2 songId="s" capture={noCapture} initialArrangement={arrangement} engineRef={engineRef} />);

    // ⭐ The rack already has the filter on, and the button says so rather than showing its own default.
    expect(screen.getByTestId("arrangement-filter").getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByTestId("arrangement-saturation"));
    expect(engine.setMasterSaturation).toHaveBeenLastCalledWith(true, DEFAULT_FX_STATE.saturationDrive);

    fireEvent.click(screen.getByTestId("arrangement-filter"));
    expect(engine.setMasterFilter).toHaveBeenLastCalledWith(false, expect.any(Number), expect.any(Number), expect.any(String));
  });
});
