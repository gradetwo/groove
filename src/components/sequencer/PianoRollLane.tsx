import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Circle,
  Copy,
  Download,
  Eraser,
  FilePlus,
  Filter,
  Keyboard,
  Layers,
  Maximize2,
  Minimize2,
  Minus,
  MousePointer2,
  Music2,
  Pencil,
  Play,
  Plus,
  Radio,
  Repeat,
  Save,
  Scissors,
  Sparkles,
  Square,
  SquareDashedMousePointer,
  Trash2,
  TrendingUp,
  Volume2,
  Wand2,
  X,
} from "lucide-react";
import { MidiExporter } from "../../audio/MidiExporter";
import { useLanguage } from "../../i18n/LanguageContext";
import type { SequencerAction } from "../../features/sequencer/useSequencerStore";
import { MAX_NOTE_GATE_STEPS, type SequencerPattern } from "../../types/genre";
import {
  addNote,
  addChord,
  applyChordProgression,
  arpeggiateSelectedNotes,
  CHORD_PROGRESSIONS,
  chordNotesForStamp,
  compressNotesVelocity,
  copyNotes,
  deleteNotes,
  detectChordName,
  drop2SelectedChord,
  duplicateBar1Notes,
  humanizeNotesVelocity,
  humanizeSelectedNotes,
  invertSelectedChord,
  isRollEditableTrack,
  legatoNotes,
  loopLengthOf,
  moveNotes,
  notesFromTrack,
  noteId,
  notesInRect,
  quantizeLengths,
  rampNotesVelocity,
  removeNote,
  resizeNote,
  previewProgressionNotes,
  scaleHighlightFor,
  scaleNotesVelocity,
  setNotesVelocity,
  splitNote,
  transposeTrack,
  transposeNotes,
  visiblePitchRange,
  type ChordProgressionDef,
  type ChordStampType,
  type RollSnap,
  parseNoteId,
  removeNoteAt,
  selectedSteps,
  type RollNoteId,
  type RollStepNote,
  type RollTool,
} from "../../features/sequencer/rollModel";
import {
  clampCursor,
  KEYBOARD_DEFAULT_GATE,
  rollKeyboardIntent,
  scrollToRevealCursor,
  type RollCursor,
  type RollKeyboardBounds,
} from "../../features/sequencer/rollKeyboard";
import { midiToNoteName } from "./PitchPickerModal";
import { subscribePlayhead } from "../../features/sequencer/playheadBus";

/**
 * Piano-roll lane, rebuilt against Logic's piano roll (item ② of the DAW-alignment objective).
 *
 * It edits **the studio's own pattern**: the grid reads `steps`/`pitch`/`gate`/`velocity` and every
 * gesture commits through the store, so the step matrix and the roll stay two views of one object —
 * no second copy, and undo comes from the same history.
 *
 * What this rebuild adds over the first version, and where it deliberately differs from Logic:
 *
 *   - **tools** — pencil, pointer, eraser, scissors, marquee (buttons plus keys `1`–`5`). The roll
 *     opens on the **pencil**, not Logic's pointer, because drawing into an empty step grid is this
 *     editor's primary verb (and was its only behaviour before the rebuild); the pointer selects,
 *     moves and marquee-drags like Logic's. The pencil also *paints*: dragging across empty cells
 *     keeps adding notes, and the whole stroke is one undo step.
 *   - **velocity lane** — bars under the grid; dragging a bar edits that note, and dragging a bar
 *     that belongs to the selection offsets the whole selection.
 *   - **multi-note editing** — marquee/⌘-click selection, move as a group, ⌥-drag to copy, Delete,
 *     arrow-key nudge — each gesture committing **once** (one `COMMIT_PATTERN`, one undo step).
 *   - **quantise and legato** — acting on *lengths*, not starts. In a step grid the start **is** a
 *     grid position, so a "quantise start" button would do nothing; that is stated in the UI rather
 *     than shipped as a fake control.
 *   - **visuals** — a keyboard-shaped pitch gutter with the scale highlighted (root strongest), note
 *     names on notes wide enough to hold them, a velocity colour ramp, bar/beat lines, the polymeter
 *     boundary, a playhead that can be followed, and the loop region drawn.
 *
 * The remaining distance to Logic is stated where it matters: a step grid is monophonic and
 * quantised, so notes cannot overlap, cannot start off the grid, and their length is a multiple of
 * one step.
 */
export interface PianoRollLaneProps {
  pattern: SequencerPattern;
  activeTrackIdx: number;
  stepCount: number;
  stepsPerBar: number;
  isZh: boolean;
  isPlaying?: boolean;
  currentStep?: number;
  onSelectTrack: (trackIdx: number) => void;
  onClose: () => void;
  commit: (action: SequencerAction) => void;
  /** Plays one note through the track's instrument so drawing is audible. */
  onAudition: (trackIdx: number, midi: number, velocity: number, gate: number) => void;
  /**
   * Plays a **complete voicing** as one chord (not one call per member).
   *
   * `onAudition` is a single-note preview, and on a chords track the engine voices whatever note
   * it is handed — so auditioning a four-note chord note-by-note produced twelve voices in the
   * same register. Optional so an embedder that only has the single-note path still compiles.
   */
  onPreviewChord?: (trackIdx: number, notes: number[], velocity: number, durationSeconds?: number) => void;
  /**
   * Isolated preview of just this track's lane (the roll's own transport).
   *
   * `onStartPreview` returns whether the engine accepted the scope, so the toggle can stay in
   * sync with reality instead of assuming success.
   */
  onStartPreview?: (trackIdx: number, fromStep: number, toStep: number) => boolean;
  onStopPreview?: () => void;
  isPreviewing?: boolean;
  /** Optional trigger to open/toggle Musical Typing keyboard HUD */
  onToggleMusicalTyping?: () => void;
  /** Optional trigger to open Help Center modal with contextual chapter */
  onOpenHelp?: (chapterId?: string) => void;
  /** Initial tool to activate when opening the roll (defaults to stored preference or pointer) */
  initialTool?: RollTool;
}

export function loadDefaultRollTool(): RollTool {
  try {
    const val = localStorage.getItem("groove_default_roll_tool");
    if (val === "pencil") return "pencil";
    return "pointer";
  } catch {
    return "pointer";
  }
}

const ROW_HEIGHTS = [12, 18, 26];
const ZOOM_FACTORS = [0.5, 0.75, 1, 1.5, 2];
const DEFAULT_ZOOM_INDEX = 2; // 1× == fit
const MIN_CELL_W = 10;
const GUTTER_W = 52;
const VELOCITY_LANE_H = 54;
const VELOCITY_PER_PX = 2.4;

const TOOLS: Array<{ id: RollTool; icon: React.ReactNode; labelKey: string; keyHint: string }> = [
  { id: "pointer", icon: <MousePointer2 className="h-3.5 w-3.5" />, labelKey: "roll_tool_pointer", keyHint: "1/P" },
  { id: "pencil", icon: <Pencil className="h-3.5 w-3.5" />, labelKey: "roll_tool_pencil", keyHint: "2/B" },
  { id: "eraser", icon: <Eraser className="h-3.5 w-3.5" />, labelKey: "roll_tool_eraser", keyHint: "3" },
  { id: "scissors", icon: <Scissors className="h-3.5 w-3.5" />, labelKey: "roll_tool_scissors", keyHint: "4" },
  { id: "marquee", icon: <SquareDashedMousePointer className="h-3.5 w-3.5" />, labelKey: "roll_tool_marquee", keyHint: "5" },
];

const SNAPS: RollSnap[] = ["off", "1/4", "1/8", "1/16", "1/32"];

const AVAILABLE_SCALES = [
  "C major",
  "G major",
  "D major",
  "A major",
  "E major",
  "F major",
  "Bb major",
  "Eb major",
  "A minor",
  "E minor",
  "B minor",
  "D minor",
  "G minor",
  "C minor",
  "F minor",
  "D dorian",
  "E phrygian",
  "F lydian",
  "G mixolydian",
  "C blues",
  "A pentatonic minor",
  "C pentatonic major",
];

/** Velocity → a luminous DAW heatmap colour that reads from radiant coral to blazing golden amber. */
function velocityColor(velocity: number): string {
  const t = Math.min(1, Math.max(0, velocity / 127));
  const hue = Math.round(18 + t * 27); // 18 (coral) -> 45 (gold)
  const sat = Math.round(88 + t * 10);
  const light = Math.round(44 + t * 18);
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

type DragState =
  | { mode: "draw"; startStep: number; midi: number; base: SequencerPattern }
  | { mode: "move"; startStep: number; startMidi: number; origin: RollNoteId[]; base: SequencerPattern; copied: boolean }
  | { mode: "marquee"; startStep: number; startMidi: number }
  | { mode: "velocity"; startY: number; steps: RollNoteId[]; base: SequencerPattern }
  | { mode: "resize"; stepIdx: number; midi: number; base: SequencerPattern; startGate: number; startX: number; currentGate: number }
  | { mode: "paint"; base: SequencerPattern; painted: RollNoteId[] };

export const PianoRollLane: React.FC<PianoRollLaneProps> = ({
  pattern,
  activeTrackIdx,
  stepCount,
  stepsPerBar,
  isZh,
  isPlaying = false,
  currentStep = -1,
  onSelectTrack,
  onClose,
  commit,
  onAudition,
  onPreviewChord,
  onStartPreview,
  onStopPreview,
  isPreviewing = false,
  onToggleMusicalTyping,
  onOpenHelp,
  initialTool,
}) => {
  const { t } = useLanguage();
  const [customStepWidth, setCustomStepWidth] = useState<number | null>(null);
  const [rowHeight, setRowHeight] = useState(18);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [availableWidth, setAvailableWidth] = useState(0);
  const [octaveShift, setOctaveShift] = useState(0);
  const [tool, setTool] = useState<RollTool>(() => initialTool ?? loadDefaultRollTool());
  const [chordStamp, setChordStamp] = useState<ChordStampType>("note");
  const [selectedProgressionId, setSelectedProgressionId] = useState<string>("pop_4chords");
  const [activeAuditionMidi, setActiveAuditionMidi] = useState<number | null>(null);
  /** 0 = whole lane; otherwise the 1-based bar whose span the preview plays. */
  const [previewBars, setPreviewBars] = useState(0);
  const [snap, setSnap] = useState<RollSnap>("1/16");
  const [selection, setSelection] = useState<RollNoteId[]>([]);
  const [draft, setDraft] = useState<SequencerPattern | null>(null);
  const [marquee, setMarquee] = useState<{ stepFrom: number; stepTo: number; pitchFrom: number; pitchTo: number } | null>(null);
  const [showVelocityLane, setShowVelocityLane] = useState(true);
  const [catchPlayhead, setCatchPlayhead] = useState(true);
  const [isFolded, setIsFolded] = useState(false);
  const [fullPitchRange, setFullPitchRange] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [hoverCell, setHoverCell] = useState<{ stepIdx: number; midi: number } | null>(null);
  /** U10: where the keyboard is, as opposed to where the pointer is (`hoverCell`). */
  const [keyboardCursor, setKeyboardCursor] = useState<RollCursor | null>(null);
  /** U10: the live region's text — what a screen reader hears as the cursor moves and edits land. */
  const [rollAnnouncement, setRollAnnouncement] = useState("");
  const [resizeGatePreview, setResizeGatePreview] = useState<{ stepIdx: number; midi: number; gate: number } | null>(null);
  const [showNewConfirm, setShowNewConfirm] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const recordingStepRef = useRef<number>(0);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);

  const sectionRef = useRef<HTMLElement | null>(null);
  const gridWrapRef = useRef<HTMLDivElement | null>(null);
  const progressionAuditionTimersRef = useRef<number[]>([]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const keybedScrollRef = useRef<HTMLDivElement | null>(null);
  const rulerScrollRef = useRef<HTMLDivElement | null>(null);
  const velScrollRef = useRef<HTMLDivElement | null>(null);
  const playheadRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const lastAuditionPitchRef = useRef<number | null>(null);
  const hasCenteredRef = useRef(false);
  const centeredTrackRef = useRef<number | null>(null);

  const cellWRef = useRef(26);
  const catchRef = useRef(true);
  const view = draft ?? pattern;
  const track = view.tracks[activeTrackIdx];
  const editable = isRollEditableTrack(track);
  const notes = useMemo(() => notesFromTrack(track, 60, view.scale), [track, view.scale]);
  const selectedSet = useMemo(() => new Set(selection), [selection]);

  const barCount = useMemo(() => Math.max(1, Math.ceil(stepCount / stepsPerBar)), [stepCount, stepsPerBar]);
  const loopLen = loopLengthOf(track, stepCount);

  const chordsByBar = useMemo(() => {
    return Array.from({ length: barCount }, (_, barIdx) => {
      const startStep = barIdx * stepsPerBar;
      const endStep = Math.min(stepCount, startStep + stepsPerBar);
      const barNotes = notes.filter((n) => n.stepIdx >= startStep && n.stepIdx < endStep);
      const effectiveNotes =
        barNotes.length > 0
          ? barNotes
          : loopLen < stepCount
          ? notes.filter((n) => {
              const loopedStep = n.stepIdx % loopLen;
              const mapped = startStep + loopedStep;
              return mapped >= startStep && mapped < endStep;
            })
          : [];
      const midis = (effectiveNotes.length ? effectiveNotes : barNotes).map((n) => n.midi);
      const chordName = detectChordName(midis);
      return { barIdx, startStep, endStep, chordName, noteIds: barNotes.map(noteId) };
    });
  }, [barCount, notes, stepCount, stepsPerBar, loopLen]);

  const [baseLo, baseHi] = useMemo(() => visiblePitchRange(notes), [notes]);
  const [loPitch, hiPitch] = useMemo(() => {
    const span = baseHi - baseLo;
    let lo = baseLo + octaveShift;
    let hi = baseHi + octaveShift;
    if (lo < 0) {
      hi -= lo;
      lo = 0;
    }
    if (hi > 127) {
      lo = Math.max(0, lo - (hi - 127));
      hi = 127;
    }
    return [lo, Math.max(lo + span, hi)] as [number, number];
  }, [baseLo, baseHi, octaveShift]);

  const scale = useMemo(() => scaleHighlightFor(view.scale), [view.scale]);
  // 0-127 full MIDI range coverage when fullPitchRange is enabled, otherwise track content range
  const rows = useMemo(() => {
    const out: number[] = [];
    const minP = fullPitchRange ? 0 : loPitch;
    const maxP = fullPitchRange ? 127 : hiPitch;
    for (let p = maxP; p >= minP; p--) {
      if (isFolded) {
        const inScale = scale.pcs.has(p % 12);
        const hasNote = notes.some((n) => n.midi === p);
        if (!inScale && !hasNote) continue;
      }
      out.push(p);
    }
    return out;
  }, [fullPitchRange, loPitch, hiPitch, isFolded, scale.pcs, notes]);

  const rowIdxMap = useMemo(() => new Map(rows.map((p, idx) => [p, idx])), [rows]);
  const fitCellW = availableWidth > 0 ? Math.max(MIN_CELL_W, (availableWidth - GUTTER_W) / Math.max(1, stepCount)) : 26;
  const cellW = customStepWidth ?? fitCellW;
  const rowH = rowHeight;
  const gridW = stepCount * cellW;
  cellWRef.current = cellW;
  catchRef.current = catchPlayhead;

  // Auto-center on the active track's first note upon entering / switching tracks
  useEffect(() => {
    if (!scrollRef.current) return;
    if (centeredTrackRef.current === activeTrackIdx && hasCenteredRef.current) return;

    const sortedNotes = [...notes].sort((a, b) => a.stepIdx - b.stepIdx || a.midi - b.midi);
    const firstNote = sortedNotes[0];
    const targetMidi = firstNote ? firstNote.midi : 60;
    const targetRowIdx = rowIdxMap.get(targetMidi) ?? rows.indexOf(targetMidi);

    if (targetRowIdx >= 0) {
      const viewportH = scrollRef.current.clientHeight || 396;
      const targetY = Math.max(0, targetRowIdx * rowH - viewportH / 2 + rowH / 2);
      scrollRef.current.scrollTop = targetY;
      if (keybedScrollRef.current) keybedScrollRef.current.scrollTop = targetY;

      if (firstNote && firstNote.stepIdx > 0) {
        const targetX = Math.max(0, firstNote.stepIdx * cellW - 40);
        scrollRef.current.scrollLeft = targetX;
        if (rulerScrollRef.current) rulerScrollRef.current.scrollLeft = targetX;
        if (velScrollRef.current) velScrollRef.current.scrollLeft = targetX;
      }
      centeredTrackRef.current = activeTrackIdx;
      hasCenteredRef.current = true;
    }
  }, [activeTrackIdx, notes, rowIdxMap, rows, rowH, cellW]);

  // Center on first note or C4 when toggling full 0-127 pitch range
  useEffect(() => {
    if (scrollRef.current) {
      const sortedNotes = [...notes].sort((a, b) => a.stepIdx - b.stepIdx || a.midi - b.midi);
      const firstNote = sortedNotes[0];
      const targetMidi = firstNote ? firstNote.midi : 60;
      const targetRowIdx = rowIdxMap.get(targetMidi) ?? rows.indexOf(targetMidi);
      if (targetRowIdx >= 0) {
        const viewportH = scrollRef.current.clientHeight || 396;
        const targetY = Math.max(0, targetRowIdx * rowH - viewportH / 2 + rowH / 2);
        scrollRef.current.scrollTop = targetY;
        if (keybedScrollRef.current) keybedScrollRef.current.scrollTop = targetY;
      }
    }
  }, [fullPitchRange]);

  // Sync tool with user preference broadcast
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<RollTool>).detail;
      if (detail === "pointer" || detail === "pencil") {
        setTool(detail);
      }
    };
    window.addEventListener("groove_default_tool_changed", handler);
    return () => window.removeEventListener("groove_default_tool_changed", handler);
  }, []);

  const selectableTracks = useMemo(() => {
    const list = view.tracks.map((tr, idx) => ({ tr, idx })).filter(({ tr }) => isRollEditableTrack(tr));
    if (track && !isRollEditableTrack(track) && !list.some((item) => item.idx === activeTrackIdx)) {
      list.unshift({ tr: track, idx: activeTrackIdx });
    }
    return list;
  }, [view.tracks, track, activeTrackIdx]);

  /** The note exactly under a cell, or null. */
  const noteAt = useCallback(
    (stepIdx: number, midi: number) => notes.find((n) => n.stepIdx === stepIdx && n.midi === midi) ?? null,
    [notes]
  );
  /** Every note on a step — a chord is several. */
  const notesAtStep = useCallback((stepIdx: number) => notes.filter((n) => n.stepIdx === stepIdx), [notes]);

  const commitDraft = useCallback(
    (next: SequencerPattern, nextSelection?: RollNoteId[]) => {
      commit({ type: "COMMIT_PATTERN", pattern: next });
      if (nextSelection) setSelection(nextSelection);
    },
    [commit]
  );

  const handleNewPattern = useCallback(() => {
    if (notes.length === 0) {
      setNotice(t("roll_cleared_notice"));
      return;
    }
    setShowNewConfirm(true);
  }, [notes.length, t]);

  const handleConfirmNewPattern = useCallback(() => {
    const cleared = deleteNotes(pattern, activeTrackIdx, notes.map(noteId), stepCount);
    commitDraft(cleared, []);
    setShowNewConfirm(false);
    setSelection([]);
    setNotice(t("roll_cleared_notice"));
  }, [pattern, activeTrackIdx, notes, stepCount, commitDraft, t]);

  const handleExportClipJson = useCallback(() => {
    const activeTrack = pattern.tracks[activeTrackIdx];
    const clipData = {
      format: "groove-pattern-clip",
      version: "1.0",
      trackId: activeTrack?.track_id ?? "unknown",
      trackName: activeTrack?.name ?? "Track",
      scale: view.scale,
      bpm: pattern.bpm ?? 120,
      stepCount,
      stepsPerBar,
      steps: activeTrack?.steps?.slice(0, stepCount) || [],
      velocity: activeTrack?.velocity?.slice(0, stepCount) || [],
      pitch: activeTrack?.pitch?.slice(0, stepCount) || [],
      gate: activeTrack?.gate?.slice(0, stepCount) || [],
      notes: notes.map((n) => ({ stepIdx: n.stepIdx, midi: n.midi, velocity: n.velocity, gate: n.gate })),
      exportedAt: new Date().toISOString(),
    };
    const jsonStr = JSON.stringify(clipData, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(activeTrack?.name || "track").toLowerCase()}_clip.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(jsonStr).catch(() => {});
    }
    setShowExportMenu(false);
    setNotice(t("roll_clip_saved"));
  }, [pattern, activeTrackIdx, view.scale, stepCount, stepsPerBar, notes, t]);

  const handleExportClipMidi = useCallback(() => {
    const activeTrack = pattern.tracks[activeTrackIdx];
    if (!activeTrack) return;
    const singleTrackPattern: SequencerPattern = {
      ...pattern,
      totalSteps: stepCount,
      tracks: [activeTrack],
    };
    MidiExporter.downloadMidiFile(
      {
        bpm: pattern.bpm || 120,
        pattern: singleTrackPattern,
        genreName: activeTrack.name,
      },
      `${activeTrack.name.toLowerCase()}_clip.mid`
    );
    setShowExportMenu(false);
    setNotice(t("roll_clip_saved"));
  }, [pattern, activeTrackIdx, stepCount, t]);

  const recordNote = useCallback(
    (midi: number, vel = 100, gateLen = 0.8) => {
      if (!editable) return;
      const targetStep =
        currentStep !== undefined && currentStep >= 0
          ? currentStep
          : recordingStepRef.current;
      recordingStepRef.current = (targetStep + 1) % stepCount;
      const next = addNote(pattern, activeTrackIdx, targetStep, midi, stepCount, vel, gateLen);
      commitDraft(next);
      setNotice(
        isZh
          ? `已录制: ${midiToNoteName(midi)} (步 ${targetStep + 1})`
          : `Recorded: ${midiToNoteName(midi)} (step ${targetStep + 1})`
      );
    },
    [editable, currentStep, stepCount, pattern, activeTrackIdx, commitDraft, isZh]
  );

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    if (showExportMenu) {
      document.addEventListener("mousedown", onDocClick);
      return () => document.removeEventListener("mousedown", onDocClick);
    }
  }, [showExportMenu]);

  /**
   * Deliberately does NOT call `scrollIntoView` on mount.
   *
   * It used to, with `block: "nearest"`, to bring the editor into view when it opened. The effect
   * is not scoped to this panel's own scroller: on a fresh page load the panel mounts while the
   * document is still laying out, and the browser scrolls the *document* to satisfy the request —
   * so opening the app landed the user in the middle of the sequencer instead of at the top of the
   * page. Nothing here needs the document to move; the panel's own scrollers already position the
   * editor, and the user arrives by tapping a control they can see.
   */
  useEffect(() => {
    // Intentionally empty: `sectionRef` is kept for callers that need the node, not for scrolling.
    void sectionRef.current;
  }, []);

  useEffect(() => {
    const node = gridWrapRef.current;
    if (!node) return;
    const measure = () => setAvailableWidth(node.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [isFullscreen, isCollapsed]);

  // Drop a selection that no longer exists (genre switch, undo, track change).
  useEffect(() => {
    // Keep only ids that still exist: a genre switch, an undo or a track change can remove notes.
    const live = new Set(notes.map(noteId));
    setSelection((prev) => {
      const next = prev.filter((id) => live.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [notes]);

  // Playhead + catch. Driven by the DOM-only playhead bus, so a running transport does not
  // re-render this panel 16 times a bar (the studio makes the same choice for its own beam).
  useEffect(() => {
    let lastRenderedStep = -1;
    return subscribePlayhead((step) => {
      lastRenderedStep = step;
      const line = playheadRef.current;
      if (line) {
        if (step < 0) {
          line.style.opacity = "0";
        } else {
          line.style.opacity = "1";
          line.style.transform = `translateX(${step * cellWRef.current}px)`;
        }
      }
      if (!catchRef.current || step < 0) return;
      const scroller = scrollRef.current;
      if (!scroller) return;
      const x = step * cellWRef.current;
      const left = scroller.scrollLeft;
      const right = left + scroller.clientWidth;
      if (x < left || x > right - cellWRef.current) {
        const nextLeft = Math.max(0, x - scroller.clientWidth * 0.35);
        scroller.scrollLeft = nextLeft;
        if (rulerScrollRef.current) rulerScrollRef.current.scrollLeft = nextLeft;
        if (velScrollRef.current) velScrollRef.current.scrollLeft = nextLeft;
      }
      void lastRenderedStep;
    });
  }, []);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 2600);
    return () => clearTimeout(id);
  }, [notice]);

  const cellFromEvent = (event: React.PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    return { stepIdx: Math.floor(x / cellW), midi: rows[Math.floor(y / rowH)] };
  };

  const applyOp = (op: (p: SequencerPattern) => SequencerPattern) => {
    const next = op(pattern);
    if (next !== pattern) commitDraft(next);
  };

  // ---------------------------------------------------------------------------------------
  // U10: keyboard editing
  //
  // The roll's DOM cannot honestly be a `grid` (there are no rows to hold `gridcell`s), so the
  // editor is exposed as one focusable surface with a cursor inside it — see
  // `features/sequencer/rollKeyboard.ts` for why. What lives here is only the dispatch: move the
  // cursor, or apply the pointer tools' own operations to whatever note is under it, so a note drawn
  // by keyboard and a note drawn by pointer are the same edit through the same `commitDraft`.
  // ---------------------------------------------------------------------------------------

  const rollHelpId = useId();

  const keyboardBounds = useMemo<RollKeyboardBounds>(
    () => ({
      stepCount,
      barSteps: Math.max(1, stepsPerBar),
      loMidi: rows.length ? Math.min(rows[0], rows[rows.length - 1]) : 0,
      hiMidi: rows.length ? Math.max(rows[0], rows[rows.length - 1]) : 127,
    }),
    [stepCount, stepsPerBar, rows]
  );

  /**
   * Announces a line to the live region.
   *
   * `aria-live` only re-announces when the *text changes*, and two identical messages are normal
   * here: nudging velocity into its ceiling, or pressing an arrow against the edge of the clip.
   * Alternating a zero-width space keeps the message identical to a reader while making the DOM text
   * differ, which is the only thing the live region reacts to.
   */
  const announceRoll = useCallback((text: string) => {
    setRollAnnouncement((prev) => (prev.endsWith("\u200B") ? text : `${text}\u200B`));
  }, []);

  const describeCell = useCallback(
    (cursor: RollCursor): string => {
      const note = midiToNoteName(cursor.midi);
      const hit = noteAt(cursor.stepIdx, cursor.midi);
      return hit
        ? t("roll_kb_cursor_note", { note, step: cursor.stepIdx + 1, velocity: hit.velocity })
        : t("roll_kb_cursor_empty", { note, step: cursor.stepIdx + 1 });
    },
    [noteAt, t]
  );

  /**
   * Where the cursor appears when the grid is focused: the first selected note, else the first note
   * in the clip, else the middle of the drawn range. Starting from the user's own selection means
   * tabbing in and pressing a key acts on what they were already working on.
   */
  const initialCursor = useCallback((): RollCursor => {
    const selected = selection.map(parseNoteId)[0];
    const anchor = selected ?? notes[0];
    if (anchor) return clampCursor({ stepIdx: anchor.stepIdx, midi: anchor.midi }, keyboardBounds);
    return clampCursor(
      {
        stepIdx: 0,
        midi: Math.round((keyboardBounds.loMidi + keyboardBounds.hiMidi) / 2),
      },
      keyboardBounds
    );
  }, [selection, notes, keyboardBounds]);

  /** A note read back from the pattern that was committed — what was actually written. */
  const noteAfter = useCallback(
    (next: SequencerPattern, id: RollNoteId) =>
      notesFromTrack(next.tracks[activeTrackIdx]).find((n) => noteId(n) === id) ?? null,
    [activeTrackIdx]
  );

  /**
   * Scrolls the grid so the keyboard cursor stays visible, syncing the ruler and velocity lanes the
   * same way a manual scroll does. The pointer never needed this; a cursor that walks off-screen
   * just looks like the key did nothing.
   */
  const revealCursor = useCallback(
    (cursor: RollCursor) => {
      const scroller = scrollRef.current;
      const rowIdx = rowIdxMap.get(cursor.midi);
      if (!scroller || rowIdx === undefined) return;
      const { left, top } = scrollToRevealCursor({
        stepIdx: cursor.stepIdx,
        rowIdx,
        cellW,
        rowH,
        viewW: scroller.clientWidth,
        viewH: scroller.clientHeight,
        scrollLeft: scroller.scrollLeft,
        scrollTop: scroller.scrollTop,
      });
      if (left !== scroller.scrollLeft) {
        scroller.scrollLeft = left;
        if (rulerScrollRef.current) rulerScrollRef.current.scrollLeft = left;
        if (velScrollRef.current) velScrollRef.current.scrollLeft = left;
      }
      if (top !== scroller.scrollTop) {
        scroller.scrollTop = top;
        if (keybedScrollRef.current) keybedScrollRef.current.scrollTop = top;
      }
    },
    [rowIdxMap, cellW, rowH]
  );

  /**
   * Keyboard editing on the focused surface.
   *
   * ## Who owns which key
   *
   * The roll already had a keyboard model before this: a window-level handler where arrows **move the
   * selected notes**, Delete deletes the selection, and letters pick tools. That is real editing and
   * it stays — so this handler only *adds* the part that was missing (a cursor that can create a note
   * and a keyboard path to velocity) and defers to the window handler whenever a selection exists.
   * The cursor is therefore where a new note would land, not a second, competing selection: with
   * something selected the arrows move it (existing behaviour, unchanged), with nothing selected they
   * move the cursor, and the viewport follows it.
   *
   * `stopPropagation` is what makes the split work: this runs while the event bubbles through the
   * React root, so stopping it there keeps the window handler from acting on a key the cursor already
   * used. Keys the roll does not act on are left completely alone — including every ⌘/Ctrl
   * combination, and Tab, which must still leave the surface.
   */
  const handleGridKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!editable) return;
      const cursor = keyboardCursor ?? initialCursor();
      const intent = rollKeyboardIntent(
        event.key,
        { shift: event.shiftKey, meta: event.metaKey, ctrl: event.ctrlKey },
        cursor,
        keyboardBounds
      );
      if (!intent) return;

      const hasSelection = selection.length > 0;
      const hit = noteAt(cursor.stepIdx, cursor.midi);
      const take = () => {
        event.preventDefault();
        event.stopPropagation();
      };

      if (intent.kind === "move") {
        if (hasSelection) return; // the window handler moves the selection; leave the event to it
        take();
        setKeyboardCursor(intent.cursor);
        revealCursor(intent.cursor);
        announceRoll(describeCell(intent.cursor));
        return;
      }

      if (intent.kind === "velocity") {
        const ids = hasSelection ? selection : hit ? [noteId(hit)] : [];
        if (ids.length === 0) {
          take();
          announceRoll(t("roll_kb_no_note"));
          return;
        }
        take();
        // The velocity lane's own relative op, so a keyboard nudge and a lane drag are one edit and
        // clamp in one place; the announced number is read back from the result, never re-derived.
        const next = scaleNotesVelocity(pattern, activeTrackIdx, ids, intent.delta, stepCount);
        if (next !== pattern) commitDraft(next, ids);
        const velocity = noteAfter(next, ids[0])?.velocity ?? 0;
        announceRoll(
          ids.length > 1
            ? t("roll_kb_velocity_many", { count: ids.length, velocity })
            : t("roll_kb_velocity", { note: midiToNoteName(parseNoteId(ids[0]).midi), velocity })
        );
        return;
      }

      if (intent.kind === "length") {
        if (!hit) {
          take();
          announceRoll(t("roll_kb_no_note"));
          return;
        }
        take();
        // `resizeNote` owns the clamp (0.1 step .. one bar); the announcement reads back the result.
        const next = resizeNote(
          pattern,
          activeTrackIdx,
          cursor.stepIdx,
          hit.gate + intent.delta,
          stepCount
        );
        const id = noteId(hit);
        if (next !== pattern) commitDraft(next, [id]);
        announceRoll(
          t("roll_kb_length", {
            note: midiToNoteName(cursor.midi),
            steps: Number((noteAfter(next, id)?.gate ?? hit.gate).toFixed(2)),
          })
        );
        return;
      }

      if (intent.kind === "toggle" && !hit) {
        take();
        const baseGate = notesAtStep(cursor.stepIdx)[0]?.gate ?? KEYBOARD_DEFAULT_GATE;
        const next = addNote(
          pattern,
          activeTrackIdx,
          cursor.stepIdx,
          cursor.midi,
          stepCount,
          100,
          baseGate
        );
        if (next === pattern) return;
        const id = noteId({ stepIdx: cursor.stepIdx, midi: cursor.midi });
        setKeyboardCursor(cursor);
        commitDraft(next, [id]);
        lastAuditionPitchRef.current = cursor.midi;
        onAudition(activeTrackIdx, cursor.midi, 100, baseGate);
        announceRoll(t("roll_kb_added", { note: midiToNoteName(cursor.midi), step: cursor.stepIdx + 1 }));
        return;
      }

      // Removal: the note under the cursor. With none there, Delete still means "delete the
      // selection", which the window handler owns — so that case is not swallowed here.
      if (!hit) {
        if (!hasSelection) {
          take();
          announceRoll(t("roll_kb_no_note"));
        }
        return;
      }
      take();
      applyOp((p) => removeNoteAt(p, activeTrackIdx, cursor.stepIdx, cursor.midi, stepCount));
      setSelection((prev) => prev.filter((id) => id !== noteId(hit)));
      announceRoll(t("roll_kb_removed", { note: midiToNoteName(cursor.midi), step: cursor.stepIdx + 1 }));
    },
    [
      editable,
      keyboardCursor,
      initialCursor,
      keyboardBounds,
      describeCell,
      announceRoll,
      revealCursor,
      noteAfter,
      selection,
      noteAt,
      notesAtStep,
      pattern,
      activeTrackIdx,
      stepCount,
      commitDraft,
      onAudition,
      applyOp,
      t,
    ]
  );

  /**
   * Auditions the progression using **the same notes the stamp would write**.
   *
   * Two defects lived here. First, each chord member was passed to `onAudition` separately —
   * and the engine voices whatever single note a chords track is handed, so a four-note chord
   * came out as twelve voices in one register (measured 24 oscillators instead of 8). Second
   * the preview computed its own voicing (`triad`, octave 4, a hard-coded 450 ms spacing) while
   * the stamp divided the pattern evenly, so the preview was not the result.
   *
   * Now the voicing comes from `previewProgressionNotes` (shared with `applyChordProgression`)
   * and each chord is handed to the engine **once**, as a chord, for the chord's real duration.
   */
  const handleAuditionProgression = useCallback(() => {
    progressionAuditionTimersRef.current.forEach((id) => window.clearTimeout(id));
    progressionAuditionTimersRef.current = [];

    const prog = CHORD_PROGRESSIONS.find((p) => p.id === selectedProgressionId) || CHORD_PROGRESSIONS[0];
    const plan = previewProgressionNotes(view.scale, prog, stepCount, stepsPerBar, {
      chordStyle: "triad",
      baseOctave: 4,
    });
    // The step length is the engine's, not a guess: a preview that ignores tempo drifts away
    // from the bar it is previewing as soon as the user changes BPM.
    const secondsPerStep = (60 / (pattern.bpm || 120)) / 4;

    // One engine call per instance, for the instance's own gate — the same notes, onsets and
    // lengths the stamp writes, so the audition cannot promise a rhythm the stamp will not make.
    for (const instance of plan.instances) {
      if (instance.stepIdx >= plan.start + plan.cycleSteps) break;
      const chord = plan.chords[instance.chordIdx];
      if (!chord) continue;
      const chordSeconds = Math.max(0.12, secondsPerStep * instance.gate);
      const timer = window.setTimeout(() => {
        if (onPreviewChord) {
          onPreviewChord(activeTrackIdx, chord.chordNotes, 95, chordSeconds);
        } else {
          // Fallback for a host without the chord path: still one call per note, but the notes
          // are already the final voicing so the engine's own voicing is skipped.
          chord.chordNotes.forEach((midi) => onAudition(activeTrackIdx, midi, 95, 0.7));
        }
      }, (instance.stepIdx - plan.start) * secondsPerStep * 1000);
      progressionAuditionTimersRef.current.push(timer);
    }
  }, [activeTrackIdx, onAudition, onPreviewChord, pattern.bpm, selectedProgressionId, stepCount, stepsPerBar, view.scale]);

  /**
   * Applies the progression and reports the rhythm it was written at.
   *
   * The stamp adapts its harmonic rhythm to the pattern (one chord per bar when it fits, otherwise
   * half a bar, otherwise a beat) and repeats the progression to fill longer patterns. Reporting
   * that is the difference between "the app wrote something" and the user knowing why a two-chord
   * vamp now plays four times, or that the pattern is too short for all eight chords.
   */
  const handleApplyProgression = useCallback(() => {
    const prog = CHORD_PROGRESSIONS.find((p) => p.id === selectedProgressionId) || CHORD_PROGRESSIONS[0];
    applyOp((p) => applyChordProgression(p, activeTrackIdx, prog, stepCount, stepsPerBar));
    const plan = previewProgressionNotes(view.scale, prog, stepCount, stepsPerBar);
    const beatsPerChord = Math.max(1, Math.round(plan.stepsPerChord / plan.stepsPerBeat));
    const rhythm =
      plan.stepsPerChord >= stepsPerBar
        ? t("roll_progression_rhythm_bar")
        : t("roll_progression_rhythm_beats", { n: beatsPerChord });
    const parts = [`${t("roll_progression_applied", { name: isZh ? prog.name.zh : prog.name.en })} · ${rhythm}`];
    if (plan.cycles > 1) parts.push(t("roll_progression_repeat", { n: plan.cycles }));
    if (plan.truncated) {
      parts.push(
        t("roll_progression_truncated", { placed: plan.placedChords, total: plan.chords.length })
      );
    }
    setNotice(parts.join(" · "));
  }, [activeTrackIdx, applyOp, isZh, selectedProgressionId, stepsPerBar, stepCount, t, view.scale]);

  /**
   * Start/stop the isolated preview of this lane.
   *
   * `onStartPreview` reports whether the engine accepted the scope, so the button state follows
   * the engine rather than assuming it worked — a toggle that lights up while nothing plays is
   * exactly the class of lying UI this pass is meant to remove.
   */
  const handleTogglePreview = useCallback(() => {
    if (!onStartPreview || !onStopPreview) return;
    if (isPreviewing) {
      onStopPreview();
      return;
    }
    const fromStep = previewBars > 0 ? (previewBars - 1) * stepsPerBar : 0;
    const toStep = previewBars > 0 ? Math.min(stepCount, previewBars * stepsPerBar) : stepCount;
    if (!onStartPreview(activeTrackIdx, fromStep, toStep)) {
      setNotice(t("roll_preview_unavailable"));
    }
  }, [activeTrackIdx, isPreviewing, onStartPreview, onStopPreview, previewBars, stepCount, stepsPerBar, t]);

  /**
   * The preview must never outlive the surface that started it. Closing the roll unmounts this
   * component; the cleanup below is what stops the lane, so a user cannot end up with one track
   * looping with no visible way to stop it.
   */
  useEffect(() => {
    if (!onStopPreview) return;
    return () => onStopPreview();
  }, [onStopPreview]);

  useEffect(() => {
    return () => {
      progressionAuditionTimersRef.current.forEach((id) => window.clearTimeout(id));
      progressionAuditionTimersRef.current = [];
    };
  }, []);

  /**
   * Clears the keybed highlight, but never instantly.
   *
   * The highlight used to be set on `pointerdown` and cleared on the next `pointerup`, so an
   * ordinary click set it and unset it inside one frame: React batched both updates and the key
   * never visibly changed. The user's report was exactly that — "the virtual keyboard key visual
   * never changes when clicked" — and the sound still played, which makes it worse: the app
   * answers with audio and gives no visual acknowledgement at all.
   *
   * A short floor on how long the highlight stays is what makes a tap visible; `pressStartRef`
   * records when the press began so a *hold* still ends exactly when the finger lifts.
   */
  const KEYBED_MIN_HIGHLIGHT_MS = 160;
  const pressStartRef = useRef<number>(0);
  const clearHighlightTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const onGlobalPointerUp = () => {
      const elapsed = Date.now() - pressStartRef.current;
      const remaining = Math.max(0, KEYBED_MIN_HIGHLIGHT_MS - elapsed);
      if (clearHighlightTimerRef.current !== null) window.clearTimeout(clearHighlightTimerRef.current);
      clearHighlightTimerRef.current = window.setTimeout(() => {
        setActiveAuditionMidi(null);
        clearHighlightTimerRef.current = null;
      }, remaining);
    };
    window.addEventListener("pointerup", onGlobalPointerUp);
    return () => {
      window.removeEventListener("pointerup", onGlobalPointerUp);
      if (clearHighlightTimerRef.current !== null) window.clearTimeout(clearHighlightTimerRef.current);
    };
  }, []);


  const handleKeybedPointerDown = (midi: number, e: React.PointerEvent<HTMLDivElement>) => {
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    pressStartRef.current = Date.now();
    setActiveAuditionMidi(midi);
    onAudition(activeTrackIdx, midi, 100, 0.45);
    if (isRecording) {
      recordNote(midi, 100, 0.8);
    }
  };

  const handleKeybedPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons !== 1) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const keyEl = el?.closest("[data-midi-pitch]");
    if (keyEl) {
      const p = Number(keyEl.getAttribute("data-midi-pitch"));
      if (!isNaN(p) && p !== activeAuditionMidi) {
        setActiveAuditionMidi(p);
        onAudition(activeTrackIdx, p, 100, 0.45);
        if (isRecording) {
          recordNote(p, 100, 0.8);
        }
      }
    }
  };

  const handleKeybedPointerUp = () => {
    setActiveAuditionMidi(null);
  };

  const handleGridWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey) {
      // Ctrl / Cmd + Wheel: Horizontal zoom
      event.preventDefault();
      const delta = event.deltaY < 0 ? 2 : -2;
      setCustomStepWidth((w) => Math.max(8, Math.min(64, (w ?? Math.round(cellW)) + delta)));
      return;
    }

    if (event.altKey) {
      const { stepIdx, midi } = cellFromEvent(event as unknown as React.PointerEvent<HTMLElement>);
      const hit = (stepIdx >= 0 && stepIdx < stepCount && midi !== undefined) ? noteAt(stepIdx, midi) : null;
      const targetIds = hit
        ? (selectedSet.has(noteId(hit)) ? selection : [noteId(hit)])
        : selection.length > 0
        ? selection
        : null;

      if (editable && targetIds && targetIds.length > 0) {
        const delta = event.deltaY < 0 ? 5 : -5;
        applyOp((p) => scaleNotesVelocity(p, activeTrackIdx, targetIds, delta, stepCount));

        const sampleNote = notes.find((n) => targetIds.includes(noteId(n)));
        if (sampleNote) {
          const newVel = Math.max(1, Math.min(127, Math.round(sampleNote.velocity + delta)));
          setNotice(t("roll_vel_nudge", { vel: newVel }));
          onAudition(activeTrackIdx, sampleNote.midi, newVel, 0.25);
        }
      } else {
        // Empty space: Vertical zoom
        event.preventDefault();
        const delta = event.deltaY < 0 ? 2 : -2;
        setRowHeight((h) => Math.max(12, Math.min(48, h + delta)));
      }
      return;
    }

    if (event.shiftKey) {
      if (scrollRef.current) {
        scrollRef.current.scrollLeft += event.deltaY;
      }
      return;
    }
  };

  /* ------------------------------------------------------------------ grid gestures */

  const handleGridPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!editable) return;
    const { stepIdx, midi } = cellFromEvent(event);
    if (stepIdx < 0 || stepIdx >= stepCount || midi === undefined) return;
    const hit = noteAt(stepIdx, midi);
    const additive = event.metaKey || event.ctrlKey || event.shiftKey;

    if (hit && event.detail === 2) {
      applyOp((p) => removeNoteAt(p, activeTrackIdx, hit.stepIdx, hit.midi, stepCount));
      setSelection((prev) => prev.filter((id) => id !== noteId(hit)));
      return;
    }

    if (tool === "eraser") {
      // The eraser removes the tone under the cursor, so a chord can be thinned one note at a
      // time; ⌥-click clears the whole step.
      if (hit) {
        applyOp((p) =>
          event.altKey
            ? removeNote(p, activeTrackIdx, stepIdx, stepCount)
            : removeNoteAt(p, activeTrackIdx, stepIdx, midi, stepCount)
        );
      }
      return;
    }
    if (tool === "scissors") {
      if (!notesAtStep(stepIdx).length) return;
      const result = splitNote(pattern, activeTrackIdx, stepIdx, stepCount);
      if (result.split) commitDraft(result.pattern);
      else setNotice(t("roll_split_failed"));
      return;
    }
    if (tool === "pencil") {
      if (hit) {
        // Already sounding at this pitch: select it rather than stacking a duplicate.
        setSelection(additive ? [...selection, noteId(hit)] : [noteId(hit)]);
        lastAuditionPitchRef.current = hit.midi;
        onAudition(activeTrackIdx, hit.midi, hit.velocity, hit.gate);
        return;
      }
      const baseGate = notesAtStep(stepIdx)[0]?.gate ?? 0.8;
      const next =
        chordStamp !== "note"
          ? addChord(pattern, activeTrackIdx, stepIdx, midi, stepCount, chordStamp, 100, baseGate)
          : addNote(pattern, activeTrackIdx, stepIdx, midi, stepCount, 100, baseGate);
      if (next === pattern) return;
      const id = noteId({ stepIdx, midi });
      commitDraft(next, additive ? [...selection, id] : [id]);
      lastAuditionPitchRef.current = midi;
      onAudition(activeTrackIdx, midi, 100, baseGate);
      dragRef.current = { mode: "paint", base: next, painted: [id] };
      event.currentTarget.setPointerCapture?.(event.pointerId);
      return;
    }
    if (tool === "marquee" || (!hit && tool === "pointer")) {
      if (tool === "pointer" && event.detail === 2) {
        const baseGate = notesAtStep(stepIdx)[0]?.gate ?? 0.8;
        const next = addNote(pattern, activeTrackIdx, stepIdx, midi, stepCount, 100, baseGate);
        if (next !== pattern) {
          const id = noteId({ stepIdx, midi });
          commitDraft(next, [id]);
          lastAuditionPitchRef.current = midi;
          onAudition(activeTrackIdx, midi, 100, baseGate);
        }
        return;
      }
      // Dragging from empty space selects a region — the pointer tool does this in Logic too.
      dragRef.current = { mode: "marquee", startStep: stepIdx, startMidi: midi };
      setMarquee({ stepFrom: stepIdx, stepTo: stepIdx, pitchFrom: midi, pitchTo: midi });
      return;
    }

    if (!hit) return;
    const hitId = noteId(hit);
    const origin = additive
      ? selection.includes(hitId)
        ? selection.filter((s) => s !== hitId)
        : [...selection, hitId]
      : selectedSet.has(hitId)
        ? selection
        : [hitId];
    setSelection(origin);
    lastAuditionPitchRef.current = hit.midi;
    onAudition(activeTrackIdx, hit.midi, hit.velocity, hit.gate);
    dragRef.current = { mode: "move", startStep: stepIdx, startMidi: midi, origin, base: pattern, copied: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleGridPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) {
      if (editable) {
        const { stepIdx, midi } = cellFromEvent(event);
        if (stepIdx >= 0 && stepIdx < stepCount && midi !== undefined) {
          setHoverCell({ stepIdx, midi });
        } else {
          setHoverCell(null);
        }
      }
      return;
    }
    if (!editable) return;
    const { stepIdx, midi } = cellFromEvent(event);
    if (midi === undefined) return;

    if (drag.mode === "marquee") {
      setMarquee({ stepFrom: drag.startStep, stepTo: stepIdx, pitchFrom: drag.startMidi, pitchTo: midi });
      return;
    }
    if (drag.mode === "paint") {
      if (stepIdx < 0 || stepIdx >= stepCount) return;
      const current = draft ?? drag.base;
      // Painting never overwrites: a cell that already sounds (at this pitch or any) is skipped, so
      // a stroke across a chord cannot erase it.
      const currentNotes = notesFromTrack(current.tracks[activeTrackIdx], 60, current.scale);
      const id = noteId({ stepIdx, midi });
      if (currentNotes.some((n) => noteId(n) === id)) return;
      const next = addNote(current, activeTrackIdx, stepIdx, midi, stepCount, 100, currentNotes.find((n) => n.stepIdx === stepIdx)?.gate);
      if (next === current) return;
      drag.painted.push(id);
      setDraft(next);
      onAudition(activeTrackIdx, midi, 100, 0.8);
      return;
    }
    if (drag.mode === "move") {
      const deltaSteps = stepIdx - drag.startStep;
      const deltaPitch = midi - drag.startMidi;
      if (deltaSteps === 0 && deltaPitch === 0) return;
      if (event.altKey && !drag.copied) {
        // ⌥-drag copies: duplicate once, then keep dragging the copies.
        const copied = copyNotes(drag.base, activeTrackIdx, drag.origin, deltaSteps, stepCount);
        drag.copied = true;
        drag.base = copied.pattern;
        drag.origin = copied.selection;
        drag.startStep = stepIdx;
        drag.startMidi = midi;
        setDraft(copied.pattern);
        setSelection(copied.selection);
        return;
      }
      const moved = moveNotes(drag.base, activeTrackIdx, drag.origin, deltaSteps, deltaPitch, stepCount);
      if (moved.pattern === drag.base) return;
      setDraft(moved.pattern);
      setSelection(moved.selection);
      drag.base = moved.pattern;
      drag.origin = moved.selection;
      drag.startStep = stepIdx;
      drag.startMidi = midi;
      if (deltaPitch !== 0 && midi !== lastAuditionPitchRef.current) {
        lastAuditionPitchRef.current = midi;
        onAudition(activeTrackIdx, midi, 100, 0.25);
      }
      return;
    }
    if (drag.mode === "velocity") {
      const delta = (drag.startY - event.clientY) * VELOCITY_PER_PX;
      setDraft(scaleNotesVelocity(drag.base, activeTrackIdx, drag.steps, delta, stepCount));
      return;
    }
    if (drag.mode === "resize") {
      const deltaSteps = (event.clientX - drag.startX) / cellW;
      const gate = Math.max(0.1, Math.min(MAX_NOTE_GATE_STEPS, drag.startGate + deltaSteps));
      drag.currentGate = gate;
      setResizeGatePreview({ stepIdx: drag.stepIdx, midi: drag.midi, gate });
      setDraft(resizeNote(drag.base, activeTrackIdx, drag.stepIdx, gate, stepCount));
    }
  };

  const handleGridPointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    setResizeGatePreview(null);
    if (drag?.mode === "marquee") {
      const isSingleClick = marquee && marquee.stepFrom === marquee.stepTo && marquee.pitchFrom === marquee.pitchTo;
      if (isSingleClick && tool === "pointer") {
        const stepIdx = marquee.stepFrom;
        const midi = marquee.pitchFrom;
        const hit = noteAt(stepIdx, midi);
        if (!hit) {
          const baseGate = notesAtStep(stepIdx)[0]?.gate ?? 0.8;
          const next =
            chordStamp !== "note"
              ? addChord(pattern, activeTrackIdx, stepIdx, midi, stepCount, chordStamp, 100, baseGate)
              : addNote(pattern, activeTrackIdx, stepIdx, midi, stepCount, 100, baseGate);
          if (next !== pattern) {
            const id = noteId({ stepIdx, midi });
            commitDraft(next, [id]);
            lastAuditionPitchRef.current = midi;
            onAudition(activeTrackIdx, midi, 100, baseGate);
          }
        }
      } else if (marquee) {
        setSelection(notesInRect(notes, marquee));
      }
      setMarquee(null);
      return;
    }
    if (draft) {
      const landedSelection = drag?.mode === "move" ? drag.origin : selection;
      commit({ type: "COMMIT_PATTERN", pattern: draft });
      setDraft(null);
      const landed = notesFromTrack(draft.tracks[activeTrackIdx], 60, draft.scale).find((n) => landedSelection.includes(noteId(n)));
      if (landed) onAudition(activeTrackIdx, landed.midi, landed.velocity, landed.gate);
    }
  };

  /* ------------------------------------------------------------------ velocity lane */

  const handleVelocityPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!editable) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const stepIdx = Math.floor((event.clientX - rect.left) / cellW);
    const onStep = notesAtStep(stepIdx);
    if (onStep.length === 0) return;
    // Velocity belongs to the step (the model has one value per step), so the lane has one bar per
    // sounding step even when that step holds a chord.
    const stepIds = onStep.map(noteId);
    const insideSelection = stepIds.every((id) => selectedSet.has(id));
    const ids = insideSelection ? selection : stepIds;
    if (!insideSelection) setSelection(stepIds);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { mode: "velocity", startY: event.clientY, steps: ids, base: pattern };
    const value = Math.max(1, Math.min(127, Math.round(((rect.bottom - event.clientY) / rect.height) * 127)));
    setDraft(scaleNotesVelocity(pattern, activeTrackIdx, ids, value - onStep[0].velocity, stepCount));
  };

  /* ------------------------------------------------------------------ keyboard */

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;

      if (event.key === "Escape") {
        if (marquee) {
          setMarquee(null);
          return;
        }
        if (isFullscreen) setIsFullscreen(false);
        else onClose();
        return;
      }
      if (event.key === "p" || event.key === "P") {
        setTool("pointer");
        return;
      }
      if (event.key === "b" || event.key === "B") {
        setTool("pencil");
        return;
      }
      if (event.key >= "1" && event.key <= "5") {
        const next = TOOLS[Number(event.key) - 1];
        if (next) setTool(next.id);
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (selection.length === 0) return;
        event.preventDefault();
        const removed = selection.length;
        applyOp((p) => deleteNotes(p, activeTrackIdx, selection, stepCount));
        setSelection([]);
        // U10: the same edit said out loud — a screen reader has no way to see the notes go.
        announceRoll(t("roll_kb_removed_many", { count: removed }));
        return;
      }
      if (event.key === "a" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setSelection(notes.map(noteId));
        return;
      }
      if ((event.metaKey || event.ctrlKey) && (event.key === "n" || event.key === "N")) {
        event.preventDefault();
        handleNewPattern();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && (event.key === "s" || event.key === "S")) {
        event.preventDefault();
        handleExportClipJson();
        return;
      }
      if (isRecording) {
        const QWERTY_KEYS: Record<string, number> = {
          a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, ";": 16,
        };
        const k = event.key.toLowerCase();
        if (k in QWERTY_KEYS) {
          event.preventDefault();
          const midi = 60 + octaveShift + QWERTY_KEYS[k];
          onAudition(activeTrackIdx, midi, 100, 0.4);
          recordNote(midi, 100, 0.8);
          return;
        }
      }
      if (event.key.startsWith("Arrow")) {
        if (selection.length > 0) {
          const stepDelta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
          const pitchDelta = event.key === "ArrowUp" ? 1 : event.key === "ArrowDown" ? -1 : 0;
          if (stepDelta === 0 && pitchDelta === 0) return;
          event.preventDefault();
          const moved = moveNotes(pattern, activeTrackIdx, selection, stepDelta, pitchDelta, stepCount);
          if (moved.pattern !== pattern) {
            commitDraft(moved.pattern, moved.selection);
            // U10: say where it went. Without this the arrow keys edit notes silently.
            const first = moved.selection[0] ? parseNoteId(moved.selection[0]) : null;
            if (first) {
              announceRoll(
                t("roll_kb_moved", { note: midiToNoteName(first.midi), step: first.stepIdx + 1 })
              );
            }
          }
        } else {
          if (event.key === "ArrowUp") {
            event.preventDefault();
            const amount = event.shiftKey ? 12 * rowH : rowH;
            if (scrollRef.current) scrollRef.current.scrollTop = Math.max(0, scrollRef.current.scrollTop - amount);
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            const amount = event.shiftKey ? 12 * rowH : rowH;
            if (scrollRef.current) scrollRef.current.scrollTop += amount;
          } else if (event.key === "ArrowLeft") {
            event.preventDefault();
            const amount = event.shiftKey ? 4 * cellW : cellW;
            if (scrollRef.current) scrollRef.current.scrollLeft = Math.max(0, scrollRef.current.scrollLeft - amount);
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            const amount = event.shiftKey ? 4 * cellW : cellW;
            if (scrollRef.current) scrollRef.current.scrollLeft += amount;
          }
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, selection, notes, pattern, activeTrackIdx, stepCount, isFullscreen, marquee, commitDraft, isRecording, octaveShift, recordNote, onAudition, handleNewPattern, handleExportClipJson, announceRoll, t]);

  /* ------------------------------------------------------------------ render */

  const selectedNotes: RollStepNote[] = notes.filter((n) => selectedSet.has(noteId(n)));
  const focusNote = selectedNotes[0] ?? null;
  const ctrlClass =
    "flex h-7 items-center gap-1.5 rounded-lg border border-[#2b3040] bg-gradient-to-b from-[#1b1f2b] to-[#12151e] px-2 font-['JetBrains_Mono'] text-[10px] font-semibold text-[#cbd1de] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_1px_2px_rgba(0,0,0,0.4)] transition-all duration-100 hover:border-accent/50 hover:text-white hover:shadow-[0_0_8px_rgba(var(--accent-rgb),0.3)] active:translate-y-[1px]";

  return (
    <section
      ref={sectionRef}
      data-testid="piano-roll"
      data-fullscreen={isFullscreen ? "true" : "false"}
      data-collapsed={isCollapsed ? "true" : "false"}
      data-folded={isFolded ? "true" : "false"}
      data-tool={tool}
      // Grid metrics as data attributes: gestures in tests (and diagnostics anywhere) read the
      // geometry from the product instead of hard-coding it.
      data-steps={stepCount}
      data-rows={rows.length}
      data-cell-w={Math.round(cellW * 100) / 100}
      data-row-h={rowH}
      aria-label={`${t("roll_title")} ${track?.name ?? ""}`}
      className={
        isFullscreen
          ? "fixed inset-0 z-[60] flex flex-col gap-2.5 overflow-y-auto bg-gradient-to-b from-[#12141c] via-[#0d0f16] to-[#08090e] p-3 sm:p-5 shadow-2xl backdrop-blur-2xl ring-1 ring-white/[0.08]"
          : "flex w-full flex-col gap-2 rounded-2xl border border-[#242838] bg-gradient-to-b from-[#121520] via-[#0d0f17] to-[#0a0b11] p-3 sm:p-3.5 shadow-[0_12px_40px_rgba(0,0,0,0.65)] backdrop-blur-xl ring-1 ring-white/[0.05]"
      }
      style={
        isFullscreen
          ? {
              paddingTop: "max(0.75rem, calc(env(safe-area-inset-top, 0px) + 0.5rem))",
              paddingBottom: "max(0.75rem, calc(env(safe-area-inset-bottom, 0px) + 0.5rem))",
            }
          : undefined
      }
    >
      {/* ---------------------------------------------------------------- modular 2-deck command header */}
      <header className="flex flex-col gap-2 border-b border-[#242938] pb-2.5">
        {/* Deck 1: Track Context, Primary Tool Palette & Essential View Toggles */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Left: Track & Musical Tonality Hub */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-lg border border-[#2d3345] bg-gradient-to-b from-[#181c28] to-[#12151f] px-2 py-1 shadow-inner">
              <Music2 className="h-3.5 w-3.5 text-accent animate-pulse" />
              <span className="font-['JetBrains_Mono'] text-[10px] font-bold uppercase tracking-[0.1em] text-white">
                {t("roll_title")}
              </span>
            </div>

            <select
              value={activeTrackIdx}
              onChange={(e) => {
                setSelection([]);
                setDraft(null);
                onSelectTrack(Number(e.target.value));
              }}
              aria-label={t("roll_track")}
              data-testid="piano-roll-track"
              className="h-7 rounded-lg border border-[#2e3447] bg-gradient-to-b from-[#191d29] to-[#12151f] px-2.5 font-['JetBrains_Mono'] text-[11px] font-bold text-white shadow-inner outline-none transition-colors hover:border-accent/50 focus:border-accent"
            >
              {selectableTracks.map(({ tr, idx }) => (
                <option key={`${tr.track_id}-${idx}`} value={idx} className="bg-[#12151f] text-white">
                  {tr.name}
                </option>
              ))}
            </select>

            {/* Interactive Tonality / Scale Selector */}
            <div className="hidden md:flex items-center gap-1.5">
              <select
                value={view.scale || "C major"}
                onChange={(e) => {
                  commit({ type: "SET_SCALE", scale: e.target.value });
                  setNotice(t("roll_scale_changed", { scale: e.target.value }));
                }}
                title={t("roll_scale_select_title")}
                data-testid="piano-roll-scale-select"
                className="h-7 rounded-lg border border-accent/40 bg-gradient-to-b from-[#1c2235] to-[#121624] px-2 font-['JetBrains_Mono'] text-[10px] font-bold text-accent shadow-sm outline-none transition-all hover:border-accent cursor-pointer"
              >
                {AVAILABLE_SCALES.map((s) => (
                  <option key={s} value={s} className="bg-[#12151f] text-white">
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {/* Note count chip */}
            <span className="hidden sm:inline-block font-['JetBrains_Mono'] text-[9px] text-text-dim px-1.5 py-0.5 rounded bg-white/5 border border-white/10">
              {notes.length} notes
            </span>
          </div>

          {/* Center: Primary DAW Tool Palette */}
          <div
            role="group"
            aria-label={t("roll_tools")}
            className="flex items-center gap-1 rounded-xl border border-[#2b3142] bg-[#141723]/90 p-1 shadow-[inset_0_1px_3px_rgba(0,0,0,0.7)]"
          >
            {TOOLS.map((entry, index) => {
              const isActive = tool === entry.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setTool(entry.id)}
                  aria-pressed={isActive}
                  data-testid={`piano-roll-tool-${entry.id}`}
                  title={`${t(entry.labelKey)} (${index + 1})`}
                  aria-label={t(entry.labelKey)}
                  className={`relative flex items-center gap-1 rounded-lg px-2 py-1 font-['JetBrains_Mono'] text-[10px] font-bold transition-all duration-100 select-none ${
                    isActive
                      ? "bg-gradient-to-b from-accent to-accent-hover text-white shadow-[0_0_12px_rgba(var(--accent-rgb),0.6),inset_0_1px_0_rgba(255,255,255,0.4)] scale-[1.02]"
                      : "text-text-sub hover:text-white hover:bg-white/[0.06]"
                  }`}
                >
                  {entry.icon}
                  <span className={`text-[8.5px] opacity-60 ml-0.5 ${isActive ? "text-white/90" : "text-text-dim"}`}>
                    {entry.keyHint}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Right: Window Controls & Utility Toggles */}
          <div className="flex items-center gap-1 ml-auto">
            <button
              type="button"
              onClick={() => setShowVelocityLane((v) => !v)}
              aria-pressed={showVelocityLane}
              data-testid="piano-roll-velocity-toggle"
              title={t("roll_velocity_lane")}
              className={`${ctrlClass} ${showVelocityLane ? "border-accent text-accent shadow-[0_0_8px_rgba(var(--accent-rgb),0.3)]" : ""}`}
            >
              <Volume2 className="h-3 w-3" />
              <span>{t("roll_velocity_lane")}</span>
            </button>
            <button
              type="button"
              onClick={() => setCatchPlayhead((v) => !v)}
              aria-pressed={catchPlayhead}
              data-testid="piano-roll-catch"
              title={t("roll_catch_hint")}
              className={`${ctrlClass} ${catchPlayhead ? "border-accent text-accent shadow-[0_0_8px_rgba(var(--accent-rgb),0.3)]" : ""}`}
            >
              <Radio className="h-3 w-3" />
              <span>{t("roll_catch")}</span>
            </button>
            {onToggleMusicalTyping && (
              <button
                type="button"
                onClick={onToggleMusicalTyping}
                title={isZh ? "打开 Musical Typing 电脑键盘演奏 (⌥K)" : "Open Musical Typing computer keyboard HUD (⌥K)"}
                aria-label={isZh ? "电脑键盘演奏" : "Musical Typing"}
                data-testid="piano-roll-musical-typing"
                className="flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/15 px-2 py-1 font-['JetBrains_Mono'] text-[10px] font-bold text-accent transition-all duration-150 hover:bg-accent/25 hover:border-accent hover:shadow-[0_0_10px_rgba(var(--accent-rgb),0.3)] select-none"
              >
                <Keyboard className="h-3 w-3" />
                <span className="hidden sm:inline">{isZh ? "虚拟键盘" : "Keys"}</span>
                <kbd className="rounded bg-black/40 px-1 py-0.2 text-[8.5px] border border-accent/20 text-accent font-semibold">
                  ⌥K
                </kbd>
              </button>
            )}
            {onOpenHelp && (
              <button

                type="button"
                onClick={() => onOpenHelp("sequencer")}
                data-testid="piano-roll-guide"
                title={t("roll_tutorial_hint")}
                aria-label={t("roll_tutorial_btn")}
                className="flex items-center gap-1 rounded-md border border-[#2b3040] bg-[#1a1e2b] px-2 py-1 text-[10px] font-bold text-accent hover:border-accent hover:bg-accent/15 transition-all shadow-[0_0_6px_rgba(var(--accent-rgb),0.2)]"
              >
                <BookOpen className="h-3 w-3 text-accent" />
                <span className="hidden sm:inline">{t("roll_tutorial_btn")}</span>
              </button>
            )}

            {/* DAW Clip Operations: New, Export, Record */}
            <div className="flex items-center gap-1">
              {/* New Clip */}
              <button
                type="button"
                onClick={handleNewPattern}
                data-testid="piano-roll-new-btn"
                title={t("roll_new_clip_title")}
                aria-label={t("roll_new_clip")}
                className={ctrlClass}
              >
                <FilePlus className="h-3.5 w-3.5 text-accent" />
                <span className="hidden sm:inline">{t("roll_new_clip")}</span>
              </button>

              {/* Export Clip / Save Dropdown */}
              <div className="relative" ref={exportMenuRef}>
                <button
                  type="button"
                  onClick={() => setShowExportMenu((v) => !v)}
                  data-testid="piano-roll-export-btn"
                  title={t("roll_export_clip_title")}
                  aria-label={t("roll_export_clip")}
                  className={`${ctrlClass} ${showExportMenu ? "border-accent text-accent" : ""}`}
                >
                  <Download className="h-3.5 w-3.5 text-accent" />
                  <span className="hidden sm:inline">{t("roll_export_clip")}</span>
                  <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
                </button>
                {showExportMenu && (
                  <div className="absolute right-0 top-full mt-1.5 z-50 w-44 rounded-xl border border-[#2c3246] bg-[#141724] p-1.5 shadow-2xl flex flex-col gap-1">
                    <button
                      type="button"
                      data-testid="piano-roll-export-json"
                      onClick={handleExportClipJson}
                      className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-['JetBrains_Mono'] text-[11px] text-text hover:bg-accent/15 hover:text-accent transition-colors"
                    >
                      <Save className="h-3.5 w-3.5 text-accent" />
                      <span>{t("roll_export_json")}</span>
                    </button>
                    <button
                      type="button"
                      data-testid="piano-roll-export-midi"
                      onClick={handleExportClipMidi}
                      className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-['JetBrains_Mono'] text-[11px] text-text hover:bg-accent/15 hover:text-accent transition-colors"
                    >
                      <Download className="h-3.5 w-3.5 text-accent" />
                      <span>{t("roll_export_midi")}</span>
                    </button>
                    <button
                      type="button"
                      data-testid="piano-roll-copy-json"
                      onClick={handleExportClipJson}
                      className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-['JetBrains_Mono'] text-[11px] text-text hover:bg-accent/15 hover:text-accent transition-colors border-t border-[#242938] mt-0.5 pt-1.5"
                    >
                      <Copy className="h-3.5 w-3.5 text-text-sub" />
                      <span>{t("roll_copy_json")}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Realtime Recording Button */}
              <button
                type="button"
                onClick={() => setIsRecording((v) => !v)}
                aria-pressed={isRecording}
                data-testid="piano-roll-record-btn"
                title={t("roll_record_title")}
                aria-label={t("roll_record")}
                className={`${ctrlClass} ${
                  isRecording
                    ? "bg-red-500/25 border-red-500 text-red-400 font-bold shadow-[0_0_12px_rgba(239,68,68,0.5)] animate-pulse"
                    : "hover:text-red-400 hover:border-red-500/40"
                }`}
              >
                <Circle className={`h-3 w-3 ${isRecording ? "fill-red-500 text-red-500" : "text-red-400"}`} />
                <span className="hidden sm:inline">{isRecording ? t("roll_recording_active") : t("roll_record")}</span>
              </button>
            </div>

            <div className="h-4 w-[1px] bg-line-subtle mx-0.5" />
            <button

              type="button"
              onClick={() => setIsCollapsed((v) => !v)}
              aria-pressed={isCollapsed}
              data-testid="piano-roll-collapse"
              title={isCollapsed ? t("roll_expand") : t("roll_collapse")}
              aria-label={isCollapsed ? t("roll_expand") : t("roll_collapse")}
              className={ctrlClass}
            >
              {isCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => setIsFullscreen((v) => !v)}
              aria-pressed={isFullscreen}
              data-testid="piano-roll-fullscreen"
              title={isFullscreen ? t("roll_exit_fullscreen") : t("roll_fullscreen")}
              aria-label={isFullscreen ? t("roll_exit_fullscreen") : t("roll_fullscreen")}
              className={ctrlClass}
            >
              {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              data-testid="piano-roll-close"
              aria-label={t("roll_close")}
              title={t("roll_close")}
              className={`${ctrlClass} hover:border-red-500/50 hover:text-red-400`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Deck 2: Timing, Harmony & Voicing Suite, Pitch Transposition & Density */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
          {/* Left Deck 2: Snap, Quantize & Legato */}
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex items-center gap-1 rounded-lg border border-[#282d3e] bg-[#131622]/80 px-2 py-0.5">
              <label className="flex items-center gap-1 font-['JetBrains_Mono'] text-[9px] uppercase tracking-[0.08em] text-text-dim">
                {t("roll_snap")}
                <select
                  value={snap}
                  onChange={(e) => setSnap(e.target.value as RollSnap)}
                  aria-label={t("roll_snap")}
                  data-testid="piano-roll-snap"
                  className="rounded border border-[#2b3040] bg-[#1a1e2b] px-1 py-0.5 text-[10px] font-bold text-white outline-none hover:border-accent/40"
                >
                  {SNAPS.map((value) => (
                    <option key={value} value={value} className="bg-[#12151f]">
                      {value === "off" ? t("roll_snap_off") : value}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={() =>
                  applyOp((p) =>
                    quantizeLengths(p, activeTrackIdx, selection.length ? selection : notes.map(noteId), snap, stepCount)
                  )
                }
                disabled={notes.length === 0}
                data-testid="piano-roll-quantize-lengths"
                title={t("roll_quantize_lengths_hint")}
                className={`${ctrlClass} disabled:opacity-35`}
              >
                {t("roll_quantize_lengths")}
              </button>
              <button
                type="button"
                onClick={() =>
                  applyOp((p) =>
                    legatoNotes(p, activeTrackIdx, selection.length ? selection : notes.map(noteId), stepCount, loopLen)
                  )
                }
                disabled={notes.length === 0}
                data-testid="piano-roll-legato"
                title={t("roll_legato_hint")}
                className={`${ctrlClass} disabled:opacity-35`}
              >
                {t("roll_legato")}
              </button>
              <button
                type="button"
                onClick={() => setIsFolded((v) => !v)}
                aria-pressed={isFolded}
                data-testid="piano-roll-fold"
                title={isFolded ? t("roll_unfold_hint") : t("roll_fold_hint")}
                className={`${ctrlClass} ${
                  isFolded
                    ? "bg-accent/20 border-accent text-accent shadow-[0_0_8px_rgba(var(--accent-rgb),0.3)] font-bold"
                    : ""
                }`}
              >
                <Filter className="h-3 w-3" />
                <span>{t("roll_fold")}</span>
              </button>
              <button
                type="button"
                onClick={() => setFullPitchRange((v) => !v)}
                aria-pressed={fullPitchRange}
                data-testid="piano-roll-full-range-toggle"
                title={fullPitchRange ? (isZh ? "切换为内容自适应音域" : "Switch to Content Fit Range") : (isZh ? "展开 0-127 全音区" : "Expand to 0-127 Full Pitch Range")}
                aria-label={fullPitchRange ? (isZh ? "自适应音域" : "Fit Range") : (isZh ? "全音区" : "Full 128")}
                className={`${ctrlClass} ${
                  fullPitchRange
                    ? "bg-accent/20 border-accent text-accent shadow-[0_0_8px_rgba(var(--accent-rgb),0.3)] font-bold"
                    : ""
                }`}
              >
                <Layers className="h-3 w-3" />
                <span>{fullPitchRange ? (isZh ? "自适应" : "Fit") : (isZh ? "全音区" : "Full 128")}</span>
              </button>
            </div>

            {/* Chord Palette & Voicing Suite */}
            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-[#282d3e] bg-[#131622]/80 px-2 py-0.5">
              <label className="flex items-center gap-1 font-['JetBrains_Mono'] text-[9px] uppercase tracking-[0.08em] text-text-dim">
                <Layers className="h-3 w-3 text-accent" />
                {t("roll_chord_stamp")}
                <select
                  value={chordStamp}
                  onChange={(e) => setChordStamp(e.target.value as ChordStampType)}
                  data-testid="piano-roll-chord-stamp"
                  className="rounded border border-[#2b3040] bg-[#1a1e2b] px-1.5 py-0.5 text-[10px] font-bold text-white outline-none hover:border-accent/40"
                >
                  <option value="note" className="bg-[#12151f]">{t("roll_chord_note")}</option>
                  <option value="triad" className="bg-[#12151f]">{t("roll_chord_triad")}</option>
                  <option value="seventh" className="bg-[#12151f]">{t("roll_chord_seventh")}</option>
                  <option value="ninth" className="bg-[#12151f]">{t("roll_chord_ninth")}</option>
                  <option value="sus4" className="bg-[#12151f]">{t("roll_chord_sus4")}</option>
                  <option value="power" className="bg-[#12151f]">{t("roll_chord_power")}</option>
                </select>
              </label>

              <button
                type="button"
                onClick={() => applyOp((p) => invertSelectedChord(p, activeTrackIdx, selection, "up", stepCount))}
                disabled={selection.length === 0}
                title="Invert chord up"
                data-testid="piano-roll-invert-up"
                className={`${ctrlClass} disabled:opacity-35`}
              >
                {t("roll_invert_up")}
              </button>
              <button
                type="button"
                onClick={() => applyOp((p) => invertSelectedChord(p, activeTrackIdx, selection, "down", stepCount))}
                disabled={selection.length === 0}
                title="Invert chord down"
                data-testid="piano-roll-invert-down"
                className={`${ctrlClass} disabled:opacity-35`}
              >
                {t("roll_invert_down")}
              </button>
              <button
                type="button"
                onClick={() => applyOp((p) => drop2SelectedChord(p, activeTrackIdx, selection, stepCount))}
                disabled={selection.length === 0}
                title="Drop-2 Voicing"
                data-testid="piano-roll-drop2"
                className={`${ctrlClass} disabled:opacity-35`}
              >
                {t("roll_drop2")}
              </button>
              <button
                type="button"
                onClick={() => {
                  const res = arpeggiateSelectedNotes(pattern, activeTrackIdx, selection, "up", stepCount);
                  commitDraft(res.pattern, res.nextSelection);
                }}
                disabled={selection.length === 0}
                title={t("roll_arp_up_hint")}
                data-testid="piano-roll-arp-up"
                className={`${ctrlClass} disabled:opacity-35`}
              >
                {t("roll_arp_up")}
              </button>
              <button
                type="button"
                onClick={() => {
                  const res = arpeggiateSelectedNotes(pattern, activeTrackIdx, selection, "down", stepCount);
                  commitDraft(res.pattern, res.nextSelection);
                }}
                disabled={selection.length === 0}
                title={t("roll_arp_down_hint")}
                data-testid="piano-roll-arp-down"
                className={`${ctrlClass} disabled:opacity-35`}
              >
                {t("roll_arp_down")}
              </button>
              <button
                type="button"
                onClick={() => applyOp((p) => humanizeSelectedNotes(p, activeTrackIdx, selection, stepCount))}
                disabled={notes.length === 0}
                title="Humanize notes"
                data-testid="piano-roll-humanize"
                className={`${ctrlClass} disabled:opacity-35`}
              >
                <Sparkles className="h-3 w-3 text-amber-400" />
                {t("roll_humanize")}
              </button>
              {barCount > 1 && (
                <button
                  type="button"
                  onClick={() => applyOp((p) => duplicateBar1Notes(p, activeTrackIdx, stepsPerBar, stepCount))}
                  disabled={notes.length === 0}
                  title={t("roll_dup_bar1_hint")}
                  data-testid="piano-roll-dup-bar1"
                  className={`${ctrlClass} disabled:opacity-35`}
                >
                  <Copy className="h-3 w-3 text-accent" />
                  {t("roll_dup_bar1")}
                </button>
              )}
            </div>

            {/* Chord Progression Suite */}
            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-[#282d3e] bg-[#131622]/80 px-2 py-0.5" data-testid="piano-roll-progression-suite">
              <label className="flex items-center gap-1 font-['JetBrains_Mono'] text-[9px] uppercase tracking-[0.08em] text-accent font-bold">
                <Wand2 className="h-3 w-3 text-accent" />
                {t("roll_progression_title")}
                <select
                  value={selectedProgressionId}
                  onChange={(e) => setSelectedProgressionId(e.target.value)}
                  data-testid="piano-roll-progression-select"
                  aria-label={t("roll_progression_title")}
                  className="rounded border border-[#2b3040] bg-[#1a1e2b] px-1.5 py-0.5 text-[10px] font-bold text-white outline-none hover:border-accent/40"
                >
                  {CHORD_PROGRESSIONS.map((prog) => (
                    <option key={prog.id} value={prog.id} className="bg-[#12151f]">
                      {isZh ? prog.name.zh : prog.name.en} ({prog.romanNumerals})
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={handleAuditionProgression}
                title={t("roll_progression_audition")}
                data-testid="piano-roll-progression-audition"
                className={`${ctrlClass} text-accent hover:bg-accent/20`}
              >
                <Volume2 className="h-3 w-3 text-accent" />
                <span className="hidden sm:inline">{t("roll_progression_audition")}</span>
              </button>

              <button
                type="button"
                onClick={handleApplyProgression}
                title={t("roll_progression_stamp")}
                data-testid="piano-roll-progression-apply"
                className={`${ctrlClass} bg-accent/20 border-accent/60 text-accent font-bold hover:bg-accent/30 shadow-[0_0_8px_rgba(var(--accent-rgb),0.3)]`}
              >
                <Sparkles className="h-3 w-3 text-accent" />
                <span>{t("roll_progression_stamp")}</span>
              </button>
            </div>

            {/* Isolated preview: play just this lane, without disturbing the transport or any
                shared mute/solo state. Hidden when the host has no preview plumbing. */}
            {onStartPreview && onStopPreview && (
              <div
                className="flex flex-wrap items-center gap-1 rounded-lg border border-[#282d3e] bg-[#131622]/80 px-2 py-0.5"
                data-testid="piano-roll-preview-suite"
              >
                <button
                  type="button"
                  onClick={handleTogglePreview}
                  aria-pressed={isPreviewing}
                  data-testid="piano-roll-preview-toggle"
                  title={isPreviewing ? t("roll_preview_stop_hint") : t("roll_preview_start_hint")}
                  className={`${ctrlClass} ${
                    isPreviewing
                      ? "bg-accent/25 border-accent text-accent font-bold shadow-[0_0_8px_rgba(var(--accent-rgb),0.3)]"
                      : "text-accent hover:bg-accent/20"
                  }`}
                >
                  {isPreviewing ? <Square className="h-3 w-3 fill-current" /> : <Play className="h-3 w-3 fill-current" />}
                  <span className="hidden sm:inline">
                    {isPreviewing ? t("roll_preview_stop") : t("roll_preview_start")}
                  </span>
                </button>

                <label className="flex items-center gap-1 font-['JetBrains_Mono'] text-[9px] uppercase tracking-[0.08em] text-text-dim">
                  {t("roll_preview_range")}
                  <select
                    value={previewBars}
                    onChange={(e) => setPreviewBars(Number(e.target.value))}
                    data-testid="piano-roll-preview-range"
                    aria-label={t("roll_preview_range")}
                    className="rounded border border-[#2b3040] bg-[#1a1e2b] px-1 py-0.5 text-[10px] font-bold text-white outline-none hover:border-accent/40"
                  >
                    <option value={0} className="bg-[#12151f]">
                      {t("roll_preview_range_all")}
                    </option>
                    {Array.from({ length: Math.max(1, barCount - 1) }, (_, i) => i + 1).map((bar) => (
                      <option key={bar} value={bar} className="bg-[#12151f]">
                        {t("roll_preview_range_bar", { bar })}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </div>


          {/* Right Deck 2: Pitch Transposition, Octaves, Zoom & Delete */}
          <div className="flex flex-wrap items-center gap-1.5 ml-auto">
            {/* Octave Shift */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setOctaveShift((v) => v + 12)}
                title={t("roll_octave_up")}
                aria-label={t("roll_octave_up")}
                data-testid="piano-roll-octave-up"
                className={ctrlClass}
              >
                <ChevronUp className="h-3.5 w-3.5" />
                <span className="text-[9px]">8va</span>
              </button>
              <button
                type="button"
                onClick={() => setOctaveShift((v) => v - 12)}
                title={t("roll_octave_down")}
                aria-label={t("roll_octave_down")}
                data-testid="piano-roll-octave-down"
                className={ctrlClass}
              >
                <ChevronDown className="h-3.5 w-3.5" />
                <span className="text-[9px]">8vb</span>
              </button>
            </div>

            {/* Transpose ±1 & ±12 */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  const res = transposeNotes(pattern, activeTrackIdx, selection, 1, stepCount);
                  commitDraft(res.pattern, res.nextSelection);
                  if (res.nextSelection.length > 0) {
                    const sample = parseNoteId(res.nextSelection[0]);
                    onAudition(activeTrackIdx, sample.midi, 100, 0.35);
                  }
                }}
                disabled={!editable}
                title={t("roll_transpose_semitone_up")}
                data-testid="piano-roll-semitone-up"
                className={`${ctrlClass} disabled:opacity-35`}
              >
                +1
              </button>
              <button
                type="button"
                onClick={() => {
                  const res = transposeNotes(pattern, activeTrackIdx, selection, -1, stepCount);
                  commitDraft(res.pattern, res.nextSelection);
                  if (res.nextSelection.length > 0) {
                    const sample = parseNoteId(res.nextSelection[0]);
                    onAudition(activeTrackIdx, sample.midi, 100, 0.35);
                  }
                }}
                disabled={!editable}
                title={t("roll_transpose_semitone_down")}
                data-testid="piano-roll-semitone-down"
                className={`${ctrlClass} disabled:opacity-35`}
              >
                −1
              </button>
              <button
                type="button"
                onClick={() => {
                  const res = transposeNotes(pattern, activeTrackIdx, selection, 12, stepCount);
                  commitDraft(res.pattern, res.nextSelection);
                  if (res.nextSelection.length > 0) {
                    const sample = parseNoteId(res.nextSelection[0]);
                    onAudition(activeTrackIdx, sample.midi, 100, 0.35);
                  }
                }}
                disabled={!editable}
                title="Transpose +12 semitones"
                data-testid="piano-roll-transpose-up"
                className={`${ctrlClass} disabled:opacity-35`}
              >
                +12
              </button>
              <button
                type="button"
                onClick={() => {
                  const res = transposeNotes(pattern, activeTrackIdx, selection, -12, stepCount);
                  commitDraft(res.pattern, res.nextSelection);
                  if (res.nextSelection.length > 0) {
                    const sample = parseNoteId(res.nextSelection[0]);
                    onAudition(activeTrackIdx, sample.midi, 100, 0.35);
                  }
                }}
                disabled={!editable}
                title="Transpose -12 semitones"
                data-testid="piano-roll-transpose-down"
                className={`${ctrlClass} disabled:opacity-35`}
              >
                −12
              </button>
            </div>

            {/* Zoom & Row Height Dual-Axis Controls */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Horizontal Zoom */}
              <div className="flex items-center gap-1 bg-[#141722] px-2 py-0.5 rounded-lg border border-[#262c3e]" title={t("roll_zoom_x")}>
                <span className="text-[8px] font-['JetBrains_Mono'] text-text-dim uppercase font-bold">X</span>
                <button
                  type="button"
                  onClick={() => setCustomStepWidth((w) => Math.max(8, (w ?? Math.round(cellW)) - 4))}
                  title={t("roll_zoom_out")}
                  aria-label={t("roll_zoom_out")}
                  data-testid="piano-roll-zoom-out"
                  className="p-0.5 hover:text-accent text-text-sub transition-colors"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <input
                  type="range"
                  min="8"
                  max="64"
                  value={customStepWidth ?? Math.round(cellW)}
                  onChange={(e) => setCustomStepWidth(Number(e.target.value))}
                  data-testid="piano-roll-zoom-x-slider"
                  aria-label={t("roll_zoom_x")}
                  className="w-14 sm:w-16 h-1 accent-accent bg-black/40 rounded cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() => setCustomStepWidth((w) => Math.min(64, (w ?? Math.round(cellW)) + 4))}
                  title={t("roll_zoom_in")}
                  aria-label={t("roll_zoom_in")}
                  data-testid="piano-roll-zoom-in"
                  className="p-0.5 hover:text-accent text-text-sub transition-colors"
                >
                  <Plus className="h-3 w-3" />
                </button>
                <span className="text-[8px] font-['JetBrains_Mono'] text-text-dim min-w-[22px] text-right">{Math.round(cellW)}px</span>
              </div>

              {/* Vertical Zoom */}
              <div className="flex items-center gap-1 bg-[#141722] px-2 py-0.5 rounded-lg border border-[#262c3e]" title={t("roll_zoom_y")}>
                <span className="text-[8px] font-['JetBrains_Mono'] text-text-dim uppercase font-bold">Y</span>
                <input
                  type="range"
                  min="12"
                  max="48"
                  value={rowHeight}
                  onChange={(e) => setRowHeight(Number(e.target.value))}
                  data-testid="piano-roll-zoom-y-slider"
                  aria-label={t("roll_zoom_y")}
                  className="w-14 sm:w-16 h-1 accent-accent bg-black/40 rounded cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() => {
                    const heights = [14, 18, 26, 36];
                    const nextIdx = (heights.indexOf(rowHeight) + 1) % heights.length;
                    setRowHeight(heights[nextIdx] ?? 18);
                  }}
                  title={t("roll_row_height")}
                  aria-label={t("roll_row_height")}
                  data-testid="piano-roll-row-height-toggle"
                  className="px-1.5 py-0.5 text-[8.5px] font-['JetBrains_Mono'] font-bold rounded bg-white/5 hover:bg-accent/20 hover:text-accent text-text-sub transition-colors"
                >
                  {rowH}px
                </button>
              </div>
            </div>

            {/* Delete Selection */}
            <button
              type="button"
              onClick={() => {
                if (selection.length === 0) return;
                applyOp((p) => deleteNotes(p, activeTrackIdx, selection, stepCount));
                setSelection([]);
              }}
              disabled={selection.length === 0}
              data-testid="piano-roll-delete"
              title={t("roll_delete_note")}
              aria-label={t("roll_delete_note")}
              className={`${ctrlClass} ${selection.length > 0 ? "border-red-500/50 text-red-300 hover:bg-red-500/20" : "disabled:opacity-30"}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      {notice && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-transparent px-3 py-1.5 text-[11px] font-['JetBrains_Mono'] text-amber-200 shadow-md backdrop-blur-md" data-testid="piano-roll-notice">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          {notice}
        </div>
      )}

      {isCollapsed ? null : !editable ? (
        <div className="rounded-2xl border border-[#282d3e] bg-gradient-to-b from-[#141724] to-[#0c0e15] p-8 text-center text-xs text-text-sub backdrop-blur-md shadow-inner" data-testid="piano-roll-not-melodic">
          {t("roll_not_melodic")}
        </div>
      ) : (
        <>
          <div className="flex gap-2 min-h-0">
            {/* Pitch gutter, drawn as a realistic 3D piano keyboard with auditioning */}
            <div className="shrink-0 flex flex-col w-16 shadow-[4px_0_12px_rgba(0,0,0,0.5)] z-20">
              <div className="h-6 shrink-0 flex items-center justify-center font-['JetBrains_Mono'] text-[9px] text-text-dim border-b border-[#262b3b] bg-[#11131a] rounded-tl-lg shadow-sm select-none">
                <span className="tracking-wider">KEY</span>
              </div>
              <div
                ref={keybedScrollRef}
                className="select-none overflow-hidden"
                style={{ maxHeight: isFullscreen ? "calc(100vh - 304px)" : 396 }}
                onWheel={(e) => {
                  if (scrollRef.current) scrollRef.current.scrollTop += e.deltaY;
                }}
                onPointerMove={handleKeybedPointerMove}
                onPointerUp={handleKeybedPointerUp}
                onPointerCancel={handleKeybedPointerUp}
                data-testid="piano-roll-keybed"
                title={t("roll_keybed_glissando_hint")}
              >
                {rows.map((midi) => {
                  const isBlack = [1, 3, 6, 8, 10].includes(midi % 12);
                  const inScale = scale.pcs.has(midi % 12);
                  const isRoot = midi % 12 === scale.rootPc;
                  const isC = midi % 12 === 0;
                  const oct = Math.floor(midi / 12) - 1;
                  const isAuditioning = activeAuditionMidi === midi;
                  return (
                    <div
                      key={midi}
                      data-testid={`piano-roll-row-${midi}`}
                      data-midi-pitch={midi}
                      data-scale={isRoot ? "root" : inScale ? "in" : "out"}
                      onPointerDown={(e) => handleKeybedPointerDown(midi, e)}
                      onPointerEnter={(e) => {
                        if (e.buttons === 1 && activeAuditionMidi !== midi) {
                          setActiveAuditionMidi(midi);
                          onAudition(activeTrackIdx, midi, 100, 0.45);
                        }
                      }}
                      onPointerUp={handleKeybedPointerUp}
                      className={`relative flex items-center justify-between px-1.5 font-['JetBrains_Mono'] text-[9px] cursor-pointer transition-all duration-75 select-none ${
                        isAuditioning
                          ? "bg-gradient-to-r from-accent via-amber-400 to-amber-300 text-black shadow-[0_0_16px_rgba(var(--accent-rgb),0.9),inset_0_1px_2px_white] z-20 font-black scale-[1.02]"
                          : isBlack
                          ? "bg-gradient-to-r from-[#11131a] via-[#1a1d28] to-[#252a3a] text-[#b9bdc9] hover:to-[#31374a] border-t border-white/20 border-b border-black/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),2px_2px_5px_rgba(0,0,0,0.8)] rounded-r-[4px] mr-1"
                          : "bg-gradient-to-r from-[#cad0dd] via-[#e2e6f0] to-[#f4f6fa] text-[#1a1d29] hover:to-white border-b border-[#9ca3b5] border-l-2 border-[#b8bcc8] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_3px_rgba(0,0,0,0.3)]"
                      } ${
                        !isAuditioning && hoverCell?.midi === midi
                          ? "ring-1 ring-accent/80 shadow-[0_0_10px_rgba(var(--accent-rgb),0.5)] z-10 brightness-110"
                          : ""
                      }`}
                      style={{ height: rowH }}
                    >
                      {/* Scale Degree Guide Marker */}
                      <div className="flex items-center gap-1 pointer-events-none">
                        {isRoot ? (
                          <span className="w-1.5 h-1.5 rotate-45 bg-accent shadow-[0_0_6px_var(--accent)] animate-pulse" title="Root" />
                        ) : inScale ? (
                          <span className={`w-1 h-1 rounded-full ${isBlack ? "bg-white/60 shadow-[0_0_3px_rgba(255,255,255,0.4)]" : "bg-black/40"}`} />
                        ) : null}
                      </div>
                      {/* Key Pitch Label */}
                      <span className={`font-semibold tracking-tighter pointer-events-none ${
                        isC
                          ? "font-black text-black bg-accent px-1 rounded shadow-[0_0_6px_rgba(var(--accent-rgb),0.6)]"
                          : isBlack
                          ? "text-[#8e95a8]"
                          : "text-[#1a1d29]"
                      }`}>
                        {isC ? `C${oct}` : rowH >= 18 ? midiToNoteName(midi) : isBlack ? "" : midiToNoteName(midi)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div ref={gridWrapRef} data-testid="piano-roll-grid-wrap" className="min-w-0 flex-1 flex flex-col">
              {/* Measure & Chord Progression Ruler (Horizontally synced) */}
              <div
                ref={rulerScrollRef}
                className="overflow-hidden border-b border-[#262b3b] bg-gradient-to-b from-[#171a25] via-[#13151f] to-[#0f1118] backdrop-blur-md shadow-sm h-6 shrink-0"
              >
                <div className="flex h-6" style={{ width: gridW }}>
                  {chordsByBar.map(({ barIdx, chordName, noteIds }) => {
                    const barWidth = stepsPerBar * cellW;
                    const isBarSelected = noteIds.length > 0 && noteIds.every((id) => selectedSet.has(id));
                    return (
                      <div
                        key={`bar-header-${barIdx}`}
                        className="shrink-0 flex items-center justify-between px-2 border-l-2 border-accent/50 font-['JetBrains_Mono'] text-[9px] overflow-hidden shadow-[inset_1px_0_0_rgba(255,255,255,0.05)]"
                        style={{ width: barWidth }}
                      >
                        <div className="flex items-center gap-1">
                          <span className="text-accent font-extrabold tracking-tight drop-shadow-[0_0_6px_rgba(var(--accent-rgb),0.3)]">
                            {t("roll_progression_bar", { bar: barIdx + 1 })}
                          </span>
                          <div className="hidden sm:flex items-center gap-1 text-[7.5px] text-white/20 ml-1">
                            <span>.1</span>
                            <span>.2</span>
                            <span>.3</span>
                            <span>.4</span>
                          </div>
                          {barIdx === 0 && barCount > 1 && (
                            <button
                              type="button"
                              onClick={() => applyOp((p) => duplicateBar1Notes(p, activeTrackIdx, stepsPerBar, stepCount))}
                              disabled={!editable}
                              data-testid="piano-roll-ruler-dup-bar1"
                              title={t("roll_dup_bar1_hint")}
                              className="px-1.5 py-0.5 ml-1.5 rounded bg-[#1c202e] hover:bg-accent/20 border border-[#2e3549] hover:border-accent text-[8px] font-['JetBrains_Mono'] font-bold text-text-sub hover:text-accent flex items-center gap-1 transition-all shadow-sm shrink-0"
                            >
                              <Copy className="w-2.5 h-2.5" />
                              <span>{t("roll_dup_bar1")}</span>
                            </button>
                          )}
                        </div>
                        {chordName && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelection(noteIds);
                              const barNotes = notes.filter((n) => noteIds.includes(noteId(n)));
                              /**
                               * The bar's notes are already the finished voicing, so they go to
                               * the engine as **one chord**. Passing them to `onAudition` one at a
                               * time made the chords track voice each member again — four notes in,
                               * twelve voices out.
                               */
                              if (onPreviewChord && barNotes.length > 0) {
                                const firstStep = Math.min(...barNotes.map((b) => b.stepIdx));
                                const uniquePitches = Array.from(
                                  new Set(barNotes.filter((n) => n.stepIdx === firstStep).map((n) => n.midi))
                                );
                                if (uniquePitches.length > 0) {
                                  onPreviewChord(activeTrackIdx, uniquePitches, 100, 0.5);
                                }
                              } else {
                                barNotes.forEach((n) => onAudition(activeTrackIdx, n.midi, n.velocity, 0.5));
                              }
                            }}
                            title={`Select & audition chord ${chordName}`}
                            className={`px-2 py-0.5 rounded-md text-[8.5px] font-bold transition-all truncate ${
                              isBarSelected
                                ? "bg-white text-black shadow-[0_0_12px_rgba(255,255,255,0.8)] scale-105 font-black"
                                : "bg-accent/20 text-accent hover:bg-accent/35 border border-accent/40 hover:border-accent shadow-[0_0_6px_rgba(var(--accent-rgb),0.2)]"
                            }`}
                          >
                            {chordName}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div
                ref={scrollRef}
                onScroll={(e) => {
                  if (keybedScrollRef.current) {
                    keybedScrollRef.current.scrollTop = e.currentTarget.scrollTop;
                  }
                  if (rulerScrollRef.current) {
                    rulerScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
                  }
                  if (velScrollRef.current) {
                    velScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
                  }
                }}
                className="overflow-x-auto overflow-y-auto"
                style={{ maxHeight: isFullscreen ? "calc(100vh - 304px)" : 396 }}
              >
                <div className="min-w-0">
                  <div
                    /* U10: one focusable surface, not a table. `role="grid"` used to sit here, but
                       the notes are absolutely-positioned divs with no rows to hold `gridcell`s, so
                       it was invalid ARIA promising structure that did not exist. `application` is
                       the honest role for a keyboard-driven editor like this one: the live region
                       below is what reports the cursor. */
                    role="application"
                    tabIndex={editable ? 0 : -1}
                    aria-label={t("roll_grid_aria")}
                    aria-describedby={rollHelpId}
                    data-testid="piano-roll-grid"
                    onKeyDown={handleGridKeyDown}
                    onFocus={() => {
                      if (!keyboardCursor) {
                        const cursor = initialCursor();
                        setKeyboardCursor(cursor);
                        announceRoll(describeCell(cursor));
                      }
                    }}
                    onBlur={(event) => {
                      // React's onBlur is focusout, so ignore focus moving *within* the surface.
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                        setKeyboardCursor(null);
                      }
                    }}
                    onPointerDown={handleGridPointerDown}
                    onPointerMove={handleGridPointerMove}
                    onPointerUp={handleGridPointerUp}
                    onPointerCancel={handleGridPointerUp}
                    onPointerLeave={() => setHoverCell(null)}
                    onWheel={handleGridWheel}
                    className={`relative touch-none select-none bg-[#0f121d] overflow-hidden ${
                      tool === "pointer"
                        ? "cursor-default"
                        : tool === "pencil"
                        ? "cursor-crosshair"
                        : tool === "eraser"
                        ? "cursor-not-allowed"
                        : "cursor-crosshair"
                    }`}
                    style={{ height: rows.length * rowH, width: gridW }}
                  >
                    {/* U10: the keyboard model's two screen-reader surfaces. The description is what
                        `aria-describedby` points at; the live region is what speaks as the cursor
                        moves and edits land, since the notes themselves are decorative divs. */}
                    <span
                      id={rollHelpId}
                      data-testid="piano-roll-kb-help"
                      className="sr-only"
                    >
                      {t("roll_kb_help")}
                    </span>
                    <span
                      role="status"
                      aria-live="polite"
                      data-testid="piano-roll-announcer"
                      className="sr-only"
                    >
                      {rollAnnouncement}
                    </span>
                    {/* Layer 1: Alternating Bar Column Backdrops */}
                    {Array.from({ length: barCount }, (_, barIdx) => {
                      const isAlternateBar = barIdx % 2 === 1;
                      const barLeft = barIdx * stepsPerBar * cellW;
                      const barWidth = Math.min(stepsPerBar, stepCount - barIdx * stepsPerBar) * cellW;
                      return (
                        <div
                          key={`bar-col-${barIdx}`}
                          className={`absolute inset-y-0 pointer-events-none transition-colors ${
                            isAlternateBar ? "bg-[#181c2e]" : "bg-[#131624]"
                          }`}
                          style={{ left: barLeft, width: barWidth }}
                        />
                      );
                    })}

                    {/* Layer 2: Pitch Rows Shading & Border Dividers */}
                    {rows.map((midi, rowIdx) => {
                      const isRoot = midi % 12 === scale.rootPc;
                      const inScale = scale.pcs.has(midi % 12);
                      const isBlackKey = [1, 3, 6, 8, 10].includes(midi % 12);
                      return (
                        <div
                          key={midi}
                          className={`absolute inset-x-0 pointer-events-none ${
                            isRoot
                              ? "bg-amber-500/[0.13] border-b border-amber-500/40 shadow-[inset_0_0_12px_rgba(245,158,11,0.18)]"
                              : inScale
                              ? isBlackKey
                                ? "bg-black/30 border-b border-[#1c2132]/80"
                                : "bg-white/[0.035] border-b border-[#252b40]/80"
                              : isBlackKey
                              ? "bg-black/60 border-b border-[#141622]/80 opacity-60"
                              : "bg-black/45 border-b border-[#181b28]/80 opacity-75"
                          }`}
                          style={{ top: rowIdx * rowH, height: rowH }}
                        >
                          {/* Scale Root Row Watermark */}
                          {isRoot &&
                            Array.from({ length: barCount }, (_, bIdx) => (
                              <span
                                key={`root-badge-${bIdx}`}
                                className="absolute top-0.5 pointer-events-none px-1 text-[7px] font-['JetBrains_Mono'] font-bold text-amber-400/60 select-none"
                                style={{ left: bIdx * stepsPerBar * cellW + 2 }}
                              >
                                ROOT
                              </span>
                            ))}
                        </div>
                      );
                    })}

                    {/* Layer 3: Vertical Beat & Step Grid Dividers */}
                    {Array.from({ length: stepCount }, (_, i) => {
                      const isBar = i % stepsPerBar === 0;
                      const isBeat = i % (stepsPerBar >= 4 ? stepsPerBar / 4 : 4) === 0;
                      return (
                        <div
                          key={`bar-${i}`}
                          className={`absolute inset-y-0 pointer-events-none ${
                            isBar
                              ? "border-l-2 border-accent/80 shadow-[0_0_12px_rgba(var(--accent-rgb),0.5)] z-10"
                              : isBeat
                              ? "border-l border-white/[0.28]"
                              : "border-l border-white/[0.14]"
                          }`}
                          style={{ left: i * cellW }}
                        />
                      );
                    })}

                    {/* Layer 4: Looped Repeat Ghost Notes */}
                    {loopLen < stepCount &&
                      Array.from({ length: Math.ceil((stepCount - loopLen) / loopLen) }, (_, repeatIdx) => {
                        const offset = (repeatIdx + 1) * loopLen;
                        return notes
                          .filter((n) => n.stepIdx < loopLen)
                          .map((note) => {
                            const ghostStep = note.stepIdx + offset;
                            if (ghostStep >= stepCount) return null;
                            if (notes.some((n) => n.stepIdx === ghostStep && n.midi === note.midi)) return null;
                            const rowIdx = rowIdxMap.get(note.midi);
                            if (rowIdx === undefined) return null;
                            const top = rowIdx * rowH;
                            if (top < 0 || top > rows.length * rowH) return null;
                            const width = Math.max(cellW * 0.9, note.gate * cellW);
                            return (
                              <div
                                key={`ghost-${ghostStep}-${note.midi}`}
                                className="absolute pointer-events-none rounded-[5px] border border-dashed border-accent/45 bg-accent/15 opacity-40 shadow-sm overflow-hidden z-10"
                                style={{
                                  left: ghostStep * cellW + 1,
                                  top: top + 1,
                                  width: width - 2,
                                  height: rowH - 2,
                                }}
                              >
                                {cellW >= 16 && (
                                  <span className="absolute inset-0 flex items-center px-1 font-['JetBrains_Mono'] text-[8px] font-bold text-accent/80 select-none">
                                    {midiToNoteName(note.midi)}
                                  </span>
                                )}
                              </div>
                            );
                          });
                      })}

                    {/* Layer 5: Polymeter Loop Boundary Indicator (Non-blocking transparent guide) */}
                    {loopLen < stepCount && (
                      <div
                        className="pointer-events-none absolute inset-y-0 border-l-2 border-dashed border-accent/60 bg-accent/[0.02] shadow-[inset_1px_0_12px_rgba(var(--accent-rgb),0.1)] z-10"
                        style={{ left: loopLen * cellW, width: (stepCount - loopLen) * cellW }}
                        data-testid="piano-roll-loop-boundary"
                      >
                        <div className="absolute top-1 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#131622]/95 border border-accent/40 text-[8.5px] font-['JetBrains_Mono'] text-accent font-bold shadow-md select-none">
                          <Repeat className="w-2.5 h-2.5 text-accent" />
                          <span>Loop ({loopLen} Steps)</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              applyOp((p) => {
                                const tracks = p.tracks.map((tr, idx) => {
                                  if (idx !== activeTrackIdx) return tr;
                                  const { trackLength: _removed, ...rest } = tr;
                                  return { ...rest, trackLength: stepCount };
                                });
                                return { ...p, tracks };
                              });
                            }}
                            className="pointer-events-auto ml-1 px-1.5 py-0.5 rounded bg-accent/20 hover:bg-accent/40 border border-accent/50 text-[8px] font-bold text-accent transition-all flex items-center gap-0.5 shadow-sm"
                            title={t("roll_extend_loop_hint")}
                            data-testid="piano-roll-extend-loop"
                          >
                            <span>{t("roll_extend_loop")}</span>
                          </button>
                        </div>
                      </div>
                    )}

                    <div
                      ref={playheadRef}
                      className="pointer-events-none absolute inset-y-0 w-[2px] bg-gradient-to-b from-white via-accent to-accent/60 shadow-[0_0_10px_rgba(var(--accent-rgb),1),0_0_20px_rgba(var(--accent-rgb),0.6)] z-30"
                      style={{ left: 0, opacity: 0, willChange: "transform" }}
                      data-testid="piano-roll-playhead"
                    />

                    {/* Layer 6: Real Authored Notes */}
                    {notes.map((note) => {
                      const rowIdx = rowIdxMap.get(note.midi);
                      if (rowIdx === undefined) return null;
                      const top = rowIdx * rowH;
                      if (top < 0 || top > rows.length * rowH) return null;
                      const selected = selectedSet.has(noteId(note));
                      const width = Math.max(cellW * 0.9, note.gate * cellW);
                      const noteName = midiToNoteName(note.midi);
                      const baseColor = velocityColor(note.velocity);
                      const isHoverTarget = hoverCell?.stepIdx === note.stepIdx && hoverCell?.midi === note.midi;
                      const isEraserHover = isHoverTarget && tool === "eraser";
                      const isScissorsHover = isHoverTarget && tool === "scissors";
                      return (
                        <div
                          key={`note-${note.stepIdx}-${note.midi}`}
                          data-testid={`piano-roll-note-${note.stepIdx}-${note.midi}`}
                          /* U10: the note blocks are the visual layer of a widget whose keyboard
                             model lives on the surface and speaks through the live region. Leaving
                             them exposed gave a screen reader a run of unlabelled divs. */
                          aria-hidden="true"
                          data-selected={selected ? "true" : "false"}
                          data-chord-size={notesAtStep(note.stepIdx).length}
                          data-gate={note.gate.toFixed(3)}
                          data-velocity={note.velocity}
                          title={`${noteName} · ${t("roll_note_meta", { gate: note.gate.toFixed(2), velocity: note.velocity })}`}
                          className={`absolute overflow-hidden rounded-[5px] transition-shadow duration-75 select-none ${
                            isEraserHover
                              ? "border-2 border-red-500 ring-2 ring-red-400 bg-red-600 shadow-[0_0_18px_rgba(239,68,68,0.95)] z-20 animate-pulse"
                              : selected
                              ? "border-2 border-white ring-2 ring-white/90 shadow-[0_0_18px_rgba(255,255,255,0.9),inset_0_1px_0_rgba(255,255,255,0.95)] z-20"
                              : "border border-black/70 shadow-[0_2px_6px_rgba(0,0,0,0.6)] hover:border-white/70 hover:shadow-[0_0_12px_rgba(255,255,255,0.5)] z-10"
                          }`}
                          style={{
                            left: note.stepIdx * cellW + 1,
                            top: top + 1,
                            width: width - 2,
                            height: rowH - 2,
                            backgroundColor: baseColor,
                            boxShadow: selected
                              ? "0 0 18px rgba(255,255,255,0.9), inset 0 1px 0 rgba(255,255,255,0.95)"
                              : "inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -1px 0 rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.6)",
                          }}
                        >
                          {/* Top specular highlight rim */}
                          <span className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-white/70" />

                          {/* Left impact transient strike line */}
                          <span className="pointer-events-none absolute inset-y-0 left-0 w-[4px] bg-white/90 rounded-l-[4px] shadow-[0_0_6px_white]" />

                          {/* Note pitch name tag */}
                          {cellW >= 16 && (
                            <span className="pointer-events-none absolute inset-0 flex items-center px-1.5 font-['JetBrains_Mono'] text-[8.5px] font-extrabold text-black drop-shadow-[0_1px_1px_rgba(255,255,255,0.6)] truncate">
                              {noteName}
                            </span>
                          )}

                          {/* Scissors Cut Preview Indicator */}
                          {isScissorsHover && (
                            <span className="pointer-events-none absolute inset-y-0 right-0 w-[2px] bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.9)] z-30" />
                          )}

                          {/* Logic-style resize handle with tactile ribs */}
                          {tool === "pointer" && width > 14 && (
                            <span
                              data-testid={`piano-roll-resize-${note.stepIdx}-${note.midi}`}
                              className="group absolute inset-y-0 right-0 w-[8px] cursor-ew-resize bg-black/20 hover:bg-white/40 transition-colors flex items-center justify-center"
                              onPointerDown={(e) => {
                                e.stopPropagation();
                                setSelection([noteId(note)]);
                                dragRef.current = {
                                  mode: "resize",
                                  stepIdx: note.stepIdx,
                                  midi: note.midi,
                                  base: draft ?? pattern,
                                  startGate: note.gate,
                                  startX: e.clientX,
                                  currentGate: note.gate,
                                };
                                setResizeGatePreview({ stepIdx: note.stepIdx, midi: note.midi, gate: note.gate });
                                e.currentTarget.setPointerCapture?.(e.pointerId);
                              }}
                            >
                              <span className="w-[1.5px] h-3 bg-white/50 group-hover:bg-white rounded-full" />
                            </span>
                          )}
                        </div>
                      );
                    })}

                    {/* Cursor Guideline: follows the pointer, and follows the keyboard when the
                        surface has focus — that row band *is* the keyboard cursor's visible focus. */}
                    {(() => {
                      const guideCell = hoverCell ?? keyboardCursor;
                      if (!guideCell) return null;
                      const rIdx = rowIdxMap.get(guideCell.midi);
                      if (rIdx === undefined) return null;
                      return (
                        <div
                          data-testid="piano-roll-row-guideline"
                          data-cursor-step={guideCell.stepIdx}
                          data-cursor-midi={guideCell.midi}
                          data-cursor-source={hoverCell ? "pointer" : "keyboard"}
                          className="pointer-events-none absolute inset-x-0 border-t border-b border-accent/30 bg-accent/[0.04] z-10"
                          style={{ top: rIdx * rowH, height: rowH }}
                        />
                      );
                    })()}

                    {/* Layer 7: Interactive Ghost Note Cursor Preview (Pencil mode) */}
                    {hoverCell && !dragRef.current && editable && tool === "pencil" && !noteAt(hoverCell.stepIdx, hoverCell.midi) && (() => {
                      const chordNotes = chordNotesForStamp(hoverCell.midi, view.scale, chordStamp);
                      return (
                        <>
                          {chordNotes.map((m, cIdx) => {
                            const rIdx = rowIdxMap.get(m);
                            if (rIdx === undefined) return null;
                            const isRoot = cIdx === 0;
                            return (
                              <div
                                key={`ghost-stamp-${m}`}
                                data-testid="piano-roll-ghost-hover"
                                className={`pointer-events-none absolute z-20 rounded-[5px] border-2 border-dashed ${
                                  isRoot ? "border-accent/90 bg-accent/30" : "border-amber-300/70 bg-amber-400/20"
                                } shadow-[0_0_12px_rgba(var(--accent-rgb),0.4),inset_0_1px_0_rgba(255,255,255,0.4)] animate-pulse flex items-center px-1`}
                                style={{
                                  left: hoverCell.stepIdx * cellW + 1,
                                  top: rIdx * rowH + 1,
                                  width: cellW - 2,
                                  height: rowH - 2,
                                }}
                              >
                                <span className="font-['JetBrains_Mono'] text-[8px] font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] truncate">
                                  {isRoot && chordStamp !== "note" ? `${midiToNoteName(m)} ${chordStamp}` : midiToNoteName(m)}
                                </span>
                              </div>
                            );
                          })}
                        </>
                      );
                    })()}

                    {/* Layer 8: Floating Note Resize HUD */}
                    {resizeGatePreview && (() => {
                      const rIdx = rowIdxMap.get(resizeGatePreview.midi);
                      if (rIdx === undefined) return null;
                      return (
                        <div
                          data-testid="piano-roll-resize-hud"
                          className="pointer-events-none absolute z-40 rounded-md border border-accent/70 bg-[#141724]/95 px-2 py-0.5 font-['JetBrains_Mono'] text-[9.5px] font-bold text-accent shadow-[0_4px_12px_rgba(0,0,0,0.8)] backdrop-blur-md flex items-center gap-1.5 whitespace-nowrap"
                          style={{
                            left: resizeGatePreview.stepIdx * cellW,
                            top: Math.max(0, rIdx * rowH - 22),
                          }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-ping" />
                          <span>{t("roll_resize_hud", { gate: resizeGatePreview.gate.toFixed(2) })}</span>
                        </div>
                      );
                    })()}

                    {marquee && (() => {
                      const r1 = rowIdxMap.get(marquee.pitchFrom);
                      const r2 = rowIdxMap.get(marquee.pitchTo);
                      const topRow = r1 !== undefined && r2 !== undefined ? Math.min(r1, r2) : 0;
                      const botRow = r1 !== undefined && r2 !== undefined ? Math.max(r1, r2) : 0;
                      return (
                        <div
                          data-testid="piano-roll-marquee"
                          className="pointer-events-none absolute border border-accent/80 bg-accent/15"
                          style={{
                            left: Math.min(marquee.stepFrom, marquee.stepTo) * cellW,
                            width: (Math.abs(marquee.stepTo - marquee.stepFrom) + 1) * cellW,
                            top: topRow * rowH,
                            height: (botRow - topRow + 1) * rowH,
                          }}
                        />
                      );
                    })()}
                  </div>
                </div>
              </div>

              {showVelocityLane && (
                <div
                  ref={velScrollRef}
                  onScroll={(e) => {
                    if (scrollRef.current) {
                      scrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
                    }
                  }}
                  className="overflow-x-auto mt-2.5"
                >
                  <div className="flex flex-col gap-1" style={{ minWidth: gridW }}>
                    {/* Velocity Lane Header Bar with quick dynamics & leveling tools */}
                    <div className="flex flex-wrap items-center justify-between gap-1.5 px-1 font-['JetBrains_Mono'] text-[9.5px]">
                      <div className="flex items-center gap-1.5 text-text-dim">
                        <TrendingUp className="h-3 w-3 text-accent" />
                        <span className="font-bold tracking-wider uppercase text-[9px] text-text-sub">{t("roll_velocity_lane")}</span>
                        <span className="text-[8.5px] text-white/30 hidden sm:inline">· 1..127</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => applyOp((p) => humanizeNotesVelocity(p, activeTrackIdx, selection, 10, stepCount))}
                          disabled={notes.length === 0}
                          data-testid="piano-roll-vel-humanize"
                          title="Humanize velocity (±10)"
                          className={`${ctrlClass} text-[9px] px-1.5 py-0.5`}
                        >
                          <Sparkles className="h-2.5 w-2.5 text-amber-400" />
                          <span>{t("roll_vel_humanize_btn")}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => applyOp((p) => compressNotesVelocity(p, activeTrackIdx, selection, 85, 0.5, stepCount))}
                          disabled={notes.length === 0}
                          data-testid="piano-roll-vel-compress"
                          title="Compress / level velocities toward 85"
                          className={`${ctrlClass} text-[9px] px-1.5 py-0.5`}
                        >
                          <span>{t("roll_vel_compress_btn")}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => applyOp((p) => rampNotesVelocity(p, activeTrackIdx, selection, 40, 120, stepCount))}
                          disabled={notes.length === 0}
                          data-testid="piano-roll-vel-ramp-up"
                          title={t("roll_vel_ramp_up_btn")}
                          className={`${ctrlClass} text-[9px] px-1.5 py-0.5 text-accent`}
                        >
                          <span>{t("roll_vel_ramp_up_btn")}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => applyOp((p) => rampNotesVelocity(p, activeTrackIdx, selection, 120, 40, stepCount))}
                          disabled={notes.length === 0}
                          data-testid="piano-roll-vel-ramp-down"
                          title={t("roll_vel_ramp_down_btn")}
                          className={`${ctrlClass} text-[9px] px-1.5 py-0.5`}
                        >
                          <span>{t("roll_vel_ramp_down_btn")}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => applyOp((p) => setNotesVelocity(p, activeTrackIdx, selection, 100, stepCount))}
                          disabled={notes.length === 0}
                          data-testid="piano-roll-vel-level-100"
                          title={t("roll_vel_level_btn")}
                          className={`${ctrlClass} text-[9px] px-1.5 py-0.5`}
                        >
                          <span>{t("roll_vel_level_btn")}</span>
                        </button>
                      </div>
                    </div>

                    <div
                      data-testid="piano-roll-velocity-lane"
                      aria-label={t("roll_velocity_lane")}
                      className="relative cursor-ns-resize rounded-xl border border-[#242938] bg-gradient-to-b from-[#0f1118] via-[#0b0c12] to-[#08090e] p-1 shadow-[inset_0_2px_5px_rgba(0,0,0,0.8)] overflow-hidden"
                      style={{ height: VELOCITY_LANE_H, width: gridW }}
                      onPointerDown={handleVelocityPointerDown}
                      onPointerMove={handleGridPointerMove}
                      onPointerUp={handleGridPointerUp}
                      onPointerCancel={handleGridPointerUp}
                    >
                      {/* Velocity Lane Alternating Bar Backdrops */}
                      {Array.from({ length: barCount }, (_, barIdx) => {
                        const isAlternateBar = barIdx % 2 === 1;
                        const barLeft = barIdx * stepsPerBar * cellW;
                        const barWidth = Math.min(stepsPerBar, stepCount - barIdx * stepsPerBar) * cellW;
                        return (
                          <div
                            key={`vel-bar-${barIdx}`}
                            className={`absolute inset-y-0 pointer-events-none ${
                              isAlternateBar ? "bg-[#181c2e]" : "bg-[#131624]"
                            }`}
                            style={{ left: barLeft, width: barWidth }}
                          />
                        );
                      })}

                      {/* Vertical Beat Lines in Velocity Lane */}
                      {Array.from({ length: stepCount }, (_, i) => {
                        const isBar = i % stepsPerBar === 0;
                        const isBeat = i % (stepsPerBar >= 4 ? stepsPerBar / 4 : 4) === 0;
                        return (
                          <div
                            key={`vel-grid-${i}`}
                            className={`absolute inset-y-0 pointer-events-none ${
                              isBar
                                ? "border-l-2 border-accent/60"
                                : isBeat
                                ? "border-l border-white/25"
                                : "border-l border-white/10"
                            }`}
                            style={{ left: i * cellW }}
                          />
                        );
                      })}

                      {[32, 64, 96, 127].map((line) => (
                        <div
                          key={line}
                          className="absolute inset-x-0 border-t border-white/[0.08] flex items-center justify-start pl-1 text-[7.5px] font-['JetBrains_Mono'] font-bold text-white/30 select-none pointer-events-none"
                          style={{ bottom: `${(line / 127) * 100}%` }}
                        >
                          {line === 127 ? "fff · 127" : line === 96 ? "f · 96" : line === 64 ? "mf · 64" : "p · 32"}
                        </div>
                      ))}
                      {[...new Map(notes.map((n) => [n.stepIdx, n])).values()].map((note) => {
                        const onStep = notesAtStep(note.stepIdx);
                        const stepSelected = onStep.every((n) => selectedSet.has(noteId(n)));
                        const velHeight = `${(note.velocity / 127) * 100}%`;
                        const barColor = velocityColor(note.velocity);
                        const dynamicName = note.velocity >= 115 ? "fff" : note.velocity >= 95 ? "f" : note.velocity >= 60 ? "mf" : "p";
                        return (
                          <div
                            key={`vel-${note.stepIdx}`}
                            data-testid={`piano-roll-velocity-bar-${note.stepIdx}`}
                            data-velocity={note.velocity}
                            data-chord-size={onStep.length}
                            title={`Step ${note.stepIdx + 1} · Velocity ${note.velocity} (${dynamicName})`}
                            className="absolute bottom-0 flex flex-col items-center justify-end group cursor-pointer"
                            style={{
                              left: note.stepIdx * cellW + 1,
                              width: Math.max(2, cellW - 2),
                              height: velHeight,
                            }}
                          >
                            {/* Lollipop glowing head */}
                            <div
                              className={`w-2.5 h-2.5 rounded-full -mb-1 z-10 transition-transform hover:scale-125 ${
                                stepSelected
                                  ? "bg-white shadow-[0_0_8px_white]"
                                  : "shadow-[0_0_6px_rgba(0,0,0,0.6)]"
                              }`}
                              style={{
                                backgroundColor: stepSelected ? "#ffffff" : barColor,
                                border: "1.5px solid rgba(255,255,255,0.8)",
                                boxShadow: stepSelected ? "0 0 12px white" : `0 0 8px ${barColor}`,
                              }}
                            />
                            {/* Lollipop needle stem */}
                            <div
                              className={`w-[2.5px] flex-1 ${
                                stepSelected ? "bg-white/90 shadow-[0_0_6px_white]" : "opacity-85"
                              }`}
                              style={{ backgroundColor: stepSelected ? "#ffffff" : barColor }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* -------------------------------------------------- selection inspector */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#252a3b] bg-gradient-to-r from-[#141722] via-[#10121a] to-[#141722] px-3.5 py-2.5 rounded-b-xl shadow-inner backdrop-blur-md">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.08em] font-bold text-text-sub flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-ping" />
                {t("roll_selected")}
              </span>
              <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim px-2 py-0.5 rounded-full bg-white/5 border border-white/10" data-testid="piano-roll-selected-count">
                {t("roll_selected_count", { count: selection.length })}
              </span>
              {focusNote ? (
                <>
                  <span className="font-['JetBrains_Mono'] text-[11px] font-bold text-accent px-2 py-0.5 rounded bg-accent/15 border border-accent/30 shadow-[0_0_6px_rgba(var(--accent-rgb),0.3)]" data-testid="piano-roll-selected-name">
                    {midiToNoteName(focusNote.midi)}
                  </span>
                  <label className="flex items-center gap-1 font-['JetBrains_Mono'] text-[10px] text-text-dim">
                    {t("roll_pitch")}
                    <input
                      type="number"
                      min={0}
                      max={127}
                      value={focusNote.midi}
                      data-testid="piano-roll-pitch"
                      onChange={(e) => {
                        const midi = Math.max(0, Math.min(127, Number(e.target.value)));
                        applyOp((p) => moveNotes(p, activeTrackIdx, [noteId(focusNote)], 0, midi - focusNote.midi, stepCount).pattern);
                      }}
                      className="w-14 rounded-md border border-[#2b3040] bg-[#1a1e2a] px-1.5 py-0.5 text-[10px] font-bold text-white shadow-inner outline-none focus:border-accent"
                    />
                  </label>
                  <label className="flex items-center gap-1 font-['JetBrains_Mono'] text-[10px] text-text-dim">
                    {t("roll_start")}
                    <input
                      type="number"
                      min={0}
                      max={stepCount - 1}
                      value={focusNote.stepIdx}
                      data-testid="piano-roll-start"
                      onChange={(e) => {
                        const target = Math.max(0, Math.min(stepCount - 1, Number(e.target.value)));
                        applyOp((p) => moveNotes(p, activeTrackIdx, [noteId(focusNote)], target - focusNote.stepIdx, 0, stepCount).pattern);
                      }}
                      className="w-14 rounded-md border border-[#2b3040] bg-[#1a1e2a] px-1.5 py-0.5 text-[10px] font-bold text-white shadow-inner outline-none focus:border-accent"
                    />
                  </label>
                  <label className="flex items-center gap-1 font-['JetBrains_Mono'] text-[10px] text-text-dim">
                    {t("roll_length")}
                    <input
                      type="number"
                      min={0.1}
                      max={MAX_NOTE_GATE_STEPS}
                      step={0.05}
                      value={focusNote.gate}
                      data-testid="piano-roll-length"
                      onChange={(e) => {
                        const gate = Math.max(0.1, Math.min(MAX_NOTE_GATE_STEPS, Number(e.target.value)));
                        applyOp((p) => resizeNote(p, activeTrackIdx, focusNote.stepIdx, gate, stepCount));
                      }}
                      className="w-16 rounded-md border border-[#2b3040] bg-[#1a1e2a] px-1.5 py-0.5 text-[10px] font-bold text-white shadow-inner outline-none focus:border-accent"
                    />
                  </label>
                  <label className="flex items-center gap-1 font-['JetBrains_Mono'] text-[10px] text-text-dim">
                    {t("roll_velocity")}
                    <input
                      type="number"
                      min={1}
                      max={127}
                      value={focusNote.velocity}
                      data-testid="piano-roll-velocity"
                      onChange={(e) => {
                        const velocity = Math.max(1, Math.min(127, Number(e.target.value)));
                        applyOp((p) => scaleNotesVelocity(p, activeTrackIdx, [noteId(focusNote)], velocity - focusNote.velocity, stepCount));
                      }}
                      className="w-16 rounded-md border border-[#2b3040] bg-[#1a1e2a] px-1.5 py-0.5 text-[10px] font-bold text-white shadow-inner outline-none focus:border-accent"
                    />
                  </label>
                  <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim" data-testid="piano-roll-selected-meta">
                    {focusNote.gate.toFixed(2)} × {t("roll_steps_unit")} · {focusNote.velocity}
                  </span>
                  {/* Quick Dynamics Pod */}
                  <div className="flex items-center gap-1 pl-2 border-l border-[#2c3244]" data-testid="piano-roll-dyn-pod">
                    <span className="font-['JetBrains_Mono'] text-[9px] font-bold text-text-dim uppercase tracking-wider">Dyn</span>
                    <button
                      type="button"
                      onClick={() => applyOp((p) => setNotesVelocity(p, activeTrackIdx, selection, 40, stepCount))}
                      title={t("roll_vel_preset_soft")}
                      data-testid="piano-roll-dyn-soft"
                      className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/15 text-[9px] font-['JetBrains_Mono'] font-bold text-text hover:text-white border border-white/10 transition-colors"
                    >
                      p
                    </button>
                    <button
                      type="button"
                      onClick={() => applyOp((p) => setNotesVelocity(p, activeTrackIdx, selection, 80, stepCount))}
                      title={t("roll_vel_preset_mid")}
                      data-testid="piano-roll-dyn-mid"
                      className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/15 text-[9px] font-['JetBrains_Mono'] font-bold text-text hover:text-white border border-white/10 transition-colors"
                    >
                      mf
                    </button>
                    <button
                      type="button"
                      onClick={() => applyOp((p) => setNotesVelocity(p, activeTrackIdx, selection, 110, stepCount))}
                      title={t("roll_vel_preset_loud")}
                      data-testid="piano-roll-dyn-loud"
                      className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/15 text-[9px] font-['JetBrains_Mono'] font-bold text-text hover:text-white border border-white/10 transition-colors"
                    >
                      f
                    </button>
                    <button
                      type="button"
                      onClick={() => applyOp((p) => setNotesVelocity(p, activeTrackIdx, selection, 127, stepCount))}
                      title={t("roll_vel_preset_max")}
                      data-testid="piano-roll-dyn-max"
                      className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/15 text-[9px] font-['JetBrains_Mono'] font-bold text-text hover:text-white border border-white/10 transition-colors"
                    >
                      127
                    </button>
                    <button
                      type="button"
                      onClick={() => applyOp((p) => rampNotesVelocity(p, activeTrackIdx, selection, 40, 120, stepCount))}
                      title={t("roll_vel_ramp")}
                      data-testid="piano-roll-dyn-ramp"
                      className="px-1.5 py-0.5 rounded bg-accent/15 hover:bg-accent/25 text-[9px] font-['JetBrains_Mono'] font-bold text-accent border border-accent/30 hover:border-accent transition-colors flex items-center gap-0.5"
                    >
                      <TrendingUp className="w-2.5 h-2.5" />
                      <span>Ramp</span>
                    </button>
                  </div>
                </>
              ) : (
                <span className="text-[10px] text-text-dim">{t("roll_select_hint")}</span>
              )}
            </div>
            <div className="flex items-center gap-2 text-[9.5px] font-['JetBrains_Mono'] text-text-dim">
              <span className="hidden md:inline px-1.5 py-0.5 rounded bg-white/5 border border-white/10">1–5 Tools</span>
              <span className="hidden md:inline px-1.5 py-0.5 rounded bg-white/5 border border-white/10">⌥+Drag Copy</span>
              <span className="hidden md:inline px-1.5 py-0.5 rounded bg-white/5 border border-white/10">⇧+Click Add</span>
              <span className="hidden md:inline px-1.5 py-0.5 rounded bg-white/5 border border-white/10">⌫ Delete</span>
              {onToggleMusicalTyping ? (
                <button
                  type="button"
                  onClick={onToggleMusicalTyping}
                  title={isZh ? "点击打开电脑虚拟键盘 HUD (⌥K)" : "Click to open Musical Typing HUD (⌥K)"}
                  className="hidden lg:inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-accent/15 border border-accent/30 text-accent font-bold hover:bg-accent/25 hover:border-accent transition-colors"
                >
                  <Keyboard className="w-2.5 h-2.5" />
                  <span>⌥K Musical Typing</span>
                </button>
              ) : (
                <span className="hidden lg:inline px-1.5 py-0.5 rounded bg-accent/10 border border-accent/20 text-accent font-bold">⌥K Musical Typing</span>
              )}
            </div>
          </div>
        </>
      )}

      {/* Realtime Recording Indicator HUD */}
      {isRecording && (
        <div className="absolute top-3 right-4 z-40 flex items-center gap-2 px-3 py-1 rounded-full bg-red-600/90 text-white font-['JetBrains_Mono'] text-[10px] font-bold shadow-[0_0_15px_rgba(239,68,68,0.7)] border border-white/20 animate-pulse pointer-events-none">
          <span className="w-2 h-2 rounded-full bg-white animate-ping" />
          <span>REC · {track?.name || "TRACK"} {currentStep !== undefined && currentStep >= 0 ? `· STEP ${currentStep + 1}` : ""}</span>
        </div>
      )}

      {/* Clear Notes & New Clip Confirmation Dialog */}
      {showNewConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-xl border border-[#2e3447] bg-[#141723] p-5 shadow-2xl flex flex-col gap-3">
            <div className="flex items-center gap-2 text-text">
              <FilePlus className="h-5 w-5 text-accent" />
              <h3 className="font-['Space_Grotesk'] text-sm font-bold text-white">
                {t("roll_clear_confirm_title")}
              </h3>
            </div>
            <p className="text-xs text-text-sub leading-relaxed">
              {t("roll_clear_confirm_desc")}
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewConfirm(false)}
                className="px-3 py-1.5 rounded-lg border border-line-subtle text-xs text-text-sub hover:text-text hover:bg-white/5 transition-colors"
              >
                {isZh ? "取消" : "Cancel"}
              </button>
              <button
                type="button"
                data-testid="piano-roll-new-confirm"
                onClick={handleConfirmNewPattern}
                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-md transition-colors"
              >
                {t("roll_clear_confirm_btn")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
