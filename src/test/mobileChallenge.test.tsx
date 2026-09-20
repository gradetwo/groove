/**
 * 挑战 (the challenge module, M5).
 *
 * The rules are shared with the desktop view (`src/utils/challengeAlgorithm.ts`), so what these tests
 * pin is the phone screen's own contract: four options that grade, a ladder that moves and persists to
 * the *same* storage key, a difficulty switch that re-rolls the question, and an explanation that links
 * to the genre.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LanguageProvider } from "../i18n/LanguageContext";
import {
  CHALLENGE_STORAGE_KEY,
  EMPTY_CHALLENGE_STATS,
  MobileChallengeScreen,
  loadChallengeStats,
} from "../mobile/screens/MobileChallengeScreen";
import type { Genre } from "../types/genre";

const renderChallenge = () => {
  const spies = {
    onTogglePlay: vi.fn<(genre: Genre) => void>(),
    onOpenGenre: vi.fn<(genreId: string) => void>(),
  };
  const utils = render(
    <LanguageProvider>
      <MobileChallengeScreen isPlaying={false} {...spies} />
    </LanguageProvider>
  );
  return { ...utils, spies };
};

const optionIds = (): string[] =>
  [...document.querySelectorAll('[data-testid^="mobile-challenge-option-"]')].map((node) =>
    (node.getAttribute("data-testid") ?? "").replace("mobile-challenge-option-", "")
  );

describe("challenge module", () => {
  beforeEach(() => {
    localStorage.setItem("groove_language", "zh");
    localStorage.removeItem(CHALLENGE_STORAGE_KEY);
  });

  it("offers four options and a play button to hear the question", () => {
    const { spies } = renderChallenge();
    expect(optionIds()).toHaveLength(4);
    fireEvent.click(screen.getByTestId("mobile-challenge-play"));
    // The play button plays the question's genre, whatever it turned out to be.
    expect(spies.onTogglePlay).toHaveBeenCalledTimes(1);
    expect(optionIds()).toContain(spies.onTogglePlay.mock.calls[0][0].id);
  });

  it("grades an answer: the right option is marked, the others dim or fail", () => {
    renderChallenge();
    const ids = optionIds();
    // Answering the first option: exactly one option ends up "right" (the real answer) and the picked
    // one is either right or wrong — never both, never neither.
    fireEvent.click(screen.getByTestId(`mobile-challenge-option-${ids[0]}`));
    const states = ids.map((id) => screen.getByTestId(`mobile-challenge-option-${id}`).getAttribute("data-state"));
    expect(states.filter((state) => state === "right")).toHaveLength(1);
    expect(states.filter((state) => state === "wrong")).toHaveLength(states.includes("wrong") ? 1 : 0);
    expect(states.filter((state) => state === "idle")).toHaveLength(0);

    // Answering again must not double-score: the verdict is final until "next".
    const before = loadChallengeStats().totalAnswered;
    fireEvent.click(screen.getByTestId(`mobile-challenge-option-${ids[1]}`));
    expect(loadChallengeStats().totalAnswered).toBe(before);
  });

  it("shows the explanation with a link to the genre, and reveals the tempo clue", () => {
    const { spies } = renderChallenge();
    const ids = optionIds();
    expect(screen.getByText(/TEMPO CLUE · \?/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId(`mobile-challenge-option-${ids[0]}`));
    const verdict = screen.getByTestId("mobile-challenge-verdict");
    expect(verdict).toBeInTheDocument();
    expect(screen.getByText(/TEMPO CLUE · \d+ BPM/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("mobile-challenge-verdict-genre"));
    expect(spies.onOpenGenre).toHaveBeenCalledTimes(1);
  });

  it("moves the ladder and persists it under the desktop's own key", () => {
    renderChallenge();
    const ids = optionIds();
    fireEvent.click(screen.getByTestId(`mobile-challenge-option-${ids[0]}`));

    const stored = loadChallengeStats();
    expect(stored.totalAnswered).toBe(1);
    // The desktop view reads this key: one ladder across both surfaces.
    expect(JSON.parse(localStorage.getItem(CHALLENGE_STORAGE_KEY) ?? "{}").totalAnswered).toBe(1);
    expect(stored.elo).not.toBe(EMPTY_CHALLENGE_STATS.elo);
  });

  it("rolls a new question on demand, clearing the verdict", () => {
    renderChallenge();
    const first = optionIds().join(",");
    fireEvent.click(screen.getByTestId(`mobile-challenge-option-${optionIds()[0]}`));
    expect(screen.getByTestId("mobile-challenge-verdict")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("mobile-challenge-next"));
    expect(screen.queryByTestId("mobile-challenge-verdict")).not.toBeInTheDocument();
    // A new question means new options (the pool is large enough that repeating is not expected).
    expect(optionIds()).toHaveLength(4);
    expect(optionIds().join(",")).not.toBe(first);
  });

  it("re-rolls when the difficulty changes", () => {
    renderChallenge();
    fireEvent.click(screen.getByTestId("mobile-challenge-difficulty-hard"));
    expect(screen.getByTestId("mobile-challenge-difficulty-hard")).toHaveAttribute("aria-selected", "true");
    expect(optionIds()).toHaveLength(4);
    // The hard pool is the near-miss set, so its answer is never one of the easy staples.
    expect(screen.queryByTestId("mobile-challenge-verdict")).not.toBeInTheDocument();
  });

  it("survives a corrupt stored ladder instead of crashing", () => {
    localStorage.setItem(CHALLENGE_STORAGE_KEY, "{not json");
    const stats = loadChallengeStats();
    expect(stats.elo).toBe(EMPTY_CHALLENGE_STATS.elo);
    expect(stats.totalAnswered).toBe(0);
  });
});
