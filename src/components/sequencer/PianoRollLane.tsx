import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Eraser,
  Maximize2,
  Minimize2,
  Minus,
  MousePointer2,
  Music2,
  Pencil,
  Plus,
  Scissors,
  SquareDashedMousePointer,
  Trash2,
  X,
} from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";
import type { SequencerAction } from "../../features/sequencer/useSequencerStore";
import { MAX_NOTE_GATE_STEPS, type SequencerPattern } from "../../types/genre";
import {
  addNote,
  copyNotes,
  deleteNotes,
  isRollEditableTrack,
  legatoNotes,
  loopLengthOf,
  moveNotes,
  notesFromTrack,
  noteId,
  notesInRect,
  quantizeLengths,
  removeNote,
  resizeNote,
  scaleHighlightFor,
  scaleNotesVelocity,
  splitNote,
  transposeTrack,
  visiblePitchRange,
  type RollSnap,
  parseNoteId,
  removeNoteAt,
  selectedSteps,
  type RollNoteId,
  type RollStepNote,
  type RollTool,
} from "../../features/sequencer/rollModel";
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
}

const ROW_HEIGHTS = [12, 18, 26];
const ZOOM_FACTORS = [0.5, 0.75, 1, 1.5, 2];
const DEFAULT_ZOOM_INDEX = 2; // 1× == fit
const MIN_CELL_W = 10;
const GUTTER_W = 52;
const VELOCITY_LANE_H = 54;
const VELOCITY_PER_PX = 2.4;

const TOOLS: Array<{ id: RollTool; icon: React.ReactNode; labelKey: string }> = [
  { id: "pointer", icon: <MousePointer2 className="h-3.5 w-3.5" />, labelKey: "roll_tool_pointer" },
  { id: "pencil", icon: <Pencil className="h-3.5 w-3.5" />, labelKey: "roll_tool_pencil" },
  { id: "eraser", icon: <Eraser className="h-3.5 w-3.5" />, labelKey: "roll_tool_eraser" },
  { id: "scissors", icon: <Scissors className="h-3.5 w-3.5" />, labelKey: "roll_tool_scissors" },
  { id: "marquee", icon: <SquareDashedMousePointer className="h-3.5 w-3.5" />, labelKey: "roll_tool_marquee" },
];

const SNAPS: RollSnap[] = ["off", "1/4", "1/8", "1/16", "1/32"];

/** Velocity → a colour that reads as "harder" without needing a legend. */
function velocityColor(velocity: number): string {
  const t = Math.min(1, Math.max(0, velocity / 127));
  const r = Math.round(120 + t * 125);
  const g = Math.round(140 + t * 43);
  const b = Math.round(160 - t * 100);
  return `rgb(${r}, ${g}, ${b})`;
}

type DragState =
  /** `origin` is a list of note ids — a chord moves as several notes. */
  | { mode: "move"; startStep: number; startMidi: number; origin: RollNoteId[]; base: SequencerPattern; copied: boolean }
  | { mode: "marquee"; startStep: number; startMidi: number }
  | { mode: "velocity"; startY: number; steps: RollNoteId[]; base: SequencerPattern }
  | { mode: "resize"; stepIdx: number; midi: number; base: SequencerPattern; startGate: number; startX: number }
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
}) => {
  const { t } = useLanguage();
  const [zoomIdx, setZoomIdx] = useState(DEFAULT_ZOOM_INDEX);
  const [rowHeightIdx, setRowHeightIdx] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [availableWidth, setAvailableWidth] = useState(0);
  const [octaveShift, setOctaveShift] = useState(0);
  const [tool, setTool] = useState<RollTool>("pencil");
  const [snap, setSnap] = useState<RollSnap>("1/16");
  const [selection, setSelection] = useState<RollNoteId[]>([]);
  const [draft, setDraft] = useState<SequencerPattern | null>(null);
  const [marquee, setMarquee] = useState<{ stepFrom: number; stepTo: number; pitchFrom: number; pitchTo: number } | null>(null);
  const [showVelocityLane, setShowVelocityLane] = useState(true);
  const [catchPlayhead, setCatchPlayhead] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const sectionRef = useRef<HTMLElement | null>(null);
  const gridWrapRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const playheadRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const cellWRef = useRef(26);
  const catchRef = useRef(true);
  const rowH = ROW_HEIGHTS[rowHeightIdx];
  const view = draft ?? pattern;
  const track = view.tracks[activeTrackIdx];
  const editable = isRollEditableTrack(track);
  const notes = useMemo(() => notesFromTrack(track, 60, view.scale), [track, view.scale]);
  const selectedSet = useMemo(() => new Set(selection), [selection]);

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
  const rows = useMemo(() => {
    const out: number[] = [];
    for (let p = hiPitch; p >= loPitch; p--) out.push(p);
    return out;
  }, [loPitch, hiPitch]);

  const scale = useMemo(() => scaleHighlightFor(view.scale), [view.scale]);
  const loopLen = loopLengthOf(track, stepCount);
  const fitCellW = availableWidth > 0 ? Math.max(MIN_CELL_W, (availableWidth - GUTTER_W) / Math.max(1, stepCount)) : 26;
  const cellW = Math.max(MIN_CELL_W, fitCellW * ZOOM_FACTORS[zoomIdx]);
  const gridW = stepCount * cellW;
  cellWRef.current = cellW;
  catchRef.current = catchPlayhead;

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

  useEffect(() => {
    const node = sectionRef.current;
    if (node && typeof node.scrollIntoView === "function") node.scrollIntoView({ block: "nearest" });
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
        scroller.scrollLeft = Math.max(0, x - scroller.clientWidth * 0.35);
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

  /* ------------------------------------------------------------------ grid gestures */

  const handleGridPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!editable) return;
    const { stepIdx, midi } = cellFromEvent(event);
    if (stepIdx < 0 || stepIdx >= stepCount || midi === undefined) return;
    const hit = noteAt(stepIdx, midi);
    const additive = event.metaKey || event.ctrlKey || event.shiftKey;

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
        onAudition(activeTrackIdx, hit.midi, hit.velocity, hit.gate);
        return;
      }
      // Draw. On a step that already sounds this **adds to the chord** (`addNote` stacks), which
      // is how a chord is built here: draw the root, then draw the third and fifth onto the same
      // step. The first cell commits immediately, so a click is one complete gesture; a stroke
      // that continues accumulates and commits once on release.
      const next = addNote(pattern, activeTrackIdx, stepIdx, midi, stepCount, 100, notesAtStep(stepIdx)[0]?.gate);
      if (next === pattern) return;
      const id = noteId({ stepIdx, midi });
      commitDraft(next, additive ? [...selection, id] : [id]);
      onAudition(activeTrackIdx, midi, 100, notesAtStep(stepIdx)[0]?.gate ?? 0.8);
      dragRef.current = { mode: "paint", base: next, painted: [id] };
      event.currentTarget.setPointerCapture?.(event.pointerId);
      return;
    }
    if (tool === "marquee" || (!hit && tool === "pointer")) {
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
    onAudition(activeTrackIdx, hit.midi, hit.velocity, hit.gate);
    dragRef.current = { mode: "move", startStep: stepIdx, startMidi: midi, origin, base: pattern, copied: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleGridPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || !editable) return;
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
      setDraft(resizeNote(drag.base, activeTrackIdx, drag.stepIdx, gate, stepCount));
    }
  };

  const handleGridPointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.mode === "marquee") {
      if (marquee) setSelection(notesInRect(notes, marquee));
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
      if (event.key >= "1" && event.key <= "5") {
        const next = TOOLS[Number(event.key) - 1];
        if (next) setTool(next.id);
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (selection.length === 0) return;
        event.preventDefault();
        applyOp((p) => deleteNotes(p, activeTrackIdx, selection, stepCount));
        setSelection([]);
        return;
      }
      if (event.key === "a" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setSelection(notes.map(noteId));
        return;
      }
      if (event.key.startsWith("Arrow") && selection.length > 0) {
        const stepDelta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        const pitchDelta = event.key === "ArrowUp" ? 1 : event.key === "ArrowDown" ? -1 : 0;
        if (stepDelta === 0 && pitchDelta === 0) return;
        event.preventDefault();
        const moved = moveNotes(pattern, activeTrackIdx, selection, stepDelta, pitchDelta, stepCount);
        if (moved.pattern !== pattern) {
          commitDraft(moved.pattern, moved.selection);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, selection, notes, pattern, activeTrackIdx, stepCount, isFullscreen, marquee, commitDraft]);

  /* ------------------------------------------------------------------ render */

  const selectedNotes: RollStepNote[] = notes.filter((n) => selectedSet.has(noteId(n)));
  const focusNote = selectedNotes[0] ?? null;
  const ctrlClass =
    "flex h-6 items-center gap-1 rounded-lg border border-line bg-panel2 px-1.5 font-['JetBrains_Mono'] text-[10px] text-text-sub transition-colors hover:text-text";

  return (
    <section
      ref={sectionRef}
      data-testid="piano-roll"
      data-fullscreen={isFullscreen ? "true" : "false"}
      data-collapsed={isCollapsed ? "true" : "false"}
      data-tool={tool}
      // Grid metrics as data attributes: gestures in tests (and diagnostics anywhere) read the
      // geometry from the product instead of hard-coding it.
      data-steps={stepCount}
      data-rows={rows.length}
      data-cell-w={Math.round(cellW * 100) / 100}
      data-row-h={rowH}
      aria-label={`${t("roll_title")} ${track?.name ?? ""}`}
      className={
        isFullscreen ? "fixed inset-0 z-[60] flex flex-col gap-2 overflow-y-auto bg-bg p-3 sm:p-4" : "flex w-full flex-col gap-2"
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
      {/* ---------------------------------------------------------------- toolbar */}
      <header className="flex flex-wrap items-center gap-1.5 border-b border-line-subtle pb-2">
        <span className="flex items-center gap-1.5 font-['JetBrains_Mono'] text-[10px] font-bold uppercase tracking-[0.1em] text-text">
          <Music2 className="h-3.5 w-3.5 text-accent" />
          {t("roll_title")}
        </span>

        <select
          value={activeTrackIdx}
          onChange={(e) => {
            setSelection([]);
            setDraft(null);
            onSelectTrack(Number(e.target.value));
          }}
          aria-label={t("roll_track")}
          data-testid="piano-roll-track"
          className="rounded-lg border border-line bg-panel2 px-2 py-1 font-['JetBrains_Mono'] text-[11px] text-text outline-none"
        >
          {selectableTracks.map(({ tr, idx }) => (
            <option key={`${tr.track_id}-${idx}`} value={idx}>
              {tr.name}
            </option>
          ))}
        </select>

        <div role="group" aria-label={t("roll_tools")} className="flex items-center gap-0.5 rounded-lg border border-line bg-panel2 p-0.5">
          {TOOLS.map((entry, index) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setTool(entry.id)}
              aria-pressed={tool === entry.id}
              data-testid={`piano-roll-tool-${entry.id}`}
              title={`${t(entry.labelKey)} (${index + 1})`}
              aria-label={t(entry.labelKey)}
              className={`rounded p-0.5 transition-colors ${tool === entry.id ? "bg-accent/25 text-accent" : "text-text-sub hover:text-text"}`}
            >
              {entry.icon}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-1 font-['JetBrains_Mono'] text-[9px] uppercase tracking-[0.08em] text-text-dim">
          {t("roll_snap")}
          <select
            value={snap}
            onChange={(e) => setSnap(e.target.value as RollSnap)}
            aria-label={t("roll_snap")}
            data-testid="piano-roll-snap"
            className="rounded border border-line bg-panel2 px-1 py-0.5 text-[10px] text-text outline-none"
          >
            {SNAPS.map((value) => (
              <option key={value} value={value}>
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
          className={`${ctrlClass} disabled:opacity-40`}
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
          className={`${ctrlClass} disabled:opacity-40`}
        >
          {t("roll_legato")}
        </button>

        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setOctaveShift((v) => v + 12)} title={t("roll_octave_up")} aria-label={t("roll_octave_up")} data-testid="piano-roll-octave-up" className={ctrlClass}>
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => setOctaveShift((v) => v - 12)} title={t("roll_octave_down")} aria-label={t("roll_octave_down")} data-testid="piano-roll-octave-down" className={ctrlClass}>
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setZoomIdx((v) => Math.max(0, v - 1))} title={t("roll_zoom_out")} aria-label={t("roll_zoom_out")} data-testid="piano-roll-zoom-out" className={ctrlClass}>
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => setZoomIdx((v) => Math.min(ZOOM_FACTORS.length - 1, v + 1))} title={t("roll_zoom_in")} aria-label={t("roll_zoom_in")} data-testid="piano-roll-zoom-in" className={ctrlClass}>
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setRowHeightIdx((v) => (v + 1) % ROW_HEIGHTS.length)}
            title={t("roll_row_height")}
            aria-label={t("roll_row_height")}
            data-testid="piano-roll-row-height-toggle"
            className={ctrlClass}
          >
            {rowH}px
          </button>
        </div>

        <button type="button" onClick={() => applyOp((p) => transposeTrack(p, activeTrackIdx, 12, stepCount))} disabled={!editable} data-testid="piano-roll-transpose-up" className={`${ctrlClass} disabled:opacity-40`}>
          +12
        </button>
        <button type="button" onClick={() => applyOp((p) => transposeTrack(p, activeTrackIdx, -12, stepCount))} disabled={!editable} data-testid="piano-roll-transpose-down" className={`${ctrlClass} disabled:opacity-40`}>
          −12
        </button>

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
          className={`${ctrlClass} disabled:opacity-40`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={() => setShowVelocityLane((v) => !v)}
          aria-pressed={showVelocityLane}
          data-testid="piano-roll-velocity-toggle"
          title={t("roll_velocity_lane")}
          className={`${ctrlClass} ${showVelocityLane ? "border-accent text-accent" : ""}`}
        >
          {t("roll_velocity_lane")}
        </button>
        <button
          type="button"
          onClick={() => setCatchPlayhead((v) => !v)}
          aria-pressed={catchPlayhead}
          data-testid="piano-roll-catch"
          title={t("roll_catch_hint")}
          className={`${ctrlClass} ${catchPlayhead ? "border-accent text-accent" : ""}`}
        >
          {t("roll_catch")}
        </button>

        <button type="button" onClick={() => setIsCollapsed((v) => !v)} aria-pressed={isCollapsed} data-testid="piano-roll-collapse" title={isCollapsed ? t("roll_expand") : t("roll_collapse")} aria-label={isCollapsed ? t("roll_expand") : t("roll_collapse")} className={ctrlClass}>
          {isCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </button>
        <button type="button" onClick={() => setIsFullscreen((v) => !v)} aria-pressed={isFullscreen} data-testid="piano-roll-fullscreen" title={isFullscreen ? t("roll_exit_fullscreen") : t("roll_fullscreen")} aria-label={isFullscreen ? t("roll_exit_fullscreen") : t("roll_fullscreen")} className={ctrlClass}>
          {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>
        <button type="button" onClick={onClose} data-testid="piano-roll-close" aria-label={t("roll_close")} title={t("roll_close")} className={`${ctrlClass} ml-auto`}>
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      {notice && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-300" data-testid="piano-roll-notice">
          {notice}
        </div>
      )}

      {isCollapsed ? null : !editable ? (
        <div className="rounded-lg border border-line bg-panel2/60 p-3 text-[11px] text-text-sub" data-testid="piano-roll-not-melodic">
          {t("roll_not_melodic")}
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            {/* Pitch gutter, drawn as a keyboard so black keys are recognisable at a glance. */}
            <div className="shrink-0 select-none" style={{ paddingTop: 14 }}>
              {rows.map((midi) => {
                const isBlack = [1, 3, 6, 8, 10].includes(midi % 12);
                const inScale = scale.pcs.has(midi % 12);
                const isRoot = midi % 12 === scale.rootPc;
                return (
                  <div
                    key={midi}
                    data-testid={`piano-roll-row-${midi}`}
                    data-scale={isRoot ? "root" : inScale ? "in" : "out"}
                    className={`flex items-center justify-end pr-1 font-['JetBrains_Mono'] text-[9px] ${
                      isRoot ? "bg-accent/25 text-accent" : isBlack ? "bg-black/50 text-text-dim" : "bg-white/[0.06] text-text-sub"
                    }`}
                    style={{ height: rowH }}
                  >
                    {midiToNoteName(midi)}
                  </div>
                );
              })}
            </div>

            <div ref={gridWrapRef} data-testid="piano-roll-grid-wrap" className="min-w-0 flex-1">
              <div ref={scrollRef} className="overflow-x-auto">
                <div className="flex" style={{ height: 14 }}>
                  {Array.from({ length: stepCount }, (_, i) => (
                    <div
                      key={i}
                      className={`shrink-0 border-l font-['JetBrains_Mono'] text-[8px] leading-[14px] ${
                        i % stepsPerBar === 0 ? "border-accent/40 text-accent" : "border-line-subtle text-transparent"
                      }`}
                      style={{ width: cellW }}
                    >
                      {i % stepsPerBar === 0 ? String(i / stepsPerBar + 1) : ""}
                    </div>
                  ))}
                </div>

                <div className="min-w-0">
                  <div
                    role="grid"
                    aria-label={t("roll_grid_aria")}
                    data-testid="piano-roll-grid"
                    onPointerDown={handleGridPointerDown}
                    onPointerMove={handleGridPointerMove}
                    onPointerUp={handleGridPointerUp}
                    onPointerCancel={handleGridPointerUp}
                    className="relative touch-none select-none"
                    style={{ height: rows.length * rowH, width: gridW }}
                  >
                    {rows.map((midi, rowIdx) => {
                      const isRoot = midi % 12 === scale.rootPc;
                      const inScale = scale.pcs.has(midi % 12);
                      return (
                        <div
                          key={midi}
                          className={`absolute inset-x-0 border-b border-line-subtle/40 ${
                            isRoot ? "bg-accent/[0.07]" : !inScale ? "bg-black/25" : rowIdx % 2 === 0 ? "bg-white/[0.02]" : ""
                          }`}
                          style={{ top: rowIdx * rowH, height: rowH }}
                        />
                      );
                    })}
                    {Array.from({ length: stepCount }, (_, i) => (
                      <div
                        key={`bar-${i}`}
                        className={`absolute inset-y-0 border-l ${i % stepsPerBar === 0 ? "border-accent/30" : "border-line-subtle/30"}`}
                        style={{ left: i * cellW }}
                      />
                    ))}

                    {loopLen < stepCount && (
                      <div
                        className="absolute inset-y-0 bg-black/45"
                        style={{ left: loopLen * cellW, width: (stepCount - loopLen) * cellW }}
                        data-testid="piano-roll-loop-boundary"
                      />
                    )}

                    <div
                      ref={playheadRef}
                      className="pointer-events-none absolute inset-y-0 w-[2px] bg-accent/80"
                      style={{ left: 0, opacity: 0, willChange: "transform" }}
                      data-testid="piano-roll-playhead"
                    />

                    {notes.map((note) => {
                      const top = (hiPitch - note.midi) * rowH;
                      if (top < 0 || top > rows.length * rowH) return null;
                      const selected = selectedSet.has(noteId(note));
                      const width = Math.max(cellW * 0.9, note.gate * cellW);
                      return (
                        <div
                          key={`note-${note.stepIdx}-${note.midi}`}
                          data-testid={`piano-roll-note-${note.stepIdx}-${note.midi}`}
                          data-selected={selected ? "true" : "false"}
                          data-chord-size={notesAtStep(note.stepIdx).length}
                          data-gate={note.gate.toFixed(3)}
                          data-velocity={note.velocity}
                          title={`${midiToNoteName(note.midi)} · ${t("roll_note_meta", { gate: note.gate.toFixed(2), velocity: note.velocity })}`}
                          className={`absolute overflow-hidden rounded-[3px] border ${selected ? "border-white/80 ring-1 ring-white/70" : "border-black/40"}`}
                          style={{
                            left: note.stepIdx * cellW + 1,
                            top: top + 1,
                            width: width - 2,
                            height: rowH - 2,
                            backgroundColor: velocityColor(note.velocity),
                            opacity: selected ? 1 : 0.86,
                          }}
                        >
                          {cellW >= 22 && (
                            <span className="pointer-events-none absolute inset-0 flex items-center px-1 font-['JetBrains_Mono'] text-[8px] text-black/70">
                              {midiToNoteName(note.midi)}
                            </span>
                          )}
                          {tool === "pointer" && width > 14 && (
                            <span
                              data-testid={`piano-roll-resize-${note.stepIdx}-${note.midi}`}
                              className="absolute inset-y-0 right-0 w-[5px] cursor-ew-resize bg-black/35"
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
                                };
                                e.currentTarget.setPointerCapture?.(e.pointerId);
                              }}
                            />
                          )}
                        </div>
                      );
                    })}

                    {marquee && (
                      <div
                        data-testid="piano-roll-marquee"
                        className="pointer-events-none absolute border border-accent/80 bg-accent/15"
                        style={{
                          left: Math.min(marquee.stepFrom, marquee.stepTo) * cellW,
                          width: (Math.abs(marquee.stepTo - marquee.stepFrom) + 1) * cellW,
                          top: (hiPitch - Math.max(marquee.pitchFrom, marquee.pitchTo)) * rowH,
                          height: (Math.abs(marquee.pitchTo - marquee.pitchFrom) + 1) * rowH,
                        }}
                      />
                    )}
                  </div>
                </div>

                {showVelocityLane && (
                  <div
                    data-testid="piano-roll-velocity-lane"
                    aria-label={t("roll_velocity_lane")}
                    className="relative mt-1 cursor-ns-resize rounded border border-line-subtle bg-[#0f1116]"
                    style={{ height: VELOCITY_LANE_H, width: gridW }}
                    onPointerDown={handleVelocityPointerDown}
                    onPointerMove={handleGridPointerMove}
                    onPointerUp={handleGridPointerUp}
                    onPointerCancel={handleGridPointerUp}
                  >
                    {[32, 64, 96].map((line) => (
                      <div key={line} className="absolute inset-x-0 border-t border-line-subtle/40" style={{ bottom: `${(line / 127) * 100}%` }} />
                    ))}
                    {[...new Map(notes.map((n) => [n.stepIdx, n])).values()].map((note) => {
                      const onStep = notesAtStep(note.stepIdx);
                      const stepSelected = onStep.every((n) => selectedSet.has(noteId(n)));
                      return (
                        <div
                          key={`vel-${note.stepIdx}`}
                          data-testid={`piano-roll-velocity-bar-${note.stepIdx}`}
                          data-velocity={note.velocity}
                          data-chord-size={onStep.length}
                          className={`absolute bottom-0 ${stepSelected ? "bg-white/80" : "bg-accent/70"}`}
                          style={{
                            left: note.stepIdx * cellW + 1,
                            width: Math.max(2, cellW - 2),
                            height: `${(note.velocity / 127) * 100}%`,
                          }}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* -------------------------------------------------- selection inspector */}
          <div className="flex flex-wrap items-center gap-3 border-t border-line-subtle pt-2">
            <span className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.08em] text-text-sub">{t("roll_selected")}</span>
            <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim" data-testid="piano-roll-selected-count">
              {t("roll_selected_count", { count: selection.length })}
            </span>
            {focusNote ? (
              <>
                <span className="font-['JetBrains_Mono'] text-[11px] text-text" data-testid="piano-roll-selected-name">
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
                    className="w-14 rounded border border-line bg-panel2 px-1 py-0.5 text-[10px] text-text"
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
                    className="w-14 rounded border border-line bg-panel2 px-1 py-0.5 text-[10px] text-text"
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
                    className="w-16 rounded border border-line bg-panel2 px-1 py-0.5 text-[10px] text-text"
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
                    className="w-16 rounded border border-line bg-panel2 px-1 py-0.5 text-[10px] text-text"
                  />
                </label>
                <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim" data-testid="piano-roll-selected-meta">
                  {focusNote.gate.toFixed(2)} × {t("roll_steps_unit")} · {focusNote.velocity}
                </span>
              </>
            ) : (
              <span className="text-[10px] text-text-dim">{t("roll_select_hint")}</span>
            )}
            <span className="ml-auto text-[10px] text-text-dim">
              {t("roll_quantise_hint")} · {t("roll_snap_hint")}
              {isZh ? "" : ""}
            </span>
          </div>
        </>
      )}
    </section>
  );
};
