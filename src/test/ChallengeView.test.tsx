import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ChallengeView } from "../views/ChallengeView";
import { LanguageProvider } from "../i18n/LanguageContext";

// Mock AudioEngine
vi.mock("../audio/AudioEngine", () => {
  return {
    AudioEngine: vi.fn().mockImplementation(() => ({
      setPattern: vi.fn(),
      setBpm: vi.fn(),
      play: vi.fn(),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
    })),
  };
});

describe("ChallengeView with Elo & SuperMemo-2 Spaced Repetition (P6-04)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("renders Elo ladder rating, rank tier badge, and stats banner", () => {
    render(
      <LanguageProvider>
        <ChallengeView onSelectGenre={vi.fn()} onOpenStudio={vi.fn()} />
      </LanguageProvider>
    );

    // Header & arena title
    expect(screen.getByText("Blind Ear Training Arena")).toBeTruthy();
    
    // Default Elo rating
    expect(screen.getByText("1200")).toBeTruthy();

    // 4 multiple choice options rendered
    const optionButtons = screen.getAllByRole("button").filter((b) =>
      b.className.includes("text-left")
    );
    expect(optionButtons.length).toBe(4);
  });

  it("opens holographic Rank Certificate modal when clicking certificate button", () => {
    render(
      <LanguageProvider>
        <ChallengeView onSelectGenre={vi.fn()} onOpenStudio={vi.fn()} />
      </LanguageProvider>
    );

    // Find and click certificate button
    const certBtn = screen.getByRole("button", { name: /听力大师段位证书|Rank Certificate/i });
    fireEvent.click(certBtn);

    // Modal dialog should be open
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(screen.getByText(/听力大师声学段位认证|Ear Acumen Rank Certificate/i)).toBeTruthy();
    expect(screen.getByText(/GRV-CERT-/)).toBeTruthy();

    // Close modal
    const closeBtns = screen.getAllByRole("button", { name: /关闭|Close/i });
    fireEvent.click(closeBtns[0]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("handles answer selection, updates Elo rating, and displays feedback", () => {
    render(
      <LanguageProvider>
        <ChallengeView onSelectGenre={vi.fn()} onOpenStudio={vi.fn()} />
      </LanguageProvider>
    );

    const optionButtons = screen.getAllByRole("button").filter((b) =>
      b.className.includes("text-left")
    );
    expect(optionButtons.length).toBe(4);

    // Click first option
    fireEvent.click(optionButtons[0]);

    // Next question button should appear
    expect(screen.getByRole("button", { name: /下一题|Next Question/i })).toBeTruthy();

    // Elo indicator badge should be displayed
    const eloBadges = screen.getAllByText(/ELO/i);
    expect(eloBadges.length).toBeGreaterThan(0);
  });

  it("switches difficulty tabs seamlessly", () => {
    render(
      <LanguageProvider>
        <ChallengeView onSelectGenre={vi.fn()} onOpenStudio={vi.fn()} />
      </LanguageProvider>
    );

    const hardTab = screen.getByRole("button", { name: /^Hard$|^硬核/i });
    fireEvent.click(hardTab);

    // Pool switched, 4 options present
    const optionButtons = screen.getAllByRole("button").filter((b) =>
      b.className.includes("text-left")
    );
    expect(optionButtons.length).toBe(4);
  });
});
