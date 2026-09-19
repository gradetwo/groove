import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Header } from "../components/Header";
import { LanguageProvider } from "../i18n/LanguageContext";

beforeEach(() => {
  localStorage.setItem("groove_language", "zh");
});

function renderWithLanguage(ui: React.ReactElement) {
  return render(<LanguageProvider>{ui}</LanguageProvider>);
}

describe("Header · mobile menu de-duplication & help button integration", () => {
  it("renders onOpenHelp button on desktop and triggers callback", () => {
    const handleOpenHelp = vi.fn();
    renderWithLanguage(
      <Header
        currentTab="studio"
        onSelectTab={vi.fn()}
        onOpenSearch={vi.fn()}
        onRandomGenre={vi.fn()}
        onOpenHelp={handleOpenHelp}
      />
    );

    const helpBtn = screen.getByTestId("header-help-button");
    expect(helpBtn).toBeInTheDocument();
    fireEvent.click(helpBtn);
    expect(handleOpenHelp).toHaveBeenCalledTimes(1);
  });

  it("opens mobile drawer and renders help button and triggers callback", () => {
    const handleOpenHelp = vi.fn();

    renderWithLanguage(
      <Header
        currentTab="studio"
        onSelectTab={vi.fn()}
        onOpenSearch={vi.fn()}
        onRandomGenre={vi.fn()}
        onOpenHelp={handleOpenHelp}
      />
    );

    // Open mobile menu
    fireEvent.click(screen.getByLabelText("Open menu"));

    // Mobile help button exists
    const mobileHelpBtn = screen.getByTestId("mobile-help-button");
    expect(mobileHelpBtn).toBeInTheDocument();
    fireEvent.click(mobileHelpBtn);
    expect(handleOpenHelp).toHaveBeenCalledTimes(1);
  });

  it("renders explore and lab items in mobile drawer without duplication", () => {
    renderWithLanguage(
      <Header
        currentTab="studio"
        onSelectTab={vi.fn()}
        onOpenSearch={vi.fn()}
        onRandomGenre={vi.fn()}
      />
    );

    // Open mobile menu
    fireEvent.click(screen.getByLabelText("Open menu"));

    // Check that Console, Analyzer, Maker appear exactly ONCE each in the mobile menu
    const consoleItems = screen.getAllByText("调音台");
    expect(consoleItems.length).toBe(1);

    const analyzerItems = screen.getAllByText("全景示波器");
    expect(analyzerItems.length).toBe(1);

    const makerItems = screen.getAllByText("曲风工坊");
    expect(makerItems.length).toBe(1);

    // Check that Masterclass, Galaxy, Horizontal, Vertical appear exactly ONCE each
    const masterclassItems = screen.getAllByText("节奏律动");
    expect(masterclassItems.length).toBe(1);

    const galaxyItems = screen.getAllByText("律动星系");
    expect(galaxyItems.length).toBe(1);

    const timelineHItems = screen.getAllByText("水平演变轴");
    expect(timelineHItems.length).toBe(1);

    const timelineVItems = screen.getAllByText("垂直时间轴");
    expect(timelineVItems.length).toBe(1);
  });

  it("renders desktop explore dropdown with both labs and explore categories without duplication", () => {
    renderWithLanguage(
      <Header
        currentTab="studio"
        onSelectTab={vi.fn()}
        onOpenSearch={vi.fn()}
        onRandomGenre={vi.fn()}
      />
    );

    // Click desktop explore dropdown toggle
    const exploreBtn = screen.getByTitle("探索");
    fireEvent.click(exploreBtn);

    // Both section headers are visible
    expect(screen.getByText("高级与实验室")).toBeInTheDocument();
    expect(screen.getByText("曲风探索视图")).toBeInTheDocument();
  });
});
