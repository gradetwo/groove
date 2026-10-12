import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { AnalyzerView } from "../views/AnalyzerView";
import { LanguageProvider } from "../i18n/LanguageContext";
import { AnalyzerSignalGenerator } from "../audio/AnalyzerSignalGenerator";

// This repo has a history of flaky tests caused by testing-library's 1s default
// wait, so every async query below carries an explicit generous timeout.
const ASYNC_TIMEOUT = { timeout: 8000 };
const TEST_TIMEOUT = 20000;

// Locale-independent accessible names (the provider picks zh or en from jsdom).
const TOGGLE_NAME = /信号发生器开关|Signal generator power/i;
const SELECT_NAME = /内置声学参考信号|Built-in reference signal/i;
const LEGACY_HEADING = /内置声学参考测试信号发生器|Acoustic Test Signal Generator/i;
const STOP_NAME = /停止发声|Mute Signal/i;

const BUILT_IN_SIGNAL_ORDER = [
  "sweep",
  "sub_808",
  "stereo_chorus",
  "anti_phase",
  "pink_noise",
  "white_noise",
];

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    arc: vi.fn(),
    closePath: vi.fn(),
    fillText: vi.fn(),
    createLinearGradient: vi.fn().mockReturnValue({ addColorStop: vi.fn() }),
    createImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(400 * 2 * 4) }),
    putImageData: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderAnalyzer() {
  return render(
    <LanguageProvider>
      <AnalyzerView />
    </LanguageProvider>
  );
}

async function getInstrumentControls() {
  const toggle = await screen.findByRole("button", { name: TOGGLE_NAME }, ASYNC_TIMEOUT);
  const select = await screen.findByRole("combobox", { name: SELECT_NAME }, ASYNC_TIMEOUT);
  return {
    toggle: toggle as HTMLButtonElement,
    select: select as HTMLSelectElement,
  };
}

describe("Analyzer instrument-level signal generator control", () => {
  it(
    "renders a real power toggle and generator dropdown on the instrument",
    async () => {
      renderAnalyzer();
      const { toggle, select } = await getInstrumentControls();

      // Real form controls with accessible names.
      expect(toggle.tagName).toBe("BUTTON");
      expect(select.tagName).toBe("SELECT");

      // Off by default: toggle unpressed, dropdown disabled.
      expect(toggle.getAttribute("aria-pressed")).toBe("false");
      expect(select.disabled).toBe(true);

      // The dropdown lists every built-in generator, in declaration order.
      const optionValues = Array.from(select.options).map((o) => o.value);
      expect(optionValues).toEqual(BUILT_IN_SIGNAL_ORDER);
      expect(select.value).toBe("sweep");
    },
    TEST_TIMEOUT
  );

  it(
    "enabling the toggle starts the currently selected generator",
    async () => {
      const playSpy = vi
        .spyOn(AnalyzerSignalGenerator.prototype, "playSignal")
        .mockImplementation(() => {});

      renderAnalyzer();
      const { toggle, select } = await getInstrumentControls();

      fireEvent.click(toggle);

      expect(playSpy).toHaveBeenCalledTimes(1);
      expect(playSpy).toHaveBeenCalledWith("sweep");
      expect(toggle.getAttribute("aria-pressed")).toBe("true");
      expect(select.disabled).toBe(false);
    },
    TEST_TIMEOUT
  );

  it(
    "changing the dropdown switches signals without stopping playback",
    async () => {
      const playSpy = vi
        .spyOn(AnalyzerSignalGenerator.prototype, "playSignal")
        .mockImplementation(() => {});
      const stopSpy = vi.spyOn(AnalyzerSignalGenerator.prototype, "stop");

      renderAnalyzer();
      const { toggle, select } = await getInstrumentControls();

      fireEvent.click(toggle);
      playSpy.mockClear();
      stopSpy.mockClear();

      fireEvent.change(select, { target: { value: "anti_phase" } });

      expect(playSpy).toHaveBeenCalledTimes(1);
      expect(playSpy).toHaveBeenCalledWith("anti_phase");
      // The switch must not tear the generator down through the stop path.
      expect(stopSpy).not.toHaveBeenCalled();
      expect(select.value).toBe("anti_phase");
      expect(toggle.getAttribute("aria-pressed")).toBe("true");
    },
    TEST_TIMEOUT
  );

  it(
    "disabling the toggle stops the generator and disables the dropdown",
    async () => {
      const playSpy = vi
        .spyOn(AnalyzerSignalGenerator.prototype, "playSignal")
        .mockImplementation(() => {});
      const stopSpy = vi.spyOn(AnalyzerSignalGenerator.prototype, "stop");

      renderAnalyzer();
      const { toggle, select } = await getInstrumentControls();

      fireEvent.click(toggle);
      stopSpy.mockClear();

      fireEvent.click(toggle);

      expect(stopSpy).toHaveBeenCalledTimes(1);
      expect(toggle.getAttribute("aria-pressed")).toBe("false");
      expect(select.disabled).toBe(true);
      expect(playSpy).toHaveBeenCalledTimes(1);
    },
    TEST_TIMEOUT
  );

  it(
    "remembers the dropdown selection across an off/on cycle",
    async () => {
      const playSpy = vi
        .spyOn(AnalyzerSignalGenerator.prototype, "playSignal")
        .mockImplementation(() => {});

      renderAnalyzer();
      const { toggle, select } = await getInstrumentControls();

      fireEvent.click(toggle);
      fireEvent.change(select, { target: { value: "pink_noise" } });
      fireEvent.click(toggle); // off
      expect(select.disabled).toBe(true);

      fireEvent.click(toggle); // on again
      expect(playSpy).toHaveBeenLastCalledWith("pink_noise");
    },
    TEST_TIMEOUT
  );

  it(
    "keeps the legacy reference signal section fully functional",
    async () => {
      const playSpy = vi
        .spyOn(AnalyzerSignalGenerator.prototype, "playSignal")
        .mockImplementation(() => {});
      const stopSpy = vi.spyOn(AnalyzerSignalGenerator.prototype, "stop");

      renderAnalyzer();
      // Ensure the instrument cluster rendered too, so we know both live on the page.
      const { toggle, select } = await getInstrumentControls();

      const heading = screen.getByRole("heading", { name: LEGACY_HEADING });
      const legacySection = heading.closest("section") as HTMLElement;
      expect(legacySection).toBeTruthy();

      // The legacy grid still lists its own cards and labels.
      expect(
        within(legacySection).getByRole("heading", { name: /808 Sub-Bass|808 极深低音/i })
      ).toBeTruthy();
      expect(
        within(legacySection).getByRole("heading", { name: /Anti-Phase|180° 反相信号/i })
      ).toBeTruthy();

      playSpy.mockClear();
      fireEvent.click(
        within(legacySection).getByRole("heading", { name: /808 Sub-Bass|808 极深低音/i })
      );

      // Its own play affordance still starts a signal on the shared generator.
      expect(playSpy).toHaveBeenCalledWith("sub_808");
      // ...and the instrument control reflects the shared single source of truth.
      expect(toggle.getAttribute("aria-pressed")).toBe("true");
      expect(select.value).toBe("sub_808");

      // The legacy stop button still stops playback.
      stopSpy.mockClear();
      fireEvent.click(screen.getByRole("button", { name: STOP_NAME }));
      expect(stopSpy).toHaveBeenCalledTimes(1);
      expect(toggle.getAttribute("aria-pressed")).toBe("false");
    },
    TEST_TIMEOUT
  );
});
