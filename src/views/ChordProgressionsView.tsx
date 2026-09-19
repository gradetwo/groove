import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { 
  Play, 
  Pause, 
  Square, 
  RotateCcw, 
  Plus, 
  Trash2, 
  Music, 
  Sliders, 
  Sparkles, 
  Volume2, 
  Copy, 
  Check, 
  Download, 
  Search, 
  BookOpen, 
  Piano as PianoIcon, 
  Layers, 
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Disc3,
  ExternalLink
} from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useDeviceCapabilities } from "../hooks/useDeviceCapabilities";
import { 
  ChordDefinition, 
  ChordQuality, 
  CHORD_QUALITY_META, 
  NOTE_NAMES, 
  formatChordName, 
  romanToChord, 
  getChordMidiNotes 
} from "../utils/chordTheory";
import {
  ArpConfig,
  StrumConfig,
  DEFAULT_ARP_CONFIG,
  DEFAULT_STRUM_CONFIG,
  ArpPatternType,
  ArpRate,
  StrumDirection,
  bakeProgressionToSequencer,
  BakedArpeggioResult,
} from "../utils/arpeggiatorTheory";
import { 
  POPULAR_PROGRESSIONS, 
  POPULAR_PROGRESSION_CATEGORIES, 
  PopularProgression 
} from "../data/popularProgressions";
import { 
  ChordAudioEngine, 
  InstrumentTimbre, 
  PlayingStyle, 
  ChordPlaybackInfo 
} from "../audio/ChordAudioEngine";
import {
  coerceStyle,
  styleNoteKeyForTimbre,
  stylesForTimbre,
} from "../audio/chordStyles";

/** i18n label per playing style, for the instrument-filtered style row. */
const STYLE_LABEL_KEYS: Record<PlayingStyle, string> = {
  ballad: "chords_style_pop",
  strum: "chords_style_strum",
  arpeggio: "chords_style_arp",
  block: "chords_style_block",
};
import { PianoKeyboardVisualizer } from "../components/chords/PianoKeyboardVisualizer";
import { GuitarFretboardVisualizer } from "../components/chords/GuitarFretboardVisualizer";
import { MidiExporter } from "../audio/MidiExporter";

const getScaleNotes = (root: string, isMinor: boolean): string[] => {
  const rootIdx = (NOTE_NAMES as readonly string[]).indexOf(root);
  if (rootIdx === -1) return [root];
  const intervals = isMinor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
  return intervals.map((interval) => NOTE_NAMES[(rootIdx + interval) % 12]);
};

export interface ChordOpenStudioOptions {
  openPianoRoll?: boolean;
}

export interface ChordProgressionsViewProps {
  onOpenStudioWithChords?: (chords: ChordDefinition[], options?: ChordOpenStudioOptions) => void;
  onOpenStudioWithArpeggio?: (baked: BakedArpeggioResult, label?: string) => void;
  onOpenHelp?: () => void;
}

export const ChordProgressionsView: React.FC<ChordProgressionsViewProps> = ({
  onOpenStudioWithChords,
  onOpenStudioWithArpeggio,
  onOpenHelp,
}) => {
  const { t, language, isZh } = useLanguage();
  /** Phone surface: measured at 390×664 the guide button was 139×26 and both selects 119×32. */
  const { isMobile } = useDeviceCapabilities();

  // Audio Engine instance (lazy singleton)
  const engineRef = useRef<ChordAudioEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new ChordAudioEngine();
  }

  // Builder State
  const [keyRoot, setKeyRoot] = useState<string>("C");
  const [isMinorKey, setIsMinorKey] = useState<boolean>(false);
  const [bpm, setBpm] = useState<number>(110);
  const [timbre, setTimbre] = useState<InstrumentTimbre>("piano");
  const [style, setStyle] = useState<PlayingStyle>("ballad");
  const [isLooping, setIsLooping] = useState<boolean>(true);

  // Arpeggiator & Strumming Config (P6-03)
  const [arpConfig, setArpConfig] = useState<ArpConfig>({ ...DEFAULT_ARP_CONFIG });
  const [strumConfig, setStrumConfig] = useState<StrumConfig>({ ...DEFAULT_STRUM_CONFIG });

  // Active progression chords in workspace
  const [customChords, setCustomChords] = useState<ChordDefinition[]>([
    { root: "C", quality: "maj", duration: 4 },
    { root: "G", quality: "maj", duration: 4 },
    { root: "A", quality: "min", duration: 4 },
    { root: "F", quality: "maj", duration: 4 },
  ]);
  const [selectedChordIdx, setSelectedChordIdx] = useState<number>(0);

  // Playback state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [activePlaybackChordIdx, setActivePlaybackChordIdx] = useState<number>(-1);
  const [activePlaybackNotes, setActivePlaybackNotes] = useState<number[]>([]);

  // Category filter & search for curated catalog
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [previewingProgId, setPreviewingProgId] = useState<string | null>(null);

  // Active Visualizer Tab
  const [visualizerTab, setVisualizerTab] = useState<"piano" | "guitar">("piano");

  // Copy feedback state
  const [copied, setCopied] = useState<boolean>(false);
  const [isBuilderCollapsed, setIsBuilderCollapsed] = useState<boolean>(false);

  // Stop audio on unmount
  useEffect(() => {
    return () => {
      engineRef.current?.stop();
    };
  }, []);

  // An instrument cannot play every style (a piano cannot strum), so the style is repaired
  // whenever the instrument changes — including on the paths that load a curated progression's
  // own `suggestedTimbre` + `suggestedStyle` pair, which can disagree.
  useEffect(() => {
    setStyle((current) => {
      const next = coerceStyle(timbre, current);
      return next === current ? current : next;
    });
  }, [timbre]);

  // Synchronize engine parameters
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setBpm(bpm);
      engineRef.current.setTimbre(timbre);
      engineRef.current.setStyle(coerceStyle(timbre, style));
      engineRef.current.setLoop(isLooping);
      engineRef.current.setArpConfig(arpConfig);
      engineRef.current.setStrumConfig(strumConfig);
    }
  }, [bpm, timbre, style, isLooping, arpConfig, strumConfig]);

  // Safety clamp to ensure selectedChordIdx is always valid (P3-19)
  useEffect(() => {
    if (selectedChordIdx >= customChords.length) {
      setSelectedChordIdx(Math.max(0, customChords.length - 1));
    }
  }, [customChords.length, selectedChordIdx]);

  // Selected chord object
  const currentChord = customChords[selectedChordIdx] || customChords[0];

  // Visualizer active notes: if playing, show active notes; otherwise show selected chord notes
  const displayedNotes = useMemo(() => {
    if (isPlaying && activePlaybackNotes.length > 0) {
      return activePlaybackNotes;
    }
    if (currentChord) {
      return getChordMidiNotes(currentChord.root, currentChord.quality, 4, currentChord.inversion || 0, timbre);
    }
    return [];
  }, [isPlaying, activePlaybackNotes, currentChord, timbre]);

  // Filter curated progressions
  const filteredProgressions = useMemo(() => {
    return POPULAR_PROGRESSIONS.filter((prog) => {
      const matchCat = selectedCategory === "all" || prog.category === selectedCategory;
      if (!matchCat) return false;
      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase();
      const matchName = prog.name.zh.toLowerCase().includes(q) || prog.name.en.toLowerCase().includes(q);
      const matchRoman = prog.roman.join(" ").toLowerCase().includes(q);
      const matchSong = prog.songs.some(s => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q));
      return matchName || matchRoman || matchSong;
    });
  }, [selectedCategory, searchQuery]);

  // Trigger single chord preview
  const handleAuditionChord = useCallback((chord: ChordDefinition) => {
    if (!engineRef.current) return;
    const notes = engineRef.current.triggerChord(chord, timbre, style);
    setActivePlaybackNotes(notes);
  }, [timbre, style]);

  // Play/Stop custom progression
  const handleTogglePlay = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;

    if (isPlaying) {
      engine.stop();
      setIsPlaying(false);
      setActivePlaybackChordIdx(-1);
      setActivePlaybackNotes([]);
    } else {
      setIsPlaying(true);
      setPreviewingProgId(null);
      engine.startProgression(customChords, (info: ChordPlaybackInfo) => {
        setActivePlaybackChordIdx(info.chordIndex);
        setActivePlaybackNotes(info.activeNotes);
      });
    }
  }, [isPlaying, customChords]);

  // Quick preview curated progression
  const handlePreviewProgression = useCallback((prog: PopularProgression) => {
    const engine = engineRef.current;
    if (!engine) return;

    if (previewingProgId === prog.id && isPlaying) {
      engine.stop();
      setIsPlaying(false);
      setPreviewingProgId(null);
      setActivePlaybackChordIdx(-1);
      setActivePlaybackNotes([]);
    } else {
      // Map progression chords to current key
      const mappedChords = prog.roman.map((rom) => {
        const { root, quality } = romanToChord(rom, keyRoot, isMinorKey);
        return { root, quality, duration: 4 };
      });

      setIsPlaying(true);
      setPreviewingProgId(prog.id);
      // Auditioning deliberately keeps **the user's** instrument and playing style.
      //
      // It used to adopt `prog.suggestedTimbre` / `prog.suggestedStyle`, so picking "piano, block"
      // and then auditioning a guitar-strum progression played a guitar — the selection above the
      // list stopped describing what you were hearing. The suggestion is still shown on the card
      // as a hint; it is not applied behind the user's back.
      // Tempo is a different axis: a progression's tempo is part of what is being auditioned.
      engine.setBpm(prog.suggestedBpm);
      setBpm(prog.suggestedBpm);
      engine.setTimbre(timbre);
      engine.setStyle(coerceStyle(timbre, style));

      engine.startProgression(mappedChords, (info: ChordPlaybackInfo) => {
        setActivePlaybackChordIdx(info.chordIndex);
        setActivePlaybackNotes(info.activeNotes);
      });
    }
  }, [previewingProgId, isPlaying, keyRoot, isMinorKey, timbre, style]);

  // Load curated progression into workspace
  const handleLoadProgression = useCallback((prog: PopularProgression) => {
    setIsBuilderCollapsed(false);
    const mappedChords = prog.roman.map((rom) => {
      const { root, quality } = romanToChord(rom, keyRoot, isMinorKey);
      return { root, quality, duration: 4 };
    });

    setCustomChords(mappedChords);
    setSelectedChordIdx(0);
    setBpm(prog.suggestedBpm);
    setTimbre(prog.suggestedTimbre);
    setStyle(prog.suggestedStyle);

    // Stop previous preview
    if (engineRef.current) {
      engineRef.current.stop();
      setIsPlaying(false);
      setPreviewingProgId(null);
      setActivePlaybackChordIdx(-1);
      setActivePlaybackNotes([]);
    }

    // Scroll to builder section smoothly
    const builderEl = document.getElementById("chord-builder-workspace");
    if (builderEl) {
      builderEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [keyRoot, isMinorKey]);

  // Update specific chord in workspace
  const handleUpdateChord = useCallback((idx: number, updates: Partial<ChordDefinition>) => {
    setCustomChords((prev) => {
      const next = [...prev];
      if (next[idx]) {
        next[idx] = { ...next[idx], ...updates };
      }
      return next;
    });
  }, []);

  // Add a chord block (P3-19: race-condition free)
  const handleAddChord = useCallback(() => {
    setCustomChords((prev) => {
      const next: ChordDefinition[] = [
        ...prev,
        { root: keyRoot, quality: "maj" as ChordQuality, duration: 4 },
      ];
      setSelectedChordIdx(next.length - 1);
      return next;
    });
  }, [keyRoot]);

  // Remove chord block (P3-19: race-condition free)
  const handleRemoveChord = useCallback((idx: number) => {
    setCustomChords((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((_, i) => i !== idx);
      setSelectedChordIdx((cur) => {
        if (cur >= next.length) return next.length - 1;
        if (cur === idx) return Math.max(0, idx - 1);
        if (cur > idx) return cur - 1;
        return cur;
      });
      return next;
    });
  }, []);

  // Copy chord progression text
  const handleCopyText = useCallback(() => {
    const text = customChords.map(c => formatChordName(c.root, c.quality, c.inversion)).join(" - ");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [customChords]);

  // Export MIDI file
  const handleExportMidi = useCallback(() => {
    const chordNames = customChords.map(c => formatChordName(c.root, c.quality));
    MidiExporter.exportChordsMidi(customChords, bpm, `Groove_Progression_${keyRoot}.mid`);
  }, [customChords, bpm, keyRoot]);

  // Bake arpeggiated sequence to Studio (P6-03)
  const handleBakeToStudio = useCallback(
    (targetTrackId: "lead" | "chords" = "lead") => {
      const baked = bakeProgressionToSequencer({
        chords: customChords,
        arpConfig,
        totalSteps: 16,
        targetTrackId,
      });
      const patternNameZh: Record<ArpPatternType, string> = {
        up: "上行",
        down: "下行",
        up_down: "折返",
        converge: "收敛",
        random: "随机",
      };
      const label = t("chords_arp_label", { pattern: isZh ? patternNameZh[arpConfig.pattern] : arpConfig.pattern.toUpperCase() });
      if (onOpenStudioWithArpeggio) {
        onOpenStudioWithArpeggio(baked, label);
      }
    },
    [customChords, arpConfig, isZh, onOpenStudioWithArpeggio]
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-10 text-[#eae6dc]">
      
      {/* 1. Header Banner */}
      <div className="relative rounded-2xl p-6 sm:p-8 bg-gradient-to-br from-[#121622] via-[#0d1017] to-[#0a0c12] border border-line shadow-2xl overflow-hidden">
        <div className="absolute -right-16 -top-16 w-80 h-80 bg-accent/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute right-32 bottom-0 w-64 h-64 bg-[#4ad8c8]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex flex-col gap-2 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase bg-accent/20 text-accent border border-accent/40">
                Hooktheory Theorytab Reference
              </span>
              <span className="text-xs text-text-sub">·</span>
              <span className="text-xs text-text-sub">
                {t("chords_studio_sub")}
              </span>
              {onOpenHelp && (
                <button
                  type="button"
                  data-testid="chords-help-button"
                  onClick={onOpenHelp}
                  title={t("chords_guide_btn")}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border border-accent/40 bg-accent/10 text-accent font-semibold text-xs hover:bg-accent/20 transition-all ml-auto ${isMobile ? "min-h-11" : ""}`}
                >
                  <BookOpen className="w-3.5 h-3.5 text-accent" />
                  <span>{t("chords_guide_btn")}</span>
                </button>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-light tracking-tight text-white font-[Space_Grotesk]">
              {t("chords_studio_title")}
              <span className="block text-sm sm:text-base font-normal text-[#d8b988] mt-1 font-serif">
                Chord Progressions & Harmonic Voicing Studio
              </span>
            </h1>

            <p className="text-xs sm:text-sm text-text-sub leading-relaxed">
              {t("chords_hero_desc")}
            </p>
          </div>

          {/* Quick Key & Scale Configurator */}
          <div className="bg-[#181d28]/80 backdrop-blur-md rounded-xl p-4 border border-[#2a303f] flex flex-col gap-3 min-w-[260px] shadow-lg">
            <div className="flex items-center justify-between text-xs text-text-sub pb-2 border-b border-white/5">
              <span>{t("chords_global_key")}</span>
              <span className="font-mono text-accent font-bold">
                {keyRoot} {isMinorKey ? t("chords_minor") : t("chords_major")}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Root Key Selector */}
              <div className="flex-1">
                <label className="block text-[10px] text-text-sub mb-1">
                  {t("chords_key_root")}
                </label>
                <select
                  value={keyRoot}
                  onChange={(e) => setKeyRoot(e.target.value)}
                  className={`w-full bg-[#0a0d14] border border-[#333a4a] rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-accent ${isMobile ? "min-h-11" : ""}`}
                >
                  {NOTE_NAMES.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>

              {/* Mode Selector */}
              <div className="flex-1">
                <label className="block text-[10px] text-text-sub mb-1">
                  {t("chords_scale_mode")}
                </label>
                <select
                  value={isMinorKey ? "minor" : "major"}
                  onChange={(e) => setIsMinorKey(e.target.value === "minor")}
                  className={`w-full bg-[#0a0d14] border border-[#333a4a] rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-accent ${isMobile ? "min-h-11" : ""}`}
                >
                  <option value="major">{t("chords_mode_major")}</option>
                  <option value="minor">{t("chords_mode_minor")}</option>
                </select>
              </div>
            </div>

            <div className="text-[11px] text-text-sub flex items-center justify-between pt-1">
              <span>{t("chords_scale_notes")}</span>
              <span className="font-mono text-accent text-[11px] font-bold truncate max-w-[200px] text-right">
                {getScaleNotes(keyRoot, isMinorKey).join(" · ")}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Interactive Progression Builder & Studio Workspace (和弦走向创作工作台) */}
      <section 
        id="chord-builder-workspace"
        className={`flex flex-col rounded-2xl bg-[#0e111a] border border-[#232a3b] shadow-2xl relative transition-all duration-200 ${isBuilderCollapsed ? "p-5 sm:p-6 gap-4" : "p-6 sm:p-8 gap-6"}`}
      >
        <div className={`flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${!isBuilderCollapsed ? "pb-4 border-b border-[#1f2533]" : ""}`}>
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#4ad8c8] shadow-[0_0_8px_#4ad8c8]" />
              <h2 className="text-xl sm:text-2xl font-semibold text-white font-[Space_Grotesk]">
                {t("chords_builder_title")}
              </h2>
              {isBuilderCollapsed && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-[#4ad8c8]/20 text-[#4ad8c8] border border-[#4ad8c8]/30">
                  {customChords.length} {t("chords_count")}
                </span>
              )}
            </div>
            <p className="text-xs text-text-sub mt-1">
              {t("chords_studio_desc")}
            </p>
          </div>

          {/* Master Transport & Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Play / Stop Master */}
            <button
              type="button"
              onClick={handleTogglePlay}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition-all shadow-lg ${
                isPlaying && previewingProgId === null
                  ? "bg-[#e84855] hover:bg-[#ff5566] text-white shadow-[0_0_15px_rgba(232,72,85,0.4)]"
                  : "bg-accent hover:bg-[#ffc65c] text-zinc-950 shadow-[0_0_15px_rgba(245,183,61,0.4)]"
              }`}
            >
              {isPlaying && previewingProgId === null ? (
                <>
                  <Square className="w-4 h-4 fill-current shrink-0" />
                  <span className="whitespace-nowrap">{t("chords_builder_stop")}</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current shrink-0" />
                  <span className="whitespace-nowrap">{t("chords_builder_loop")}</span>
                </>
              )}
            </button>

            {/* Loop Toggle */}
            <button
              type="button"
              onClick={() => setIsLooping(!isLooping)}
              className={`p-2 rounded-xl border text-xs transition-colors shrink-0 ${
                isLooping 
                  ? "bg-[#4ad8c8]/20 border-[#4ad8c8] text-[#4ad8c8]" 
                  : "bg-[#181d28] border-[#2b3242] text-text-sub"
              }`}
              title={t("chords_builder_loop_toggle")}
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {/* BPM Slider */}
            <div className="flex items-center gap-2 bg-[#141824] px-3 py-1.5 rounded-xl border border-[#232a3b] shrink-0">
              <span className="text-[10px] text-text-sub">BPM</span>
              <input
                type="range"
                min={40}
                max={220}
                value={bpm}
                onChange={(e) => setBpm(Number(e.target.value))}
                className="w-20 accent-accent h-1.5 bg-[#232a3b] rounded cursor-pointer"
              />
              <span className="text-xs font-mono font-bold text-white w-8 text-right">{bpm}</span>
            </div>

            {/* Copy Progression Text */}
            <button
              type="button"
              onClick={handleCopyText}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#141824] hover:bg-[#1a2030] border border-[#232a3b] text-xs text-[#d8b988] transition-colors shrink-0"
              title={t("chords_copy_title")}
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-400 shrink-0" /> : <Copy className="w-3.5 h-3.5 shrink-0" />}
              <span className="whitespace-nowrap">{copied ? t("chords_copied") : t("chords_copy_text")}</span>
            </button>

            {/* Export MIDI */}
            <button
              type="button"
              onClick={handleExportMidi}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#141824] hover:bg-[#1a2030] border border-[#232a3b] text-xs text-white transition-colors shrink-0"
              title={t("chords_export_midi_title")}
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span className="whitespace-nowrap">{t("chords_export_midi")}</span>
            </button>

            {/* Load to Studio */}
            {onOpenStudioWithChords && (
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onOpenStudioWithChords(customChords)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-accent hover:bg-[#ffc24b] text-zinc-950 font-bold text-xs transition-colors shadow-lg shadow-[#f5b73d]/10 shrink-0"
                  title={t("chords_to_studio_title")}
                >
                  <Music className="w-3.5 h-3.5 shrink-0" />
                  <span className="whitespace-nowrap">{t("chords_to_studio")}</span>
                </button>

                <button
                  type="button"
                  data-testid="chords-open-in-piano-roll"
                  onClick={() => onOpenStudioWithChords(customChords, { openPianoRoll: true })}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#141824] hover:bg-[#1f2638] border border-accent/40 text-accent font-bold text-xs transition-colors shadow-sm shrink-0"
                  title={t("chords_open_piano_roll_title")}
                >
                  <PianoIcon className="w-3.5 h-3.5 text-accent shrink-0" />
                  <span className="whitespace-nowrap">{t("chords_open_piano_roll")}</span>
                </button>
              </div>
            )}

            {/* Quick Bake Arpeggio to Studio (P6-03) */}
            {onOpenStudioWithArpeggio && style === "arpeggio" && (
              <button
                type="button"
                onClick={() => handleBakeToStudio("lead")}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:brightness-110 text-zinc-950 font-bold text-xs transition-all shadow-lg shadow-emerald-500/20 shrink-0"
                title={t("chords_bake_tooltip")}
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span className="whitespace-nowrap">{t("chords_bake_to_lead")}</span>
              </button>
            )}
            {/* Collapse / Expand Toggle Button */}
            <button
              type="button"
              onClick={() => setIsBuilderCollapsed(!isBuilderCollapsed)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#141824] hover:bg-[#1f2638] border border-[#2b3348] text-xs text-[#eae6dc] transition-colors shrink-0"
              title={isBuilderCollapsed ? t("chords_expand_builder_title") : t("chords_collapse_builder_title")}
            >
              {isBuilderCollapsed ? <ChevronDown className="w-3.5 h-3.5 text-accent shrink-0" /> : <ChevronUp className="w-3.5 h-3.5 text-accent shrink-0" />}
              <span className="whitespace-nowrap">{isBuilderCollapsed ? t("chords_expand_builder") : t("chords_collapse_builder")}</span>
            </button>
          </div>
        </div>
        {/* Collapsed State Quick Summary Bar */}
        {isBuilderCollapsed && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#1f2533] text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-text-sub text-[11px]">{t("chords_current_chords_label")}</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {customChords.map((chord, i) => (
                  <button
                    type="button"
                    key={i}
                    onClick={() => {
                      setSelectedChordIdx(i);
                      setIsBuilderCollapsed(false);
                    }}
                    aria-label={`${t("chords_click_to_edit")}: ${formatChordName(chord.root, chord.quality, chord.inversion)}`}
                    className={`px-2 py-0.5 rounded text-xs font-mono font-bold cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      activePlaybackChordIdx === i && isPlaying
                        ? "bg-accent text-black shadow-[0_0_8px_rgba(245,183,61,0.6)]"
                        : "bg-[#181d28] text-white hover:bg-[#23293a] border border-[#2a3244]"
                    }`}
                    title={t("chords_click_to_edit")}
                  >
                    {formatChordName(chord.root, chord.quality, chord.inversion)}
                  </button>
                ))}
              </div>
              <span className="text-text-sub font-mono">· {bpm} BPM</span>
              <span className="text-text-sub">·</span>
              <span className="text-text-sub">
                {timbre === "piano" ? t("chords_timbre_piano") : t("chords_timbre_guitar")}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsBuilderCollapsed(false)}
                className="text-xs text-accent hover:underline font-medium flex items-center gap-1"
              >
                <span>{t("chords_open_full_editor")}</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {!isBuilderCollapsed && (
          <>

        {/* Timbre & Style Selector Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 rounded-xl bg-[#121622] border border-[#1f2533]">
          {/* Instrument Timbre Selector (支持钢琴或吉他) */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-[#d8b988] flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5" />
              <span>{t("chords_timbre")}</span>
            </label>
            <div className="grid grid-cols-3 gap-1 bg-[#0a0d14] p-1 rounded-lg border border-[#232a3b]">
              <button
                type="button"
                onClick={() => setTimbre("piano")}
                className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                  timbre === "piano" ? "bg-accent text-zinc-950 font-bold" : "text-text-sub hover:text-white"
                }`}
              >
                {t("chords_timbre_piano")}
              </button>
              <button
                type="button"
                onClick={() => setTimbre("guitar")}
                className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                  timbre === "guitar" ? "bg-accent text-zinc-950 font-bold" : "text-text-sub hover:text-white"
                }`}
              >
                {t("chords_timbre_guitar")}
              </button>
              <button
                type="button"
                onClick={() => setTimbre("power-guitar")}
                className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                  timbre === "power-guitar" ? "bg-accent text-zinc-950 font-bold" : "text-text-sub hover:text-white"
                }`}
              >
                {t("chords_timbre_power")}
              </button>
            </div>
          </div>

          {/* Playing Style */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-[#d8b988] flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5" />
              <span>{t("chords_style")}</span>
            </label>
            <div
              className={`grid ${
                { 4: "grid-cols-4", 3: "grid-cols-3", 2: "grid-cols-2" }[stylesForTimbre(timbre).length] ?? "grid-cols-3"
              } gap-1 bg-[#0a0d14] p-1 rounded-lg border border-[#232a3b]`}
            >
              {stylesForTimbre(timbre).map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  onClick={() => setStyle(candidate)}
                  data-testid={`chord-style-${candidate}`}
                  className={`px-1.5 py-1.5 rounded text-[11px] font-medium transition-colors ${
                    style === candidate ? "bg-[#4ad8c8] text-zinc-950 font-bold" : "text-text-sub hover:text-white"
                  }`}
                >
                  {t(STYLE_LABEL_KEYS[candidate])}
                </button>
              ))}
            </div>
            {/* Why the row can be shorter than four: the instrument decides. */}
            <p className="text-[10px] leading-snug text-text-dim" data-testid="chord-style-note">
              {t(styleNoteKeyForTimbre(timbre))}
            </p>
          </div>

          {/* Visualizer Display Toggle */}
          <div className="flex flex-col gap-1.5 lg:col-span-2">
            <label className="text-[11px] font-semibold text-[#d8b988] flex items-center gap-1.5">
              <PianoIcon className="w-3.5 h-3.5" />
              <span>{t("chords_voicing_mode")}</span>
            </label>
            <div className="flex items-center gap-2 bg-[#0a0d14] p-1 rounded-lg border border-[#232a3b]">
              <button
                type="button"
                onClick={() => setVisualizerTab("piano")}
                className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
                  visualizerTab === "piano" ? "bg-[#2a3346] text-white font-bold" : "text-text-sub hover:text-white"
                }`}
              >
                {t("chords_piano_keyboard")}
              </button>
              <button
                type="button"
                onClick={() => setVisualizerTab("guitar")}
                className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
                  visualizerTab === "guitar" ? "bg-[#2a3346] text-white font-bold" : "text-text-sub hover:text-white"
                }`}
              >
                {t("chords_guitar_fretboard")}
              </button>
            </div>
          </div>
        </div>

        {/* Arpeggiator Interactive Engine Sub-Panel (P6-03) */}
        {style === "arpeggio" && (
          <div className="p-4 rounded-xl bg-gradient-to-b from-[#141b2b] to-[#10141f] border border-[#2b3a55] shadow-md flex flex-col gap-3 transition-all animate-fadeIn">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-xs font-bold text-white tracking-wide">
                  {t("chords_arp_panel_title")}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold">
                  P6-03 Active
                </span>
              </div>
              {onOpenStudioWithArpeggio && (
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleBakeToStudio("lead")}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold transition-all shadow-md shadow-emerald-500/20 active:scale-95 cursor-pointer"
                    title={t("chords_bake_tooltip")}
                  >
                    <Sparkles className="w-3.5 h-3.5 shrink-0" />
                    <span>{t("chords_bake_to_lead")}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBakeToStudio("chords")}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1f293d] hover:bg-[#2a3752] text-zinc-200 hover:text-white border border-[#3b4b6b] text-xs font-medium transition-all active:scale-95 cursor-pointer"
                    title={t("chords_bake_tooltip")}
                  >
                    <span>{t("chords_bake_to_chords")}</span>
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
              {/* Pattern Type */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold text-zinc-300">{t("chords_arp_pattern")}</span>
                <div className="grid grid-cols-5 gap-1 bg-[#090d14] p-1 rounded-lg border border-[#20293d]">
                  {(["up", "down", "up_down", "converge", "random"] as ArpPatternType[]).map((pat) => (
                    <button
                      key={pat}
                      type="button"
                      onClick={() => setArpConfig((prev) => ({ ...prev, pattern: pat }))}
                      className={`px-1 py-1.5 rounded text-[10px] font-medium transition-all text-center cursor-pointer ${
                        arpConfig.pattern === pat
                          ? "bg-emerald-500 text-zinc-950 font-bold shadow-sm"
                          : "text-zinc-400 hover:text-white"
                      }`}
                    >
                      {pat === "up" && (t("chords_arp_short_up"))}
                      {pat === "down" && (t("chords_arp_short_down"))}
                      {pat === "up_down" && (t("chords_arp_short_up_down"))}
                      {pat === "converge" && (t("chords_arp_short_converge"))}
                      {pat === "random" && (t("chords_arp_short_random"))}
                    </button>
                  ))}
                </div>
              </div>

              {/* Rate */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold text-zinc-300">{t("chords_arp_rate")}</span>
                <div className="grid grid-cols-4 gap-1 bg-[#090d14] p-1 rounded-lg border border-[#20293d]">
                  {(["1/8", "1/16", "1/8T", "1/16T"] as ArpRate[]).map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => setArpConfig((prev) => ({ ...prev, rate }))}
                      className={`px-1.5 py-1.5 rounded text-[11px] font-mono transition-all text-center cursor-pointer ${
                        arpConfig.rate === rate
                          ? "bg-emerald-500 text-zinc-950 font-bold shadow-sm"
                          : "text-zinc-400 hover:text-white"
                      }`}
                    >
                      {rate}
                    </button>
                  ))}
                </div>
              </div>

              {/* Octaves */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold text-zinc-300">{t("chords_arp_octaves")}</span>
                <div className="grid grid-cols-3 gap-1 bg-[#090d14] p-1 rounded-lg border border-[#20293d]">
                  {[1, 2, 3].map((oct) => (
                    <button
                      key={oct}
                      type="button"
                      onClick={() => setArpConfig((prev) => ({ ...prev, octaves: oct }))}
                      className={`px-2 py-1.5 rounded text-[11px] font-mono transition-all text-center cursor-pointer ${
                        arpConfig.octaves === oct
                          ? "bg-emerald-500 text-zinc-950 font-bold shadow-sm"
                          : "text-zinc-400 hover:text-white"
                      }`}
                    >
                      {oct} Oct
                    </button>
                  ))}
                </div>
              </div>

              {/* Gate */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold text-zinc-300">{t("chords_arp_gate")}</span>
                <div className="grid grid-cols-3 gap-1 bg-[#090d14] p-1 rounded-lg border border-[#20293d]">
                  {[
                    { val: 0.4, label: t("chords_gate_stacc") },
                    { val: 0.75, label: t("chords_gate_nat") },
                    { val: 1.0, label: t("chords_gate_leg") },
                  ].map((g) => (
                    <button
                      key={g.val}
                      type="button"
                      onClick={() => setArpConfig((prev) => ({ ...prev, gate: g.val }))}
                      className={`px-1.5 py-1.5 rounded text-[11px] font-medium transition-all text-center cursor-pointer ${
                        Math.abs(arpConfig.gate - g.val) < 0.1
                          ? "bg-emerald-500 text-zinc-950 font-bold shadow-sm"
                          : "text-zinc-400 hover:text-white"
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Strumming Micro-Dynamics Sub-Panel */}
        {style === "strum" && (
          <div className="p-4 rounded-xl bg-gradient-to-b from-[#171a24] to-[#11141c] border border-[#2d3445] shadow-md flex flex-col gap-3 transition-all animate-fadeIn">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-xs font-bold text-white tracking-wide">
                {t("chords_strum_micro")}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                {strumConfig.speedMs}ms
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Direction */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold text-zinc-300">{t("chords_strum_direction")}</span>
                <div className="grid grid-cols-3 gap-1 bg-[#090d14] p-1 rounded-lg border border-[#20293d]">
                  {(["down", "up", "alternate"] as StrumDirection[]).map((dir) => (
                    <button
                      key={dir}
                      type="button"
                      onClick={() => setStrumConfig((prev) => ({ ...prev, direction: dir }))}
                      className={`px-2 py-1.5 rounded text-xs font-medium transition-all text-center cursor-pointer ${
                        strumConfig.direction === dir
                          ? "bg-amber-500 text-zinc-950 font-bold shadow-sm"
                          : "text-zinc-400 hover:text-white"
                      }`}
                    >
                      {dir === "down" && (t("chords_strum_dir_down"))}
                      {dir === "up" && (t("chords_strum_dir_up"))}
                      {dir === "alternate" && (t("chords_strum_dir_alt"))}
                    </button>
                  ))}
                </div>
              </div>

              {/* Speed Slider */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-zinc-300">{t("chords_strum_speed")}</span>
                  <span className="text-xs font-mono text-amber-400 font-bold">{strumConfig.speedMs} ms</span>
                </div>
                <div className="flex items-center gap-3 bg-[#090d14] px-3 py-2 rounded-lg border border-[#20293d]">
                  <span className="text-[10px] text-zinc-500 shrink-0">{t("chords_strum_fast")}</span>
                  <input
                    type="range"
                    min={15}
                    max={75}
                    step={5}
                    value={strumConfig.speedMs}
                    onChange={(e) => setStrumConfig((prev) => ({ ...prev, speedMs: Number(e.target.value) }))}
                    className="flex-1 accent-amber-400 h-1.5 bg-[#232a3b] rounded cursor-pointer"
                  />
                  <span className="text-[10px] text-zinc-500 shrink-0">{t("chords_strum_slow")}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3.1 Timeline Chord Blocks Sequence */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-text-sub">
            <span>{t("chords_timeline_channel")}</span>
            <span className="font-mono">
              {t("chords_bars_count", { count: customChords.length })}
            </span>
          </div>

          <div className="flex items-stretch gap-3 overflow-x-auto pb-2 pt-1 scrollbar-thin">
            {customChords.map((chord, idx) => {
              const isSelected = selectedChordIdx === idx;
              const isCurrentlyPlaying = isPlaying && activePlaybackChordIdx === idx;
              const chordName = formatChordName(chord.root, chord.quality, chord.inversion);

              return (
                <div
                  key={idx}
                  role="button"
                  tabIndex={0}
                  aria-label={`${chordName}, ${t("chords_bar_prefix")} ${idx + 1}`}
                  onClick={() => {
                    setSelectedChordIdx(idx);
                    handleAuditionChord(chord);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedChordIdx(idx);
                      handleAuditionChord(chord);
                    } else if (e.key === "ArrowLeft") {
                      e.preventDefault();
                      const prevIdx = Math.max(0, idx - 1);
                      setSelectedChordIdx(prevIdx);
                      handleAuditionChord(customChords[prevIdx]);
                    } else if (e.key === "ArrowRight") {
                      e.preventDefault();
                      const nextIdx = Math.min(customChords.length - 1, idx + 1);
                      setSelectedChordIdx(nextIdx);
                      handleAuditionChord(customChords[nextIdx]);
                    } else if (e.key === "Delete" || e.key === "Backspace") {
                      if (customChords.length > 1) {
                        e.preventDefault();
                        handleRemoveChord(idx);
                      }
                    }
                  }}
                  className={`relative shrink-0 w-32 sm:w-36 rounded-xl p-3.5 flex flex-col justify-between cursor-pointer transition-all duration-200 border select-none group outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    isCurrentlyPlaying
                      ? "bg-[#1a2336] border-accent shadow-[0_0_18px_rgba(245,183,61,0.4)] scale-105"
                      : isSelected
                      ? "bg-[#151a26] border-[#4ad8c8] shadow-[0_0_14px_rgba(74,216,200,0.25)] ring-2 ring-[#4ad8c8]/30"
                      : "bg-[#11151f] border-[#222838] hover:border-[#3a445e] hover:bg-[#141926]"
                  }`}
                >
                  {/* Delete Chord Button */}
                  {customChords.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveChord(idx);
                      }}
                      className="absolute top-2 right-2 w-5 h-5 rounded-full bg-black/40 hover:bg-[#e84855] text-zinc-400 hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all text-xs"
                      title={t("chords_delete_chord_title")}
                    >
                      ✕
                    </button>
                  )}

                  {/* Header: Bar Number & Duration */}
                  <div className="flex items-center justify-between text-[10px] text-text-sub mb-2 font-mono">
                    <span>{t("chords_bar_n", { n: idx + 1 })}</span>
                    <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/5">
                      {chord.duration ?? 4} {t("chords_beats_n")}
                    </span>
                  </div>

                  {/* Chord Large Display */}
                  <div className="text-center py-2">
                    <div className="text-2xl font-bold font-mono tracking-tight text-white group-hover:text-accent transition-colors">
                      {chordName}
                    </div>
                    <div className="text-[11px] text-text-sub font-serif mt-0.5">
                      {isZh ? CHORD_QUALITY_META[chord.quality]?.nameZh : CHORD_QUALITY_META[chord.quality]?.nameEn}
                    </div>
                  </div>

                  {/* Bottom: Play Chord Audition */}
                  <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between text-[10px]">
                    <span className="text-zinc-500 font-mono">
                      {chord.inversion 
                        ? t("chords_inversion_n", { n: chord.inversion }) 
                        : t("chords_inversion_root")}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAuditionChord(chord);
                      }}
                      className="text-accent hover:underline"
                    >
                      {t("chords_audition_timbre")}
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Add Chord Block Button */}
            <button
              type="button"
              onClick={handleAddChord}
              className="shrink-0 w-28 sm:w-32 rounded-xl border-2 border-dashed border-[#2b3345] hover:border-accent hover:bg-[#181d28]/60 text-text-sub hover:text-white flex flex-col items-center justify-center gap-2 transition-all p-4"
            >
              <Plus className="w-5 h-5 text-accent" />
              <span className="text-xs font-medium">{t("chords_add_chord")}</span>
            </button>
          </div>
        </div>

        {/* 3.2 Chord Palette & Inspector (选择 Power 和弦、3和弦、7和弦等) */}
        {currentChord && (
          <div className="p-5 rounded-xl bg-[#121624] border border-[#202738] flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-white/5">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-accent text-black">
                  {t("chords_editing_bar", { n: selectedChordIdx + 1 })}
                </span>
                <span className="text-base font-bold text-white font-mono">
                  {formatChordName(currentChord.root, currentChord.quality, currentChord.inversion)}
                </span>
              </div>
              <span className="text-xs text-text-sub">
                {t("chords_switch_hint")}
              </span>
            </div>

            {/* Root Note Picker (12 Semitones) */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-text-sub">
                {t("chords_step1_root")}
              </span>
              <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
                {NOTE_NAMES.map((note) => (
                  <button
                    key={note}
                    type="button"
                    onClick={() => {
                      handleUpdateChord(selectedChordIdx, { root: note });
                      handleAuditionChord({ ...currentChord, root: note });
                    }}
                    className={`py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                      currentChord.root === note
                        ? "bg-accent text-zinc-950 shadow-[0_0_10px_rgba(245,183,61,0.5)]"
                        : "bg-[#181d2c] text-[#eae6dc] hover:bg-[#252d42] border border-[#2a344d]"
                    }`}
                  >
                    {note}
                  </button>
                ))}
              </div>
            </div>

            {/* Specific Chord Type Categories (Power和弦 / 3和弦 / 7和弦 / 扩展和弦) */}
            <div className="flex flex-col gap-3 pt-2">
              <span className="text-[11px] font-semibold text-text-sub">
                {t("chords_step2_quality")}
              </span>

              {/* Category 1: Power 和弦 (Rock / Metal 必备) */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-[#e84855] font-bold flex items-center gap-1">
                  <span>
                    {t("chords_category_power")}
                  </span>
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      handleUpdateChord(selectedChordIdx, { quality: "5" });
                      handleAuditionChord({ ...currentChord, quality: "5" });
                    }}
                    className={`px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all border ${
                      currentChord.quality === "5"
                        ? "bg-[#e84855] border-[#ff5566] text-white shadow-[0_0_12px_rgba(232,72,85,0.6)]"
                        : "bg-[#181c28] border-[#293042] text-[#eae6dc] hover:bg-[#222838]"
                    }`}
                  >
                    {currentChord.root}5 ({t("chords_power_desc")})
                  </button>
                </div>
              </div>

              {/* Category 2: 3 和弦 (Triads) */}
              <div className="flex flex-col gap-1 pt-1">
                <span className="text-[10px] text-[#4ad8c8] font-bold">
                  {t("chords_category_triads")}
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  {(["maj", "min", "sus2", "sus4", "dim", "aug"] as ChordQuality[]).map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => {
                        handleUpdateChord(selectedChordIdx, { quality: q });
                        handleAuditionChord({ ...currentChord, quality: q });
                      }}
                      className={`p-2 rounded-lg text-xs font-medium text-left transition-all border ${
                        currentChord.quality === q
                          ? "bg-[#4ad8c8] border-[#4ad8c8] text-zinc-950 font-bold shadow-[0_0_10px_rgba(74,216,200,0.4)]"
                          : "bg-[#181c28] border-[#293042] text-[#eae6dc] hover:bg-[#222838]"
                      }`}
                    >
                      <div className="font-mono font-bold text-sm">
                        {currentChord.root}{CHORD_QUALITY_META[q].symbol}
                      </div>
                      <div className="text-[10px] opacity-75 truncate">
                        {isZh ? CHORD_QUALITY_META[q].nameZh : CHORD_QUALITY_META[q].nameEn}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Category 3: 7 和弦 (7th Chords) */}
              <div className="flex flex-col gap-1 pt-1">
                <span className="text-[10px] text-accent font-bold">
                  {t("chords_category_7ths")}
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  {(["maj7", "min7", "7", "m7b5", "dim7", "mMaj7"] as ChordQuality[]).map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => {
                        handleUpdateChord(selectedChordIdx, { quality: q });
                        handleAuditionChord({ ...currentChord, quality: q });
                      }}
                      className={`p-2 rounded-lg text-xs font-medium text-left transition-all border ${
                        currentChord.quality === q
                          ? "bg-accent border-accent text-zinc-950 font-bold shadow-[0_0_10px_rgba(245,183,61,0.4)]"
                          : "bg-[#181c28] border-[#293042] text-[#eae6dc] hover:bg-[#222838]"
                      }`}
                    >
                      <div className="font-mono font-bold text-sm">
                        {currentChord.root}{CHORD_QUALITY_META[q].symbol}
                      </div>
                      <div className="text-[10px] opacity-75 truncate">
                        {isZh ? CHORD_QUALITY_META[q].nameZh : CHORD_QUALITY_META[q].nameEn}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Category 4: 扩展/色彩和弦 (Extended & Color Chords) */}
              <div className="flex flex-col gap-1 pt-1">
                <span className="text-[10px] text-[#d47fa6] font-bold">
                  {t("chords_category_extended")}
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  {(["add9", "maj9", "min9", "9", "6", "m6"] as ChordQuality[]).map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => {
                        handleUpdateChord(selectedChordIdx, { quality: q });
                        handleAuditionChord({ ...currentChord, quality: q });
                      }}
                      className={`p-2 rounded-lg text-xs font-medium text-left transition-all border ${
                        currentChord.quality === q
                          ? "bg-[#d47fa6] border-[#d47fa6] text-zinc-950 font-bold shadow-[0_0_10px_rgba(212,127,166,0.4)]"
                          : "bg-[#181c28] border-[#293042] text-[#eae6dc] hover:bg-[#222838]"
                      }`}
                    >
                      <div className="font-mono font-bold text-sm">
                        {currentChord.root}{CHORD_QUALITY_META[q].symbol}
                      </div>
                      <div className="text-[10px] opacity-75 truncate">
                        {isZh ? CHORD_QUALITY_META[q].nameZh : CHORD_QUALITY_META[q].nameEn}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Inversion & Duration settings */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-white/5">
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold text-text-sub">
                  {t("chords_step3_inversion")}
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {[0, 1, 2].map((inv) => (
                    <button
                      key={inv}
                      type="button"
                      onClick={() => {
                        handleUpdateChord(selectedChordIdx, { inversion: inv as any });
                        handleAuditionChord({ ...currentChord, inversion: inv as any });
                      }}
                      className={`py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        (currentChord.inversion || 0) === inv
                          ? "bg-accent text-zinc-950 font-bold border-accent"
                          : "bg-[#181c28] border-[#293042] text-[#eae6dc]"
                      }`}
                    >
                      {inv === 0 
                        ? t("chords_inv_0") 
                        : inv === 1 
                        ? t("chords_inv_1") 
                        : t("chords_inv_2")}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold text-text-sub">
                  {t("chords_step4_duration")}
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleUpdateChord(selectedChordIdx, { duration: 4 })}
                    className={`py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      (currentChord.duration ?? 4) === 4
                        ? "bg-[#4ad8c8] text-zinc-950 font-bold border-[#4ad8c8]"
                        : "bg-[#181c28] border-[#293042] text-[#eae6dc]"
                    }`}
                  >
                    {t("chords_dur_4")}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdateChord(selectedChordIdx, { duration: 2 })}
                    className={`py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      (currentChord.duration ?? 4) === 2
                        ? "bg-[#4ad8c8] text-zinc-950 font-bold border-[#4ad8c8]"
                        : "bg-[#181c28] border-[#293042] text-[#eae6dc]"
                    }`}
                  >
                    {t("chords_dur_2")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3.3 Live Piano / Guitar Visualizer Panel */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-accent" />
              <span>
                {t("chords_live_voicing_title")}
              </span>
            </span>
            <span className="text-xs font-mono text-[#d8b988]">
              {formatChordName(currentChord.root, currentChord.quality, currentChord.inversion)}
            </span>
          </div>

          {visualizerTab === "piano" ? (
            <PianoKeyboardVisualizer
              activeNotes={displayedNotes}
              rootMidi={displayedNotes[0]}
              language={language}
              onKeyClick={(midi) => {
                if (engineRef.current) {
                  engineRef.current.triggerNote(midi, timbre);
                  setActivePlaybackNotes([midi]);
                }
              }}
            />
          ) : (
            <GuitarFretboardVisualizer
              rootNote={currentChord.root}
              quality={currentChord.quality}
              language={language}
              onStringClick={(midi) => {
                if (engineRef.current) {
                  engineRef.current.triggerNote(midi, timbre);
                  setActivePlaybackNotes([midi]);
                }
              }}
            />
          )}
        </div>
          </>
        )}
      </section>

      {/* 3. Curated Popular Progressions (Hooktheory Theorytab) */}
      <section className="flex flex-col gap-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-lg sm:text-xl font-medium text-white">
              <BookOpen className="w-5 h-5 text-accent" />
              <h2>
                {t("chords_categorized_title")}
              </h2>
            </div>
            <p className="text-xs text-text-sub mt-0.5">
              {t("chords_categorized_sub")}
            </p>
          </div>

          {/* Search Box */}
          <div className="relative min-w-[240px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text-sub" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("chords_search_placeholder")}
              className="w-full bg-[#121622] border border-line rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-text-dim focus:outline-none focus:border-accent"
            />
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {POPULAR_PROGRESSION_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                selectedCategory === cat.id
                  ? "bg-accent text-zinc-950 shadow-[0_0_12px_rgba(245,183,61,0.3)] font-semibold"
                  : "bg-[#121622] text-text-sub hover:bg-[#181e2e] hover:text-white border border-line"
              }`}
            >
              {isZh ? cat.nameZh : cat.nameEn}
            </button>
          ))}
        </div>

        {/* Progressions Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProgressions.map((prog) => {
            const isThisPreviewing = previewingProgId === prog.id && isPlaying;

            // Map roman numerals to real chords in current active keyRoot
            const translatedChords = prog.roman.map((rom) => {
              const { displayName } = romanToChord(rom, keyRoot, isMinorKey);
              return displayName;
            });

            return (
              <div
                key={prog.id}
                className={`flex flex-col justify-between rounded-xl p-5 bg-[#10141e] border transition-all duration-200 group relative ${
                  isThisPreviewing 
                    ? "border-accent shadow-[0_0_20px_rgba(245,183,61,0.2)] bg-[#141926]" 
                    : "border-[#202532] hover:border-[#384156] hover:bg-[#131824]"
                }`}
              >
                {/* Card Top */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-semibold text-accent uppercase tracking-wider block mb-1">
                        {prog.emotion[language]}
                      </span>
                      <h3 className="text-base font-semibold text-white group-hover:text-accent transition-colors leading-snug">
                        {isZh ? prog.name.zh : prog.name.en}
                      </h3>
                      {isZh && (
                        <span className="text-[11px] text-text-sub font-serif block">
                          {prog.name.en}
                        </span>
                      )}
                    </div>

                    <div className="shrink-0 flex items-center gap-1.5">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 text-zinc-300 border border-white/10">
                        {prog.suggestedBpm} BPM
                      </span>
                    </div>
                  </div>

                  {/* Roman Numeral Stream + Key Mapped Chords */}
                  <div className="p-3 rounded-lg bg-[#0a0d14] border border-[#1f2533] flex flex-col gap-2">
                    {/* Roman numerals */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {prog.roman.map((r, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-[#1a2232] text-accent border border-accent/30"
                        >
                          {r}
                        </span>
                      ))}
                    </div>

                    {/* Real translated chords in key */}
                    <div className="flex items-center gap-1 text-xs text-text-sub pt-1 border-t border-white/5">
                      <span className="text-[10px] text-text-dim">
                        {t("chords_voiced_in", { key: keyRoot })}
                      </span>
                      <span className="font-mono text-white font-semibold">
                        {translatedChords.join(" ─ ")}
                      </span>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-text-sub line-clamp-2 leading-relaxed">
                    {prog.description[language]}
                  </p>

                  {/* Famous Songs (Hooktheory Theorytab) */}
                  <div className="pt-2 border-t border-[#1f2533]">
                    <span className="text-[10px] text-text-dim block mb-1">
                      {t("chords_notable_hits")}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {prog.songs.slice(0, 3).map((s, si) => (
                        <span
                          key={si}
                          className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-[#d8b988] border border-white/5"
                        >
                          {s.title} ({s.artist})
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Card Bottom Actions */}
                <div className="flex items-center justify-between gap-2 mt-5 pt-3 border-t border-[#1f2533]">
                  {/* Play / Preview Button */}
                  <button
                    type="button"
                    onClick={() => handlePreviewProgression(prog)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      isThisPreviewing
                        ? "bg-accent text-zinc-950 font-bold shadow-[0_0_10px_rgba(245,183,61,0.5)]"
                        : "bg-[#1c2230] text-white hover:bg-[#252e42]"
                    }`}
                  >
                    {isThisPreviewing ? (
                      <>
                        <Square className="w-3.5 h-3.5 fill-current" />
                        <span>{t("chords_stop_preview")}</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>{t("chords_preview")}</span>
                      </>
                    )}
                  </button>

                  {/* Load to Custom Builder */}
                  <button
                    type="button"
                    onClick={() => handleLoadProgression(prog)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent/10 hover:bg-accent/20 text-accent border border-accent/30 transition-colors"
                  >
                    <span>{t("chords_load_to_studio")}</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

    </div>
  );
};
