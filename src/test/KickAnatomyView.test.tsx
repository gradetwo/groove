import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LanguageProvider } from "../i18n/LanguageContext";
import { KickAnatomyView } from "../views/KickAnatomyView";

beforeEach(() => {
  localStorage.setItem("groove_language", "zh");
});

function renderWithLanguage(ui: React.ReactElement) {
  return render(<LanguageProvider>{ui}</LanguageProvider>);
}

describe("KickAnatomyView · Somatic Acoustic Lab & Contextual Help", () => {
  it("renders telemetry bar with PLV, ecosystem status, and workbench layout", () => {
    renderWithLanguage(<KickAnatomyView />);

    expect(screen.getByText("底鼓设计 // 躯体声学实验室")).toBeInTheDocument();
    expect(screen.getAllByText("PLV:").length).toBeGreaterThan(0);
    expect(screen.getByText("ECOSYSTEM:")).toBeInTheDocument();
    expect(screen.getByText("CRT OSCILLOSCOPE")).toBeInTheDocument();
    expect(screen.getByText("WATERFALL FFT")).toBeInTheDocument();
  });

  it("toggles visualizer modes between oscilloscope and waterfall", () => {
    renderWithLanguage(<KickAnatomyView />);

    const waterfallBtn = screen.getByText("WATERFALL FFT");
    fireEvent.click(waterfallBtn);
    expect(waterfallBtn.closest("button")).toHaveClass("text-[#f5b73d]");

    const oscBtn = screen.getByText("CRT OSCILLOSCOPE");
    fireEvent.click(oscBtn);
    expect(oscBtn.closest("button")).toHaveClass("text-[#f5b73d]");
  });

  it("renders guide button and invokes onOpenHelp callback", () => {
    const handleOpenHelp = vi.fn();
    renderWithLanguage(<KickAnatomyView onOpenHelp={handleOpenHelp} />);

    const helpBtn = screen.getByTestId("kick-help-button");
    expect(helpBtn).toBeInTheDocument();
    expect(helpBtn).toHaveTextContent("底鼓手册");

    fireEvent.click(helpBtn);
    expect(handleOpenHelp).toHaveBeenCalledTimes(1);
  });

  it("renders return to studio button and invokes onOpenStudio callback", () => {
    const handleOpenStudio = vi.fn();
    renderWithLanguage(<KickAnatomyView onOpenStudio={handleOpenStudio} />);

    const studioBtn = screen.getByTestId("kick-studio-button");
    expect(studioBtn).toBeInTheDocument();
    expect(studioBtn).toHaveTextContent("返回工作台");

    fireEvent.click(studioBtn);
    expect(handleOpenStudio).toHaveBeenCalledTimes(1);
  });
});
