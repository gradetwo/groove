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
      getBpm: vi.fn(() => 120),
      // ⭐ The recorded-lane half: the view reads the palette for a mapped lane, so a double that cannot answer
      // those three questions would make the quiz's silence a property of the double rather than of the view.
      prepareSampledLanes: vi.fn(() => ({ stoodDown: [], problems: [] })),
      getTrackState: vi.fn(() => undefined),
      getTrackStates: vi.fn(() => []),
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

    /**
     * ⭐ **Listening comes first** (finding F11). This test used to answer straight away and pass, because an unheard
     * round was scored — the very behaviour the evaluation reported (Elo 1200 → 1191 for a question nobody heard). The
     * scoring path it is about is unchanged; what changed is that it has to be reached by hearing the round.
     */
    fireEvent.click(screen.getByRole("button", { name: /Start Listening|Start|试听/i }));

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

  it("⭐ refuses an answer to a round nobody has heard, and opens once it has been played (finding F11)", () => {
    /**
     * The evaluation picked an answer **before pressing play** and the round was scored: Elo 1200 → 1191 and a wrong
     * answer recorded for a question nobody had heard. The guard only asked "is it already answered", so the options
     * answered for a round that had not started. Removing `hasPlayed` from either the handler or the button turns this
     * red.
     */
    render(
      <LanguageProvider>
        <ChallengeView onSelectGenre={vi.fn()} onOpenStudio={vi.fn()} />
      </LanguageProvider>
    );

    const options = () => screen.getAllByRole("button").filter((button) => button.className.includes("text-left"));
    // ⭐ Before a play: every option is disabled, and the panel says why rather than leaving them to look broken.
    expect(options().every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
    expect(screen.getByTestId("challenge-listen-first")).toBeTruthy();

    // Pressing play is what opens them, and it is the same for a resume.
    fireEvent.click(screen.getByRole("button", { name: /Start Listening|Start|试听/i }));
    expect(options().some((button) => !(button as HTMLButtonElement).disabled), "an heard round can be answered").toBe(true);
    expect(screen.queryByTestId("challenge-listen-first"), "the explanation is gone once it applies to nothing").toBeNull();
  });

});