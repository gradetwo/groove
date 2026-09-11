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
  ChevronLeft,
  ChevronDown,
  Info,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Minus,
  Copy,
  Trash2,
  Sparkles,
  Wand2,
  Activity,
  Layers,
  Music,
  Undo2,
  Redo2,
  SlidersHorizontal
} from "lucide-react";
import { Genre, SequencerPattern, SequencerTrack } from "../types/genre";
import { ALL_GENRES, GENRES_MAP } from "../data/genres";
import { AudioEngine } from "../audio/AudioEngine";
import { downloadMidiFile } from "../audio/MidiExporter";
import { encodeSharedSequencer, decodeSharedSequencer, getShareUrl, SharedSequencerState } from "../audio/SequencerUrlShare";
import { useLanguage } from "../i18n/LanguageContext";
import { VelocityLane } from "../components/sequencer/VelocityLane";
import { EuclideanModal } from "../components/sequencer/EuclideanModal";
import { PitchPickerModal, midiToNoteName } from "../components/sequencer/PitchPickerModal";
import { triggerHaptic, HapticPatterns } from "../utils/haptics";
import { noteToMidi, ChordDefinition } from "../utils/chordTheory";

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

const DEMO_GENRE_TAGS: Record<string, string> = {
  "chicago-house": "HOUSE · 1985",
  "house": "HOUSE · 1985",
  "trap": "HIP-HOP × EDM",
  "edm-trap": "HIP-HOP × EDM",
  "atlanta-trap": "TRAP · 140",
  "uk-drill": "UK STREET",
  "drill": "UK STREET",
  "future-bass": "EDM · MELODIC",
  "liquid-dnb": "JUNGLE · 174",
  "dnb": "JUNGLE · 174",
  "reggaeton": "LATIN · URBAN",
  "detroit-techno": "TECHNO · 1985",
  "berlin-techno": "TECHNO · 1989",
  "acid-house": "ACID · 1987",
  "deep-house": "HOUSE · 1988",
  "tech-house": "HOUSE · 1994",
  "progressive-house": "HOUSE · 1992",
  "french-house": "DISCO · 1997",
  "afro-house": "AFRO · 1996",
  "hard-techno": "TECHNO · 1992",
  "dub-techno": "TECHNO · 1993",
  "psytrance": "TRANCE · 1995",
  "uplifting-trance": "TRANCE · 1997",
  "dubstep": "BASS · 2006",
  "melodic-dubstep": "BASS · 2012",
  "riddim": "BASS · 2015",
  "jungle": "JUNGLE · 1992",
  "jump-up-dnb": "DNB · 1996",
  "neurofunk": "DNB · 1997",
  "uk-garage": "GARAGE · 1994",
  "speed-garage": "GARAGE · 1997",
  "grime": "UK BASS · 140",
  "boom-bap": "HIP-HOP · 1990",
  "lofi-hiphop": "CHILL · 2015",
  "synthwave": "RETRO · 2010",
  "cyberpunk-midtempo": "CYBER · 100",
  "ambient": "AMBIENT · 1978",
  "trip-hop": "DOWNTEMPO · 1990",
  "disco": "DISCO · 1974",
  "nu-disco": "DISCO · 2002",
  "funk": "FUNK · 1967",
  "r-and-b": "R&B · 1990",
  "city-pop": "RETRO · 1980",
  "bossa-nova": "LATIN · 1958",
  "afrobeat": "AFRO · 1968",
  "amapiano": "AFRO · 2019",
};

export const getGenreChipTag = (g: Genre): string => {
  if (DEMO_GENRE_TAGS[g.id]) {
    return DEMO_GENRE_TAGS[g.id];
  }

  const id = g.id.toLowerCase();
  const name = g.name.toLowerCase();
  let prefix = "";

  if (id.includes("house") || name.includes("house")) prefix = "HOUSE";
  else if (id.includes("techno") || name.includes("techno")) prefix = "TECHNO";
  else if (id.includes("trance") || name.includes("trance")) prefix = "TRANCE";
  else if (id.includes("dnb") || id.includes("drum-and-bass") || id.includes("jungle")) prefix = "DNB";
  else if (id.includes("dubstep") || id.includes("riddim") || id.includes("bass")) prefix = "BASS";
  else if (id.includes("garage") || id.includes("2-step")) prefix = "GARAGE";
  else if (id.includes("trap")) prefix = "TRAP";
  else if (id.includes("drill")) prefix = "DRILL";
  else if (id.includes("hip-hop") || id.includes("hiphop") || id.includes("rap")) prefix = "HIP-HOP";
  else if (id.includes("disco")) prefix = "DISCO";
  else if (id.includes("funk")) prefix = "FUNK";
  else if (id.includes("jazz")) prefix = "JAZZ";
  else if (id.includes("blues")) prefix = "BLUES";
  else if (id.includes("rock")) prefix = "ROCK";
  else if (id.includes("metal")) prefix = "METAL";
  else if (id.includes("ambient") || id.includes("chill") || id.includes("downtempo")) prefix = "AMBIENT";
  else if (id.includes("latin") || id.includes("salsa") || id.includes("samba")) prefix = "LATIN";
  else if (id.includes("afro") || id.includes("amapiano")) prefix = "AFRO";
  else if (id.includes("synth") || id.includes("cyber") || id.includes("wave")) prefix = "SYNTH";
  else if (id.includes("pop")) prefix = "POP";
  else if (id.includes("rnb") || id.includes("r-and-b")) prefix = "R&B";
  else if (g.category === "Electronic") prefix = "EDM";
  else if (g.category === "Rock/Metal") prefix = "ROCK";
  else if (g.category === "Hip Hop") prefix = "HIP-HOP";
  else if (g.category === "Jazz/Blues") prefix = "JAZZ";
  else if (g.category === "Pop/R&B") prefix = "POP";
  else prefix = "WORLD";

  let suffix = "";
  if (g.origin_year) {
    suffix = g.origin_year.replace(/[^0-9s–-]/g, "").trim() || g.origin_year;
  } else if (g.origin_decade) {
    suffix = `${g.origin_decade}s`;
  } else if (g.default_bpm) {
    suffix = `${g.default_bpm}`;
  } else {
    suffix = "GROOVE";
  }

  return `${prefix} · ${suffix}`;
};

interface StudioViewProps {
  selectedGenre?: Genre;
  onSelectGenre: (genre: Genre) => void;
  onViewDetail: (genre: Genre) => void;
  onAddToCompare?: (genre: Genre) => void;
  onAudioEngineReady?: (engine: AudioEngine) => (() => void) | void;
  initialChords?: ChordDefinition[] | null;
  onClearInitialChords?: () => void;
}

export const StudioView: React.FC<StudioViewProps> = ({
  selectedGenre: initialGenre,
  onSelectGenre,
  onViewDetail,
  onAddToCompare,
  onAudioEngineReady,
  initialChords,
  onClearInitialChords,
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
  const [viewedBar, setViewedBar] = useState<number>(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Mute & Solo sets
  const [mutes, setMutes] = useState<Set<number>>(new Set());
  const [solos, setSolos] = useState<Set<number>>(new Set());

  // Category filter for the chip rail
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>("ALL");

  // Sidebar collapse & Maximize states
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isEditorMaximized, setIsEditorMaximized] = useState<boolean>(false);

  // Meter & quantization
  const [timeSignature, setTimeSignature] = useState<string>(() => currentGenre.time_signature || "4/4");
  const [resolution, setResolution] = useState<"1/8" | "1/16" | "1/32">("1/16");

  // Sequencer matrix scroll container ref
  const matrixContainerRef = useRef<HTMLDivElement | null>(null);
  const [isRulerDragging, setIsRulerDragging] = useState(false);
  const rulerDragStartXRef = useRef(0);
  const rulerDragScrollLeftRef = useRef(0);

  // Pro Sequencer Extensions: Velocity Lane, Euclidean Generator, Pitch Picker & P-Locks
  const [isVelocityLaneOpen, setIsVelocityLaneOpen] = useState(false);
  const [velocityActiveTrackIdx, setVelocityActiveTrackIdx] = useState(0);
  const [isEuclideanOpen, setIsEuclideanOpen] = useState(false);
  const [pitchPicker, setPitchPicker] = useState<{
    isOpen: boolean;
    trackIdx: number;
    stepIdx: number;
    initialNote: number | null;
  }>({ isOpen: false, trackIdx: 0, stepIdx: 0, initialNote: null });
  const [stepContextMenu, setStepContextMenu] = useState<{
    isOpen: boolean;
    x: number;
    y: number;
    trackIdx: number;
    stepIdx: number;
  } | null>(null);
  const [trackFlashTimes, setTrackFlashTimes] = useState<Record<number, number>>({});

  // Mobile / Tablet touch detection & dedicated mobile tools
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  type MobileEditMode = "step" | "accent" | "ratchet" | "pitch" | "plocks";
  const [mobileEditMode, setMobileEditMode] = useState<MobileEditMode>("step");
  const [showAdvancedControls, setShowAdvancedControls] = useState(false);
  const longPressTimerRef = useRef<any>(null);
  const isLongPressRef = useRef(false);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const hasTouchMovedRef = useRef(false);

  useEffect(() => {
    const checkTouch = () => {
      const hasTouch = typeof window !== "undefined" && (
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        (window.matchMedia && window.matchMedia("(pointer: coarse)").matches)
      );
      setIsTouchDevice(hasTouch);
    };
    checkTouch();
  }, []);

  // AudioEngine ref
  const engineRef = useRef<AudioEngine | null>(null);

  // Drag-to-paint state
  const isPointerDownRef = useRef(false);
  const dragValRef = useRef<number | null>(null);
  const hasDraggedRef = useRef(false);

  const genreAccent = useMemo(() => getGenreAccent(currentGenre), [currentGenre]);

  // Toast notification
  const toastTimerRef = useRef<any>(null);
  const showToast = useCallback((msg: string) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToastMessage(msg);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 2400);
  }, []);

  // Operation History Stack for Undo/Redo (Ctrl+Z / Cmd+Z / Ctrl+Y)
  const historyRef = useRef<SequencerPattern[]>([]);
  const futureRef = useRef<SequencerPattern[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const updateUndoRedoState = useCallback(() => {
    setCanUndo(historyRef.current.length > 0);
    setCanRedo(futureRef.current.length > 0);
  }, []);

  const pushHistorySnapshot = useCallback((prevPattern: SequencerPattern) => {
    const copy = JSON.parse(JSON.stringify(prevPattern));
    historyRef.current.push(copy);
    if (historyRef.current.length > 50) {
      historyRef.current.shift();
    }
    futureRef.current = [];
    updateUndoRedoState();
  }, [updateUndoRedoState]);

  const handleUndo = useCallback(() => {
    if (historyRef.current.length === 0) return;
    const previous = historyRef.current.pop()!;
    futureRef.current.push(JSON.parse(JSON.stringify(pattern)));
    setPattern(previous);
    if (engineRef.current) {
      engineRef.current.setPattern(previous);
    }
    updateUndoRedoState();
    triggerHaptic(HapticPatterns.undoRedo);
    showToast(language === "zh" ? "已撤销上一步操作 (Undo) ✓" : "Undone previous action ✓");
  }, [pattern, language, updateUndoRedoState]);

  const handleRedo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    const next = futureRef.current.pop()!;
    historyRef.current.push(JSON.parse(JSON.stringify(pattern)));
    setPattern(next);
    if (engineRef.current) {
      engineRef.current.setPattern(next);
    }
    updateUndoRedoState();
    triggerHaptic(HapticPatterns.undoRedo);
    showToast(language === "zh" ? "已重做操作 (Redo) ✓" : "Redone action ✓");
  }, [pattern, language, updateUndoRedoState]);

  // Initialize engine
  useEffect(() => {
    const engine = new AudioEngine({
      onStep: ({ step }) => {
        setCurrentStep(step);
      },
      onTrackTrigger: (trackIndices) => {
        const now = Date.now();
        setTrackFlashTimes((prev) => {
          const next = { ...prev };
          trackIndices.forEach((idx) => {
            next[idx] = now;
          });
          return next;
        });
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
    engine.setTimeSignature(timeSignature);
    engine.setResolution(resolution);

    const cleanup = onAudioEngineReady ? onAudioEngineReady(engine) : undefined;

    return () => {
      cleanup?.();
      engine.destroy();
    };
  }, []);

  // Cleanup timers on unmount (P0-12)
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, []);

  // Handle chords transferred from ChordProgressionsView (P0-22)
  useEffect(() => {
    if (!initialChords || initialChords.length === 0) return;

    setPattern((prev) => {
      const copy: SequencerPattern = JSON.parse(JSON.stringify(prev));
      let chordTrack = copy.tracks.find(
        (t) => t.track_id === "chords" || t.name.toLowerCase().includes("chord")
      );

      if (!chordTrack && copy.tracks.length > 0) {
        chordTrack = copy.tracks[copy.tracks.length - 1];
      }

      if (chordTrack) {
        const total = chordTrack.steps.length;
        chordTrack.steps = Array(total).fill(0);
        if (!chordTrack.pitch) chordTrack.pitch = Array(total).fill(null);
        if (!chordTrack.velocity) chordTrack.velocity = Array(total).fill(100);

        const chordCount = initialChords.length;
        const stepInterval = Math.max(1, Math.floor(total / chordCount));

        initialChords.forEach((chordDef, idx) => {
          const stepPos = idx * stepInterval;
          if (stepPos < total) {
            chordTrack!.steps[stepPos] = 1;
            chordTrack!.pitch![stepPos] = noteToMidi(chordDef.root, 4);
            chordTrack!.velocity![stepPos] = 105;
          }
        });

        if (engineRef.current) {
          engineRef.current.setPattern(copy);
        }
      }

      return copy;
    });

    showToast(
      language === "zh"
        ? `已成功载入 ${initialChords.length} 个和弦到和弦轨道 ✓`
        : `Loaded ${initialChords.length} chords into track ✓`
    );

    if (onClearInitialChords) {
      onClearInitialChords();
    }
  }, [initialChords, language, onClearInitialChords, showToast]);

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
        if (decoded.timeSignature) setTimeSignature(decoded.timeSignature);
        if (decoded.resolution) setResolution(decoded.resolution as any);

        const newPattern: SequencerPattern = {
          genre_id: decoded.genreId,
          bpm: decoded.bpm,
          scale: decoded.scale || "C minor",
          swing: decoded.swing,
          timeSignature: decoded.timeSignature || "4/4",
          resolution: (decoded.resolution as any) || "1/16",
          totalSteps: decoded.totalSteps || decoded.tracks[0]?.steps?.length || 16,
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
          engineRef.current.setPattern(newPattern, true);
          engineRef.current.setBpm(decoded.bpm);
          engineRef.current.setSwing(decoded.swing / 100);
          if (decoded.timeSignature) engineRef.current.setTimeSignature(decoded.timeSignature);
          if (decoded.resolution) engineRef.current.setResolution(decoded.resolution as any);
        }
        showToast("Shared Pattern Loaded");
      }
    } else if (genreParam && GENRES_MAP[genreParam]) {
      switchGenre(GENRES_MAP[genreParam], false);
    }
  }, []);

  // Sync engine on pattern/bpm/swing/meter change
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

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setTimeSignature(timeSignature);
    }
  }, [timeSignature]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setResolution(resolution);
    }
  }, [resolution]);

  // Mouse wheel listener: allow natural vertical scrolling across the tracks.
  // Shift + Wheel converts to horizontal pan (standard DAW behavior).
  useEffect(() => {
    const el = matrixContainerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.shiftKey && e.deltaY !== 0) {
        if (el.scrollWidth > el.clientWidth) {
          e.preventDefault();
          el.scrollLeft += e.deltaY;
        }
      }
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  // Ruler horizontal drag-to-scroll handler with pointer capture and mobile gesture safety
  const handleRulerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    setIsRulerDragging(true);
    rulerDragStartXRef.current = e.clientX;
    if (matrixContainerRef.current) {
      rulerDragScrollLeftRef.current = matrixContainerRef.current.scrollLeft;
    }
    triggerHaptic(HapticPatterns.slider);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignored
    }
  };

  const handleRulerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isRulerDragging || !matrixContainerRef.current) return;
    const dx = e.clientX - rulerDragStartXRef.current;
    matrixContainerRef.current.scrollLeft = rulerDragScrollLeftRef.current - dx;
  };

  const handleRulerPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isRulerDragging) return;
    setIsRulerDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignored
    }
  };

  // Switch genre (hot swap)
  const switchGenre = (genre: Genre, andPlay = false) => {
    setCurrentGenre(genre);
    onSelectGenre(genre);
    const newBpm = genre.default_bpm || 120;
    const newSwing = genre.sequencer_pattern.swing || 0;
    const newSig = genre.time_signature || "4/4";
    const newPattern = JSON.parse(JSON.stringify(genre.sequencer_pattern));

    setBpm(newBpm);
    setSwing(newSwing);
    setTimeSignature(newSig);
    setResolution("1/16");
    setPattern(newPattern);
    setMutes(new Set());
    setSolos(new Set());

    if (engineRef.current) {
      engineRef.current.setPattern(newPattern, true);
      engineRef.current.setBpm(newBpm);
      engineRef.current.setSwing(newSwing / 100);
      engineRef.current.setTimeSignature(newSig);
      engineRef.current.setResolution("1/16");
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

  // Keyboard shortcuts: Space (play/pause), Esc (exit/close), V (Velocity), E (Euclidean)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
         target.tagName === "TEXTAREA" ||
         target.tagName === "SELECT" ||
         target.isContentEditable ||
         Boolean(target.closest("input, textarea, select, [contenteditable]")))
      ) {
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.key === "Escape") {
        if (stepContextMenu) {
          setStepContextMenu(null);
        } else if (pitchPicker.isOpen) {
          setPitchPicker((prev) => ({ ...prev, isOpen: false }));
        } else if (isEuclideanOpen) {
          setIsEuclideanOpen(false);
        } else if (isVelocityLaneOpen) {
          setIsVelocityLaneOpen(false);
        } else if (isEditorMaximized) {
          e.preventDefault();
          setIsEditorMaximized(false);
        }
      } else if ((e.key === "v" || e.key === "V") && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setIsVelocityLaneOpen((prev) => !prev);
      } else if ((e.key === "e" || e.key === "E") && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setIsEuclideanOpen(true);
      } else {
        const isMac = typeof navigator !== "undefined" && /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform);
        const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

        if (isCmdOrCtrl && (e.key === "z" || e.key === "Z")) {
          e.preventDefault();
          if (e.shiftKey) {
            handleRedo();
          } else {
            handleUndo();
          }
        } else if (isCmdOrCtrl && (e.key === "y" || e.key === "Y")) {
          e.preventDefault();
          handleRedo();
        }
      }
    };

    const handleGlobalClick = () => {
      setStepContextMenu(null);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("click", handleGlobalClick);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("click", handleGlobalClick);
    };
  }, [isPlaying, isEditorMaximized, stepContextMenu, pitchPicker.isOpen, isEuclideanOpen, isVelocityLaneOpen, handleUndo, handleRedo]);

  // Step Pointer & Long-Press Handlers (Unifies Touch & Mouse, Eliminating Synthetic Double Triggers - P0-13)
  const handleStepPointerDown = (trackIdx: number, stepIdx: number, e: React.PointerEvent) => {
    if (e.pointerType === "touch") {
      isLongPressRef.current = false;
      hasTouchMovedRef.current = false;
      const clientX = e.clientX;
      const clientY = e.clientY;
      touchStartPosRef.current = { x: clientX, y: clientY };

      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }

      longPressTimerRef.current = setTimeout(() => {
        isLongPressRef.current = true;
        triggerHaptic(HapticPatterns.doubleTap);
        setStepContextMenu({
          isOpen: true,
          x: clientX,
          y: clientY,
          trackIdx,
          stepIdx,
        });
      }, 450);
      return;
    }

    // Mouse pointer down: desktop drag-paint or modifier clicks
    handlePointerDown(trackIdx, stepIdx, e);
  };

  const handleStepPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === "touch" && touchStartPosRef.current) {
      const dist = Math.hypot(
        e.clientX - touchStartPosRef.current.x,
        e.clientY - touchStartPosRef.current.y
      );
      if (dist > 8) {
        hasTouchMovedRef.current = true;
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
      }
    }
  };

  const handleStepPointerUp = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    touchStartPosRef.current = null;
  };

  // Step Cell interaction
  const handleCellClick = (trackIdx: number, stepIdx: number, e: React.MouseEvent) => {
    if (isLongPressRef.current) {
      isLongPressRef.current = false;
      return;
    }
    if (hasTouchMovedRef.current) {
      hasTouchMovedRef.current = false;
      return;
    }
    if (hasDraggedRef.current) {
      hasDraggedRef.current = false;
      return;
    }

    const tr = pattern.tracks[trackIdx];
    if (!tr) return;
    const isHat = tr.track_id === "hihat" || tr.name.toLowerCase().includes("hat");
    const isMelodic = tr.track_id === "bass" || tr.track_id === "chords" || tr.track_id === "lead";
    const cur = tr.steps[stepIdx] || 0;

    pushHistorySnapshot(pattern);
    triggerHaptic(mobileEditMode === "accent" ? HapticPatterns.accent : HapticPatterns.tap);

    // Dedicated Tool Mode Actions (Mobile Touch Ribbon or Desktop Click)
    if (mobileEditMode === "accent") {
      let newVel = 100;
      setPattern((prev) => {
        const copy = JSON.parse(JSON.stringify(prev));
        const t = copy.tracks[trackIdx];
        if (t.steps[stepIdx] === 0) t.steps[stepIdx] = 1;
        if (!t.velocity) t.velocity = Array(stepCount).fill(100);
        newVel = (t.velocity[stepIdx] || 100) >= 115 ? 90 : 127;
        t.velocity[stepIdx] = newVel;
        return copy;
      });
      if (engineRef.current) {
        const pitch = tr.pitch && tr.pitch[stepIdx] ? tr.pitch[stepIdx] : 0;
        engineRef.current.triggerNote(trackIdx, tr.name, newVel / 127, pitch, cur || 1);
      }
      return;
    }

    if (mobileEditMode === "ratchet") {
      let nextRatchet = 2;
      setPattern((prev) => {
        const copy = JSON.parse(JSON.stringify(prev));
        const t = copy.tracks[trackIdx];
        if (t.steps[stepIdx] === 0) {
          t.steps[stepIdx] = 1;
          if (!t.velocity) t.velocity = Array(stepCount).fill(100);
          t.velocity[stepIdx] = 100;
        }
        if (!t.ratchet) t.ratchet = Array(stepCount).fill(1);
        const curR = t.ratchet[stepIdx] || 1;
        nextRatchet = curR === 1 ? 2 : curR === 2 ? 3 : curR === 3 ? 4 : 1;
        t.ratchet[stepIdx] = nextRatchet;
        return copy;
      });
      if (engineRef.current) {
        const pitch = tr.pitch && tr.pitch[stepIdx] ? tr.pitch[stepIdx] : 0;
        const vel = (tr.velocity && tr.velocity[stepIdx] ? tr.velocity[stepIdx] : 100) / 127;
        engineRef.current.triggerNote(trackIdx, tr.name, vel, pitch, cur || 1);
      }
      return;
    }

    if (mobileEditMode === "pitch" && isMelodic) {
      if (cur === 0) {
        setPattern((prev) => {
          const copy = JSON.parse(JSON.stringify(prev));
          const t = copy.tracks[trackIdx];
          t.steps[stepIdx] = 1;
          if (!t.velocity) t.velocity = Array(stepCount).fill(100);
          t.velocity[stepIdx] = 100;
          return copy;
        });
      }
      const currentPitch = tr.pitch?.[stepIdx] || (tr.track_id === "bass" ? 36 : 60);
      setPitchPicker({
        isOpen: true,
        trackIdx,
        stepIdx,
        initialNote: currentPitch,
      });
      return;
    }

    if (mobileEditMode === "plocks") {
      setStepContextMenu({
        isOpen: true,
        x: e.clientX || window.innerWidth / 2,
        y: e.clientY || window.innerHeight / 2,
        trackIdx,
        stepIdx,
      });
      return;
    }

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

    // ALT + click = Ratchet / Subdivisions cycle (1x -> 2x -> 3x -> 4x -> 1x)
    if (e.altKey) {
      let nextRatchet = 2;
      setPattern((prev) => {
        const copy = JSON.parse(JSON.stringify(prev));
        const t = copy.tracks[trackIdx];
        if (t.steps[stepIdx] === 0) {
          t.steps[stepIdx] = 1;
          if (!t.velocity) t.velocity = Array(stepCount).fill(100);
          t.velocity[stepIdx] = 100;
        }
        if (!t.ratchet) t.ratchet = Array(stepCount).fill(1);
        const curR = t.ratchet[stepIdx] || 1;
        nextRatchet = curR === 1 ? 2 : curR === 2 ? 3 : curR === 3 ? 4 : 1;
        t.ratchet[stepIdx] = nextRatchet;
        return copy;
      });
      if (engineRef.current) {
        const pitch = tr.pitch && tr.pitch[stepIdx] ? tr.pitch[stepIdx] : 0;
        const vel = (tr.velocity && tr.velocity[stepIdx] ? tr.velocity[stepIdx] : 100) / 127;
        engineRef.current.triggerNote(trackIdx, tr.name, vel, pitch, cur || 1);
      }
      return;
    }

    // Melodic track note picker shortcut (Cmd/Ctrl + click on step)
    if ((e.metaKey || e.ctrlKey) && isMelodic) {
      if (cur === 0) {
        setPattern((prev) => {
          const copy = JSON.parse(JSON.stringify(prev));
          const t = copy.tracks[trackIdx];
          t.steps[stepIdx] = 1;
          if (!t.velocity) t.velocity = Array(stepCount).fill(100);
          t.velocity[stepIdx] = 100;
          return copy;
        });
      }
      const currentPitch = tr.pitch?.[stepIdx] || (tr.track_id === "bass" ? 36 : 60);
      setPitchPicker({
        isOpen: true,
        trackIdx,
        stepIdx,
        initialNote: currentPitch,
      });
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
          if (!t.velocity) t.velocity = Array(stepCount).fill(100);
          t.velocity[stepIdx] = 100;
        }
        return copy;
      });
      if (nextVal > 0 && engineRef.current) {
        const pitch = tr.pitch && tr.pitch[stepIdx] ? tr.pitch[stepIdx] : 0;
        const vel = (tr.velocity && tr.velocity[stepIdx] ? tr.velocity[stepIdx] : 100) / 127;
        engineRef.current.triggerNote(trackIdx, tr.name, vel, pitch, nextVal);
      }
      return;
    }

    // Touch tap standard note toggle (or fallback if pointerdown did not already toggle it)
    const isTouchInteraction = isTouchDevice || (e.nativeEvent && (e.nativeEvent as any).pointerType === "touch");
    if (isTouchInteraction || dragValRef.current === null) {
      const nextVal = cur > 0 ? 0 : 1;
      setPattern((prev) => {
        const copy = JSON.parse(JSON.stringify(prev));
        const t = copy.tracks[trackIdx];
        t.steps[stepIdx] = nextVal;
        if (nextVal > 0) {
          if (!t.velocity) t.velocity = Array(stepCount).fill(100);
          t.velocity[stepIdx] = 100;
        }
        return copy;
      });
      if (nextVal > 0 && engineRef.current) {
        const pitch = tr.pitch && tr.pitch[stepIdx] ? tr.pitch[stepIdx] : 0;
        const vel = (tr.velocity && tr.velocity[stepIdx] ? tr.velocity[stepIdx] : 100) / 127;
        engineRef.current.triggerNote(trackIdx, tr.name, vel, pitch, nextVal);
      }
    }
    dragValRef.current = null;
  };

  // Right-click step context menu (P-Locks & Parameters)
  const handleStepContextMenu = (trackIdx: number, stepIdx: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setStepContextMenu({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
      trackIdx,
      stepIdx,
    });
  };

  // Polymeter: cycle independent track length
  const handleCycleTrackLength = (trackIdx: number) => {
    const lengths = [stepCount, 12, 8, 7, 5, 3];
    setPattern((prev) => {
      const copy = JSON.parse(JSON.stringify(prev));
      const t = copy.tracks[trackIdx];
      const curLen = t.trackLength || stepCount;
      const curIdx = lengths.indexOf(curLen);
      const nextLen = lengths[(curIdx + 1) % lengths.length];
      t.trackLength = nextLen === stepCount ? undefined : nextLen;
      return copy;
    });
  };

  // Pointer drag painting (for mouse desktop)
  const handlePointerDown = (trackIdx: number, stepIdx: number, e: React.PointerEvent) => {
    if (isTouchDevice || e.pointerType === "touch") return;
    if (e.button !== 0) return;
    isPointerDownRef.current = true;
    hasDraggedRef.current = false;

    const tr = pattern.tracks[trackIdx];
    if (!tr) return;
    const isHat = tr.track_id === "hihat" || tr.name.toLowerCase().includes("hat");

    // Let click handler process shiftKey, altKey, ctrlKey, metaKey, hi-hat cycling, and dedicated tool modes
    if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey || isHat || mobileEditMode !== "step") return;

    const cur = tr.steps[stepIdx] || 0;
    const nextVal = cur > 0 ? 0 : 1;
    dragValRef.current = nextVal;

    pushHistorySnapshot(pattern);
    triggerHaptic(HapticPatterns.tap);

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
    pushHistorySnapshot(pattern);
    switchGenre(currentGenre, false);
    triggerHaptic(HapticPatterns.undoRedo);
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
      timeSignature,
      resolution,
      totalSteps: pattern.tracks[0]?.steps?.length || 16,
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

  // Step & meter calculations
  // Step & meter calculations
  const stepCount = pattern.tracks[0]?.steps?.length || 16;

  const [timeNum, timeDenom] = useMemo(() => {
    const parts = (timeSignature || "4/4").split("/");
    return [parseInt(parts[0], 10) || 4, parseInt(parts[1], 10) || 4];
  }, [timeSignature]);

  // Group size defines how many steps form a visual chunk (e.g. 3 for 3/4, 2 for 2/4, 4 for 4/4)
  const groupSize = useMemo(() => {
    if (timeNum === 3 || timeNum === 6 || timeNum === 9 || timeNum === 12) return 3;
    if (timeNum === 2) return 2;
    if (timeNum === 5) return 5;
    if (timeNum === 7) return 7;
    return 4;
  }, [timeNum]);

  // Steps per bar in the sequencer (P0-10: universal formula for any meter & resolution)
  const stepsPerBar = useMemo(() => {
    const stepsPerWholeNote = resolution === "1/8" ? 8 : resolution === "1/32" ? 32 : 16;
    return Math.max(1, Math.round(timeNum * (stepsPerWholeNote / timeDenom)));
  }, [timeNum, timeDenom, resolution]);

  const stepsPerBeat = useMemo(() => {
    const stepsPerWholeNote = resolution === "1/8" ? 8 : resolution === "1/32" ? 32 : 16;
    return Math.max(1, Math.round(stepsPerWholeNote / timeDenom));
  }, [resolution, timeDenom]);

  const barCount = Math.max(1, Math.ceil(stepCount / stepsPerBar));

  // Change time signature and adapt grid length accordingly
  const handleTimeSignatureChange = (newSig: string) => {
    setTimeSignature(newSig);

    const parts = newSig.split("/");
    const newNum = parseInt(parts[0], 10) || 4;
    const newDenom = parseInt(parts[1], 10) || 4;

    let targetSteps = 16;
    if (newNum === 3) {
      // 3/4: 12 steps (4 groups of 3) or 24 steps
      targetSteps = stepCount > 15 ? 24 : 12;
    } else if (newNum === 2) {
      // 2/4: 16 steps (8 groups of 2, or 2 bars of 8) or 8 steps
      targetSteps = stepCount <= 8 ? 8 : 16;
    } else if (newNum === 6) {
      // 6/8: 12 steps (4 groups of 3) or 24
      targetSteps = stepCount > 15 ? 24 : 12;
    } else if (newNum === 5) {
      targetSteps = stepCount > 15 ? 20 : 15;
    } else if (newNum === 7) {
      targetSteps = stepCount > 14 ? 21 : 14;
    } else if (newNum === 9) {
      targetSteps = stepCount > 12 ? 18 : 9;
    } else if (newNum === 12) {
      targetSteps = stepCount > 16 ? 24 : 12;
    } else {
      // 4/4, 2/2 etc.
      targetSteps = stepCount > 20 ? 32 : 16;
    }

    setPattern((prev) => {
      const copy = JSON.parse(JSON.stringify(prev));
      copy.timeSignature = newSig;
      copy.totalSteps = targetSteps;
      copy.tracks.forEach((tr: SequencerTrack) => {
        const oldSteps = tr.steps || [];
        const oldVel = tr.velocity || [];
        const oldPitch = tr.pitch || [];

        if (targetSteps > oldSteps.length) {
          const diff = targetSteps - oldSteps.length;
          tr.steps = [...oldSteps, ...Array(diff).fill(0)];
          tr.velocity = [...oldVel, ...Array(diff).fill(100)];
          tr.pitch = [...oldPitch, ...Array(diff).fill(null)];
        } else {
          tr.steps = oldSteps.slice(0, targetSteps);
          tr.velocity = oldVel.slice(0, targetSteps);
          tr.pitch = oldPitch.slice(0, targetSteps);
        }
      });

      if (engineRef.current) {
        engineRef.current.setTimeSignature(newSig);
        engineRef.current.setTotalSteps(targetSteps);
        engineRef.current.setPattern(copy);
      }
      return copy;
    });

    const meterDesc = newNum === 3 
      ? (language === "zh" ? "三拍子 (3格一组)" : "3 steps/group")
      : newNum === 2 
      ? (language === "zh" ? "二拍子 (2格一组)" : "2 steps/group")
      : (language === "zh" ? "四拍子 (4格一组)" : "4 steps/group");

    showToast(
      language === "zh"
        ? `已切换至 ${newSig} 节拍：${meterDesc}，网格已自适应为 ${targetSteps} 步`
        : `Switched to ${newSig} (${meterDesc}, ${targetSteps} steps)`
    );
  };

  // Change resolution and adapt grid length accordingly
  const handleResolutionChange = (newRes: "1/8" | "1/16" | "1/32") => {
    setResolution(newRes);

    const stepsPerQuarter = newRes === "1/8" ? 2 : newRes === "1/32" ? 8 : 4;
    const newStepsPerBeat = Math.max(1, Math.round(stepsPerQuarter * (4 / timeDenom)));
    const newStepsPerBar = timeNum * newStepsPerBeat;

    const currentBars = Math.max(1, Math.round(stepCount / stepsPerBar));
    const targetSteps = Math.max(newStepsPerBar, currentBars * newStepsPerBar);

    setPattern((prev) => {
      const copy = JSON.parse(JSON.stringify(prev));
      copy.resolution = newRes;
      copy.totalSteps = targetSteps;
      copy.tracks.forEach((tr: SequencerTrack) => {
        const oldSteps = tr.steps || [];
        const oldVel = tr.velocity || [];
        const oldPitch = tr.pitch || [];

        if (targetSteps > oldSteps.length) {
          const diff = targetSteps - oldSteps.length;
          tr.steps = [...oldSteps, ...Array(diff).fill(0)];
          tr.velocity = [...oldVel, ...Array(diff).fill(100)];
          tr.pitch = [...oldPitch, ...Array(diff).fill(null)];
        } else {
          tr.steps = oldSteps.slice(0, targetSteps);
          tr.velocity = oldVel.slice(0, targetSteps);
          tr.pitch = oldPitch.slice(0, targetSteps);
        }
      });

      if (engineRef.current) {
        engineRef.current.setResolution(newRes);
        engineRef.current.setTotalSteps(targetSteps);
        engineRef.current.setPattern(copy);
      }
      return copy;
    });

    showToast(
      language === "zh"
        ? `量化精度设为 ${newRes}：网格调整为 ${targetSteps} 步`
        : `Quantization set to ${newRes} (${targetSteps} steps)`
    );
  };

  // Auto-scrolling and navigation helpers
  const scrollByPixels = (px: number) => {
    if (matrixContainerRef.current) {
      matrixContainerRef.current.scrollBy({ left: px, behavior: "smooth" });
    }
  };

  const scrollToBar = (barIdx: number) => {
    setViewedBar(barIdx);
    if (!matrixContainerRef.current) return;
    const targetStep = barIdx * stepsPerBar;
    const targetEl = matrixContainerRef.current.querySelector(`[data-step-idx="${targetStep}"]`) as HTMLElement | null;
    if (targetEl) {
      const containerRect = matrixContainerRef.current.getBoundingClientRect();
      const targetRect = targetEl.getBoundingClientRect();
      const offset = targetRect.left - containerRect.left - 180;
      matrixContainerRef.current.scrollBy({ left: offset, behavior: "smooth" });
    } else {
      matrixContainerRef.current.scrollTo({
        left: targetStep * 32,
        behavior: "smooth",
      });
    }
  };

  // Step adding & trimming (+4 steps / -4 steps / +1 bar / +4 bars)
  const handleAddSteps = (count = 4) => {
    setPattern((prev) => {
      const copy = JSON.parse(JSON.stringify(prev));
      copy.tracks.forEach((tr: SequencerTrack) => {
        tr.steps = [...tr.steps, ...Array(count).fill(0)];
        if (tr.velocity) tr.velocity = [...tr.velocity, ...Array(count).fill(100)];
        if (tr.pitch) tr.pitch = [...tr.pitch, ...Array(count).fill(null)];
      });
      const newLen = copy.tracks[0]?.steps.length || 16;
      copy.totalSteps = newLen;
      if (engineRef.current) {
        engineRef.current.setTotalSteps(newLen);
        engineRef.current.setPattern(copy);
      }
      return copy;
    });

    // Auto scroll right to reveal newly added steps
    setTimeout(() => {
      if (matrixContainerRef.current) {
        matrixContainerRef.current.scrollTo({
          left: matrixContainerRef.current.scrollWidth,
          behavior: "smooth",
        });
      }
    }, 60);

    showToast(language === "zh" ? `已添加 +${count} 步 (共 ${stepCount + count} 步)` : `Added +${count} steps (${stepCount + count} total)`);
  };

  const handleRemoveSteps = (count = 4) => {
    if (stepCount <= 4) {
      showToast(language === "zh" ? "最少保留 4 步" : "Minimum 4 steps");
      return;
    }
    const newLen = Math.max(4, stepCount - count);
    setPattern((prev) => {
      const copy = JSON.parse(JSON.stringify(prev));
      copy.tracks.forEach((tr: SequencerTrack) => {
        tr.steps = tr.steps.slice(0, newLen);
        if (tr.velocity) tr.velocity = tr.velocity.slice(0, newLen);
        if (tr.pitch) tr.pitch = tr.pitch.slice(0, newLen);
      });
      copy.totalSteps = newLen;
      if (engineRef.current) {
        engineRef.current.setTotalSteps(newLen);
        engineRef.current.setPattern(copy);
      }
      return copy;
    });
    showToast(language === "zh" ? `已删减 -${count} 步 (共 ${newLen} 步)` : `Removed -${count} steps (${newLen} total)`);
  };

  const handleSetStepCount = (target: number) => {
    if (target === stepCount) return;
    const isExpanding = target > stepCount;
    setPattern((prev) => {
      const copy = JSON.parse(JSON.stringify(prev));
      copy.tracks.forEach((tr: SequencerTrack) => {
        if (target > tr.steps.length) {
          const diff = target - tr.steps.length;
          tr.steps = [...tr.steps, ...Array(diff).fill(0)];
          if (tr.velocity) tr.velocity = [...tr.velocity, ...Array(diff).fill(100)];
          if (tr.pitch) tr.pitch = [...tr.pitch, ...Array(diff).fill(null)];
        } else {
          tr.steps = tr.steps.slice(0, target);
          if (tr.velocity) tr.velocity = tr.velocity.slice(0, target);
          if (tr.pitch) tr.pitch = tr.pitch.slice(0, target);
        }
      });
      copy.totalSteps = target;
      if (engineRef.current) {
        engineRef.current.setTotalSteps(target);
        engineRef.current.setPattern(copy);
      }
      return copy;
    });

    if (isExpanding) {
      setTimeout(() => {
        if (matrixContainerRef.current) {
          matrixContainerRef.current.scrollTo({
            left: matrixContainerRef.current.scrollWidth,
            behavior: "smooth",
          });
        }
      }, 60);
    }

    showToast(language === "zh" ? `步长设置为 ${target} 步` : `Grid set to ${target} steps`);
  };

  // Duplicate Bar 1 to subsequent bars
  const handleDuplicateBar1 = () => {
    pushHistorySnapshot(pattern);
    triggerHaptic(HapticPatterns.tap);
    if (stepCount <= stepsPerBar) {
      handleAddSteps(stepsPerBar);
    }
    setPattern((prev) => {
      const copy = JSON.parse(JSON.stringify(prev));
      copy.tracks.forEach((tr: SequencerTrack) => {
        const bar1Steps = tr.steps.slice(0, stepsPerBar);
        const bar1Vel = tr.velocity ? tr.velocity.slice(0, stepsPerBar) : Array(stepsPerBar).fill(100);
        const bar1Pitch = tr.pitch ? tr.pitch.slice(0, stepsPerBar) : Array(stepsPerBar).fill(null);
        
        for (let i = stepsPerBar; i < tr.steps.length; i++) {
          tr.steps[i] = bar1Steps[i % stepsPerBar];
          if (tr.velocity) tr.velocity[i] = bar1Vel[i % stepsPerBar];
          if (tr.pitch) tr.pitch[i] = bar1Pitch[i % stepsPerBar];
        }
      });
      if (engineRef.current) {
        engineRef.current.setPattern(copy);
      }
      return copy;
    });
    showToast(language === "zh" ? "已将第 1 小节复制到全部小节" : "Duplicated Bar 1 to all bars");
  };

  // Clear all steps
  const handleClearAll = () => {
    pushHistorySnapshot(pattern);
    triggerHaptic(HapticPatterns.undoRedo);
    setPattern((prev) => {
      const copy = JSON.parse(JSON.stringify(prev));
      copy.tracks.forEach((tr: SequencerTrack) => {
        tr.steps = Array(tr.steps.length).fill(0);
      });
      if (engineRef.current) {
        engineRef.current.setPattern(copy);
      }
      return copy;
    });
    showToast(language === "zh" ? "已清空所有轨道步进" : "Cleared all pattern steps");
  };

  // Humanize velocity
  const handleHumanize = () => {
    pushHistorySnapshot(pattern);
    triggerHaptic(HapticPatterns.tap);
    setPattern((prev) => {
      const copy = JSON.parse(JSON.stringify(prev));
      copy.tracks.forEach((tr: SequencerTrack) => {
        const vel = tr.velocity ? [...tr.velocity] : Array(tr.steps.length).fill(100);
        tr.steps.forEach((v: number, idx: number) => {
          if (v > 0) {
            const delta = Math.floor(Math.random() * 21) - 10;
            vel[idx] = Math.max(50, Math.min(127, (vel[idx] || 100) + delta));
          }
        });
        tr.velocity = vel;
      });
      if (engineRef.current) {
        engineRef.current.setPattern(copy);
      }
      return copy;
    });
    showToast(language === "zh" ? "已注入微力度拟人化 (±10%)" : "Humanized note velocities (±10%)");
  };

  // Track shift left/right
  const handleShiftTrack = (trackIdx: number, dir: -1 | 1) => {
    pushHistorySnapshot(pattern);
    triggerHaptic(HapticPatterns.slider);
    setPattern((prev) => {
      const copy = JSON.parse(JSON.stringify(prev));
      const tr = copy.tracks[trackIdx];
      const len = tr.steps.length;
      if (dir === 1) {
        tr.steps = [tr.steps[len - 1], ...tr.steps.slice(0, len - 1)];
        if (tr.velocity) tr.velocity = [tr.velocity[len - 1], ...tr.velocity.slice(0, len - 1)];
        if (tr.pitch) tr.pitch = [tr.pitch[len - 1], ...tr.pitch.slice(0, len - 1)];
      } else {
        tr.steps = [...tr.steps.slice(1), tr.steps[0]];
        if (tr.velocity) tr.velocity = [...tr.velocity.slice(1), tr.velocity[0]];
        if (tr.pitch) tr.pitch = [...tr.pitch.slice(1), tr.pitch[0]];
      }
      if (engineRef.current) {
        engineRef.current.setPattern(copy);
      }
      return copy;
    });
  };

  // Smart Fill for a track
  const handleSmartFillTrack = (trackIdx: number) => {
    setPattern((prev) => {
      const copy = JSON.parse(JSON.stringify(prev));
      const tr = copy.tracks[trackIdx];
      const tid = tr.track_id;
      const len = tr.steps.length;
      tr.steps = Array(len).fill(0);
      if (!tr.velocity) tr.velocity = Array(len).fill(100);

      for (let i = 0; i < len; i++) {
        const beatPos = i % stepsPerBeat;
        const beatNum = Math.floor(i / stepsPerBeat) % timeNum;
        if (tid === "kick") {
          if (beatPos === 0) { tr.steps[i] = 1; tr.velocity[i] = 120; }
        } else if (tid === "snare") {
          if ((beatNum === 1 || beatNum === 3) && beatPos === 0) { tr.steps[i] = 1; tr.velocity[i] = 115; }
        } else if (tid === "hihat") {
          if (i % 2 === 0) { tr.steps[i] = (i % 4 === 2) ? 2 : 1; tr.velocity[i] = (i % 4 === 2) ? 90 : 75; }
        } else if (tid === "bass") {
          if (beatPos === 2 || (beatPos === 0 && beatNum % 2 === 0)) { tr.steps[i] = 1; tr.velocity[i] = 110; }
        } else if (tid === "chords") {
          if (beatPos === 2) { tr.steps[i] = 1; tr.velocity[i] = 95; }
        } else if (tid === "percussion") {
          if (beatPos === 3 || (beatNum === 2 && beatPos === 1)) { tr.steps[i] = 1; tr.velocity[i] = 85; }
        } else {
          if (i % stepsPerBar === 0) { tr.steps[i] = 1; tr.velocity[i] = 90; }
        }
      }
      if (engineRef.current) {
        engineRef.current.setPattern(copy);
      }
      return copy;
    });
    showToast(language === "zh" ? `已智能填充 ${pattern.tracks[trackIdx].name}` : `Smart filled ${pattern.tracks[trackIdx].name}`);
  };

  // Clear single track
  const handleClearTrack = (trackIdx: number) => {
    setPattern((prev) => {
      const copy = JSON.parse(JSON.stringify(prev));
      copy.tracks[trackIdx].steps = Array(copy.tracks[trackIdx].steps.length).fill(0);
      if (engineRef.current) {
        engineRef.current.setPattern(copy);
      }
      return copy;
    });
    showToast(language === "zh" ? `已清空 ${pattern.tracks[trackIdx].name}` : `Cleared ${pattern.tracks[trackIdx].name}`);
  };

  // Track volume change
  const handleTrackVolumeChange = (trackIdx: number, vol: number) => {
    setPattern((prev) => {
      const copy = JSON.parse(JSON.stringify(prev));
      copy.tracks[trackIdx].volume = vol;
      return copy;
    });
    if (engineRef.current) {
      engineRef.current.setTrackState(trackIdx, { volume: vol });
    }
  };

  // Filtered chip list for rail
  const railGenres = useMemo(() => {
    if (activeCategoryFilter === "ALL") {
      const demoHeadIds = [
        "chicago-house",
        "edm-trap",
        "uk-drill",
        "future-bass",
        "liquid-dnb",
        "reggaeton",
        "detroit-techno",
        "boom-bap",
        "synthwave",
        "dubstep",
        "nu-disco",
        "acid-house",
      ];
      const headList = demoHeadIds.map((id) => GENRES_MAP[id]).filter(Boolean) as Genre[];
      const others = ALL_GENRES.filter((g) => !demoHeadIds.includes(g.id));
      return [...headList, ...others].slice(0, 48);
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
        {/* Category selector */}
        <select
          value={activeCategoryFilter}
          onChange={(e) => setActiveCategoryFilter(e.target.value)}
          className="bg-[#121317] border border-[#2b2e38] hover:border-[#f5b73d] text-[#e9e7e0] text-xs font-semibold px-3 py-2 rounded-xl outline-none cursor-pointer transition-colors shadow-sm"
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
                className={`flex-none flex flex-col gap-0.5 px-3.5 py-2 border rounded-xl bg-[#121317] min-w-[124px] text-left transition-all relative ${
                  isCurrent
                    ? "border-[var(--g)] shadow-[0_0_14px_rgba(245,183,61,0.2)] bg-[#171920]"
                    : "border-[#23262d] hover:border-[#3a3e48] hover:-translate-y-0.5"
                }`}
                style={{ ["--g" as any]: accent }}
              >
                <span 
                  className={`font-['Space_Grotesk'] font-bold text-sm tracking-wide truncate ${
                    isCurrent ? "text-[var(--g)]" : "text-[#f0ede6]"
                  }`}
                >
                  {g.name}
                </span>
                <span 
                  className={`font-mono text-[9.5px] uppercase tracking-[0.14em] truncate ${
                    isCurrent ? "text-[var(--g)] opacity-95 font-bold" : "text-[#8b8f99]"
                  }`}
                >
                  {getGenreChipTag(g)}
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
      <main
        className={`grid ${
          isSidebarCollapsed || isEditorMaximized
            ? "grid-cols-1"
            : "grid-cols-1 lg:grid-cols-[352px_1fr]"
        } gap-5 px-4 sm:px-7 py-3 pb-16 items-start`}
      >
        {/* Left Column: Info Dossier (.info) */}
        {!isSidebarCollapsed && !isEditorMaximized && (
          <aside className="sticky top-16 flex flex-col gap-3.5 order-2 lg:order-1">
            {/* Hero Genre Card (.blk.g-head) */}
            <div className="bg-[#121317] border border-[#23262d] rounded-xl p-4 sm:p-4.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-['Space_Grotesk'] font-bold text-2xl sm:text-[26px] leading-[1.15] text-[var(--g)] tracking-tight">
                    {currentGenre.name}
                  </div>
                  <div className="text-xs text-[#8b8f99] mt-1 font-medium">
                    {currentGenre.aliases.length > 0 ? currentGenre.aliases[0] : currentGenre.category}
                  </div>
                </div>
                <button
                  onClick={() => setIsSidebarCollapsed(true)}
                  className="p-1.5 text-[#8b8f99] hover:text-[#e9e7e0] rounded-lg hover:bg-[#1a1c21] transition-colors shrink-0"
                  title={language === "zh" ? "收起左侧信息栏" : "Collapse sidebar"}
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>
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
                    {timeSignature || currentGenre.time_signature || "4/4"}
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
        )}

        {/* Right Column: The Sequencer (.seq) */}
        <section
          className={
            isEditorMaximized
              ? "fixed inset-0 z-50 overflow-y-auto bg-[#0a0b0d] p-2.5 sm:p-3.5 flex flex-col"
              : "bg-[#121317] border border-[#23262d] rounded-2xl p-3 sm:p-4 min-w-0 order-1 lg:order-2 shadow-2xl"
          }
        >
          {/* Sequencer Unified Toolbar (Scales to a single line in Fullscreen, streamlined in Normal mode) */}
          <div className="w-full flex items-center justify-between gap-1.5 sm:gap-2 pb-2.5 mb-2 border-b border-[#1a1c21] overflow-x-auto whitespace-nowrap scrollbar-none select-none shrink-0">
            {/* Left Section: Playback & Primary Sequencer Selectors */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* Fullscreen Mode: Genre Badge */}
              {isEditorMaximized ? (
                <div className="flex items-center gap-1.5 h-8 px-2 sm:px-2.5 bg-[#14151a] border border-[#23262d] rounded-lg shrink-0">
                  <span
                    className="w-2 h-2 rounded-full shadow-[0_0_8px_var(--g)] shrink-0"
                    style={{ backgroundColor: "var(--g)" }}
                  />
                  <span className="font-['Space_Grotesk'] font-bold text-xs text-[#e9e7e0] truncate max-w-[100px] sm:max-w-[150px]">
                    {currentGenre.name}
                  </span>
                </div>
              ) : (
                isSidebarCollapsed && (
                  <button
                    onClick={() => setIsSidebarCollapsed(false)}
                    className="flex items-center gap-1.5 h-8 px-2.5 text-xs text-[#8b8f99] hover:text-[#f5b73d] border border-[#23262d] rounded-lg transition-colors bg-[#0d0e12] shrink-0"
                    title={language === "zh" ? "展开风格档案" : "Expand dossier"}
                  >
                    <PanelLeftOpen className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{language === "zh" ? "风格" : "Info"}</span>
                  </button>
                )
              )}

              {/* Play / Pause Button */}
              <button
                onClick={handleTogglePlay}
                className={`h-8 px-2.5 sm:px-3 rounded-lg flex items-center gap-1.5 text-xs font-bold transition-all hover:brightness-110 shrink-0 ${
                  isPlaying
                    ? "bg-[#ff5964] text-white shadow-[0_0_12px_rgba(255,89,100,0.35)] animate-pulse-play"
                    : "bg-[#f5b73d] text-[#0a0b0d] shadow-[0_0_12px_rgba(245,183,61,0.25)]"
                }`}
                aria-label="Play / Pause"
                title={isPlaying ? "Space: Pause" : "Space: Play"}
              >
                {isPlaying ? (
                  <div className="w-2.5 h-2.5 rounded-xs bg-current" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                )}
                <span className="font-['JetBrains_Mono'] text-xs">
                  {isPlaying ? (language === "zh" ? "暂停" : "PAUSE") : (language === "zh" ? "播放" : "PLAY")}
                </span>
              </button>

              {/* BPM Input */}
              <div className="flex items-center gap-1 h-8 bg-[#0d0e12] border border-[#23262d] px-2 rounded-lg shrink-0">
                <span className="font-['JetBrains_Mono'] text-[10px] text-[#5a5e68] tracking-wider select-none">BPM</span>
                <input
                  type="number"
                  min="40"
                  max="240"
                  value={bpm}
                  onChange={(e) => setBpm(Math.max(40, Math.min(240, Number(e.target.value) || 120)))}
                  className="w-10 bg-transparent text-[#e9e7e0] font-['JetBrains_Mono'] text-xs font-bold text-center focus:outline-none focus:text-[#f5b73d]"
                  title={language === "zh" ? "节奏速度 (40-240 BPM)" : "Tempo (40-240 BPM)"}
                />
              </div>

              {/* Meter Select Dropdown */}
              <div className="flex items-center h-8 bg-[#0d0e12] hover:bg-[#14151a] border border-[#23262d] hover:border-[#3a3e48] rounded-lg px-2 text-xs transition-colors shrink-0">
                <span className="font-['JetBrains_Mono'] text-[10px] text-[#5a5e68] tracking-wider uppercase mr-1 select-none">
                  {language === "zh" ? "拍号" : "METER"}
                </span>
                <select
                  value={timeSignature}
                  onChange={(e) => handleTimeSignatureChange(e.target.value)}
                  className="bg-transparent text-[#e9e7e0] font-['JetBrains_Mono'] text-xs font-semibold focus:outline-none cursor-pointer"
                  aria-label={language === "zh" ? "选择拍号" : "Select time signature"}
                >
                  <option value="4/4" className="bg-[#121317] text-[#e9e7e0]">4/4 {language === "zh" ? "(四四拍 · 4格)" : "(Common)"}</option>
                  <option value="2/4" className="bg-[#121317] text-[#e9e7e0]">2/4 {language === "zh" ? "(二四拍 · 2格)" : "(March)"}</option>
                  <option value="3/4" className="bg-[#121317] text-[#e9e7e0]">3/4 {language === "zh" ? "(三四拍 · 3格)" : "(Waltz)"}</option>
                  <option value="2/2" className="bg-[#121317] text-[#e9e7e0]">2/2 {language === "zh" ? "(二二拍 · 2格)" : "(Cut Time)"}</option>
                  <option value="6/8" className="bg-[#121317] text-[#e9e7e0]">6/8 {language === "zh" ? "(六八拍 · 3格)" : "(Compound)"}</option>
                  <option value="3/8" className="bg-[#121317] text-[#e9e7e0]">3/8 {language === "zh" ? "(三八拍 · 3格)" : "(Single)"}</option>
                  <option value="9/8" className="bg-[#121317] text-[#e9e7e0]">9/8 {language === "zh" ? "(九八拍 · 3格)" : "(Triple)"}</option>
                  <option value="12/8" className="bg-[#121317] text-[#e9e7e0]">12/8 {language === "zh" ? "(十二八 · 3格)" : "(Shuffle)"}</option>
                  <option value="5/4" className="bg-[#121317] text-[#e9e7e0]">5/4 {language === "zh" ? "(五四拍 · 5格)" : "(Take Five)"}</option>
                  <option value="7/8" className="bg-[#121317] text-[#e9e7e0]">7/8 {language === "zh" ? "(七八拍 · 7格)" : "(Balkan)"}</option>
                </select>
              </div>

              {/* Quantize Resolution Select Dropdown */}
              <div className="flex items-center h-8 bg-[#0d0e12] hover:bg-[#14151a] border border-[#23262d] hover:border-[#3a3e48] rounded-lg px-2 text-xs transition-colors shrink-0">
                <span className="font-['JetBrains_Mono'] text-[10px] text-[#5a5e68] tracking-wider uppercase mr-1 select-none">
                  {language === "zh" ? "精度" : "GRID"}
                </span>
                <select
                  value={resolution}
                  onChange={(e) => handleResolutionChange(e.target.value as "1/8" | "1/16" | "1/32")}
                  className="bg-transparent text-[#e9e7e0] font-['JetBrains_Mono'] text-xs font-semibold focus:outline-none cursor-pointer"
                  aria-label={language === "zh" ? "选择量化精度" : "Select quantization resolution"}
                >
                  <option value="1/16" className="bg-[#121317] text-[#e9e7e0]">1/16 {language === "zh" ? "(标准)" : "(Default)"}</option>
                  <option value="1/8" className="bg-[#121317] text-[#e9e7e0]">1/8 {language === "zh" ? "(半速)" : "(Half)"}</option>
                  <option value="1/32" className="bg-[#121317] text-[#e9e7e0]">1/32 {language === "zh" ? "(双速)" : "(Double)"}</option>
                </select>
              </div>

              {/* Step Length Select Dropdown */}
              <div className="flex items-center h-8 bg-[#0d0e12] hover:bg-[#14151a] border border-[#23262d] hover:border-[#3a3e48] rounded-lg px-2 text-xs transition-colors shrink-0">
                <span className="font-['JetBrains_Mono'] text-[10px] text-[#5a5e68] tracking-wider uppercase mr-1 select-none">
                  {language === "zh" ? "长度" : "LEN"}
                </span>
                <select
                  value={stepCount}
                  onChange={(e) => handleSetStepCount(Number(e.target.value))}
                  className="bg-transparent text-[#e9e7e0] font-['JetBrains_Mono'] text-xs font-semibold focus:outline-none cursor-pointer"
                  aria-label={language === "zh" ? "选择步长与小节" : "Select step length"}
                >
                  <option value={16} className="bg-[#121317] text-[#e9e7e0]">16 {language === "zh" ? "步 (1小节)" : "Steps (1 Bar)"}</option>
                  <option value={32} className="bg-[#121317] text-[#e9e7e0]">32 {language === "zh" ? "步 (2小节)" : "Steps (2 Bars)"}</option>
                  <option value={48} className="bg-[#121317] text-[#e9e7e0]">48 {language === "zh" ? "步 (3小节)" : "Steps (3 Bars)"}</option>
                  <option value={64} className="bg-[#121317] text-[#e9e7e0]">64 {language === "zh" ? "步 (4小节)" : "Steps (4 Bars)"}</option>
                  {![16, 32, 48, 64].includes(stepCount) && (
                    <option value={stepCount} className="bg-[#121317] text-[#e9e7e0]">
                      {stepCount} {language === "zh" ? `步 (${barCount}小节)` : `Steps (${barCount} Bars)`}
                    </option>
                  )}
                </select>
              </div>

              {/* Tool Mode Select Dropdown */}
              <div
                className="flex items-center h-8 bg-[#0d0e12] hover:bg-[#14151a] border border-[#23262d] hover:border-[#3a3e48] rounded-lg px-2 text-xs transition-colors shrink-0"
                title={
                  mobileEditMode === "step"
                    ? (language === "zh" ? "普通步进：点按开关音符，长按打开参数锁" : "Step Note: Tap to toggle, long press for P-Locks")
                    : mobileEditMode === "accent"
                    ? (language === "zh" ? "重音模式：点按步进切换最大重音 (Vel 127)" : "Accent: Tap to toggle max accent velocity")
                    : mobileEditMode === "ratchet"
                    ? (language === "zh" ? "连音滚奏：点按步进循环细分 (1x-4x)" : "Ratchet: Tap to cycle ratchets")
                    : mobileEditMode === "pitch"
                    ? (language === "zh" ? "音高选择：点按旋律步进选取音高" : "Pitch: Tap to pick pitch")
                    : (language === "zh" ? "参数锁：点按步进调出参数锁面板" : "P-Locks: Tap to open parameters menu")
                }
              >
                <span className="font-['JetBrains_Mono'] text-[10px] text-[#5a5e68] tracking-wider uppercase mr-1 select-none">
                  {language === "zh" ? "工具" : "TOOL"}
                </span>
                <select
                  value={mobileEditMode}
                  onChange={(e) => setMobileEditMode(e.target.value as MobileEditMode)}
                  className="bg-transparent text-[#e9e7e0] font-['JetBrains_Mono'] text-xs font-semibold focus:outline-none cursor-pointer"
                  aria-label={language === "zh" ? "选择步进编辑工具" : "Select step edit mode"}
                >
                  <option value="step" className="bg-[#121317] text-[#e9e7e0]">● {language === "zh" ? "普通步进" : "Step Note"}</option>
                  <option value="accent" className="bg-[#121317] text-[#e9e7e0]">▲ {language === "zh" ? "重音 (Vel 127)" : "Accent"}</option>
                  <option value="ratchet" className="bg-[#121317] text-[#e9e7e0]">⫸ {language === "zh" ? "连音滚奏" : "Ratchet"}</option>
                  <option value="pitch" className="bg-[#121317] text-[#e9e7e0]">♩ {language === "zh" ? "音高选择" : "Pitch Picker"}</option>
                  <option value="plocks" className="bg-[#121317] text-[#e9e7e0]">⚙ {language === "zh" ? "参数锁" : "P-Locks"}</option>
                </select>
              </div>
            </div>

            {/* Right Section: Bar Navigation & Pro Operations */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto">
              {/* Bar Navigation Select (shown when barCount > 1) */}
              {barCount > 1 && (
                <div className="flex items-center h-8 bg-[#0d0e12] hover:bg-[#14151a] border border-[#23262d] hover:border-[#3a3e48] rounded-lg px-2 text-xs transition-colors shrink-0">
                  <span className="font-['JetBrains_Mono'] text-[10px] text-[#5a5e68] tracking-wider uppercase mr-1 select-none">
                    {language === "zh" ? "小节" : "BAR"}
                  </span>
                  <select
                    value={Math.min(barCount - 1, viewedBar)}
                    onChange={(e) => scrollToBar(Number(e.target.value))}
                    className="bg-transparent text-[#e9e7e0] font-['JetBrains_Mono'] text-xs font-semibold focus:outline-none cursor-pointer"
                    aria-label={language === "zh" ? "跳转到小节" : "Jump to bar"}
                  >
                    {Array.from({ length: barCount }, (_, bIdx) => {
                      const startStep = bIdx * stepsPerBar + 1;
                      const endStep = Math.min(stepCount, (bIdx + 1) * stepsPerBar);
                      return (
                        <option key={bIdx} value={bIdx} className="bg-[#121317] text-[#e9e7e0]">
                          Bar {bIdx + 1} ({startStep}-{endStep})
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {/* Velocity Lane Toggle */}
              <button
                onClick={() => setIsVelocityLaneOpen(!isVelocityLaneOpen)}
                className={`h-8 flex items-center gap-1 px-2 sm:px-2.5 rounded-lg text-xs transition-colors border shrink-0 ${
                  isVelocityLaneOpen
                    ? "bg-[#45e0c9]/20 border-[#45e0c9] text-[#45e0c9] font-bold shadow-[0_0_8px_rgba(69,224,201,0.25)]"
                    : "bg-[#0d0e12] border-[#23262d] hover:border-[#3a3e48] text-[#8b8f99] hover:text-[#e9e7e0]"
                }`}
                title={language === "zh" ? "力度编辑抽屉 (快捷键 V)" : "Toggle velocity drawer (Key: V)"}
              >
                <Sliders className="w-3.5 h-3.5 text-[#45e0c9]" />
                <span className="hidden sm:inline font-['JetBrains_Mono']">{language === "zh" ? "力度" : "VEL"}</span>
              </button>

              {/* Euclidean Rhythm Generator */}
              <button
                onClick={() => setIsEuclideanOpen(true)}
                className="h-8 flex items-center gap-1 px-2 sm:px-2.5 bg-[#0d0e12] border border-[#23262d] hover:border-[#f5b73d]/60 rounded-lg text-xs text-[#8b8f99] hover:text-[#f5b73d] transition-colors shrink-0"
                title={language === "zh" ? "欧几里得律动生成器 (快捷键 E)" : "Euclidean rhythm generator (Key: E)"}
              >
                <Sparkles className="w-3.5 h-3.5 text-[#f5b73d]" />
                <span className="hidden sm:inline font-['JetBrains_Mono']">{language === "zh" ? "欧几里得" : "EUCLID"}</span>
              </button>

              {/* Undo & Redo (Placed before Tools...) */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={handleUndo}
                  disabled={!canUndo}
                  className={`h-8 w-8 flex items-center justify-center rounded-lg border text-xs transition-colors ${
                    canUndo
                      ? "bg-[#0d0e12] text-[#e9e7e0] border-[#23262d] hover:border-[#f5b73d] hover:text-[#f5b73d] cursor-pointer"
                      : "bg-[#0a0b0d] text-[#4a4e58] border-[#181a20] cursor-not-allowed opacity-40"
                  }`}
                  title={language === "zh" ? "撤销 (Ctrl+Z)" : "Undo (Ctrl+Z)"}
                >
                  <Undo2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleRedo}
                  disabled={!canRedo}
                  className={`h-8 w-8 flex items-center justify-center rounded-lg border text-xs transition-colors ${
                    canRedo
                      ? "bg-[#0d0e12] text-[#e9e7e0] border-[#23262d] hover:border-[#f5b73d] hover:text-[#f5b73d] cursor-pointer"
                      : "bg-[#0a0b0d] text-[#4a4e58] border-[#181a20] cursor-not-allowed opacity-40"
                  }`}
                  title={language === "zh" ? "重做 (Ctrl+Shift+Z)" : "Redo (Ctrl+Shift+Z)"}
                >
                  <Redo2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Fullscreen Maximize / Minimize Toggle (Placed before Tools...) */}
              <button
                onClick={() => {
                  setIsEditorMaximized(!isEditorMaximized);
                  setShowAdvancedControls(false);
                }}
                className={`h-8 px-2 sm:px-2.5 flex items-center gap-1 text-xs border rounded-lg transition-colors shrink-0 ${
                  isEditorMaximized
                    ? "bg-[#17181c] hover:bg-[#23262d] border-[#2b2e38] text-[#e9e7e0] shadow-sm"
                    : "bg-[#0d0e12] border-[#23262d] hover:border-[#f5b73d] text-[#8b8f99] hover:text-[#f5b73d]"
                }`}
                title={
                  isEditorMaximized
                    ? (language === "zh" ? "退出全屏 (Esc)" : "Exit Fullscreen (Esc)")
                    : (language === "zh" ? "全屏沉浸模式 (Esc 退出)" : "Fullscreen (Esc to exit)")
                }
              >
                {isEditorMaximized ? (
                  <>
                    <Minimize2 className="w-3.5 h-3.5 text-[#f5b73d]" />
                    <span className="hidden sm:inline font-['JetBrains_Mono']">
                      {language === "zh" ? "退出" : "Exit"}
                    </span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-3.5 h-3.5 text-[#f5b73d]" />
                    <span className="hidden sm:inline font-['JetBrains_Mono']">
                      {language === "zh" ? "全屏" : "Full"}
                    </span>
                  </>
                )}
              </button>

              {/* Quick Tools Dropdown */}
              <div className="flex items-center h-8 bg-[#0d0e12] hover:bg-[#14151a] border border-[#23262d] hover:border-[#3a3e48] rounded-lg px-2 text-xs transition-colors shrink-0">
                <select
                  value=""
                  onChange={(e) => {
                    const act = e.target.value;
                    if (act === "dup_bar1") handleDuplicateBar1();
                    else if (act === "humanize") handleHumanize();
                    else if (act === "clear_all") handleClearAll();
                    else if (act === "reset_preset") handleResetPreset();
                  }}
                  className="bg-transparent text-[#8b8f99] hover:text-[#e9e7e0] font-['JetBrains_Mono'] text-xs font-semibold focus:outline-none cursor-pointer"
                  aria-label={language === "zh" ? "快捷操作" : "Quick actions"}
                >
                  <option value="" disabled className="bg-[#121317] text-[#8b8f99]">
                    ⚡ {language === "zh" ? "操作..." : "Tools..."}
                  </option>
                  <option value="dup_bar1" className="bg-[#121317] text-[#e9e7e0]">
                    📋 {language === "zh" ? "复制小节1至整段" : "Duplicate Bar 1"}
                  </option>
                  <option value="humanize" className="bg-[#121317] text-[#e9e7e0]">
                    ✨ {language === "zh" ? "人性化力度抖动" : "Humanize Velocity"}
                  </option>
                  <option value="clear_all" className="bg-[#121317] text-[#ff5964]">
                    🗑️ {language === "zh" ? "清空全部步进" : "Clear All Steps"}
                  </option>
                  <option value="reset_preset" className="bg-[#121317] text-[#e9e7e0]">
                    🔄 {language === "zh" ? "恢复默认预设" : "Reset Preset"}
                  </option>
                </select>
              </div>

              {/* Export MIDI */}
              <button
                onClick={handleExportMidi}
                className="h-8 px-2 sm:px-2.5 flex items-center gap-1 text-xs text-[#8b8f99] hover:text-[#e9e7e0] hover:border-[#3a3e48] border border-[#23262d] rounded-lg transition-colors bg-[#0d0e12] shrink-0"
                title={t("export")}
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden lg:inline font-['JetBrains_Mono']">{t("export")}</span>
              </button>

              {/* Share Groove (shown in standard mode) */}
              {!isEditorMaximized && (
                <button
                  onClick={handleShare}
                  className="h-8 px-2 sm:px-2.5 flex items-center gap-1 text-xs text-[#8b8f99] hover:text-[#f5b73d] hover:border-[#f5b73d] border border-[#23262d] rounded-lg transition-colors bg-[#0d0e12] shrink-0"
                  title={t("share_groove")}
                >
                  <Share2 className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Collapsible Advanced Settings (Swing, Fine Steps, Pan) */}
              <button
                onClick={() => setShowAdvancedControls(!showAdvancedControls)}
                className={`h-8 px-2 sm:px-2.5 flex items-center gap-1 text-xs border rounded-lg transition-colors shrink-0 ${
                  showAdvancedControls
                    ? "bg-[#1f232b] text-[#f5b73d] border-[#f5b73d]/50"
                    : "bg-[#0d0e12] text-[#8b8f99] hover:text-[#e9e7e0] border-[#23262d] hover:border-[#3a3e48]"
                }`}
                title={language === "zh" ? "展开/收起高级设置 (摇摆度、步进微调、平移)" : "Toggle advanced settings"}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span className="hidden xl:inline font-['JetBrains_Mono']">
                  {language === "zh" ? "高级" : "More"}
                </span>
                {swing > 0 && !showAdvancedControls && (
                  <span className="text-[10px] text-[#f5b73d] font-['JetBrains_Mono'] hidden sm:inline">
                    {swing}%
                  </span>
                )}
                <ChevronDown className={`w-3 h-3 transition-transform ${showAdvancedControls ? "rotate-180" : ""}`} />
              </button>
            </div>
          </div>

          {/* Collapsible Advanced Settings Bar (Drawer) */}
          {showAdvancedControls && (
            <div className="flex items-center justify-between gap-3 p-2 bg-[#0a0b0e] border border-[#23262d] rounded-xl mb-2 text-xs select-none transition-all shrink-0">
              {/* Swing Slider Knob */}
              <div className="flex items-center gap-2 bg-[#121317] px-2.5 py-1 rounded-lg border border-[#1a1c21]">
                <span className="font-['JetBrains_Mono'] text-[10px] text-[#5a5e68] tracking-wider uppercase whitespace-nowrap">
                  {t("swing")}: <b className="text-[#e9e7e0] font-normal">{swing}%</b>
                </span>
                <input
                  type="range"
                  min="0"
                  max="75"
                  value={swing}
                  onChange={(e) => setSwing(+e.target.value)}
                  className="w-20 sm:w-28 accent-[#f5b73d] cursor-pointer"
                />
              </div>

              {/* Fine-grained Step adjustments */}
              <div className="flex items-center gap-1 bg-[#121317] px-2 py-1 rounded-lg border border-[#1a1c21]">
                <span className="font-['JetBrains_Mono'] text-[10px] text-[#5a5e68] mr-1 hidden sm:inline whitespace-nowrap">
                  {language === "zh" ? "步数微调:" : "FINE STEPS:"}
                </span>
                <button
                  onClick={() => handleRemoveSteps(groupSize)}
                  className="h-6 px-1.5 flex items-center justify-center rounded bg-[#17181c] hover:bg-[#23262d] text-[#8b8f99] hover:text-[#e9e7e0] border border-[#23262d] font-['JetBrains_Mono'] text-[10px]"
                  title={language === "zh" ? `删减 ${groupSize} 步 (1组)` : `Remove ${groupSize} steps`}
                >
                  -{groupSize}
                </button>
                <button
                  onClick={() => handleAddSteps(groupSize)}
                  className="h-6 px-1.5 flex items-center justify-center rounded bg-[#17181c] hover:bg-[#23262d] text-[#8b8f99] hover:text-[#e9e7e0] border border-[#23262d] font-['JetBrains_Mono'] text-[10px]"
                  title={language === "zh" ? `添加 ${groupSize} 步 (1组)` : `Add ${groupSize} steps`}
                >
                  +{groupSize}
                </button>
                <button
                  onClick={() => handleAddSteps(stepsPerBar)}
                  className="h-6 px-1.5 flex items-center justify-center rounded bg-[#17181c] hover:bg-[#23262d] text-[#f5b73d] border border-[#23262d] font-['JetBrains_Mono'] text-[10px]"
                  title={language === "zh" ? `添加 1 小节 (+${stepsPerBar} 步)` : `Add 1 Bar (+${stepsPerBar} steps)`}
                >
                  +1 Bar
                </button>
                <button
                  onClick={() => handleAddSteps(stepsPerBar * 2)}
                  className="h-6 px-1.5 flex items-center justify-center rounded bg-[#17181c] hover:bg-[#23262d] text-[#f5b73d] border border-[#23262d] font-['JetBrains_Mono'] text-[10px] hidden md:inline-flex"
                  title={language === "zh" ? `添加 2 小节 (+${stepsPerBar * 2} 步)` : `Add 2 Bars (+${stepsPerBar * 2} steps)`}
                >
                  +2 Bars
                </button>
              </div>

              {/* Pan Navigation */}
              <div className="flex items-center gap-1.5 ml-auto text-[#5a5e68]">
                <span className="hidden lg:inline font-['JetBrains_Mono'] text-[10px] whitespace-nowrap">
                  {language === "zh" ? "滚轮/标尺拖拽可平移" : "Wheel/drag to pan"}
                </span>
                <button
                  onClick={() => scrollByPixels(-240)}
                  className="w-6 h-6 rounded bg-[#121317] border border-[#23262d] hover:border-[#f5b73d] text-[#8b8f99] hover:text-[#f5b73d] flex items-center justify-center text-xs transition-colors"
                  title={language === "zh" ? "向左滚动" : "Scroll left"}
                >
                  ◀
                </button>
                <button
                  onClick={() => scrollByPixels(240)}
                  className="w-6 h-6 rounded bg-[#121317] border border-[#23262d] hover:border-[#f5b73d] text-[#8b8f99] hover:text-[#f5b73d] flex items-center justify-center text-xs transition-colors"
                  title={language === "zh" ? "向右滚动" : "Scroll right"}
                >
                  ▶
                </button>
                <button
                  onClick={() => setShowAdvancedControls(false)}
                  className="ml-2 text-[10px] text-[#8b8f99] hover:text-[#e9e7e0] font-['JetBrains_Mono'] px-1.5 py-0.5 rounded bg-[#17181c] border border-[#23262d]"
                  title={language === "zh" ? "收起设置抽屉" : "Close"}
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {/* 8 Tracks Sequencer Matrix (#tracks) */}
          <div
            ref={matrixContainerRef}
            className="w-full space-y-1 overflow-x-auto pb-3 relative custom-sequencer-scroll select-none overscroll-x-contain"
          >
            {/* Step Indicator Ruler Header */}
            <div className="flex items-center gap-3 pb-2 pt-1 border-b border-[#1a1c21] mb-2 min-w-max">
              {/* Left Label aligned with 172px track headers - Sticky Left */}
              <div className="sticky left-0 z-30 bg-[#121317] flex-none w-[172px] pr-2 flex items-center justify-between font-['JetBrains_Mono'] text-[9px] tracking-[0.14em] text-[#5a5e68] uppercase select-none border-r border-[#1a1c21] shadow-[4px_0_12px_rgba(0,0,0,0.6)]">
                <span>{stepCount} STEPS</span>
                <span className="text-[#3a3e48]">{timeSignature}</span>
              </div>

              {/* Dynamic Ruler Step Badges with Drag-to-Scroll */}
              <div
                className={`flex-1 flex gap-1 relative cursor-grab select-none touch-action-manipulation ${
                  isRulerDragging ? "cursor-grabbing" : ""
                }`}
                onPointerDown={handleRulerPointerDown}
                onPointerMove={handleRulerPointerMove}
                onPointerUp={handleRulerPointerUp}
                onPointerCancel={handleRulerPointerUp}
                title={language === "zh" ? "按住左右拖拽可平移时间线" : "Click and drag to scroll timeline"}
              >
                {Array.from({ length: stepCount }, (_, stepIdx) => {
                  const groupIdx = Math.floor(stepIdx / groupSize) + 1;
                  const stepInGroup = (stepIdx % groupSize) + 1;
                  const barIdx = Math.floor(stepIdx / stepsPerBar) + 1;
                  const isBarStart = stepIdx % stepsPerBar === 0 && stepIdx !== 0;
                  const isFirstStepOfBar = stepIdx % stepsPerBar === 0;
                  const isGroupStart = stepIdx % groupSize === 0 && stepIdx !== 0;
                  const isFirstStepOfGroup = stepIdx % groupSize === 0;
                  const isCurrent = isPlaying && currentStep === stepIdx;
                  const stepStr = String(stepIdx + 1).padStart(2, "0");

                  return (
                    <div
                      key={stepIdx}
                      data-step-idx={stepIdx}
                      className={`min-w-[32px] sm:min-w-[36px] flex-1 h-8 rounded flex flex-col items-center justify-center transition-all select-none border relative touch-action-manipulation touch-hit-44 ${
                        isBarStart
                          ? "ml-3 sm:ml-4 border-l-2 border-l-[#f5b73d]/80"
                          : isGroupStart
                          ? "ml-2 sm:ml-2.5 border-l border-[#3a3e48]"
                          : ""
                      } ${
                        isCurrent
                          ? "bg-[#f5b73d]/25 border-[#f5b73d] text-[#f5b73d] shadow-[0_0_14px_rgba(245,183,61,0.5)] font-bold scale-[1.03]"
                          : isFirstStepOfBar
                          ? "bg-[#1f222b] border-[#3a3e48] text-[#f5b73d] font-bold"
                          : isFirstStepOfGroup
                          ? "bg-[#171920] border-[#2b2e38] text-[#e9e7e0]"
                          : "bg-[#101115] border-[#1c1d22] text-[#5a5e68]"
                      }`}
                      title={`Step ${stepIdx + 1} (Bar ${barIdx}, Group ${groupIdx}.${stepInGroup})`}
                    >
                      {/* Laser Beacon Arrow / Dot on Playhead */}
                      {isCurrent && (
                        <span className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-1 bg-[#f5b73d] rounded-full shadow-[0_0_8px_#f5b73d]" />
                      )}
                      <span className="font-['JetBrains_Mono'] text-[10px] leading-tight font-bold tracking-tight">
                        {stepStr}
                      </span>
                      <span
                        className={`font-['JetBrains_Mono'] text-[7.5px] leading-none ${
                          isCurrent
                            ? "text-[#f5b73d]"
                            : isFirstStepOfBar
                            ? "text-[#f5b73d] font-bold"
                            : isFirstStepOfGroup
                            ? "text-[#8b8f99] font-semibold"
                            : "text-[#3e424d]"
                        }`}
                      >
                        {isFirstStepOfBar ? `M${barIdx}` : `.${stepInGroup}`}
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
              const trackVol = track.volume !== undefined ? track.volume : 0.8;
              const lastTrigger = trackFlashTimes[trackIdx] || 0;
              const isFlashing = Date.now() - lastTrigger < 160;

              return (
                <div
                  key={track.track_id}
                  className={`flex items-center gap-3 py-1.5 transition-opacity min-w-max ${
                    isSilenced ? "opacity-30" : "opacity-100"
                  }`}
                  style={{ ["--tc" as any]: meta.color }}
                >
                  {/* Track Header (.trk-head) - 172px width - Sticky Left */}
                  <div className="sticky left-0 z-20 bg-[#121317] flex-none w-[172px] pr-2 flex flex-col justify-center gap-1 select-none border-r border-[#1a1c21] shadow-[4px_0_12px_rgba(0,0,0,0.6)]">
                    {/* Upper row: Swatch + LED Peak Meter + Title + Polymeter + Mute / Solo */}
                    <div className="flex items-center gap-1.5">
                      <div
                        onClick={() => engineRef.current?.triggerNote(trackIdx, track.name, 0.9, 0, 1)}
                        className="flex items-center gap-1.5 flex-1 min-w-0 cursor-pointer group/trk hover:opacity-90 transition-opacity touch-manipulation"
                        title={language === "zh" ? "点击试听音色" : "Tap to audition sound"}
                      >
                        <span
                          className="w-1 h-5 rounded-sm shadow-[0_0_8px_var(--tc)] shrink-0 group-hover/trk:scale-y-110 transition-transform"
                          style={{ backgroundColor: meta.color }}
                        />
                        {/* Mini 4-Segment Activity Meter */}
                        <div className="flex gap-[1.5px] items-center h-3 px-1 py-0.5 bg-[#0a0b0d] rounded border border-[#1a1c21] shrink-0" title="Audio Activity Peak">
                          {[1, 2, 3, 4].map((seg) => {
                            const active = isFlashing && (seg <= 2 || (trackVol > 0.5 && seg <= 3) || trackVol > 0.85);
                            return (
                              <span
                                key={seg}
                                className={`w-0.5 h-2 rounded-[0.5px] transition-all duration-75 ${
                                  active
                                    ? seg === 4
                                      ? "bg-[#ff5964] shadow-[0_0_4px_#ff5964]"
                                      : seg === 3
                                      ? "bg-[#f5b73d] shadow-[0_0_4px_#f5b73d]"
                                      : "bg-[#45e0c9] shadow-[0_0_4px_#45e0c9]"
                                    : "bg-[#1f222b]"
                                }`}
                              />
                            );
                          })}
                        </div>
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="font-['JetBrains_Mono'] text-[11px] tracking-[0.05em] text-[#e9e7e0] font-bold truncate">
                            {meta.name}
                          </span>
                          <span className="font-['JetBrains_Mono'] text-[8.5px] text-[#5a5e68] truncate leading-none">
                            {meta.sub ? meta.sub[language] : ""}
                          </span>
                        </div>
                      </div>

                      <div className="flex gap-1 shrink-0 items-center">
                        {/* Polymeter Loop Length Selector */}
                        <button
                          onClick={() => handleCycleTrackLength(trackIdx)}
                          className={`px-1.5 h-6 sm:h-4 rounded text-[9px] sm:text-[8px] font-['JetBrains_Mono'] border transition-colors flex items-center justify-center touch-manipulation ${
                            track.trackLength && track.trackLength !== stepCount
                              ? "bg-[#f5b73d]/20 border-[#f5b73d] text-[#f5b73d] font-bold shadow-[0_0_6px_rgba(245,183,61,0.25)]"
                              : "bg-[#17181c] border-[#23262d] text-[#5a5e68] hover:text-[#8b8f99]"
                          }`}
                          title={language === "zh" ? `独立轨道循环长度: ${track.trackLength || stepCount} 步 (点击切换)` : `Polymeter length: ${track.trackLength || stepCount} steps (Click to cycle)`}
                        >
                          L:{track.trackLength || stepCount}
                        </button>
                        <button
                          onClick={() => toggleMute(trackIdx)}
                          className={`w-6 h-6 sm:w-4 sm:h-4 font-['JetBrains_Mono'] text-[9.5px] sm:text-[8.5px] border rounded transition-colors flex items-center justify-center touch-manipulation ${
                            isMute
                              ? "border-[var(--tc)] text-[var(--tc)] bg-transparent font-bold"
                              : "border-[#23262d] text-[#5a5e68] hover:text-[#e9e7e0]"
                          }`}
                          title={language === "zh" ? "静音轨道" : "Mute track"}
                        >
                          M
                        </button>
                        <button
                          onClick={() => toggleSolo(trackIdx)}
                          className={`w-6 h-6 sm:w-4 sm:h-4 font-['JetBrains_Mono'] text-[9.5px] sm:text-[8.5px] border rounded transition-colors flex items-center justify-center touch-manipulation ${
                            isSolo
                              ? "border-[#f5b73d] text-[#f5b73d] bg-[#f5b73d]/10 font-bold"
                              : "border-[#23262d] text-[#5a5e68] hover:text-[#e9e7e0]"
                          }`}
                          title={language === "zh" ? "独奏轨道" : "Solo track"}
                        >
                          S
                        </button>
                      </div>
                    </div>

                    {/* Lower row: Volume slider + Track actions (Velocity Focus, Shift, Smart Fill, Clear) */}
                    <div className="flex items-center justify-between gap-1 text-[#5a5e68]">
                      {/* Mini Volume Slider */}
                      <div className="flex items-center gap-1 shrink-0" title={`Volume: ${Math.round(trackVol * 100)}%`}>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={trackVol}
                          onChange={(e) => handleTrackVolumeChange(trackIdx, +e.target.value)}
                          className="w-12 sm:w-11 h-2 sm:h-1 accent-[#f5b73d] bg-[#1a1c21] rounded cursor-pointer touch-manipulation"
                        />
                      </div>

                      {/* Track Quick Actions */}
                      <div className="flex items-center gap-1 sm:gap-0.5 shrink-0">
                        <button
                          onClick={() => {
                            setVelocityActiveTrackIdx(trackIdx);
                            setIsVelocityLaneOpen(true);
                          }}
                          className={`w-6 h-6 sm:w-4 sm:h-4 rounded border transition-colors flex items-center justify-center touch-manipulation ${
                            isVelocityLaneOpen && velocityActiveTrackIdx === trackIdx
                              ? "bg-[#45e0c9]/20 border-[#45e0c9] text-[#45e0c9]"
                              : "border-[#23262d] text-[#5a5e68] hover:text-[#45e0c9]"
                          }`}
                          title={language === "zh" ? "在力度抽屉中编辑" : "Edit velocity in drawer"}
                        >
                          <Sliders className="w-3 h-3 sm:w-2.5 sm:h-2.5" />
                        </button>
                        <button
                          onClick={() => handleShiftTrack(trackIdx, -1)}
                          className="w-6 h-6 sm:w-4 sm:h-4 rounded hover:bg-[#1a1c21] text-[#5a5e68] hover:text-[#e9e7e0] flex items-center justify-center text-xs sm:text-[10px] touch-manipulation"
                          title={language === "zh" ? "向左位移 1 步" : "Shift left 1 step"}
                        >
                          ◀
                        </button>
                        <button
                          onClick={() => handleShiftTrack(trackIdx, 1)}
                          className="w-6 h-6 sm:w-4 sm:h-4 rounded hover:bg-[#1a1c21] text-[#5a5e68] hover:text-[#e9e7e0] flex items-center justify-center text-xs sm:text-[10px] touch-manipulation"
                          title={language === "zh" ? "向右位移 1 步" : "Shift right 1 step"}
                        >
                          ▶
                        </button>
                        <button
                          onClick={() => handleSmartFillTrack(trackIdx)}
                          className="w-6 h-6 sm:w-4 sm:h-4 rounded hover:bg-[#1a1c21] text-[#5a5e68] hover:text-[#45e0c9] flex items-center justify-center text-xs sm:text-[10px] touch-manipulation"
                          title={language === "zh" ? "智能生成常规节拍" : "Smart fill rhythm"}
                        >
                          <Wand2 className="w-3 h-3 sm:w-2.5 sm:h-2.5" />
                        </button>
                        <button
                          onClick={() => handleClearTrack(trackIdx)}
                          className="w-6 h-6 sm:w-4 sm:h-4 rounded hover:bg-[#1a1c21] text-[#5a5e68] hover:text-[#ff5964] flex items-center justify-center text-xs sm:text-[10px] touch-manipulation"
                          title={language === "zh" ? "清空轨道" : "Clear track"}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Step Grid (.grid) */}
                  <div className="flex-1 flex gap-1 relative">
                    {track.steps.map((stepVal, stepIdx) => {
                      const isOn = stepVal > 0;
                      const vel = track.velocity && track.velocity[stepIdx] !== undefined ? track.velocity[stepIdx] : 100;
                      const isAcc = vel >= 115;

                      // Hat shapes: 1 = closed, 2 = open (round), 3 = triplet roll (striped)
                      const isHatRound = isHatTrack && stepVal === 2;
                      const isHatTriplet = isHatTrack && stepVal === 3;

                      const ratchet = track.ratchet?.[stepIdx] || (isHatTriplet ? 3 : 1);
                      const prob = track.probability?.[stepIdx] ?? 100;
                      const isMelodic = track.track_id === "bass" || track.track_id === "chords" || track.track_id === "lead";
                      const midiNote = track.pitch?.[stepIdx];

                      const trackLen = track.trackLength || stepCount;
                      const isOutsideLoop = stepIdx >= trackLen;

                      const isPlayhead = isPlaying && !isOutsideLoop && (currentStep % trackLen === stepIdx);
                      const isBarStart = stepIdx % stepsPerBar === 0 && stepIdx !== 0;
                      const isFirstStepOfBar = stepIdx % stepsPerBar === 0;
                      const isGroupStart = stepIdx % groupSize === 0 && stepIdx !== 0;

                      return (
                        <div
                          key={stepIdx}
                          onClick={(e) => handleCellClick(trackIdx, stepIdx, e)}
                          onContextMenu={(e) => handleStepContextMenu(trackIdx, stepIdx, e)}
                          onPointerDown={(e) => handleStepPointerDown(trackIdx, stepIdx, e)}
                          onPointerMove={handleStepPointerMove}
                          onPointerUp={handleStepPointerUp}
                          onPointerCancel={handleStepPointerUp}
                          onPointerEnter={() => handlePointerEnter(trackIdx, stepIdx)}
                          className={`min-w-[32px] sm:min-w-[36px] flex-1 h-11 sm:h-10 border cursor-pointer relative transition-all duration-75 select-none touch-action-manipulation touch-hit-44 ${
                            isBarStart
                              ? "ml-3.5 sm:ml-4.5 border-l-2 border-l-[#f5b73d]/70"
                              : isGroupStart
                              ? "ml-2 sm:ml-2.5 border-l border-[#3a3e48]"
                              : ""
                          } ${
                            isHatRound ? "rounded-full" : "rounded-md"
                          } ${
                            isOutsideLoop
                              ? "opacity-25 bg-[#0e0f13] border-[#181920] cursor-not-allowed"
                              : isOn
                              ? "border-transparent shadow-[inset_0_1px_2px_rgba(0,0,0,0.4),0_0_10px_var(--tc)]"
                              : "bg-[#141519] border-[#22242c] hover:border-[#383c48] shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]"
                          }`}
                          style={{
                            backgroundColor: !isOutsideLoop && isOn ? meta.color : undefined,
                            opacity: isOutsideLoop ? 0.25 : isOn ? 0.45 + (vel / 127) * 0.55 : 1,
                          }}
                        >
                          {/* Tactile hardware bevel specular acrylic highlight */}
                          {isOn && !isOutsideLoop && (
                            <span 
                              className={`absolute inset-0 pointer-events-none ${isHatRound ? "rounded-full" : "rounded-md"}`}
                              style={{
                                background: isAcc
                                  ? "linear-gradient(180deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.1) 50%, transparent 100%)"
                                  : "linear-gradient(180deg, rgba(255,255,255,0.22) 0%, transparent 45%)",
                              }}
                            />
                          )}

                          {/* Accent LED pip */}
                          {isOn && isAcc && !isOutsideLoop && (
                            <span className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_6px_#ffffff] pointer-events-none" />
                          )}

                          {/* Ratchet division tick marks and badge */}
                          {isOn && ratchet > 1 && !isOutsideLoop && (
                            <>
                              <div className="absolute inset-0 flex pointer-events-none">
                                {Array.from({ length: ratchet - 1 }).map((_, rIdx) => (
                                  <div
                                    key={rIdx}
                                    className="h-full border-r border-black/40"
                                    style={{ width: `${100 / ratchet}%` }}
                                  />
                                ))}
                              </div>
                              <span className="absolute bottom-0.5 right-0.5 px-0.5 rounded text-[7px] font-['JetBrains_Mono'] font-black bg-black/70 text-[#e9e7e0] leading-none pointer-events-none">
                                {ratchet}x
                              </span>
                            </>
                          )}

                          {/* Probability badge */}
                          {isOn && prob < 100 && !isOutsideLoop && (
                            <span className="absolute top-0.5 right-0.5 px-0.5 rounded text-[7px] font-['JetBrains_Mono'] font-bold bg-[#f5b73d]/90 text-black leading-none pointer-events-none">
                              {prob}%
                            </span>
                          )}

                          {/* Melodic note name readout */}
                          {isOn && isMelodic && typeof midiNote === "number" && midiNote > 0 && !isOutsideLoop && (
                            <span className="absolute inset-x-0 bottom-0.5 text-center font-['JetBrains_Mono'] text-[8px] font-extrabold text-[#0a0b0d] tracking-tighter leading-none pointer-events-none drop-shadow-[0_1px_1px_rgba(255,255,255,0.4)]">
                              {midiToNoteName(midiNote)}
                            </span>
                          )}

                          {/* Triplet roll inner stripes for Hat = 3 */}
                          {isHatTriplet && !isOutsideLoop && (
                            <span 
                              className="absolute inset-x-1 inset-y-1.5 pointer-events-none opacity-75"
                              style={{
                                background: "repeating-linear-gradient(180deg, transparent 0 3px, rgba(10,11,13,0.85) 3px 6px)",
                              }}
                            />
                          )}

                          {/* Synchronized Global Laser Playhead Beam on this cell */}
                          {isPlayhead && (
                            <span className="absolute inset-0 border-2 border-[#f5b73d] bg-[#f5b73d]/25 shadow-[0_0_14px_rgba(245,183,61,0.5)] rounded-md pointer-events-none z-10" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Collapsible Velocity Drawer (FL Studio style) */}
          {isVelocityLaneOpen && (
            <div className="mt-3 pt-3 border-t border-[#1a1c21]">
              <VelocityLane
                tracks={pattern.tracks}
                activeTrackIdx={velocityActiveTrackIdx}
                onSelectTrack={(idx) => setVelocityActiveTrackIdx(idx)}
                onUpdateVelocity={(trackIdx, stepIdx, newVel) => {
                  setPattern((prev) => {
                    const copy = JSON.parse(JSON.stringify(prev));
                    const t = copy.tracks[trackIdx];
                    if (!t.velocity) t.velocity = Array(stepCount).fill(100);
                    t.velocity[stepIdx] = newVel;
                    return copy;
                  });
                }}
                onBatchUpdateVelocity={(trackIdx, newVelocities) => {
                  setPattern((prev) => {
                    const copy = JSON.parse(JSON.stringify(prev));
                    const t = copy.tracks[trackIdx];
                    t.velocity = [...newVelocities];
                    return copy;
                  });
                }}
                onClose={() => setIsVelocityLaneOpen(false)}
                currentStep={isPlaying ? currentStep : -1}
                isPlaying={isPlaying}
                language={language}
                stepCount={stepCount}
                stepsPerBar={stepsPerBar}
                groupSize={groupSize}
                tracksConfig={DEMO_TRACKS_CONFIG}
              />
            </div>
          )}

          {/* Bottom Hint Note (.seq-note) */}
          <div className="mt-3.5 font-['JetBrains_Mono'] text-[10px] text-[#5a5e68] tracking-[0.04em] leading-relaxed border-t border-[#1a1c21] pt-3 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              {isTouchDevice ? (
                language === "zh" ? (
                  <span>
                    <strong className="text-[#f5b73d] font-bold">📱 触控/移动端操作：</strong> 点按步进开/关 · 长按步进调出参数锁 (P-Locks) · 顶部步进工具栏切换重音/连音/音高模式 · 点按轨道名试听音色 · 左右滑动浏览小节
                  </span>
                ) : (
                  <span>
                    <strong className="text-[#f5b73d] font-bold">📱 Touch & Mobile:</strong> Tap step to toggle · Long-press for P-Locks · Switch Tool Mode ribbon for accent/ratchet/pitch · Tap track name to audition · Swipe to scroll bars
                  </span>
                )
              ) : (
                language === "zh" ? (
                  <span>
                    <strong className="text-[#f5b73d] font-bold">💻 电脑端快捷键：</strong> 点击/拖拽涂抹 · 右键参数锁 (P-Locks) · SHIFT+点击重音 · ALT+点击连音 (1x-4x) · CMD+点击选音高 · 空格 播放/暂停 · V 力度抽屉 · E 欧几里得律动
                  </span>
                ) : (
                  <span>
                    <strong className="text-[#f5b73d] font-bold">💻 Desktop Shortcuts:</strong> Click / drag to paint · Right-click P-Locks · SHIFT+click accent · ALT+click ratchet (1x-4x) · CMD+click pitch · Space Play/Stop · V Velocity drawer · E Euclidean generator
                  </span>
                )
              )}
              {/* Manual Device Hint Switcher Button */}
              <button
                onClick={() => setIsTouchDevice(!isTouchDevice)}
                className="px-1.5 py-0.5 text-[9px] rounded bg-[#17181d] border border-[#23262d] text-[#8b8f99] hover:text-[#f5b73d] hover:border-[#f5b73d]/50 transition-colors ml-1 touch-manipulation"
                title={language === "zh" ? "手动切换电脑端 / 触控端提示视图" : "Toggle desktop / mobile hint view"}
              >
                {isTouchDevice
                  ? (language === "zh" ? "电脑快捷键 ↗" : "Desktop Keys ↗")
                  : (language === "zh" ? "触控操作指南 ↗" : "Mobile Gestures ↗")}
              </button>
            </div>
            <div className="text-[#8b8f99]">
              {isEditorMaximized ? (language === "zh" ? "按 Esc 退出最大化" : "Press Esc to exit fullscreen") : ""}
            </div>
          </div>

          {/* Step Context Menu (P-Locks & Parameters) */}
          {stepContextMenu && (
            <div 
              className="fixed inset-0 z-50 bg-black/25 select-none"
              onClick={() => setStepContextMenu(null)}
              onContextMenu={(e) => { e.preventDefault(); setStepContextMenu(null); }}
            >
              <div
                className="absolute bg-[#121317] border border-[#2b2e38] rounded-xl shadow-2xl p-3 w-56 text-xs font-['JetBrains_Mono'] z-50 text-[#e9e7e0]"
                style={{
                  top: Math.min(window.innerHeight - 340, Math.max(12, stepContextMenu.y)),
                  left: Math.min(window.innerWidth - 240, Math.max(12, stepContextMenu.x)),
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="flex items-center justify-between pb-2 border-b border-[#1f222a] mb-2.5">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: DEMO_TRACKS_CONFIG[stepContextMenu.trackIdx % DEMO_TRACKS_CONFIG.length].color }}
                    />
                    <span className="font-bold text-[#e9e7e0]">
                      {pattern.tracks[stepContextMenu.trackIdx]?.name}
                    </span>
                    <span className="text-[#8b8f99]">
                      #{(stepContextMenu.stepIdx + 1).toString().padStart(2, "0")}
                    </span>
                  </div>
                  <button
                    onClick={() => setStepContextMenu(null)}
                    className="w-4 h-4 rounded text-[#8b8f99] hover:text-[#e9e7e0] flex items-center justify-center text-xs"
                  >
                    ✕
                  </button>
                </div>

                {/* Note Trigger Toggle */}
                <div className="mb-2.5">
                  <button
                    onClick={() => {
                      const tr = pattern.tracks[stepContextMenu.trackIdx];
                      const cur = tr.steps[stepContextMenu.stepIdx] || 0;
                      const next = cur > 0 ? 0 : 1;
                      setPattern((prev) => {
                        const copy = JSON.parse(JSON.stringify(prev));
                        const t = copy.tracks[stepContextMenu.trackIdx];
                        t.steps[stepContextMenu.stepIdx] = next;
                        if (next > 0 && (!t.velocity || !t.velocity[stepContextMenu.stepIdx])) {
                          if (!t.velocity) t.velocity = Array(stepCount).fill(100);
                          t.velocity[stepContextMenu.stepIdx] = 100;
                        }
                        return copy;
                      });
                      if (next > 0 && engineRef.current) {
                        const pitch = tr.pitch?.[stepContextMenu.stepIdx] || 0;
                        engineRef.current.triggerNote(stepContextMenu.trackIdx, tr.name, 0.8, pitch, 1);
                      }
                      setStepContextMenu(null);
                    }}
                    className="w-full py-1.5 px-2 rounded-lg bg-[#1a1c22] hover:bg-[#23262e] border border-[#262932] text-center font-bold text-xs text-[#e9e7e0] transition-colors"
                  >
                    {pattern.tracks[stepContextMenu.trackIdx]?.steps[stepContextMenu.stepIdx] > 0
                      ? (language === "zh" ? "关闭此步音符 (OFF)" : "Turn Off Step")
                      : (language === "zh" ? "开启此步音符 (ON)" : "Turn On Step")}
                  </button>
                </div>

                {/* Velocity / Dynamics */}
                <div className="mb-2.5">
                  <div className="text-[9px] text-[#5a5e68] tracking-wider uppercase mb-1">
                    {language === "zh" ? "力度 / 动态 (VELOCITY)" : "VELOCITY / DYNAMICS"}
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      { label: "Soft", val: 64 },
                      { label: "Norm", val: 100 },
                      { label: "Accent", val: 127 },
                    ].map((item) => (
                      <button
                        key={item.val}
                        onClick={() => {
                          setPattern((prev) => {
                            const copy = JSON.parse(JSON.stringify(prev));
                            const t = copy.tracks[stepContextMenu.trackIdx];
                            if (t.steps[stepContextMenu.stepIdx] === 0) t.steps[stepContextMenu.stepIdx] = 1;
                            if (!t.velocity) t.velocity = Array(stepCount).fill(100);
                            t.velocity[stepContextMenu.stepIdx] = item.val;
                            return copy;
                          });
                          setStepContextMenu(null);
                        }}
                        className={`py-1 rounded text-[10px] border transition-colors ${
                          (pattern.tracks[stepContextMenu.trackIdx]?.velocity?.[stepContextMenu.stepIdx] ?? 100) === item.val
                            ? "bg-[#f5b73d]/20 border-[#f5b73d] text-[#f5b73d] font-bold"
                            : "bg-[#16171d] border-[#22242c] text-[#8b8f99] hover:text-[#e9e7e0]"
                        }`}
                      >
                        {item.label} ({item.val})
                      </button>
                    ))}
                  </div>
                </div>

                {/* Ratchet / Subdivisions */}
                <div className="mb-2.5">
                  <div className="text-[9px] text-[#5a5e68] tracking-wider uppercase mb-1">
                    {language === "zh" ? "连音滚奏 (RATCHET)" : "RATCHET / SUBDIVISION"}
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {[1, 2, 3, 4].map((r) => (
                      <button
                        key={r}
                        onClick={() => {
                          setPattern((prev) => {
                            const copy = JSON.parse(JSON.stringify(prev));
                            const t = copy.tracks[stepContextMenu.trackIdx];
                            if (t.steps[stepContextMenu.stepIdx] === 0) t.steps[stepContextMenu.stepIdx] = 1;
                            if (!t.ratchet) t.ratchet = Array(stepCount).fill(1);
                            t.ratchet[stepContextMenu.stepIdx] = r;
                            return copy;
                          });
                          setStepContextMenu(null);
                        }}
                        className={`py-1 rounded text-[10px] border transition-colors ${
                          (pattern.tracks[stepContextMenu.trackIdx]?.ratchet?.[stepContextMenu.stepIdx] ?? 1) === r
                            ? "bg-[#45e0c9]/20 border-[#45e0c9] text-[#45e0c9] font-bold"
                            : "bg-[#16171d] border-[#22242c] text-[#8b8f99] hover:text-[#e9e7e0]"
                        }`}
                      >
                        {r}x
                      </button>
                    ))}
                  </div>
                </div>

                {/* Probability / Chance */}
                <div className="mb-2.5">
                  <div className="text-[9px] text-[#5a5e68] tracking-wider uppercase mb-1">
                    {language === "zh" ? "触发概率 (CHANCE)" : "PROBABILITY"}
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {[100, 75, 50, 25].map((p) => (
                      <button
                        key={p}
                        onClick={() => {
                          setPattern((prev) => {
                            const copy = JSON.parse(JSON.stringify(prev));
                            const t = copy.tracks[stepContextMenu.trackIdx];
                            if (t.steps[stepContextMenu.stepIdx] === 0) t.steps[stepContextMenu.stepIdx] = 1;
                            if (!t.probability) t.probability = Array(stepCount).fill(100);
                            t.probability[stepContextMenu.stepIdx] = p;
                            return copy;
                          });
                          setStepContextMenu(null);
                        }}
                        className={`py-1 rounded text-[10px] border transition-colors ${
                          (pattern.tracks[stepContextMenu.trackIdx]?.probability?.[stepContextMenu.stepIdx] ?? 100) === p
                            ? "bg-[#f5b73d]/20 border-[#f5b73d] text-[#f5b73d] font-bold"
                            : "bg-[#16171d] border-[#22242c] text-[#8b8f99] hover:text-[#e9e7e0]"
                        }`}
                      >
                        {p}%
                      </button>
                    ))}
                  </div>
                </div>

                {/* Pitch / Chromatic Note (For Bass, Chord, Lead) */}
                {(() => {
                  const tr = pattern.tracks[stepContextMenu.trackIdx];
                  const isMelodic = tr && (tr.track_id === "bass" || tr.track_id === "chords" || tr.track_id === "lead");
                  if (!isMelodic) return null;
                  return (
                    <button
                      onClick={() => {
                        const curNote = tr.pitch?.[stepContextMenu.stepIdx] || (tr.track_id === "bass" ? 36 : 60);
                        const savedTrackIdx = stepContextMenu.trackIdx;
                        const savedStepIdx = stepContextMenu.stepIdx;
                        setStepContextMenu(null);
                        setPitchPicker({
                          isOpen: true,
                          trackIdx: savedTrackIdx,
                          stepIdx: savedStepIdx,
                          initialNote: curNote,
                        });
                      }}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-[#1f222a] hover:bg-[#282c36] border border-[#2f333f] text-[#45e0c9] text-xs font-bold transition-colors"
                    >
                      <Music className="w-3.5 h-3.5" />
                      <span>{language === "zh" ? "设置音高 / 键盘" : "Choose Pitch Note"}</span>
                    </button>
                  );
                })()}
              </div>
            </div>
          )}
        </section>

        {/* Euclidean Modal */}
        {isEuclideanOpen && (
          <EuclideanModal
            isOpen={isEuclideanOpen}
            onClose={() => setIsEuclideanOpen(false)}
            tracks={pattern.tracks}
            tracksConfig={DEMO_TRACKS_CONFIG}
            initialTrackIdx={velocityActiveTrackIdx}
            onApplyEuclidean={(trackIdx, steps) => {
              setPattern((prev) => {
                const copy = JSON.parse(JSON.stringify(prev));
                const t = copy.tracks[trackIdx];
                t.steps = steps.slice(0, stepCount);
                return copy;
              });
              showToast(language === "zh" ? "已生成欧几里得律动" : "Euclidean rhythm applied");
            }}
            language={language}
            stepCount={stepCount}
          />
        )}

        {/* Pitch Picker Modal */}
        {pitchPicker.isOpen && (
          <PitchPickerModal
            isOpen={pitchPicker.isOpen}
            onClose={() => setPitchPicker((prev) => ({ ...prev, isOpen: false }))}
            trackName={pattern.tracks[pitchPicker.trackIdx]?.name || "TRACK"}
            trackColor={DEMO_TRACKS_CONFIG[pitchPicker.trackIdx % DEMO_TRACKS_CONFIG.length].color}
            stepIdx={pitchPicker.stepIdx}
            initialNote={pitchPicker.initialNote}
            onSelectPitch={(stepIdx, midiNote) => {
              setPattern((prev) => {
                const copy = JSON.parse(JSON.stringify(prev));
                const t = copy.tracks[pitchPicker.trackIdx];
                if (!t.pitch) t.pitch = Array(stepCount).fill(0);
                t.pitch[stepIdx] = midiNote;
                return copy;
              });
            }}
            onPreviewNote={(midiNote) => {
              if (engineRef.current) {
                const tr = pattern.tracks[pitchPicker.trackIdx];
                engineRef.current.triggerNote(pitchPicker.trackIdx, tr.name, 0.85, midiNote, 1);
              }
            }}
            language={language}
          />
        )}
      </main>
    </div>
  );
};
