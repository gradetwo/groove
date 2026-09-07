import React, { useState, useEffect, useRef } from "react";
import { 
  Play, 
  Pause, 
  Square, 
  Sliders, 
  Columns, 
  ArrowLeft, 
  ExternalLink, 
  Sparkles, 
  Clock, 
  MapPin, 
  Music, 
  Disc3, 
  Layers, 
  Headphones, 
  Share2,
  ChevronRight,
  GitCommit,
  Flame
} from "lucide-react";
import { Genre, SequencerPattern } from "../types/genre";
import { GENRES_MAP, ALL_GENRES } from "../data/genres";
import { AudioEngine } from "../audio/AudioEngine";
import { useLanguage } from "../i18n/LanguageContext";

interface GenreDetailViewProps {
  genre: Genre;
  onBack: () => void;
  onSelectGenre: (genre: Genre) => void;
  onOpenStudio: (genre: Genre) => void;
  onAddToCompare: (genre: Genre) => void;
}

const MINI_TRACK_COLORS = [
  "bg-red-500",
  "bg-amber-500",
  "bg-cyan-500",
  "bg-emerald-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-yellow-500",
  "bg-blue-500",
];

export const GenreDetailView: React.FC<GenreDetailViewProps> = ({
  genre,
  onBack,
  onSelectGenre,
  onOpenStudio,
  onAddToCompare,
}) => {
  const { t, language } = useLanguage();

  // Mini sequencer player state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [bpm, setBpm] = useState(genre.default_bpm || 124);
  const engineRef = useRef<AudioEngine | null>(null);

  // Initialize audio engine for preview
  useEffect(() => {
    const engine = new AudioEngine({
      onStep: ({ step }) => setCurrentStep(step),
      onStop: () => {
        setIsPlaying(false);
        setCurrentStep(0);
      },
    });
    engineRef.current = engine;
    engine.setPattern(genre.sequencer_pattern);
    engine.setBpm(genre.default_bpm || 124);

    return () => {
      engine.destroy();
    };
  }, [genre]);

  const handleTogglePlay = () => {
    if (!engineRef.current) return;
    if (isPlaying) {
      engineRef.current.pause();
      setIsPlaying(false);
    } else {
      engineRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleStop = () => {
    if (!engineRef.current) return;
    engineRef.current.stop();
    setIsPlaying(false);
    setCurrentStep(0);
  };

  const handleBpmChange = (newBpm: number) => {
    setBpm(newBpm);
    if (engineRef.current) {
      engineRef.current.setBpm(newBpm);
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-6 space-y-8">
      {/* Back Button */}
      <button
        onClick={onBack}
        className="inline-flex items-center space-x-1.5 text-xs text-neutral-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>{t("back")}</span>
      </button>

      {/* Hero Header Banner */}
      <div className="bg-neutral-900/90 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        {/* Ambient background glow */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/10 blur-3xl rounded-full pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-indigo-600/30 text-indigo-400 border border-indigo-500/30">
                {genre.category}
              </span>
              {genre.aliases.map((alias) => (
                <span
                  key={alias}
                  className="text-xs px-2.5 py-1 rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700"
                >
                  {alias}
                </span>
              ))}
            </div>

            <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
              {genre.name}
            </h1>

            <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm text-neutral-300 pt-1">
              <div className="flex items-center space-x-1.5 text-amber-400">
                <Clock className="w-4 h-4" />
                <span className="font-semibold">{genre.origin_year}</span>
              </div>
              <div className="flex items-center space-x-1.5 text-sky-400">
                <MapPin className="w-4 h-4" />
                <span className="font-semibold">{genre.origin_place[language]}</span>
              </div>
              <div className="flex items-center space-x-1.5 text-emerald-400">
                <Music className="w-4 h-4" />
                <span className="font-semibold">{genre.bpm_range} BPM</span>
              </div>
              <div className="flex items-center space-x-1.5 text-purple-400">
                <Disc3 className="w-4 h-4" />
                <span className="font-semibold">{genre.time_signature} Time</span>
              </div>
            </div>
          </div>

          {/* Call to Actions */}
          <div className="flex flex-wrap md:flex-col gap-2.5 shrink-0">
            <button
              onClick={() => onOpenStudio(genre)}
              className="flex-1 md:flex-initial flex items-center justify-center space-x-2 px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-xl shadow-indigo-600/30 transition-all hover:scale-105"
            >
              <Sliders className="w-4 h-4" />
              <span>{t("open_in_studio")}</span>
            </button>

            <button
              onClick={() => onAddToCompare(genre)}
              className="flex-1 md:flex-initial flex items-center justify-center space-x-2 px-4 py-2.5 rounded-2xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-semibold text-xs border border-neutral-700 transition-colors"
            >
              <Columns className="w-3.5 h-3.5" />
              <span>{t("compare_add")}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Embedded Mini Groove Player */}
      <div className="bg-neutral-900/80 border border-neutral-800/90 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            <h2 className="font-bold text-white text-base sm:text-lg">
              {language === "zh" ? "8 轨合成律动试听" : "Interactive 8-Track Groove"}
            </h2>
            <span className="text-xs text-neutral-400">
              ({genre.sequencer_pattern.scale || "C minor"})
            </span>
          </div>

          <div className="flex items-center space-x-3">
            {/* Play / Pause */}
            <button
              onClick={handleTogglePlay}
              className={`flex items-center space-x-1.5 px-4 py-2 rounded-xl font-bold text-xs transition-colors shadow-lg ${
                isPlaying
                  ? "bg-amber-500 hover:bg-amber-400 text-black"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white"
              }`}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              <span>{isPlaying ? t("pause") : t("play")}</span>
            </button>

            <button
              onClick={handleStop}
              className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300"
              title={t("stop")}
            >
              <Square className="w-3.5 h-3.5 fill-current" />
            </button>

            {/* Tempo */}
            <div className="flex items-center space-x-1.5 bg-neutral-950 px-3 py-1.5 rounded-xl border border-neutral-800 text-xs font-mono text-neutral-300">
              <span className="text-neutral-500">BPM</span>
              <input
                type="number"
                min="40"
                max="240"
                value={bpm}
                onChange={(e) => handleBpmChange(Number(e.target.value))}
                className="w-12 bg-transparent text-white font-bold text-center focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* 8 Track Mini Matrix */}
        <div className="space-y-1.5 overflow-x-auto pb-1">
          {genre.sequencer_pattern.tracks.map((track, trackIdx) => {
            const colorClass = MINI_TRACK_COLORS[trackIdx % MINI_TRACK_COLORS.length];
            return (
              <div key={track.track_id} className="flex items-center space-x-2 min-w-[500px]">
                <div className="w-24 text-[11px] font-semibold text-neutral-400 truncate">
                  {track.name}
                </div>
                <div className="flex-1 grid grid-cols-16 gap-1">
                  {track.steps.map((stepVal, stepIdx) => {
                    const isActive = stepVal === 1;
                    const isPlayhead = isPlaying && currentStep === stepIdx;
                    return (
                      <div
                        key={stepIdx}
                        className={`h-5 rounded transition-all ${
                          isActive
                            ? `${colorClass} shadow-sm`
                            : stepIdx % 4 === 0
                            ? "bg-neutral-800/60"
                            : "bg-neutral-900/60"
                        } ${isPlayhead ? "ring-2 ring-white" : ""}`}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Production Guide & Dossier Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: History & Culture */}
        <div className="lg:col-span-2 space-y-6">
          {/* Cultural Context */}
          <div className="bg-neutral-900/80 border border-neutral-800 rounded-3xl p-6 shadow-xl space-y-3">
            <h3 className="font-bold text-white text-base flex items-center space-x-2">
              <Flame className="w-4 h-4 text-amber-400" />
              <span>{t("culture_background")}</span>
            </h3>
            <p className="text-sm text-neutral-300 leading-relaxed">
              {genre.cultural_context[language]}
            </p>
          </div>

          {/* Drum & Rhythm Architecture */}
          <div className="bg-neutral-900/80 border border-neutral-800 rounded-3xl p-6 shadow-xl space-y-4">
            <h3 className="font-bold text-white text-base flex items-center space-x-2">
              <Layers className="w-4 h-4 text-indigo-400" />
              <span>{t("drum_features")}</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 bg-neutral-950/70 rounded-2xl border border-neutral-800/70 space-y-1">
                <span className="font-bold text-neutral-400 uppercase tracking-wider text-[10px]">
                  {t("kick_placement")}
                </span>
                <p className="text-neutral-200 leading-relaxed">
                  {genre.drum_pattern.kick[language]}
                </p>
              </div>

              <div className="p-3.5 bg-neutral-950/70 rounded-2xl border border-neutral-800/70 space-y-1">
                <span className="font-bold text-neutral-400 uppercase tracking-wider text-[10px]">
                  {t("snare_placement")}
                </span>
                <p className="text-neutral-200 leading-relaxed">
                  {genre.drum_pattern.snare_clap[language]}
                </p>
              </div>

              <div className="p-3.5 bg-neutral-950/70 rounded-2xl border border-neutral-800/70 space-y-1">
                <span className="font-bold text-neutral-400 uppercase tracking-wider text-[10px]">
                  {t("hihat_pattern")}
                </span>
                <p className="text-neutral-200 leading-relaxed">
                  {genre.drum_pattern.hihats[language]}
                </p>
              </div>

              <div className="p-3.5 bg-neutral-950/70 rounded-2xl border border-neutral-800/70 space-y-1">
                <span className="font-bold text-neutral-400 uppercase tracking-wider text-[10px]">
                  {t("bass_design")}
                </span>
                <p className="text-neutral-200 leading-relaxed">
                  {genre.bass_pattern[language]}
                </p>
              </div>
            </div>
          </div>

          {/* Sound Design & Production Tips */}
          <div className="bg-neutral-900/80 border border-neutral-800 rounded-3xl p-6 shadow-xl space-y-3">
            <h3 className="font-bold text-white text-base flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-pink-400" />
              <span>{t("sound_design_tips")}</span>
            </h3>
            <p className="text-sm text-neutral-300 leading-relaxed">
              {genre.key_characteristics[language]}
            </p>

            {genre.common_chords.length > 0 && (
              <div className="pt-2">
                <span className="text-xs font-semibold text-neutral-400 block mb-1.5">
                  {t("harmonic_rules")}
                </span>
                <div className="flex flex-wrap gap-2">
                  {genre.common_chords.map((chord, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 rounded-xl bg-neutral-950 text-indigo-300 font-mono text-xs border border-neutral-800"
                    >
                      {chord}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Tracks & Family Tree */}
        <div className="space-y-6">
          {/* Milestone Tracks */}
          <div className="bg-neutral-900/80 border border-neutral-800 rounded-3xl p-6 shadow-xl space-y-4">
            <h3 className="font-bold text-white text-base flex items-center space-x-2">
              <Headphones className="w-4 h-4 text-sky-400" />
              <span>{t("representative_tracks")}</span>
            </h3>

            <div className="space-y-2.5">
              {genre.representative_tracks.map((track, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-2xl bg-neutral-950/70 border border-neutral-800/80 flex items-center justify-between hover:border-neutral-700 transition-colors"
                >
                  <div className="min-w-0 pr-2">
                    <h5 className="font-bold text-neutral-100 text-xs truncate">
                      {track.title}
                    </h5>
                    <p className="text-[11px] text-neutral-400 truncate mt-0.5">
                      {track.artist} • <span className="font-mono">{track.year}</span>
                    </p>
                  </div>

                  {track.link && (
                    <a
                      href={track.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-xl bg-neutral-900 hover:bg-indigo-600 text-neutral-400 hover:text-white transition-colors shrink-0"
                      title={t("listen_link")}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Genealogy & Related Connections */}
          <div className="bg-neutral-900/80 border border-neutral-800 rounded-3xl p-6 shadow-xl space-y-4">
            <h3 className="font-bold text-white text-base flex items-center space-x-2">
              <GitCommit className="w-4 h-4 text-purple-400" />
              <span>{t("related_genres")}</span>
            </h3>

            {/* Direct Ancestors */}
            {genre.parent_genres.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                  {t("parents")}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {genre.parent_genres.map((pg) => {
                    const match = GENRES_MAP[pg];
                    return (
                      <button
                        key={pg}
                        onClick={() => match && onSelectGenre(match)}
                        className="text-xs px-2.5 py-1 rounded-xl bg-neutral-950 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-800 transition-colors"
                      >
                        {match ? match.name : pg}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Subgenres */}
            {genre.subgenres.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                  {t("subgenres")}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {genre.subgenres.map((sg) => {
                    const match = GENRES_MAP[sg];
                    return (
                      <button
                        key={sg}
                        onClick={() => match && onSelectGenre(match)}
                        className="text-xs px-2.5 py-1 rounded-xl bg-neutral-950 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-800 transition-colors"
                      >
                        {match ? match.name : sg}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Related */}
            {genre.related_genres.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                  {t("related_genres")}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {genre.related_genres.map((rg) => {
                    const match = GENRES_MAP[rg];
                    return (
                      <button
                        key={rg}
                        onClick={() => match && onSelectGenre(match)}
                        className="text-xs px-2.5 py-1 rounded-xl bg-neutral-950 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-800 transition-colors"
                      >
                        {match ? match.name : rg}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
