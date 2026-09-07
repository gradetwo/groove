import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Download, 
  Share2, 
  Shuffle, 
  Volume2, 
  VolumeX, 
  Sliders, 
  Check, 
  ExternalLink,
  ChevronRight,
  Info
} from "lucide-react";
import { Genre, SequencerPattern, SequencerTrack } from "../types/genre";
import { ALL_GENRES, GENRES_MAP } from "../data/genres";
import { AudioEngine } from "../audio/AudioEngine";
import { downloadMidiFile } from "../audio/MidiExporter";
import { encodeSharedSequencer, decodeSharedSequencer, getShareUrl, SharedSequencerState } from "../audio/SequencerUrlShare";
import { useLanguage } from "../i18n/LanguageContext";

// Color mappings matching /tmp/demo.html
export const DEMO_TRACKS_CONFIG = [
  { id: "kick",  name: "KICK",      sub: { zh: "底鼓", en: "Kick" },         color: "#ff5964" },
  { id: "snare", name: "SNARE",     sub: { zh: "军鼓/拍手", en: "Snare/Clap" }, color: "#ffb65c" },
  { id: "hat",   name: "HI-HAT",    sub: { zh: "踩镲", en: "Hi-Hat" },       color: "#45e0c9" },
  { id: "perc",  name: "PERC",      sub: { zh: "打击乐", en: "Percussion" }, color: "#c8e06a" },
  { id: "bass",  name: "808 BASS",  sub: { zh: "贝斯", en: "Bass" },         color: "#ff8a5c" },
  { id: "chord", name: "CHORD",     sub: { zh: "和弦", en: "Chords" },       color: "#f06ec4" },
  { id: "lead",  name: "LEAD",      sub: { zh: "主音", en: "Lead" },         color: "#7ee787" },
  { id: "fx",    name: "FX",        sub: { zh: "效果", en: "FX" },           color: "#9aa5ce" },
];

function getGenreAccent(genre: Genre): string {
  const cat = genre.category.toLowerCase();
  const id = genre.id.toLowerCase();
  if (id.includes("house")) return "#3ddc97";
  if (id.includes("techno")) return "#45e0c9";
  if (id.includes("trance")) return "#43d9e8";
  if (id.includes("trap")) return "#ff5964";
  if (id.includes("drill")) return "#ff9f3d";
  if (id.includes("future")) return "#ffd166";
  if (id.includes("dnb") || id.includes("jungle")) return "#43d9e8";
  if (id.includes("dubstep") || id.includes("bass")) return "#a855f7";
  if (id.includes("reggaeton") || id.includes("latin")) return "#f26bd8";
  if (cat.includes("rock")) return "#ff5964";
  if (cat.includes("hip hop")) return "#ffb65c";
  if (cat.includes("jazz") || cat.includes("blues")) return "#38bdf8";
  if (cat.includes("pop") || cat.includes("r&b")) return "#f06ec4";
  return "#f5b73d";
}

interface StudioViewProps {
  selectedGenre?: Genre;
  onSelectGenre: (genre: Genre) => void;
  onViewDetail: (genre: Genre) => void;
  onAddToCompare?: (genre: Genre) => void;
  onAudioEngineReady?: (engine: AudioEngine) => void;
}

export const StudioView: React.FC<StudioViewProps> = ({
  selectedGenre: initialGenre,
  onSelectGenre,
  onViewDetail,
  onAddToCompare,
  onAudioEngineReady,
}) => {
  const { t, language } = useLanguage();

  // Current selected genre
  const [currentGenre, setCurrentGenre] = useState<Genre>(() => {
    return initialGenre || GENRES_MAP["future-bass"] || GENRES_MAP["chicago-house"] || ALL_GENRES[0];
  });

  // Track patterns
  const [pattern, setPattern] = useState<SequencerPattern>(() => {
    return JSON.parse(JSON.stringify(currentGenre.sequencer_pattern));
  });

  const [bpm, setBpm] = useState<number>(currentGenre.default_bpm || 140);
  const [swing, setSwing] = useState<number>(currentGenre.sequencer_pattern.swing || 0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Mute & Solo sets
  const [mutes, setMutes] = useState<Set<number>>(new Set());
  const [solos, setSolos] = useState<Set<number>>(new Set());

  // Category filter for the chip rail
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>("ALL");

  // AudioEngine ref
  const engineRef = useRef<AudioEngine | null>(null);

  // Drag-to-paint state
  const isPointerDownRef = useRef(false);
  const dragValRef = useRef<number | null>(null);
  const hasDraggedRef = useRef(false);

  const genreAccent = useMemo(() => getGenreAccent(currentGenre), [currentGenre]);

  // Toast notification
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2400);
  };

  // Initialize engine
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
    engine.setSwing(swing / 100);

    if (onAudioEngineReady) {
      onAudioEngineReady(engine);
    }

    return () => {
      engine.destroy();
    };
  }, []);

  // Sync external genre
  useEffect(() => {
    if (initialGenre && initialGenre.id !== currentGenre.id) {
      switchGenre(initialGenre, false);
    }
  }, [initialGenre]);

  // Handle URL share params
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
        setSwing(decoded.swing);
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
        showToast("Shared Pattern Loaded");
      }
    } else if (genreParam && GENRES_MAP[genreParam]) {
      switchGenre(GENRES_MAP[genreParam], false);
    }
  }, []);

  // Sync engine on pattern/bpm/swing change
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
      engineRef.current.setSwing(swing / 100);
    }
  }, [swing]);

  // Switch genre (hot swap)
  const switchGenre = (genre: Genre, andPlay = false) => {
    setCurrentGenre(genre);
    onSelectGenre(genre);
    const newBpm = genre.default_bpm || 120;
    const newSwing = genre.sequencer_pattern.swing || 0;
    const newPattern = JSON.parse(JSON.stringify(genre.sequencer_pattern));

    setBpm(newBpm);
    setSwing(newSwing);
    setPattern(newPattern);
    setMutes(new Set());
    setSolos(new Set());

    if (engineRef.current) {
      engineRef.current.setPattern(newPattern, true);
      engineRef.current.setBpm(newBpm);
      engineRef.current.setSwing(newSwing / 100);
      if (andPlay) {
        if (!isPlaying) {
          engineRef.current.play();
          setIsPlaying(true);
        }
      } else if (!isPlaying) {
        engineRef.current.stop();
        setCurrentStep(0);
      }
    }
  };

  // Transport controls
  const handleTogglePlay = () => {
    if (!engineRef.current) return;
    if (isPlaying) {
      engineRef.current.stop();
      setIsPlaying(false);
      setCurrentStep(0);
    } else {
      engineRef.current.play();
      setIsPlaying(true);
    }
  };

  // Keyboard shortcut: Space to play/pause
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        handleTogglePlay();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying]);

  // Step Cell interaction
  const handleCellClick = (trackIdx: number, stepIdx: number, e: React.MouseEvent) => {
    if (hasDraggedRef.current) {
      hasDraggedRef.current = false;
      return;
    }

    const tr = pattern.tracks[trackIdx];
    if (!tr) return;
    const isHat = tr.track_id === "hihat" || tr.name.toLowerCase().includes("hat");
    const cur = tr.steps[stepIdx] || 0;

    // SHIFT + click = accent toggle
    if (e.shiftKey && cur > 0) {
      let newVel = 100;
      setPattern((prev) => {
        const copy = JSON.parse(JSON.stringify(prev));
        const t = copy.tracks[trackIdx];
        if (!t.velocity) t.velocity = Array(16).fill(100);
        newVel = (t.velocity[stepIdx] || 100) >= 115 ? 90 : 127;
        t.velocity[stepIdx] = newVel;
        return copy;
      });
      if (engineRef.current) {
        const pitch = tr.pitch && tr.pitch[stepIdx] ? tr.pitch[stepIdx] : 0;
        engineRef.current.triggerNote(trackIdx, tr.name, newVel / 127, pitch, cur);
      }
      return;
    }

    // Hi-Hat multi-state cycling: 0 -> 1 (closed) -> 2 (open) -> 3 (triplet) -> 0
    if (isHat) {
      const nextVal = cur === 0 ? 1 : cur === 1 ? 2 : cur === 2 ? 3 : 0;
      setPattern((prev) => {
        const copy = JSON.parse(JSON.stringify(prev));
        const t = copy.tracks[trackIdx];
        t.steps[stepIdx] = nextVal;
        if (nextVal > 0) {
          if (!t.velocity) t.velocity = Array(16).fill(100);
          if (!t.velocity[stepIdx]) t.velocity[stepIdx] = 100;
        }
        return copy;
      });
      if (nextVal > 0 && engineRef.current) {
        const pitch = tr.pitch && tr.pitch[stepIdx] ? tr.pitch[stepIdx] : 0;
        const vel = (tr.velocity && tr.velocity[stepIdx] ? tr.velocity[stepIdx] : 100) / 127;
        engineRef.current.triggerNote(trackIdx, tr.name, vel, pitch, nextVal);
      }
    }
  };

  // Pointer drag painting
  const handlePointerDown = (trackIdx: number, stepIdx: number, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    isPointerDownRef.current = true;
    hasDraggedRef.current = false;

    const tr = pattern.tracks[trackIdx];
    if (!tr) return;
    const isHat = tr.track_id === "hihat" || tr.name.toLowerCase().includes("hat");

    // Let click handler process shiftKey and hi-hat cycling
    if (e.shiftKey || isHat) return;

    const cur = tr.steps[stepIdx] || 0;
    const nextVal = cur > 0 ? 0 : 1;
    dragValRef.current = nextVal;

    setPattern((prev) => {
      const copy = JSON.parse(JSON.stringify(prev));
      const t = copy.tracks[trackIdx];
      t.steps[stepIdx] = nextVal;
      if (nextVal > 0) {
        if (!t.velocity) t.velocity = Array(16).fill(100);
        if (!t.velocity[stepIdx]) t.velocity[stepIdx] = 100;
      }
      return copy;
    });

    if (nextVal > 0 && engineRef.current) {
      const pitch = tr.pitch && tr.pitch[stepIdx] ? tr.pitch[stepIdx] : 0;
      const vel = (tr.velocity && tr.velocity[stepIdx] ? tr.velocity[stepIdx] : 100) / 127;
      engineRef.current.triggerNote(trackIdx, tr.name, vel, pitch, nextVal);
    }
  };

  const handlePointerEnter = (trackIdx: number, stepIdx: number) => {
    if (!isPointerDownRef.current || dragValRef.current === null) return;
    const tr = pattern.tracks[trackIdx];
    if (!tr) return;
    const isHat = tr.track_id === "hihat" || tr.name.toLowerCase().includes("hat");
    if (isHat) return;

    hasDraggedRef.current = true;
    const val = dragValRef.current;

    setPattern((prev) => {
      const copy = JSON.parse(JSON.stringify(prev));
      const t = copy.tracks[trackIdx];
      if (t.steps[stepIdx] !== val) {
        t.steps[stepIdx] = val;
        if (val > 0 && (!t.velocity || !t.velocity[stepIdx])) {
          if (!t.velocity) t.velocity = Array(16).fill(100);
          t.velocity[stepIdx] = 100;
        }
      }
      return copy;
    });

    if (val > 0 && engineRef.current) {
      const pitch = tr.pitch && tr.pitch[stepIdx] ? tr.pitch[stepIdx] : 0;
      const vel = (tr.velocity && tr.velocity[stepIdx] ? tr.velocity[stepIdx] : 100) / 127;
      engineRef.current.triggerNote(trackIdx, tr.name, vel, pitch, val);
    }
  };

  useEffect(() => {
    const handlePointerUp = () => {
      isPointerDownRef.current = false;
      dragValRef.current = null;
    };
    window.addEventListener("pointerup", handlePointerUp);
    return () => window.removeEventListener("pointerup", handlePointerUp);
  }, []);

  // Mute & Solo handlers
  const toggleMute = (idx: number) => {
    setMutes((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      if (engineRef.current) {
        engineRef.current.setTrackState(idx, { mute: next.has(idx) });
      }
      return next;
    });
  };

  const toggleSolo = (idx: number) => {
    setSolos((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      if (engineRef.current) {
        engineRef.current.setTrackState(idx, { solo: next.has(idx) });
      }
      return next;
    });
  };

  // Reset preset
  const handleResetPreset = () => {
    switchGenre(currentGenre, false);
    showToast(t("restore") + " ✓");
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
    showToast(t("export") + " (.mid) ✓");
  };

  // Random genre
  const handleDiceRandom = () => {
    const others = ALL_GENRES.filter((g) => g.id !== currentGenre.id);
    const chosen = others[Math.floor(Math.random() * others.length)];
    switchGenre(chosen, true);
  };

  // Share pattern URL
  const handleShare = () => {
    const shareState: SharedSequencerState = {
      genreId: currentGenre.id,
      bpm,
      swing,
      scale: pattern.scale,
      tracks: pattern.tracks.map((t) => ({
        track_id: t.track_id,
        name: t.name,
        instrument: t.instrument,
        steps: [...t.steps],
        velocity: t.velocity,
        pitch: t.pitch,
        mute: mutes.has(pattern.tracks.indexOf(t)),
        solo: solos.has(pattern.tracks.indexOf(t)),
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

  // Filtered chip list for rail
  const railGenres = useMemo(() => {
    if (activeCategoryFilter === "ALL") {
      return ALL_GENRES.slice(0, 36);
    }
    return ALL_GENRES.filter((g) => g.category === activeCategoryFilter);
  }, [activeCategoryFilter]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    ALL_GENRES.forEach((g) => set.add(g.category));
    return ["ALL", ...Array.from(set)];
  }, []);

  return (
    <div className="w-full text-[#e9e7e0]" style={{ ["--g" as any]: genreAccent }}>
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-7 left-1/2 -translate-x-1/2 z-50 bg-[#1a1c22] border border-[#23262d] text-[#e9e7e0] px-4 py-2.5 rounded-lg text-xs font-mono shadow-[0_8px_30px_rgba(0,0,0,0.6)] flex items-center gap-2">
          <Check className="w-3.5 h-3.5 text-[#f5b73d]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Genre Rail Wrapper (.rail-wrap) */}
      <div className="px-4 sm:px-7 pt-4 pb-1 flex items-center gap-3">
        <span className="font-['JetBrains_Mono'] text-[10px] tracking-[0.2em] text-[#5a5e68] uppercase whitespace-nowrap hidden sm:inline">
          {t("pickGenre")}
        </span>

        {/* Category selector */}
        <select
          value={activeCategoryFilter}
          onChange={(e) => setActiveCategoryFilter(e.target.value)}
          className="bg-[#0d0e12] border border-[#23262d] text-[#8b8f99] hover:text-[#e9e7e0] text-xs font-['Space_Grotesk'] font-medium px-2.5 py-2 rounded-lg outline-none cursor-pointer"
        >
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat === "ALL" ? (language === "zh" ? "全部大类 (159)" : "All Categories (159)") : cat}
            </option>
          ))}
        </select>

        {/* Horizontal Scrolling Chips Rail (.rail) */}
        <div className="flex-1 flex gap-2.5 overflow-x-auto py-1 scrollbar-none">
          {railGenres.map((g) => {
            const isCurrent = g.id === currentGenre.id;
            const accent = getGenreAccent(g);

            return (
              <button
                key={g.id}
                onClick={() => switchGenre(g, true)}
                className={`flex-none flex flex-col gap-0.5 px-4 py-2 border rounded-xl bg-[#0d0e12] min-w-[124px] text-left transition-all relative ${
                  isCurrent
                    ? "border-[var(--g)] shadow-[0_0_12px_rgba(245,183,61,0.15)]"
                    : "border-[#23262d] hover:border-[#3a3e48] hover:-translate-y-0.5"
                }`}
                style={{ ["--g" as any]: accent }}
              >
                <span 
                  className={`font-['Space_Grotesk'] font-bold text-xs sm:text-sm tracking-wide truncate ${
                    isCurrent ? "text-[var(--g)]" : "text-[#e9e7e0]"
                  }`}
                >
                  {g.name}
                </span>
                <span 
                  className={`font-['JetBrains_Mono'] text-[9px] tracking-[0.12em] uppercase truncate ${
                    isCurrent ? "text-[var(--g)] opacity-80" : "text-[#5a5e68]"
                  }`}
                >
                  {g.aliases[0] || g.category}
                </span>
              </button>
            );
          })}
        </div>

        {/* Dice Random Button (#dice) */}
        <button
          onClick={handleDiceRandom}
          className="flex-none w-9 h-9 border border-dashed border-[#23262d] hover:border-[#f5b73d] text-[#8b8f99] hover:text-[#f5b73d] rounded-xl flex items-center justify-center transition-colors bg-[#0d0e12]"
          title="Random Genre"
        >
          <Shuffle className="w-4 h-4" />
        </button>
      </div>

      {/* Main Two-Column Layout (main: 352px 1fr) */}
      <main className="grid grid-cols-1 lg:grid-cols-[352px_1fr] gap-5 px-4 sm:px-7 py-3 pb-16 items-start">
        {/* Left Column: Info Dossier (.info) */}
        <aside className="sticky top-16 flex flex-col gap-3.5 order-2 lg:order-1">
          {/* Hero Genre Card (.blk.g-head) */}
          <div className="bg-[#121317] border border-[#23262d] rounded-xl p-4 sm:p-4.5">
            <div className="font-['Space_Grotesk'] font-bold text-2xl sm:text-[26px] leading-[1.15] text-[var(--g)] tracking-tight">
              {currentGenre.name}
            </div>
            <div className="text-xs text-[#8b8f99] mt-1 font-medium">
              {currentGenre.aliases.length > 0 ? currentGenre.aliases[0] : currentGenre.category}
            </div>

            {/* Era & Place */}
            <div className="flex gap-3.5 mt-2.5 font-['JetBrains_Mono'] text-xs text-[#8b8f99] flex-wrap">
              <span>
                {t("era")}: <b className="text-[#e9e7e0] font-normal">{currentGenre.origin_year}</b>
              </span>
              <span>
                {t("place")}: <b className="text-[#e9e7e0] font-normal">{currentGenre.origin_place[language]}</b>
              </span>
            </div>

            {/* Blurb */}
            <p className="mt-3 text-[13px] text-[#c6c4bd] leading-[1.75]">
              {currentGenre.cultural_context[language]}
            </p>

            {/* 3 Stats Grid */}
            <div className="grid grid-cols-3 gap-2 mt-3.5">
              <div className="bg-[#0d0e12] border border-[#1a1c21] rounded-lg p-2">
                <div className="font-['JetBrains_Mono'] text-[9px] tracking-[0.12em] text-[#5a5e68] uppercase">
                  {t("range")}
                </div>
                <div className="font-['JetBrains_Mono'] text-xs font-bold text-[#e9e7e0] mt-0.5">
                  {currentGenre.bpm_range}
                </div>
              </div>

              <div className="bg-[#0d0e12] border border-[#1a1c21] rounded-lg p-2">
                <div className="font-['JetBrains_Mono'] text-[9px] tracking-[0.12em] text-[#5a5e68] uppercase">
                  {t("keyLabel")}
                </div>
                <div className="font-['JetBrains_Mono'] text-xs font-bold text-[#e9e7e0] mt-0.5 truncate">
                  {pattern.scale || "C minor"}
                </div>
              </div>

              <div className="bg-[#0d0e12] border border-[#1a1c21] rounded-lg p-2">
                <div className="font-['JetBrains_Mono'] text-[9px] tracking-[0.12em] text-[#5a5e68] uppercase">
                  {t("time")}
                </div>
                <div className="font-['JetBrains_Mono'] text-xs font-bold text-[#e9e7e0] mt-0.5">
                  {currentGenre.time_signature || "4/4"}
                </div>
              </div>
            </div>
          </div>

          {/* Drum DNA Card (.blk) */}
          <div className="bg-[#121317] border border-[#23262d] rounded-xl p-4 sm:p-4.5">
            <h3 className="font-['JetBrains_Mono'] text-[10px] tracking-[0.22em] text-[#5a5e68] uppercase mb-2.5">
              {t("dna")}
            </h3>
            <div className="divide-y divide-[#1a1c21]">
              <div className="grid grid-cols-[52px_1fr] gap-2.5 py-1.5 items-baseline">
                <span className="font-['JetBrains_Mono'] text-[10px] tracking-[0.08em] font-bold text-[#ff5964]">
                  KICK
                </span>
                <span className="text-xs text-[#b9b7b0] leading-relaxed">
                  {currentGenre.drum_pattern.kick[language]}
                </span>
              </div>

              <div className="grid grid-cols-[52px_1fr] gap-2.5 py-1.5 items-baseline">
                <span className="font-['JetBrains_Mono'] text-[10px] tracking-[0.08em] font-bold text-[#ffb65c]">
                  SNARE
                </span>
                <span className="text-xs text-[#b9b7b0] leading-relaxed">
                  {currentGenre.drum_pattern.snare_clap[language]}
                </span>
              </div>

              <div className="grid grid-cols-[52px_1fr] gap-2.5 py-1.5 items-baseline">
                <span className="font-['JetBrains_Mono'] text-[10px] tracking-[0.08em] font-bold text-[#45e0c9]">
                  HI-HAT
                </span>
                <span className="text-xs text-[#b9b7b0] leading-relaxed">
                  {currentGenre.drum_pattern.hihats[language]}
                </span>
              </div>

              <div className="grid grid-cols-[52px_1fr] gap-2.5 py-1.5 items-baseline">
                <span className="font-['JetBrains_Mono'] text-[10px] tracking-[0.08em] font-bold text-[#ff8a5c]">
                  BASS
                </span>
                <span className="text-xs text-[#b9b7b0] leading-relaxed">
                  {currentGenre.bass_pattern[language]}
                </span>
              </div>
            </div>
          </div>

          {/* Harmony & Sound (.blk) */}
          <div className="bg-[#121317] border border-[#23262d] rounded-xl p-4 sm:p-4.5">
            <h3 className="font-['JetBrains_Mono'] text-[10px] tracking-[0.22em] text-[#5a5e68] uppercase mb-2.5">
              {t("harm")}
            </h3>
            <p className="text-[12.5px] text-[#b9b7b0] leading-[1.75]">
              {currentGenre.key_characteristics[language]}
            </p>
          </div>

          {/* Pro Tips (.blk) */}
          <div className="bg-[#121317] border border-[#23262d] rounded-xl p-4 sm:p-4.5">
            <h3 className="font-['JetBrains_Mono'] text-[10px] tracking-[0.22em] text-[#5a5e68] uppercase mb-2.5">
              {t("tips")}
            </h3>
            <div className="space-y-2">
              <div className="flex gap-2 text-xs text-[#b9b7b0] leading-relaxed">
                <span className="text-[var(--g)] shrink-0">▸</span>
                <span>{currentGenre.drum_pattern.swing[language]}</span>
              </div>
              {currentGenre.common_chords.length > 0 && (
                <div className="flex gap-2 text-xs text-[#b9b7b0] leading-relaxed">
                  <span className="text-[var(--g)] shrink-0">▸</span>
                  <span>
                    {language === "zh" ? "经典走向: " : "Progressions: "}
                    <code className="font-mono text-[var(--g)] font-bold">
                      {currentGenre.common_chords.join(" → ")}
                    </code>
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Essential Tracks (.blk) */}
          <div className="bg-[#121317] border border-[#23262d] rounded-xl p-4 sm:p-4.5">
            <h3 className="font-['JetBrains_Mono'] text-[10px] tracking-[0.22em] text-[#5a5e68] uppercase mb-2.5">
              {t("refs")}
            </h3>
            <div className="divide-y divide-[#1a1c21]">
              {currentGenre.representative_tracks.slice(0, 3).map((track, i) => (
                <div key={i} className="flex justify-between gap-2.5 py-2 text-xs">
                  <span className="text-[#e9e7e0] truncate">
                    {track.link ? (
                      <a
                        href={track.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#e9e7e0] hover:text-[var(--g)] hover:underline"
                      >
                        {track.title}
                      </a>
                    ) : (
                      track.title
                    )}{" "}
                    · <span className="text-[#8b8f99]">{track.artist}</span>
                  </span>
                  <span className="font-['JetBrains_Mono'] text-[11px] text-[#5a5e68] shrink-0">
                    {track.year}
                  </span>
                </div>
              ))}
            </div>

            {/* View full detail / Add to compare button */}
            <div className="flex items-center gap-2 mt-3 pt-2">
              <button
                onClick={() => onViewDetail(currentGenre)}
                className="flex-1 text-xs text-[#8b8f99] hover:text-[var(--g)] hover:border-[var(--g)] p-2 border border-[#23262d] rounded-lg transition-colors text-center"
              >
                {t("view_detail")} →
              </button>
              {onAddToCompare && (
                <button
                  onClick={() => onAddToCompare(currentGenre)}
                  className="text-xs text-[#8b8f99] hover:text-[#f5b73d] hover:border-[#f5b73d] p-2 border border-[#23262d] rounded-lg transition-colors"
                  title={t("compare_add")}
                >
                  {t("compare")} +
                </button>
              )}
            </div>
          </div>
        </aside>

        {/* Right Column: The Sequencer (.seq) */}
        <section className="bg-[#121317] border border-[#23262d] rounded-2xl p-4 sm:p-5 min-w-0 order-1 lg:order-2">
          {/* Transport Bar (.transport) */}
          <div className="flex items-center gap-4 flex-wrap pb-4 border-b border-[#1a1c21] mb-4">
            {/* Round Play Button (#playBtn) */}
            <button
              onClick={handleTogglePlay}
              className={`w-[54px] height-[54px] h-[54px] rounded-full bg-[#f5b73d] flex items-center justify-center transition-transform hover:brightness-110 shrink-0 ${
                isPlaying ? "animate-pulse-play" : ""
              }`}
              aria-label="Play / Pause"
            >
              {isPlaying ? (
                <div className="w-4 h-4 rounded-sm bg-[#0a0b0d]" />
              ) : (
                <Play className="w-5 h-5 fill-[#0a0b0d] text-[#0a0b0d] ml-0.5" />
              )}
            </button>

            {/* BPM Slider Knob */}
            <div className="flex flex-col gap-1 min-w-[140px] flex-1 sm:flex-initial">
              <div className="flex justify-between font-['JetBrains_Mono'] text-[10px] tracking-[0.14em] text-[#5a5e68]">
                <span>{t("bpm")}</span>
                <b className="text-[#e9e7e0] font-normal tracking-normal">{bpm}</b>
              </div>
              <input
                type="range"
                min="40"
                max="220"
                value={bpm}
                onChange={(e) => setBpm(+e.target.value)}
              />
            </div>

            {/* Swing Slider Knob */}
            <div className="flex flex-col gap-1 min-w-[130px] flex-1 sm:flex-initial">
              <div className="flex justify-between font-['JetBrains_Mono'] text-[10px] tracking-[0.14em] text-[#5a5e68]">
                <span>{t("swing")}</span>
                <b className="text-[#e9e7e0] font-normal tracking-normal">{swing}%</b>
              </div>
              <input
                type="range"
                min="0"
                max="75"
                value={swing}
                onChange={(e) => setSwing(+e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap ml-auto">
              {/* Reset Preset (.t-btn) */}
              <button
                onClick={handleResetPreset}
                className="flex items-center gap-1.5 text-xs text-[#8b8f99] hover:text-[#e9e7e0] hover:border-[#3a3e48] px-3 py-2 border border-[#23262d] rounded-lg transition-colors bg-[#0d0e12]"
                title={t("restore")}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t("restore")}</span>
              </button>

              {/* Export MIDI (.t-btn) */}
              <button
                onClick={handleExportMidi}
                className="flex items-center gap-1.5 text-xs text-[#8b8f99] hover:text-[#e9e7e0] hover:border-[#3a3e48] px-3 py-2 border border-[#23262d] rounded-lg transition-colors bg-[#0d0e12]"
                title={t("export")}
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t("export")}</span>
              </button>

              {/* Share Groove */}
              <button
                onClick={handleShare}
                className="flex items-center gap-1.5 text-xs text-[#8b8f99] hover:text-[#f5b73d] hover:border-[#f5b73d] px-3 py-2 border border-[#23262d] rounded-lg transition-colors bg-[#0d0e12]"
                title={t("share_groove")}
              >
                <Share2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 8 Tracks Sequencer Matrix (#tracks) */}
          <div className="space-y-1 overflow-x-auto min-w-[620px] pb-2 relative">
            {/* Step Indicator Ruler Header (1-16 grouped in 4-beat bars) */}
            <div className="flex items-center gap-3 pb-2 pt-1 border-b border-[#1a1c21] mb-2 min-w-[620px]">
              {/* Left Label aligned with track headers */}
              <div className="flex-none w-[128px] pr-1 flex items-center justify-between font-['JetBrains_Mono'] text-[9px] tracking-[0.14em] text-[#5a5e68] uppercase select-none">
                <span>16-STEP GRID</span>
                <span className="text-[#3a3e48]">4/4</span>
              </div>

              {/* 16 Ruler Step Badges */}
              <div className="flex-1 flex gap-1 relative">
                {Array.from({ length: 16 }, (_, stepIdx) => {
                  const beatNum = Math.floor(stepIdx / 4) + 1;
                  const subStep = (stepIdx % 4) + 1;
                  const isDownbeat = stepIdx % 4 === 0;
                  const isMeasureBreak = stepIdx % 4 === 0 && stepIdx !== 0;
                  const isCurrent = isPlaying && currentStep === stepIdx;
                  const stepStr = String(stepIdx + 1).padStart(2, "0");

                  return (
                    <div
                      key={stepIdx}
                      className={`flex-1 h-7 rounded flex flex-col items-center justify-center transition-all select-none border ${
                        isMeasureBreak ? "ml-2 sm:ml-2.5" : ""
                      } ${
                        isCurrent
                          ? "bg-[#f5b73d]/20 border-[#f5b73d] text-[#f5b73d] shadow-[0_0_12px_rgba(245,183,61,0.35)] font-bold scale-[1.03]"
                          : isDownbeat
                          ? "bg-[#171920] border-[#2b2e38] text-[#e9e7e0]"
                          : "bg-[#101115] border-[#1c1d22] text-[#5a5e68]"
                      }`}
                      title={`Step ${stepIdx + 1} (Beat ${beatNum}.${subStep})`}
                    >
                      <span className="font-['JetBrains_Mono'] text-[10px] leading-tight font-bold tracking-tight">
                        {stepStr}
                      </span>
                      <span className={`font-['JetBrains_Mono'] text-[7.5px] leading-none ${isCurrent ? "text-[#f5b73d]" : isDownbeat ? "text-[#8b8f99]" : "text-[#3e424d]"}`}>
                        {isDownbeat ? `B${beatNum}` : `.${subStep}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {pattern.tracks.map((track, trackIdx) => {
              const meta = DEMO_TRACKS_CONFIG[trackIdx % DEMO_TRACKS_CONFIG.length];
              const isSolo = solos.has(trackIdx);
              const isMute = mutes.has(trackIdx);
              const anySolo = solos.size > 0;
              const isSilenced = isMute || (anySolo && !isSolo);
              const isHatTrack = track.track_id === "hihat" || track.name.toLowerCase().includes("hat");

              return (
                <div
                  key={track.track_id}
                  className={`flex items-center gap-3 py-1.5 transition-opacity ${
                    isSilenced ? "opacity-30" : "opacity-100"
                  }`}
                  style={{ ["--tc" as any]: meta.color }}
                >
                  {/* Track Header (.trk-head) */}
                  <div className="flex-none w-[128px] flex items-center gap-2 pr-1">
                    {/* Glowing vertical swatch */}
                    <span
                      className="w-1 h-7 rounded-sm shadow-[0_0_8px_var(--tc)]"
                      style={{ backgroundColor: meta.color }}
                    />

                    {/* Track Title & Subtitle */}
                    <div className="flex-1 min-w-0">
                      <div className="font-['JetBrains_Mono'] text-[11px] tracking-[0.05em] text-[#e9e7e0] font-bold truncate">
                        {meta.name}
                      </div>
                      <small className="block text-[9px] text-[#5a5e68] tracking-[0.1em] truncate">
                        {meta.sub[language]}
                      </small>
                    </div>

                    {/* Mute / Solo Buttons (.ms) */}
                    <div className="flex gap-1">
                      <button
                        onClick={() => toggleMute(trackIdx)}
                        className={`w-5 h-5 font-['JetBrains_Mono'] text-[9px] border rounded transition-colors flex items-center justify-center ${
                          isMute
                            ? "border-[var(--tc)] text-[var(--tc)] bg-transparent font-bold"
                            : "border-[#23262d] text-[#5a5e68] hover:text-[#e9e7e0]"
                        }`}
                        title="Mute"
                      >
                        M
                      </button>
                      <button
                        onClick={() => toggleSolo(trackIdx)}
                        className={`w-5 h-5 font-['JetBrains_Mono'] text-[9px] border rounded transition-colors flex items-center justify-center ${
                          isSolo
                            ? "border-[#f5b73d] text-[#f5b73d] bg-[#f5b73d]/10 font-bold"
                            : "border-[#23262d] text-[#5a5e68] hover:text-[#e9e7e0]"
                        }`}
                        title="Solo"
                      >
                        S
                      </button>
                    </div>
                  </div>

                  {/* 16 Step Grid (.grid) */}
                  <div className="flex-1 flex gap-1 relative">
                    {track.steps.map((stepVal, stepIdx) => {
                      const isOn = stepVal > 0;
                      const vel = track.velocity && track.velocity[stepIdx] !== undefined ? track.velocity[stepIdx] : 100;
                      const isAcc = vel >= 115;
                      const isPlayhead = isPlaying && currentStep === stepIdx;
                      const isMeasureBreak = stepIdx % 4 === 0 && stepIdx !== 0;

                      // Hat shapes: 1 = closed, 2 = open (round), 3 = triplet roll (striped)
                      const isHatRound = isHatTrack && stepVal === 2;
                      const isHatTriplet = isHatTrack && stepVal === 3;

                      return (
                        <div
                          key={stepIdx}
                          onClick={(e) => handleCellClick(trackIdx, stepIdx, e)}
                          onPointerDown={(e) => handlePointerDown(trackIdx, stepIdx, e)}
                          onPointerEnter={() => handlePointerEnter(trackIdx, stepIdx)}
                          className={`flex-1 h-[34px] border cursor-pointer relative transition-all duration-75 select-none ${
                            isMeasureBreak ? "ml-2 sm:ml-2.5" : ""
                          } ${
                            isHatRound ? "rounded-full" : "rounded"
                          } ${
                            isOn
                              ? "border-transparent shadow-[0_0_9px_var(--tc)]"
                              : "bg-[#17181c] border-[#232529] hover:border-[#3a3e48]"
                          }`}
                          style={{
                            backgroundColor: isOn ? meta.color : undefined,
                            opacity: isOn ? 0.45 + (vel / 127) * 0.55 : 1,
                          }}
                        >
                          {/* Bevel specular highlight on active cells */}
                          {isOn && (
                            <span 
                              className={`absolute inset-0 pointer-events-none ${isHatRound ? "rounded-full" : "rounded"}`}
                              style={{
                                background: isAcc
                                  ? "linear-gradient(180deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.08) 60%)"
                                  : "linear-gradient(180deg, rgba(255,255,255,0.18) 0%, transparent 45%)",
                              }}
                            />
                          )}

                          {/* Triplet roll inner stripes for Hat = 3 */}
                          {isHatTriplet && (
                            <span 
                              className="absolute inset-x-1.5 inset-y-2 pointer-events-none opacity-80"
                              style={{
                                background: "repeating-linear-gradient(180deg, transparent 0 3px, rgba(10,11,13,0.8) 3px 6px)",
                              }}
                            />
                          )}

                          {/* Playhead glow cursor line on this cell */}
                          {isPlayhead && (
                            <span className="absolute inset-0 border border-[#f5b73d] bg-[#f5b73d]/20 rounded pointer-events-none" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom Hint Note (.seq-note) */}
          <div className="mt-3.5 font-['JetBrains_Mono'] text-[10px] text-[#5a5e68] tracking-[0.04em] leading-relaxed border-t border-[#1a1c21] pt-3">
            {language === "zh"
              ? "点击 / 拖动步进格编辑 · SHIFT+点击 = 重音 · HI-HAT 轨单击循环：闭镲 → 开镲 → 三连滚 · 切换曲风即时热替换 Pattern"
              : "Click / drag cells to edit · SHIFT+click = accent · HI-HAT lane cycles: closed → open → triplet roll · Switching genre hot-swaps pattern"}
          </div>
        </section>
      </main>
    </div>
  );
};
