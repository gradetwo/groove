import React, { useState, useEffect, useRef } from "react";
import { 
  HelpCircle, 
  Play, 
  Pause, 
  RotateCcw, 
  CheckCircle2, 
  XCircle, 
  Flame, 
  Trophy, 
  Award, 
  Sliders, 
  ExternalLink, 
  ArrowRight,
  Sparkles,
  Volume2,
  Zap,
  ShieldCheck
} from "lucide-react";
import { Genre } from "../types/genre";
import { ALL_GENRES } from "../data/genres";
import { AudioEngine } from "../audio/AudioEngine";
import { patternFromGenre } from "../data/genreMix";
import { useLanguage } from "../i18n/LanguageContext";
import { announcer } from "../ui";
import {
  calculateEloDelta,
  getRankTier,
  updateSM2Memory,
  selectAdaptiveQuestion,
  SM2GenreMemory,
  ChallengeDifficulty,
  DEFAULT_INITIAL_ELO,
} from "../utils/challengeAlgorithm";
import { triggerHaptic, HapticPatterns } from "../utils/haptics";
import { ChallengeCertificateModal } from "../components/ChallengeCertificateModal";

interface ChallengeViewProps {
  onSelectGenre: (genre: Genre) => void;
  onOpenStudio: (genre: Genre) => void;
}

interface QuizQuestion {
  correctGenre: Genre;
  options: Genre[];
  dueForReview?: boolean;
  confusionTarget?: string;
}

const STORAGE_KEY_V2 = "groove_challenge_stats_v2";
const LEGACY_STORAGE_KEY = "groove_challenge_stats_v1";

interface StoredStatsV2 {
  score: number;
  streak: number;
  bestStreak: number;
  totalAnswered: number;
  correctCount: number;
  recentTested: string[];
  elo: number;
  sm2Memory: Record<string, SM2GenreMemory>;
}

const loadStoredStats = (): StoredStatsV2 => {
  try {
    const rawV2 = localStorage.getItem(STORAGE_KEY_V2);
    if (rawV2) {
      const p = JSON.parse(rawV2);
      return {
        score: typeof p.score === "number" ? p.score : 0,
        streak: typeof p.streak === "number" ? p.streak : 0,
        bestStreak: typeof p.bestStreak === "number" ? p.bestStreak : 0,
        totalAnswered: typeof p.totalAnswered === "number" ? p.totalAnswered : 0,
        correctCount: typeof p.correctCount === "number" ? p.correctCount : 0,
        recentTested: Array.isArray(p.recentTested) ? p.recentTested : [],
        elo: typeof p.elo === "number" ? p.elo : DEFAULT_INITIAL_ELO,
        sm2Memory: p.sm2Memory && typeof p.sm2Memory === "object" ? p.sm2Memory : {},
      };
    }
    // Fallback: migrate from legacy v1 stats
    const rawV1 = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (rawV1) {
      const p = JSON.parse(rawV1);
      return {
        score: typeof p.score === "number" ? p.score : 0,
        streak: typeof p.streak === "number" ? p.streak : 0,
        bestStreak: typeof p.bestStreak === "number" ? p.bestStreak : 0,
        totalAnswered: typeof p.totalAnswered === "number" ? p.totalAnswered : 0,
        correctCount: typeof p.correctCount === "number" ? p.correctCount : 0,
        recentTested: Array.isArray(p.recentTested) ? p.recentTested : [],
        elo: DEFAULT_INITIAL_ELO,
        sm2Memory: {},
      };
    }
  } catch {}
  return {
    score: 0,
    streak: 0,
    bestStreak: 0,
    totalAnswered: 0,
    correctCount: 0,
    recentTested: [],
    elo: DEFAULT_INITIAL_ELO,
    sm2Memory: {},
  };
};

// Strict 3-Tier Difficulty Pool Partitioning (P3-17 & P6-04)
const EASY_IDS = new Set([
  "chicago-house", "detroit-techno", "uplifting-trance", "brostep", "liquid-dnb",
  "boom-bap", "edm-trap", "synth-pop", "reggaeton", "disco", "funk", "rock-and-roll",
  "heavy-metal", "grunge", "punk-rock", "delta-blues", "chicago-blues",
  "bebop", "bossa-nova", "afrobeat", "eurodance", "progressive-house", "ambient"
]);

const HARD_IDS = new Set([
  "breakcore", "idm", "glitch-hop", "neurofunk", "footwork", "jersey-club",
  "math-rock", "black-metal", "death-metal", "free-jazz",
  "vaporwave", "chiptune", "uk-drill", "amapiano", "hardstyle", "jump-up",
  "techstep", "halftime", "ragga-jungle", "industrial-techno"
]);

export const ChallengeView: React.FC<ChallengeViewProps> = ({
  onSelectGenre,
  onOpenStudio,
}) => {
  const { t, isZh } = useLanguage();

  const [initialStats] = useState<StoredStatsV2>(loadStoredStats);
  const [difficulty, setDifficulty] = useState<ChallengeDifficulty>("medium");
  const [score, setScore] = useState(initialStats.score);
  const [streak, setStreak] = useState(initialStats.streak);
  const [bestStreak, setBestStreak] = useState(initialStats.bestStreak);
  const [totalAnswered, setTotalAnswered] = useState(initialStats.totalAnswered);
  const [correctCount, setCorrectCount] = useState(initialStats.correctCount);
  const [elo, setElo] = useState(initialStats.elo);
  const [sm2Memory, setSm2Memory] = useState<Record<string, SM2GenreMemory>>(initialStats.sm2Memory);

  // Anti-repeat buffer: exclude last 10 tested genres (P3-17)
  const recentTestedRef = useRef<string[]>(initialStats.recentTested);

  // Current question & outcome feedback
  const [question, setQuestion] = useState<QuizQuestion | null>(null);
  const [selectedAnswerId, setSelectedAnswerId] = useState<string | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [lastEloDelta, setLastEloDelta] = useState<{ delta: number; bonus: number } | null>(null);
  const [confusionNotification, setConfusionNotification] = useState<string | null>(null);
  const [isCertificateOpen, setIsCertificateOpen] = useState(false);

  const engineRef = useRef<AudioEngine | null>(null);

  const persistStats = (updated: Partial<StoredStatsV2>) => {
    try {
      const current: StoredStatsV2 = {
        score,
        streak,
        bestStreak,
        totalAnswered,
        correctCount,
        recentTested: recentTestedRef.current,
        elo,
        sm2Memory,
        ...updated,
      };
      localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(current));
    } catch {}
  };

  // Disjoint pools based on difficulty
  const getDifficultyPool = (diff: ChallengeDifficulty): Set<string> => {
    if (diff === "easy") return EASY_IDS;
    if (diff === "hard") return HARD_IDS;
    return new Set(
      ALL_GENRES.filter((g) => !EASY_IDS.has(g.id) && !HARD_IDS.has(g.id)).map((g) => g.id)
    );
  };

  // Generate question using SuperMemo-2 Spaced Repetition and intelligent distractor matrix
  const generateQuestion = (diff = difficulty): QuizQuestion => {
    const pool = getDifficultyPool(diff);
    const result = selectAdaptiveQuestion({
      allGenres: ALL_GENRES,
      difficultyPool: pool,
      difficulty: diff,
      currentRound: totalAnswered,
      sm2Memory,
      recentTestedIds: recentTestedRef.current,
    });

    // Push into anti-repeat queue and keep max 10
    recentTestedRef.current = [
      result.correctGenre.id,
      ...recentTestedRef.current.filter((id) => id !== result.correctGenre.id),
    ].slice(0, 10);
    persistStats({ recentTested: recentTestedRef.current });

    return {
      correctGenre: result.correctGenre,
      options: result.options,
      dueForReview: result.dueForReview,
      confusionTarget: result.confusionTarget,
    };
  };

  // Start new round
  const startNewQuestion = (diff = difficulty, autoPlay = hasStarted) => {
    if (engineRef.current) {
      engineRef.current.stop();
      engineRef.current.destroy();
      engineRef.current = null;
    }
    const q = generateQuestion(diff);
    setQuestion(q);
    setSelectedAnswerId(null);
    setIsAnswered(false);
    setLastEloDelta(null);
    setConfusionNotification(null);

    // Prepare audio engine
    const engine = new AudioEngine({
      onStop: () => setIsPlaying(false),
    });
    engine.setPattern(patternFromGenre(q.correctGenre));
    engine.setBpm(q.correctGenre.default_bpm || 120);
    engineRef.current = engine;

    if (autoPlay) {
      engine.play();
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
    }
  };

  // Initialize first question on mount or when difficulty changes
  useEffect(() => {
    startNewQuestion(difficulty, false);
    return () => {
      if (engineRef.current) {
        engineRef.current.stop();
        engineRef.current.destroy();
        engineRef.current = null;
      }
    };
  }, [difficulty]);

  const handleTogglePlay = () => {
    if (!engineRef.current || !question) return;
    if (!hasStarted) {
      setHasStarted(true);
      engineRef.current.play();
      setIsPlaying(true);
      return;
    }
    if (isPlaying) {
      engineRef.current.pause();
      setIsPlaying(false);
    } else {
      engineRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleSelectOption = (genre: Genre) => {
    if (isAnswered || !question) return;

    setSelectedAnswerId(genre.id);
    setIsAnswered(true);
    const nextTotal = totalAnswered + 1;
    const isCorrect = genre.id === question.correctGenre.id;
    const nextCorrect = isCorrect ? correctCount + 1 : correctCount;

    setTotalAnswered(nextTotal);

    // Calculate Elo delta with placement and streak multiplier
    const eloOutcome = calculateEloDelta({
      playerElo: elo,
      difficulty,
      isCorrect,
      totalAnswered,
      streak,
    });
    const nextElo = eloOutcome.newElo;
    setElo(nextElo);
    setLastEloDelta({ delta: eloOutcome.delta, bonus: eloOutcome.bonus });

    // Update SuperMemo-2 spaced repetition memory & confusion matrix
    const nextSm2 = updateSM2Memory({
      memory: sm2Memory,
      targetGenreId: question.correctGenre.id,
      isCorrect,
      currentRound: nextTotal,
      pickedGenreId: genre.id,
      difficulty,
    });
    setSm2Memory(nextSm2);

    if (isCorrect) {
      setCorrectCount(nextCorrect);
      triggerHaptic(HapticPatterns.correctAnswer);
      const pointGain = difficulty === "easy" ? 100 : difficulty === "medium" ? 200 : 350;
      const newScore = score + pointGain;
      const newStreak = streak + 1;
      const newBestStreak = Math.max(bestStreak, newStreak);
      setScore(newScore);
      setStreak(newStreak);
      setBestStreak(newBestStreak);
      setConfusionNotification(null);

      persistStats({
        score: newScore,
        streak: newStreak,
        bestStreak: newBestStreak,
        totalAnswered: nextTotal,
        correctCount: nextCorrect,
        elo: nextElo,
        sm2Memory: nextSm2,
      });

      const eloGainMsg = eloOutcome.bonus > 0
        ? `+${eloOutcome.delta} Elo (${t("challenge_streak_bonus")} +${eloOutcome.bonus})`
        : `+${eloOutcome.delta} Elo`;
      announcer.announce(
        isZh ? `回答正确！+${pointGain}分，${eloGainMsg}` : `Correct! +${pointGain} points, ${eloGainMsg}`,
        "assertive"
      );
    } else {
      setStreak(0);
      triggerHaptic(HapticPatterns.wrongAnswer);
      const timesConfused = nextSm2[question.correctGenre.id]?.confusedWith[genre.id] || 1;
      const confusionMsg = isZh
        ? `已记录与「${genre.name}」的第 ${timesConfused} 次混淆，已根据艾宾浩斯遗忘曲线排入后续间隔复习池。`
        : `Recorded confusion with "${genre.name}" (${timesConfused}x). Prioritized for SuperMemo-2 spaced repetition.`;
      setConfusionNotification(confusionMsg);

      persistStats({
        streak: 0,
        totalAnswered: nextTotal,
        correctCount: nextCorrect,
        elo: nextElo,
        sm2Memory: nextSm2,
      });

      announcer.announce(
        isZh
          ? `回答错误。正确答案是：${question.correctGenre.name}，${eloOutcome.delta} Elo`
          : `Incorrect. The correct answer was: ${question.correctGenre.name}, ${eloOutcome.delta} Elo`,
        "assertive"
      );
    }
  };

  const handleDifficultyChange = (newDiff: ChallengeDifficulty) => {
    if (newDiff === difficulty) return;
    setDifficulty(newDiff);
  };

  const handleResetStats = () => {
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setTotalAnswered(0);
    setCorrectCount(0);
    setElo(DEFAULT_INITIAL_ELO);
    setSm2Memory({});
    setLastEloDelta(null);
    setConfusionNotification(null);
    recentTestedRef.current = [];
    try {
      localStorage.removeItem(STORAGE_KEY_V2);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {}
  };

  const accuracy = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;
  const tierInfo = getRankTier(elo);

  if (!question) return null;

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Header & Stats Banner */}
      <div className="bg-panel border border-line rounded-3xl p-6 shadow-2xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-accent text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Blind Ear Training Arena</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-text mt-1">
              {t("challenge_title")}
            </h2>
            <p className="text-xs text-text-sub mt-0.5">
              {t("challenge_subtitle")}
            </p>
          </div>

          {/* Certificate Action Button */}
          <button
            onClick={() => setIsCertificateOpen(true)}
            className="inline-flex items-center space-x-2 px-4 py-2 rounded-2xl bg-gradient-to-r from-amber-500/20 to-indigo-500/20 hover:from-amber-500/30 hover:to-indigo-500/30 border border-amber-500/40 text-amber-300 text-xs font-bold transition-all shadow-lg shadow-amber-500/10"
          >
            <Award className="w-4 h-4 text-amber-400" />
            <span>{t("challenge_certificate_btn")}</span>
          </button>
        </div>

        {/* Stats Pill Box & Elo Ladder Status */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-panel2 p-3 rounded-2xl border border-line">
          <div className="flex flex-wrap items-center gap-3">
            {/* Elo Rating */}
            <div className="px-2.5 py-1 text-center">
              <span className="text-[10px] text-text-dim font-bold uppercase block">
                {t("challenge_elo")}
              </span>
              <span className="text-sm sm:text-base font-extrabold text-amber-400 font-mono">
                {elo}
              </span>
            </div>

            <div className="w-px h-7 bg-neutral-800" />

            {/* Rank Tier Badge */}
            <div className="px-2.5 py-1 text-center">
              <span className="text-[10px] text-text-dim font-bold uppercase block">
                {t("challenge_rank_tier")}
              </span>
              <span
                className="text-xs sm:text-sm font-black flex items-center space-x-1"
                style={{ color: tierInfo.tier.color }}
              >
                <span>{tierInfo.tier.icon}</span>
                <span>{isZh ? tierInfo.tier.nameZh : tierInfo.tier.nameEn}</span>
              </span>
            </div>

            <div className="w-px h-7 bg-neutral-800" />

            {/* Score */}
            <div className="px-2.5 py-1 text-center">
              <span className="text-[10px] text-text-dim font-bold uppercase block">
                {t("score")}
              </span>
              <span className="text-sm sm:text-base font-extrabold text-accent font-mono">
                {score}
              </span>
            </div>

            <div className="w-px h-7 bg-neutral-800" />

            {/* Streak */}
            <div className="px-2.5 py-1 text-center flex flex-col items-center">
              <div className="flex items-center space-x-1 text-[10px] text-amber-500 font-bold uppercase">
                <Flame className="w-3 h-3 fill-current" />
                <span>{t("streak")}</span>
              </div>
              <span className="text-sm sm:text-base font-extrabold text-amber-400 font-mono">
                {streak}
              </span>
            </div>

            <div className="w-px h-7 bg-neutral-800" />

            {/* Accuracy */}
            <div className="px-2.5 py-1 text-center">
              <span className="text-[10px] text-text-dim font-bold uppercase block">
                {t("accuracy")}
              </span>
              <span className="text-sm sm:text-base font-extrabold text-cyan-400 font-mono">
                {accuracy}%
              </span>
            </div>

            <div className="w-px h-7 bg-neutral-800 hidden sm:block" />

            {/* Best Streak */}
            <div className="px-2.5 py-1 text-center hidden sm:block">
              <span className="text-[10px] text-text-dim font-bold uppercase block">
                {t("best_streak")}
              </span>
              <span className="text-sm sm:text-base font-extrabold text-emerald-400 font-mono">
                {bestStreak}
              </span>
            </div>
          </div>

          {/* Tier Progress & Reset */}
          <div className="flex items-center space-x-3 w-full sm:w-auto justify-between sm:justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-line">
            {tierInfo.nextTier ? (
              <div className="flex items-center space-x-2 text-[11px] text-text-sub">
                <div className="w-24 sm:w-28 bg-neutral-800 rounded-full h-2 overflow-hidden border border-neutral-700">
                  <div
                    className="bg-gradient-to-r from-amber-400 to-indigo-500 h-full rounded-full transition-all duration-300"
                    style={{ width: `${tierInfo.progressPercent}%` }}
                  />
                </div>
                <span className="font-mono text-text-dim">
                  {tierInfo.progressPercent}% {isZh ? `距${tierInfo.nextTier.nameZh}` : `to ${tierInfo.nextTier.nameEn}`}
                </span>
              </div>
            ) : (
              <span className="text-[11px] text-amber-400 font-bold">
                {t("challenge_max_tier")}
              </span>
            )}

            {/* Reset Stats Action */}
            <button
              onClick={handleResetStats}
              className="p-2 rounded-xl bg-[#13141a] hover:bg-neutral-800 text-text-dim hover:text-rose-400 border border-line transition-colors"
              title={isZh ? "重置所有成绩数据" : "Reset stats"}
              aria-label="Reset challenge stats"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Difficulty Tabs */}
      <div className="flex items-center justify-center space-x-2">
        {(["easy", "medium", "hard"] as ChallengeDifficulty[]).map((d) => (
          <button
            key={d}
            onClick={() => handleDifficultyChange(d)}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
              difficulty === d
                ? "bg-accent text-[#0a0b0d] shadow-lg shadow-indigo-600/30"
                : "bg-panel text-text-sub hover:text-text border border-line"
            }`}
          >
            {d === "easy" ? t("difficulty_easy") : d === "medium" ? t("difficulty_medium") : t("difficulty_hard")}
          </button>
        ))}
      </div>

      {/* Audio Playback Deck */}
      <div className="bg-panel border border-line rounded-3xl p-6 sm:p-8 shadow-xl text-center space-y-4 relative overflow-hidden">
        {/* Animated pulse background while playing */}
        {isPlaying && (
          <div className="absolute inset-0 bg-indigo-500/5 animate-pulse pointer-events-none" />
        )}

        <div className="relative z-10 space-y-3">
          {/* Spaced Repetition Due Badge */}
          {question.dueForReview && (
            <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-semibold animate-pulse">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{t("challenge_sm2_review")}</span>
            </div>
          )}

          <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 mx-auto flex items-center justify-center text-white shadow-xl shadow-indigo-500/30">
            <Volume2 className={`w-8 h-8 ${isPlaying ? "animate-bounce" : ""}`} />
          </div>

          <p className="text-xs sm:text-sm text-[#b9b7b0] font-medium">
            {!hasStarted
              ? t("challenge_start_prompt")
              : isPlaying 
              ? t("challenge_listening_prompt") 
              : t("challenge_paused_prompt")}
          </p>

          {/* Clue: Tempo hidden until answered to prevent blind test leaks (P0-20) */}
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-panel2 border border-line text-xs text-text-sub font-mono">
            <span>TEMPO CLUE:</span>
            <span className={isAnswered ? "text-accent font-bold" : "text-text-dim"}>
              {isAnswered
                ? `${question.correctGenre.default_bpm} BPM (${question.correctGenre.bpm_range})`
                : t("challenge_hidden_quiz")}
            </span>
          </div>

          <div>
            <button
              onClick={handleTogglePlay}
              className={`inline-flex items-center space-x-2 px-6 py-2.5 rounded-2xl font-bold text-sm transition-all shadow-xl ${
                !hasStarted
                  ? "bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white shadow-indigo-500/30 scale-105"
                  : isPlaying
                  ? "bg-amber-500 hover:bg-amber-400 text-black shadow-amber-500/30"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30"
              }`}
            >
              {!hasStarted ? <Play className="w-4 h-4 fill-current" /> : isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
              <span>{!hasStarted ? t("challenge_start_btn") : isPlaying ? t("pause") : t("play")}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4 Multiple Choice Options */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {question.options.map((opt, idx) => {
          const isSelected = selectedAnswerId === opt.id;
          const isCorrectAnswer = opt.id === question.correctGenre.id;

          let cardStyle = "bg-panel/90 border-line hover:border-indigo-500/80 hover:bg-neutral-850 text-text";
          const badge = String.fromCharCode(65 + idx); // A, B, C, D

          if (isAnswered) {
            if (isCorrectAnswer) {
              cardStyle = "bg-emerald-600/20 border-emerald-500 text-emerald-200 shadow-lg shadow-emerald-500/20";
            } else if (isSelected && !isCorrectAnswer) {
              cardStyle = "bg-rose-600/20 border-rose-500 text-rose-200";
            } else {
              cardStyle = "bg-panel2/40 border-neutral-900 text-neutral-600 opacity-40";
            }
          }

          return (
            <button
              key={opt.id}
              data-testid="challenge-option"
              disabled={isAnswered}
              onClick={() => handleSelectOption(opt)}
              className={`p-5 rounded-2xl border text-left transition-all duration-200 flex items-center justify-between group ${cardStyle}`}
            >
              <div className="space-y-1 min-w-0 pr-3">
                <div className="flex items-center space-x-2">
                  <span className="w-6 h-6 rounded-lg bg-neutral-800 group-hover:bg-accent text-text group-hover:text-black flex items-center justify-center font-bold text-xs shrink-0">
                    {badge}
                  </span>
                  <span className="font-bold text-base sm:text-lg tracking-wide truncate">
                    {opt.name}
                  </span>
                </div>
                {opt.aliases[0] && isZh && (
                  <p className="text-xs text-text-sub pl-8">
                    {opt.aliases[0]}
                  </p>
                )}
                <div className="text-[11px] text-text-dim pl-8">
                  {isAnswered ? (
                    `${opt.category} • ${opt.bpm_range} BPM`
                  ) : (
                    <span className="text-[#4a4e58]">{t("challenge_select_genre")}</span>
                  )}
                </div>
              </div>

              {isAnswered && isCorrectAnswer && (
                <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
              )}
              {isAnswered && isSelected && !isCorrectAnswer && (
                <XCircle className="w-6 h-6 text-rose-400 shrink-0" />
              )}
            </button>
          );
        })}
      </div>

      {/* Answer Explanation & Next Question Drawer */}
      {isAnswered && (
        <div className="bg-panel border border-line rounded-3xl p-6 shadow-2xl space-y-4 animate-slide-up">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center space-x-3">
              <Zap className="w-5 h-5 text-accent" />
              <div>
                <h3 className="font-extrabold text-text text-base sm:text-lg">
                  {selectedAnswerId === question.correctGenre.id
                    ? t("challenge_correct")
                    : t("challenge_incorrect", { genre: question.correctGenre.name })}
                </h3>
                {lastEloDelta && (
                  <div className="flex items-center space-x-2 mt-0.5">
                    <span
                      className={`text-xs font-mono font-black ${
                        lastEloDelta.delta > 0 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {lastEloDelta.delta > 0 ? `+${lastEloDelta.delta}` : lastEloDelta.delta} ELO
                    </span>
                    {lastEloDelta.bonus > 0 && (
                      <span className="text-[10px] text-amber-400 font-bold px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                        {t("challenge_streak_bonus")} +{lastEloDelta.bonus}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => startNewQuestion(difficulty, true)}
              className="flex items-center space-x-1.5 px-5 py-2.5 rounded-2xl bg-accent text-[#0a0b0d] hover:bg-indigo-500 text-white font-bold text-xs shadow-xl shadow-indigo-600/30 transition-transform hover:scale-105"
            >
              <span>{t("next_question")}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* SM-2 Confusion Memory Notification Callout */}
          {confusionNotification && (
            <div className="p-3.5 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 flex items-start space-x-2.5 text-xs text-indigo-200 leading-relaxed">
              <Sparkles className="w-4 h-4 text-accent shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block text-accent mb-0.5">
                  {isZh ? "艾宾浩斯智能间隔记忆已收录" : "SuperMemo-2 Memory Tracking Active"}
                </span>
                <span>{confusionNotification}</span>
              </div>
            </div>
          )}

          <p className="text-xs sm:text-sm text-[#b9b7b0] leading-relaxed">
            {isZh ? question.correctGenre.cultural_context.zh : question.correctGenre.cultural_context.en}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
            <div className="p-3 bg-panel2 rounded-xl border border-line">
              <span className="text-text-dim font-bold block mb-1 uppercase text-[10px]">
                {t("kick_placement")}
              </span>
              <p className="text-text">
                {isZh ? question.correctGenre.drum_pattern.kick.zh : question.correctGenre.drum_pattern.kick.en}
              </p>
            </div>

            <div className="p-3 bg-panel2 rounded-xl border border-line">
              <span className="text-text-dim font-bold block mb-1 uppercase text-[10px]">
                {t("snare_placement")}
              </span>
              <p className="text-text">
                {isZh ? question.correctGenre.drum_pattern.snare_clap.zh : question.correctGenre.drum_pattern.snare_clap.en}
              </p>
            </div>

            <div className="p-3 bg-panel2 rounded-xl border border-line">
              <span className="text-text-dim font-bold block mb-1 uppercase text-[10px]">
                {t("bass_design")}
              </span>
              <p className="text-text">
                {isZh ? question.correctGenre.bass_pattern.zh : question.correctGenre.bass_pattern.en}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end space-x-2 pt-2">
            <button
              onClick={() => onOpenStudio(question.correctGenre)}
              className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-text text-xs font-semibold transition-colors"
            >
              <Sliders className="w-3.5 h-3.5 text-accent" />
              <span>{t("open_in_studio")}</span>
            </button>

            <button
              onClick={() => onSelectGenre(question.correctGenre)}
              className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-text text-xs font-semibold transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5 text-accent" />
              <span>{t("view_detail")}</span>
            </button>
          </div>
        </div>
      )}

      {/* Certificate Modal */}
      <ChallengeCertificateModal
        isOpen={isCertificateOpen}
        onClose={() => setIsCertificateOpen(false)}
        elo={elo}
        tierInfo={tierInfo}
        stats={{
          totalAnswered,
          correctCount,
          bestStreak,
          streak,
        }}
        sm2Memory={sm2Memory}
        isZh={isZh}
      />
    </div>
  );
};
