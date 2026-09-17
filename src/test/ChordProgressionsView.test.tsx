import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LanguageProvider } from "../i18n/LanguageContext";
import { ChordProgressionsView } from "../views/ChordProgressionsView";

beforeEach(() => {
  localStorage.setItem("groove_language", "zh");
});

function renderWithLanguage(ui: React.ReactElement) {
  return render(<LanguageProvider>{ui}</LanguageProvider>);
}

describe("ChordProgressionsView · Harmonic Workshop & Sequencer Bridge", () => {
  it("renders header, progression library, and workbench builder", () => {
    renderWithLanguage(<ChordProgressionsView />);

    expect(screen.getByText("和弦走向与律动工坊")).toBeInTheDocument();
    expect(screen.getByText("全局基础调性 (Key)")).toBeInTheDocument();
  });

  it("calls onOpenHelp when clicking guide button", () => {
    const handleOpenHelp = vi.fn();
    renderWithLanguage(<ChordProgressionsView onOpenHelp={handleOpenHelp} />);

    const helpBtn = screen.getByTestId("chords-help-button");
    expect(helpBtn).toBeInTheDocument();
    fireEvent.click(helpBtn);
    expect(handleOpenHelp).toHaveBeenCalledTimes(1);
  });

  it("calls onOpenStudioWithChords directly when clicking send to studio", () => {
    const handleOpenStudio = vi.fn();
    renderWithLanguage(
      <ChordProgressionsView onOpenStudioWithChords={handleOpenStudio} />
    );

    const sendBtn = screen.getByTitle("将此和弦走向载入音序工作台");
    fireEvent.click(sendBtn);

    expect(handleOpenStudio).toHaveBeenCalledTimes(1);
    expect(handleOpenStudio).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ root: "C" }),
      ])
    );
  });

  it("calls onOpenStudioWithChords with openPianoRoll option when clicking edit in piano roll", () => {
    const handleOpenStudio = vi.fn();
    renderWithLanguage(
      <ChordProgressionsView onOpenStudioWithChords={handleOpenStudio} />
    );

    const editPianoRollBtn = screen.getByTestId("chords-open-in-piano-roll");
    expect(editPianoRollBtn).toBeInTheDocument();
    expect(editPianoRollBtn).toHaveTextContent("在卷帘中编辑");

    fireEvent.click(editPianoRollBtn);

    expect(handleOpenStudio).toHaveBeenCalledTimes(1);
    expect(handleOpenStudio).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ root: "C" }),
      ]),
      { openPianoRoll: true }
    );
  });
});
