import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LanguageProvider } from "../i18n/LanguageContext";
import { HorizontalTimelineView } from "../views/HorizontalTimelineView";
import { VerticalTimelineView } from "../views/VerticalTimelineView";

beforeEach(() => {
  localStorage.setItem("groove_language", "zh");
});

function renderWithLanguage(ui: React.ReactElement) {
  return render(<LanguageProvider>{ui}</LanguageProvider>);
}

describe("TimelineViews · Contextual Help Integration", () => {
  it("renders guide button in HorizontalTimelineView and triggers onOpenHelp", () => {
    const handleOpenHelp = vi.fn();
    const handleSelectGenre = vi.fn();
    const handleOpenStudio = vi.fn();

    renderWithLanguage(
      <HorizontalTimelineView
        onSelectGenre={handleSelectGenre}
        onOpenStudio={handleOpenStudio}
        onOpenHelp={handleOpenHelp}
      />
    );

    const helpBtn = screen.getByTestId("timeline-h-help-button");
    expect(helpBtn).toBeInTheDocument();
    expect(helpBtn).toHaveTextContent("时间轴指南");

    fireEvent.click(helpBtn);
    expect(handleOpenHelp).toHaveBeenCalledTimes(1);
  });

  it("renders guide button in VerticalTimelineView and triggers onOpenHelp", () => {
    const handleOpenHelp = vi.fn();
    const handleSelectGenre = vi.fn();
    const handleOpenStudio = vi.fn();

    renderWithLanguage(
      <VerticalTimelineView
        onSelectGenre={handleSelectGenre}
        onOpenStudio={handleOpenStudio}
        onOpenHelp={handleOpenHelp}
      />
    );

    const helpBtn = screen.getByTestId("timeline-v-help-button");
    expect(helpBtn).toBeInTheDocument();
    expect(helpBtn).toHaveTextContent("时间轴指南");

    fireEvent.click(helpBtn);
    expect(handleOpenHelp).toHaveBeenCalledTimes(1);
  });
});
