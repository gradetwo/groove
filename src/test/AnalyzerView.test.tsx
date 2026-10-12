import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { AnalyzerView } from "../views/AnalyzerView";
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
    createLinearGradient: vi.fn().mockReturnValue({ addColorStop: vi.fn() }),
    createImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(400 * 2 * 4) }),
    putImageData: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
  });
});

describe("AnalyzerView Dedicated Workstation (P6-05)", () => {
  it("renders AnalyzerView with hero, test signals, and theory dossier cards", () => {
    const onOpenStudio = vi.fn();

    render(
      <LanguageProvider>
        <AnalyzerView onOpenStudio={onOpenStudio} />
      </LanguageProvider>
    );

    // Title / Hero
    expect(screen.getByText(/全景声谱分析仪与李萨如图示波器|Panoramic Spectrogram/i)).toBeTruthy();

    // Built-in test signal generator cards
    expect(screen.getAllByText(/Sine Sweep|全频扫频/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/808 Sub-Bass|808 极深低音/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Anti-Phase|180° 反相信号/i).length).toBeGreaterThan(0);

    // Jump to Studio CTA button
    const ctaBtn = screen.getByRole("button", { name: /进入 Studio 实时监测|Open Studio Monitor/i });
    expect(ctaBtn).toBeTruthy();
    fireEvent.click(ctaBtn);
    expect(onOpenStudio).toHaveBeenCalledTimes(1);

    // Trigger a test signal from the legacy reference-signal section (the new
    // instrument dropdown also lists these labels, so scope the query to it).
    const legacySection = screen
      .getByRole("heading", {
        name: /内置声学参考测试信号发生器|Acoustic Test Signal Generator/i,
      })
      .closest("section") as HTMLElement;
    expect(legacySection).toBeTruthy();
    fireEvent.click(
      within(legacySection).getByRole("heading", { name: /Sine Sweep|全频扫频/i })
    );
  });
});
