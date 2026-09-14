import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Check } from "lucide-react";
import { Genre, SequencerPattern } from "../types/genre";
import { GENRE_INDEX, GENRE_INDEX_MAP, loadGenre } from "../data/index/loader";
import type { GenreRailItem } from "../components/sequencer/GenreRail";
import { AudioEngine, DrumKitType, EffectsRackState } from "../audio/AudioEngine";
import { DEFAULT_FX_STATE } from "../audio/EffectsRack";
import { downloadMidiFile } from "../audio/MidiExporter";
import { downloadAbletonProject } from "../audio/AbletonExporter";
import { decodeSharedSequencer, getShareUrlResult } from "../audio/SequencerUrlShare";
import { exportMasterWav, exportStemsZip, triggerWavDownload } from "../audio/WavExporter";
import { importMidiToPattern } from "../audio/MidiImporter";
import { generateVariation } from "../audio/InspireMe";
import { midiInputManager, MidiDevice } from "../audio/MidiInputManager";
import { useLanguage } from "../i18n/LanguageContext";
import { VelocityLane } from "../components/sequencer/VelocityLane";
import { EuclideanModal } from "../components/sequencer/EuclideanModal";
import { PitchPickerModal } from "../components/sequencer/PitchPickerModal";
import { Ruler } from "../components/sequencer/Ruler";
import { TrackRow } from "../components/sequencer/TrackRow";
import { Toolbar, MobileEditMode } from "../components/sequencer/Toolbar";
import { GenreRail } from "../components/sequencer/GenreRail";
import { InfoDossier } from "../components/sequencer/InfoDossier";
import { MasterAnalyzerSuite } from "../components/analyzer/MasterAnalyzerSuite";
import { ProjectHubModal } from "../components/sequencer/ProjectHubModal";
import { useSequencerStore, clonePattern } from "../features/sequencer/useSequencerStore";
import { clearSavedProject, saveProjectImmediate } from "../features/sequencer/projectStorage";
import {
  getActiveProjectId,
  getProject,
  exportProjectToGrooveFile,
  migrateLegacyLocalStorage,
} from "../features/sequencer/projectDb";
import { GrooveProject } from "../types/project";
import { useCustomGenres } from "../features/customGenre/useCustomGenres";
import { ParameterDimension } from "../components/sequencer/VelocityLane";
import { triggerHaptic, HapticPatterns } from "../utils/haptics";
import { ChordDefinition } from "../utils/chordTheory";
import { BakedArpeggioResult } from "../utils/arpeggiatorTheory";
import { parseScaleString, quantizePitchToScale } from "../utils/scaleTheory";
import { calculateGroupSize, calculateStepsPerBar } from "../utils/meter";
import { announcer } from "../ui";
import { isDrumTrack, getDefaultDrumKitForGenre } from "../utils/trackUtils";

// Color mappings matching demo design
export const DEMO_TRACKS_CONFIG = [
  { id: "kick", name: "KICK", sub: { zh: "底鼓", en: "Kick" }, color: "#ff5964" },
  { id: "snare", name: "SNARE", sub: { zh: "军鼓/拍手", en: "Snare/Clap" }, color: "#ffb65c" },
  { id: "hat", name: "HI-HAT", sub: { zh: "踩镲", en: "Hi-Hat" }, color: "#45e0c9" },
  { id: "perc", name: "PERC", sub: { zh: "打击乐", en: "Percussion" }, color: "#c8e06a" },
  { id: "bass", name: "808 BASS", sub: { zh: "贝斯", en: "Bass" }, color: "#ff8a5c" },
  { id: "chord", name: "CHORD", sub: { zh: "和弦", en: "Chords" }, color: "#f06ec4" },
  { id: "lead", name: "LEAD", sub: { zh: "主音", en: "Lead" }, color: "#7ee787" },
  { id: "fx", name: "FX", sub: { zh: "效果", en: "FX" }, color: "#9aa5ce" },
];

function getGenreAccent(genre: GenreRailItem): string {
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
  house: "HOUSE · 1985",
  trap: "HIP-HOP × EDM",
  "edm-trap": "HIP-HOP × EDM",
  "atlanta-trap": "TRAP · 140",
  "uk-drill": "UK STREET",
  drill: "UK STREET",
  "future-bass": "EDM · MELODIC",
  "liquid-dnb": "JUNGLE · 174",
  dnb: "JUNGLE · 174",
  reggaeton: "LATIN · URBAN",
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
};

const getGenreChipTag = (g: GenreRailItem): string => {
  if (g.isCustom) return "CUSTOM";
  if (DEMO_GENRE_TAGS[g.id]) return DEMO_GENRE_TAGS[g.id];
  let prefix = g.category.toUpperCase();
  if (prefix.length > 8) {
    prefix = prefix.split(" ")[0].substring(0, 7);
  }
  let suffix = "";
  if (g.origin_year) {
    suffix = `${g.origin_year}`;
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
  onOpenGenreMaker?: () => void;
  initialChords?: ChordDefinition[] | null;
  onClearInitialChords?: () => void;
  initialArpeggio?: { baked: BakedArpeggioResult; label?: string } | null;
  onClearInitialArpeggio?: () => void;
  initialMasterclassPattern?: { pattern: SequencerPattern; label?: string } | null;
  onClearInitialMasterclassPattern?: () => void;
}

export const StudioView: React.FC<StudioViewProps> = ({
  selectedGenre: initialGenre,
  onSelectGenre,
  onViewDetail,
  onAddToCompare,
  onAudioEngineReady,
  onOpenGenreMaker,
  initialChords,
  onClearInitialChords,
  initialArpeggio,
  onClearInitialArpeggio,
  initialMasterclassPattern,
  onClearInitialMasterclassPattern,
}) => {
  const { t, language, isZh } = useLanguage();

  // A-01: App only mounts StudioView once it has resolved a genre via `loadGenre`,
  // so there is no need to statically pull the whole genre database as a fallback.
  const startingGenre = initialGenre as Genre;

  const { customGenres } = useCustomGenres();

  // Central Sequencer Store (P2-04)
  const {
    state: seqState,
    dispatch,
    commit,
    undo,
    redo,
    canUndo,
    canRedo,
    invalidateRedo,
    commitCoalesced,
  } = useSequencerStore(startingGenre);

  const {
    currentGenre,
    pattern,
    bpm,
    swing,
    timeSignature,
    resolution,
    stepCount,
  } = seqState;

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [viewedBar, setViewedBar] = useState<number>(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Category filter for the chip rail
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>("ALL");

  // Sidebar collapse & Maximize states
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isEditorMaximized, setIsEditorMaximized] = useState<boolean>(false);

  // Sequencer matrix scroll container ref & playhead beam ref (P2-03)
  const matrixContainerRef = useRef<HTMLDivElement | null>(null);
  const playheadBeamRef = useRef<HTMLDivElement | null>(null);
  const lastActiveRulerStepRef = useRef<HTMLElement | null>(null);

  const [isRulerDragging, setIsRulerDragging] = useState(false);
  const rulerDragStartXRef = useRef(0);
  const rulerDragScrollLeftRef = useRef(0);

  // Pro Sequencer Extensions: Velocity Lane, Euclidean Generator, Pitch Picker & P-Locks
  const [isVelocityLaneOpen, setIsVelocityLaneOpen] = useState(false);
  const [velocityActiveTrackIdx, setVelocityActiveTrackIdx] = useState(0);
  const [isEuclideanOpen, setIsEuclideanOpen] = useState(false);
  const [isAnalyzerOpen, setIsAnalyzerOpen] = useState(false);
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

  // Mobile / Tablet touch detection & dedicated mobile tools
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [mobileEditMode, setMobileEditMode] = useState<MobileEditMode>("step");
  const [showAdvancedControls, setShowAdvancedControls] = useState(false);

  // Phase 4 States (P4-01 ~ P4-04 & P4-06)
  const [isExportingAudio, setIsExportingAudio] = useState(false);
  const [isKeyboardMode, setIsKeyboardMode] = useState(false);
  const [midiDevices, setMidiDevices] = useState<MidiDevice[]>([]);

  // Phase 5 States (P5-01 ~ P5-05)
  const [drumKit, setDrumKit] = useState<DrumKitType>(() => getDefaultDrumKitForGenre(currentGenre));
  const [isDrumsOnly, setIsDrumsOnly] = useState<boolean>(false);
  const lastGenreIdRef = useRef(currentGenre.id);
  const [isRecordArmed, setIsRecordArmed] = useState<boolean>(false);
  const [effectsRackState, setEffectsRackState] = useState<EffectsRackState>(DEFAULT_FX_STATE);

  // Multi-Project Hub State (P7-02)
  const [isProjectHubOpen, setIsProjectHubOpen] = useState(false);
  const [activeProject, setActiveProject] = useState<GrooveProject | null>(null);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        await migrateLegacyLocalStorage();
        const activeId = getActiveProjectId();
        if (activeId) {
          const proj = await getProject(activeId);
          if (proj && isMounted) {
            setActiveProject(proj);
          }
        }
      } catch (e) {
        console.warn("[StudioView] Failed to initialize active project:", e);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  // Pointer drag painting & event delegation refs (P2-02 & P2-05)
  const isPointerDownRef = useRef(false);
  const dragValRef = useRef<number | null>(null);
  const pendingPaintMapRef = useRef<Map<string, { trackIdx: number; stepIdx: number; val: number }>>(new Map());
  const longPressTimerRef = useRef<any>(null);
  const isLongPressRef = useRef(false);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const checkTouch = () => {
      const hasTouch =
        typeof window !== "undefined" &&
        ("ontouchstart" in window ||
          navigator.maxTouchPoints > 0 ||
          (window.matchMedia && window.matchMedia("(pointer: coarse)").matches));
      setIsTouchDevice(hasTouch);
    };
    checkTouch();
  }, []);

  // AudioEngine ref
  const engineRef = useRef<AudioEngine | null>(null);
  const patternRef = useRef(pattern);
  patternRef.current = pattern;
  const seqStateRef = useRef(seqState);
  seqStateRef.current = seqState;
  const lastStepRef = useRef(-1);

  const genreAccent = useMemo(() => getGenreAccent(currentGenre), [currentGenre]);

  // Toast notification
  const toastTimerRef = useRef<any>(null);
  const showToast = useCallback((msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(msg);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 2400);
  }, []);

  // Clean up all pending timers on unmount
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, []);

  // Decoupled Playhead & Peak Meter logic (P2-03)
  const updatePlayhead = useCallback((step: number) => {
    const container = matrixContainerRef.current;
    if (!container) return;

    const rulerCell = container.querySelector<HTMLElement>(`[data-ruler-step-idx="${step}"]`);
    if (rulerCell) {
      if (lastActiveRulerStepRef.current && lastActiveRulerStepRef.current !== rulerCell) {
        lastActiveRulerStepRef.current.classList.remove("playhead-active");
      }
      rulerCell.classList.add("playhead-active");
      lastActiveRulerStepRef.current = rulerCell;

      if (playheadBeamRef.current) {
        const cRect = container.getBoundingClientRect();
        const rRect = rulerCell.getBoundingClientRect();
        // Calculate true offset relative to matrixContainer scroll coordinate space
        const left = rRect.left - cRect.left - container.clientLeft + container.scrollLeft;
        const width = rRect.width;

        playheadBeamRef.current.style.transform = `translate3d(${left}px, 0, 0)`;
        playheadBeamRef.current.style.width = `${width}px`;
        playheadBeamRef.current.style.display = "block";
      }
    }
  }, []);

  const clearPlayhead = useCallback(() => {
    if (lastActiveRulerStepRef.current) {
      lastActiveRulerStepRef.current.classList.remove("playhead-active");
      lastActiveRulerStepRef.current = null;
    }
    if (playheadBeamRef.current) {
      playheadBeamRef.current.style.display = "none";
      playheadBeamRef.current.style.transition = "none";
    }
    lastStepRef.current = -1;
  }, []);

  const triggerTrackMeters = useCallback((trackIndices: number[]) => {
    const container = matrixContainerRef.current;
    if (!container) return;
    trackIndices.forEach((idx) => {
      const meter = container.querySelector<HTMLElement>(`[data-meter-track="${idx}"]`);
      if (meter) {
        meter.classList.add("is-flashing");
        setTimeout(() => {
          meter.classList.remove("is-flashing");
        }, 140);
      }
    });
  }, []);

  // Initialize AudioEngine (StrictMode safe, decoupled playhead & peak meter - P2-03 / P2-04)
  useEffect(() => {
    const engine = new AudioEngine({
      onStep: ({ step }) => {
        updatePlayhead(step);
        // P8-01: Haptic downbeat pulse during playback
        const sig = seqStateRef.current.timeSignature;
        const res = seqStateRef.current.resolution;
        const denom = parseInt(sig.split("/")[1]) || 4;
        const beatsPerBar = parseInt(sig.split("/")[0]) || 4;
        const stepsPerWhole = res === "1/32" ? 32 : res === "1/8" ? 8 : 16;
        const spb = Math.max(1, Math.round(stepsPerWhole / denom));
        const stepsPerBeat = Math.max(1, Math.round(spb / beatsPerBar));
        if (step % spb === 0) {
          triggerHaptic(HapticPatterns.heavyThud);
        } else if (stepsPerBeat > 1 && step % stepsPerBeat === 0) {
          triggerHaptic(HapticPatterns.metronomeClick);
        }
        // Song Mode auto-transition between pattern slots on loop wrap-around (P3-02)
        if (seqStateRef.current.songMode && lastStepRef.current > step && step === 0) {
          const nextSlot = seqStateRef.current.activeSlot === "A" ? "B" : "A";
          commit({ type: "SWITCH_PATTERN_SLOT", slot: nextSlot });
          engine.setPattern(seqStateRef.current.patterns[nextSlot]);
        }
        lastStepRef.current = step;
      },
      onTrackTrigger: (trackIndices) => {
        triggerTrackMeters(trackIndices);
      },
      onStop: () => {
        clearPlayhead();
        setIsPlaying(false);
      },
    });
    engineRef.current = engine;
    engine.setPattern(pattern);
    engine.setBpm(bpm);
    engine.setSwing(swing / 100);
    engine.setTimeSignature(timeSignature);
    engine.setResolution(resolution);
    engine.setLoopRange(seqState.loopRange);
    engine.setMetronome(seqState.isMetronome);
    engine.setCountIn(seqState.isCountIn);
    engine.setDrumKit(drumKit);
    engine.setDrumsOnly(isDrumsOnly);
    engine.setRecordArmed(isRecordArmed);

    // P5-05: Real-time Live Recording Callback
    engine.getLiveRecorder().setOnQuantizedStep((rec) => {
      // F-04: recording writes straight through `dispatch`, so any pending redo
      // snapshot now describes a pattern the user can no longer get back to.
      invalidateRedo();
      dispatch({
        type: "SET_STEP",
        trackIdx: rec.trackIdx,
        stepIdx: rec.stepIdx,
        value: rec.stepVal,
      });
      if (rec.velocity !== undefined) {
        dispatch({
          type: "SET_VELOCITY",
          trackIdx: rec.trackIdx,
          stepIdx: rec.stepIdx,
          velocity: Math.round(rec.velocity * 127),
        });
      }
      if (rec.pitch > 0) {
        dispatch({
          type: "SET_PITCH",
          trackIdx: rec.trackIdx,
          stepIdx: rec.stepIdx,
          pitch: rec.pitch,
        });
      }
      triggerHaptic(HapticPatterns.accent);
    });

    const cleanup = onAudioEngineReady ? onAudioEngineReady(engine) : undefined;

    return () => {
      cleanup?.();
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  // Sync Loop Range, Metronome & Count-In to AudioEngine (P3-07)
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setLoopRange(seqState.loopRange);
    }
  }, [seqState.loopRange]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setMetronome(seqState.isMetronome);
    }
  }, [seqState.isMetronome]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setCountIn(seqState.isCountIn);
    }
  }, [seqState.isCountIn]);

  // Sync Drum Kit Model to AudioEngine (P5-02)
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setDrumKit(drumKit);
    }
  }, [drumKit]);

  // Sync Drums-Only Mode to AudioEngine
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setDrumsOnly(isDrumsOnly);
    }
  }, [isDrumsOnly]);

  // Sync Default Drum Kit on Genre Change
  useEffect(() => {
    if (lastGenreIdRef.current !== currentGenre.id) {
      lastGenreIdRef.current = currentGenre.id;
      const defaultKit = getDefaultDrumKitForGenre(currentGenre);
      setDrumKit(defaultKit);
      if (engineRef.current) {
        engineRef.current.setDrumKit(defaultKit);
        engineRef.current.setDrumsOnly(isDrumsOnly);
      }
    }
  }, [currentGenre.id, isDrumsOnly]);

  // Sync Live Recording Arm state to AudioEngine (P5-05)
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setRecordArmed(isRecordArmed);
    }
  }, [isRecordArmed]);

  // Sync Active Scale Filter to Midi & Keyboard Input (P6-02)
  useEffect(() => {
    if (!pattern.scale) {
      midiInputManager.setScaleFilter(null);
      return;
    }
    const { root, scaleId } = parseScaleString(pattern.scale);
    if (scaleId === "chromatic") {
      midiInputManager.setScaleFilter(null);
    } else {
      midiInputManager.setScaleFilter((note) => quantizePitchToScale(note, root, scaleId));
    }
    return () => {
      midiInputManager.setScaleFilter(null);
    };
  }, [pattern.scale]);

  // Sync Master DSP Effects Rack to AudioEngine (P5-04)
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setMasterFilter(
        effectsRackState.filterEnabled,
        effectsRackState.filterCutoff,
        effectsRackState.filterQ,
        effectsRackState.filterType
      );
      engineRef.current.setMasterSaturation(
        effectsRackState.saturationEnabled,
        effectsRackState.saturationDrive
      );
      engineRef.current.setMasterChorus(
        effectsRackState.chorusEnabled,
        effectsRackState.chorusMix,
        effectsRackState.chorusRate
      );
      engineRef.current.setMasterBitcrusher(
        effectsRackState.bitcrusherEnabled,
        effectsRackState.bitDepth
      );
    }
  }, [effectsRackState]);

  // Tap tempo calculator (P3-07)
  const tapTimestampsRef = useRef<number[]>([]);
  const handleTapTempo = useCallback(() => {
    const now = performance.now();
    tapTimestampsRef.current = tapTimestampsRef.current.filter((t) => now - t < 2500);
    tapTimestampsRef.current.push(now);
    if (tapTimestampsRef.current.length >= 2) {
      const calculatedBpm = AudioEngine.calculateTapTempo(tapTimestampsRef.current);
      if (calculatedBpm >= 40 && calculatedBpm <= 240) {
        commit({ type: "SET_BPM", bpm: calculatedBpm });
        if (engineRef.current) {
          engineRef.current.setBpm(calculatedBpm);
        }
        showToast(`${isZh ? "测速 BPM" : "Tap BPM"}: ${calculatedBpm}`);
      }
    }
  }, [commit, isZh, showToast]);

  // Handle chords transferred from ChordProgressionsView
  useEffect(() => {
    if (!initialChords || initialChords.length === 0) return;
    commit({ type: "LOAD_CHORDS", chords: initialChords });
    if (engineRef.current) {
      engineRef.current.setPattern(patternRef.current);
    }
    showToast(
      isZh
        ? `已成功载入 ${initialChords.length} 个和弦到和弦轨道 ✓`
        : `Loaded ${initialChords.length} chords into track ✓`
    );
    if (onClearInitialChords) {
      onClearInitialChords();
    }
  }, [initialChords, isZh, onClearInitialChords, showToast, commit]);

  // Handle arpeggios transferred from ChordProgressionsView (P6-03)
  useEffect(() => {
    if (!initialArpeggio || !initialArpeggio.baked) return;
    commit({ type: "LOAD_ARPEGGIATED_SEQUENCE", baked: initialArpeggio.baked });
    if (engineRef.current) {
      engineRef.current.setPattern(patternRef.current);
    }
    const trackName =
      initialArpeggio.baked.targetTrackId === "lead"
        ? isZh
          ? "Lead 领奏"
          : "Lead"
        : isZh
        ? "Chords 和弦"
        : "Chords";
    showToast(
      isZh
        ? `已将 ${initialArpeggio.label || "琶音旋律"} 烘焙至 ${trackName} 轨 ✓`
        : `Baked ${initialArpeggio.label || "arpeggio"} to ${trackName} track ✓`
    );
    if (onClearInitialArpeggio) {
      onClearInitialArpeggio();
    }
  }, [initialArpeggio, isZh, onClearInitialArpeggio, showToast, commit]);

  // Handle rhythm masterclass pattern transferred from MasterclassView (P6-01)
  useEffect(() => {
    if (!initialMasterclassPattern || !initialMasterclassPattern.pattern) return;
    commit({
      type: "LOAD_MASTERCLASS_PATTERN",
      pattern: initialMasterclassPattern.pattern,
      bpm: initialMasterclassPattern.pattern.bpm,
      timeSignature: initialMasterclassPattern.pattern.timeSignature,
    });
    if (engineRef.current) {
      engineRef.current.setPattern(initialMasterclassPattern.pattern);
      if (initialMasterclassPattern.pattern.bpm) {
        engineRef.current.setBpm(initialMasterclassPattern.pattern.bpm);
      }
    }
    showToast(
      isZh
        ? `已成功载入「${initialMasterclassPattern.label || "律动工作坊节奏"}」至 Studio！✓`
        : `Baked "${initialMasterclassPattern.label || "Masterclass Pattern"}" into Studio! ✓`
    );
    if (onClearInitialMasterclassPattern) {
      onClearInitialMasterclassPattern();
    }
  }, [initialMasterclassPattern, isZh, onClearInitialMasterclassPattern, showToast, commit]);

  // Sync external genre
  useEffect(() => {
    if (initialGenre && initialGenre.id !== currentGenre.id) {
      commit({ type: "SET_GENRE", genre: initialGenre });
    }
  }, [initialGenre, currentGenre.id, commit]);

  // Handle URL share params
  useEffect(() => {
    if (typeof window === "undefined") return;
    const urlParams = new URLSearchParams(window.location.search);
    const sharedCode = urlParams.get("groove");
    const genreParam = urlParams.get("genre");

    if (sharedCode) {
      const decoded = decodeSharedSequencer(sharedCode);
      if (decoded) {
        // A-01: resolve the shared genre on demand instead of from a static map.
        let cancelled = false;
        void loadGenre(decoded.genreId).then((loaded) => {
          if (cancelled) return;
          const found = loaded || currentGenre;
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
            // F-09: the decoder has always returned these; the view used to drop
            // them, so a shared pattern silently lost its gate/ratchet/probability,
            // per-track length, pan, swing and sends.
            gate: t.gate,
            ratchet: t.ratchet,
            probability: t.probability,
            trackLength: t.trackLength,
            mute: t.mute,
            solo: t.solo,
            volume: t.volume,
            pan: t.pan,
            swing: t.swing,
            sendA: t.sendA,
            sendB: t.sendB,
          })),
        };
        commit({ type: "SET_GENRE", genre: found });
        commit({ type: "COMMIT_PATTERN", pattern: newPattern });
        commit({ type: "SET_BPM", bpm: decoded.bpm });
        commit({ type: "SET_SWING", swing: decoded.swing });
        if (decoded.timeSignature) commit({ type: "SET_TIME_SIGNATURE", timeSignature: decoded.timeSignature });
        if (decoded.resolution) commit({ type: "SET_RESOLUTION", resolution: decoded.resolution as any });

        if (engineRef.current) {
          engineRef.current.setPattern(newPattern, true);
          engineRef.current.setBpm(decoded.bpm);
          engineRef.current.setSwing(decoded.swing / 100);
          if (decoded.timeSignature) engineRef.current.setTimeSignature(decoded.timeSignature);
          if (decoded.resolution) engineRef.current.setResolution(decoded.resolution as any);
        }
        showToast("Shared Pattern Loaded");
        });
        return () => {
          cancelled = true;
        };
      }
      return;
    }

    if (genreParam) {
      let cancelled = false;
      void loadGenre(genreParam).then((loaded) => {
        if (!cancelled && loaded) commit({ type: "SET_GENRE", genre: loaded });
      });
      return () => {
        cancelled = true;
      };
    }
  }, []);

  // Sync engine when sequencer state changes
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

  // Mouse wheel listener: horizontal scrolling on Shift+Wheel
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

  // Ruler horizontal drag-to-scroll handler
  const handleRulerPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    setIsRulerDragging(true);
    rulerDragStartXRef.current = e.clientX;
    if (matrixContainerRef.current) {
      rulerDragScrollLeftRef.current = matrixContainerRef.current.scrollLeft;
    }
    triggerHaptic(HapticPatterns.slider);
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Ignored
    }
  }, []);

  const handleRulerPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isRulerDragging || !matrixContainerRef.current) return;
      const dx = e.clientX - rulerDragStartXRef.current;
      matrixContainerRef.current.scrollLeft = rulerDragScrollLeftRef.current - dx;
    },
    [isRulerDragging]
  );

  const handleRulerPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isRulerDragging) return;
      setIsRulerDragging(false);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // Ignored
      }
    },
    [isRulerDragging]
  );

  const handleSelectLoopRange = useCallback(
    (rng: [number, number] | null) => commit({ type: "SET_LOOP_RANGE", range: rng }),
    [commit]
  );

  // Switch genre
  const switchGenre = useCallback(
    (genre: Genre, andPlay = false) => {
      lastGenreIdRef.current = genre.id;
      const defaultKit = getDefaultDrumKitForGenre(genre);
      setDrumKit(defaultKit);

      onSelectGenre(genre);
      commit({ type: "SET_GENRE", genre });

      if (engineRef.current) {
        engineRef.current.setPattern(genre.sequencer_pattern, true);
        engineRef.current.setDrumKit(defaultKit);
        engineRef.current.setDrumsOnly(isDrumsOnly);
        engineRef.current.setBpm(genre.default_bpm || 120);
        engineRef.current.setSwing((genre.sequencer_pattern.swing || 0) / 100);
        engineRef.current.setTimeSignature(genre.time_signature || "4/4");
        engineRef.current.setResolution("1/16");
        if (andPlay) {
          if (!isPlaying) {
            engineRef.current.play();
            setIsPlaying(true);
          }
        } else if (!isPlaying) {
          engineRef.current.stop();
          clearPlayhead();
        }
      }
    },
    [commit, onSelectGenre, isPlaying, clearPlayhead, isDrumsOnly]
  );

  // Toggle Drums-Only mode
  const handleToggleDrumsOnly = useCallback(() => {
    setIsDrumsOnly((prev) => {
      const next = !prev;
      if (engineRef.current) {
        engineRef.current.setDrumsOnly(next);
      }
      showToast(
        next
          ? (isZh ? "已开启【只听鼓组】模式 (快捷键 D) ✓" : "Drums Only Mode Enabled (Key: D) ✓")
          : (isZh ? "已恢复全频段播放 (Full Band) ✓" : "Full Band Mode Restored ✓")
      );
      announcer.announce(
        next
          ? (isZh ? "已开启只听鼓组" : "Drums only mode enabled")
          : (isZh ? "已关闭只听鼓组" : "Drums only mode disabled")
      );
      return next;
    });
  }, [isZh, showToast]);

  // Transport toggle play
  const handleTogglePlay = useCallback(() => {
    if (!engineRef.current) return;
    triggerHaptic(HapticPatterns.playPause);
    if (isPlaying) {
      engineRef.current.stop();
      setIsPlaying(false);
      clearPlayhead();
      announcer.announce(isZh ? "已停止播放" : "Playback stopped");
    } else {
      engineRef.current.play();
      setIsPlaying(true);
      announcer.announce(isZh ? "开始播放" : "Playback started");
    }
  }, [isPlaying, clearPlayhead, isZh]);

  const handleUndo = useCallback(() => {
    const prev = undo();
    if (prev && engineRef.current) {
      engineRef.current.setPattern(prev.pattern);
      engineRef.current.setBpm(prev.bpm);
      engineRef.current.setSwing(prev.swing / 100);
      engineRef.current.setTimeSignature(prev.timeSignature);
      engineRef.current.setResolution(prev.resolution);
      triggerHaptic(HapticPatterns.undoRedo);
      showToast(isZh ? "已撤销 (Undo) ✓" : "Undone ✓");
    }
  }, [undo, isZh, showToast]);

  const handleRedo = useCallback(() => {
    const next = redo();
    if (next && engineRef.current) {
      engineRef.current.setPattern(next.pattern);
      engineRef.current.setBpm(next.bpm);
      engineRef.current.setSwing(next.swing / 100);
      engineRef.current.setTimeSignature(next.timeSignature);
      engineRef.current.setResolution(next.resolution);
      triggerHaptic(HapticPatterns.undoRedo);
      showToast(isZh ? "已重做 (Redo) ✓" : "Redone ✓");
    }
  }, [redo, isZh, showToast]);

  // Keyboard shortcuts (Space, Esc, V, E, Undo/Redo)
  useEffect(() => {
    // A focused control swallows transport keys only when it is a text-entry
    // control: text/number/search inputs, textarea, select or contentEditable.
    // A focused range slider must NOT permanently kill transport shortcuts (U-09).
    const isTextEntryTarget = (el: HTMLElement | null): boolean => {
      if (!el) return false;
      if (el.isContentEditable) return true;
      const editableHost = el.closest<HTMLElement>("[contenteditable]");
      if (editableHost && editableHost.isContentEditable) return true;
      const control = el.closest<HTMLElement>("input, textarea, select");
      if (!control) return false;
      if (control.tagName === "TEXTAREA" || control.tagName === "SELECT") return true;
      const type = (control as HTMLInputElement).type?.toLowerCase() || "text";
      return type !== "range";
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Respect handlers that already consumed the event (U-09)
      if (e.defaultPrevented) {
        return;
      }

      // Transport/grid shortcuts must not fire behind an open modal dialog (U-09)
      if (
        typeof document !== "undefined" &&
        document.querySelector('[role="dialog"][aria-modal="true"]') !== null
      ) {
        return;
      }

      const target = e.target as HTMLElement | null;
      if (isTextEntryTarget(target)) {
        return;
      }

      if (e.code === "Space") {
        if (target && (target.tagName === "BUTTON" || Boolean(target.closest("button")))) {
          return;
        }
        e.preventDefault();
        handleTogglePlay();
      } else if (e.key === "Escape") {
        if (isProjectHubOpen) {
          setIsProjectHubOpen(false);
        } else if (stepContextMenu) {
          setStepContextMenu(null);
        } else if (pitchPicker.isOpen) {
          setPitchPicker((prev) => ({ ...prev, isOpen: false }));
        } else if (isEuclideanOpen) {
          setIsEuclideanOpen(false);
        } else if (isVelocityLaneOpen) {
          setIsVelocityLaneOpen(false);
        } else if (isAnalyzerOpen) {
          setIsAnalyzerOpen(false);
        } else if (isEditorMaximized) {
          e.preventDefault();
          setIsEditorMaximized(false);
        }
      } else if ((e.key === "p" || e.key === "P") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setIsProjectHubOpen((prev) => !prev);
      } else if ((e.key === "d" || e.key === "D") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        handleToggleDrumsOnly();
      } else if ((e.key === "v" || e.key === "V") && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setIsVelocityLaneOpen((prev) => !prev);
      } else if ((e.key === "e" || e.key === "E") && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setIsEuclideanOpen(true);
      } else if ((e.key === "o" || e.key === "O") && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setIsAnalyzerOpen((prev) => !prev);
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
      if (stepContextMenu) {
        setStepContextMenu(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("click", handleGlobalClick);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("click", handleGlobalClick);
    };
  }, [
    isProjectHubOpen,
    stepContextMenu,
    pitchPicker.isOpen,
    isEuclideanOpen,
    isVelocityLaneOpen,
    isAnalyzerOpen,
    isEditorMaximized,
    handleTogglePlay,
    handleToggleDrumsOnly,
    handleUndo,
    handleRedo,
  ]);

  // Event Delegation & Drag-to-paint batching (P2-02 & P2-05)
  const handleGridPointerDown = (e: React.PointerEvent) => {
    const target = (e.target as HTMLElement).closest("[data-track-idx][data-step-idx]");
    if (!target) return;

    const trackIdx = parseInt(target.getAttribute("data-track-idx") || "-1", 10);
    const stepIdx = parseInt(target.getAttribute("data-step-idx") || "-1", 10);
    if (trackIdx < 0 || stepIdx < 0) return;

    const tr = pattern.tracks[trackIdx];
    if (!tr) return;

    if (e.pointerType === "touch") {
      isLongPressRef.current = false;
      touchStartPosRef.current = { x: e.clientX, y: e.clientY };
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);

      longPressTimerRef.current = setTimeout(() => {
        isLongPressRef.current = true;
        triggerHaptic(HapticPatterns.doubleTap);
        setStepContextMenu({
          isOpen: true,
          x: e.clientX,
          y: e.clientY,
          trackIdx,
          stepIdx,
        });
      }, 450);
      return;
    }

    // Desktop Mouse Drag-Paint
    isPointerDownRef.current = true;
    pendingPaintMapRef.current.clear();
    const curVal = tr.steps[stepIdx] || 0;
    const isHat = tr.track_id === "hihat" || tr.name.toLowerCase().includes("hat");
    const nextVal = isHat ? (curVal === 0 ? 1 : curVal === 1 ? 2 : curVal === 2 ? 3 : 0) : curVal > 0 ? 0 : 1;

    dragValRef.current = nextVal;
    pendingPaintMapRef.current.set(`${trackIdx}:${stepIdx}`, { trackIdx, stepIdx, val: nextVal });

    // Audition sound
    if (nextVal > 0 && engineRef.current) {
      const pitch = tr.pitch && tr.pitch[stepIdx] ? tr.pitch[stepIdx] : 0;
      const vel = (tr.velocity && tr.velocity[stepIdx] ? tr.velocity[stepIdx] : 100) / 127;
      engineRef.current.triggerNote(trackIdx, tr.name, vel, pitch, nextVal);
    }
  };

  const handleGridPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === "touch" && touchStartPosRef.current) {
      const dist = Math.hypot(e.clientX - touchStartPosRef.current.x, e.clientY - touchStartPosRef.current.y);
      if (dist > 8 && longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      return;
    }

    if (!isPointerDownRef.current || dragValRef.current === null) return;

    const el = document.elementFromPoint(e.clientX, e.clientY);
    const target = el?.closest("[data-track-idx][data-step-idx]");
    if (!target) return;

    const trackIdx = parseInt(target.getAttribute("data-track-idx") || "-1", 10);
    const stepIdx = parseInt(target.getAttribute("data-step-idx") || "-1", 10);
    if (trackIdx < 0 || stepIdx < 0) return;

    const key = `${trackIdx}:${stepIdx}`;
    if (!pendingPaintMapRef.current.has(key)) {
      const val = dragValRef.current;
      pendingPaintMapRef.current.set(key, { trackIdx, stepIdx, val });
      const tr = pattern.tracks[trackIdx];
      if (tr && val > 0 && engineRef.current) {
        const pitch = tr.pitch && tr.pitch[stepIdx] ? tr.pitch[stepIdx] : 0;
        const vel = (tr.velocity && tr.velocity[stepIdx] ? tr.velocity[stepIdx] : 100) / 127;
        engineRef.current.triggerNote(trackIdx, tr.name, vel, pitch, val);
      }
    }
  };

  const handleGridPointerUp = (e: React.PointerEvent) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (e.pointerType === "touch") {
      if (!isLongPressRef.current) {
        const target = (e.target as HTMLElement).closest("[data-track-idx][data-step-idx]");
        if (target) {
          const trackIdx = parseInt(target.getAttribute("data-track-idx") || "-1", 10);
          const stepIdx = parseInt(target.getAttribute("data-step-idx") || "-1", 10);
          if (trackIdx >= 0 && stepIdx >= 0) {
            handleMobileStepAction(trackIdx, stepIdx);
          }
        }
      }
      isLongPressRef.current = false;
      return;
    }

    // Flush batch paint changes once (P2-05)
    if (isPointerDownRef.current && pendingPaintMapRef.current.size > 0) {
      const nextPattern = clonePattern(patternRef.current);
      pendingPaintMapRef.current.forEach(({ trackIdx, stepIdx, val }) => {
        const t = nextPattern.tracks[trackIdx];
        if (t) {
          t.steps[stepIdx] = val;
          if (val > 0 && (!t.velocity || !t.velocity[stepIdx])) {
            if (!t.velocity) t.velocity = Array(t.steps.length).fill(100);
            t.velocity[stepIdx] = 100;
          }
        }
      });
      commit({ type: "COMMIT_PATTERN", pattern: nextPattern });
      if (engineRef.current) {
        engineRef.current.setPattern(nextPattern);
      }
    }

    isPointerDownRef.current = false;
    dragValRef.current = null;
    pendingPaintMapRef.current.clear();
  };

  const handleGridContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const target = (e.target as HTMLElement).closest("[data-track-idx][data-step-idx]");
    if (!target) return;
    const trackIdx = parseInt(target.getAttribute("data-track-idx") || "-1", 10);
    const stepIdx = parseInt(target.getAttribute("data-step-idx") || "-1", 10);
    if (trackIdx >= 0 && stepIdx >= 0) {
      setStepContextMenu({
        isOpen: true,
        x: e.clientX,
        y: e.clientY,
        trackIdx,
        stepIdx,
      });
    }
  };

  const handleMobileStepAction = (trackIdx: number, stepIdx: number) => {
    const tr = pattern.tracks[trackIdx];
    if (!tr) return;
    const isHat = tr.track_id === "hihat" || tr.name.toLowerCase().includes("hat");
    const curVal = tr.steps[stepIdx] || 0;

    if (mobileEditMode === "step") {
      const nextVal = isHat ? (curVal === 0 ? 1 : curVal === 1 ? 2 : curVal === 2 ? 3 : 0) : curVal > 0 ? 0 : 1;
      commit({ type: "SET_STEP", trackIdx, stepIdx, value: nextVal });
      if (nextVal > 0 && engineRef.current) {
        const pitch = tr.pitch && tr.pitch[stepIdx] ? tr.pitch[stepIdx] : 0;
        const vel = (tr.velocity && tr.velocity[stepIdx] ? tr.velocity[stepIdx] : 100) / 127;
        engineRef.current.triggerNote(trackIdx, tr.name, vel, pitch, nextVal);
      }
    } else if (mobileEditMode === "accent") {
      commit({ type: "SET_STEP", trackIdx, stepIdx, value: 1 });
      commit({ type: "SET_VELOCITY", trackIdx, stepIdx, velocity: 127 });
      triggerHaptic(HapticPatterns.accent);
    } else if (mobileEditMode === "ratchet") {
      const curRatchet = tr.ratchet?.[stepIdx] || 1;
      const nextRatchet = curRatchet >= 4 ? 1 : curRatchet + 1;
      commit({ type: "SET_STEP", trackIdx, stepIdx, value: 1 });
      commit({ type: "SET_RATCHET", trackIdx, stepIdx, ratchet: nextRatchet });
    } else if (mobileEditMode === "pitch") {
      setPitchPicker({
        isOpen: true,
        trackIdx,
        stepIdx,
        initialNote: tr.pitch?.[stepIdx] ?? 60,
      });
    } else if (mobileEditMode === "plocks") {
      setStepContextMenu({
        isOpen: true,
        x: window.innerWidth / 2 - 120,
        y: window.innerHeight / 2 - 140,
        trackIdx,
        stepIdx,
      });
    }
  };

  // Math for Bars & Steps (pure helpers live in ../utils/meter)
  const groupSize = useMemo(() => calculateGroupSize(resolution), [resolution]);

  const stepsPerBar = useMemo(
    () => calculateStepsPerBar(timeSignature, resolution),
    [timeSignature, resolution]
  );

  const barCount = Math.max(1, Math.ceil(stepCount / stepsPerBar));

  // Quick actions
  const handleQuickAction = useCallback(
    (action: "dup_bar1" | "humanize" | "clear_all" | "reset_preset" | "clear_saved" | "open_hub") => {
      if (action === "open_hub") {
        setIsProjectHubOpen(true);
        return;
      }
      if (action === "dup_bar1") {
        const next = clonePattern(patternRef.current);
        next.tracks.forEach((t) => {
          const bar1Steps = t.steps.slice(0, stepsPerBar);
          const bar1Vel = t.velocity?.slice(0, stepsPerBar) || Array(stepsPerBar).fill(100);
          for (let i = stepsPerBar; i < t.steps.length; i++) {
            t.steps[i] = bar1Steps[i % stepsPerBar];
            if (t.velocity) t.velocity[i] = bar1Vel[i % stepsPerBar];
          }
        });
        commit({ type: "COMMIT_PATTERN", pattern: next });
        showToast(isZh ? "已复制小节 1 至后续小节 ✓" : "Duplicated Bar 1 to all bars ✓");
      } else if (action === "humanize") {
        const next = clonePattern(patternRef.current);
        next.tracks.forEach((t) => {
          if (!t.velocity) t.velocity = Array(t.steps.length).fill(100);
          t.velocity = t.velocity.map((v, i) => {
            if (t.steps[i] === 0) return v;
            const delta = Math.floor((Math.random() - 0.5) * 24);
            return Math.max(40, Math.min(127, v + delta));
          });
        });
        commit({ type: "COMMIT_PATTERN", pattern: next });
        showToast(isZh ? "已应用人性化力度微调 ✨" : "Humanized velocity ✓");
      } else if (action === "clear_all") {
        const next = clonePattern(patternRef.current);
        next.tracks.forEach((t) => {
          t.steps = Array(t.steps.length).fill(0);
        });
        commit({ type: "COMMIT_PATTERN", pattern: next });
        showToast(isZh ? "已清空全部轨道步进 ✕" : "Cleared all steps ✕");
      } else if (action === "reset_preset") {
        commit({ type: "SET_GENRE", genre: currentGenre });
        showToast(isZh ? "已恢复默认预设 🔄" : "Preset reset 🔄");
      } else if (action === "clear_saved") {
        clearSavedProject();
        commit({ type: "SET_GENRE", genre: currentGenre });
        showToast(isZh ? "已清除本地工程缓存并重置预设 🧹" : "Cleared local project cache & reset 🧹");
      }
    },
    [stepsPerBar, commit, showToast, isZh, currentGenre]
  );

  const handleAudition = useCallback(
    (trackIdx: number, trackName: string) => {
      engineRef.current?.triggerNote(trackIdx, trackName, 0.9, 0, 1);
    },
    []
  );

  const handleCycleTrackLength = useCallback(
    (trackIdx: number) => {
      const tracks = patternRef.current.tracks;
      const cur = tracks[trackIdx]?.trackLength || stepCount;
      const opts = [12, 14, 16, 24, 32].filter((n) => n <= stepCount);
      let nextLen = opts[(opts.indexOf(cur) + 1) % opts.length] || stepCount;
      commit({ type: "SET_TRACK_LENGTH", trackIdx, length: nextLen });
    },
    [stepCount, commit]
  );

  // A-03: TrackRow is memoized, so every handler it receives must keep a stable
  // identity across unrelated StudioView re-renders. Each handler takes the track
  // index from its caller (instead of being an inline arrow in the JSX) and reads
  // live pattern data through `patternRef`, so toggling one step no longer changes
  // the callback identity of every other row.
  const handleToggleTrackMute = useCallback(
    (idx: number) => {
      const nextMute = !patternRef.current.tracks[idx]?.mute;
      commit({ type: "TOGGLE_MUTE", trackIdx: idx });
      if (engineRef.current) {
        engineRef.current.setTrackState(idx, { mute: nextMute });
      }
    },
    [commit]
  );

  const handleToggleTrackSolo = useCallback(
    (idx: number) => {
      const nextSolo = !patternRef.current.tracks[idx]?.solo;
      commit({ type: "TOGGLE_SOLO", trackIdx: idx });
      if (engineRef.current) {
        engineRef.current.setTrackState(idx, { solo: nextSolo });
      }
    },
    [commit]
  );

  const handleChangeTrackVolume = useCallback(
    (idx: number, vol: number) => {
      commit({ type: "SET_VOLUME", trackIdx: idx, volume: vol });
      if (engineRef.current) {
        engineRef.current.setTrackState(idx, { volume: vol });
      }
    },
    [commit]
  );

  const handleChangeTrackPan = useCallback(
    (idx: number, pan: number) => {
      commit({ type: "SET_TRACK_PAN", trackIdx: idx, pan });
      if (engineRef.current) engineRef.current.setTrackState(idx, { pan });
    },
    [commit]
  );

  const handleChangeTrackSwing = useCallback(
    (idx: number, trackSwing: number) => {
      commit({ type: "SET_TRACK_SWING", trackIdx: idx, swing: trackSwing });
    },
    [commit]
  );

  const handleOpenVelocityLane = useCallback((idx: number) => {
    setVelocityActiveTrackIdx(idx);
    setIsVelocityLaneOpen(true);
  }, []);

  const handleShiftTrack = useCallback(
    (idx: number, dir: -1 | 1) => commit({ type: "SHIFT_TRACK", trackIdx: idx, direction: dir }),
    [commit]
  );

  const handleSmartFillTrack = useCallback(
    (idx: number) => commit({ type: "SMART_FILL_TRACK", trackIdx: idx }),
    [commit]
  );

  const handleClearTrack = useCallback(
    (idx: number) => commit({ type: "CLEAR_TRACK", trackIdx: idx }),
    [commit]
  );

  const handleMoveTrackUp = useCallback(
    (idx: number) => commit({ type: "REORDER_TRACKS", fromIndex: idx, toIndex: Math.max(0, idx - 1) }),
    [commit]
  );

  const handleMoveTrackDown = useCallback(
    (idx: number) =>
      commit({
        type: "REORDER_TRACKS",
        fromIndex: idx,
        toIndex: Math.min(patternRef.current.tracks.length - 1, idx + 1),
      }),
    [commit]
  );

  const handleExportMidi = useCallback(() => {
    downloadMidiFile({ pattern: patternRef.current, bpm, genreName: currentGenre.name }, currentGenre.name);
    showToast(isZh ? `已导出 MIDI: ${currentGenre.name}.mid ✓` : `Exported ${currentGenre.name}.mid ✓`);
  }, [bpm, currentGenre.name, isZh, showToast]);

  const handleExportAls = useCallback(async () => {
    try {
      showToast(isZh ? "正在生成 Ableton Live (.als) 工程包..." : "Generating Ableton Live (.als) set...");
      const result = await downloadAbletonProject(
        {
          bpm,
          pattern: patternRef.current,
          genreName: currentGenre.name,
          scaleName: patternRef.current.scale,
        },
        `${currentGenre.name.replace(/[^a-zA-Z0-9_-]/g, "_")}_Groove`
      );
      showToast(
        isZh
          ? `已导出 Ableton Live 工程: ${result.filename} ✓ (可直接在 Live 10/11/12 中打开)`
          : `Exported Ableton Live Set: ${result.filename} ✓ (Compatible with Live 10/11/12)`
      );
    } catch (err: any) {
      showToast(isZh ? `Ableton 工程导出失败: ${err?.message || err}` : `Ableton export failed: ${err?.message || err}`);
    }
  }, [bpm, currentGenre.name, isZh, showToast]);

  const handleExportGroove = useCallback(() => {
    const projToExport: GrooveProject = activeProject
      ? {
          ...activeProject,
          genreId: currentGenre.id,
          genreName: currentGenre.name,
          bpm,
          swing,
          timeSignature,
          resolution,
          stepCount,
          patterns: {
            A: seqStateRef.current.activeSlot === "A" ? patternRef.current : seqStateRef.current.patterns.A,
            B: seqStateRef.current.activeSlot === "B" ? patternRef.current : seqStateRef.current.patterns.B,
          },
          activeSlot: seqStateRef.current.activeSlot,
          songMode: seqStateRef.current.songMode,
          songChain: seqStateRef.current.songChain,
          loopRange: seqStateRef.current.loopRange,
          effectsRack: effectsRackState,
          drumKit,
          isMetronome: seqStateRef.current.isMetronome,
          isCountIn: seqStateRef.current.isCountIn,
          updatedAt: Date.now(),
        }
      : {
          id: `proj_${Date.now()}`,
          name: `${currentGenre.name} Session`,
          genreId: currentGenre.id,
          genreName: currentGenre.name,
          bpm,
          swing,
          timeSignature,
          resolution,
          stepCount,
          patterns: {
            A: seqStateRef.current.activeSlot === "A" ? patternRef.current : seqStateRef.current.patterns.A,
            B: seqStateRef.current.activeSlot === "B" ? patternRef.current : seqStateRef.current.patterns.B,
          },
          activeSlot: seqStateRef.current.activeSlot,
          songMode: seqStateRef.current.songMode,
          songChain: seqStateRef.current.songChain,
          loopRange: seqStateRef.current.loopRange,
          effectsRack: effectsRackState,
          drumKit,
          isMetronome: seqStateRef.current.isMetronome,
          isCountIn: seqStateRef.current.isCountIn,
          tags: [currentGenre.name, "Exported"],
          isFavorite: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

    exportProjectToGrooveFile(projToExport);
    showToast(isZh ? `已导出 .groove 工程包: ${projToExport.name} ✓` : `Exported .groove: ${projToExport.name} ✓`);
  }, [
    activeProject,
    currentGenre,
    bpm,
    swing,
    timeSignature,
    resolution,
    stepCount,
    effectsRackState,
    drumKit,
    showToast,
    isZh,
  ]);

  const handleLoadProject = useCallback(
    async (project: GrooveProject) => {
      setActiveProject(project);
      // A-01: the project stores a genre id, so resolve it on demand.
      const genre = (await loadGenre(project.genreId)) || currentGenre;
      commit({
        type: "LOAD_PROJECT",
        genre,
        patterns: project.patterns,
        activeSlot: project.activeSlot,
        bpm: project.bpm,
        swing: project.swing,
        timeSignature: project.timeSignature,
        resolution: project.resolution,
        stepCount: project.stepCount,
        songMode: project.songMode,
        songChain: project.songChain,
        loopRange: project.loopRange,
        isMetronome: project.isMetronome,
        isCountIn: project.isCountIn,
      });

      if (project.drumKit) {
        setDrumKit(project.drumKit);
      }
      if (project.effectsRack) {
        setEffectsRackState(project.effectsRack);
      }

      if (engineRef.current) {
        const activePat = project.activeSlot === "B" ? project.patterns.B : project.patterns.A;
        engineRef.current.setPattern(activePat);
      }

      // F-06: the scratch snapshot in localStorage is scoped to one project id.
      // Re-seed it right away so a reload restores THIS project instead of the
      // previously active one (which the debounced autosave would then write into
      // this project's record).
      saveProjectImmediate({
        genreId: project.genreId,
        bpm: project.bpm,
        swing: project.swing,
        timeSignature: project.timeSignature,
        resolution: project.resolution,
        stepCount: project.stepCount,
        patterns: project.patterns,
        activeSlot: project.activeSlot,
        songMode: project.songMode,
        songChain: project.songChain,
        loopRange: project.loopRange,
        isMetronome: project.isMetronome,
        isCountIn: project.isCountIn,
      });
    },
    [commit, currentGenre]
  );

  const handleExportWav = useCallback(async () => {
    try {
      setIsExportingAudio(true);
      showToast(isZh ? "正在离线高质量渲染 WAV 母带..." : "Rendering offline WAV master...");
      const result = await exportMasterWav(patternRef.current, currentGenre.id, {
        bpm,
        swing,
        drumKit,
      });
      triggerWavDownload(result.blob, result.filename);
      showToast(isZh ? `母带 WAV 导出完成: ${result.filename} ✓` : `Exported Master WAV: ${result.filename} ✓`);
    } catch (err: any) {
      showToast(isZh ? `WAV 导出失败: ${err?.message || err}` : `WAV export failed: ${err?.message || err}`);
    } finally {
      setIsExportingAudio(false);
    }
  }, [currentGenre.id, bpm, swing, drumKit, isZh, showToast]);

  const handleExportStems = useCallback(async () => {
    try {
      setIsExportingAudio(true);
      showToast(isZh ? "正在逐轨离线渲染 8 轨 Stems 并打包 ZIP..." : "Rendering 8 stems and packaging ZIP...");
      const result = await exportStemsZip(patternRef.current, currentGenre.id, {
        bpm,
        swing,
        drumKit,
      });
      triggerWavDownload(result.blob, result.filename);
      showToast(isZh ? `分轨打包导出完成: ${result.filename} ✓` : `Exported Stems ZIP: ${result.filename} ✓`);
    } catch (err: any) {
      showToast(isZh ? `分轨导出失败: ${err?.message || err}` : `Stems export failed: ${err?.message || err}`);
    } finally {
      setIsExportingAudio(false);
    }
  }, [currentGenre.id, bpm, swing, drumKit, isZh, showToast]);

  const handleImportMidi = useCallback(
    async (file: File) => {
      try {
        const buffer = await file.arrayBuffer();
        const result = importMidiToPattern(buffer, { quantization: resolution, totalSteps: stepCount });
        commit({ type: "COMMIT_PATTERN", pattern: result.pattern });
        if (result.bpm && result.bpm !== bpm) {
          commit({ type: "SET_BPM", bpm: result.bpm });
        }
        if (engineRef.current) {
          engineRef.current.setPattern(result.pattern);
          if (result.bpm) engineRef.current.setBpm(result.bpm);
        }
        showToast(
          isZh
            ? `已成功导入 MIDI: 识别到 ${result.notesFound} 个音符 ✓`
            : `Imported MIDI: parsed ${result.notesFound} notes ✓`
        );
      } catch (err: any) {
        showToast(isZh ? `MIDI 导入失败: ${err?.message || err}` : `MIDI import failed: ${err?.message || err}`);
      }
    },
    [resolution, stepCount, bpm, commit, isZh, showToast]
  );

  const handleInspireMe = useCallback(() => {
    const mutated = generateVariation(patternRef.current, {
      intensity: "medium",
      preserveKick: true,
      mutateMelodic: true,
      mutatePercussion: true,
      addRatchets: true,
    });
    commit({ type: "COMMIT_PATTERN", pattern: mutated });
    if (engineRef.current) {
      engineRef.current.setPattern(mutated);
    }
    showToast(isZh ? "✨ 已应用 Inspire Me 受控灵感变异！" : "✨ Applied Inspire Me groove variation!");
  }, [commit, isZh, showToast]);

  // Web MIDI & Keyboard Play (P4-04)
  useEffect(() => {
    midiInputManager.initMidi().then(() => {
      setMidiDevices(midiInputManager.getDevices());
    });

    const unsubDevices = midiInputManager.onDevicesChanged((devices) => {
      setMidiDevices(devices);
      if (devices.length > 0) {
        showToast(isZh ? `🎹 检测到 MIDI 设备: ${devices[0].name}` : `🎹 MIDI device connected: ${devices[0].name}`);
      }
    });

    const unsubNoteOn = (note: number, velocity: number, trackIdx?: number) => {
      let targetIdx = trackIdx !== undefined ? trackIdx : 0;
      if (trackIdx === undefined) {
        if (note < 48) targetIdx = 4;
        else if (note <= 65) targetIdx = 5;
        else targetIdx = 6;
      }
      const tr = pattern.tracks[targetIdx];
      if (engineRef.current && tr) {
        const normalizedVel = (velocity / 127) * (tr.volume || 0.8);
        engineRef.current.triggerNote(targetIdx, tr.name, normalizedVel, note, 1);
      }
    };

    const unsub = midiInputManager.onNoteOn(unsubNoteOn);

    return () => {
      unsubDevices();
      unsub();
    };
  }, [pattern.tracks, isZh, showToast]);

  // Computer keyboard play listener
  useEffect(() => {
    if (!isKeyboardMode) return;
    const stopListener = midiInputManager.startKeyboardListener(0);
    return () => stopListener();
  }, [isKeyboardMode]);

  const handleShare = useCallback(() => {
    const result = getShareUrlResult({
      genreId: currentGenre.id,
      bpm,
      swing,
      scale: patternRef.current.scale,
      timeSignature,
      resolution,
      totalSteps: stepCount,
      tracks: patternRef.current.tracks.map((t) => ({
        track_id: t.track_id,
        name: t.name,
        instrument: t.instrument || "synth",
        steps: t.steps,
        velocity: t.velocity,
        pitch: t.pitch,
        mute: t.mute,
        solo: t.solo,
        volume: t.volume,
      })),
    });
    if (!result.url) {
      showToast(
        result.reason === "too-large"
          ? isZh
            ? "工程过大，无法装入分享链接；请改用 .groove 工程包导出"
            : "Pattern is too large for a share link — export a .groove package instead"
          : isZh
          ? "分享失败：当前音序器内容无法编码"
          : "Share failed: this pattern cannot be encoded"
      );
      return;
    }
    navigator.clipboard.writeText(result.url);
    showToast(
      result.degraded
        ? isZh
          ? "链接已复制（内容较大，已省略音高/门限等细节）🔗"
          : "Link copied (too large — pitch/gate detail omitted) 🔗"
        : isZh
        ? "链接已复制到剪贴板 🔗"
        : "Share URL copied to clipboard 🔗"
    );
  }, [currentGenre.id, bpm, swing, timeSignature, resolution, stepCount, isZh, showToast]);

  const scrollToBar = useCallback(
    (bIdx: number) => {
      setViewedBar(bIdx);
      if (matrixContainerRef.current) {
        const targetStep = bIdx * stepsPerBar;
        const targetCell = matrixContainerRef.current.querySelector<HTMLElement>(
          `[data-ruler-step-idx="${targetStep}"]`
        );
        if (targetCell) {
          matrixContainerRef.current.scrollTo({
            left: Math.max(0, targetCell.offsetLeft),
            behavior: "smooth",
          });
        }
      }
    },
    [stepsPerBar]
  );

  const scrollByPixels = useCallback((delta: number) => {
    if (matrixContainerRef.current) {
      matrixContainerRef.current.scrollBy({ left: delta, behavior: "smooth" });
    }
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    GENRE_INDEX.forEach((g) => set.add(g.category));
    const list = ["ALL", ...Array.from(set)];
    if (customGenres.length > 0) {
      list.splice(1, 0, "CUSTOM");
    }
    return list;
  }, [customGenres.length]);

  const railGenres = useMemo(() => {
    if (activeCategoryFilter === "CUSTOM") {
      return customGenres;
    }
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
        "nu-disco-house",
        "acid-house",
      ];
      const headList = demoHeadIds
        .map((id) => GENRE_INDEX_MAP[id])
        .filter(Boolean) as GenreRailItem[];
      const others = GENRE_INDEX.filter((g) => !demoHeadIds.includes(g.id));
      const combined = [...(customGenres as GenreRailItem[]), ...headList, ...others];
      return combined.slice(0, 48 + customGenres.length);
    }
    return GENRE_INDEX.filter((g) => g.category === activeCategoryFilter);
  }, [activeCategoryFilter, customGenres]);

  /**
   * A-01: genre data is loaded on demand. Selecting a chip resolves the full genre
   * (pattern + metadata) before switching, so nothing heavy ships in the entry chunk.
   */
  const switchGenreById = useCallback(
    async (genreId: string, andPlay = false) => {
      if (genreId === currentGenre.id) {
        // Re-clicking the active chip must not reset the user's edited pattern.
        return;
      }
      const full = await loadGenre(genreId);
      if (full) switchGenre(full, andPlay);
    },
    [currentGenre.id, switchGenre]
  );

  const handleDiceRandom = useCallback(() => {
    const rand = GENRE_INDEX[Math.floor(Math.random() * GENRE_INDEX.length)];
    if (rand) void switchGenreById(rand.id, true);
  }, [switchGenreById]);

  // A-03: stable props for the memoized rail / drawer leaves.
  const handleSelectGenreFromRail = useCallback(
    (genreId: string) => {
      void switchGenreById(genreId, true);
    },
    [switchGenreById]
  );

  const handleCollapseSidebar = useCallback(() => setIsSidebarCollapsed(true), []);

  const handleSelectParameterDimension = useCallback(
    (dim: ParameterDimension) => commit({ type: "SET_PARAMETER_DIMENSION", dimension: dim }),
    [commit]
  );

  const handleSelectVelocityTrack = useCallback((idx: number) => setVelocityActiveTrackIdx(idx), []);

  const handleUpdateVelocity = useCallback(
    (trackIdx: number, stepIdx: number, newVel: number) =>
      commitCoalesced(
        { type: "SET_VELOCITY", trackIdx, stepIdx, velocity: newVel },
        `velocity:${trackIdx}`
      ),
    [commitCoalesced]
  );

  const handleBatchUpdateVelocity = useCallback(
    (trackIdx: number, newVelocities: number[]) =>
      commit({ type: "BATCH_SET_VELOCITY", trackIdx, velocities: newVelocities }),
    [commit]
  );

  const handleUpdateProbability = useCallback(
    (trackIdx: number, stepIdx: number, p: number) =>
      commit({ type: "SET_PROBABILITY", trackIdx, stepIdx, probability: p }),
    [commit]
  );

  const handleBatchUpdateProbability = useCallback(
    (trackIdx: number, probs: number[]) =>
      commit({ type: "BATCH_SET_PROBABILITY", trackIdx, probabilities: probs }),
    [commit]
  );

  const handleUpdateRatchet = useCallback(
    (trackIdx: number, stepIdx: number, r: number) =>
      commit({ type: "SET_RATCHET", trackIdx, stepIdx, ratchet: r }),
    [commit]
  );

  const handleBatchUpdateRatchet = useCallback(
    (trackIdx: number, ratchets: number[]) =>
      commit({ type: "BATCH_SET_RATCHET", trackIdx, ratchets }),
    [commit]
  );

  const handleUpdateGate = useCallback(
    (trackIdx: number, stepIdx: number, g: number) =>
      commit({ type: "SET_GATE", trackIdx, stepIdx, gate: g }),
    [commit]
  );

  const handleBatchUpdateGate = useCallback(
    (trackIdx: number, gates: number[]) => commit({ type: "BATCH_SET_GATE", trackIdx, gates }),
    [commit]
  );

  const handleCloseVelocityLane = useCallback(() => setIsVelocityLaneOpen(false), []);

  // A-03: Toolbar is memoized, so every prop it receives needs a stable identity.
  // Grouped here so the genuinely high-frequency transport props
  // (isPlaying / bpm / swing / viewedBar) stay the only things that can invalidate
  // the Toolbar memo. Handlers read live store data through `seqStateRef`.
  const handleChangeDrumKit = useCallback(
    (k: DrumKitType) => {
      setDrumKit(k);
      showToast(isZh ? `已切换硬件鼓机: ${k.toUpperCase()}` : `Switched drum kit: ${k.toUpperCase()}`);
    },
    [isZh, showToast]
  );

  const handleToggleRecordArmed = useCallback(() => {
    const next = !isRecordArmed;
    setIsRecordArmed(next);
    showToast(
      isZh
        ? next
          ? "🔴 实时录制已就绪 (点击打击垫或键盘即时写入网格)"
          : "实时录制已关闭"
        : next
        ? "🔴 Live recording armed"
        : "Live recording disarmed"
    );
  }, [isRecordArmed, isZh, showToast]);

  const handleChangeEffectsRack = useCallback((partial: Partial<EffectsRackState>) => {
    setEffectsRackState((prev) => ({ ...prev, ...partial }));
  }, []);

  const handleChangeBpm = useCallback(
    (b: number) => commitCoalesced({ type: "SET_BPM", bpm: b }, "bpm"),
    [commitCoalesced]
  );

  const handleChangeSwing = useCallback(
    (s: number) => commitCoalesced({ type: "SET_SWING", swing: s }, "swing"),
    [commitCoalesced]
  );

  const handleChangeTimeSignature = useCallback(
    (sig: string) => commit({ type: "SET_TIME_SIGNATURE", timeSignature: sig }),
    [commit]
  );

  const handleChangeResolution = useCallback(
    (res: "1/8" | "1/16" | "1/32") => commit({ type: "SET_RESOLUTION", resolution: res }),
    [commit]
  );

  const handleChangeStepCount = useCallback(
    (count: number) => commit({ type: "SET_STEP_COUNT", count }),
    [commit]
  );

  const handleToggleVelocityLane = useCallback(() => setIsVelocityLaneOpen((prev) => !prev), []);
  const handleOpenEuclidean = useCallback(() => setIsEuclideanOpen(true), []);
  const handleToggleAnalyzer = useCallback(() => setIsAnalyzerOpen((prev) => !prev), []);
  const handleOpenProjectHub = useCallback(() => setIsProjectHubOpen(true), []);

  const handleToggleMaximize = useCallback(() => {
    setIsEditorMaximized((prev) => !prev);
    setShowAdvancedControls(false);
  }, []);

  const handleToggleSidebar = useCallback(() => setIsSidebarCollapsed((prev) => !prev), []);

  const handleToggleAdvancedControls = useCallback(() => setShowAdvancedControls((prev) => !prev), []);

  const handleToggleKeyboardMode = useCallback(() => {
    const next = !isKeyboardMode;
    setIsKeyboardMode(next);
    showToast(
      isZh
        ? next
          ? "🎹 键盘演奏模式已启用 (按 1-8 触发轨道，Z-M 弹奏音符)"
          : "键盘演奏模式已关闭"
        : next
        ? "🎹 Keyboard play enabled (1-8 trigger tracks, Z-M play notes)"
        : "Keyboard play disabled"
    );
  }, [isKeyboardMode, isZh, showToast]);

  const handleAddSteps = useCallback(
    (count: number) => commit({ type: "SET_STEP_COUNT", count: stepCount + count }),
    [commit, stepCount]
  );

  const handleRemoveSteps = useCallback(
    (count: number) => commit({ type: "SET_STEP_COUNT", count: Math.max(groupSize, stepCount - count) }),
    [commit, groupSize, stepCount]
  );

  const handleSwitchSlot = useCallback(
    (slot: "A" | "B") => {
      commit({ type: "SWITCH_PATTERN_SLOT", slot });
      if (engineRef.current) engineRef.current.setPattern(seqStateRef.current.patterns[slot]);
    },
    [commit]
  );

  const handleCopySlot = useCallback(
    (from: "A" | "B", to: "A" | "B") => {
      commit({ type: "COPY_PATTERN_SLOT", from, to });
      showToast(isZh ? `已将 Pattern ${from} 复制至 ${to} ✓` : `Copied Pattern ${from} to ${to} ✓`);
    },
    [commit, isZh, showToast]
  );

  const handleToggleSongMode = useCallback(() => commit({ type: "TOGGLE_SONG_MODE" }), [commit]);

  const handleToggleBlindCompare = useCallback(() => commit({ type: "TOGGLE_BLIND_TEST" }), [commit]);

  const handleToggleMetronome = useCallback(() => {
    commit({ type: "SET_METRONOME", enabled: !seqStateRef.current.isMetronome });
  }, [commit]);

  const handleToggleCountIn = useCallback(() => {
    commit({ type: "SET_COUNT_IN", enabled: !seqStateRef.current.isCountIn });
  }, [commit]);

  const anySolo = useMemo(() => pattern.tracks.some((t) => t.solo), [pattern.tracks]);

  return (
    <div className="w-full text-text" style={{ ["--g" as any]: genreAccent }}>
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-7 left-1/2 -translate-x-1/2 z-50 bg-[#1a1c22] border border-line text-text px-4 py-2.5 rounded-lg text-xs font-mono shadow-[0_8px_30px_rgba(0,0,0,0.6)] flex items-center gap-2">
          <Check className="w-3.5 h-3.5 text-accent" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Genre Rail Wrapper (.rail-wrap) */}
      <GenreRail
        currentGenreId={currentGenre.id}
        activeCategoryFilter={activeCategoryFilter}
        categories={categories}
        railGenres={railGenres}
        genreAccent={genreAccent}
        isZh={isZh}
        onSelectCategory={setActiveCategoryFilter}
        onSelectGenre={handleSelectGenreFromRail}
        onRandomGenre={handleDiceRandom}
        getGenreAccent={getGenreAccent}
        getGenreChipTag={getGenreChipTag}
      />

      {/* Main Two-Column Layout (main: 352px 1fr) */}
      <main
        className={`grid ${
          isSidebarCollapsed || isEditorMaximized ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-[352px_1fr]"
        } gap-5 px-3 sm:px-7 py-3 pb-16 safe-pb items-start`}
      >
        {/* Left Column: Info Dossier (.info) */}
        {!isSidebarCollapsed && !isEditorMaximized && (
          <InfoDossier
            genre={currentGenre}
            scale={pattern.scale}
            timeSignature={timeSignature}
            isZh={isZh}
            language={language}
            onClose={handleCollapseSidebar}
            onViewDetail={onViewDetail}
            onAddToCompare={onAddToCompare}
          />
        )}

        {/* Right Column: The Sequencer (.seq) */}
        <section
          className={
            isEditorMaximized
              ? "fixed inset-0 z-50 overflow-y-auto bg-bg p-2.5 sm:p-3.5 flex flex-col"
              : "bg-panel border border-line rounded-2xl p-3 sm:p-4 min-w-0 order-1 lg:order-2 shadow-2xl"
          }
          style={isEditorMaximized ? {
            paddingTop: "max(0.75rem, calc(env(safe-area-inset-top, 0px) + 0.375rem))",
            paddingBottom: "max(0.75rem, calc(env(safe-area-inset-bottom, 0px) + 0.5rem))",
            paddingLeft: "max(0.75rem, env(safe-area-inset-left, 0px))",
            paddingRight: "max(0.75rem, env(safe-area-inset-right, 0px))",
          } : undefined}
        >
          {/* Sequencer Unified Toolbar */}
          <Toolbar
            isPlaying={isPlaying}
            bpm={bpm}
            swing={swing}
            timeSignature={timeSignature}
            resolution={resolution}
            stepCount={stepCount}
            barCount={barCount}
            viewedBar={viewedBar}
            mobileEditMode={mobileEditMode}
            showAdvancedControls={showAdvancedControls}
            isVelocityLaneOpen={isVelocityLaneOpen}
            isSidebarCollapsed={isSidebarCollapsed}
            isEditorMaximized={isEditorMaximized}
            canUndo={canUndo}
            canRedo={canRedo}
            genreName={currentGenre.name}
            genreAccent={genreAccent}
            isZh={isZh}
            stepsPerBar={stepsPerBar}
            groupSize={groupSize}
            activeSlot={seqState.activeSlot}
            songMode={seqState.songMode}
            blindCompare={seqState.blindTestMode}
            isMetronome={seqState.isMetronome}
            isCountIn={seqState.isCountIn}
            drumKit={drumKit}
            onChangeDrumKit={handleChangeDrumKit}
            isDrumsOnly={isDrumsOnly}
            onToggleDrumsOnly={handleToggleDrumsOnly}
            isRecordArmed={isRecordArmed}
            onToggleRecordArmed={handleToggleRecordArmed}
            effectsRackState={effectsRackState}
            onChangeEffectsRack={handleChangeEffectsRack}
            onTogglePlay={handleTogglePlay}
            onChangeBpm={handleChangeBpm}
            onChangeSwing={handleChangeSwing}
            onChangeTimeSignature={handleChangeTimeSignature}
            onChangeResolution={handleChangeResolution}
            onChangeStepCount={handleChangeStepCount}
            onChangeMobileEditMode={setMobileEditMode}
            onSelectBar={scrollToBar}
            onToggleVelocityLane={handleToggleVelocityLane}
            onOpenEuclidean={handleOpenEuclidean}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onToggleMaximize={handleToggleMaximize}
            onToggleSidebar={handleToggleSidebar}
            onToggleAdvancedControls={handleToggleAdvancedControls}
            onQuickAction={handleQuickAction}
            onExportMidi={handleExportMidi}
            onExportAls={handleExportAls}
            onExportGroove={handleExportGroove}
            activeProjectName={activeProject?.name}
            onOpenProjectHub={handleOpenProjectHub}
            onOpenGenreMaker={onOpenGenreMaker}
            onExportWav={handleExportWav}
            onExportStems={handleExportStems}
            isExportingAudio={isExportingAudio}
            onImportMidi={handleImportMidi}
            onInspireMe={handleInspireMe}
            isKeyboardMode={isKeyboardMode}
            onToggleKeyboardMode={handleToggleKeyboardMode}
            midiDeviceCount={midiDevices.length}
            onShare={handleShare}
            onAddSteps={handleAddSteps}
            onRemoveSteps={handleRemoveSteps}
            onScrollByPixels={scrollByPixels}
            onSwitchSlot={handleSwitchSlot}
            onCopySlot={handleCopySlot}
            onToggleSongMode={handleToggleSongMode}
            onToggleBlindCompare={handleToggleBlindCompare}
            onToggleMetronome={handleToggleMetronome}
            onToggleCountIn={handleToggleCountIn}
            isAnalyzerOpen={isAnalyzerOpen}
            onToggleAnalyzer={handleToggleAnalyzer}
            onTapTempo={handleTapTempo}
          />

          {/* Master Panoramic Analyzer Dock (P6-05) */}
          {isAnalyzerOpen && (
            <div className="w-full my-2">
              <MasterAnalyzerSuite
                analyser={engineRef.current?.getMasterAnalyser() || null}
                analyserL={engineRef.current?.getStereoAnalysers().left || null}
                analyserR={engineRef.current?.getStereoAnalysers().right || null}
                isPlaying={isPlaying}
                onClose={() => setIsAnalyzerOpen(false)}
              />
            </div>
          )}

          {/* 8 Tracks Sequencer Matrix (#tracks) with Event Delegation (P2-02, P2-05, P2-20) */}
          <div
            ref={matrixContainerRef}
            role="grid"
            aria-label={isZh ? "打击乐与合成器音序步进网格" : "Sequencer Step Matrix Grid"}
            onPointerDown={handleGridPointerDown}
            onPointerMove={handleGridPointerMove}
            onPointerUp={handleGridPointerUp}
            onPointerCancel={handleGridPointerUp}
            onContextMenu={handleGridContextMenu}
            className="w-full space-y-1 overflow-x-auto pb-3 relative custom-sequencer-scroll select-none overscroll-x-contain mt-2"
          >
            {/* Playhead Laser Overlay Beam (P2-03) */}
            <div ref={playheadBeamRef} className="playhead-laser-beam hidden" />

            {/* Step Indicator Ruler Header */}
            <Ruler
              stepCount={stepCount}
              timeSignature={timeSignature}
              stepsPerBar={stepsPerBar}
              groupSize={groupSize}
              isRulerDragging={isRulerDragging}
              isZh={isZh}
              loopRange={seqState.loopRange}
              onSelectLoopRange={handleSelectLoopRange}
              onPointerDown={handleRulerPointerDown}
              onPointerMove={handleRulerPointerMove}
              onPointerUp={handleRulerPointerUp}
            />

            {/* Track Rows */}
            {pattern.tracks.map((track, trackIdx) => {
              const meta = DEMO_TRACKS_CONFIG[trackIdx % DEMO_TRACKS_CONFIG.length];
              const isSolo = Boolean(track.solo);
              const isMute = Boolean(track.mute);
              const isDrum = isDrumTrack(track, trackIdx);
              const isSilenced = isMute || (anySolo && !isSolo) || (isDrumsOnly && !isDrum);
              const isHatTrack = track.track_id === "hihat" || track.name.toLowerCase().includes("hat");

              return (
                <TrackRow
                  key={track.track_id}
                  track={track}
                  trackIdx={trackIdx}
                  meta={meta}
                  isSolo={isSolo}
                  isMute={isMute}
                  isSilenced={isSilenced}
                  isHatTrack={isHatTrack}
                  stepCount={stepCount}
                  stepsPerBar={stepsPerBar}
                  groupSize={groupSize}
                  isVelocityLaneOpen={isVelocityLaneOpen}
                  isVelocityActiveTrack={velocityActiveTrackIdx === trackIdx}
                  isZh={isZh}
                  onAudition={handleAudition}
                  onCycleLength={handleCycleTrackLength}
                  onToggleMute={handleToggleTrackMute}
                  onToggleSolo={handleToggleTrackSolo}
                  onChangeVolume={handleChangeTrackVolume}
                  onOpenVelocity={handleOpenVelocityLane}
                  onShiftTrack={handleShiftTrack}
                  onSmartFill={handleSmartFillTrack}
                  onClearTrack={handleClearTrack}
                  onMoveUp={handleMoveTrackUp}
                  onMoveDown={handleMoveTrackDown}
                  canMoveUp={trackIdx > 0}
                  canMoveDown={trackIdx < pattern.tracks.length - 1}
                  onChangePan={handleChangeTrackPan}
                  onChangeSwing={handleChangeTrackSwing}
                />
              );
            })}
          </div>

          {/* Collapsible Velocity Drawer */}
          {isVelocityLaneOpen && (
            <div className="mt-3 pt-3 border-t border-line-subtle">
              <VelocityLane
                tracks={pattern.tracks}
                activeTrackIdx={velocityActiveTrackIdx}
                dimension={seqState.parameterDimension}
                onSelectDimension={handleSelectParameterDimension}
                onSelectTrack={handleSelectVelocityTrack}
                onUpdateVelocity={handleUpdateVelocity}
                onBatchUpdateVelocity={handleBatchUpdateVelocity}
                onUpdateProbability={handleUpdateProbability}
                onBatchUpdateProbability={handleBatchUpdateProbability}
                onUpdateRatchet={handleUpdateRatchet}
                onBatchUpdateRatchet={handleBatchUpdateRatchet}
                onUpdateGate={handleUpdateGate}
                onBatchUpdateGate={handleBatchUpdateGate}
                onClose={handleCloseVelocityLane}
                currentStep={-1}
                isPlaying={isPlaying}
                language={language}
                stepCount={stepCount}
                stepsPerBar={stepsPerBar}
                groupSize={groupSize}
                tracksConfig={DEMO_TRACKS_CONFIG}
              />
            </div>
          )}

          {/* Bottom Hint Note */}
          <div className="mt-3.5 font-['JetBrains_Mono'] text-[10px] text-text-dim tracking-[0.04em] leading-relaxed border-t border-line-subtle pt-3 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              {isTouchDevice ? (
                isZh ? (
                  <span>
                    <strong className="text-accent font-bold">📱 触控/移动端操作：</strong> 点按步进开/关 · 长按步进调出参数锁 (P-Locks) · 顶部步进工具栏切换重音/连音/音高模式 · 点按轨道名试听音色 · 左右滑动浏览小节
                  </span>
                ) : (
                  <span>
                    <strong className="text-accent font-bold">📱 Touch & Mobile:</strong> Tap step to toggle · Long-press for P-Locks · Switch Tool Mode ribbon for accent/ratchet/pitch · Tap track name to audition · Swipe to scroll bars
                  </span>
                )
              ) : (
                isZh ? (
                  <span>
                    <strong className="text-accent font-bold">💡 桌面快捷操作：</strong> 空格键播放/停止 · V 键力度抽屉 · E 键欧几里得 · Ctrl/Cmd+Z 撤销 · 左右拖拽直接涂抹步进 · 滚轮/标尺拖动水平平移
                  </span>
                ) : (
                  <span>
                    <strong className="text-accent font-bold">💡 Desktop Shortcuts:</strong> Space to Play/Pause · V for Velocity · E for Euclidean · Ctrl/Cmd+Z Undo · Drag to paint steps · Wheel/ruler drag to pan
                  </span>
                )
              )}
            </div>
            <div className="text-text-dim text-[9.5px]">
              Groove v1.7.0 · FL Studio Pattern Engine
            </div>
          </div>
        </section>
      </main>

      {/* Euclidean Modal */}
      {isEuclideanOpen && (
        <EuclideanModal
          isOpen={isEuclideanOpen}
          onClose={() => setIsEuclideanOpen(false)}
          tracks={pattern.tracks}
          tracksConfig={DEMO_TRACKS_CONFIG}
          initialTrackIdx={0}
          stepCount={stepCount}
          language={language}
          onApplyEuclidean={(targetTrackIdx, steps) => {
            const next = clonePattern(pattern);
            if (next.tracks[targetTrackIdx]) {
              next.tracks[targetTrackIdx].steps = [...steps];
            }
            commit({ type: "COMMIT_PATTERN", pattern: next });
            showToast(isZh ? "已生成欧几里得律动 ✓" : "Euclidean rhythm applied ✓");
          }}
        />
      )}

      {/* Pitch Picker Modal */}
      {pitchPicker.isOpen && (
        <PitchPickerModal
          isOpen={pitchPicker.isOpen}
          onClose={() => setPitchPicker((prev) => ({ ...prev, isOpen: false }))}
          trackName={pattern.tracks[pitchPicker.trackIdx]?.name || "Track"}
          trackColor={DEMO_TRACKS_CONFIG[pitchPicker.trackIdx % DEMO_TRACKS_CONFIG.length].color}
          stepIdx={pitchPicker.stepIdx}
          initialNote={pitchPicker.initialNote}
          language={language}
          currentScale={pattern.scale}
          trackPitches={pattern.tracks[pitchPicker.trackIdx]?.pitch}
          onQuantizeTrack={(quantizedPitches) => {
            commit({
              type: "BATCH_SET_PITCH",
              trackIdx: pitchPicker.trackIdx,
              pitches: quantizedPitches,
            });
            showToast(isZh ? "已将全轨音高对齐至当前调式 ✓" : "Track pitches quantized to scale ✓");
          }}
          onScaleChange={(newScale) => {
            commit({ type: "SET_SCALE", scale: newScale });
            showToast(isZh ? `已切换曲目调式: ${newScale} ✓` : `Scale set: ${newScale} ✓`);
          }}
          onSelectPitch={(stepIdx, midiNote) => {
            commit({ type: "SET_PITCH", trackIdx: pitchPicker.trackIdx, stepIdx, pitch: midiNote });
            showToast(isZh ? "音高已设定 ✓" : "Pitch set ✓");
          }}
          onPreviewNote={(midiNote) => {
            const tr = pattern.tracks[pitchPicker.trackIdx];
            if (engineRef.current && tr) {
              engineRef.current.triggerNote(pitchPicker.trackIdx, tr.name, 0.9, midiNote, 1);
            }
          }}
        />
      )}

      {/* Multi-Project Hub Modal (P7-02) */}
      <ProjectHubModal
        isOpen={isProjectHubOpen}
        onClose={() => setIsProjectHubOpen(false)}
        currentGenre={currentGenre}
        currentPatterns={{
          A: seqState.activeSlot === "A" ? pattern : seqState.patterns.A,
          B: seqState.activeSlot === "B" ? pattern : seqState.patterns.B,
        }}
        activeSlot={seqState.activeSlot}
        bpm={bpm}
        swing={swing}
        timeSignature={timeSignature}
        resolution={resolution}
        stepCount={stepCount}
        songMode={seqState.songMode}
        songChain={seqState.songChain}
        loopRange={seqState.loopRange}
        effectsRackState={effectsRackState}
        drumKit={drumKit}
        isMetronome={seqState.isMetronome}
        isCountIn={seqState.isCountIn}
        onLoadProject={handleLoadProject}
        onToast={showToast}
      />

      {/* Step Context Menu (P-Locks) */}
      {stepContextMenu && (
        <div
          className="fixed z-50 bg-[#15171d] border border-line rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.8)] p-3 text-xs w-60 animate-fade-in"
          style={{
            left: Math.min(window.innerWidth - 250, Math.max(10, stepContextMenu.x)),
            top: Math.min(window.innerHeight - 280, Math.max(10, stepContextMenu.y)),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="font-['JetBrains_Mono'] text-[10px] text-accent font-bold pb-2 border-b border-line flex items-center justify-between">
            <span>
              {isZh ? "参数锁 (P-LOCKS)" : "PARAM LOCKS"} - T{stepContextMenu.trackIdx + 1}:S{stepContextMenu.stepIdx + 1}
            </span>
            <button
              onClick={() => setStepContextMenu(null)}
              className="text-text-dim hover:text-text px-1"
            >
              ✕
            </button>
          </div>

          <div className="space-y-2.5 mt-2.5">
            {/* Ratchet Subdivisions */}
            <div className="flex items-center justify-between">
              <span className="text-text-dim">{isZh ? "连音滚奏" : "Ratchet"}:</span>
              <div className="flex gap-1">
                {[1, 2, 3, 4].map((r) => {
                  const cur = pattern.tracks[stepContextMenu.trackIdx]?.ratchet?.[stepContextMenu.stepIdx] || 1;
                  return (
                    <button
                      key={r}
                      onClick={() => {
                        commit({
                          type: "SET_RATCHET",
                          trackIdx: stepContextMenu.trackIdx,
                          stepIdx: stepContextMenu.stepIdx,
                          ratchet: r,
                        });
                        setStepContextMenu(null);
                      }}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                        cur === r ? "bg-accent text-black font-bold border-accent" : "bg-panel2 border-line text-text"
                      }`}
                    >
                      {r}x
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Trigger Probability */}
            <div className="flex items-center justify-between">
              <span className="text-text-dim">{isZh ? "触发概率" : "Prob"}:</span>
              <div className="flex gap-1">
                {[100, 75, 50, 25].map((p) => {
                  const cur = pattern.tracks[stepContextMenu.trackIdx]?.probability?.[stepContextMenu.stepIdx] ?? 100;
                  return (
                    <button
                      key={p}
                      onClick={() => {
                        commit({
                          type: "SET_PROBABILITY",
                          trackIdx: stepContextMenu.trackIdx,
                          stepIdx: stepContextMenu.stepIdx,
                          probability: p,
                        });
                        setStepContextMenu(null);
                      }}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                        cur === p ? "bg-accent text-black font-bold border-accent" : "bg-panel2 border-line text-text"
                      }`}
                    >
                      {p}%
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Pitch Selection for Melodic Tracks */}
            <div className="pt-2 border-t border-line flex items-center justify-between">
              <span className="text-text-dim">{isZh ? "独立音高" : "Pitch"}:</span>
              <button
                onClick={() => {
                  const tr = pattern.tracks[stepContextMenu.trackIdx];
                  setPitchPicker({
                    isOpen: true,
                    trackIdx: stepContextMenu.trackIdx,
                    stepIdx: stepContextMenu.stepIdx,
                    initialNote: tr?.pitch?.[stepContextMenu.stepIdx] ?? 60,
                  });
                  setStepContextMenu(null);
                }}
                className="px-2 py-1 rounded bg-panel2 hover:bg-line border border-line text-accent font-mono text-[10px]"
              >
                {isZh ? "打开音高键盘 ♩" : "Open Keyboard ♩"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
