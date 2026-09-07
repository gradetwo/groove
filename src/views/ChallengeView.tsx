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

interface ChallengeViewProps {
  onSelectGenre: (genre: Genre) => void;
  onOpenStudio: (genre: Genre) => void;
}

type Difficulty = "easy" | "medium" | "hard";

interface QuizQuestion {
  correctGenre: Genre;
  options: Genre[];
}

export const ChallengeView: React.FC<ChallengeViewProps> = ({
  onSelectGenre,
  onOpenStudio,
}) => {
  const { t, language } = useLanguage();

  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [totalAnswered, setTotalAnswered] = useState(0);

  // Current question
  const [question, setQuestion] = useState<QuizQuestion | null>(null);
  const [selectedAnswerId, setSelectedAnswerId] = useState<string | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const engineRef = useRef<AudioEngine | null>(null);

  // Pool of genres based on difficulty
  const getPool = (diff: Difficulty): Genre[] => {
    if (diff === "easy") {
      // Pick major recognizable genres
      const majorIds = [
        "chicago-house", "berlin-techno", "uplifting-trance", "brostep", 
        "liquid-funk", "boom-bap", "classic-rock", "delta-blues", 
        "synthpop", "reggaeton", "trap"
      ];
      const pool = ALL_GENRES.filter((g) => majorIds.includes(g.id) || g.subgenres.length >= 2);
      return pool.length >= 8 ? pool : ALL_GENRES;
    } else if (diff === "medium") {
      return ELECTRONIC_GENRES.length > 20 ? ELECTRONIC_GENRES : ALL_GENRES;
    } else {
      // Hard: underground, drill, neurofunk, hardstyle, math rock, etc.
      return ALL_GENRES;
    }
  };

  // Generate question
  const generateQuestion = (diff = difficulty): QuizQuestion => {
    const pool = getPool(diff);
    const correctIdx = Math.floor(Math.random() * pool.length);
    const correct = pool[correctIdx];

    // Pick 3 distractors
    const distractors: Genre[] = [];
    const poolWithoutCorrect = pool.filter((g) => g.id !== correct.id);

    // Prefer similar BPM or category
    const similar = poolWithoutCorrect.filter(
      (g) => g.category === correct.category || Math.abs(g.default_bpm - correct.default_bpm) <= 15
    );
    const candidatePool = similar.length >= 3 ? similar : poolWithoutCorrect;

    // Shuffle and pick 3
    const shuffled = [...candidatePool].sort(() => Math.random() - 0.5);
    distractors.push(...shuffled.slice(0, 3));

    const options = [correct, ...distractors].sort(() => Math.random() - 0.5);

    return {
      correctGenre: correct,
      options,
    };
  };

  // Start new round
  const startNewQuestion = (diff = difficulty) => {
    if (engineRef.current) {
      engineRef.current.destroy();
      engineRef.current = null;
    }
    const q = generateQuestion(diff);
    setQuestion(q);
    setSelectedAnswerId(null);
    setIsAnswered(false);

    // Auto start playback
    const engine = new AudioEngine();
    engine.setPattern(q.correctGenre.sequencer_pattern);
    engine.setBpm(q.correctGenre.default_bpm || 120);
    engine.play();
    engineRef.current = engine;
    setIsPlaying(true);
  };

  // Initialize first question on mount
  useEffect(() => {
    startNewQuestion(difficulty);
    return () => {
      if (engineRef.current) {
        engineRef.current.destroy();
      }
    };
  }, [difficulty]);

  const handleTogglePlay = () => {
    if (!engineRef.current || !question) return;
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
    setTotalAnswered((prev) => prev + 1);

    const isCorrect = genre.id === question.correctGenre.id;
    if (isCorrect) {
      const newScore = score + (difficulty === "easy" ? 100 : difficulty === "medium" ? 200 : 350);
      const newStreak = streak + 1;
      setScore(newScore);
      setStreak(newStreak);
      if (newStreak > bestStreak) {
        setBestStreak(newStreak);
      }
    } else {
      setStreak(0);
    }
  };

  const handleDifficultyChange = (newDiff: Difficulty) => {
    setDifficulty(newDiff);
    startNewQuestion(newDiff);
  };

  const rankTitle = () => {
    if (score >= 1500) return "Sonic Sorcerer (声学传奇)";
    if (score >= 900) return "Groove Maestro (律动大师)";
    if (score >= 400) return "Beat Explorer (节拍探索家)";
    return "Rhythm Novice (节奏学徒)";
  };

  if (!question) return null;

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Header & Stats Banner */}
      <div className="bg-neutral-900/90 border border-neutral-800 rounded-3xl p-6 shadow-2xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Blind Ear Training Arena</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-white mt-1">
            {t("challenge_title")}
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            {t("challenge_subtitle")}
          </p>
        </div>

        {/* Stats Pill Box */}
        <div className="flex items-center space-x-3 bg-neutral-950 p-2 rounded-2xl border border-neutral-800">
          {/* Score */}
          <div className="px-3 py-1 text-center">
            <span className="text-[10px] text-neutral-500 font-bold uppercase block">
              {t("score")}
            </span>
            <span className="text-sm sm:text-base font-extrabold text-indigo-400 font-mono">
              {score}
            </span>
          </div>

          <div className="w-px h-8 bg-neutral-800" />

          {/* Streak */}
          <div className="px-3 py-1 text-center flex flex-col items-center">
            <div className="flex items-center space-x-1 text-[10px] text-amber-500 font-bold uppercase">
              <Flame className="w-3 h-3 fill-current" />
              <span>{t("streak")}</span>
            </div>
            <span className="text-sm sm:text-base font-extrabold text-amber-400 font-mono">
              {streak}
            </span>
          </div>

          <div className="w-px h-8 bg-neutral-800" />

          {/* Rank */}
          <div className="px-3 py-1 text-center hidden sm:block">
            <span className="text-[10px] text-neutral-500 font-bold uppercase block">
              Rank
            </span>
            <span className="text-xs font-bold text-emerald-400">
              {rankTitle().split(" ")[0]}
            </span>
          </div>
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
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                : "bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800"
            }`}
          >
            {d === "easy" ? t("difficulty_easy") : d === "medium" ? t("difficulty_medium") : t("difficulty_hard")}
          </button>
        ))}
      </div>

      {/* Audio Playback Deck */}
      <div className="bg-neutral-900/80 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-xl text-center space-y-4 relative overflow-hidden">
        {/* Animated pulse background while playing */}
        {isPlaying && (
          <div className="absolute inset-0 bg-indigo-500/5 animate-pulse pointer-events-none" />
        )}

        <div className="relative z-10 space-y-3">
          <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 mx-auto flex items-center justify-center text-white shadow-xl shadow-indigo-500/30">
            <Volume2 className={`w-8 h-8 ${isPlaying ? "animate-bounce" : ""}`} />
          </div>

          <p className="text-xs sm:text-sm text-neutral-300 font-medium">
            {isPlaying 
              ? (language === "zh" ? "正在播放神秘律动，仔细聆听鼓点节奏与贝斯..." : "Listening to the blind groove... Identify the genre!") 
              : (language === "zh" ? "已暂停，点击播放继续试听" : "Paused. Click play to resume listening")}
          </p>

          {/* Clue: Tempo in medium/hard mode */}
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-neutral-950 border border-neutral-800 text-xs text-neutral-400 font-mono">
            <span>TEMPO CLUE:</span>
            <span className="text-white font-bold">{question.correctGenre.default_bpm} BPM</span>
          </div>

          <div>
            <button
              onClick={handleTogglePlay}
              className={`inline-flex items-center space-x-2 px-6 py-2.5 rounded-2xl font-bold text-sm transition-all shadow-xl ${
                isPlaying
                  ? "bg-amber-500 hover:bg-amber-400 text-black shadow-amber-500/30"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30"
              }`}
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
              <span>{isPlaying ? t("pause") : t("play")}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4 Multiple Choice Options */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {question.options.map((opt, idx) => {
          const isSelected = selectedAnswerId === opt.id;
          const isCorrectAnswer = opt.id === question.correctGenre.id;

          let cardStyle = "bg-neutral-900/90 border-neutral-800 hover:border-indigo-500/80 hover:bg-neutral-850 text-white";
          let badge = String.fromCharCode(65 + idx); // A, B, C, D

          if (isAnswered) {
            if (isCorrectAnswer) {
              cardStyle = "bg-emerald-600/20 border-emerald-500 text-emerald-200 shadow-lg shadow-emerald-500/20";
            } else if (isSelected && !isCorrectAnswer) {
              cardStyle = "bg-rose-600/20 border-rose-500 text-rose-200";
            } else {
              cardStyle = "bg-neutral-950/40 border-neutral-900 text-neutral-600 opacity-40";
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
                  <span className="w-6 h-6 rounded-lg bg-neutral-800 group-hover:bg-indigo-600 group-hover:text-white flex items-center justify-center font-bold text-xs text-neutral-400 shrink-0">
                    {badge}
                  </span>
                  <span className="font-bold text-base sm:text-lg tracking-wide truncate">
                    {opt.name}
                  </span>
                </div>
                {opt.aliases[0] && language === "zh" && (
                  <p className="text-xs text-neutral-400 pl-8">
                    {opt.aliases[0]}
                  </p>
                )}
                <div className="text-[11px] text-neutral-500 pl-8">
                  {opt.category} • {opt.bpm_range} BPM
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
        <div className="bg-neutral-900/90 border border-neutral-700 rounded-3xl p-6 shadow-2xl space-y-4 animate-slide-up">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center space-x-2">
              <Zap className="w-5 h-5 text-indigo-400" />
              <h3 className="font-extrabold text-white text-base sm:text-lg">
                {selectedAnswerId === question.correctGenre.id
                  ? (language === "zh" ? "🎉 恭喜回答正确！" : "🎉 Brilliant! Correct Answer!")
                  : (language === "zh" ? "💡 差一点！正确答案是: " + question.correctGenre.name : "💡 Not quite! The correct answer was: " + question.correctGenre.name)}
              </h3>
            </div>

            <button
              onClick={() => startNewQuestion()}
              className="flex items-center space-x-1.5 px-5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-xl shadow-indigo-600/30 transition-transform hover:scale-105"
            >
              <span>{t("next_question")}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed">
            {question.correctGenre.cultural_context[language]}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
            <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800">
              <span className="text-neutral-500 font-bold block mb-1 uppercase text-[10px]">
                {t("kick_placement")}
              </span>
              <p className="text-neutral-200">
                {question.correctGenre.drum_pattern.kick[language]}
              </p>
            </div>

            <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800">
              <span className="text-neutral-500 font-bold block mb-1 uppercase text-[10px]">
                {t("snare_placement")}
              </span>
              <p className="text-neutral-200">
                {question.correctGenre.drum_pattern.snare_clap[language]}
              </p>
            </div>

            <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800">
              <span className="text-neutral-500 font-bold block mb-1 uppercase text-[10px]">
                {t("bass_design")}
              </span>
              <p className="text-neutral-200">
                {question.correctGenre.bass_pattern[language]}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end space-x-2 pt-2">
            <button
              onClick={() => onOpenStudio(question.correctGenre)}
              className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white text-xs font-semibold transition-colors"
            >
              <Sliders className="w-3.5 h-3.5 text-indigo-400" />
              <span>{t("open_in_studio")}</span>
            </button>

            <button
              onClick={() => onSelectGenre(question.correctGenre)}
              className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white text-xs font-semibold transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5 text-indigo-400" />
              <span>{t("view_detail")}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
