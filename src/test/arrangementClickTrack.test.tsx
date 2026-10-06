import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { ArrangementViewV2 } from "../components/arrangement/ArrangementViewV2";
import { createArrangementFromTemplate } from "../data/arrangementEdits";
import { LanguageProvider } from "../i18n/LanguageContext";
import type { AudioEngine } from "../audio/AudioEngine";

const noCapture = async () => ({ ok: false as const, refusal: "unsupported" as const, summary: "no capture here" });
const renderView = (ui: React.ReactElement) => render(<LanguageProvider>{ui}</LanguageProvider>);

/**
 * ⭐ **The click track and the count-in reach the engine.**
 *
 * The engine has carried `setMetronome` and `setCountIn` since P3-07 and the manual documents both, but nothing on the arrangement
 * surface ever turned them on -- the two flags existed only in the object written for a share. These cases press the switches and
 * check the engine was told. Removing the effects that do the telling turns them red.
 */
describe("the click track and the count-in", () => {
  it("⭐ tells the engine when each switch turns on and off", () => {
    const setMetronome = vi.fn();
    const setCountIn = vi.fn();
    // ⭐ The view reads the master rack and subscribes to Web MIDI as well, so a stand-in has to answer every wire the surface grew.
    const engineRef = {
      current: { setMetronome, setCountIn, getMasterFxRack: () => undefined } as unknown as AudioEngine,
    };
    const arrangement = createArrangementFromTemplate("blank", "click-probe");
    renderView(<ArrangementViewV2 songId="s" capture={noCapture} initialArrangement={arrangement} engineRef={engineRef} />);

    const metronome = screen.getByTestId("arrangement-metronome");
    const countIn = screen.getByTestId("arrangement-count-in");
    // ⭐ Off at first, and the surface says so without being asked.
    expect(metronome.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(metronome);
    expect(setMetronome).toHaveBeenLastCalledWith(true);
    expect(screen.getByTestId("arrangement-metronome").getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(countIn);
    expect(setCountIn).toHaveBeenLastCalledWith(true);

    // ⭐ And a second press turns it back off, because a switch that only goes one way is not a switch.
    fireEvent.click(screen.getByTestId("arrangement-metronome"));
    expect(setMetronome).toHaveBeenLastCalledWith(false);
  });
});
