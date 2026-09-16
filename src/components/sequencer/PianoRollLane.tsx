import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Minus, Music2, Plus, Trash2, X } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";
import type { SequencerAction } from "../../features/sequencer/useSequencerStore";
import type { SequencerPattern } from "../../types/genre";
import {
  addNote,
  isRollEditableTrack,
  loopLengthOf,
  moveNote,
  notesFromTrack,
  removeNote,
  resizeNote,
  setNoteVelocity,
  transposeTrack,
  visiblePitchRange,
  type RollStepNote,
} from "../../features/sequencer/rollModel";
import { midiToNoteName } from "./PitchPickerModal";

/**
 * Piano-roll lane (item ⑦).
 *
 * Edits **the studio's own pattern**, one melodic track at a time: the grid reads `steps`/`pitch`/
 * `gate`/`velocity` and every gesture commits through the store, so the step matrix and the roll
 * are two views of one object — there is no second copy to synchronise, and undo comes from the
 * same history.
 *
 * A deliberate consequence of borrowing the idea from the sibling `synth` project rather than its
 * data model: notes here start on a grid step and their length is a multiple of one step (the
 * engine's `gate`), because that is what a step pattern *is*. Free-floating notes would require a
 * different pattern format, a different engine path and a different exporter, so the UI states the
 * constraint instead of pretending otherwise.
 *
 * Gestures: click an empty cell to draw (and hear) a note, drag a note to move it in time/pitch,
 * drag its right edge to change length, Delete removes, arrow keys nudge, and a velocity slider
 * edits the selected note. One commit per gesture, never per pointermove — the studio's history
 * budget is measured in whole-pattern snapshots.
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

const ROW_H = 18;
const BASE_CELL_W = 26;
const ZOOMS = [14, 20, 26, 34, 46];

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
  const [zoomIdx, setZoomIdx] = useState(2);
  const [octaveShift, setOctaveShift] = useState(0);
  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const [draft, setDraft] = useState<SequencerPattern | null>(null);
  const dragRef = useRef<{ fromStep: number; mode: "move" | "resize"; startGate: number } | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);

  const cellW = ZOOMS[zoomIdx];
  const track = pattern.tracks[activeTrackIdx];
  const editable = isRollEditableTrack(track);

  // While a gesture is in flight the roll renders its own draft, so the drag is smooth without
  // pushing a history entry per pointermove; the studio grid updates on release.
  const view = draft ?? pattern;
  const viewTrack = view.tracks[activeTrackIdx];
  const notes = useMemo(() => notesFromTrack(viewTrack), [viewTrack]);
  const [baseLo, baseHi] = useMemo(() => visiblePitchRange(notes), [notes]);
  // Octave buttons scroll the window rather than moving the notes: a roll needs to reach pitches
  // the current material does not use yet.
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
    return [lo, Math.min(hi, lo + span + (hi - lo - span))] as [number, number];
  }, [baseLo, baseHi, octaveShift]);
  const rows = useMemo(() => {
    const out: number[] = [];
    for (let p = hiPitch; p >= loPitch; p--) out.push(p);
    return out;
  }, [loPitch, hiPitch]);

  const loopLen = loopLengthOf(viewTrack, stepCount);
  const velocityOfSelected = selectedStep === null ? null : notes.find((n) => n.stepIdx === selectedStep) ?? null;

  const commitDraft = useCallback(
    (next: SequencerPattern) => {
      commit({ type: "COMMIT_PATTERN", pattern: next });
    },
    [commit]
  );

  const melodicTracks = pattern.tracks
    .map((tr, idx) => ({ tr, idx }))
    .filter(({ tr }) => isRollEditableTrack(tr));

  /**
   * The drawer lives below the step matrix, so on a laptop it can open below the fold. Bringing it
   * into view on open is the difference between "I clicked the button and nothing happened" and a
   * usable editor.
   */
  useEffect(() => {
    // Guarded because jsdom (the unit-test environment) implements no `scrollIntoView`; the
    // browser behaviour is what matters and is asserted by the E2E matrix.
    const node = sectionRef.current;
    if (node && typeof node.scrollIntoView === "function") node.scrollIntoView({ block: "nearest" });
  }, []);

  // Escape closes, like every other floating panel in the studio.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if ((e.key === "Delete" || e.key === "Backspace") && selectedStep !== null) {
        e.preventDefault();
        commitDraft(removeNote(pattern, activeTrackIdx, selectedStep, stepCount));
        setSelectedStep(null);
      }
      if (selectedStep !== null && e.key.startsWith("Arrow")) {
        const stepDelta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        const pitchDelta = e.key === "ArrowUp" ? 1 : e.key === "ArrowDown" ? -1 : 0;
        if (stepDelta === 0 && pitchDelta === 0) return;
        e.preventDefault();
        const note = notes.find((n) => n.stepIdx === selectedStep);
        if (!note) return;
        const next = moveNote(
          pattern,
          activeTrackIdx,
          selectedStep,
          selectedStep + stepDelta,
          note.midi + pitchDelta,
          stepCount
        );
        if (next !== pattern) {
          commitDraft(next);
          setSelectedStep(selectedStep + stepDelta);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, selectedStep, notes, pattern, activeTrackIdx, stepCount, commitDraft]);

  const cellFromEvent = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const stepIdx = Math.floor(x / cellW);
    const rowIdx = Math.floor(y / ROW_H);
    const midi = rows[rowIdx];
    return { stepIdx, midi };
  };

  const handleGridPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!editable) return;
    const { stepIdx, midi } = cellFromEvent(e);
    if (stepIdx < 0 || stepIdx >= stepCount || midi === undefined) return;
    const existing = notes.find((n) => n.stepIdx === stepIdx);
    if (existing) {
      setSelectedStep(stepIdx);
      onAudition(activeTrackIdx, existing.midi, existing.velocity, existing.gate);
      dragRef.current = { fromStep: stepIdx, mode: "move", startGate: existing.gate };
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      return;
    }
    const next = addNote(pattern, activeTrackIdx, stepIdx, midi, stepCount);
    commitDraft(next);
    setSelectedStep(stepIdx);
    onAudition(activeTrackIdx, midi, 100, 0.8);
  };

  const handleGridPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || !editable) return;
    const { stepIdx, midi } = cellFromEvent(e);
    if (midi === undefined || stepIdx < 0 || stepIdx >= stepCount) return;

    if (drag.mode === "move" && stepIdx !== drag.fromStep) {
      const current = (draft ?? pattern);
      const note = notesFromTrack(current.tracks[activeTrackIdx]).find((n) => n.stepIdx === drag.fromStep);
      if (!note) return;
      const next = moveNote(current, activeTrackIdx, drag.fromStep, stepIdx, midi, stepCount);
      setDraft(next);
      drag.fromStep = stepIdx;
      setSelectedStep(stepIdx);
    }
  };

  const handleGridPointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (draft) {
      commitDraft(draft);
      setDraft(null);
      // Audition whatever the gesture landed on, so the ear confirms what the eye just did.
      const landed = notesFromTrack(draft.tracks[activeTrackIdx]).find((n) => n.stepIdx === selectedStep);
      if (landed) onAudition(activeTrackIdx, landed.midi, landed.velocity, landed.gate);
    }
    void drag;
  };

  const applyOp = (op: (p: SequencerPattern) => SequencerPattern) => {
    const next = op(pattern);
    if (next !== pattern) commitDraft(next);
  };

  const selectedNote: RollStepNote | null = velocityOfSelected;

  return (
    <section
      ref={sectionRef}
      data-testid="piano-roll"
      aria-label={`${t("roll_title")} ${track?.name ?? ""}`}
      className="flex flex-col gap-2"
    >
      {/* ---------------------------------------------------------------- toolbar */}
      <header className="flex flex-wrap items-center gap-1.5 border-b border-line-subtle pb-2">
        <span className="flex items-center gap-1.5 font-['JetBrains_Mono'] text-[10px] font-bold uppercase tracking-[0.1em] text-text">
          <Music2 className="h-3.5 w-3.5 text-accent" />
          {t("roll_title")}
        </span>

        {/* Track selector: only roles whose pitch means something. */}
        <select
          value={activeTrackIdx}
          onChange={(e) => {
            setSelectedStep(null);
            setDraft(null);
            onSelectTrack(Number(e.target.value));
          }}
          aria-label={t("roll_track")}
          data-testid="piano-roll-track"
          className="rounded-lg border border-line bg-panel2 px-2 py-1 font-['JetBrains_Mono'] text-[11px] text-text outline-none"
        >
          {melodicTracks.map(({ tr, idx }) => (
            <option key={`${tr.track_id}-${idx}`} value={idx}>
              {tr.name}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setOctaveShift((v) => v + 12)}
            title={t("roll_octave_up")}
            aria-label={t("roll_octave_up")}
            data-testid="piano-roll-octave-up"
            className="rounded-lg border border-line bg-panel2 p-1 text-text-sub hover:text-text"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setOctaveShift((v) => v - 12)}
            title={t("roll_octave_down")}
            aria-label={t("roll_octave_down")}
            data-testid="piano-roll-octave-down"
            className="rounded-lg border border-line bg-panel2 p-1 text-text-sub hover:text-text"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setZoomIdx((v) => Math.max(0, v - 1))}
            title={t("roll_zoom_out")}
            aria-label={t("roll_zoom_out")}
            data-testid="piano-roll-zoom-out"
            className="rounded-lg border border-line bg-panel2 p-1 text-text-sub hover:text-text"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoomIdx((v) => Math.min(ZOOMS.length - 1, v + 1))}
            title={t("roll_zoom_in")}
            aria-label={t("roll_zoom_in")}
            data-testid="piano-roll-zoom-in"
            className="rounded-lg border border-line bg-panel2 p-1 text-text-sub hover:text-text"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => applyOp((p) => transposeTrack(p, activeTrackIdx, 12, stepCount))}
          disabled={!editable}
          data-testid="piano-roll-transpose-up"
          className="rounded-lg border border-line bg-panel2 px-2 py-1 font-['JetBrains_Mono'] text-[10px] text-text-sub hover:text-text disabled:opacity-40"
        >
          +12
        </button>
        <button
          type="button"
          onClick={() => applyOp((p) => transposeTrack(p, activeTrackIdx, -12, stepCount))}
          disabled={!editable}
          data-testid="piano-roll-transpose-down"
          className="rounded-lg border border-line bg-panel2 px-2 py-1 font-['JetBrains_Mono'] text-[10px] text-text-sub hover:text-text disabled:opacity-40"
        >
          −12
        </button>

        <button
          type="button"
          onClick={() => {
            if (selectedStep === null) return;
            applyOp((p) => removeNote(p, activeTrackIdx, selectedStep, stepCount));
            setSelectedStep(null);
          }}
          disabled={selectedStep === null}
          data-testid="piano-roll-delete"
          title={t("roll_delete_note")}
          aria-label={t("roll_delete_note")}
          className="rounded-lg border border-line bg-panel2 p-1 text-text-sub hover:text-rose-300 disabled:opacity-40"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={onClose}
          data-testid="piano-roll-close"
          aria-label={t("roll_close")}
          title={t("roll_close")}
          className="ml-auto rounded-lg border border-line bg-panel2 p-1 text-text-sub hover:text-accent"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      {!editable ? (
        <div className="rounded-lg border border-line bg-panel2/60 p-3 text-[11px] text-text-sub" data-testid="piano-roll-not-melodic">
          {t("roll_not_melodic")}
        </div>
      ) : (
        <>
          {/* ------------------------------------------------------------ grid */}
          <div className="flex gap-2">
            {/* Pitch gutter */}
            <div className="shrink-0 select-none" style={{ paddingTop: 14 }}>
              {rows.map((midi) => (
                <div
                  key={midi}
                  className={`flex items-center justify-end pr-1 font-['JetBrains_Mono'] text-[9px] ${
                    midi % 12 === 0 ? "text-accent" : "text-text-dim"
                  }`}
                  style={{ height: ROW_H }}
                >
                  {midiToNoteName(midi)}
                </div>
              ))}
            </div>

            <div className="min-w-0 flex-1 overflow-x-auto">
              {/* Step ruler */}
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

              {/* Note grid */}
              <div
                role="grid"
                aria-label={t("roll_grid_aria")}
                data-testid="piano-roll-grid"
                onPointerDown={handleGridPointerDown}
                onPointerMove={handleGridPointerMove}
                onPointerUp={handleGridPointerUp}
                onPointerCancel={handleGridPointerUp}
                className="relative touch-none select-none"
                style={{ height: rows.length * ROW_H, width: stepCount * cellW }}
              >
                {/* Row backgrounds + bar lines */}
                {rows.map((midi, rowIdx) => (
                  <div
                    key={midi}
                    className={`absolute inset-x-0 border-b border-line-subtle/40 ${
                      midi % 12 === 0 ? "bg-white/[0.04]" : rowIdx % 2 === 0 ? "bg-white/[0.015]" : ""
                    }`}
                    style={{ top: rowIdx * ROW_H, height: ROW_H }}
                  />
                ))}
                {Array.from({ length: stepCount }, (_, i) => (
                  <div
                    key={`bar-${i}`}
                    className={`absolute inset-y-0 border-l ${
                      i % stepsPerBar === 0 ? "border-accent/30" : "border-line-subtle/30"
                    }`}
                    style={{ left: i * cellW }}
                  />
                ))}

                {/* Polymeter: steps past the loop never sound, so they are visibly out of play. */}
                {loopLen < stepCount && (
                  <div
                    className="absolute inset-y-0 bg-black/45"
                    style={{ left: loopLen * cellW, width: (stepCount - loopLen) * cellW }}
                    data-testid="piano-roll-loop-boundary"
                  />
                )}

                {/* Playhead */}
                {isPlaying && currentStep >= 0 && currentStep < stepCount && (
                  <div
                    className="absolute inset-y-0 w-[2px] bg-accent/80"
                    style={{ left: currentStep * cellW }}
                    data-testid="piano-roll-playhead"
                  />
                )}

                {/* Notes */}
                {notes.map((note) => {
                  const top = (hiPitch - note.midi) * ROW_H;
                  if (top < 0 || top > rows.length * ROW_H) return null;
                  const selected = note.stepIdx === selectedStep;
                  const width = Math.max(cellW * 0.9, note.gate * cellW);
                  return (
                    <div
                      key={`note-${note.stepIdx}`}
                      data-testid={`piano-roll-note-${note.stepIdx}`}
                      data-selected={selected ? "true" : "false"}
                      title={`${midiToNoteName(note.midi)} · ${t("roll_note_meta", { gate: note.gate.toFixed(2), velocity: note.velocity })}`}
                      className={`absolute rounded-[3px] border ${
                        selected ? "border-accent bg-accent/70" : "border-accent/50 bg-accent/40"
                      }`}
                      style={{
                        left: note.stepIdx * cellW + 1,
                        top: top + 1,
                        width: width - 2,
                        height: ROW_H - 2,
                        // Velocity is the note's opacity, as in the sibling project's roll.
                        opacity: 0.45 + (note.velocity / 127) * 0.55,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          {/* Selected note inspector */}
          <div className="flex flex-wrap items-center gap-3 border-t border-line-subtle pt-2">
            <span className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.08em] text-text-sub">
              {t("roll_selected")}
            </span>
            {selectedNote ? (
              <>
                <span className="font-['JetBrains_Mono'] text-[11px] text-text" data-testid="piano-roll-selected-name">
                  {midiToNoteName(selectedNote.midi)}
                </span>
                <label className="flex items-center gap-2 text-[10px] text-text-sub">
                  {t("roll_velocity")}
                  <input
                    type="range"
                    min={1}
                    max={127}
                    value={selectedNote.velocity}
                    onChange={(e) =>
                      setDraft(setNoteVelocity(pattern, activeTrackIdx, selectedNote.stepIdx, Number(e.target.value), stepCount))
                    }
                    onPointerUp={() => {
                      if (draft) commitDraft(draft);
                      setDraft(null);
                    }}
                    aria-label={t("roll_velocity")}
                    data-testid="piano-roll-velocity"
                    className="h-1.5 w-28 accent-[#f5b73d]"
                  />
                </label>
                <label className="flex items-center gap-2 text-[10px] text-text-sub">
                  {t("roll_length")}
                  <input
                    type="range"
                    min={0.1}
                    max={2}
                    step={0.05}
                    value={selectedNote.gate}
                    onChange={(e) =>
                      setDraft(resizeNote(pattern, activeTrackIdx, selectedNote.stepIdx, Number(e.target.value), stepCount))
                    }
                    onPointerUp={() => {
                      if (draft) commitDraft(draft);
                      setDraft(null);
                    }}
                    aria-label={t("roll_length")}
                    data-testid="piano-roll-length"
                    className="h-1.5 w-24 accent-[#f5b73d]"
                  />
                </label>
                <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim" data-testid="piano-roll-selected-meta">
                  {selectedNote.gate.toFixed(2)} × step · {selectedNote.velocity}
                </span>
              </>
            ) : (
              <span className="text-[10px] text-text-dim">{t("roll_select_hint")}</span>
            )}
            <span className="ml-auto text-[10px] text-text-dim">{t("roll_quantise_hint")}</span>
          </div>
        </>
      )}
    </section>
  );
};
