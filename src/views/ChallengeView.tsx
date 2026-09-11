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
  Zap
} from "lucide-react";
import { Genre } from "../types/genre";
import { ALL_GENRES, ELECTRONIC_GENRES } from "../data/genres";
import { AudioEngine } from "../audio/AudioEngine";
import { useLanguage } from "../i18n/LanguageContext";
import { announcer } from "../ui";

interface ChallengeViewProps {
  onSelectGenre: (genre: Genre) => void;
  onOpenStudio: (genre: Genre) => void;
}

type Difficulty = "easy" | "medium" | "hard";

interface QuizQuestion {
  correctGenre: Genre;
  options: Genre[];
}

const STORAGE_KEY = "groove_challenge_stats_v1";

interface StoredStats {
  score: number;
  streak: number;
  bestStreak: number;
  totalAnswered: number;
  correctCount: number;
  recentTested: string[];
}

const loadStoredStats = (): StoredStats => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return {
        score: typeof p.score === "number" ? p.score : 0,
        streak: typeof p.streak === "number" ? p.streak : 0,
        bestStreak: typeof p.bestStreak === "number" ? p.bestStreak : 0,
        totalAnswered: typeof p.totalAnswered === "number" ? p.totalAnswered : 0,
        correctCount: typeof p.correctCount === "number" ? p.correctCount : 0,
        recentTested: Array.isArray(p.recentTested) ? p.recentTested : [],
      };
    }
  } catch {}
  return { score: 0, streak: 0, bestStreak: 0, totalAnswered: 0, correctCount: 0, recentTested: [] };
};

// Strict 3-Tier Difficulty Pool Partitioning (P3-17: Easy !== Medium !== Hard)
const EASY_IDS = new Set([
  "chicago-house", "berlin-techno", "uplifting-trance", "brostep", "liquid-funk",
  "boom-bap", "trap", "synthpop", "reggaeton", "disco", "funk", "classic-rock",
  "heavy-metal", "grunge", "punk-rock", "delta-blues", "chicago-blues",
  "bebop", "bossa-nova", "afrobeats", "r-and-b", "contemporary-r-and-b",
  "eurodance", "progressive-house", "ambient"
]);

const HARD_IDS = new Set([
  "breakcore", "idm", "glitch-hop", "neurofunk", "footwork", "jersey-club",
  "gabber", "speedcore", "math-rock", "post-rock", "shoegaze", "djent",
  "black-metal", "death-metal", "grindcore", "free-jazz", "hard-bop",
  "vaporwave", "witch-house", "chiptune", "dark-ambient", "phonk",
  "uk-drill", "gqom", "amapiano", "hyperpop", "hardstyle", "jump-up"
]);

export const ChallengeView: React.FC<ChallengeViewProps> = ({
  onSelectGenre,
  onOpenStudio,
}) => {
  const { t, isZh } = useLanguage();

  const [initialStats] = useState<StoredStats>(loadStoredStats);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [score, setScore] = useState(initialStats.score);
  const [streak, setStreak] = useState(initialStats.streak);
  const [bestStreak, setBestStreak] = useState(initialStats.bestStreak);
  const [totalAnswered, setTotalAnswered] = useState(initialStats.totalAnswered);
  const [correctCount, setCorrectCount] = useState(initialStats.correctCount);

  // Anti-repeat buffer: exclude last 10 tested genres (P3-17)
  const recentTestedRef = useRef<string[]>(initialStats.recentTested);

  // Current question
  const [question, setQuestion] = useState<QuizQuestion | null>(null);
  const [selectedAnswerId, setSelectedAnswerId] = useState<string | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);

  const engineRef = useRef<AudioEngine | null>(null);

  const persistStats = (updated: Partial<StoredStats>) => {
    try {
      const current: StoredStats = {
        score,
        streak,
        bestStreak,
        totalAnswered,
        correctCount,
        recentTested: recentTestedRef.current,
        ...updated,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch {}
  };

  // Disjoint pools based on difficulty
  const getPool = (diff: Difficulty): Genre[] => {
    if (diff === "easy") {
      return ALL_GENRES.filter((g) => EASY_IDS.has(g.id));
    } else if (diff === "hard") {
      return ALL_GENRES.filter((g) => HARD_IDS.has(g.id));
    } else {
      // Medium: established subgenres not in easy or hard
      return ALL_GENRES.filter((g) => !EASY_IDS.has(g.id) && !HARD_IDS.has(g.id));
    }
  };

  // Generate question with 10-question anti-repeat rule
  const generateQuestion = (diff = difficulty): QuizQuestion => {
    const pool = getPool(diff);
    // Exclude recently tested genres
    const available = pool.filter((g) => !recentTestedRef.current.includes(g.id));
    const candidatePool = available.length >= 4 ? available : pool;

    const correctIdx = Math.floor(Math.random() * candidatePool.length);
    const correct = candidatePool[correctIdx];

    // Push into anti-repeat queue and keep max 10
    recentTestedRef.current = [correct.id, ...recentTestedRef.current.filter((id) => id !== correct.id)].slice(0, 10);
    persistStats({ recentTested: recentTestedRef.current });

    // Pick 3 distractors from candidate pool or full pool
    const distractors: Genre[] = [];
    const poolWithoutCorrect = pool.filter((g) => g.id !== correct.id);

    // Prefer similar BPM or category for realistic distractors
    const similar = poolWithoutCorrect.filter(
      (g) => g.category === correct.category || Math.abs(g.default_bpm - correct.default_bpm) <= 18
    );
    const distractorPool = similar.length >= 3 ? similar : poolWithoutCorrect;

    const shuffled = [...distractorPool].sort(() => Math.random() - 0.5);
    distractors.push(...shuffled.slice(0, 3));

    const options = [correct, ...distractors].sort(() => Math.random() - 0.5);

    return {
      correctGenre: correct,
      options,
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

    // Prepare audio engine
    const engine = new AudioEngine({
      onStop: () => setIsPlaying(false),
    });
    engine.setPattern(q.correctGenre.sequencer_pattern);
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

    if (isCorrect) {
      setCorrectCount(nextCorrect);
      const pointGain = difficulty === "easy" ? 100 : difficulty === "medium" ? 200 : 350;
      const newScore = score + pointGain;
      const newStreak = streak + 1;
      const newBestStreak = Math.max(bestStreak, newStreak);
      setScore(newScore);
      setStreak(newStreak);
      setBestStreak(newBestStreak);
      persistStats({
        score: newScore,
        streak: newStreak,
        bestStreak: newBestStreak,
        totalAnswered: nextTotal,
        correctCount: nextCorrect,
      });
      announcer.announce(
        isZh ? `回答正确！+${pointGain}分` : `Correct! +${pointGain} points`,
        "assertive"
      );
    } else {
      setStreak(0);
      persistStats({
        streak: 0,
        totalAnswered: nextTotal,
        correctCount: nextCorrect,
      });
      announcer.announce(
        isZh
          ? `回答错误。正确答案是：${question.correctGenre.name}`
          : `Incorrect. The correct answer was: ${question.correctGenre.name}`,
        "assertive"
      );
    }
  };

  const handleDifficultyChange = (newDiff: Difficulty) => {
    if (newDiff === difficulty) return;
    setDifficulty(newDiff);
  };

  const handleResetStats = () => {
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setTotalAnswered(0);
    setCorrectCount(0);
    recentTestedRef.current = [];
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  };

  const accuracy = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;

  // Normalized rank threshold based on score, difficulty multiplier & accuracy (P3-17)
  const rankTitle = () => {
    const multiplier = difficulty === "hard" ? 1.5 : difficulty === "medium" ? 1.2 : 1.0;
    const normalizedScore = score * multiplier;

    if (normalizedScore >= 1200 && accuracy >= 70) return isZh ? "声学传奇 (Sonic Sorcerer)" : "Sonic Sorcerer";
    if (normalizedScore >= 700 && accuracy >= 60) return isZh ? "律动大师 (Groove Maestro)" : "Groove Maestro";
    if (normalizedScore >= 300 || streak >= 3) return isZh ? "节拍探索家 (Beat Explorer)" : "Beat Explorer";
    return isZh ? "节奏学徒 (Rhythm Novice)" : "Rhythm Novice";
  };

  if (!question) return null;

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Header & Stats Banner */}
      <div className="bg-panel border border-line rounded-3xl p-6 shadow-2xl flex flex-wrap items-center justify-between gap-4">
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

        {/* Stats Pill Box */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 bg-panel2 p-2 rounded-2xl border border-line">
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

          {/* Accuracy (P3-17) */}
          <div className="px-2.5 py-1 text-center">
            <span className="text-[10px] text-text-dim font-bold uppercase block">
              {t("accuracy")}
            </span>
            <span className="text-sm sm:text-base font-extrabold text-cyan-400 font-mono">
              {accuracy}%
            </span>
          </div>

          <div className="w-px h-7 bg-neutral-800" />

          {/* Best Streak */}
          <div className="px-2.5 py-1 text-center hidden sm:block">
            <span className="text-[10px] text-text-dim font-bold uppercase block">
              {t("best_streak")}
            </span>
            <span className="text-sm sm:text-base font-extrabold text-emerald-400 font-mono">
              {bestStreak}
            </span>
          </div>

          <div className="w-px h-7 bg-neutral-800 hidden sm:block" />

          {/* Rank */}
          <div className="px-2.5 py-1 text-center hidden md:block">
            <span className="text-[10px] text-text-dim font-bold uppercase block">
              Rank
            </span>
            <span className="text-xs font-bold text-indigo-300">
              {rankTitle().split(" ")[0]}
            </span>
          </div>

          {/* Reset Stats Action */}
          <button
            onClick={handleResetStats}
            className="p-2 rounded-xl bg-[#13141a] hover:bg-neutral-800 text-text-dim hover:text-rose-400 border border-line transition-colors ml-1"
            title={isZh ? "重置所有成绩数据" : "Reset stats"}
            aria-label="Reset challenge stats"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Difficulty Tabs */}
      <div className="flex items-center justify-center space-x-2">
        {(["easy", "medium", "hard"] as Difficulty[]).map((d) => (
          <button
            key={d}
            onClick={() => handleDifficultyChange(d)}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
              difficulty === d
                ? "bg-accent text-[#0a0b0d] text-text shadow-lg shadow-indigo-600/30"
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
          <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 mx-auto flex items-center justify-center text-text shadow-xl shadow-indigo-500/30">
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
                  : "bg-emerald-600 hover:bg-emerald-500 text-text shadow-emerald-600/30"
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
          let badge = String.fromCharCode(65 + idx); // A, B, C, D

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
              disabled={isAnswered}
              onClick={() => handleSelectOption(opt)}
              className={`p-5 rounded-2xl border text-left transition-all duration-200 flex items-center justify-between group ${cardStyle}`}
            >
              <div className="space-y-1 min-w-0 pr-3">
                <div className="flex items-center space-x-2">
                  <span className="w-6 h-6 rounded-lg bg-neutral-800 group-hover:bg-accent text-[#0a0b0d] group-hover:text-text flex items-center justify-center font-bold text-xs text-text-sub shrink-0">
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
            <div className="flex items-center space-x-2">
              <Zap className="w-5 h-5 text-accent" />
              <h3 className="font-extrabold text-text text-base sm:text-lg">
                {selectedAnswerId === question.correctGenre.id
                  ? t("challenge_correct")
                  : t("challenge_incorrect", { genre: question.correctGenre.name })}
              </h3>
            </div>

            <button
              onClick={() => startNewQuestion(difficulty, true)}
              className="flex items-center space-x-1.5 px-5 py-2.5 rounded-2xl bg-accent text-[#0a0b0d] hover:bg-indigo-500 text-text font-bold text-xs shadow-xl shadow-indigo-600/30 transition-transform hover:scale-105"
            >
              <span>{t("next_question")}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

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
              className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-text hover:text-text text-xs font-semibold transition-colors"
            >
              <Sliders className="w-3.5 h-3.5 text-accent" />
              <span>{t("open_in_studio")}</span>
            </button>

            <button
              onClick={() => onSelectGenre(question.correctGenre)}
              className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-text hover:text-text text-xs font-semibold transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5 text-accent" />
              <span>{t("view_detail")}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
