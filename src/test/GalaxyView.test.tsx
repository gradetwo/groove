import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LanguageProvider } from "../i18n/LanguageContext";
import { GalaxyView } from "../views/GalaxyView";

beforeEach(() => {
  localStorage.setItem("groove_language", "zh");
});

function renderWithLanguage(ui: React.ReactElement) {
  return render(<LanguageProvider>{ui}</LanguageProvider>);
}

describe("GalaxyView · Contextual Help Integration", () => {
  it("renders guide button in GalaxyView and triggers onOpenHelp", () => {
    const handleOpenHelp = vi.fn();
    const handleSelectGenre = vi.fn();
    const handleOpenStudio = vi.fn();

    renderWithLanguage(
      <GalaxyView
        onSelectGenre={handleSelectGenre}
        onOpenStudio={handleOpenStudio}
        onOpenHelp={handleOpenHelp}
      />
    );

    const helpBtn = screen.getByTestId("galaxy-help-button");
    expect(helpBtn).toBeInTheDocument();
    expect(helpBtn).toHaveTextContent("星系图谱指南");

    fireEvent.click(helpBtn);
    expect(handleOpenHelp).toHaveBeenCalledTimes(1);
  });
});
