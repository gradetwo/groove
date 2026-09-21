/**
 * 挑战 (the challenge module, M5).
 *
 * The rules are shared with the desktop view (`src/utils/challengeAlgorithm.ts`), so what these tests
 * pin is the phone screen's own contract: four options that grade, a ladder that moves and persists to
 * the *same* storage key, a difficulty switch that re-rolls the question, and an explanation that links
 * to the genre.
 *
 * Since the answer-beat round there is a second contract, and it is the one the user complained about:
 * the verdict is no longer a block under the options (off-screen on a phone) but a bar pinned to the
 * viewport, a right answer advances itself after a visible beat, and a wrong one does not.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor, within } from "@testing-library/react";
import { LanguageProvider } from "../i18n/LanguageContext";
import {
  CHALLENGE_STORAGE_KEY,
  CORRECT_AUTO_ADVANCE_MS,
  EMPTY_CHALLENGE_STATS,
  MobileChallengeScreen,
  loadChallengeStats,
} from "../mobile/screens/MobileChallengeScreen";
import { HapticPatterns, triggerHaptic } from "../utils/haptics";

/**
 * The haptic helper is mocked so a test can assert the buzz without a Vibration API. Everything else in
 * the module (the pattern table) stays real.
 */
vi.mock("../utils/haptics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils/haptics")>();
  return { ...actual, triggerHaptic: vi.fn() };
});

const renderChallenge = async () => {
  const spies = {
    onTogglePlay: vi.fn<(genreId: string) => void>(),
    onOpenGenre: vi.fn<(genreId: string) => void>(),
  };
  const utils = render(
    <LanguageProvider>
      <MobileChallengeScreen isPlaying={false} {...spies} />
    </LanguageProvider>
  );
  /**
   * 挑战 resolves the library on demand before its first question (A-01), so every case waits for the
   * options rather than assuming a synchronously imported `ALL_GENRES`.
   *
   * Waiting for the *container* is not enough: it is rendered while the library is still loading, so a
   * loaded machine saw it immediately and then read zero options — which is what failed in CI-style
   * conditions. Wait for four options, which is the thing every case below is about.
   */
  await screen.findByTestId("mobile-challenge-options", {}, { timeout: 10000 });
  await waitFor(() => expect(optionIds()).toHaveLength(4), { timeout: 10000 });
  return { ...utils, spies };
};

const optionIds = (): string[] =>
  [...document.querySelectorAll('[data-testid^="mobile-challenge-option-"]')].map((node) =>
    (node.getAttribute("data-testid") ?? "").replace("mobile-challenge-option-", "")
  );

/**
 * The correct option's id, learned the honest way.
 *
 * The play button plays `question.correctGenre`, so the spy's last call is the answer. (Reading a hidden
 * attribute off the DOM would leak the answer into the markup, which a quiz must not do.) The screen
 * hands the shell an **id** now, so the call argument is that id rather than a record.
 */
const correctOptionId = (spies: { onTogglePlay: ReturnType<typeof vi.fn> }): string => {
  fireEvent.click(screen.getByTestId("mobile-challenge-play"));
  const call = spies.onTogglePlay.mock.calls.at(-1) as [string] | undefined;
  if (!call) throw new Error("the play button did not hand the question's genre to the transport");
  return call[0];
};

const wrongOptionId = (correctId: string): string => {
  const wrong = optionIds().find((id) => id !== correctId);
  if (!wrong) throw new Error("no wrong option to pick");
  return wrong;
};

describe("challenge module", () => {
  beforeEach(() => {
    localStorage.setItem("groove_language", "zh");
    localStorage.removeItem(CHALLENGE_STORAGE_KEY);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("offers four options and a play button to hear the question", async () => {
    const { spies } = await renderChallenge();
    expect(optionIds()).toHaveLength(4);
    fireEvent.click(screen.getByTestId("mobile-challenge-play"));
    // The play button plays the question's genre, whatever it turned out to be.
    expect(spies.onTogglePlay).toHaveBeenCalledTimes(1);
    expect(optionIds()).toContain(spies.onTogglePlay.mock.calls[0][0]);
  });

  it("grades an answer: the right option is marked, the others dim or fail", async () => {
    await renderChallenge();
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

  it("shows the explanation with a link to the genre, and reveals the tempo clue", async () => {
    const { spies } = await renderChallenge();
    const ids = optionIds();
    expect(screen.getByText(/TEMPO CLUE · \?/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId(`mobile-challenge-option-${ids[0]}`));
    const verdict = screen.getByTestId("mobile-challenge-verdict");
    expect(verdict).toBeInTheDocument();
    expect(screen.getByText(/TEMPO CLUE · \d+ BPM/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("mobile-challenge-verdict-genre"));
    expect(spies.onOpenGenre).toHaveBeenCalledTimes(1);
  });

  it("moves the ladder and persists it under the desktop's own key", async () => {
    await renderChallenge();
    const ids = optionIds();
    fireEvent.click(screen.getByTestId(`mobile-challenge-option-${ids[0]}`));

    const stored = loadChallengeStats();
    expect(stored.totalAnswered).toBe(1);
    // The desktop view reads this key: one ladder across both surfaces.
    expect(JSON.parse(localStorage.getItem(CHALLENGE_STORAGE_KEY) ?? "{}").totalAnswered).toBe(1);
    expect(stored.elo).not.toBe(EMPTY_CHALLENGE_STATS.elo);
  });

  it("rolls a new question on demand, clearing the verdict", async () => {
    await renderChallenge();
    const first = optionIds().join(",");
    fireEvent.click(screen.getByTestId(`mobile-challenge-option-${optionIds()[0]}`));
    expect(screen.getByTestId("mobile-challenge-verdict")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("mobile-challenge-next"));
    expect(screen.queryByTestId("mobile-challenge-verdict")).not.toBeInTheDocument();
    // A new question means new options (the pool is large enough that repeating is not expected).
    expect(optionIds()).toHaveLength(4);
    expect(optionIds().join(",")).not.toBe(first);
  });

  it("re-rolls when the difficulty changes", async () => {
    await renderChallenge();
    fireEvent.click(screen.getByTestId("mobile-challenge-difficulty-hard"));
    expect(screen.getByTestId("mobile-challenge-difficulty-hard")).toHaveAttribute("aria-selected", "true");
    expect(optionIds()).toHaveLength(4);
    // The hard pool is the near-miss set, so its answer is never one of the easy staples.
    expect(screen.queryByTestId("mobile-challenge-verdict")).not.toBeInTheDocument();
  });

  it("survives a corrupt stored ladder instead of crashing", async () => {
    localStorage.setItem(CHALLENGE_STORAGE_KEY, "{not json");
    const stats = loadChallengeStats();
    expect(stats.elo).toBe(EMPTY_CHALLENGE_STATS.elo);
    expect(stats.totalAnswered).toBe(0);
  });

  /**
   * The user's actual complaint: "反馈在下面，要滑动才能看见".
   */
  it("pins the verdict to the viewport and marks both the right and the picked answer", async () => {
    const { spies } = await renderChallenge();
    const correctId = correctOptionId(spies);
    const wrongId = wrongOptionId(correctId);
    fireEvent.click(screen.getByTestId(`mobile-challenge-option-${wrongId}`));

    const banner = screen.getByTestId("mobile-challenge-verdict");
    // `fixed` is the guarantee that matters: the bar is in the viewport wherever the list is scrolled.
    expect(banner.className).toMatch(/\bfixed\b/);
    expect(banner.className).toContain("bottom-[calc(56px+env(safe-area-inset-bottom))]");
    // It is the bar, not a block appended to the list (which is what put it below the fold).
    expect(screen.getByTestId("mobile-challenge-options").contains(banner)).toBe(false);
    expect(banner).toHaveAttribute("data-outcome", "wrong");

    // The learning content is inside the pinned bar: the genre link and the next action.
    expect(within(banner).getByTestId("mobile-challenge-verdict-genre")).toBeInTheDocument();
    expect(within(banner).getByTestId("mobile-challenge-next")).toBeInTheDocument();
    expect(banner).toHaveTextContent("答案是");
    expect(within(banner).getByTestId("mobile-challenge-verdict-title")).toHaveTextContent("答错了");

    // Right gets the shell's green treatment, the picked wrong one the red one, the rest dim.
    const correctTile = screen.getByTestId(`mobile-challenge-option-${correctId}`);
    const wrongTile = screen.getByTestId(`mobile-challenge-option-${wrongId}`);
    expect(correctTile).toHaveAttribute("data-state", "right");
    expect(correctTile.className).toContain("ring-[var(--m-green)]");
    expect(wrongTile).toHaveAttribute("data-state", "wrong");
    expect(wrongTile.className).toContain("ring-[var(--m-red)]");
    expect(loadChallengeStats().streak).toBe(0);
  });

  it("advances itself after the beat on a right answer, and says that it will", async () => {
    const { spies } = await renderChallenge();
    /**
     * Fake timers go on *after* the library has resolved: `findBy*` drives `waitFor` with real timers,
     * and the beat that matters is the one the answer schedules.
     */
    vi.useFakeTimers();
    const correctId = correctOptionId(spies);
    const first = optionIds().join(",");
    fireEvent.click(screen.getByTestId(`mobile-challenge-option-${correctId}`));

    const banner = screen.getByTestId("mobile-challenge-verdict");
    expect(banner).toHaveAttribute("data-outcome", "right");
    expect(within(banner).getByTestId("mobile-challenge-auto-hint")).toBeInTheDocument();
    expect(screen.getByTestId("mobile-challenge-earned")).toHaveTextContent("+200");
    expect(screen.getByTestId("mobile-challenge-streak-now")).toHaveTextContent("1");

    // Still up just before the beat elapses: the user gets to see *why* it was right.
    act(() => {
      vi.advanceTimersByTime(CORRECT_AUTO_ADVANCE_MS - 100);
    });
    expect(screen.getByTestId("mobile-challenge-verdict")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByTestId("mobile-challenge-verdict")).not.toBeInTheDocument();
    expect(optionIds()).toHaveLength(4);
    expect(optionIds().join(",")).not.toBe(first);
  });

  it("never auto-advances a wrong answer, and offers next instead", async () => {
    const { spies } = await renderChallenge();
    // Fake timers after the loader resolved — see the case above.
    vi.useFakeTimers();
    const correctId = correctOptionId(spies);
    const wrongId = wrongOptionId(correctId);
    const first = optionIds().join(",");
    fireEvent.click(screen.getByTestId(`mobile-challenge-option-${wrongId}`));

    expect(screen.queryByTestId("mobile-challenge-auto-hint")).not.toBeInTheDocument();
    expect(screen.getByTestId("mobile-challenge-earned")).toHaveTextContent("+0");
    expect(screen.getByTestId("mobile-challenge-streak-now")).toHaveTextContent("0");

    // Three beats' worth of time changes nothing: the explanation is still there to be read.
    act(() => {
      vi.advanceTimersByTime(CORRECT_AUTO_ADVANCE_MS * 3);
    });
    expect(screen.getByTestId("mobile-challenge-verdict")).toHaveAttribute("data-outcome", "wrong");
    expect(optionIds().join(",")).toBe(first);

    // The explicit action is the only way forward.
    fireEvent.click(screen.getByTestId("mobile-challenge-next"));
    expect(screen.queryByTestId("mobile-challenge-verdict")).not.toBeInTheDocument();
    expect(optionIds()).toHaveLength(4);
  });

  it("buzzes the shell's haptic: a celebratory double pulse for right, a warning for wrong", async () => {
    const { spies } = await renderChallenge();
    const correctId = correctOptionId(spies);
    fireEvent.click(screen.getByTestId(`mobile-challenge-option-${wrongOptionId(correctId)}`));
    expect(vi.mocked(triggerHaptic)).toHaveBeenLastCalledWith(HapticPatterns.wrongAnswer);

    fireEvent.click(screen.getByTestId("mobile-challenge-next"));
    fireEvent.click(screen.getByTestId(`mobile-challenge-option-${correctOptionId(spies)}`));
    expect(vi.mocked(triggerHaptic)).toHaveBeenLastCalledWith(HapticPatterns.correctAnswer);
  });
});
