import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MasterAnalyzerSuite } from "../components/analyzer/MasterAnalyzerSuite";
import { WaterfallSpectrogram } from "../components/analyzer/WaterfallSpectrogram";
import { LissajousPhaseScope } from "../components/analyzer/LissajousPhaseScope";
import { OscilloscopeWaveform } from "../components/analyzer/OscilloscopeWaveform";
import { AnalyzerSignalGenerator } from "../audio/AnalyzerSignalGenerator";
import { LanguageProvider } from "../i18n/LanguageContext";

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
    createLinearGradient: vi.fn().mockReturnValue({
      addColorStop: vi.fn(),
    }),
    createImageData: vi.fn().mockReturnValue({
      data: new Uint8ClampedArray(400 * 2 * 4),
    }),
    putImageData: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
  });
});

function createMockAnalyser(fftSize = 1024) {
  return {
    fftSize,
    frequencyBinCount: fftSize / 2,
    smoothingTimeConstant: 0.8,
    context: {
      sampleRate: 44100,
    },
    getByteFrequencyData: vi.fn((arr: Uint8Array) => {
      arr.fill(100);
    }),
    getFloatTimeDomainData: vi.fn((arr: Float32Array) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.sin((i / arr.length) * Math.PI * 4);
      }
    }),
    getByteTimeDomainData: vi.fn((arr: Uint8Array) => {
      arr.fill(128);
    }),
  } as unknown as AnalyserNode;
}

describe("Panoramic Analyzer & Lissajous Scope (P6-05)", () => {
  it("renders MasterAnalyzerSuite and switches view modes", () => {
    const analyser = createMockAnalyser(2048);
    const analyserL = createMockAnalyser(1024);
    const analyserR = createMockAnalyser(1024);

    render(
      <LanguageProvider>
        <MasterAnalyzerSuite
          analyser={analyser}
          analyserL={analyserL}
          analyserR={analyserR}
          isPlaying={true}
        />
      </LanguageProvider>
    );

    expect(screen.getByText(/PANORAMIC ANALYZER|全景声谱分析仪/i)).toBeTruthy();

    // Mode tabs
    const fftTab = screen.getByRole("button", { name: /FFT|瀑布谱/i });
    const phaseTab = screen.getByRole("button", { name: /Phase|李萨如/i });
    const waveTab = screen.getByRole("button", { name: /Wave|波形/i });

    expect(fftTab).toBeTruthy();
    expect(phaseTab).toBeTruthy();
    expect(waveTab).toBeTruthy();

    // Switch to Lissajous only mode
    fireEvent.click(phaseTab);
    expect(screen.getByText(/Lissajous Scope|李萨如图示波器/i)).toBeTruthy();

    // Switch to Waveform mode
    fireEvent.click(waveTab);
    expect(screen.getByText(/Dual-Trace Waveform|双轨时域波形示波器/i)).toBeTruthy();
  });

  it("renders the instrument signal-generator cluster only when wired", () => {
    const analyser = createMockAnalyser(2048);
    const onToggle = vi.fn();
    const onSelect = vi.fn();

    // Back-compat: the Studio dock renders the suite without the control.
    const first = render(
      <LanguageProvider>
        <MasterAnalyzerSuite analyser={analyser} isPlaying={false} />
      </LanguageProvider>
    );
    expect(screen.queryByTestId("analyzer-signal-generator-control")).toBeNull();
    first.unmount();

    render(
      <LanguageProvider>
        <MasterAnalyzerSuite
          analyser={analyser}
          isPlaying={false}
          signalGenerator={{
            enabled: true,
            selected: "sweep",
            options: [
              { type: "sweep", label: "Sine Sweep" },
              { type: "sub_808", label: "808 Sub-Bass" },
            ],
            onToggle,
            onSelect,
          }}
        />
      </LanguageProvider>
    );

    const toggle = screen.getByRole("button", {
      name: /信号发生器开关|Signal generator power/i,
    });
    const select = screen.getByRole("combobox", {
      name: /内置声学参考信号|Built-in reference signal/i,
    });
    expect(toggle).toBeTruthy();
    expect(select).toBeEnabled();

    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledTimes(1);

    fireEvent.change(select, { target: { value: "sub_808" } });
    expect(onSelect).toHaveBeenCalledWith("sub_808");
  });

  it("renders WaterfallSpectrogram and shows frequency bands", () => {
    const analyser = createMockAnalyser(2048);

    render(
      <LanguageProvider>
        <WaterfallSpectrogram
          analyser={analyser}
          isPlaying={true}
          theme="obsidian"
          showBandsBar={true}
          isZh={true}
        />
      </LanguageProvider>
    );

    expect(screen.getByText("Sub-Bass")).toBeTruthy();
    expect(screen.getByText("Bass")).toBeTruthy();
    expect(screen.getByText("Air / Brilliance")).toBeTruthy();
  });

  it("renders LissajousPhaseScope and computes correlation and width", () => {
    const analyserL = createMockAnalyser(1024);
    const analyserR = createMockAnalyser(1024);

    render(
      <LanguageProvider>
        <LissajousPhaseScope
          analyserL={analyserL}
          analyserR={analyserR}
          isPlaying={true}
          theme="obsidian"
          isZh={true}
        />
      </LanguageProvider>
    );

    expect(screen.getByText(/Lissajous Scope|李萨如图示波器/i)).toBeTruthy();
    expect(screen.getByText(/相位相关系数|Correlation/i)).toBeTruthy();
  });

  it("renders OscilloscopeWaveform with sync trigger lock", () => {
    const analyserL = createMockAnalyser(1024);
    const analyserR = createMockAnalyser(1024);

    render(
      <LanguageProvider>
        <OscilloscopeWaveform
          analyserL={analyserL}
          analyserR={analyserR}
          isPlaying={true}
          isZh={true}
        />
      </LanguageProvider>
    );

    expect(screen.getByText(/Dual-Trace Waveform|双轨时域波形示波器/i)).toBeTruthy();
    const syncBtn = screen.getByRole("button", { name: /锁相触发|SYNC/i });
    expect(syncBtn).toBeTruthy();
    fireEvent.click(syncBtn);
  });

  it("operates AnalyzerSignalGenerator with play, stop and destroy lifecycle", () => {
    const gen = new AnalyzerSignalGenerator();
    expect(gen.getIsPlaying()).toBe(false);
    expect(gen.getCurrentType()).toBeNull();

    // Play sweep
    gen.playSignal("sweep");
    expect(gen.getIsPlaying()).toBe(true);
    expect(gen.getCurrentType()).toBe("sweep");

    // Switch to anti_phase
    gen.playSignal("anti_phase");
    expect(gen.getCurrentType()).toBe("anti_phase");

    // Stop
    gen.stop();
    expect(gen.getIsPlaying()).toBe(false);
    expect(gen.getCurrentType()).toBeNull();

    // Destroy
    gen.destroy();
  });
});
