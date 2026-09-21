/**
 * 挑战 (the challenge module, M5).
 *
 * The quiz itself is *not* reimplemented here: `src/utils/challengeAlgorithm.ts` owns the adaptive
 * selection (SuperMemo-2 review + a confusion matrix), the Elo update, the rank tiers and — since this
 * round — the difficulty pools. The desktop `ChallengeView` and this screen therefore share one set of
 * rules and one ladder: they read and write the same storage key, so a phone session continues the
 * desktop's progress rather than starting a second career.
 *
 * What is phone-specific is the shape: one column, four options, one big play button, and the answer's
 * explanation in the bar instead of a modal. Following the brief, the certificate and the reset control do
 * not come along — they are desktop affordances that would cost a phone user two more screens for no
 * gameplay.
 *
 * ## The answer beat (the bug this round fixes)
 *
 * The verdict used to be appended *below* the four options, which on a phone put it under the fold: the
 * user answered and then had to scroll to learn whether they were right. The verdict is now a bar pinned
 * to the bottom of the viewport (`position: fixed`, sitting on the module tab bar) — where the thumb
 * already is — and the grade is carried by the options themselves (`data-state`, the shell's green for
 * the right answer, red for the one that was picked wrong).
 *
 * Two different beats follow, on purpose:
 *
 *  - **right** — a fixed, visible 1.4 s beat, then the next question arrives by itself. The four options
 *    have already said *why* (one green, the rest dimmed) and the bar repeats it in words, so an extra
 *    tap would only slow the game down. The rail along the top of the bar drains over exactly that beat,
 *    so the wait is legible instead of a stall.
 *  - **wrong** — never automatic. The explanation is the thing the user has to read now, and reading
 *    takes as long as it takes; the bar hands the next question back to an explicit button instead of
 *    stealing the time.
 *
 * The timer is a `setTimeout` owned by an effect keyed to the answered question — never a wall clock —
 * and it is torn down when the answer, the question, the difficulty or the screen changes, so it can
 * neither fire twice nor jump past a question the user is still reading. (The E2E matrix grades by
 * clicking option A and then clicks `mobile-challenge-next`; that click cancels this timer, and the
 * 1.4 s beat is the budget that keeps the leg from ever racing it.)
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Pause, Play, X } from "lucide-react";
import { ALL_GENRES } from "../../data/genres";
import { useLanguage } from "../../i18n/LanguageContext";
import type { Genre } from "../../types/genre";
import { announcer } from "../../platform/announcer";
import { HapticPatterns, triggerHaptic } from "../../utils/haptics";
import {
  calculateEloDelta,
  CORRECT_ANSWER_POINTS,
  difficultyPoolFor,
  getRankTier,
  selectAdaptiveQuestion,
  updateSM2Memory,
  type ChallengeDifficulty,
  type SM2GenreMemory,
} from "../../utils/challengeAlgorithm";

/** Same key as the desktop view: one ladder, whichever surface you play on. */
export const CHALLENGE_STORAGE_KEY = "groove_challenge_stats_v2";

/**
 * How long a correct answer is shown before the next question replaces it.
 *
 * Exported so the test can drive the beat instead of guessing at it. It lives inside the 900–1400 ms the
 * brief names, and is deliberately at the top of that range: it is the window the E2E matrix's `next`
 * click has to land in, and a human still reads the green option and the explanation before it elapses.
 */
export const CORRECT_AUTO_ADVANCE_MS = 1400;

export interface StoredChallengeStats {
  score: number;
  streak: number;
  bestStreak: number;
  totalAnswered: number;
  correctCount: number;
  elo: number;
  sm2Memory: Record<string, SM2GenreMemory>;
  recentTested: string[];
}

export const EMPTY_CHALLENGE_STATS: StoredChallengeStats = {
  score: 0,
  streak: 0,
  bestStreak: 0,
  totalAnswered: 0,
  correctCount: 0,
  elo: 1000,
  sm2Memory: {},
  recentTested: [],
};

/** Tolerant load: a stale or hand-edited blob must not break the module. */
export function loadChallengeStats(): StoredChallengeStats {
  try {
    const raw = localStorage.getItem(CHALLENGE_STORAGE_KEY);
    if (!raw) return { ...EMPTY_CHALLENGE_STATS };
    const parsed = JSON.parse(raw) as Partial<StoredChallengeStats>;
    const numberOr = (value: unknown, fallback: number) =>
      typeof value === "number" && Number.isFinite(value) ? value : fallback;
    return {
      score: numberOr(parsed.score, 0),
      streak: numberOr(parsed.streak, 0),
      bestStreak: numberOr(parsed.bestStreak, 0),
      totalAnswered: numberOr(parsed.totalAnswered, 0),
      correctCount: numberOr(parsed.correctCount, 0),
      elo: numberOr(parsed.elo, 1000),
      sm2Memory: parsed.sm2Memory && typeof parsed.sm2Memory === "object" ? parsed.sm2Memory : {},
      recentTested: Array.isArray(parsed.recentTested) ? parsed.recentTested.slice(0, 10) : [],
    };
  } catch {
    return { ...EMPTY_CHALLENGE_STATS };
  }
}

export interface ChallengeQuestion {
  correctGenre: Genre;
  options: Genre[];
}

export interface MobileChallengeScreenProps {
  isPlaying: boolean;
  onTogglePlay: (genre: Genre) => void;
  onOpenGenre: (genreId: string) => void;
}

const DIFFICULTIES: ChallengeDifficulty[] = ["easy", "medium", "hard"];
const DIFFICULTY_LABEL_KEYS: Record<ChallengeDifficulty, string> = {
  easy: "mobile_challenge_easy",
  medium: "mobile_challenge_medium",
  hard: "mobile_challenge_hard",
};

export function MobileChallengeScreen({
  isPlaying,
  onTogglePlay,
  onOpenGenre,
}: MobileChallengeScreenProps) {
  const { t, language } = useLanguage();
  const [stats, setStats] = useState<StoredChallengeStats>(() => loadChallengeStats());
  const [difficulty, setDifficulty] = useState<ChallengeDifficulty>("medium");
  const [question, setQuestion] = useState<ChallengeQuestion | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [lastDelta, setLastDelta] = useState<number | null>(null);
  /** Points this answer actually paid, frozen at grading time (the difficulty could move during the beat). */
  const [lastGained, setLastGained] = useState(0);
  const recentRef = useRef<string[]>(stats.recentTested);
  const statsRef = useRef(stats);
  statsRef.current = stats;

  const persist = useCallback((next: StoredChallengeStats) => {
    setStats(next);
    try {
      localStorage.setItem(CHALLENGE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* private mode: the ladder simply does not persist */
    }
  }, []);

  const nextQuestion = useCallback(
    (diff: ChallengeDifficulty, current: StoredChallengeStats) => {
      const result = selectAdaptiveQuestion({
        allGenres: ALL_GENRES,
        difficultyPool: difficultyPoolFor(diff, ALL_GENRES.map((genre) => genre.id)),
        difficulty: diff,
        currentRound: current.totalAnswered,
        sm2Memory: current.sm2Memory,
        recentTestedIds: recentRef.current,
      });
      recentRef.current = [
        result.correctGenre.id,
        ...recentRef.current.filter((id) => id !== result.correctGenre.id),
      ].slice(0, 10);
      setQuestion({ correctGenre: result.correctGenre, options: result.options });
      setPicked(null);
      setLastDelta(null);
      setLastGained(0);
    },
    []
  );

  /**
   * First question, and a fresh one whenever the difficulty changes.
   *
   * The ladder is read through a ref rather than as a dependency: answering changes `stats`, and
   * re-rolling the question every time the score moves would throw away the question being answered.
   */
  useEffect(() => {
    nextQuestion(difficulty, statsRef.current);
  }, [difficulty, nextQuestion]);

  const answer = useCallback(
    (genre: Genre) => {
      if (!question || picked) return;
      setPicked(genre.id);
      const isCorrect = genre.id === question.correctGenre.id;
      const nextTotal = stats.totalAnswered + 1;
      const eloOutcome = calculateEloDelta({
        playerElo: stats.elo,
        difficulty,
        isCorrect,
        totalAnswered: stats.totalAnswered,
        streak: stats.streak,
      });
      const nextSm2 = updateSM2Memory({
        memory: stats.sm2Memory,
        targetGenreId: question.correctGenre.id,
        isCorrect,
        currentRound: nextTotal,
        pickedGenreId: genre.id,
        difficulty,
      });
      const nextStreak = isCorrect ? stats.streak + 1 : 0;
      const points = isCorrect ? CORRECT_ANSWER_POINTS[difficulty] : 0;
      const next: StoredChallengeStats = {
        score: stats.score + points,
        streak: nextStreak,
        bestStreak: Math.max(stats.bestStreak, nextStreak),
        totalAnswered: nextTotal,
        correctCount: isCorrect ? stats.correctCount + 1 : stats.correctCount,
        elo: eloOutcome.newElo,
        sm2Memory: nextSm2,
        recentTested: recentRef.current,
      };
      setLastDelta(eloOutcome.delta);
      setLastGained(points);
      persist(next);
      /* The phone can say "right" in the hand as well as on the screen. Both patterns already existed for
         this module; a missing Vibration API makes both a silent no-op. */
      triggerHaptic(isCorrect ? HapticPatterns.correctAnswer : HapticPatterns.wrongAnswer);
      announcer.announce(
        isCorrect ? `${t("mobile_challenge_correct")} +${points}` : t("mobile_challenge_wrong")
      );
    },
    [difficulty, persist, picked, question, stats, t]
  );

  const answeredCorrectly = Boolean(picked && question && picked === question.correctGenre.id);
  const outcomeColour = answeredCorrectly ? "var(--m-green)" : "var(--m-red)";

  /**
   * Auto-advance, as an effect rather than a bare timer inside `answer`.
   *
   * The effect is the thing that can *undo* the timer: any change to the answered question, the
   * difficulty or the screen runs the cleanup, so a queued advance can never land on the wrong question.
   * A wrong answer simply never schedules one — see the file header for why the two beats differ.
   */
  useEffect(() => {
    if (!answeredCorrectly || !question) return;
    const id = window.setTimeout(() => {
      nextQuestion(difficulty, statsRef.current);
    }, CORRECT_AUTO_ADVANCE_MS);
    return () => window.clearTimeout(id);
  }, [answeredCorrectly, question, difficulty, nextQuestion]);

  /**
   * The countdown rail starts at full and drains over the same beat.
   *
   * Flip a flag one tick after the bar paints so the width transition has a start value to move from;
   * without it the browser collapses the set-and-transition into a single style pass and the rail simply
   * appears empty.
   */
  const [beatRunning, setBeatRunning] = useState(false);
  useEffect(() => {
    if (!answeredCorrectly) {
      setBeatRunning(false);
      return;
    }
    const id = window.setTimeout(() => setBeatRunning(true), 0);
    return () => window.clearTimeout(id);
  }, [answeredCorrectly, picked]);

  const goNext = useCallback(() => {
    nextQuestion(difficulty, statsRef.current);
  }, [difficulty, nextQuestion]);

  const rank = useMemo(() => getRankTier(stats.elo), [stats.elo]);
  const accuracy = stats.totalAnswered > 0 ? Math.round((stats.correctCount / stats.totalAnswered) * 100) : 0;

  return (
    <section
      className={`m-rise px-4 pt-2 ${picked ? "pb-[160px]" : ""}`}
      data-testid="mobile-challenge"
    >
      <h1 className="text-[22px] font-bold leading-none">{t("mobile_module_challenge")}</h1>

      {/*
        Ladder.
        The vertical rhythm above the options is deliberately tight (mt-2, p-3, a 2-line explanation in the
        bar): at 390×844 it is what keeps the whole four-option grid clear of the pinned bar, so the green
        and red tiles are on screen when the verdict lands rather than behind it.
      */}
      <dl className="mt-2 grid grid-cols-3 gap-2" data-testid="mobile-challenge-ladder">
        <Cell label={t("mobile_challenge_score")} value={String(stats.elo)} testId="mobile-challenge-elo" />
        <Cell label={t("mobile_challenge_streak")} value={`${stats.streak}/${stats.bestStreak}`} />
        <Cell label={t("mobile_challenge_accuracy")} value={`${accuracy}%`} />
        <div className="col-span-3 rounded-2xl border border-[var(--m-line)] bg-[var(--m-card)] px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="m-mono text-[10px] uppercase tracking-[0.18em] text-[var(--m-gold)]">
              {language === "zh" ? rank.tier.nameZh : rank.tier.nameEn}
            </span>
            <span className="m-mono text-[9px] text-[var(--m-ink-3)]">
              {rank.nextTier
                ? t("mobile_challenge_to_next").replace("{points}", String(rank.pointsToNext))
                : t("mobile_challenge_top")}
            </span>
          </div>
          <div className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-[rgba(232,232,255,0.08)]">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,var(--m-gold),var(--m-gold-hi))]"
              style={{ width: `${Math.round(rank.progressPercent)}%` }}
            />
          </div>
        </div>
      </dl>

      {/* Difficulty */}
      <div className="m-rail mt-2" role="tablist" aria-label={t("mobile_challenge_difficulty")}>
        {DIFFICULTIES.map((diff) => (
          <button
            key={diff}
            type="button"
            role="tab"
            aria-selected={difficulty === diff}
            data-testid={`mobile-challenge-difficulty-${diff}`}
            onClick={() => setDifficulty(diff)}
            className={`m-press min-h-[46px] min-w-[46px] flex-none rounded-full border px-3.5 text-[12px] ${
              difficulty === diff
                ? "border-[var(--m-gold)] bg-[var(--m-gold)] text-[var(--m-on-gold)]"
                : "border-[var(--m-line-2)] text-[var(--m-ink-2)]"
            }`}
          >
            {t(DIFFICULTY_LABEL_KEYS[diff])}
          </button>
        ))}
      </div>

      {/* Arena */}
      <div className="mt-2 rounded-2xl border border-[var(--m-line)] bg-[var(--m-card)] p-2.5 text-center">
        <p className="m-mono text-[9px] uppercase tracking-[0.3em] text-[var(--m-ink-3)]">
          BLIND EAR TRAINING
        </p>
        <button
          type="button"
          data-testid="mobile-challenge-play"
          aria-pressed={isPlaying}
          aria-label={isPlaying ? t("mobile_player_pause") : t("mobile_player_play")}
          onClick={() => question && onTogglePlay(question.correctGenre)}
          className="m-press mx-auto mt-3 flex h-20 w-20 items-center justify-center rounded-full border border-[rgb(var(--m-gold-rgb)/0.5)] bg-[var(--m-card-2)] text-[var(--m-gold)]"
        >
          {isPlaying ? <Pause className="h-7 w-7" /> : <Play className="h-7 w-7" />}
        </button>
        <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--m-ink-2)]">
          {t("mobile_challenge_question")}
        </p>
        <p className="m-mono mt-1.5 inline-block rounded-full border border-[var(--m-line)] px-3 py-1 text-[9px] text-[var(--m-ink-3)]">
          {picked && question
            ? `TEMPO CLUE · ${question.correctGenre.default_bpm} BPM`
            : "TEMPO CLUE · ?"}
        </p>
      </div>

      {/*
        Options.
        The right/wrong fills keep the literal `bg-[rgba(…)]` utilities beside the token rings: the pixel
        and 苏联岁月 skins re-key those exact class names (dither lamps / flat paper signals), and a
        token-only rewrite here would leave their graded tiles invisible. The ring is the token layer
        every other skin reads.
      */}
      <div className="mt-2 grid grid-cols-2 gap-2" data-testid="mobile-challenge-options">
        {(question?.options ?? []).map((option, index) => {
          const isAnswer = question ? option.id === question.correctGenre.id : false;
          const isPicked = picked === option.id;
          const state = !picked ? "idle" : isAnswer ? "right" : isPicked ? "wrong" : "dim";
          return (
            <button
              key={option.id}
              type="button"
              data-testid={`mobile-challenge-option-${option.id}`}
              data-state={state}
              onClick={() => answer(option)}
              className={`m-press rounded-2xl border p-3 text-left ${
                state === "right"
                  ? "animate-pulse-glow border-[var(--m-green)] bg-[rgba(90,212,142,0.08)] ring-2 ring-[var(--m-green)]"
                  : state === "wrong"
                    ? "border-[var(--m-red)] bg-[rgba(242,109,109,0.07)] opacity-75 ring-2 ring-[var(--m-red)]"
                    : state === "dim"
                      ? "border-[var(--m-line)] opacity-40"
                      : "border-[var(--m-line)] bg-[var(--m-card)]"
              }`}
            >
              <span
                className={`m-mono block text-[10px] tracking-[0.2em] ${
                  state === "right"
                    ? "text-[var(--m-green)]"
                    : state === "wrong"
                      ? "text-[var(--m-red)]"
                      : "text-[var(--m-ink-3)]"
                }`}
              >
                {String.fromCharCode(65 + index)}
                {state === "right" ? " ✓" : state === "wrong" ? " ✗" : ""}
              </span>
              <span className="mt-1 block truncate text-[14px] font-bold">{option.name}</span>
              <span className="m-mono mt-0.5 block truncate text-[9.5px] text-[var(--m-ink-2)]">
                {option.category}
                {picked ? ` · ${option.default_bpm} BPM` : ""}
              </span>
            </button>
          );
        })}
      </div>

      {/*
        The verdict: a bar pinned over the tab bar, not a block appended to the list. `fixed` + `inset-x`
        keeps it in the viewport whatever the scroll position — which is the whole point, because the old
        block was under the fold on exactly a 390×844 phone.

        The entry is an opacity fade rather than the shell's `.m-rise`: `m-rise` translates the button, and
        an automation runner waits for a moving target to stop moving before it will click it, which ate
        most of the 1.4 s beat. A fade keeps the box still, so the next action is clickable on the frame it
        lands — the visual "arrival" is carried by the pulsing green option and the draining rail instead.
      */}
      {picked && question && (
        <div
          data-testid="mobile-challenge-verdict"
          data-outcome={answeredCorrectly ? "right" : "wrong"}
          className="animate-fade-in fixed inset-x-2 bottom-[calc(56px+env(safe-area-inset-bottom))] z-40 mx-auto max-w-[416px] overflow-hidden rounded-2xl border-2 bg-[var(--m-card)] shadow-2xl"
          style={{ borderColor: outcomeColour }}
        >
          {/* The beat rail: full and still on a wrong answer, draining on a right one. */}
          <div aria-hidden="true" className="h-0.5 w-full bg-[var(--m-line)]">
            <span
              className="block h-full"
              style={{
                width: answeredCorrectly ? (beatRunning ? "0%" : "100%") : "100%",
                background: outcomeColour,
                transitionProperty: "width",
                transitionTimingFunction: "linear",
                transitionDuration: answeredCorrectly ? `${CORRECT_AUTO_ADVANCE_MS}ms` : "0ms",
              }}
            />
          </div>

          <div className="px-3.5 pb-2 pt-2">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-[var(--m-on-gold)]"
                style={{ background: outcomeColour }}
              >
                {answeredCorrectly ? (
                  <Check className="h-4 w-4" strokeWidth={3} />
                ) : (
                  <X className="h-4 w-4" strokeWidth={3} />
                )}
              </span>
              <p
                className="text-[15px] font-bold leading-none"
                style={{ color: outcomeColour }}
                data-testid="mobile-challenge-verdict-title"
              >
                {answeredCorrectly ? t("mobile_challenge_correct") : t("mobile_challenge_wrong")}
              </p>
              {/* Only a right answer auto-advances, so only a right answer promises one. */}
              {answeredCorrectly && (
                <span
                  data-testid="mobile-challenge-auto-hint"
                  className="m-mono min-w-0 truncate text-[10px] text-[var(--m-ink-3)]"
                >
                  {t("mobile_challenge_auto_next")}
                </span>
              )}
              <span
                data-testid="mobile-challenge-earned"
                className="m-mono ml-auto flex-none rounded-full border px-2 py-0.5 text-[11px] font-bold"
                style={{ color: outcomeColour, borderColor: outcomeColour }}
              >
                {t("mobile_challenge_earned", { points: lastGained })}
              </span>
            </div>

            {/* Clamped to two lines: the pinned bar may not grow with a long characteristic — the genre
                link opens the full text. */}
            <p className="mt-1.5 line-clamp-2 text-[12px] leading-snug text-[var(--m-ink-2)]">
              {t("mobile_challenge_answer_is")}{" "}
              <button
                type="button"
                data-testid="mobile-challenge-verdict-genre"
                onClick={() => onOpenGenre(question.correctGenre.id)}
                className="m-press font-semibold text-[var(--m-gold)] underline"
              >
                {question.correctGenre.name}
              </button>{" "}
              — {question.correctGenre.key_characteristics?.[language] ?? ""}
            </p>

            <div className="mt-2 flex items-center gap-2">
              <span
                data-testid="mobile-challenge-streak-now"
                className="m-mono flex-none rounded-full border border-[var(--m-line)] px-2 py-0.5 text-[10px] text-[var(--m-ink-2)]"
              >
                {t("mobile_challenge_streak_now", { count: stats.streak })}
              </span>
              <span className="m-mono min-w-0 truncate text-[10px] text-[var(--m-gold-hi)]">
                {(lastDelta ?? 0) >= 0 ? `+${lastDelta ?? 0}` : lastDelta} ELO · {stats.elo}
              </span>
              <button
                type="button"
                data-testid="mobile-challenge-next"
                onClick={goNext}
                className="m-press ml-auto min-h-[44px] min-w-[96px] flex-none rounded-xl bg-[var(--m-gold)] px-4 text-[13px] font-bold text-[var(--m-on-gold)]"
              >
                {t("mobile_challenge_next")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Cell({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="rounded-2xl border border-[var(--m-line)] bg-[var(--m-card)] px-3 py-2.5">
      <dt className="m-mono text-[9px] uppercase tracking-[0.18em] text-[var(--m-ink-3)]">{label}</dt>
      <dd className="m-tabular mt-1 text-[16px] font-bold" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}
