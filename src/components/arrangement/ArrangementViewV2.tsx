/**
 * The arrangement, laid out the way the manual-reading survey says every DAW lays one out.
 *
 * `docs/ARRANGEMENT_UI_DESIGN.md` §1 records the structure from REAPER's, Bitwig's, Cubase's and Live's own manuals:
 * time runs left to right, tracks stack downward, a **fixed track-header column sits beside a lane area**, the
 * **ruler spans the lanes only**, and a global transport bar runs across the top. §8 ranks what to build first, and
 * this file is that ranking in DOM order:
 *
 * 1. one global toolbar — transport, position, tempo, bars, snap (visible value **and** toggle), loop, zoom, and the
 *    editor tabs on the right (§8 items 1 and 6);
 * 2. a 240 px fixed header column beside the lanes, the ruler over the lanes only (§8 item 2);
 * 3. a ruler label that subdivides with zoom (§8 item 3);
 * 7. track headers carrying Bitwig's documented minimum set in Bitwig's order (§8 item 7, §2);
 * 9. one region per track with a non-editable note miniature (§8 item 9, §4 option (a));
 * 4/5. a playhead and a play-start as **two** indicators, and a loop brace settable by pointer **and** keyboard
 *    (§8 items 4 and 5, with §7's WCAG 2.5.7 requirement).
 *
 * **What is deliberately absent**: modal tool palettes, editing region contents in the lane, and 24 px controls on
 * touch. Those are §5's rejected conventions, and each has a reason recorded there rather than here.
 *
 * **It owns no rules, still.** Adding, muting, arming, moving takes and playing are pure functions with their own
 * criteria; this file holds the arrangement value, the view state that is genuinely a view's (which bar, which zoom,
 * which tab), and calls them. That is the discipline the previous version of this file documented, kept.
 *
 * Two pieces of view state are **the model's** rather than this file's, which is worth saying because it looks like
 * an inconsistency: the loop range and the record-arm flag live on `arrangement` (arm) or in `loopRange` (loop) so
 * that "what will repeat" and "which track is armed" survive a re-render for reasons other than a click.
 *
 * ⭐ **The loop brace used to be a picture, and this file said so** — "a ruler-level loop that no audio path reads".
 * That was true: `AudioEngine.setLoopRange` existed and the transport read it, but nothing on this route ever called
 * it. The brace is now handed to the transport through {@link ArrangementViewV2Props.setTransportLoopRange}, in the
 * steps the engine counts rather than the bars the ruler draws (`features/arrangement/loopSteps.ts` holds the
 * conversion and the reason it is not a constant). The record-arm flag is still not persisted.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Redo2, Undo2 } from "lucide-react";
import type { ArrangementV2, TrackKindV2, TrackRegion } from "../../types/arrangementV2";
import { createArrangementFromTemplate, quantizeArrangementNoteLengths, rampArrangementNoteVelocity, legatoNotesInRect, arpeggiateNotesInRect, stampChordInRect, setTrackFlag } from "../../data/arrangementEdits";
import { setterCommand } from "../../data/arrangementHistory";
import { GENRES_MAP } from "../../data/genres";
import { arrangementSeededFromGenre } from "../../data/arrangementProjection";
import {
  addTakeCommand,
  addTrackCommand,
  addTrackNoteCommand,
  changeTrackKindCommand,
  moveTrackNoteCommand,
  removeTrackCommand,
  removeTrackNoteCommand,
  selectTrackTakeCommand,
  setArrangementBarsCommand,
  setArrangementTempoCommand,
  setCollapsedCommand,
  setTrackFlagCommand,
  setTrackGainCommand,
  setTrackNoteLengthCommand,
  setTrackPanCommand,
  setTrackRegionCommand,
  setTrackSampleCommand,
  toggleStepCommand,
} from "../../data/arrangementHistory";
import { useArrangementHistory } from "../../features/arrangement/useArrangementHistory";
import { DEFAULT_SAMPLER_ASSET } from "../../data/defaultContent";
import type { CaptureOutcome } from "../../audio/captureTake";
import { DEFAULT_PX_PER_BAR, MAX_PX_PER_BAR, MIN_PX_PER_BAR } from "./ArrangementRulerV2";
import { TrackListV2, type InstrumentChoice } from "./TrackListV2";
import { TakeSelectorV2 } from "./TakeSelectorV2";
import { RecordButtonV2 } from "./RecordButtonV2";
import { ArrangementKeyboardV2 } from "./ArrangementKeyboardV2";
import { PianoRollV2 } from "./PianoRollV2";
import { ScoreV2 } from "./ScoreV2";
import { ArrangementRulerV2 } from "./ArrangementRulerV2";
import { ArrangementLaneV2 } from "./ArrangementLaneV2";
import { TrackHeaderV2 } from "./TrackHeaderV2";
import { LoopBraceV2 } from "./LoopBraceV2";
import { loopRangeAt, type LoopRange } from "../../data/arrangementLoop";
import { compileArrangementToPattern } from "../../data/arrangementCompile";
import { loopStepsFor } from "../../features/arrangement/loopSteps";
import { useLanguage } from "../../i18n/LanguageContext";
import { NewProjectPanelV2 } from "./NewProjectPanelV2";
import { KIND_LABEL_KEY, TRACK_KIND_ORDER } from "./kindLabels";
import { ArrangementFileEntriesV2 } from "./ArrangementFileEntriesV2";
import { ImportInstrumentMappingV2 } from "./ImportInstrumentMappingV2";
import { useArrangementFileActions } from "../../features/arrangement/useArrangementFileActions";
import { playArrangementV2, type ArrangementPlayer, type ArrangementTransportState } from "../../audio/playArrangementV2";
import { stepsPerBarFor, STEPS_PER_BAR, STEPS_PER_BEAT } from "../../data/noteEvents";
import { announcer } from "../../platform/announcer";
import { applyForm } from "../../data/arrangementFormPlan";
import { transposeNotesInRange } from "../../data/arrangementEdits";
import { useInitialAutoPlay } from "../../features/sequencer/hooks/useInitialAutoPlay";
import { useSyncExternalStore } from "react";
import { SaveIndicator } from "../sequencer/SaveIndicator";
import {
  getArrangementSaveStatusSnapshot,
  subscribeArrangementSaveStatus,
} from "../../features/sequencer/projectDb";
import type { AudioEngine } from "../../audio/AudioEngine";
import { useMidiInput } from "../../features/sequencer/hooks/useMidiInput";

/**
 * The snap values the toolbar offers, coarsest to finest. The **value** is shown, because a toggle's state is not a value.
 *
 * ⭐ **The ladder starts at a whole note, and that is the change the drag forced.** Until the region could be dragged the
 * value was a label with one consumer (the ruler's corner readout), so the four finest steps were enough to *say*; now
 * that it decides where an edit lands, the coarsest step has to be the unit the surface actually has — **one bar**,
 * which is what the ruler's cells are, what the lane's gridlines are, and what the ported Studio editor gesture and the
 * loop brace both round to. Values are named as note values, which in 4/4 *are* fractions of a bar (a whole note is a
 * bar, a quarter note is a beat, a sixteenth is a sixteenth of a bar) — see `SNAP_BARS`.
 */
export const SNAP_VALUES = ["1/1", "1/2", "1/4", "1/8", "1/16", "1/32"] as const;
export type SnapValue = (typeof SNAP_VALUES)[number];
/**
 * ⭐ **The default is a bar**, not the sixteenth the label carried while it did nothing.
 *
 * A bar is the unit the region drag was ported with (`ArrangementPanel` rounds every move to `ARRANGEMENT_BAR_WIDTH`)
 * and the only unit this surface can *show*: the ruler has one cell per bar and the lane one gridline per bar, which is
 * the reason `LoopBraceV2` refuses a loop at bar 2.5 in its own comment. A finer default would mean the ported gesture
 * arrived behaving differently from the one it was ported from.
 */
const DEFAULT_SNAP: SnapValue = "1/1";

/**
 * ⭐ **A snap value in bars** — the number `ArrangementLaneV2` quantises a drag to.
 *
 * The note value *is* the fraction of a bar only in 4/4 (1/1 = 4 beats = 1 bar, 1/4 = 1 beat, 1/16 = a sixteenth of a
 * bar), and that is the assumption `arrangementLanes.ts` already makes with its `BEATS_PER_BAR = 4`: the lane derives
 * every beat position from it. So the table below is the note value read as a bar fraction, and nothing here invents a
 * second reading of "how long is a bar".
 *
 * All six are exact binary fractions, so a quantised position is exact too — no drift accumulates over a drag.
 */
export const SNAP_BARS: Record<SnapValue, number> = {
  "1/1": 1,
  "1/2": 0.5,
  "1/4": 0.25,
  "1/8": 0.125,
  "1/16": 0.0625,
  "1/32": 0.03125,
};

/** The zoom step, applied on every press of − and +. The ends are the ruler's own exported bounds. */
const ZOOM_FACTOR = 1.5;

/** ⭐ Stands in for a host that has no engine yet, so the MIDI hook is called unconditionally and plays into nothing. */
const noEngineRef: React.MutableRefObject<AudioEngine | null> = { current: null };

export interface ArrangementViewV2Props {
  songId: string;
  /** Starting a capture, injected so the view needs no microphone to be rendered — the same seam the capture itself uses. */
  capture: () => Promise<CaptureOutcome>;
  /**
   * ⭐ **The project this view is showing, when one was stored.**
   *
   * It is an **initial** value and not a controlled one, on purpose: every edit below is a pure function over the
   * arrangement in state, and threading the arrangement back out through a prop would mean this view could be rendered
   * mid-drag from a value a slower writer still believes in. The host replaces the project by **re-keying this
   * component** (`key={projectId}`) when it loads another one — which is the same mechanism React already uses for
   * "this is a different thing now", rather than a second one invented here.
   *
   * Absent means the host stores nothing, which is how every criterion that renders this view on its own keeps working:
   * the chooser is shown, and an arrangement created from it lives in this component's state exactly as before.
   */
  initialArrangement?: ArrangementV2;
  /**
   * ⭐ **Every change to the arrangement, reported so the host can store it** — and the reason this file needed no
   * rewriting: the view still owns the arrangement while it is open, and this says when it changed.
   *
   * ⚠️ **A report, not a write.** Persistence, its debounce and its degradation reporting belong to the storage layer;
   * a view that wrote to IndexedDB would be a second saver, and the studio's own history says where that ends.
   */
  onArrangementChange?: (arrangement: ArrangementV2) => void;
  /**
   * ⭐ **The project the chooser just created, and the name the panel decided for it** — the one moment a name exists
   * and an arrangement exists at the same time.
   *
   * Absent for a host that stores nothing, which is why it is optional: the arrangement is then held exactly as it was
   * before this change, and every existing criterion that renders this view keeps working untouched.
   */
  onCreateProject?: (name: string, arrangement: ArrangementV2) => void;
  /**
   * ⭐ **Why a stored project could not be read**, when one could not. Shown above the chooser rather than swallowed —
   * the alternative is a person looking at a New Project screen while their work sits unreadable in storage.
   */
  loadProblem?: string;
  /** The bar the transport is on; the take selector marks what would be heard there. */
  bar?: number;
  /**
   * ⭐ The engine, injected — `playAudioLanes` with the app's context and destination in the application, a fake in a criterion.
   *
   * Optional on purpose: the view can be rendered and judged **before** the engine is wired, so the interface work and the audio wiring are not one indivisible change. When it is absent the play button says so
   * rather than pretending to play.
   */
  player?: ArrangementPlayer;
  /**
   * The instruments a sampler track may play, injected like `player` and `capture` — the view needs no catalogue to be rendered or judged, and the application decides where the list comes from.
   */
  instruments?: readonly InstrumentChoice[];
  /**
   * Where the playhead is, in bars — **the static position, for a host that has no live transport to follow.**
   *
   * **Separate from `bar` on purpose, and that is the point of the brief's §8 item 4**: Bitwig's manual draws a
   * Global Playhead and a Play Start Marker as two indicators, and folding "where playback is" into "where a play
   * begins" is exactly the conflation that model exists to avoid. Absent means bar 0 — the picture a fresh
   * arrangement should show — not "hide the playhead".
   *
   * ⭐ **When `player.transport` exists, the live position supersedes this and the prop is only the first paint.** It has to work that way rather than arriving as a fresh `playheadBar` each step: a step is a sixteenth of a beat, and
   * re-rendering this route sixteen times a second over a bar number is the main-thread work `playheadBus.ts` says the studio removed. The live path therefore writes the position into the DOM, which is also what makes the prop still
   * the honest answer for a host that only has a fixed position to show.
   */
  playheadBar?: number;
  /**
   * ⭐ **The onboarding's request to start playing once the engine exists**, and the acknowledgement that retires it.
   *
   * These arrive from `App` the same way they used to reach the studio: `StudioView` consumed them where the engine and the
   * transport both exist, and on this route that place is here — this view owns the player and its transport, and it is
   * deliberately renderable with `player` absent, so `ready` is simply whether the player is there yet.
   */
  initialAutoPlay?: boolean;
  onClearInitialAutoPlay?: () => void;
  /**
   * ⭐ **The engine's ref, when the host has one.** Optional for the reason `player` is: this view renders and is judged
   * without an engine, and the MIDI input needs the ref rather than the value — a device event arrives after the render that
   * subscribed, so reading `engineRef.current` at that moment is the difference between playing a note and playing a stale
   * engine.
   */
  engineRef?: React.MutableRefObject<AudioEngine | null>;
  /**
   * ⭐ **Where the loop brace goes, in the transport's own unit — steps, half-open `[start, end)`.**
   *
   * A function rather than the engine itself, for the reason `player` is a seam: this view can be rendered and judged
   * with no audio at all, and a host that has no transport simply does not pass one — every existing criterion
   * therefore keeps the behaviour it had (the brace moves, nothing is called), and the prop being absent is the same
   * fact as "there is no engine to loop".
   *
   * ⚠️ **Not bars.** The brace is stored in bars (`data/arrangementLoop`), the engine counts steps
   * (`AudioEngine.setLoopRange` is compared against the scheduler's own step index), and the conversion between them
   * is `features/arrangement/loopSteps.ts`'s whole job. The name says the unit because that is the one thing a caller
   * cannot see from the type: `[number, number]` looks the same in both.
   *
   * `null` means "no loop", which is also how the transport is told that the brace was switched off.
   */
  setTransportLoopRange?: (range: [number, number] | null) => void;
  /**
   * ⭐ **Where the transport's own position goes, in steps — the seek a ruler click means.**
   *
   * The ruler draws `<button aria-label="跳到第 4 小节">` with `cursor: pointer`, and until this prop existed the
   * click moved a **decorative** play-start marker and nothing else: `AudioEngine` had no way to be told a position,
   * so the transport started at bar 1 however the ruler was clicked (measured in `/var/tmp/uxaudit/seek3.json`).
   * The engine gained `seek(step)` for exactly this call, and this is its only caller.
   *
   * **The unit is the engine's** — steps of the compiled pattern, the same one `setTransportLoopRange` is in — and the
   * conversion is this view's, because this view is the one that knows `stepsPerBarFor(arrangement.timeSignature)`.
   *
   * ⚠️ **Nothing about the recorded lanes here.** This moves the transport; the sampler half is told by
   * `player.pause()`, which is the only seam that carries a step to it (see {@link onRulerSelect}).
   *
   * **It returns where the transport landed**, because the engine clamps a seek to the pattern it actually holds and
   * the ruler can draw bars that pattern does not have (a template-created arrangement states no `bars`, so the ruler
   * reads eight and the compile answers one). The view draws the play-start marker from the landing, so an
   * out-of-range click shows the position the transport really got rather than the one it asked for.
   */
  seekTransport?: (step: number) => number | undefined;
}

export function ArrangementViewV2({ songId, capture, bar = 0, player, instruments, playheadBar, initialArrangement, onArrangementChange, onCreateProject, loadProblem, setTransportLoopRange, seekTransport, initialAutoPlay, onClearInitialAutoPlay, engineRef }: ArrangementViewV2Props) {
  const { t, isZh } = useLanguage();
  /**
   * ⭐ **A new project starts by choosing what it is** — which is Logic's `Choose a Project`, and the owner's "there is no good new-project entry". `undefined` means the choice has not been made, and the panel is
   * what the route shows until it is; only then is there an arrangement to edit.
   */
  /**
   * ⭐ **`choosing`, not an optional arrangement** — and the difference is not stylistic. An `ArrangementV2 | undefined` cannot be narrowed inside the hooks, so every callback would need a guard whose absence is a
   * runtime bug rather than a type error. A separate flag keeps the arrangement always valid, so "no arrangement yet" is a thing the component *says* rather than a thing it must remember to check.
   *
   * ⭐ **And it starts `false` when a project was handed in**: a stored project has already been chosen, so nothing
   * should ask again. That single line is what makes "refresh, and the arrangement is still there" true rather than a
   * chooser drawn over the work that was being restored.
   */
  const [choosing, setChoosing] = useState(initialArrangement === undefined);
  const [arrangement, setArrangement] = useState<ArrangementV2>(() => initialArrangement ?? createArrangementFromTemplate(songId, undefined, "synth"));
  /**
   * ⭐ **The arrangement's history, sitting between every edit and the state it edits.**
   *
   * `src/data/arrangementHistory.ts` holds the model and the reason for it (an action stack built out of this project's
   * pure edits, with §28's citations); `useArrangementHistory` is the React binding. **What matters here is that no
   * call site below writes the arrangement directly**: each one builds the command for what it is about to do and hands
   * it to `commit`, which is what makes "every edit in this view is undoable" a property of the wiring rather than a
   * promise each handler has to keep.
   *
   * ⚠️ **The two exceptions are deliberate and named**, because a rule with silent exceptions is not a rule: the
   * chooser's `Create` and the file entries' import both **replace the arrangement wholesale**, and both are the "first
   * action" every product in §28 treats as un-undoable — Ableton says it outright: "Creating or opening a Set is
   * treated as the first action in the Undo History and therefore cannot be undone". They still go through
   * `setArrangement`, so the persistence effect sees them exactly as it sees everything else.
   */
  const { commit, undo: undoEdit, redo: redoEdit, canUndo, canRedo, undoAction, redoAction } = useArrangementHistory(arrangement, setArrangement);
  const [selectedTrackId, setSelectedTrackId] = useState<string | undefined>(undefined);
  /** ⭐ **What the roll has marked.** The roll owns the mark; the toolbar acts on it, so the view keeps a copy. */
  const [rollSelection, setRollSelection] = useState<readonly { pitch: number; startBeats: number }[]>([]);
  /** ⭐ The interval the transpose buttons move a marked span by. */
  const [semitones, setSemitones] = useState(12);
  /**
   * ⭐ **Which bar the strips show, which is not the transport's bar.** `bar` above is where the transport is in the underlying song and is what the take selector marks; this is a view choice — which sixteen squares a row draws. They are separate because an arrangement of eight bars still
   * has one transport, and a person looking at bar three has not thereby moved the playhead.
   */
  const [stripBar, setStripBar] = useState(0);
  /**
   * ⭐ **Which editor is open.** Logic puts Piano Roll, Score and Smart Tempo behind tabs because they are three ways of looking at one performance, and switching between them must not move anything. Two of them here: the roll writes, the score reads.
   *
   * The tabs sit at the **right of the global toolbar** because that is where Cubase and Logic put the editor's view
   * switch, and the brief keeps them out of the mode space: switching a tab is a change of *reading*, not a change of
   * tool, and it moves neither the playhead nor the scroll position.
   */
  const [editor, setEditor] = useState<"roll" | "score">("roll");
  /** The zoom, in pixels per bar — **one number shared by the ruler and the lanes**, so bar 5 cannot sit above beat 3. */
  const [pixelsPerBar, setPixelsPerBar] = useState(DEFAULT_PX_PER_BAR);
  /** The visible snap value and whether snapping is actually on. Two facts, two pieces of state. */
  const [snap, setSnap] = useState<SnapValue>(DEFAULT_SNAP);
  // ⭐ The track the two editing actions act on: the selected one, or the first that carries notes.
  const editableTrackId =
    selectedTrackId ??
    arrangement.tracks.find((track) => (arrangement.notesByTrack?.[track.id]?.length ?? 0) > 0)?.id;
  const [snapOn, setSnapOn] = useState(true);
  /**
   * The loop brace. `undefined` is "no loop", which is the state Live starts in; the toolbar's Loop button turns one
   * on at the bar the view is looking at rather than at bar 1, because the bar on screen is the bar the user means.
   */
  const [loopRange, setLoopRange] = useState<LoopRange | undefined>(undefined);

  /**
   * ⭐ **Two switches that belong to the performance, not to the work.** The studio played a metronome and counted in before it
   * started, and the engine still supports both -- `setMetronome` and `setCountIn` are on it, under its own "Metronome, Count-In
   * and Loop Region" heading. Nothing on this surface ever turned them on, so the manual documented a feature the code could not
   * reach. They live here rather than on the arrangement, because a click track is not part of the piece.
   */
  const [metronome, setMetronome] = useState(false);
  const [countIn, setCountIn] = useState(false);
  /**
   * The play-start marker, in bars. Clicking the ruler sets it — Bitwig's "single click in the upper ruler sets the play start".
   *
   * ⭐ **And it is now a marker of something real**: see `onRulerSelect` below, which moves the transport to the same bar.
   */
  const [playStartBar, setPlayStartBar] = useState(0);
  /** Which row's instrument library is open. One at a time: two panels would make the header column jump height. */
  const [openLibraryFor, setOpenLibraryFor] = useState<string | undefined>(undefined);
  /** What the last play reported — **zero is shown, not hidden**: "nothing was planned" is a fact a user should see rather than a silent no-op. */
  const [played, setPlayed] = useState<number | undefined>(undefined);
  /** Why nothing played, when nothing did — the engine can be unreachable or its instrument unresolvable, and both are answers rather than silence. */
  const [playProblem, setPlayProblem] = useState<string | undefined>(undefined);
  /**
   * ⭐ **The window between the press and the transport.** `playArrangementV2` awaits its preparation -- the catalogue, the
   * sample loads, the engine standing its synthesisers down -- and that wait is real: it is seconds on a cold catalogue, and a
   * Play button that says nothing for seconds is the silent control this workstream keeps removing.
   *
   * It reports that a wait is happening and not a percentage: the arrangement's preparation reports its progress to the studio's
   * loader, not to this view, and a bar that could not move would be a claim this surface cannot support.
   */
  const [preparing, setPreparing] = useState(false);
  /**
   * ⭐ **A device event is a performance, not an edit.** Web MIDI and the computer keyboard play through the engine without
   * touching the arrangement, which is what the studio did and what a person plugging in a keyboard expects. The host passes its
   * engine ref; a view rendered without one -- a criterion, or the gate before a tap -- still calls the hook, because React has no
   * conditional hooks, and plays into nothing.
   */
  const [midiNotice, setMidiNotice] = useState<string | undefined>(undefined);
  const midiPattern = useMemo(
    () => compileArrangementToPattern(arrangement, arrangement.notesByTrack ?? {}),
    [arrangement]
  );
  useMidiInput({
    pattern: midiPattern,
    engineRef: engineRef ?? noEngineRef,
    isZh,
    showToast: setMidiNotice,
    isKeyboardMode: true,
  });
  /**
   * ⭐ **Whether the work is safe, read from the store that does the writing.** The arrangement saves automatically, so the
   * interface owes the person one fact it never stated: that a change has landed. The status and its subscription already
   * existed in `projectDb`; the component that renders them already existed too, and this is the entry that was missing.
   */
  const saveStatus = useSyncExternalStore(subscribeArrangementSaveStatus, getArrangementSaveStatusSnapshot);

  /**
   * ⭐ The engine is told, not the arrangement: the click track and the count-in are properties of playback. A view without an
   * engine -- a criterion, or the gate before a tap -- simply does nothing here.
   */
  useEffect(() => {
    engineRef?.current?.setMetronome(metronome);
  }, [engineRef, metronome]);
  useEffect(() => {
    engineRef?.current?.setCountIn(countIn);
  }, [engineRef, countIn]);

  const bars = arrangement.bars ?? 8;
  const headerBars = arrangement.tracks.length === 0 ? 0 : bars;
  const laneWidth = Math.max(1, headerBars) * pixelsPerBar;

  /**
   * ⭐ **The two readings the inverses need.**
   *
   * An action stack is only as good as what it knows about the value an edit displaced: undoing a gain change needs the
   * gain that was there, undoing a note removal needs the note. Both are read **from the arrangement on screen** rather
   * than from a copy kept alongside it — which is the arrangement this whole change is built on, and the reason there is
   * still exactly one place the arrangement lives.
   */
  const trackFor = (trackId: string) => arrangement.tracks.find((candidate) => candidate.id === trackId);
  const noteFor = (trackId: string, at: { pitch: number; startBeats: number }) =>
    (arrangement.notesByTrack?.[trackId] ?? []).find((note) => note.pitch === at.pitch && note.startBeats === at.startBeats);

  const onAddTrack = useCallback(
    (kind: TrackKindV2, name: string) => {
      const command = addTrackCommand(kind, name);
      commit(command);
      /**
       * The new track becomes the selected one: a track you just created is the track you meant to act on.
       *
       * ⭐ **Read off the command, not off a re-render.** The id is minted inside the edit, and a `useEffect` that
       * waited for the next arrangement would select the track one frame after the person pressed — which is long
       * enough for a second press to land on the wrong one.
       */
      setSelectedTrackId(command.addedTrackId);
    },
    [commit]
  );

  const selected = useMemo(() => arrangement.tracks.find((track) => track.id === selectedTrackId), [arrangement, selectedTrackId]);

  /**
   * ⭐ **The arrangement's way in and out** — the door this route shipped without.
   *
   * `scoreNotes` is what the Score tab is *reading* (the one `NoteEvent[]` the roll and the stave both draw), so the
   * MusicXML export writes the notes on screen rather than a second reading of the model. The hook owns the sentences
   * and the busy flag; the toolbar and the score's header own the buttons.
   */
  const scoreNotes = useMemo(() => (selected ? (arrangement.notesByTrack?.[selected.id] ?? []) : []), [arrangement, selected]);
  const files = useArrangementFileActions({
    arrangement,
    onArrangement: setArrangement,
    scoreNotes,
    scoreBars: bars,
    ...(selected ? { scoreTitle: selected.name } : {}),
  });

  /**
   * The toolbar's Loop button.
   *
   * ⭐ It does not flip a boolean: a loop that is "on" with no range is a state the model cannot express and the
   * ruler cannot draw, so switching it on **creates a range** at the bar the view is looking at. Switching it off
   * removes the range, which is the only honest way to say "no loop".
   */
  const toggleLoop = useCallback(() => {
    setLoopRange((current) => (current ? undefined : loopRangeAt(bars, stripBar)));
  }, [bars, stripBar]);

  /**
   * ⭐ **A finished region gesture, as one undo entry.**
   *
   * The lane reports the range a gesture displaced and the range it landed on, **once**, when the pointer comes up
   * (`ArrangementLaneV2` holds the in-flight range itself). That is what makes a drag one press of ⌘Z: this stack has
   * no coalescing, so an edit per pointer move would put forty entries under one gesture. `setTrackRegionCommand`
   * carries both ranges, so the inverse is the same setter with the range that was there — and `setTrackRegion`
   * returns the arrangement itself when the two normalise the same, which is how a drag that lands where it started
   * records nothing at all.
   */
  const onRegionChange = useCallback(
    (trackId: string, before: TrackRegion, after: TrackRegion) => {
      commit(setTrackRegionCommand(trackId, before, after));
    },
    [commit]
  );

  /**
   * ⭐ **The transport's own state, which the buttons report.**
   *
   * Two facts, two costs. Which button is lit changes twice a session, so it is React state. **Where the playhead is changes sixteen times a second, so it is not** — it is written into the two DOM nodes below, which is the rule
   * `playheadBus.ts` records for the studio and the reason `ArrangementTransport` is a subscription rather than a value.
   */
  const [playing, setPlaying] = useState(false);
  /**
   * ⭐ **Whether Stop would return the transport somewhere** — the fact its disabled state reports.
   *
   * It used to be `!playing`, which was right only while Pause *was* a stop: a real pause leaves the transport at a
   * position, and a Stop disabled there is the same missing action the studio's Stop exists to restore. "There is
   * something to return from" is `running || step > 0`, and it is derived from the same report the playhead is drawn
   * from rather than from a second source that could disagree with it.
   */
  const [hasPosition, setHasPosition] = useState(false);
  const playheadRef = useRef<HTMLSpanElement | null>(null);
  const positionRef = useRef<HTMLSpanElement | null>(null);
  /**
   * The last bar the transport reported, **kept in a ref and read at render time**.
   *
   * That read is the whole point: a re-render for any other reason (the running flag, the zoom) must not put the playhead back where the last React render thought it was. Without it a zoom change would rewind the picture to bar one and the next
   * step would snap it forward again.
   */
  const playheadBarRef = useRef(playheadBar ?? 0);

  const transport = player?.transport;
  /** A transport we can actually follow. Absent means the prop above is the only position there is, which is how a host with no live transport still draws one. */
  const liveTransport = transport !== undefined;

  /**
   * ⭐ **How many of the engine's steps a bar holds**, read from the arrangement's own time signature rather than
   * assumed to be sixteen: `stepsPerBarFor` is the function the compile already divides by, so the step the transport
   * reports and the bar the ruler draws cannot disagree — which is the same reason the ruler and the lanes share one
   * `pixelsPerBar`.
   */
  const stepsPerBar = stepsPerBarFor(arrangement.timeSignature);

  /**
   * ⭐ **How long the pattern the transport will hold actually is — the number a seek has to be clamped against.**
   *
   * The engine cannot answer this before the first press: it learns its length from `setPattern`, which the player
   * sends when a pass starts. The **view** can, because the compile is the same call the brace below already makes, and
   * it is the compile's answer that matters rather than the ruler's — the two disagree for an arrangement that states
   * no `bars` (the ruler falls back to eight, the compile to one), which is the disagreement
   * `features/arrangement/loopSteps.ts` documents at length.
   *
   * Clamped here rather than only in the engine so the **marker can be drawn from a length this view knows**: a click
   * on a bar past the pattern's end moves the transport to the last step that exists and the play-start triangle goes
   * with it, instead of the triangle claiming bar six over a one-bar pattern.
   *
   * Nothing is compiled when there is no transport to seek (a view rendered as a picture, every existing criterion) —
   * the same rule the brace's memo follows.
   */
  const seekPatternSteps = useMemo(() => {
    if (seekTransport === undefined) return undefined;
    const compiled = compileArrangementToPattern(arrangement, arrangement.notesByTrack ?? {});
    return compiled.totalSteps ?? compiled.tracks[0]?.steps.length ?? STEPS_PER_BAR;
  }, [seekTransport, arrangement]);

  /**
   * ⭐ **The ruler click, which is a seek — the whole of the audit's hardest finding.**
   *
   * ## What it used to do
   *
   * Two `setState` calls and nothing else. The ruler draws a `<button>` whose name is 「跳到第 4 小节」 and whose
   * cursor is a pointer, so the interface promised a move it could not make: measured on the live build
   * (`/var/tmp/uxaudit/seek3.json`, load 18.4), the click moved `arrangement-play-start` from x 245 to 629 while
   * `arrangement-position` stayed `1.1` and all sixteen sampled steps after the next Play were `1.1…1.4`. Ableton's
   * arrangement view states the contract this was pretending to honour — *"You can click anywhere within a track to
   * move the insert marker and set a new play position"* — so this was one step in a DAW and **no** steps here.
   *
   * ## The three things a click now does, and why each is needed
   *
   * 1. **The view's own two facts** (which strip of bars is shown, where the play-start triangle is drawn). Unchanged.
   * 2. **The transport is moved to the same bar**, in the engine's unit: `seekTransport(next * stepsPerBar)`, clamped
   *    to `seekPatternSteps`. `stepsPerBar` is the shared number above, so bar *N* here is the same step the playhead
   *    and the brace mean by bar *N* — `loopSteps.ts`'s own reading, applied to the one other caller of it — and the
   *    clamp is the compile's own length for the same reason the brace's is.
   * 3. ⭐ **The player is told, by `pause()` — and without this the seek is a lie for every recorded lane.**
   *
   *    `playerFromEngine.play` holds its own idea of where a pass starts (`pausedAtStep`) and, when it has none,
   *    **stops the engine first** — which is `currentStep = 0` — and then re-plans the sampler lanes from step 0. So a
   *    bare `seek` would be wiped by the very press it was meant to affect, and the arrangement's recorded lanes would
   *    sound the top of the piece while the engine played bar six: the §26 "locating loses the first beats" failure.
   *    `pause()` is the seam that carries the step across (`pausedAtStep = engine.getCurrentStep()`, and the sampler
   *    scheduler receives `{ fromStep }` on the play that follows), and its documented meaning — *hold the transport's
   *    place, so the next play continues from there* — is exactly what setting a play position is. **Order matters**:
   *    the seek is written first, so the step the player captures is the step the user clicked.
   *
   * ⚠️ **A click while the transport is running relocates and holds it**, rather than relocating mid-flight. That is
   * deliberate and it is the honest limit of doing this without touching the recorded-lane scheduler: a pass that is
   * already planned cannot be re-planned mid-flight, so continuing to play would leave the engine at bar six and the
   * recordings on their old plan. Holding both halves at the same step is a smaller lie than a seek that only half
   * happens.
   *
   * ⭐ **And the marker follows the landing, not the request.** `seek` answers with the step it clamped to, so a click
   * on a bar the pattern does not reach leaves the triangle where the transport actually is. A marker drawn from the
   * requested bar would be the same decorative triangle this change removes, one clamp further along.
   */
  const onRulerSelect = useCallback(
    (next: number) => {
      setStripBar(next);
      /**
       * The bar the transport can actually reach: the ruler draws eight bars whatever the pattern holds, so a click
       * past the end lands on the last step that exists rather than on a step the scheduler would wrap away.
       */
      const limit = seekPatternSteps === undefined ? Number.POSITIVE_INFINITY : Math.max(0, seekPatternSteps - 1);
      const target = Math.min(next * stepsPerBar, limit);
      const landed = seekTransport?.(target);
      /**
       * The ruler click sets where a play will begin, which is Bitwig's gesture and why the play-start marker is here
       * — and it is drawn from the transport's own answer when there is a transport to ask. No engine (a view rendered
       * as a picture, every existing criterion) keeps the requested bar, which is exactly what it drew before.
       */
      setPlayStartBar(Math.floor((landed ?? target) / stepsPerBar));
      // And the half that owns the recorded lanes — see the note above; this is not an optional extra.
      player?.pause?.();
    },
    [stepsPerBar, seekPatternSteps, seekTransport, player]
  );

  /**
   * ⭐ **The brace, in the transport's unit — converted once, here, and stated in the one place both units meet.**
   *
   * The compile is asked for the length it will give the transport rather than the length the ruler draws, because
   * the two answers differ for a file that states no `bars`: the ruler falls back to eight (`DEFAULT_REGION_BARS`) and
   * the compile to one. `loopStepsFor` clamps to the compile's answer, so a brace past the end of the pattern cannot
   * hand the scheduler a window it will sit in silently. The whole reading, unit included, is in
   * `features/arrangement/loopSteps.ts`.
   *
   * Skipped entirely when there is no brace or no engine to tell: a view rendered without a transport must not pay for
   * a compile it cannot use, and — more importantly — must not hand anyone a range.
   */
  const transportLoopRange = useMemo(() => {
    if (setTransportLoopRange === undefined || loopRange === undefined) return null;
    const compiled = compileArrangementToPattern(arrangement, arrangement.notesByTrack ?? {});
    /**
     * The compile always states the length, and the fallback below is only here because `SequencerPattern.totalSteps`
     * is optional in the type: it is **the engine's own fallback, read off `setPattern`**, so the number this clamp
     * uses and the number the transport will hold cannot be two different readings of "how long is the pattern".
     */
    const patternSteps = compiled.totalSteps ?? compiled.tracks[0]?.steps.length ?? STEPS_PER_BAR;
    return loopStepsFor(loopRange, stepsPerBar, patternSteps);
  }, [setTransportLoopRange, loopRange, stepsPerBar, arrangement]);

  /**
   * ⭐ **The brace changing is the transport being told, immediately — including when it changes to nothing.**
   *
   * An effect rather than a call inside `onChange`, because there are two ways the brace moves (the toolbar's toggle
   * and `LoopBraceV2`'s own drag/keyboard, which both write `loopRange`) and a third way for it to become stale (the
   * arrangement is edited underneath it). One effect on the converted value covers all of them, and an edit that
   * shortens the pattern re-converts rather than leaving the transport looping a window that no longer exists.
   *
   * The transport applies it to the **running** scheduler, not only to the next play: `schedulerLoop` reads
   * `this.loopRange` on every pass of its look-ahead loop, so a brace dragged during playback is in force within the
   * look-ahead rather than needing a stop — and if the brace has moved past the playhead, the very next pass pulls it
   * back into the window. That a loop region can be adjusted while the transport runs is the mainstream reading rather
   * than an invention: Live's manual says of a clip's loop region that "it is possible to adjust the looping region
   * during playback" (§10.7.3), and REAPER ships a preference for whether changing loop points also seeks playback. It
   * is also what makes the brace a control rather than a label.
   */
  useEffect(() => {
    setTransportLoopRange?.(transportLoopRange);
  }, [setTransportLoopRange, transportLoopRange]);

  useEffect(() => {
    if (transport === undefined) return;
    const apply = ({ step, playing: running }: ArrangementTransportState) => {
      const bar = step / stepsPerBar;
      playheadBarRef.current = bar;
      const line = playheadRef.current;
      if (line) line.style.left = `${bar * pixelsPerBar}px`;
      const readout = positionRef.current;
      if (readout) {
        const barNumber = Math.floor(bar) + 1;
        const beatNumber = Math.floor((step % stepsPerBar) / STEPS_PER_BEAT) + 1;
        readout.textContent = `${barNumber}.${beatNumber}`;
        readout.title = t("arrangement_position_value", { bar: String(barNumber), beat: String(beatNumber) });
      }
      // Guarded, so sixteen calls a second do not become sixteen renders.
      setPlaying((current) => (current === running ? current : running));
      // The other guarded fact: a stop is meaningful while the transport runs or holds a position it can return from.
      const returnable = running || step > 0;
      setHasPosition((current) => (current === returnable ? current : returnable));
    };
    // The first paint reads rather than waits: a playhead that only appears on the next step is a playhead that is missing for as long as the transport is stopped.
    apply(transport.read());
    return transport.subscribe(apply);
    /**
     * ⭐ `choosing` is a dependency because **the two nodes do not exist until the project panel is dismissed** — the arrangement is behind Logic's "Choose a Project", and an effect that ran only at mount would write to two null refs and never be
     * given another chance until the first step of a play. That is the difference between a readout that says bar one and a readout that says nothing at all.
     */
  }, [transport, pixelsPerBar, stepsPerBar, choosing, t]);

  /**
   * ⭐ **Every arrangement this view holds is reported, including the first one.**
   *
   * The first one matters as much as the others: a project restored from storage is reported again (the write is
   * identical, so it is free), and a project created from the chooser is reported the moment it exists — which is
   * "a new project saves itself" stated as one effect rather than as a special case in the create handler.
   *
   * ⚠️ The report is **the arrangement value**, not a "something changed" signal, because the writer needs the value
   * and asking the writer to read it back is the round trip this avoids.
   */
  const reportArrangement = onArrangementChange;
  useEffect(() => {
    if (reportArrangement === undefined) return;
    reportArrangement(arrangement);
  }, [arrangement, reportArrangement]);

  /**
   * ⭐ **Undo and redo, once, for both the buttons and the keys.**
   *
   * A second copy of "call the stack and say what happened" behind the keyboard is how a button and its shortcut start
   * disagreeing. The announcement matters for the same reason it does in the studio: the buttons' `disabled` state is a
   * *visual* answer, and a screen reader gets no pixels from it — so an empty history says so out loud rather than
   * looking like a key that does not work, which is the defect this repository's U7 names.
   */
  const handleUndo = useCallback(() => {
    announcer.announce(t(undoEdit() ? "transport_undo_done" : "transport_nothing_to_undo"));
  }, [undoEdit, t]);

  const handleRedo = useCallback(() => {
    announcer.announce(t(redoEdit() ? "transport_redo_done" : "transport_nothing_to_redo"));
  }, [redoEdit, t]);

  /**
   * ⭐ **`Ctrl/Cmd+Z` and `Ctrl/Cmd+Shift+Z`, on the arrangement route only — because this component is only mounted
   * there.** The same reasoning `App.tsx` uses for the `?` popup's scope: a key that is advertised on a route where
   * nothing listens is a promise the route cannot keep, and mounting the listener with the surface is what makes the
   * advertisement true rather than merely intended. The studio's `useTransportShortcuts` is not extended for the same
   * reason — the two surfaces have two functions with two histories, exactly as Cubase keeps a MixConsole history
   * apart from the project's (`Alt/Opt+Z` vs `Ctrl+Z`).
   *
   * **Two guards, and each is a defect this repository already paid for:**
   *
   * 1. **A text-entry control keeps its own keys.** The project-name field is a browser input with its own undo stack;
   *    stealing `Ctrl+Z` inside it would make the app's edit history move while the cursor is in a name, which is both
   *    surprising and, in the studio's own words for this guard, "a focused control swallows transport keys only when
   *    it is a text-entry control". The shape is copied from `useTransportShortcuts.isTextEntryTarget`, including the
   *    `range` exemption, so the two surfaces cannot disagree about what a text field is.
   * 2. **An open modal dialog wins.** `Esc`-dismissable dialogs own the keyboard while they are up (U-09), and undoing
   *    an arrangement behind a modal would change a document the person cannot see.
   *
   * **Both Ctrl and Cmd are accepted on every platform** rather than the studio's `isMac ? meta : ctrl`, because the
   * binding this fulfils is literally "Ctrl/Cmd+Z" and a web surface that ignores the other modifier is a key that
   * works for some people and not others. `Ctrl/Cmd+Y` is accepted as well, which is the alias the studio's toolbar
   * table already declares for redo.
   */
  useEffect(() => {
    const isTextEntryTarget = (el: HTMLElement | null): boolean => {
      /**
       * ⚠️ **The target is not always an element.** A synthetic `keydown` dispatched on `window` (a criterion, or any
       * caller that wants to drive the handler directly) arrives with `window` as its target, and `window` has no
       * `closest` — so the studio's version of this guard, which the rest of it is copied from, throws there. A guard
       * against stealing a keystroke must never be the thing that breaks the keystroke.
       */
      if (!el || typeof el.closest !== "function") return false;
      if (el.isContentEditable) return true;
      const editableHost = el.closest<HTMLElement>("[contenteditable]");
      if (editableHost && editableHost.isContentEditable) return true;
      const control = el.closest<HTMLElement>("input, textarea, select");
      if (!control) return false;
      if (control.tagName === "TEXTAREA" || control.tagName === "SELECT") return true;
      const type = (control as HTMLInputElement).type?.toLowerCase() || "text";
      return type !== "range";
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (typeof document !== "undefined" && document.querySelector('[role="dialog"][aria-modal="true"]') !== null) return;
      if (isTextEntryTarget(event.target as HTMLElement | null)) return;
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) handleRedo();
        else handleUndo();
      } else if (key === "y") {
        event.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleUndo, handleRedo]);

  const play = useCallback(async () => {
    if (player === undefined) return;
    setPreparing(true);

    /**
     * ⭐ **The window is re-stated on the press, not merely left where the effect put it.**
     *
     * Pressing Play is the moment the transport reads it: `AudioEngine.play` resumes the pattern at `loopRange[0]`
     * and `schedulerLoop` wraps inside it. The effect above already keeps it current, so this is deliberately
     * **idempotent** — it is here because the press is the one point where a caller can see the two facts together
     * ("this arrangement, from this bar") and because the engine's pattern is replaced on every play
     * (`playerFromEngine.play` calls `setPattern`), which is exactly when a window measured against the old pattern
     * would be wrong. It is sent **before** the player starts the transport, never after.
     */
    setTransportLoopRange?.(transportLoopRange);
    // ⭐ The arrangement's own notes, not an empty map: they are content and they live with the tracks.
    const result = await playArrangementV2(arrangement, arrangement.notesByTrack ?? {}, player);
    setPreparing(false);
    setPlayed(result.planned);
    /**
     * ⭐ **A reason, shown.** The engine path answers with why when it cannot play — not ready, no transport, a
     * sampler note no region covers — and an interface that discarded that would put the user back in front of a
     * Play button that does nothing for no stated reason, which is the failure this whole workstream keeps removing.
     */
    setPlayProblem(result.reason ?? result.problems?.join("; "));
    // Heard as well as seen: the running flag below is a visual state, and a screen reader gets no pixels from it.
    if (result.reason === undefined) announcer.announce(t("transport_playback_started"));
  }, [arrangement, player, t, setTransportLoopRange, transportLoopRange]);

  /**
   * ⭐ **The onboarding's auto-play request, consumed where the engine and the transport both exist.**
   *
   * `StudioView` used to be that place, and this view is it on this route: it owns the player, so `ready` is simply whether the
   * player is there yet — the view is deliberately renderable without one, and that is exactly the state the hook has to wait
   * through rather than start into.
   */
  useInitialAutoPlay({
    requested: Boolean(initialAutoPlay),
    ready: Boolean(player),
    play,
    onConsumed: () => onClearInitialAutoPlay?.(),
  });

  const stop = useCallback(() => {
    player?.stop?.();
    // The report goes with it: once stopped, "planned N lane events" described a play that is over.
    setPlayed(undefined);
    setPlayProblem(undefined);
    announcer.announce(t("transport_playback_stopped"));
  }, [player, t]);

  /**
   * ⭐ **The second half of the toggle, which used to be `stop`.**
   *
   * The button above is labelled `arrangement_pause` and titled Pause while the transport runs, and it called `stop()` —
   * so the label promised a pause and the press returned the playhead to the top, which is the owner's report
   * ("the button says Pause and it jumps back to the top"). `pause()` holds the step, the playhead and the timecode, and
   * the next play continues from them; **Stop** below is the control that means "back to the top", and it still does.
   *
   * The "planned N lane events" report is deliberately *not* cleared: that pass is not over, it is held, and the next
   * press finishes it.
   */
  const pause = useCallback(() => {
    player?.pause();
    announcer.announce(t("transport_playback_paused"));
  }, [player, t]);

  /**
   * ⭐ **Play is the studio's own Play/Pause toggle**, which is the project's convention for this control rather than an invention: `Toolbar.tsx` labels the same button with `toolbar_play`/`toolbar_pause` and swaps its fill, and
   * `useTransportControls.handleTogglePlay` pauses the transport when it is already playing.
   *
   * The running state is read **from the transport, not from React**, so a press that lands while the engine is still awaiting `ctx.resume()` toggles the right way. React state is for the paint; the engine is the truth.
   */
  const togglePlay = useCallback(() => {
    const running = player?.transport?.read().playing ?? playing;
    if (running) {
      pause();
      return;
    }
    void play();
  }, [player, playing, play, pause]);

  /**
   * ⭐ **Writing a note is heard, through the engine's own audition** — the same seam the keyboard below the roll already uses, rather than a second synthesis path invented for the roll. `audition` resolves one note of one instrument through the SFZ path and sounds it at that note's rate; the roll reports a pitch and this sounds it, which is what keeps the roll a reading of the notes rather than a caller of the engine.
   *
   * **One preview at a time.** A click that lands on the next pitch replaces the last voice instead of stacking on it, so sliding a note up a scale is one note moving rather than a chord nobody asked for; the voice is released when the editor goes or another track is selected, because a preview that outlives its editor is a note nobody can stop.
   */
  const auditioned = useRef<number | undefined>(undefined);
  const releaseAudition = useCallback(() => {
    const midi = auditioned.current;
    auditioned.current = undefined;
    if (midi !== undefined) player?.releaseNote?.({ midi, trackId: selectedTrackId });
  }, [player, selectedTrackId]);
  useEffect(() => releaseAudition, [releaseAudition]);

  // ⭐ The early return sits **after every hook**, because a conditional hook changes their order: the first version of this had it above `useCallback` and produced six type errors, whose real content was a React bug.
  if (choosing) {
    return (
      <div className="flex flex-col gap-2">
        {/**
         * ⭐ **A stored project this build could not read is said out loud, above the chooser.**
         *
         * `docs/OPEN_WORK.md` §27.2 draws the line exactly here: refusing to read an arrangement whose track kind no
         * longer exists is not a compatibility cost, it is "do not hide a breakage". The sentence names the field
         * (it comes from the validator), so the alternative — a chooser drawn in silence over work that is still on
         * disk — is not what a person sees.
         */}
        {loadProblem !== undefined && (
          <p data-testid="arrangement-load-problem" role="alert" className="p-3 text-xs text-text">
            {`${t("arrangement_load_problem")}: ${loadProblem}`}
          </p>
        )}
        <NewProjectPanelV2
          onCreate={(templateId, blankKind, name, genreId) => {
            // ⭐ The panel reports the choice; **what an arrangement is made of** is `createArrangementFromTemplate`'s business, including the default track a blank project still gets.
            // ⭐ **A chosen genre decides the content.** The genre's arranged pattern is projected into an arrangement —
            // the same two steps the protocol creator uses — and a template is only the fallback when no genre is chosen.
            const chosenGenre = genreId === undefined ? undefined : GENRES_MAP[genreId];
            const created = chosenGenre
              ? arrangementSeededFromGenre(songId, chosenGenre)
              : createArrangementFromTemplate(songId, templateId, blankKind);
            setArrangement(created);
            setSelectedTrackId(undefined);
            setChoosing(false);
            /**
             * ⭐ **The host is told what was created, with the name the panel decided** — and this is the only path that
             * can name it, because the name exists nowhere else by the time the arrangement is on screen. A host that
             * stores nothing (`onCreateProject` absent, which is how the arrangement's own criteria render this) simply
             * does not get the report.
             */
            onCreateProject?.(name, created);
          }}
        />
      </div>
    );
  }

  /** A transport button. 44 px tall like everything else in the bar: the arrangement is a phone surface too. */
  const toolButton = "h-11 shrink-0 rounded border border-[rgb(var(--d-line))] px-2 text-xs text-text disabled:opacity-50";
  /**
   * ⭐ The same button while the transport is running, in the project's own active-control idiom: the accent as the
   * fill and `--d-on-accent` as the ink — exactly the pair the editor tabs and the Loop/Snap switches use, so the
   * transport lights up the way every other lit control on this surface does rather than in a colour of its own.
   */
  const toolButtonActive =
    "h-11 shrink-0 rounded border border-[rgb(var(--d-accent))] bg-[rgb(var(--d-accent))] px-2 text-xs font-bold text-[rgb(var(--d-on-accent))] disabled:opacity-50";
  /**
   * Undo and Redo carry a glyph rather than a word, so they get their own square from the same tokens as `toolButton`:
   * 44 px like everything else in this bar, and **the same `disabled:opacity-50` the other controls here use** rather
   * than a colour of its own. No new palette value is introduced, which is also why the skin gates have nothing new to
   * measure.
   */
  const toolButtonIcon =
    "flex h-11 w-11 shrink-0 items-center justify-center rounded border border-[rgb(var(--d-line))] text-text disabled:opacity-50";

  return (
    <div data-testid="arrangement-view-v2" className="flex flex-col gap-2 p-2 text-text">
      {/**
       * ⭐ **One global toolbar** (§8 item 1), 44 px tall. Live's Control Bar is the model: transport, position,
       * tempo, grid and zoom in one strip rather than scattered over the surface, because a person adjusting the
       * grid should not have to find which panel owns it today.
       *
       * It is one row of controls at `--arr-toolbar-h` and may wrap on a narrow window; wrapping is the right failure
       * here, because the alternative is shrinking a target below the 44 px the surface is held to.
       */}
      <div
        data-testid="arrangement-toolbar"
        role="toolbar"
        aria-label={t("arrangement_toolbar_label")}
        className="flex flex-wrap items-center gap-1"
        style={{ minHeight: "var(--arr-toolbar-h)" }}
      >
        {/**
          * ⭐ **The two editing actions the studio's grid had.** A ramp is craft and a quantiser is time-keeping. Both act on
          * the selected track, or on the first track that actually carries notes, so an arrangement with music in it is never
          * a dead end when nothing is selected.
          */}
        <button
          type="button"
          data-testid="arrangement-ramp-velocity"
          className="px-2 py-1 rounded text-xs text-text opacity-90"
          disabled={editableTrackId === undefined}
          onClick={() => {
            if (editableTrackId === undefined) return;
            // ⭐ **An edit a person can take back.** The ramp and the quantiser go through the same command path as every
            // other change, with the whole arrangement as the value, so undo restores what was there before.
            commit(setterCommand("Ramp velocity", (_current, value) => value, arrangement, rampArrangementNoteVelocity(arrangement, editableTrackId)));
          }}
        >
          Ramp velocity
        </button>
        <button
          type="button"
          data-testid="arrangement-quantize-lengths"
          className="px-2 py-1 rounded text-xs text-text opacity-90"
          disabled={editableTrackId === undefined}
          onClick={() => {
            if (editableTrackId === undefined) return;
            // ⭐ A `1/n` note is `4/n` beats in four four; `off` or anything unreadable falls back to a sixteenth.
            const divisor = Number(snap.split("/")[1]) || 16;
            commit(setterCommand("Quantise lengths", (_current, value) => value, arrangement, quantizeArrangementNoteLengths(arrangement, editableTrackId, 4 / divisor)));
          }}
        >
          Quantise lengths
        </button>
        {/**
          * ⭐ **A copy placed by the selection's own length.** One command, so one undo, and the notes it lands on are the
          * notes it wrote — read from the arrangement rather than from the mark, which carries a pitch and a start and no more.
          */}
        <button
          type="button"
          data-testid="arrangement-copy-selection"
          className="px-2 py-1 rounded text-xs text-text opacity-90"
          disabled={editableTrackId === undefined || rollSelection.length === 0}
          onClick={() => {
            if (editableTrackId === undefined || rollSelection.length === 0) return;
            const from = Math.min(...rollSelection.map((mark) => mark.startBeats));
            const to = Math.max(...rollSelection.map((mark) => mark.startBeats));
            const delta = to > from ? to - from : 1;
            const notes = arrangement.notesByTrack?.[editableTrackId] ?? [];
            const marked = new Set(rollSelection.map((mark) => `${mark.pitch}@${mark.startBeats}`));
            const copies = notes
              .filter((note) => marked.has(`${note.pitch}@${note.startBeats}`))
              .map((note) => ({ ...note, startBeats: note.startBeats + delta }));
            const landed = new Set(copies.map((note) => `${note.pitch}@${note.startBeats}`));
            const kept = notes.filter((note) => !landed.has(`${note.pitch}@${note.startBeats}`));
            const after = { ...arrangement, notesByTrack: { ...arrangement.notesByTrack, [editableTrackId]: [...kept, ...copies] } };
            commit(setterCommand("Copy selection", (_current, value) => value, arrangement, after));
          }}
        >
          Copy selection
        </button>
        {/**
          * ⭐ **Legato: each marked note reaches the next one.** The model's own rule, committed as one command so one press is
          * one undo. It acts on the rectangle the marks cover, which is exactly the marks themselves after a drag.
          */}
        <button
          type="button"
          data-testid="arrangement-legato-selection"
          className="px-2 py-1 rounded text-xs text-text opacity-90"
          disabled={editableTrackId === undefined || rollSelection.length === 0}
          onClick={() => {
            if (editableTrackId === undefined || rollSelection.length === 0) return;
            const marks = rollSelection;
            const rect = {
              fromBeats: Math.min(...marks.map((mark) => mark.startBeats)),
              toBeats: Math.max(...marks.map((mark) => mark.startBeats)),
              pitchFrom: Math.min(...marks.map((mark) => mark.pitch)),
              pitchTo: Math.max(...marks.map((mark) => mark.pitch)),
            };
            const after = legatoNotesInRect(arrangement, editableTrackId, rect, { loopEndBeats: bars * 4, only: marks });
            commit(setterCommand("Legato", (_current, value) => value, arrangement, after));
          }}
        >
          Legato
        </button>
        {/**
          * ⭐ **The two shapes the older grid could stamp.** Both act on the marks, so a note nobody marked is left alone, and
          * both commit one command so one press is one undo. Directions and chord types come next; today each takes its default.
          */}
        <button
          type="button"
          data-testid="arrangement-arpeggiate-selection"
          className="px-2 py-1 rounded text-xs text-text opacity-90"
          disabled={editableTrackId === undefined || rollSelection.length === 0}
          onClick={() => {
            if (editableTrackId === undefined || rollSelection.length === 0) return;
            const marks = rollSelection;
            const rect = {
              fromBeats: Math.min(...marks.map((mark) => mark.startBeats)),
              toBeats: Math.max(...marks.map((mark) => mark.startBeats)),
              pitchFrom: Math.min(...marks.map((mark) => mark.pitch)),
              pitchTo: Math.max(...marks.map((mark) => mark.pitch)),
            };
            const after = arpeggiateNotesInRect(arrangement, editableTrackId, rect, { only: marks });
            commit(setterCommand("Arpeggiate", (_current, value) => value, arrangement, after));
          }}
        >
          Arpeggio
        </button>
        {/**
          * ⭐ **The three forms, at the arrangement layer.** A form is a decision about the arrangement's length, so each button
          * commits the same command the length field does — one command, one undo — and the notes are left exactly as they are,
          * which is what makes picking one form and picking another reversible.
          */}
        <button
          type="button"
          data-testid="arrangement-form-loop"
          className="px-2 py-1 rounded text-xs text-text opacity-90"
          onClick={() =>
            commit(
              setterCommand("Form: loop", (_current, value) => value, arrangement, applyForm(arrangement, "loop"))
            )
          }
        >
          Loop
        </button>
        <button
          type="button"
          data-testid="arrangement-form-club"
          className="px-2 py-1 rounded text-xs text-text opacity-90"
          onClick={() =>
            commit(
              setterCommand("Form: club", (_current, value) => value, arrangement, applyForm(arrangement, "club"))
            )
          }
        >
          Club
        </button>
        <button
          type="button"
          data-testid="arrangement-form-song"
          className="px-2 py-1 rounded text-xs text-text opacity-90"
          onClick={() =>
            commit(
              setterCommand("Form: song", (_current, value) => value, arrangement, applyForm(arrangement, "song"))
            )
          }
        >
          Song
        </button>
        {/**
          * ⭐ **Transposing a marked span.** The older editor moved a section by a stated interval, and this is the same idea at
          * this layer: the marks give the span, the field gives the interval, and one command moves it — so one press is one
          * undo, and transposing by the negative interval brings the music back exactly.
          */}
        <label className="flex items-center gap-1 text-xs text-text opacity-90">
          ±
          <input
            type="number"
            aria-label="semitones"
            data-testid="arrangement-transpose-semitones"
            value={semitones}
            onChange={(event) => setSemitones(Number(event.target.value))}
            className="h-6 w-12 rounded border border-[rgb(var(--d-line))] bg-transparent px-1 font-['JetBrains_Mono'] text-[10px]"
          />
        </label>
        <button
          type="button"
          data-testid="arrangement-transpose-apply"
          className="px-2 py-1 rounded text-xs text-text opacity-90"
          disabled={editableTrackId === undefined || rollSelection.length === 0}
          onClick={() => {
            if (editableTrackId === undefined || rollSelection.length === 0) return;
            const marks = rollSelection;
            const rect = {
              fromBeats: Math.min(...marks.map((mark) => mark.startBeats)),
              toBeats: Math.max(...marks.map((mark) => mark.startBeats)),
            };
            const after = transposeNotesInRange(arrangement, editableTrackId, rect.fromBeats, rect.toBeats, semitones);
            commit(setterCommand("Transpose", (_current, value) => value, arrangement, after));
          }}
        >
          Transpose
        </button>
        <button
          type="button"
          data-testid="arrangement-stamp-chord"
          className="px-2 py-1 rounded text-xs text-text opacity-90"
          disabled={editableTrackId === undefined || rollSelection.length === 0}
          onClick={() => {
            if (editableTrackId === undefined || rollSelection.length === 0) return;
            const marks = rollSelection;
            const root = marks[0]!.pitch;
            const rect = {
              fromBeats: Math.min(...marks.map((mark) => mark.startBeats)),
              toBeats: Math.max(...marks.map((mark) => mark.startBeats)),
              pitchFrom: Math.min(...marks.map((mark) => mark.pitch)),
              pitchTo: Math.max(...marks.map((mark) => mark.pitch)),
            };
            const after = stampChordInRect(arrangement, editableTrackId, rect, { type: "triad", rootMidi: root, only: marks });
            commit(setterCommand("Stamp chord", (_current, value) => value, arrangement, after));
          }}
        >
          Chord
        </button>
        {/**
         * ⭐ **The transport, with the state the owner reported as missing.**
         *
         * Play follows the studio's own convention rather than inventing one: `Toolbar.tsx` draws the same control as a
         * Play/Pause toggle — its word swaps between `toolbar_play` and `toolbar_pause` and its fill swaps with
         * `isPlaying` — and `useTransportControls.handleTogglePlay` pauses the transport when it is already running. So
         * the word, the fill, `aria-pressed` and the accessible name all change together, and there is no press that
         * does nothing, which is the rule U7 states: "a control that does nothing must say so."
         *
         * ⭐ **The fill is `--d-on-accent` for the ink**, the token that means "the ink that goes on a fill". The
         * neighbouring Loop and Snap buttons use `--d-accent-ink`, which the editor tabs below record as degenerate:
         * in five of the six skins it *is* `--d-accent`, so an accent-ink word on an accent fill measures 1:1. A label
         * nobody can read is the opposite of the indication this change is about.
         */}
        <button
          type="button"
          data-testid="arrangement-play"
          aria-pressed={playing}
          aria-label={playing ? t("arrangement_pause") : t("arrangement_play")}
          title={playing ? t("arrangement_pause") : t("arrangement_play")}
          className={playing ? toolButtonActive : toolButton}
          disabled={player === undefined}
          onClick={togglePlay}
        >
          {playing ? t("arrangement_pause") : t("arrangement_play")}
        </button>
        {/**
         * **Stop, because the sampler's notes are started on the audio clock and the engine's transport cannot reach them.** Without it, pressing play on a piano arrangement and then wanting it to
         * stop left every scheduled note ringing — the arrangement player is the only object that holds those voices, so only this button can silence them.
         *
         * ⭐ **And the other half, which was missing** — see `playerFromEngine.stopTransport`: the button spliced those
         * voices and never called `AudioEngine.stop()`, so the lane voices kept sounding and no `CLOCK_STOP` was ever
         * published. Both halves are one call now.
         *
         * ⭐ Its disabled state is the transport's rather than a guess: **when the player can report its position, this is
         * live exactly while a stop would return the transport somewhere** — running, *or* paused on a position it
         * holds (see `hasPosition`; a real pause is what made that second case load-bearing). A player that cannot
         * report (an engine-shaped object with `stop` and no `transport`) leaves it enabled, because "unknown" is not
         * "stopped".
         */}
        <button
          type="button"
          data-testid="arrangement-stop"
          aria-label={t("arrangement_stop")}
          title={t("arrangement_stop")}
          className={toolButton}
          disabled={player?.stop === undefined || (liveTransport && !hasPosition)}
          onClick={stop}
        >
          {t("arrangement_stop")}
        </button>
        {/*
          Record, which used to be buried in the detail panel: the brief's item 1 puts it in the transport. Disabled
          with no track selected, because a take recorded with nowhere to go is captured and dropped — the failure the
          `onTake` seam exists to prevent, and one the toolbar makes easier to hit than the old panel did.
        */}
        <RecordButtonV2
          capture={capture}
          disabled={selected === undefined}
          /**
           * ⭐ **A recording is an action like any other** — Ableton's history lists "Record" beside every other edit —
           * so it goes through the stack. `addTake` is the one edit whose inverse is the **previous track**, because a
           * take changes three things at once (`takes`, `selectedTakeId`, and `takeRegions`, which `assignTakeToRange`
           * splits); the reason is written on `addTakeCommand` rather than here.
           */
          onTake={(planned) => selected !== undefined && commit(addTakeCommand(selected, planned))}
        />

        {/**
         * ⭐ **The transport's own report**: the position, and — when there is no engine — why the play button is
         * disabled. It kept its own `data-testid` through the rebuild because these two facts are what the
         * arrangement says about playing, and the criterion that reads them is about the engine seam rather than the
         * layout. It is a sibling of the position readout rather than its container: the position is a value the
         * toolbar draws, and the report is what the transport is doing, and nesting one inside the other made the
         * readout's text look like part of the report.
         */}
        <span data-testid="arrangement-transport" className="flex items-center gap-1">
          {/* ⭐ Said rather than clicked into nothing: without an engine the button is disabled and this explains why. */}
          {player === undefined && <span className="text-[10px] text-text opacity-70">(audio engine not connected yet)</span>}
          {played !== undefined && <span data-testid="arrangement-played" className="text-[10px] text-text opacity-70">planned {played} lane event(s)</span>}
          {preparing && (
            <span data-testid="arrangement-preparing" className="font-mono text-[10px] uppercase tracking-widest text-text-sub">
              {t("arrangement_preparing")}
            </span>
          )}
          <SaveIndicator visible status={saveStatus} />
          {midiNotice !== undefined && (
            <span data-testid="arrangement-midi-notice" className="font-mono text-[10px] uppercase tracking-widest text-text-sub">
              {midiNotice}
            </span>
          )}
          {playProblem !== undefined && <span data-testid="arrangement-play-problem" className="text-[10px] text-text opacity-70">{playProblem}</span>}
        </span>
        <span className="flex items-center gap-1">
          <span className="text-[10px] text-text opacity-70">{t("arrangement_position")}</span>
          {/**
           * ⭐ **The transport's position, not the bar the ruler was clicked on — and with a real beat.**
           *
           * It used to be `{stripBar + 1}.1`: the beat was a literal `1` that could never be anything else, and the bar
           * was the *view's* selected bar rather than the transport's, which is the conflation §8 item 4 exists to
           * avoid — "where playback is" and "where the view is looking" are two facts, and this readout is named
           * Position.
           *
           * With a live transport the text is written **per step** by the effect above and there is no React child to
           * fight it. Without one there is no transport position to report, so the selected bar is the honest answer
           * and a host that injects `playheadBar` still gets a readout that agrees with it.
           */}
          <span
            ref={positionRef}
            data-testid="arrangement-position"
            className="rounded border border-[rgb(var(--d-line))] px-1 font-['JetBrains_Mono'] text-xs"
          >
            {liveTransport ? undefined : `${stripBar + 1}.1`}
          </span>
        </span>

        {/**
         * ⭐ **Undo and Redo, in the toolbar, disabled when there is nothing to do.**
         *
         * The shape is the studio toolbar's own undo/redo pair (`Toolbar.tsx`, `data-toolbar-id="undo"`): the same two
         * `lucide` glyphs, the same accessible names from the same dictionary keys (`toolbar_undo_title`,
         * `toolbar_redo_title`), and the same rule that the control is **disabled rather than inert** when its stack is
         * empty. Two surfaces teaching two vocabularies for one action is the thing this avoids.
         *
         * ⭐ **The `disabled` state is the stack's, not a guess**: `canUndo`/`canRedo` are React state inside
         * `useArrangementHistory` (the studio's history records what happens when they are read off refs during render —
         * the button silently never updates), so "nothing to undo" is a control that cannot be pressed rather than one
         * that is pressed and does nothing. Logic's list and Ableton's are the same statement in their own words.
         *
         * `data-undo-action` publishes what the press would undo, which is how the readout "2. Change note length" in
         * Logic's Undo History window is available here at all — and it makes the action-stack model checkable from the
         * DOM rather than only from the words in a tooltip.
         */}
        <span className="ml-2 flex shrink-0 items-center gap-1">
          <button
            type="button"
            data-testid="arrangement-undo"
            data-undo-action={undoAction ?? ""}
            aria-label={t("toolbar_undo_title")}
            title={t("toolbar_undo_title")}
            disabled={!canUndo}
            onClick={handleUndo}
            className={toolButtonIcon}
          >
            <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            data-testid="arrangement-redo"
            data-redo-action={redoAction ?? ""}
            aria-label={t("toolbar_redo_title")}
            title={t("toolbar_redo_title")}
            disabled={!canRedo}
            onClick={handleRedo}
            className={toolButtonIcon}
          >
            <Redo2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </span>

        {/* Tempo and bars: the arrangement's own declared length and speed, editable where the transport is. */}
        <label className="flex items-center gap-1 text-[10px] text-text opacity-80">
          {t("arrangement_tempo")}
          <input
            type="number"
            min={20}
            max={300}
            aria-label={t("arrangement_tempo_bpm")}
            data-testid="arrangement-tempo"
            value={arrangement.bpm ?? 120}
            onChange={(event) => commit(setArrangementTempoCommand(arrangement.bpm ?? 120, Number(event.target.value)))}
            className="h-6 w-14 rounded border border-[rgb(var(--d-line))] bg-transparent px-1 font-['JetBrains_Mono'] text-xs text-text"
          />
        </label>
        <label className="flex items-center gap-1 text-[10px] text-text opacity-80">
          {t("arrangement_bars")}
          <input
            type="number"
            min={1}
            max={128}
            aria-label={t("arrangement_bars")}
            data-testid="arrangement-bars"
            value={bars}
            onChange={(event) => commit(setArrangementBarsCommand(bars, Number(event.target.value)))}
            className="h-6 w-12 rounded border border-[rgb(var(--d-line))] bg-transparent px-1 font-['JetBrains_Mono'] text-xs text-text"
          />
        </label>

        {/**
         * ⭐ **The snap value is visible text, and the toggle is separate from it** (§8 item 6, §3). Live shows the
         * grid spacing in the ruler's corner for the same reason: a switch that says only "on" answers a question
         * nobody asked, because the question is *on what*. The button that changes the value is therefore not the
         * button that turns snapping on and off.
         */}
        <button
          type="button"
          data-testid="arrangement-snap-cycle"
          aria-label={t("arrangement_snap_cycle")}
          onClick={() => setSnap((current) => SNAP_VALUES[(SNAP_VALUES.indexOf(current) + 1) % SNAP_VALUES.length]!)}
          className="h-11 shrink-0 rounded border border-[rgb(var(--d-line))] px-1 font-['JetBrains_Mono'] text-xs text-text"
        >
          <span className="text-[10px] opacity-70">{t("arrangement_snap")}</span>{" "}
          <span data-testid="arrangement-snap-value">{snap}</span>
        </button>
        <button
          type="button"
          data-testid="arrangement-snap-toggle"
          aria-label={t("arrangement_snap_toggle")}
          aria-pressed={snapOn}
          onClick={() => setSnapOn((current) => !current)}
          className={`h-11 w-11 shrink-0 rounded border text-xs ${snapOn ? "border-[rgb(var(--d-accent))] bg-[rgb(var(--d-accent))] text-[rgb(var(--d-accent-ink))]" : "border-[rgb(var(--d-line))] text-text"}`}
        >
          #
        </button>

        {/* Loop: the switch, and — when it is on — the brace in the ruler. */}
        <button
          type="button"
          data-testid="arrangement-loop"
          aria-label={t("arrangement_loop")}
          aria-pressed={loopRange !== undefined}
          onClick={toggleLoop}
          className={`h-11 shrink-0 rounded border px-2 text-xs ${loopRange !== undefined ? "border-[rgb(var(--d-accent))] bg-[rgb(var(--d-accent))] text-[rgb(var(--d-accent-ink))]" : "border-[rgb(var(--d-line))] text-text"}`}
        >
          ⟲
        </button>

        {/* Metronome and count-in: the click track, and the four beats before it. */}
        <button
          type="button"
          data-testid="arrangement-metronome"
          aria-label={t("arrangement_metronome")}
          aria-pressed={metronome}
          onClick={() => setMetronome((on) => !on)}
          className={`h-11 shrink-0 rounded border px-2 text-xs ${metronome ? "border-[rgb(var(--d-accent))] bg-[rgb(var(--d-accent))]/15 text-text" : "border-white/10 text-text-sub"}`}
        >
          🎵
        </button>
        <button
          type="button"
          data-testid="arrangement-count-in"
          aria-label={t("arrangement_count_in")}
          aria-pressed={countIn}
          onClick={() => setCountIn((on) => !on)}
          className={`h-11 shrink-0 rounded border px-2 text-xs ${countIn ? "border-[rgb(var(--d-accent))] bg-[rgb(var(--d-accent))]/15 text-text" : "border-white/10 text-text-sub"}`}
        >
          ⏱
        </button>

        {/* Zoom. The same control the ruler's own manual gestures answer to, and the reason the labels subdivide. */}
        <span className="flex shrink-0 items-center">
          <button
            type="button"
            data-testid="arrangement-zoom-out"
            aria-label={t("arrangement_zoom_out")}
            onClick={() => setPixelsPerBar((current) => Math.max(MIN_PX_PER_BAR, Math.round(current / ZOOM_FACTOR)))}
            className={toolButton}
          >
            −
          </button>
          <button
            type="button"
            data-testid="arrangement-zoom-in"
            aria-label={t("arrangement_zoom_in")}
            onClick={() => setPixelsPerBar((current) => Math.min(MAX_PX_PER_BAR, Math.round(current * ZOOM_FACTOR)))}
            className={toolButton}
          >
            +
          </button>
          <span data-testid="arrangement-zoom-value" className="w-8 text-right font-['JetBrains_Mono'] text-[10px] text-text opacity-70">
            {pixelsPerBar}
          </span>
        </span>

        {/**
         * The editor tabs, on the right (§8 item 1). They read as Logic's do, and they are what makes "look at the
         * score" something a person discovers rather than a setting they have to find. Only for a track that has
         * notes to read: an effect or folder track is told why rather than given tabs that would show nothing.
         */}
        {selected !== undefined && selected.kind !== "fx" && selected.kind !== "folder" && (
          <div data-testid="arrangement-editor-tabs" role="tablist" className="ml-auto flex gap-1 pl-2">
            {(["roll", "score"] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                data-testid={`arrangement-editor-${value}`}
                aria-selected={editor === value}
                onClick={() => setEditor(value)}
                /**
                 * ⭐ **The selected tab's ink is `--d-on-accent`, not `--d-accent-ink`.**
                 *
                 * The same degenerate palette pair `NewProjectPanelV2`'s Create button already documents: in five of
                 * the six skins `--d-accent-ink` *is* `--d-accent`, so an accent-ink label on an accent fill measured
                 * **1:1** — the word "Piano Roll" was invisible on default, soviet and pixel and 1.17:1 on minimal.
                 * `--d-on-accent` is the token that means "the ink that goes on a fill", and it clears 4.5:1 against
                 * the accent on every skin (5.57 minimal, 5.67 comic, 11.92 soviet, 5.64 sovietYears, 11.82 pixel).
                 */
                className={`h-11 rounded px-3 text-xs ${editor === value ? "bg-[rgb(var(--d-accent))] text-[rgb(var(--d-on-accent))]" : "text-text opacity-70"}`}
              >
                {value === "roll" ? t("view_piano_roll") : t("view_score")}
              </button>
            ))}
          </div>
        )}

        {/**
         * ⭐ **The file entries, at the right end of the toolbar and after Zoom** — the position the brief names, and
         * the one place on this route where a person looks for "get this out of here" or "bring that in". Same six
         * export words as the workbench toolbar, so the two surfaces do not teach two vocabularies.
         */}
        <ArrangementFileEntriesV2
          busy={files.busy}
          onExportMidi={files.exportMidi}
          onExportAls={files.exportAls}
          onExportGroove={files.exportGroove}
          onExportWav={files.exportWav}
          onExportMp3={files.exportMp3}
          onExportStems={files.exportStems}
          onImportFile={files.importFile}
          {...(files.exportingKind === undefined ? {} : { exportingKind: files.exportingKind })}
          onCancelExport={files.cancelExport}
        />
      </div>

      {/**
       * What the last file entry did — an export's own report and an import's refusal alike. Shown rather than
       * swallowed, which is the half of the owner's report that was about silence: a button that fails quietly is worse
       * than one that is not there.
       */}
      {files.report !== undefined && (
        <p data-testid="arrangement-file-report" className="text-[10px] text-text opacity-80">
          {files.report}
        </p>
      )}

      {/**
       * The track picker: a row of names, one press each, for the times the header column is scrolled away or a
       * person is reading the detail dock. It kept its own `data-testid` through the layout rebuild because it is the
       * second reading of "which track is selected" — the header shows it too, and both are addressed by criteria.
       */}
      <ul data-testid="arrangement-track-picker" className="flex flex-wrap gap-1">
        {arrangement.tracks.map((track) => (
          <li key={track.id}>
            <button
              type="button"
              className="h-11 rounded border border-[rgb(var(--d-line))] px-2 text-xs text-text"
              onClick={() => setSelectedTrackId(track.id)}
              aria-pressed={track.id === selectedTrackId}
            >
              {track.name}
            </button>
          </li>
        ))}
      </ul>

      {/**
       * ⭐ **The grid: a fixed header column beside a lane area** (§8 item 2). The structure is what makes three
       * things true at once, and each is a criterion:
       *
       * - the **header column has no ruler** — the ruler is inside the lane column, so there is nowhere for one to be;
       * - the **ruler scrolls horizontally with the lanes** — they are in one `overflow-x` container, not two
       *   containers kept in step by a scroll listener, which is the version that drifts by a pixel;
       * - the **headers scroll vertically with the lanes** — likewise one `overflow-y` container, with the header
       *   column pinned horizontally by `sticky left-0`, which is how the user's own layout convention is usually
       *   implemented, and is why the ruler needs an offset equal to the header width rather than a separate rail.
       */}
      <div
        data-testid="arrangement-grid"
        /*
          The width as a value, for the same reason `data-start-bar` is a value on a region: a criterion can assert
          **the structure** (that the ruler is offset by exactly this, that the header column is exactly this wide)
          without asserting a pixel a stylesheet could legitimately change. It is a literal here because inline styles
          cannot read a custom property; the value it must equal is asserted in `arrangementGrid.test.tsx` against
          `index.css`, so the two cannot drift apart silently.
        */
        data-header-width="240"
        className="relative max-h-[60vh] overflow-y-auto rounded border border-[rgb(var(--d-line))]"
      >
        <div data-testid="arrangement-track-space" className="flex min-w-max flex-col">
          {/* The ruler's row. The lane column begins after a spacer the width of the header column, so the ruler's
              bar 1 sits exactly above the lane's bar 1. The header column has no ruler because this row is inside the
              lane column rather than above the whole grid. */}
          <div className="flex items-stretch border-b border-[rgb(var(--d-line))]">
            {/* A spacer where the header column is — the ruler starts after it. */}
            <span data-testid="arrangement-ruler-offset" aria-hidden="true" style={{ width: "var(--arr-head-w)" }} className="shrink-0 border-r border-[rgb(var(--d-line))]" />
            <div className="sticky left-0 min-w-0 flex-1 overflow-x-auto">
              <div className="relative" style={{ width: laneWidth }}>
                <ArrangementRulerV2
                  bars={bars}
                  currentBar={stripBar}
                  onSelectBar={onRulerSelect}
                  pixelsPerBar={pixelsPerBar}
                  /**
                   * The same value the lane quantises to, drawn where Live draws it — so the readout is a statement
                   * about what an edit will do rather than a label beside a control that does nothing.
                   */
                  snapLabel={snapOn ? snap : undefined}
                />
                {/* The loop brace lives in the ruler, which is where Live and Bitwig draw it. */}
                {loopRange !== undefined && (
                  <LoopBraceV2 loop={loopRange} pixelsPerBar={pixelsPerBar} bars={bars} onChange={setLoopRange} />
                )}
                {/* ⭐ Two indicators, not one (§8 item 4). The play-start is a triangle in the ruler — Bitwig's own
                    shape — and the playhead is the line below, in the lanes. They are separate elements with
                    separate values, so "where a play begins" and "where playback is" can never be the same fact. */}
                <span
                  data-testid="arrangement-play-start"
                  aria-label={t("play_start_label")}
                  role="img"
                  className="absolute bottom-0 z-20 h-0 w-0 border-x-4 border-b-4 border-x-transparent border-b-[rgb(var(--d-accent))]"
                  style={{ left: playStartBar * pixelsPerBar - 4 }}
                />
              </div>
            </div>
          </div>

          {/* Track rows. One flex row per track: the header (sticky, so it stays while the lanes scroll sideways) and
              the lane. Headers and lanes are siblings inside one vertical scroller, so their heights cannot drift. */}
          <div data-testid="arrangement-header-column" aria-label={t("arrangement_tracks_label")} className="flex min-w-max">
            <div className="sticky left-0 z-10 shrink-0 border-r border-[rgb(var(--d-line))]" style={{ width: "var(--arr-head-w)" }}>
              {/* Adding tracks sits at the top of the header column, which is where every DAW's "new track" is. */}
              <div data-testid="track-list-add" className="flex flex-wrap items-center gap-1 border-b border-[rgb(var(--d-line))] p-1">
                {TRACK_KIND_ORDER.map((kind) => (
                  <button key={kind} type="button" data-testid={`track-add-${kind}`} className="min-h-[44px] rounded border border-[rgb(var(--d-line))] px-1 text-[10px] text-text" onClick={() => onAddTrack(kind, kind)}>
                    + {t(KIND_LABEL_KEY[kind])}
                  </button>
                ))}
              </div>
              {arrangement.tracks.map((track) => (
                <div
                  key={track.id}
                  data-testid={`arrangement-header-row-${track.id}`}
                  onFocusCapture={() => setSelectedTrackId(track.id)}
                  onPointerDown={() => setSelectedTrackId(track.id)}
                  className={`border-b border-[rgb(var(--d-line))] ${track.id === selectedTrackId ? "bg-[var(--d-surface,rgba(255,255,255,0.06))]" : ""}`}
                >
                  <TrackHeaderV2
                    track={track}
                    depth={depthOf(track, arrangement)}
                    libraryOpen={openLibraryFor === track.id}
                    onLibraryOpenChange={(trackId, open) => setOpenLibraryFor(open ? trackId : undefined)}
                    instruments={instruments}
                    {...(instruments !== undefined
                      ? {
                          onChangeInstrument: (trackId, assetId) =>
                            commit(setTrackSampleCommand(trackId, trackFor(trackId)?.sample?.assetId ?? DEFAULT_SAMPLER_ASSET, assetId)),
                        }
                      : {})}
                    onToggle={(trackId, flag, value) => commit(setTrackFlagCommand(trackId, flag, value))}
                    onToggleArm={(trackId, armed) => commit(setTrackFlagCommand(trackId, "armed", armed))}
                    onChangeGain={(trackId, gainDb) => commit(setTrackGainCommand(trackId, trackFor(trackId)?.gainDb ?? 0, gainDb))}
                    onChangeKind={(trackId, kind) => {
                      /**
                       * ⭐ **The previous track travels with the command**, because a kind change is the one edit whose
                       * inverse is not a setter: leaving `sampler` drops the sample on purpose, so
                       * `setTrackKind(a, id, previousKind)` would restore the kind and leave the instrument gone.
                       */
                      const previous = trackFor(trackId);
                      if (previous !== undefined) commit(changeTrackKindCommand(previous, kind));
                    }}
                    onToggleCollapse={(trackId, collapsed) => commit(setCollapsedCommand(trackId, collapsed))}
                    onRemoveTrack={(trackId) => {
                      commit(removeTrackCommand(arrangement, trackId));
                      // A removed track must not stay selected: the take selector would then describe something that is gone.
                      setSelectedTrackId((current) => (current === trackId ? undefined : current));
                    }}
                  />
                </div>
              ))}
            </div>
            {/* The lane column. Its width is bars × pixels-per-bar — the ruler's own number.
                The bar lines are a repeating background rather than one element per bar: they have to run the full
                height of the lanes so a region can be read against the ruler **between** tracks as well as inside
                one, and a node per bar per track would be `bars × tracks` elements for a line the zoom already
                implies. It sits behind the regions, so a region block is still the thing a press lands on. */}
            <div
              className="relative flex-1"
              style={{
                width: laneWidth,
                backgroundImage: `repeating-linear-gradient(to right, rgb(var(--d-line)) 0 1px, transparent 1px ${pixelsPerBar}px)`,
              }}
            >
              <ArrangementLaneV2
                arrangement={arrangement}
                pixelsPerBar={pixelsPerBar}
                {...(selectedTrackId !== undefined ? { selectedTrackId } : {})}
                onSelectTrack={setSelectedTrackId}
                /**
                 * ⭐ **The snap value reaches the lane here, and this is the line that makes the toolbar's grid real.**
                 * `undefined` is the toggle being off — the same meaning the bypass modifier has inside the lane — and
                 * the value is the visible one, so what the ruler's corner says and what an edit rounds to are one
                 * number rather than two that agree today.
                 */
                {...(snapOn ? { snapBars: SNAP_BARS[snap] } : {})}
                onRegionChange={onRegionChange}
                /**
                 * ⭐ **The track's own mute, set through the same door as every other edit.** `TrackV2.muted` is already read
                 * by `playArrangementV2`, so this adds a control rather than a behaviour: the flag, the edit and the undo
                 * entry all come from code that was already here.
                 */
                onSetTrackFlag={(trackId, flag, value) =>
                  commit(setterCommand(flag === "muted" ? "Mute" : "Solo", (_current, v) => v, arrangement, setTrackFlag(arrangement, trackId, flag, value)))
                }
              />
              {/**
               * The playhead: the second of the two indicators. A line over the lanes, positioned in bar space.
               *
               * ⭐ **`playheadBarRef`, not the prop, when a live transport exists.** The effect moves this node per step without re-rendering — but a re-render for any other reason still passes through here, and React would then
               * write the prop again and rewind the picture to bar one until the next step. Reading the last reported bar closes that hole, which matters most on a zoom change: the same re-render changes `pixelsPerBar`, so the
               * line has to be re-placed from the *current* bar at the new scale, not from the starting one.
               */}
              <span
                ref={playheadRef}
                data-testid="arrangement-playhead"
                aria-label={t("playhead_label")}
                role="img"
                className="pointer-events-none absolute inset-y-0 z-20 w-px bg-text"
                style={{ left: (liveTransport ? playheadBarRef.current : (playheadBar ?? 0)) * pixelsPerBar }}
              />
            </div>
          </div>
        </div>
      </div>

      {/**
       * ⭐ **The detail dock**, below the grid. The brief keeps the editor tabs' *content* out of the global toolbar
       * (§6.2): one `NoteEvent[]`, two readings, one at a time, and switching views must not move the playhead, scroll
       * the arrangement or change the selection. What is above is the switch; this is the editor.
       */}
      <div data-testid="arrangement-detail" className="flex flex-col gap-2 rounded border border-[rgb(var(--d-line))] bg-[var(--d-surface,rgba(255,255,255,0.04))] p-3">
        {selected === undefined ? (
          // Said rather than left blank, so an empty panel reads as "nothing selected" instead of "something is broken".
          <p>Select a track to see its takes.</p>
        ) : (
          <>
            <TakeSelectorV2 track={selected} bar={bar} onSelect={(takeId) => commit(selectTrackTakeCommand(selected.id, selected.selectedTakeId, takeId))} />
            {/**
             * **The roll, for a track that plays pitches.** It is here rather than in a separate editor because the owner's complaint was having to leave the arrangement to enter notes; the keyboard below plays, this writes, and both act on the selected track.
             */}
            {selected.kind !== "fx" && selected.kind !== "folder" && editor === "score" && (
              /**
               * **The score and the roll show the same notes.** That is the whole claim of having both, and it is why neither owns the data: they are two readings of one `NoteEvent[]`.
               *
               * ⭐ **And the score is where MusicXML leaves and arrives.** The same tab that draws the notes is the one
               * that reads them from, and writes them to, the format every notation program understands — the handlers
               * `await import` the two modules, so a route that never opens the score never loads a notation parser.
               */
              <ScoreV2
                notes={arrangement.notesByTrack?.[selected.id] ?? []}
                bars={bars}
                kind={selected.kind}
                title={`${selected.name} — ${t("view_score")}`}
                onExportMusicXml={files.exportMusicXml}
                onExportLogic={files.exportLogic}
                onImportMusicXml={files.importMusicXml}
                musicXmlBusy={files.busy}
              />
            )}
            {selected.kind !== "fx" && selected.kind !== "folder" && editor === "roll" && (
              <PianoRollV2
                notes={arrangement.notesByTrack?.[selected.id] ?? []}
                // The roll shows the whole arrangement, so its length and the transport's are the same number.
                beats={bars * 4}
                onSetBars={(next) => commit(setArrangementBarsCommand(bars, next))}
                onAddNote={(note) => commit(addTrackNoteCommand(selected.id, note))}
                /**
                 * ⭐ **Removing a note keeps the note**, because that is the only thing that can put it back. It is read
                 * from the arrangement on screen rather than from the roll's own props: the roll is a reading of
                 * `notesByTrack`, so a second copy of the note here would be the copy that goes stale.
                 */
                onSelectionChange={setRollSelection}
                onRemoveNote={(at) => commit(removeTrackNoteCommand(selected.id, at, noteFor(selected.id, at)))}
                /**
                 * ⭐ **One press, one undo.** The roll reports the whole selection when it can, and this commits a single
                 * command that drops exactly those notes — the notes it named, not a rectangle that might hold others.
                 */
                onRemoveSelection={(at) => {
                  const drop = new Set(at.map((note) => `${note.pitch}@${note.startBeats}`));
                  const kept = (arrangement.notesByTrack?.[selected.id] ?? []).filter(
                    (note) => !drop.has(`${note.pitch}@${note.startBeats}`)
                  );
                  const after = { ...arrangement, notesByTrack: { ...arrangement.notesByTrack, [selected.id]: kept } };
                  commit(setterCommand("Remove selection", (_current, value) => value, arrangement, after));
                }}
                onMoveNote={(from, to) => commit(moveTrackNoteCommand(selected.id, from, to))}
                onResizeNote={(at, lengthBeats) => commit(setTrackNoteLengthCommand(selected.id, at, noteFor(selected.id, at)?.lengthBeats, lengthBeats))}
                /**
                 * ⭐ **The roll writes, the view sounds.** A sampler track is the one with an instrument behind it, so it is the one whose notes can be heard — the same condition the keyboard below is drawn under, so the two cannot disagree about which tracks are audible. A drum or synth track gets no audition rather than a silent one, which is the honest answer and the one its own keyboard is already given.
                 */
                onAudition={
                  selected.kind === "sampler" && selected.sample
                    ? (midi) => {
                        releaseAudition();
                        // Reported rather than discarded, exactly as the keyboard's own press is: a silent audition has to say why it was silent.
                        void player?.audition?.({ assetId: selected.sample!.assetId, midi, trackId: selected.id, gainDb: selected.gainDb })?.then((result) => {
                          setPlayProblem(result && result.ok === false ? result.reason : undefined);
                        });
                        auditioned.current = midi;
                      }
                    : undefined
                }
                /** Space, while the roll has focus — the transport, routed to the same toggle the toolbar's button calls. */
                onToggleTransport={togglePlay}
              />
            )}
            {selected.kind === "sampler" && selected.sample ? (
              /**
               * **The keyboard, where the instrument is.** A sampler track is the one that plays a real instrument, so
               * it is the one that can be auditioned; a drum or effect track is told why rather than given keys that
               * would do nothing.
               *
               * Pressing a key resolves that instrument's note through the SFZ path and sounds it at the note's rate —
               * the `audition` half of the player, which is what makes a mirrored library testable by hand.
               */
              <ArrangementKeyboardV2
                onNoteOn={(midi, velocity) => {
                  /**
                   * ⭐ **The result is reported, not discarded.**
                   *
                   * This used to be `void player?.audition?.(…)`, and that is what turned a real failure into "pressing keys does nothing": on any visit where the audio-start gate did not appear, the browser kept the audio context suspended, the audition could not sound, and the one piece of information that would have said so went into `void`. The owner's report — keys silent, nothing in diagnostics, no way to tell why — is the shape of a discarded result.
                   */
                  void player?.audition?.({ assetId: selected.sample!.assetId, midi, trackId: selected.id, gainDb: selected.gainDb })?.then((result) => {
                    setPlayProblem(result && result.ok === false ? result.reason : undefined);
                  });
                }}
                onNoteOff={(midi) => {
                  player?.releaseNote?.({ midi, trackId: selected.id });
                }}
              />
            ) : (
              <p className="text-xs text-text opacity-70">{t(selected.kind === "sampler" ? "keyboard_needs_instrument" : "keyboard_needs_sampler")}</p>
            )}
          </>
        )}
      </div>

      {/**
       * The old row-based list, kept as a report of the arrangement rather than as the editing surface.
       *
       * It is here because it still carries what the grid's header deliberately does not: **one bar of steps** per
       * track, which is the pattern-at-a-glance view the owner asked for and which lives nowhere else on this route.
       * Rendering it means the arrangement now has two readings of one model on screen at once, which is the risk the
       * header rebuild was supposed to remove — so it is last, it is the only place the step strip appears, and it is
       * the thing to delete once the step strip has a home in the new grid.
       */}
      <TrackListV2
        arrangement={arrangement}
        onAddTrack={onAddTrack}
        onRemoveTrack={(trackId) => {
          commit(removeTrackCommand(arrangement, trackId));
          setSelectedTrackId((current) => (current === trackId ? undefined : current));
        }}
        onToggle={(trackId, flag, value) => commit(setTrackFlagCommand(trackId, flag, value))}
        onToggleCollapse={(trackId, collapsed) => commit(setCollapsedCommand(trackId, collapsed))}
        onChangeKind={(trackId, kind) => {
          const previous = trackFor(trackId);
          if (previous !== undefined) commit(changeTrackKindCommand(previous, kind));
        }}
        instruments={instruments}
        onChangeInstrument={(trackId, assetId) => commit(setTrackSampleCommand(trackId, trackFor(trackId)?.sample?.assetId ?? DEFAULT_SAMPLER_ASSET, assetId))}
        onToggleStep={(trackId, index) => commit(toggleStepCommand(trackId, index))}
        bar={stripBar}
        onChangeGain={(trackId, gainDb) => commit(setTrackGainCommand(trackId, trackFor(trackId)?.gainDb ?? 0, gainDb))}
        onChangePan={(trackId, pan) => commit(setTrackPanCommand(trackId, trackFor(trackId)?.pan ?? 0, pan))}
      />

      {/**
       * ⭐ **The per-part instrument mapping, when a multi-part MIDI file was chosen.**
       *
       * The data layer could already take `{ instruments }` keyed by part index and nothing asked for one, which is
       * the whole of the owner's report one layer up ("有些是功能有了，页面没做入口"). The hook owns *whether* the
       * question is open and what the answer does; this only draws it, with the catalogue this session loaded so an
       * option can be labelled with the instrument's real name rather than only the table's key.
       *
       * It is the last thing in the view so it draws over everything, exactly like the arrangement panel's own modal.
       */}
      {files.pendingMapping !== undefined && (
        <ImportInstrumentMappingV2
          filename={files.pendingMapping.filename}
          parts={files.pendingMapping.parts}
          catalogue={instruments}
          onConfirm={files.confirmMapping}
          onSkip={files.skipMapping}
        />
      )}
    </div>
  );
}

/** Depth from `parentId`, so what is drawn and what is grouped are the same fact. Mirrors `TrackListV2`'s own helper. */
function depthOf(track: { id: string; parentId?: string }, arrangement: ArrangementV2, seen = new Set<string>()): number {
  if (!track.parentId || seen.has(track.id)) return 0;
  seen.add(track.id);
  const parent = arrangement.tracks.find((candidate) => candidate.id === track.parentId);
  return parent ? 1 + depthOf(parent, arrangement, seen) : 0;
}
