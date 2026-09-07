import React, { useState, useEffect, useRef, useCallback } from "react";
import { 
  Play, 
  Pause, 
  Square, 
  RotateCcw, 
  Trash2, 
  Download, 
  Share2, 
  Volume2, 
  VolumeX, 
  Headphones, 
  Activity, 
  Sparkles, 
  Info, 
  Check, 
  SlidersHorizontal,
  ChevronDown,
  Layers,
  ArrowRight
} from "lucide-react";
import { Genre, SequencerPattern, SequencerTrack } from "../types/genre";
import { ALL_GENRES, GENRES_MAP } from "../data/genres";
import { AudioEngine } from "../audio/AudioEngine";
import { downloadMidiFile } from "../audio/MidiExporter";
import { encodeSharedSequencer, decodeSharedSequencer, getShareUrl, SharedSequencerState } from "../audio/SequencerUrlShare";
import { useLanguage } from "../i18n/LanguageContext";

const TRACK_COLORS = [
  { bg: "bg-red-500", border: "border-red-500", text: "text-red-400", glow: "shadow-red-500/50", lightBg: "bg-red-500/10" },
  { bg: "bg-amber-500", border: "border-amber-500", text: "text-amber-400", glow: "shadow-amber-500/50", lightBg: "bg-amber-500/10" },
  { bg: "bg-cyan-500", border: "border-cyan-500", text: "text-cyan-400", glow: "shadow-cyan-500/50", lightBg: "bg-cyan-500/10" },
  { bg: "bg-emerald-500", border: "border-emerald-500", text: "text-emerald-400", glow: "shadow-emerald-500/50", lightBg: "bg-emerald-500/10" },
  { bg: "bg-purple-500", border: "border-purple-500", text: "text-purple-400", glow: "shadow-purple-500/50", lightBg: "bg-purple-500/10" },
  { bg: "bg-pink-500", border: "border-pink-500", text: "text-pink-400", glow: "shadow-pink-500/50", lightBg: "bg-pink-500/10" },
  { bg: "bg-yellow-500", border: "border-yellow-500", text: "text-yellow-400", glow: "shadow-yellow-500/50", lightBg: "bg-yellow-500/10" },
  { bg: "bg-blue-500", border: "border-blue-500", text: "text-blue-400", glow: "shadow-blue-500/50", lightBg: "bg-blue-500/10" },
];

interface StudioViewProps {
  selectedGenre?: Genre;
  onSelectGenre: (genre: Genre) => void;
  onViewDetail: (genre: Genre) => void;
}

export const StudioView: React.FC<StudioViewProps> = ({
  selectedGenre: initialGenre,
  onSelectGenre,
  onViewDetail,
}) => {
  const { t, language } = useLanguage();

  // Current selected genre
  const [currentGenre, setCurrentGenre] = useState<Genre>(() => {
    if (initialGenre) return initialGenre;
    return GENRES_MAP["chicago-house"] || ALL_GENRES[0];
  });

  // Sequencer playback state
  const [pattern, setPattern] = useState<SequencerPattern>(() => {
    return JSON.parse(JSON.stringify(currentGenre.sequencer_pattern));
  });

  const [bpm, setBpm] = useState<number>(() => currentGenre.default_bpm || 124);
  const [swing, setSwing] = useState<number>(() => (currentGenre.sequencer_pattern.swing || 0) / 100);
  const [masterVolume, setMasterVolume] = useState<number>(0.8);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [isEditMode, setIsEditMode] = useState<boolean>(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Tap tempo state
  const tapTimesRef = useRef<number[]>([]);

  // Drag-to-toggle state
  const isPointerDownRef = useRef<boolean>(false);
  const pointerModeRef = useRef<number | null>(null); // 1 = activate, 0 = deactivate

  // AudioEngine ref
  const engineRef = useRef<AudioEngine | null>(null);

  // Initialize AudioEngine
  useEffect(() => {
    const engine = new AudioEngine({
      onStep: ({ step }) => {
        setCurrentStep(step);
      },
      onStop: () => {
        setCurrentStep(0);
        setIsPlaying(false);
      },
    });
    engineRef.current = engine;
    engine.setPattern(pattern);
    engine.setBpm(bpm);
    engine.setSwing(swing);
    engine.setMasterVolume(masterVolume);

    return () => {
      engine.destroy();
    };
  }, []);

  // Listen to external selectedGenre changes
  useEffect(() => {
    if (initialGenre && initialGenre.id !== currentGenre.id) {
      loadGenre(initialGenre);
    }
  }, [initialGenre]);

  // Check URL query parameters for shared groove or genre
  useEffect(() => {
    if (typeof window === "undefined") return;
    const urlParams = new URLSearchParams(window.location.search);
    const sharedCode = urlParams.get("groove");
    const genreParam = urlParams.get("genre");

    if (sharedCode) {
      const decoded = decodeSharedSequencer(sharedCode);
      if (decoded) {
        const found = GENRES_MAP[decoded.genreId] || currentGenre;
        setCurrentGenre(found);
        setBpm(decoded.bpm);
        setSwing(decoded.swing / 100);
        const newPattern: SequencerPattern = {
          genre_id: decoded.genreId,
          bpm: decoded.bpm,
          scale: decoded.scale || "C minor",
          swing: decoded.swing,
          tracks: decoded.tracks.map((t) => ({
            track_id: t.track_id as any,
            name: t.name,
            instrument: t.instrument,
            steps: t.steps,
            velocity: t.velocity,
            pitch: t.pitch,
            mute: t.mute,
            solo: t.solo,
            volume: t.volume,
          })),
        };
        setPattern(newPattern);
        if (engineRef.current) {
          engineRef.current.setPattern(newPattern);
          engineRef.current.setBpm(decoded.bpm);
          engineRef.current.setSwing(decoded.swing / 100);
        }
        showToast(t("share_groove") + " (Loaded from URL)");
      }
    } else if (genreParam && GENRES_MAP[genreParam]) {
      loadGenre(GENRES_MAP[genreParam]);
    }
  }, []);

  // Sync engine when pattern/bpm/swing changes
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setPattern(pattern);
    }
  }, [pattern]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setBpm(bpm);
    }
  }, [bpm]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setSwing(swing);
    }
  }, [swing]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setMasterVolume(masterVolume);
    }
  }, [masterVolume]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const loadGenre = (genre: Genre) => {
    setCurrentGenre(genre);
    onSelectGenre(genre);
    const newBpm = genre.default_bpm || 120;
    const newSwing = (genre.sequencer_pattern.swing || 0) / 100;
    const newPattern = JSON.parse(JSON.stringify(genre.sequencer_pattern));

    setBpm(newBpm);
    setSwing(newSwing);
    setPattern(newPattern);

    if (engineRef.current) {
      engineRef.current.setPattern(newPattern);
      engineRef.current.setBpm(newBpm);
      engineRef.current.setSwing(newSwing);
    }
  };

  const handlePlayPause = () => {
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

  // Tap tempo
  const handleTapTempo = () => {
    const now = performance.now();
    const times = tapTimesRef.current;
    if (times.length > 0 && now - times[times.length - 1] > 2000) {
      tapTimesRef.current = [now];
      return;
    }
    times.push(now);
    if (times.length > 5) times.shift();

    if (times.length >= 2) {
      const intervals = [];
      for (let i = 1; i < times.length; i++) {
        intervals.push(times[i] - times[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const calculatedBpm = Math.round(60000 / avgInterval);
      if (calculatedBpm >= 40 && calculatedBpm <= 240) {
        setBpm(calculatedBpm);
      }
    }
  };

  // Keyboard shortcut Space to Play/Pause
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        handlePlayPause();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying]);

  // Step toggle
  const toggleStep = (trackIdx: number, stepIdx: number) => {
    if (!isEditMode) return;
    setPattern((prev) => {
      const copy = JSON.parse(JSON.stringify(prev));
      const currentVal = copy.tracks[trackIdx].steps[stepIdx];
      const newVal = currentVal === 1 ? 0 : 1;
      copy.tracks[trackIdx].steps[stepIdx] = newVal;
      return copy;
    });

    // Audition sound if activated
    if (!isPlaying && engineRef.current) {
      const track = pattern.tracks[trackIdx];
      engineRef.current.triggerNote(trackIdx, track.name);
    }
  };

  // Track Mute toggle
  const toggleMute = (trackIdx: number) => {
    setPattern((prev) => {
      const copy = JSON.parse(JSON.stringify(prev));
      copy.tracks[trackIdx].mute = !copy.tracks[trackIdx].mute;
      if (engineRef.current) {
        engineRef.current.setTrackState(trackIdx, { mute: copy.tracks[trackIdx].mute });
      }
      return copy;
    });
  };

  // Track Solo toggle
  const toggleSolo = (trackIdx: number) => {
    setPattern((prev) => {
      const copy = JSON.parse(JSON.stringify(prev));
      copy.tracks[trackIdx].solo = !copy.tracks[trackIdx].solo;
      if (engineRef.current) {
        engineRef.current.setTrackState(trackIdx, { solo: copy.tracks[trackIdx].solo });
      }
      return copy;
    });
  };

  // Preview Note
  const previewTrack = (trackIdx: number) => {
    if (engineRef.current) {
      engineRef.current.triggerNote(trackIdx, pattern.tracks[trackIdx].name);
    }
  };

  // Clear all steps
  const handleClear = () => {
    setPattern((prev) => {
      const copy = JSON.parse(JSON.stringify(prev));
      copy.tracks.forEach((t: SequencerTrack) => {
        t.steps = Array(16).fill(0);
      });
      return copy;
    });
    showToast(t("clear_pattern"));
  };

  // Reset to original genre preset
  const handleReset = () => {
    const fresh = JSON.parse(JSON.stringify(currentGenre.sequencer_pattern));
    setPattern(fresh);
    setBpm(currentGenre.default_bpm || 120);
    setSwing((currentGenre.sequencer_pattern.swing || 0) / 100);
    showToast(t("reset_pattern"));
  };

  // Export MIDI
  const handleExportMidi = () => {
    downloadMidiFile(
      {
        bpm,
        pattern,
        genreName: currentGenre.name,
      },
      `${currentGenre.name.toLowerCase().replace(/\s+/g, "_")}_groove`
    );
    showToast(t("export_midi") + " (.mid)");
  };

  // Share groove URL
  const handleShare = () => {
    const shareState: SharedSequencerState = {
      genreId: currentGenre.id,
      bpm,
      swing: Math.round(swing * 100),
      scale: pattern.scale,
      tracks: pattern.tracks.map((t) => ({
        track_id: t.track_id,
        name: t.name,
        instrument: t.instrument,
        steps: [...t.steps],
        velocity: t.velocity,
        pitch: t.pitch,
        mute: t.mute,
        solo: t.solo,
        volume: t.volume,
      })),
    };
    const url = getShareUrl(shareState);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        showToast(t("share_copied"));
      });
    } else {
      showToast("URL: " + url);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-2 sm:px-4 py-4 space-y-5">
      {/* Toast alert */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-neutral-900 border border-indigo-500/50 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center space-x-2 animate-slide-up">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}

      {/* Top Controls Bar */}
      <div className="bg-neutral-900/90 border border-neutral-800/90 rounded-2xl p-3 sm:p-4 shadow-xl flex flex-wrap items-center justify-between gap-3">
        {/* Genre Selector & Preset Switch */}
        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <select
              value={currentGenre.id}
              onChange={(e) => {
                const found = GENRES_MAP[e.target.value];
                if (found) loadGenre(found);
              }}
              className="w-full appearance-none bg-neutral-950 border border-neutral-700/80 text-white font-medium text-sm rounded-xl pl-3.5 pr-8 py-2.5 focus:outline-none focus:border-indigo-500"
            >
              {ALL_GENRES.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} {language === "zh" && g.aliases[0] ? `(${g.aliases[0]})` : ""}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-neutral-400 absolute right-3 top-3.5 pointer-events-none" />
          </div>

          <button
            onClick={() => onViewDetail(currentGenre)}
            className="p-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white border border-neutral-700/60 transition-colors text-xs flex items-center space-x-1 shrink-0"
            title={t("view_detail")}
          >
            <Info className="w-4 h-4 text-indigo-400" />
            <span className="hidden md:inline">{t("view_detail")}</span>
          </button>
        </div>

        {/* Transport Controls */}
        <div className="flex items-center space-x-2">
          <button
            onClick={handlePlayPause}
            className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-lg ${
              isPlaying
                ? "bg-amber-500 hover:bg-amber-400 text-black shadow-amber-500/25"
                : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30"
            }`}
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
            <span>{isPlaying ? t("pause") : t("play")}</span>
          </button>

          <button
            onClick={handleStop}
            className="p-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white border border-neutral-700/60 transition-colors"
            title={t("stop")}
          >
            <Square className="w-4 h-4 fill-current" />
          </button>
        </div>

        {/* BPM & Swing Controls */}
        <div className="flex items-center space-x-4 flex-wrap">
          {/* BPM */}
          <div className="flex items-center space-x-2 bg-neutral-950 px-3 py-1.5 rounded-xl border border-neutral-800">
            <span className="text-xs font-semibold text-neutral-400">{t("bpm")}</span>
            <input
              type="number"
              min="40"
              max="240"
              value={bpm}
              onChange={(e) => setBpm(Number(e.target.value))}
              className="w-14 bg-transparent text-white font-mono font-bold text-center text-sm focus:outline-none"
            />
            <button
              onClick={handleTapTempo}
              className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-indigo-400 hover:bg-indigo-600 hover:text-white font-bold transition-colors"
              title="Tap Tempo"
            >
              TAP
            </button>
          </div>

          {/* Swing */}
          <div className="flex items-center space-x-2 bg-neutral-950 px-3 py-1.5 rounded-xl border border-neutral-800">
            <span className="text-xs font-semibold text-neutral-400">{t("swing")}</span>
            <input
              type="range"
              min="0"
              max="75"
              value={Math.round(swing * 100)}
              onChange={(e) => setSwing(Number(e.target.value) / 100)}
              className="w-16 sm:w-20 accent-indigo-500 cursor-pointer"
            />
            <span className="text-xs font-mono text-neutral-300 w-8 text-right">
              {Math.round(swing * 100)}%
            </span>
          </div>

          {/* Master Volume */}
          <div className="hidden lg:flex items-center space-x-2 bg-neutral-950 px-3 py-1.5 rounded-xl border border-neutral-800">
            <Volume2 className="w-4 h-4 text-neutral-400" />
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(masterVolume * 100)}
              onChange={(e) => setMasterVolume(Number(e.target.value) / 100)}
              className="w-16 accent-indigo-500 cursor-pointer"
            />
          </div>
        </div>

        {/* Action Buttons: Export MIDI, Share, Reset, Clear */}
        <div className="flex items-center space-x-1.5">
          <button
            onClick={() => setIsEditMode(!isEditMode)}
            className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
              isEditMode
                ? "bg-indigo-600/30 text-indigo-300 border-indigo-500/50"
                : "bg-neutral-800 text-neutral-400 border-neutral-700"
            }`}
            title={isEditMode ? t("mode_edit") : t("mode_demo")}
          >
            {isEditMode ? t("mode_edit") : t("mode_demo")}
          </button>

          <button
            onClick={handleReset}
            className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white border border-neutral-700/60 transition-colors"
            title={t("reset_pattern")}
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={handleClear}
            className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-rose-400 border border-neutral-700/60 transition-colors"
            title={t("clear_pattern")}
          >
            <Trash2 className="w-4 h-4" />
          </button>

          <button
            onClick={handleExportMidi}
            className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-indigo-400 border border-neutral-700/60 transition-colors"
            title={t("export_midi")}
          >
            <Download className="w-4 h-4" />
          </button>

          <button
            onClick={handleShare}
            className="p-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 transition-colors"
            title={t("share_groove")}
          >
            <Share2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Sequencer Grid Matrix */}
      <div className="bg-neutral-900/90 border border-neutral-800/90 rounded-2xl p-3 sm:p-4 shadow-2xl overflow-x-auto">
        {/* Step Numbers & Playhead Bar */}
        <div className="flex items-center mb-2 min-w-[700px]">
          <div className="w-36 sm:w-44 shrink-0 text-xs font-semibold text-neutral-500 uppercase tracking-wider pl-2">
            Tracks ({pattern.tracks.length})
          </div>
          <div className="flex-1 grid grid-cols-16 gap-1">
            {Array.from({ length: 16 }).map((_, stepIdx) => {
              const isPlayhead = isPlaying && currentStep === stepIdx;
              const isBeatStart = stepIdx % 4 === 0;
              return (
                <div
                  key={stepIdx}
                  className={`text-center py-1 text-[11px] font-mono rounded transition-all duration-75 ${
                    isPlayhead
                      ? "bg-indigo-500 text-white font-bold shadow-lg shadow-indigo-500/50 scale-105"
                      : isBeatStart
                      ? "text-neutral-300 font-bold bg-neutral-800/50"
                      : "text-neutral-500"
                  }`}
                >
                  {stepIdx + 1}
                </div>
              );
            })}
          </div>
        </div>

        {/* 8 Instrument Tracks */}
        <div className="space-y-1.5 min-w-[700px]">
          {pattern.tracks.map((track, trackIdx) => {
            const color = TRACK_COLORS[trackIdx % TRACK_COLORS.length];
            const isMuted = track.mute;
            const isSolo = track.solo;

            return (
              <div
                key={track.track_id}
                className={`flex items-center p-1 rounded-xl transition-colors ${
                  isMuted ? "opacity-40 bg-neutral-950/40" : "bg-neutral-950/70 hover:bg-neutral-950"
                } border border-neutral-800/60`}
              >
                {/* Track Header & Controls */}
                <div className="w-36 sm:w-44 shrink-0 flex items-center justify-between pr-2 pl-1">
                  <div className="flex items-center space-x-1.5 min-w-0">
                    {/* Track Color Dot & Preview */}
                    <button
                      onClick={() => previewTrack(trackIdx)}
                      className={`w-5 h-5 rounded-full ${color.bg} flex items-center justify-center text-neutral-950 hover:scale-110 active:scale-95 transition-transform shadow-md shrink-0`}
                      title="Preview Sound"
                    >
                      <Volume2 className="w-3 h-3" />
                    </button>
                    <span className="text-xs font-semibold text-neutral-200 truncate" title={track.name}>
                      {track.name}
                    </span>
                  </div>

                  {/* Solo & Mute */}
                  <div className="flex items-center space-x-1 shrink-0 ml-1">
                    <button
                      onClick={() => toggleSolo(trackIdx)}
                      className={`w-5 h-5 rounded text-[10px] font-bold border transition-colors ${
                        isSolo
                          ? "bg-amber-500 text-black border-amber-400"
                          : "bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-white"
                      }`}
                      title={t("solo")}
                    >
                      S
                    </button>
                    <button
                      onClick={() => toggleMute(trackIdx)}
                      className={`w-5 h-5 rounded text-[10px] font-bold border transition-colors ${
                        isMuted
                          ? "bg-rose-600 text-white border-rose-500"
                          : "bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-white"
                      }`}
                      title={t("mute")}
                    >
                      M
                    </button>
                  </div>
                </div>

                {/* 16 Step Buttons */}
                <div className="flex-1 grid grid-cols-16 gap-1">
                  {track.steps.map((stepVal, stepIdx) => {
                    const isActive = stepVal === 1;
                    const isPlayhead = isPlaying && currentStep === stepIdx;
                    const isBeatFirst = stepIdx % 4 === 0;

                    return (
                      <button
                        key={stepIdx}
                        onClick={() => toggleStep(trackIdx, stepIdx)}
                        className={`h-9 sm:h-10 rounded-lg transition-all duration-75 relative flex items-center justify-center ${
                          isActive
                            ? `${color.bg} ${color.glow} shadow-md border ${color.border} scale-[0.98]`
                            : isBeatFirst
                            ? "bg-neutral-800/80 hover:bg-neutral-700/80 border border-neutral-700/60"
                            : "bg-neutral-900 hover:bg-neutral-800 border border-neutral-800/50"
                        } ${
                          isPlayhead ? "ring-2 ring-white ring-offset-1 ring-offset-neutral-950" : ""
                        }`}
                        title={`${track.name} - Step ${stepIdx + 1}`}
                      >
                        {isActive && (
                          <div className="w-1.5 h-1.5 rounded-full bg-white shadow-sm" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Producer Pro Reference Cheat-Sheet */}
      <div className="bg-neutral-900/60 border border-neutral-800/70 rounded-2xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3 border-b border-neutral-800/80 pb-3">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <h3 className="font-bold text-white text-sm sm:text-base">
              {currentGenre.name} - {t("drum_features")}
            </h3>
          </div>
          <button
            onClick={() => onViewDetail(currentGenre)}
            className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center space-x-1 font-semibold"
          >
            <span>{t("view_detail")}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="bg-neutral-950/60 p-3 rounded-xl border border-neutral-800/60">
            <span className="text-neutral-500 font-semibold block mb-1 uppercase tracking-wider text-[10px]">
              {t("kick_placement")}
            </span>
            <p className="text-neutral-200">
              {currentGenre.drum_pattern.kick[language]}
            </p>
          </div>

          <div className="bg-neutral-950/60 p-3 rounded-xl border border-neutral-800/60">
            <span className="text-neutral-500 font-semibold block mb-1 uppercase tracking-wider text-[10px]">
              {t("snare_placement")}
            </span>
            <p className="text-neutral-200">
              {currentGenre.drum_pattern.snare_clap[language]}
            </p>
          </div>

          <div className="bg-neutral-950/60 p-3 rounded-xl border border-neutral-800/60">
            <span className="text-neutral-500 font-semibold block mb-1 uppercase tracking-wider text-[10px]">
              {t("hihat_pattern")}
            </span>
            <p className="text-neutral-200">
              {currentGenre.drum_pattern.hihats[language]}
            </p>
          </div>

          <div className="bg-neutral-950/60 p-3 rounded-xl border border-neutral-800/60">
            <span className="text-neutral-500 font-semibold block mb-1 uppercase tracking-wider text-[10px]">
              {t("bass_design")}
            </span>
            <p className="text-neutral-200">
              {currentGenre.bass_pattern[language]}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
