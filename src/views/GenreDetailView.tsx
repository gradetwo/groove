import React, { useState, useEffect, useRef, useMemo } from "react";
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
  GitCommit, 
  Flame,
  Volume2,
  Radio,
  Activity
} from "lucide-react";
import { Genre, SequencerTrack } from "../types/genre";
import { GENRES_MAP } from "../data/genres";
import { AudioEngine } from "../audio/AudioEngine";
import { useLanguage } from "../i18n/LanguageContext";

interface GenreDetailViewProps {
  genre: Genre;
  onBack: () => void;
  onSelectGenre: (genre: Genre) => void;
  onOpenStudio: (genre: Genre) => void;
  onAddToCompare: (genre: Genre) => void;
}

const DRUM_TRACK_IDS = new Set(["kick", "snare", "hihat", "percussion"]);

const isDrumTrack = (track: SequencerTrack, index: number): boolean => {
  if (track.track_id && DRUM_TRACK_IDS.has(track.track_id)) return true;
  const id = `${track.track_id || ""} ${track.name || ""} ${track.instrument || ""}`.toLowerCase();
  const drumKeywords = ["kick", "snare", "clap", "hat", "hihat", "perc", "tom", "rim", "shaker", "cymbal", "ride", "crash", "conga", "bongo"];
  if (drumKeywords.some((k) => id.includes(k))) return true;
  const nonDrumKeywords = ["bass", "sub", "chord", "lead", "synth", "pad", "arp", "organ", "piano", "fx", "vocal"];
  if (nonDrumKeywords.some((k) => id.includes(k))) return false;
  return index < 4;
};

const applyAudioMutes = (engine: AudioEngine, mode: "drums" | "full", genre: Genre) => {
  const tracks = genre.sequencer_pattern?.tracks || [];
  tracks.forEach((track, idx) => {
    const isDrum = isDrumTrack(track, idx);
    const shouldMute = mode === "drums" ? !isDrum : false;
    engine.setTrackState(idx, { mute: shouldMute });
  });
};

// 4-Beat rich color themes for 16-step jumping dots
const BEAT_DOT_COLORS = [
  { active: "bg-amber-400 shadow-[0_0_10px_rgba(245,183,61,0.9)] ring-1 ring-amber-300", beatDot: "bg-amber-500/50" },  // Beat 1 (Amber / Gold)
  { active: "bg-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.9)] ring-1 ring-cyan-300", beatDot: "bg-cyan-500/50" },       // Beat 2 (Cyan / Aqua)
  { active: "bg-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.9)] ring-1 ring-rose-300", beatDot: "bg-rose-500/50" },       // Beat 3 (Rose / Coral)
  { active: "bg-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.9)] ring-1 ring-purple-300", beatDot: "bg-purple-500/50" }, // Beat 4 (Purple / Violet)
];

export const GenreDetailView: React.FC<GenreDetailViewProps> = ({
  genre,
  onBack,
  onSelectGenre,
  onOpenStudio,
  onAddToCompare,
}) => {
  const { t, language } = useLanguage();

  // Groove player state
  const [isPlaying, setIsPlaying] = useState(false);
  const [auditionMode, setAuditionMode] = useState<"drums" | "full">("full");
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
      engineRef.current = null;
    };
  }, [genre]);

  const handlePlayMode = (mode: "drums" | "full") => {
    if (!engineRef.current) return;

    // If clicking same mode while playing, stop
    if (isPlaying && auditionMode === mode) {
      engineRef.current.stop();
      setIsPlaying(false);
      return;
    }

    // If currently playing in the other mode, switch mutes in realtime without interruption
    if (isPlaying && auditionMode !== mode) {
      setAuditionMode(mode);
      applyAudioMutes(engineRef.current, mode, genre);
      return;
    }

    // Otherwise start playback in this mode
    setAuditionMode(mode);
    applyAudioMutes(engineRef.current, mode, genre);
    engineRef.current.play();
    setIsPlaying(true);
  };

  const handleStop = () => {
    if (!engineRef.current) return;
    engineRef.current.stop();
    setIsPlaying(false);
    setCurrentStep(0);
  };

  const handleBpmChange = (newBpm: number) => {
    const clamped = Math.max(40, Math.min(240, newBpm));
    setBpm(clamped);
    if (engineRef.current) {
      engineRef.current.setBpm(clamped);
    }
  };

  // Analyze step hits per instrument to drive colorful animation
  const stepInfo = useMemo(() => {
    const tracks = genre.sequencer_pattern?.tracks || [];
    const info = Array.from({ length: 16 }, () => ({
      hasKick: false,
      hasSnare: false,
      hasHihat: false,
      hasPerc: false,
      hasBass: false,
      totalHits: 0,
    }));

    tracks.forEach((track, idx) => {
      const isDrum = isDrumTrack(track, idx);
      const id = `${track.track_id || ""} ${track.name || ""}`.toLowerCase();
      const isKick = id.includes("kick");
      const isSnare = id.includes("snare") || id.includes("clap");
      const isHihat = id.includes("hat") || id.includes("hihat");
      const isPerc = isDrum && !isKick && !isSnare && !isHihat;
      const isBass = id.includes("bass") || id.includes("sub");

      const steps = track.steps || [];
      for (let s = 0; s < 16; s++) {
        const stepIdx = steps.length > 0 ? s % steps.length : s;
        if (steps[stepIdx] > 0) {
          info[s].totalHits += 1;
          if (isKick) info[s].hasKick = true;
          if (isSnare) info[s].hasSnare = true;
          if (isHihat) info[s].hasHihat = true;
          if (isPerc) info[s].hasPerc = true;
          if (isBass) info[s].hasBass = true;
        }
      }
    });

    return info;
  }, [genre]);

  const currentHits = stepInfo[currentStep] || {
    hasKick: false,
    hasSnare: false,
    hasHihat: false,
    hasPerc: false,
    hasBass: false,
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-6 space-y-8">
      {/* Back Button */}
      <button
        onClick={onBack}
        className="inline-flex items-center space-x-1.5 text-xs text-[#8b8f99] hover:text-[#e9e7e0] transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>{t("back")}</span>
      </button>

      {/* Hero Header Banner */}
      <div className="bg-[#121317] border border-[#23262d] rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        {/* Ambient background glow */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/10 blur-3xl rounded-full pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-indigo-600/30 text-[#f5b73d] border border-indigo-500/30">
                {genre.category}
              </span>
              {genre.aliases.map((alias) => (
                <span
                  key={alias}
                  className="text-xs px-2.5 py-1 rounded-full bg-neutral-800 text-[#b9b7b0] border border-[#393d46]"
                >
                  {alias}
                </span>
              ))}
            </div>

            <h1 className="text-3xl sm:text-5xl font-extrabold text-[#e9e7e0] tracking-tight">
              {genre.name}
            </h1>

            <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm text-[#b9b7b0] pt-1">
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
              className="flex-1 md:flex-initial flex items-center justify-center space-x-2 px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-[#e9e7e0] font-bold text-sm shadow-xl shadow-indigo-600/30 transition-all hover:scale-105"
            >
              <Sliders className="w-4 h-4" />
              <span>{t("open_in_studio")}</span>
            </button>

            <button
              onClick={() => onAddToCompare(genre)}
              className="flex-1 md:flex-initial flex items-center justify-center space-x-2 px-4 py-2.5 rounded-2xl bg-neutral-800 hover:bg-neutral-700 text-[#e9e7e0] font-semibold text-xs border border-[#393d46] transition-colors"
            >
              <Columns className="w-3.5 h-3.5" />
              <span>{t("compare_add")}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Groove Audition Bar: Dual Mode (Full Band & Drums Only) with Rich Colorful Spectrum */}
      <div className="bg-[#121317] border border-[#23262d] rounded-3xl p-6 sm:p-7 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <Sparkles className="w-5 h-5 text-[#f5b73d]" />
              <h2 className="font-bold text-[#e9e7e0] text-lg sm:text-xl tracking-wide">
                {language === "zh" ? "曲风律动即时试听" : "Genre Groove Audition"}
              </h2>
              <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-[#f5b73d]/15 text-[#f5b73d] border border-[#f5b73d]/30">
                {genre.sequencer_pattern?.scale || "C Minor"}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-[#8b8f99] mt-1">
              {language === "zh" 
                ? "支持直接试听完整编曲或单独试听纯鼓组节奏" 
                : "Listen to the complete synthetic arrangement or isolate the drum groove"}
            </p>
          </div>

          {/* Tempo Controls & Stop */}
          <div className="flex items-center space-x-3 self-start sm:self-auto">
            <div className="flex items-center space-x-2 bg-[#0d0e12] px-3.5 py-2 rounded-2xl border border-[#23262d] text-xs font-mono text-[#b9b7b0]">
              <span className="text-[#5a5e68] font-bold">BPM</span>
              <button
                onClick={() => handleBpmChange(bpm - 2)}
                className="w-5 h-5 rounded bg-[#181a20] hover:bg-[#252834] text-[#e9e7e0] font-bold flex items-center justify-center transition-colors"
                title="Decrease BPM"
              >
                -
              </button>
              <input
                type="number"
                min="40"
                max="240"
                value={bpm}
                onChange={(e) => handleBpmChange(Number(e.target.value))}
                className="w-12 bg-transparent text-[#e9e7e0] font-bold text-center focus:outline-none"
              />
              <button
                onClick={() => handleBpmChange(bpm + 2)}
                className="w-5 h-5 rounded bg-[#181a20] hover:bg-[#252834] text-[#e9e7e0] font-bold flex items-center justify-center transition-colors"
                title="Increase BPM"
              >
                +
              </button>
            </div>

            {isPlaying && (
              <button
                onClick={handleStop}
                className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 font-bold text-xs transition-colors border border-red-500/30"
                title={t("stop")}
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>{t("stop")}</span>
              </button>
            )}
          </div>
        </div>

        {/* Dual Audition Action Buttons: Full Band & Drums Only */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          {/* Full Band Audition Button */}
          <button
            onClick={() => handlePlayMode("full")}
            className={`flex items-center justify-center space-x-2.5 py-3.5 px-5 rounded-2xl font-bold text-sm transition-all shadow-md ${
              isPlaying && auditionMode === "full"
                ? "bg-[#f5b73d] text-black shadow-[0_0_20px_rgba(245,183,61,0.4)] ring-2 ring-amber-400/50"
                : "bg-[#161820] hover:bg-[#20232c] text-[#e9e7e0] border border-[#2b2e38] hover:border-[#f5b73d]/50"
            }`}
          >
            {isPlaying && auditionMode === "full" ? (
              <>
                <Square className="w-4 h-4 fill-current" />
                <span>{language === "zh" ? "停止全部音轨" : "Stop Full Tracks"}</span>
                <div className="flex items-end gap-0.5 h-3.5 ml-1.5">
                  <span className="w-1 h-3.5 bg-black rounded-full animate-pulse" />
                  <span className="w-1 h-2 bg-black rounded-full animate-ping" />
                  <span className="w-1 h-3.5 bg-black rounded-full animate-pulse" />
                </div>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current text-[#f5b73d]" />
                <span>{language === "zh" ? "试听全部音轨 (完整编曲)" : "Audition Full Tracks"}</span>
              </>
            )}
          </button>

          {/* Drums Only Audition Button */}
          <button
            onClick={() => handlePlayMode("drums")}
            className={`flex items-center justify-center space-x-2.5 py-3.5 px-5 rounded-2xl font-bold text-sm transition-all shadow-md ${
              isPlaying && auditionMode === "drums"
                ? "bg-[#f5b73d] text-black shadow-[0_0_20px_rgba(245,183,61,0.4)] ring-2 ring-amber-400/50"
                : "bg-[#161820] hover:bg-[#20232c] text-[#e9e7e0] border border-[#2b2e38] hover:border-[#f5b73d]/50"
            }`}
          >
            {isPlaying && auditionMode === "drums" ? (
              <>
                <Square className="w-4 h-4 fill-current" />
                <span>{language === "zh" ? "停止鼓组试听" : "Stop Drums"}</span>
                <div className="flex items-end gap-0.5 h-3.5 ml-1.5">
                  <span className="w-1 h-3.5 bg-black rounded-full animate-pulse" />
                  <span className="w-1 h-2 bg-black rounded-full animate-ping" />
                  <span className="w-1 h-3.5 bg-black rounded-full animate-pulse" />
                </div>
              </>
            ) : (
              <>
                <Disc3 className="w-4 h-4 text-[#f5b73d]" />
                <span>{language === "zh" ? "只试听鼓组 (纯节奏骨架)" : "Audition Drums Only"}</span>
              </>
            )}
          </button>
        </div>

        {/* Dynamic Multi-color Beat Spectrum & Status Console (No blank space, rich color transitions) */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#0c0d11] border border-[#23262d] space-y-3.5">
          {/* Status Bar & Active Channels Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-2.5">
              <span className={`w-2.5 h-2.5 rounded-full ${isPlaying ? "bg-[#f5b73d] shadow-[0_0_10px_#f5b73d] animate-pulse" : "bg-neutral-700"}`} />
              <span className="font-bold text-sm text-[#f0ede6]">
                {isPlaying 
                  ? (auditionMode === "drums" 
                      ? (language === "zh" ? "正在试听纯鼓组节奏 (底鼓 / 军鼓 / 踩镲 / 打击乐)" : "Auditioning Drums Only (Kick / Snare / Hats / Perc)") 
                      : (language === "zh" ? "正在试听全部音轨 (完整底鼓、低音与合成器)" : "Auditioning Full Arrangement (Drums, Bass & Synths)"))
                  : (language === "zh" ? "准备就绪 · 点击上方按钮即时播放" : "Ready · Click button above to audition")}
              </span>
            </div>

            {/* Beat Readout & Measure Counter with Colorful Jumping Dots */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 font-mono">
              <span className="px-2.5 py-1 rounded-lg bg-[#14161e] border border-[#282c38] text-xs font-bold text-[#f5b73d]">
                BEAT {Math.floor(currentStep / 4) + 1} / 4
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-[#14161e] border border-[#282c38] text-xs font-bold text-[#06b6d4]">
                STEP {currentStep + 1} / 16
              </span>

              {/* 16-Step Animated Jumping Dots with 4-Beat Color Palette */}
              <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#07080a] border border-[#1b1e26] h-[28px]">
                {Array.from({ length: 16 }).map((_, stepIdx) => {
                  const isActive = isPlaying && currentStep === stepIdx;
                  const isBeatStart = stepIdx % 4 === 0;
                  const beatIdx = Math.floor(stepIdx / 4);
                  const theme = BEAT_DOT_COLORS[beatIdx];

                  return (
                    <div
                      key={stepIdx}
                      className={`transition-all duration-75 ${
                        stepIdx % 4 === 3 && stepIdx !== 15 ? "mr-1.5" : ""
                      } ${
                        isActive
                          ? `w-3 h-2 rounded-full -translate-y-0.5 scale-110 ${theme.active}`
                          : isBeatStart
                          ? `w-2 h-2 rounded-full ${theme.beatDot}`
                          : "w-1.5 h-1.5 rounded-full bg-[#1b1e26]"
                      }`}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          {/* Active Instrument Trigger Badges Footer */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-[#181a22] text-[11px]">
            <span className="text-[#686d7c] font-semibold tracking-wider uppercase font-mono text-[10px]">
              CHANNELS:
            </span>
            <div className="flex flex-wrap items-center gap-2 font-mono">
              <span className={`px-2 py-0.5 rounded-md border transition-all ${
                isPlaying && currentHits.hasKick 
                  ? "bg-amber-500/25 border-amber-400 text-amber-300 shadow-[0_0_8px_rgba(245,183,61,0.5)] font-bold scale-105" 
                  : "bg-[#12141a] border-[#222632] text-[#6b7280]"
              }`}>
                KICK
              </span>
              <span className={`px-2 py-0.5 rounded-md border transition-all ${
                isPlaying && currentHits.hasSnare 
                  ? "bg-cyan-500/25 border-cyan-400 text-cyan-300 shadow-[0_0_8px_rgba(6,182,212,0.5)] font-bold scale-105" 
                  : "bg-[#12141a] border-[#222632] text-[#6b7280]"
              }`}>
                SNARE
              </span>
              <span className={`px-2 py-0.5 rounded-md border transition-all ${
                isPlaying && currentHits.hasHihat 
                  ? "bg-yellow-500/25 border-yellow-400 text-yellow-300 shadow-[0_0_8px_rgba(234,179,8,0.5)] font-bold scale-105" 
                  : "bg-[#12141a] border-[#222632] text-[#6b7280]"
              }`}>
                HI-HAT
              </span>
              <span className={`px-2 py-0.5 rounded-md border transition-all ${
                isPlaying && currentHits.hasPerc 
                  ? "bg-emerald-500/25 border-emerald-400 text-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.5)] font-bold scale-105" 
                  : "bg-[#12141a] border-[#222632] text-[#6b7280]"
              }`}>
                PERC
              </span>
              {auditionMode === "full" && (
                <span className={`px-2 py-0.5 rounded-md border transition-all ${
                  isPlaying && currentHits.hasBass 
                    ? "bg-purple-500/25 border-purple-400 text-purple-300 shadow-[0_0_8px_rgba(168,85,247,0.5)] font-bold scale-105" 
                    : "bg-[#12141a] border-[#222632] text-[#6b7280]"
                }`}>
                  BASS
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Production Guide & Dossier Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: History & Culture */}
        <div className="lg:col-span-2 space-y-6">
          {/* Cultural Context */}
          <div className="bg-[#121317] border border-[#23262d] rounded-3xl p-6 shadow-xl space-y-3">
            <h3 className="font-bold text-[#e9e7e0] text-base flex items-center space-x-2">
              <Flame className="w-4 h-4 text-amber-400" />
              <span>{t("culture_background")}</span>
            </h3>
            <p className="text-sm text-[#b9b7b0] leading-relaxed">
              {genre.cultural_context[language]}
            </p>
          </div>

          {/* Drum & Rhythm Architecture */}
          <div className="bg-[#121317] border border-[#23262d] rounded-3xl p-6 shadow-xl space-y-4">
            <h3 className="font-bold text-[#e9e7e0] text-base flex items-center space-x-2">
              <Layers className="w-4 h-4 text-[#f5b73d]" />
              <span>{t("drum_features")}</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 bg-[#0d0e12]/70 rounded-2xl border border-[#23262d]/70 space-y-1">
                <span className="font-bold text-[#8b8f99] uppercase tracking-wider text-[10px]">
                  {t("kick_placement")}
                </span>
                <p className="text-[#e9e7e0] leading-relaxed">
                  {genre.drum_pattern.kick[language]}
                </p>
              </div>

              <div className="p-3.5 bg-[#0d0e12]/70 rounded-2xl border border-[#23262d]/70 space-y-1">
                <span className="font-bold text-[#8b8f99] uppercase tracking-wider text-[10px]">
                  {t("snare_placement")}
                </span>
                <p className="text-[#e9e7e0] leading-relaxed">
                  {genre.drum_pattern.snare_clap[language]}
                </p>
              </div>

              <div className="p-3.5 bg-[#0d0e12]/70 rounded-2xl border border-[#23262d]/70 space-y-1">
                <span className="font-bold text-[#8b8f99] uppercase tracking-wider text-[10px]">
                  {t("hihat_pattern")}
                </span>
                <p className="text-[#e9e7e0] leading-relaxed">
                  {genre.drum_pattern.hihats[language]}
                </p>
              </div>

              <div className="p-3.5 bg-[#0d0e12]/70 rounded-2xl border border-[#23262d]/70 space-y-1">
                <span className="font-bold text-[#8b8f99] uppercase tracking-wider text-[10px]">
                  {t("bass_design")}
                </span>
                <p className="text-[#e9e7e0] leading-relaxed">
                  {genre.bass_pattern[language]}
                </p>
              </div>
            </div>
          </div>

          {/* Sound Design & Production Tips */}
          <div className="bg-[#121317] border border-[#23262d] rounded-3xl p-6 shadow-xl space-y-3">
            <h3 className="font-bold text-[#e9e7e0] text-base flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-pink-400" />
              <span>{t("sound_design_tips")}</span>
            </h3>
            <p className="text-sm text-[#b9b7b0] leading-relaxed">
              {genre.key_characteristics[language]}
            </p>

            {genre.common_chords.length > 0 && (
              <div className="pt-2">
                <span className="text-xs font-semibold text-[#8b8f99] block mb-1.5">
                  {t("harmonic_rules")}
                </span>
                <div className="flex flex-wrap gap-2">
                  {genre.common_chords.map((chord, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 rounded-xl bg-[#0d0e12] text-indigo-300 font-mono text-xs border border-[#23262d]"
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
          <div className="bg-[#121317] border border-[#23262d] rounded-3xl p-6 shadow-xl space-y-4">
            <h3 className="font-bold text-[#e9e7e0] text-base flex items-center space-x-2">
              <Headphones className="w-4 h-4 text-sky-400" />
              <span>{t("representative_tracks")}</span>
            </h3>

            <div className="space-y-2.5">
              {genre.representative_tracks.map((track, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-2xl bg-[#0d0e12] border border-[#1a1c21] flex items-center justify-between hover:border-[#393d46] transition-colors"
                >
                  <div className="min-w-0 pr-2">
                    <h5 className="font-bold text-[#e9e7e0] text-xs truncate">
                      {track.title}
                    </h5>
                    <p className="text-[11px] text-[#8b8f99] truncate mt-0.5">
                      {track.artist} • <span className="font-mono">{track.year}</span>
                    </p>
                  </div>

                  {track.link && (
                    <a
                      href={track.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-xl bg-[#121317] hover:bg-indigo-600 text-[#8b8f99] hover:text-[#e9e7e0] transition-colors shrink-0"
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
          <div className="bg-[#121317] border border-[#23262d] rounded-3xl p-6 shadow-xl space-y-4">
            <h3 className="font-bold text-[#e9e7e0] text-base flex items-center space-x-2">
              <GitCommit className="w-4 h-4 text-purple-400" />
              <span>{t("related_genres")}</span>
            </h3>

            {/* Direct Ancestors */}
            {genre.parent_genres.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-[#5a5e68] uppercase tracking-wider">
                  {t("parents")}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {genre.parent_genres.map((pg) => {
                    const match = GENRES_MAP[pg];
                    return (
                      <button
                        key={pg}
                        onClick={() => match && onSelectGenre(match)}
                        className="text-xs px-2.5 py-1 rounded-xl bg-[#0d0e12] hover:bg-neutral-800 text-[#b9b7b0] hover:text-[#e9e7e0] border border-[#23262d] transition-colors"
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
                <span className="text-[10px] font-bold text-[#5a5e68] uppercase tracking-wider">
                  {t("subgenres")}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {genre.subgenres.map((sg) => {
                    const match = GENRES_MAP[sg];
                    return (
                      <button
                        key={sg}
                        onClick={() => match && onSelectGenre(match)}
                        className="text-xs px-2.5 py-1 rounded-xl bg-[#0d0e12] hover:bg-neutral-800 text-[#b9b7b0] hover:text-[#e9e7e0] border border-[#23262d] transition-colors"
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
                <span className="text-[10px] font-bold text-[#5a5e68] uppercase tracking-wider">
                  {t("related_genres")}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {genre.related_genres.map((rg) => {
                    const match = GENRES_MAP[rg];
                    return (
                      <button
                        key={rg}
                        onClick={() => match && onSelectGenre(match)}
                        className="text-xs px-2.5 py-1 rounded-xl bg-[#0d0e12] hover:bg-neutral-800 text-[#b9b7b0] hover:text-[#e9e7e0] border border-[#23262d] transition-colors"
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
