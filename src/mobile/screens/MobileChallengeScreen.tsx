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
 * explanation inline instead of a modal. Following the brief, the certificate and the reset control do
 * not come along — they are desktop affordances that would cost a phone user two more screens for no
 * gameplay.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { ALL_GENRES } from "../../data/genres";
import { useLanguage } from "../../i18n/LanguageContext";
import type { Genre } from "../../types/genre";
import { announcer } from "../../platform/announcer";
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
  const recentRef = useRef<string[]>(stats.recentTested);

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
    },
    []
  );

  /**
   * First question, and a fresh one whenever the difficulty changes.
   *
   * The ladder is read through a ref rather than as a dependency: answering changes `stats`, and
   * re-rolling the question every time the score moves would throw away the question being answered.
   */
  const statsRef = useRef(stats);
  statsRef.current = stats;
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
      const next: StoredChallengeStats = {
        score: isCorrect ? stats.score + CORRECT_ANSWER_POINTS[difficulty] : stats.score,
        streak: nextStreak,
        bestStreak: Math.max(stats.bestStreak, nextStreak),
        totalAnswered: nextTotal,
        correctCount: isCorrect ? stats.correctCount + 1 : stats.correctCount,
        elo: eloOutcome.newElo,
        sm2Memory: nextSm2,
        recentTested: recentRef.current,
      };
      setLastDelta(eloOutcome.delta);
      persist(next);
      announcer.announce(
        isCorrect
          ? `${t("mobile_challenge_correct")} +${CORRECT_ANSWER_POINTS[difficulty]}`
          : t("mobile_challenge_wrong")
      );
    },
    [difficulty, persist, picked, question, stats, t]
  );

  const rank = useMemo(() => getRankTier(stats.elo), [stats.elo]);
  const accuracy = stats.totalAnswered > 0 ? Math.round((stats.correctCount / stats.totalAnswered) * 100) : 0;

  return (
    <section className="m-rise px-4 pt-2" data-testid="mobile-challenge">
      <h1 className="text-[22px] font-bold leading-none">{t("mobile_module_challenge")}</h1>

      {/* Ladder */}
      <dl className="mt-3 grid grid-cols-3 gap-2" data-testid="mobile-challenge-ladder">
        <Cell label={t("mobile_challenge_score")} value={String(stats.elo)} testId="mobile-challenge-elo" />
        <Cell label={t("mobile_challenge_streak")} value={`${stats.streak}/${stats.bestStreak}`} />
        <Cell label={t("mobile_challenge_accuracy")} value={`${accuracy}%`} />
        <div className="col-span-3 rounded-2xl border border-[var(--m-line)] bg-[var(--m-card)] px-3 py-2.5">
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
          <div className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-[rgba(238,225,200,0.08)]">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,var(--m-gold),var(--m-gold-hi))]"
              style={{ width: `${Math.round(rank.progressPercent)}%` }}
            />
          </div>
        </div>
      </dl>

      {/* Difficulty */}
      <div className="m-rail mt-3" role="tablist" aria-label={t("mobile_challenge_difficulty")}>
        {DIFFICULTIES.map((diff) => (
          <button
            key={diff}
            type="button"
            role="tab"
            aria-selected={difficulty === diff}
            data-testid={`mobile-challenge-difficulty-${diff}`}
            onClick={() => setDifficulty(diff)}
            className={`m-press min-h-[36px] flex-none rounded-full border px-3.5 text-[12px] ${
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
      <div className="mt-3 rounded-2xl border border-[var(--m-line)] bg-[var(--m-card)] p-4 text-center">
        <p className="m-mono text-[9px] uppercase tracking-[0.3em] text-[var(--m-ink-3)]">
          BLIND EAR TRAINING
        </p>
        <button
          type="button"
          data-testid="mobile-challenge-play"
          aria-pressed={isPlaying}
          aria-label={isPlaying ? t("mobile_player_pause") : t("mobile_player_play")}
          onClick={() => question && onTogglePlay(question.correctGenre)}
          className="m-press mx-auto mt-3 flex h-20 w-20 items-center justify-center rounded-full border border-[rgba(233,162,59,0.5)] bg-[#171208] text-[var(--m-gold)]"
        >
          {isPlaying ? <Pause className="h-7 w-7" /> : <Play className="h-7 w-7" />}
        </button>
        <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--m-ink-2)]">
          {t("mobile_challenge_question")}
        </p>
        <p className="m-mono mt-2 inline-block rounded-full border border-[var(--m-line)] px-3 py-1 text-[9px] text-[var(--m-ink-3)]">
          {picked && question
            ? `TEMPO CLUE · ${question.correctGenre.default_bpm} BPM`
            : "TEMPO CLUE · ?"}
        </p>
      </div>

      {/* Options */}
      <div className="mt-3 grid grid-cols-2 gap-2.5" data-testid="mobile-challenge-options">
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
              className={`m-press rounded-2xl border p-3.5 text-left ${
                state === "right"
                  ? "border-[var(--m-green)] bg-[rgba(90,212,142,0.08)]"
                  : state === "wrong"
                    ? "border-[var(--m-red)] bg-[rgba(242,109,109,0.07)] opacity-75"
                    : state === "dim"
                      ? "border-[var(--m-line)] opacity-40"
                      : "border-[var(--m-line)] bg-[var(--m-card)]"
              }`}
            >
              <span className="m-mono block text-[10px] tracking-[0.2em] text-[var(--m-ink-3)]">
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

      {/* Verdict */}
      {picked && question && (
        <div className="m-rise mt-3 rounded-2xl border border-[var(--m-line)] bg-[var(--m-card)] p-4" data-testid="mobile-challenge-verdict">
          <p className={`text-[14px] font-bold ${picked === question.correctGenre.id ? "text-[var(--m-green)]" : "text-[var(--m-red)]"}`}>
            {picked === question.correctGenre.id ? t("mobile_challenge_correct") : t("mobile_challenge_wrong")}
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-[var(--m-ink-2)]">
            {t("mobile_challenge_answer_is")}{" "}
            <button
              type="button"
              data-testid="mobile-challenge-verdict-genre"
              onClick={() => onOpenGenre(question.correctGenre.id)}
              className="m-press text-[var(--m-gold)] underline"
            >
              {question.correctGenre.name}
            </button>{" "}
            — {question.correctGenre.key_characteristics?.[language] ?? ""}
          </p>
          <p className="m-mono mt-2 text-[10px] text-[var(--m-gold-hi)]">
            {lastDelta !== null && lastDelta >= 0 ? `+${lastDelta}` : lastDelta} ELO · {stats.elo}
          </p>
          <button
            type="button"
            data-testid="mobile-challenge-next"
            onClick={() => nextQuestion(difficulty, stats)}
            className="m-press mt-3 min-h-[46px] w-full rounded-2xl bg-[var(--m-gold)] text-[14px] font-bold text-[var(--m-on-gold)]"
          >
            {t("mobile_challenge_next")}
          </button>
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
