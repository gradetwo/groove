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
  Layers
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

  // Sidebar collapse & Maximize states
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isEditorMaximized, setIsEditorMaximized] = useState<boolean>(false);

  // Meter & quantization
  const [timeSignature, setTimeSignature] = useState<string>(() => currentGenre.time_signature || "4/4");
  const [resolution, setResolution] = useState<"1/8" | "1/16" | "1/32">("1/16");

  // Visualizer canvas ref
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Sequencer matrix scroll container ref
  const matrixContainerRef = useRef<HTMLDivElement | null>(null);
  const [isRulerDragging, setIsRulerDragging] = useState(false);
  const rulerDragStartXRef = useRef(0);
  const rulerDragScrollLeftRef = useRef(0);

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
    engine.setTimeSignature(timeSignature);
    engine.setResolution(resolution);

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

  // Horizontal mouse wheel pan listener on matrix container
  useEffect(() => {
    const el = matrixContainerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (el.scrollWidth > el.clientWidth) {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          e.preventDefault();
          el.scrollLeft += e.deltaY;
        }
      }
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  // Ruler horizontal drag-to-scroll handler and effect
  const handleRulerMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsRulerDragging(true);
    rulerDragStartXRef.current = e.clientX;
    if (matrixContainerRef.current) {
      rulerDragScrollLeftRef.current = matrixContainerRef.current.scrollLeft;
    }
  };

  useEffect(() => {
    if (!isRulerDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!matrixContainerRef.current) return;
      const dx = e.clientX - rulerDragStartXRef.current;
      matrixContainerRef.current.scrollLeft = rulerDragScrollLeftRef.current - dx;
    };

    const handleMouseUp = () => {
      setIsRulerDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isRulerDragging]);

  // Real-time oscilloscope / spectrum canvas visualizer
  useEffect(() => {
    let animId: number;
    const renderVisualizer = () => {
      animId = requestAnimationFrame(renderVisualizer);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const analyser = engineRef.current?.getAnalyser();
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      if (!isPlaying || !analyser) {
        ctx.fillStyle = "#1e2128";
        const barCount = 18;
        const bw = (w - (barCount - 1) * 2) / barCount;
        for (let i = 0; i < barCount; i++) {
          ctx.fillRect(i * (bw + 2), h - 3, bw, 3);
        }
        return;
      }

      const freqData = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(freqData);

      const barCount = 18;
      const bw = (w - (barCount - 1) * 2) / barCount;
      const step = Math.max(1, Math.floor(freqData.length / barCount));

      for (let i = 0; i < barCount; i++) {
        const val = freqData[i * step] || 0;
        const percent = val / 255;
        const bh = Math.max(3, percent * (h - 2));

        const grad = ctx.createLinearGradient(0, h, 0, 0);
        grad.addColorStop(0, genreAccent || "#f5b73d");
        grad.addColorStop(1, "#fff");
        ctx.fillStyle = grad;
        ctx.fillRect(i * (bw + 2), h - bh, bw, bh);
      }
    };

    animId = requestAnimationFrame(renderVisualizer);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, genreAccent]);

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

  // Keyboard shortcut: Space to play/pause, Esc to exit maximize
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.key === "Escape" && isEditorMaximized) {
        e.preventDefault();
        setIsEditorMaximized(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying, isEditorMaximized]);

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

  // Steps per bar in the sequencer
  const stepsPerBar = useMemo(() => {
    if (timeNum === 3) {
      if (resolution === "1/8") return 6;
      if (resolution === "1/32") return 24;
      return stepCount <= 6 ? 3 : 12;
    }
    if (timeNum === 2) {
      if (resolution === "1/8") return 4;
      if (resolution === "1/32") return 16;
      return stepCount <= 4 ? 2 : 8;
    }
    if (timeNum === 6) return resolution === "1/8" ? 6 : 12;
    if (timeNum === 3 && timeDenom === 8) return 3;
    if (timeNum === 5) return 5;
    if (timeNum === 7) return 7;
    if (timeNum === 9) return 9;
    if (timeNum === 12) return 12;

    const stepsPerQuarter = resolution === "1/8" ? 2 : resolution === "1/32" ? 8 : 4;
    return timeNum * stepsPerQuarter;
  }, [timeNum, timeDenom, resolution, stepCount]);

  const stepsPerBeat = useMemo(() => {
    if (timeNum === 3) return groupSize;
    if (timeNum === 2) return 4;
    const stepsPerQuarter = resolution === "1/8" ? 2 : resolution === "1/32" ? 8 : 4;
    return Math.max(1, Math.round(stepsPerQuarter * (4 / timeDenom)));
  }, [timeNum, groupSize, resolution, timeDenom]);

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
              ? "fixed inset-0 z-50 overflow-y-auto bg-[#0a0b0d] p-4 sm:p-7 flex flex-col"
              : "bg-[#121317] border border-[#23262d] rounded-2xl p-4 sm:p-5 min-w-0 order-1 lg:order-2 shadow-2xl"
          }
        >
          {/* Maximize Top Banner (Only visible in fullscreen mode) */}
          {isEditorMaximized && (
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-[#1a1c21] shrink-0">
              <div className="flex items-center gap-3">
                <span
                  className="w-3 h-3 rounded-full shadow-[0_0_10px_var(--g)]"
                  style={{ backgroundColor: "var(--g)" }}
                />
                <span className="font-['Space_Grotesk'] font-bold text-xl text-[#e9e7e0]">
                  {currentGenre.name}
                </span>
                <span className="font-['JetBrains_Mono'] text-xs text-[#8b8f99] px-2.5 py-0.5 rounded-lg bg-[#17181c] border border-[#23262d]">
                  {timeSignature} · {bpm} BPM · {stepCount} STEPS ({barCount} BARS) · {resolution}
                </span>
              </div>
              <button
                onClick={() => setIsEditorMaximized(false)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#17181c] hover:bg-[#23262d] border border-[#2b2e38] text-xs text-[#e9e7e0] rounded-xl font-medium transition-colors shadow-lg"
              >
                <Minimize2 className="w-4 h-4 text-[#f5b73d]" />
                <span>{language === "zh" ? "退出全屏 (Esc)" : "Exit Fullscreen (Esc)"}</span>
              </button>
            </div>
          )}

          {/* Transport Bar (.transport) */}
          <div className="flex items-center gap-3 sm:gap-4 flex-wrap pb-4 border-b border-[#1a1c21] mb-3">
            {/* Sidebar toggle button when collapsed */}
            {isSidebarCollapsed && !isEditorMaximized && (
              <button
                onClick={() => setIsSidebarCollapsed(false)}
                className="flex items-center gap-1.5 text-xs text-[#8b8f99] hover:text-[#f5b73d] px-2.5 py-2 border border-[#23262d] rounded-lg transition-colors bg-[#0d0e12] shrink-0"
                title={language === "zh" ? "展开风格档案" : "Expand genre dossier"}
              >
                <PanelLeftOpen className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{language === "zh" ? "风格" : "Info"}</span>
              </button>
            )}

            {/* Round Play Button (#playBtn) */}
            <button
              onClick={handleTogglePlay}
              className={`w-[52px] h-[52px] rounded-full bg-[#f5b73d] flex items-center justify-center transition-transform hover:brightness-110 shrink-0 shadow-[0_0_20px_rgba(245,183,61,0.25)] ${
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

            {/* Real-time Spectrum / Oscilloscope Visualizer Canvas */}
            <div
              className="flex items-center gap-1 px-2 py-1 bg-[#0d0e12] border border-[#1a1c21] rounded-lg h-[48px] shrink-0 hidden md:flex"
              title="Real-time Audio Spectrum / 实时音频频谱"
            >
              <canvas ref={canvasRef} width={80} height={36} className="w-[80px] h-[36px] block rounded" />
            </div>

            {/* BPM Slider Knob */}
            <div className="flex flex-col gap-1 min-w-[130px] flex-1 sm:flex-initial">
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
            <div className="flex flex-col gap-1 min-w-[120px] flex-1 sm:flex-initial">
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

            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap ml-auto">
              {/* Reset Preset (.t-btn) */}
              <button
                onClick={handleResetPreset}
                className="flex items-center gap-1.5 text-xs text-[#8b8f99] hover:text-[#e9e7e0] hover:border-[#3a3e48] px-2.5 sm:px-3 py-2 border border-[#23262d] rounded-lg transition-colors bg-[#0d0e12]"
                title={t("restore")}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t("restore")}</span>
              </button>

              {/* Export MIDI (.t-btn) */}
              <button
                onClick={handleExportMidi}
                className="flex items-center gap-1.5 text-xs text-[#8b8f99] hover:text-[#e9e7e0] hover:border-[#3a3e48] px-2.5 sm:px-3 py-2 border border-[#23262d] rounded-lg transition-colors bg-[#0d0e12]"
                title={t("export")}
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t("export")}</span>
              </button>

              {/* Share Groove */}
              <button
                onClick={handleShare}
                className="flex items-center gap-1.5 text-xs text-[#8b8f99] hover:text-[#f5b73d] hover:border-[#f5b73d] px-2.5 sm:px-3 py-2 border border-[#23262d] rounded-lg transition-colors bg-[#0d0e12]"
                title={t("share_groove")}
              >
                <Share2 className="w-3.5 h-3.5" />
              </button>

              {/* Fullscreen Maximize Toggle (Only shown when not maximized; in maximized mode top banner provides full exit control) */}
              {!isEditorMaximized && (
                <button
                  onClick={() => setIsEditorMaximized(true)}
                  className="flex items-center gap-1.5 text-xs px-2.5 sm:px-3 py-2 border border-[#23262d] text-[#8b8f99] hover:text-[#f5b73d] hover:border-[#f5b73d] rounded-lg transition-colors bg-[#0d0e12]"
                  title={language === "zh" ? "最大化编辑器" : "Maximize Editor"}
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">
                    {language === "zh" ? "全屏" : "Maximize"}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Sequencer Pro Toolbar: Time Sig, Resolution, Step Length & Pro DAW Operations */}
          <div className="flex items-center justify-between gap-2.5 flex-wrap pb-3 mb-3 border-b border-[#1a1c21] text-xs">
            {/* Left group: Time Sig & Resolution & Steps */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Time Signature */}
              <div className="flex items-center gap-1.5 bg-[#0d0e12] border border-[#23262d] px-2.5 py-1 rounded-lg">
                <span className="font-['JetBrains_Mono'] text-[10px] text-[#5a5e68] tracking-wider uppercase">
                  {language === "zh" ? "节拍" : "METER"}
                </span>
                <select
                  value={timeSignature}
                  onChange={(e) => handleTimeSignatureChange(e.target.value)}
                  className="bg-transparent text-[#e9e7e0] font-['JetBrains_Mono'] text-xs font-bold focus:outline-none cursor-pointer"
                >
                  <option value="4/4" className="bg-[#121317]">4/4 (四四拍 · 4格一组)</option>
                  <option value="2/4" className="bg-[#121317]">2/4 (二四拍 · 2格一组)</option>
                  <option value="3/4" className="bg-[#121317]">3/4 (三四拍 · 3格一组)</option>
                  <option value="2/2" className="bg-[#121317]">2/2 (二二拍 · 2格一组)</option>
                  <option value="6/8" className="bg-[#121317]">6/8 (六八拍 · 3格一组)</option>
                  <option value="3/8" className="bg-[#121317]">3/8 (三八拍 · 3格一组)</option>
                  <option value="9/8" className="bg-[#121317]">9/8 (九八拍 · 3格一组)</option>
                  <option value="12/8" className="bg-[#121317]">12/8 (十二八拍 · 3格一组)</option>
                  <option value="5/4" className="bg-[#121317]">5/4 (五四拍 · 5格一组)</option>
                  <option value="7/8" className="bg-[#121317]">7/8 (七八拍 · 7格一组)</option>
                </select>
              </div>

              {/* Quantize Resolution */}
              <div className="flex items-center gap-1 bg-[#0d0e12] border border-[#23262d] p-0.5 rounded-lg">
                <span className="font-['JetBrains_Mono'] text-[10px] text-[#5a5e68] tracking-wider uppercase pl-2 pr-1">
                  {language === "zh" ? "精度" : "GRID"}
                </span>
                {(["1/8", "1/16", "1/32"] as const).map((res) => (
                  <button
                    key={res}
                    onClick={() => handleResolutionChange(res)}
                    className={`px-2 py-0.5 rounded font-['JetBrains_Mono'] text-xs transition-colors ${
                      resolution === res
                        ? "bg-[#f5b73d] text-[#0a0b0d] font-bold shadow-sm"
                        : "text-[#8b8f99] hover:text-[#e9e7e0]"
                    }`}
                  >
                    {res}
                  </button>
                ))}
              </div>

              {/* Step Length Controls */}
              <div className="flex items-center gap-1 bg-[#0d0e12] border border-[#23262d] px-2 py-1 rounded-lg">
                <span className="font-['JetBrains_Mono'] text-[10px] text-[#5a5e68] tracking-wider uppercase mr-1">
                  {stepCount} {language === "zh" ? "步" : "STEPS"} ({barCount} {barCount === 1 ? "BAR" : "BARS"})
                </span>
                <button
                  onClick={() => handleRemoveSteps(groupSize)}
                  className="w-5 h-5 flex items-center justify-center rounded bg-[#17181c] hover:bg-[#23262d] text-[#8b8f99] hover:text-[#e9e7e0] border border-[#23262d]"
                  title={language === "zh" ? `删减 ${groupSize} 步 (1组)` : `Remove ${groupSize} steps`}
                >
                  <Minus className="w-3 h-3" />
                </button>
                <span className="font-['JetBrains_Mono'] text-[10px] font-bold text-[#f5b73d] px-0.5" title={language === "zh" ? "每组步进数" : "Group step size"}>
                  ±{groupSize}
                </span>
                <button
                  onClick={() => handleAddSteps(groupSize)}
                  className="w-5 h-5 flex items-center justify-center rounded bg-[#17181c] hover:bg-[#23262d] text-[#8b8f99] hover:text-[#e9e7e0] border border-[#23262d]"
                  title={language === "zh" ? `添加 ${groupSize} 步 (1组)` : `Add ${groupSize} steps`}
                >
                  <Plus className="w-3 h-3" />
                </button>
                <button
                  onClick={() => handleAddSteps(stepsPerBar)}
                  className="px-1.5 h-5 flex items-center justify-center rounded bg-[#17181c] hover:bg-[#23262d] text-[10px] font-['JetBrains_Mono'] text-[#f5b73d] border border-[#23262d]"
                  title={language === "zh" ? `添加 1 小节 (+${stepsPerBar} 步)` : `Add 1 Bar (+${stepsPerBar} steps)`}
                >
                  +1 Bar
                </button>
                <button
                  onClick={() => handleAddSteps(stepsPerBar * 2)}
                  className="px-1.5 h-5 flex items-center justify-center rounded bg-[#17181c] hover:bg-[#23262d] text-[10px] font-['JetBrains_Mono'] text-[#f5b73d] border border-[#23262d] hidden xl:flex"
                  title={language === "zh" ? `添加 2 小节 (+${stepsPerBar * 2} 步)` : `Add 2 Bars (+${stepsPerBar * 2} steps)`}
                >
                  +2 Bars
                </button>
              </div>

              {/* Quick Step Length Presets */}
              <div className="hidden lg:flex items-center gap-1">
                {[16, 32, 48, 64].map((cnt) => (
                  <button
                    key={cnt}
                    onClick={() => handleSetStepCount(cnt)}
                    className={`px-1.5 py-0.5 rounded font-['JetBrains_Mono'] text-[10px] border transition-colors ${
                      stepCount === cnt
                        ? "bg-[#23262d] text-[#f5b73d] border-[#f5b73d]/50 font-bold"
                        : "bg-[#0d0e12] text-[#5a5e68] border-[#1a1c21] hover:text-[#8b8f99]"
                    }`}
                  >
                    {cnt}
                  </button>
                ))}
              </div>
            </div>

            {/* Right group: Pro Sequence Operations (Duplicate Bar, Humanize, Clear All) */}
            <div className="flex items-center gap-1.5 ml-auto">
              <button
                onClick={handleDuplicateBar1}
                className="flex items-center gap-1 px-2.5 py-1 bg-[#0d0e12] border border-[#23262d] hover:border-[#3a3e48] rounded-lg text-xs text-[#8b8f99] hover:text-[#e9e7e0] transition-colors"
                title={language === "zh" ? "将第 1 小节节奏平铺复制到整段" : "Duplicate Bar 1 across all bars"}
              >
                <Copy className="w-3 h-3 text-[#ffb65c]" />
                <span className="hidden sm:inline">{language === "zh" ? "复制小节1" : "Dup Bar 1"}</span>
              </button>

              <button
                onClick={handleHumanize}
                className="flex items-center gap-1 px-2.5 py-1 bg-[#0d0e12] border border-[#23262d] hover:border-[#3a3e48] rounded-lg text-xs text-[#8b8f99] hover:text-[#e9e7e0] transition-colors"
                title={language === "zh" ? "微随机化触发力度 (±10%)，带来真实人性律动" : "Humanize velocity jitter (±10%)"}
              >
                <Sparkles className="w-3 h-3 text-[#45e0c9]" />
                <span className="hidden sm:inline">{language === "zh" ? "人性化" : "Humanize"}</span>
              </button>

              <button
                onClick={handleClearAll}
                className="flex items-center gap-1 px-2 py-1 bg-[#0d0e12] border border-[#23262d] hover:border-[#ff5964]/50 rounded-lg text-xs text-[#8b8f99] hover:text-[#ff5964] transition-colors"
                title={language === "zh" ? "清空所有步进" : "Clear all steps"}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Measure / Bar Quick-Jump Navigator & Scroll Bar Controls */}
          <div className="flex items-center justify-between gap-2 pb-2 mb-1.5 text-xs select-none">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-['JetBrains_Mono'] text-[10px] text-[#5a5e68] tracking-wider uppercase mr-1">
                {language === "zh" ? "小节定位:" : "MEASURES:"}
              </span>
              {Array.from({ length: barCount }, (_, bIdx) => {
                const isCurrentBar = isPlaying && Math.floor(currentStep / stepsPerBar) === bIdx;
                const startStep = bIdx * stepsPerBar + 1;
                const endStep = Math.min(stepCount, (bIdx + 1) * stepsPerBar);
                return (
                  <button
                    key={bIdx}
                    onClick={() => scrollToBar(bIdx)}
                    className={`px-2.5 py-1 rounded-md font-['JetBrains_Mono'] text-xs font-semibold transition-all border ${
                      isCurrentBar
                        ? "bg-[#f5b73d] text-[#0a0b0d] border-[#f5b73d] shadow-[0_0_12px_rgba(245,183,61,0.4)] scale-[1.03]"
                        : "bg-[#0d0e12] border-[#23262d] text-[#8b8f99] hover:text-[#e9e7e0] hover:border-[#3a3e48]"
                    }`}
                    title={language === "zh" ? `跳转至第 ${bIdx + 1} 小节 (${startStep}-${endStep} 步)` : `Jump to Bar ${bIdx + 1} (Steps ${startStep}-${endStep})`}
                  >
                    Bar {bIdx + 1} <span className="text-[10px] opacity-75">({startStep}-{endStep})</span>
                  </button>
                );
              })}
            </div>

            {/* Left / Right Pan Buttons & Drag hint */}
            <div className="flex items-center gap-1.5 text-[#5a5e68]">
              <span className="hidden sm:inline font-['JetBrains_Mono'] text-[10px]">
                {language === "zh" ? "滚轮/标尺拖拽可平移" : "Wheel/drag ruler to pan"}
              </span>
              <button
                onClick={() => scrollByPixels(-240)}
                className="w-6 h-6 rounded bg-[#0d0e12] border border-[#23262d] hover:border-[#f5b73d] text-[#8b8f99] hover:text-[#f5b73d] flex items-center justify-center text-xs transition-colors"
                title={language === "zh" ? "向左滚动" : "Scroll left"}
              >
                ◀
              </button>
              <button
                onClick={() => scrollByPixels(240)}
                className="w-6 h-6 rounded bg-[#0d0e12] border border-[#23262d] hover:border-[#f5b73d] text-[#8b8f99] hover:text-[#f5b73d] flex items-center justify-center text-xs transition-colors"
                title={language === "zh" ? "向右滚动" : "Scroll right"}
              >
                ▶
              </button>
            </div>
          </div>

          {/* 8 Tracks Sequencer Matrix (#tracks) */}
          <div
            ref={matrixContainerRef}
            className="w-full space-y-1 overflow-x-auto pb-3 relative custom-sequencer-scroll select-none"
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
                className={`flex-1 flex gap-1 relative cursor-grab select-none ${
                  isRulerDragging ? "cursor-grabbing" : ""
                }`}
                onMouseDown={handleRulerMouseDown}
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
                      className={`min-w-[28px] sm:min-w-[32px] flex-1 h-7 rounded flex flex-col items-center justify-center transition-all select-none border ${
                        isBarStart
                          ? "ml-3 sm:ml-4 border-l-2 border-l-[#f5b73d]/80"
                          : isGroupStart
                          ? "ml-2 sm:ml-2.5 border-l border-[#3a3e48]"
                          : ""
                      } ${
                        isCurrent
                          ? "bg-[#f5b73d]/20 border-[#f5b73d] text-[#f5b73d] shadow-[0_0_12px_rgba(245,183,61,0.35)] font-bold scale-[1.03]"
                          : isFirstStepOfBar
                          ? "bg-[#1f222b] border-[#3a3e48] text-[#f5b73d] font-bold"
                          : isFirstStepOfGroup
                          ? "bg-[#171920] border-[#2b2e38] text-[#e9e7e0]"
                          : "bg-[#101115] border-[#1c1d22] text-[#5a5e68]"
                      }`}
                      title={`Step ${stepIdx + 1} (Bar ${barIdx}, Group ${groupIdx}.${stepInGroup})`}
                    >
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
                    {/* Upper row: Swatch + Title + Mute / Solo */}
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-1 h-5 rounded-sm shadow-[0_0_8px_var(--tc)] shrink-0"
                        style={{ backgroundColor: meta.color }}
                      />
                      <span className="font-['JetBrains_Mono'] text-[11px] tracking-[0.05em] text-[#e9e7e0] font-bold truncate flex-1">
                        {meta.name}
                      </span>
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => toggleMute(trackIdx)}
                          className={`w-4 h-4 font-['JetBrains_Mono'] text-[8.5px] border rounded transition-colors flex items-center justify-center ${
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
                          className={`w-4 h-4 font-['JetBrains_Mono'] text-[8.5px] border rounded transition-colors flex items-center justify-center ${
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

                    {/* Lower row: Volume slider + Track actions (Shift, Smart Fill, Clear) */}
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
                          className="w-12 h-1 accent-[#f5b73d] bg-[#1a1c21] rounded cursor-pointer"
                        />
                      </div>

                      {/* Track Quick Actions */}
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          onClick={() => handleShiftTrack(trackIdx, -1)}
                          className="w-4 h-4 rounded hover:bg-[#1a1c21] text-[#5a5e68] hover:text-[#e9e7e0] flex items-center justify-center text-[10px]"
                          title={language === "zh" ? "向左位移 1 步" : "Shift left 1 step"}
                        >
                          ◀
                        </button>
                        <button
                          onClick={() => handleShiftTrack(trackIdx, 1)}
                          className="w-4 h-4 rounded hover:bg-[#1a1c21] text-[#5a5e68] hover:text-[#e9e7e0] flex items-center justify-center text-[10px]"
                          title={language === "zh" ? "向右位移 1 步" : "Shift right 1 step"}
                        >
                          ▶
                        </button>
                        <button
                          onClick={() => handleSmartFillTrack(trackIdx)}
                          className="w-4 h-4 rounded hover:bg-[#1a1c21] text-[#5a5e68] hover:text-[#45e0c9] flex items-center justify-center text-[10px]"
                          title={language === "zh" ? "智能生成常规节拍" : "Smart fill rhythm"}
                        >
                          <Wand2 className="w-2.5 h-2.5" />
                        </button>
                        <button
                          onClick={() => handleClearTrack(trackIdx)}
                          className="w-4 h-4 rounded hover:bg-[#1a1c21] text-[#5a5e68] hover:text-[#ff5964] flex items-center justify-center text-[10px]"
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
                      const isPlayhead = isPlaying && currentStep === stepIdx;
                      const isBarStart = stepIdx % stepsPerBar === 0 && stepIdx !== 0;
                      const isFirstStepOfBar = stepIdx % stepsPerBar === 0;
                      const isGroupStart = stepIdx % groupSize === 0 && stepIdx !== 0;

                      // Hat shapes: 1 = closed, 2 = open (round), 3 = triplet roll (striped)
                      const isHatRound = isHatTrack && stepVal === 2;
                      const isHatTriplet = isHatTrack && stepVal === 3;

                      return (
                        <div
                          key={stepIdx}
                          onClick={(e) => handleCellClick(trackIdx, stepIdx, e)}
                          onPointerDown={(e) => handlePointerDown(trackIdx, stepIdx, e)}
                          onPointerEnter={() => handlePointerEnter(trackIdx, stepIdx)}
                          className={`min-w-[28px] sm:min-w-[32px] flex-1 h-[34px] border cursor-pointer relative transition-all duration-75 select-none ${
                            isBarStart
                              ? "ml-3.5 sm:ml-4.5 border-l-2 border-l-[#f5b73d]/70"
                              : isGroupStart
                              ? "ml-2 sm:ml-2.5 border-l border-[#3a3e48]"
                              : ""
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
          <div className="mt-3.5 font-['JetBrains_Mono'] text-[10px] text-[#5a5e68] tracking-[0.04em] leading-relaxed border-t border-[#1a1c21] pt-3 flex items-center justify-between flex-wrap gap-2">
            <div>
              {language === "zh"
                ? "点击 / 拖动步进格编辑 · SHIFT+点击 = 重音 · HI-HAT 轨单击循环：闭镲 → 开镲 → 三连滚 · ◀/▶ 位移 · 智能填充"
                : "Click / drag cells to edit · SHIFT+click = accent · HI-HAT lane cycles: closed → open → triplet roll · ◀/▶ shift · Smart fill"}
            </div>
            <div className="text-[#8b8f99]">
              {isEditorMaximized ? (language === "zh" ? "按 Esc 退出最大化" : "Press Esc to exit fullscreen") : ""}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};
