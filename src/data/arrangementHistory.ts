/**
 * The arrangement's undo/redo — an **action stack**, built out of the pure edits in `arrangementEdits.ts`.
 *
 * `docs/OPEN_WORK.md` §28 says to look at what the top of the industry does before inventing anything, so this file's
 * two decisions are the industry's rather than this repository's:
 *
 * **① A list of actions, not a pile of documents.** Every product read keeps a **named, time-ordered list of the edits
 * that were made**, not a stack of whole-document copies:
 *
 *   * Logic Pro: "Logic Pro for Mac includes an **Undo History window with a time-ordered list of all edits that can be
 *     undone**" — <https://support.apple.com/guide/logicpro/undo-and-redo-edits-lgcp1dbd67ab/mac>;
 *   * Ableton Live: "The Undo History **lists all the actions taken** since opening a Set and lets you revert or
 *     reapply them up to a specific point" —
 *     <https://www.ableton.com/en/live-manual/12/managing-files-and-sets/#accessing-a-sets-undo-history>;
 *   * REAPER: `View > Undo History` opens a list of undo points, each a named state —
 *     <https://www.reaper.fm/userguide.php> (chapter 2.26 "Undo History").
 *
 * ⭐ **So each entry here is one action and its inverse**, and the inverse is expressed by calling the *same* pure
 * functions the forward edit calls. **No arrangement is copied into the stack** — an entry holds the arguments of the
 * edit plus the handful of values that edit displaced (one track, one take list, one gain), which is what makes an
 * inverse possible without a snapshot of the document:
 *
 *   * Ableton's own history window is explicitly **not** a document backup: "the Undo History is **not saved with a
 *     Set** once it is closed and is **refreshed each time the Set is opened**" (same URL above) — the *document* is
 *     saved by the Set, and the history is a per-session idea;
 *   * Cubase keeps a **separate** history per surface — "The **MixConsole history is not saved with the project**",
 *     with its own `Alt/Opt+Z` binding —
 *     <https://archive.steinberg.help/cubase_artist/v12/en/cubase_nuendo/topics/mixconsole/mixconsole_undo_redo_parameter_c.html>.
 *
 * ⇒ the arrangement value stays the one thing that is stored; this module only remembers how to walk it backwards.
 *
 * **② 200 steps is Logic's ceiling and its own setting** ("you can change the number of steps that can be undone (up to
 * 200)"), so the cap here is a number somebody else already chose rather than one invented for this file.
 *
 * **What an entry is not.** `undo` and `redo` must be **total functions over any arrangement**, because the value they
 * are applied to is whatever the editor holds when the button is pressed — see `undoArrangement` below, where the entry
 * is applied to the caller's live value rather than to a stored one.
 */
import type { ArrangementV2, NoteEvent, TrackKindV2, TrackV2 } from "../types/arrangementV2";
import {
  addTake,
  addTrack,
  addTrackNote,
  changeTrackKind,
  insertTrack,
  moveTrackNote,
  removeTrack,
  removeTrackNote,
  replaceTrack,
  selectTrackTake,
  setArrangementBars,
  setArrangementTempo,
  setCollapsed,
  setTrackFlag,
  setTrackGain,
  setTrackNoteLength,
  setTrackPan,
  setTrackSample,
  toggleStep,
} from "./arrangementEdits";
import type { PlannedTake } from "./takePlanning";

/**
 * One action, and how to walk it back and forward again.
 *
 * `action` is a **machine noun** (`"add-track"`, `"note-length"`) rather than a sentence: the words a person reads come
 * from the dictionary like every other word in this application, and a second copy of them here would be the copy that
 * drifts. It is what the toolbar publishes as `data-undo-action`, so "what is on top of the stack" is readable from the
 * DOM rather than inferred.
 */
export interface ArrangementCommand {
  /** A stable id for the kind of edit, e.g. `"add-track"`. Not user-facing copy. */
  action: string;
  /** Apply the action. Must be safe to call on any arrangement. */
  redo: (arrangement: ArrangementV2) => ArrangementV2;
  /** Put back exactly what the action displaced. Must be safe to call on any arrangement. */
  undo: (arrangement: ArrangementV2) => ArrangementV2;
}

/** The stack. `past` is oldest-first and `future` is nearest-first, so both ends are `pop`/`slice(-1)`. */
export interface ArrangementHistory {
  past: readonly ArrangementCommand[];
  future: readonly ArrangementCommand[];
}

export const EMPTY_ARRANGEMENT_HISTORY: ArrangementHistory = { past: [], future: [] };

/** Logic's own ceiling for the equivalent setting is 200 undo steps; the reason is in this file's header. */
export const HISTORY_LIMIT = 200;

export function canUndo(history: ArrangementHistory): boolean {
  return history.past.length > 0;
}

export function canRedo(history: ArrangementHistory): boolean {
  return history.future.length > 0;
}

/** What the Undo button will undo, for the readout — `undefined` when there is nothing. */
export function nextUndoAction(history: ArrangementHistory): string | undefined {
  return history.past[history.past.length - 1]?.action;
}

/** What the Redo button will redo. */
export function nextRedoAction(history: ArrangementHistory): string | undefined {
  return history.future[history.future.length - 1]?.action;
}

/**
 * ⭐ **A new action discards the redos.**
 *
 * This is the one behaviour every product read states in almost the same words: Logic's "when you make another edit,
 * dimmed entries are **removed from the list**, and replaced by an entry for the new edit", Ableton's "actions listed
 * above the selected action are then greyed out" and re-selectable only until the next action. So making a fresh edit
 * after an undo is lossy on purpose, and there is no branch to choose from.
 */
export function recordCommand(history: ArrangementHistory, command: ArrangementCommand): ArrangementHistory {
  const past = [...history.past, command];
  return {
    past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
    future: [],
  };
}

export interface HistoryStep {
  history: ArrangementHistory;
  arrangement: ArrangementV2;
}

/**
 * Walk one action backwards.
 *
 * ⚠️ **The entry is applied to the arrangement the caller passes in, not to a stored one.** That is the whole reason
 * this module holds no document: the value being edited is the editor's, and a stack that also held its own copy would
 * be a second writer of the same fact.
 *
 * `null` means "there was nothing to undo" — a distinct answer from "undone, and nothing changed", which is the
 * distinction U7 in this repository keeps insisting on.
 */
export function undoArrangement(history: ArrangementHistory, arrangement: ArrangementV2): (HistoryStep & { action: string }) | null {
  const command = history.past[history.past.length - 1];
  if (command === undefined) return null;
  return {
    history: { past: history.past.slice(0, -1), future: [...history.future, command] },
    arrangement: command.undo(arrangement),
    action: command.action,
  };
}

/** Walk one action forwards again. The mirror of `undoArrangement`, including what `null` means. */
export function redoArrangement(history: ArrangementHistory, arrangement: ArrangementV2): (HistoryStep & { action: string }) | null {
  const command = history.future[history.future.length - 1];
  if (command === undefined) return null;
  return {
    history: { past: [...history.past, command], future: history.future.slice(0, -1) },
    arrangement: command.redo(arrangement),
    action: command.action,
  };
}

/* ------------------------------------------------------------------------------------------------
 * The commands themselves.
 *
 * Every one of them is a thin pair of calls into `arrangementEdits.ts`: no arithmetic, no field names, no new
 * mutation path. If an edit ever gains a sibling there, its command belongs beside it here rather than in the view.
 * ---------------------------------------------------------------------------------------------- */

/** The raw constructor, for an edit whose inverse is not one of the shapes below. */
export function command(action: string, redo: ArrangementCommand["redo"], undo: ArrangementCommand["undo"]): ArrangementCommand {
  return { action, redo, undo };
}

/**
 * The shape most edits have: **one pure setter, called with the value it displaced and with its replacement.**
 *
 * `setArrangementTempo`, `setArrangementBars`, `setTrackGain`, `setTrackPan`, `setTrackSample`, `setTrackNoteLength`,
 * `setTrackFlag`, `setCollapsed` and `selectTrackTake` are all `(arrangement, …) => arrangement`, so "redo" and "undo"
 * are the same function with different arguments rather than two implementations that could disagree.
 */
export function setterCommand<K>(
  action: string,
  apply: (arrangement: ArrangementV2, value: K) => ArrangementV2,
  before: K,
  after: K
): ArrangementCommand {
  return {
    action,
    redo: (arrangement) => apply(arrangement, after),
    undo: (arrangement) => apply(arrangement, before),
  };
}

/**
 * ⭐ **Adding a track, and the one piece of state a command is allowed to keep.**
 *
 * `addTrack` mints its own identity (`freshId`), and an identity is exactly what an undo must not re-mint: the redo
 * after an undo has to put back **the same track**, because later actions on the stack — and the selection — name it.
 * So the id the first execution allocated is remembered and handed back in through `addTrack`'s own `extra` argument,
 * which is the parameter that exists for "a track that is more than kind and name".
 */
export interface AddTrackCommand extends ArrangementCommand {
  /** Set by the first `redo`. The view reads it to select the track that was just added. */
  addedTrackId?: string;
}

export function addTrackCommand(kind: TrackKindV2, name: string): AddTrackCommand {
  const self: AddTrackCommand = {
    action: "add-track",
    redo: (arrangement) => {
      const next = addTrack(arrangement, kind, name, self.addedTrackId === undefined ? {} : { id: self.addedTrackId });
      if (self.addedTrackId === undefined) self.addedTrackId = next.tracks[next.tracks.length - 1]?.id;
      return next;
    },
    undo: (arrangement) => (self.addedTrackId === undefined ? arrangement : removeTrack(arrangement, self.addedTrackId)),
  };
  return self;
}

/**
 * ⭐ **Removing a track is destructive, so its inverse is what was destroyed — and only that.**
 *
 * `removeTrack` also takes every track grouped under it (a folder's children would otherwise be orphans that nothing
 * on screen accounts for) and drops their notes. So the command records, at construction, **which tracks and which
 * notes disappeared and where they sat** — a handful of objects, not the arrangement — and `insertTrack` puts them
 * back in place. A redo removes them again by the same call the original edit used.
 */
export function removeTrackCommand(before: ArrangementV2, trackId: string): ArrangementCommand {
  const after = removeTrack(before, trackId);
  const survivors = new Set(after.tracks.map((track) => track.id));
  const removed = before.tracks
    .map((track, index) => ({ track, index }))
    .filter(({ track }) => !survivors.has(track.id));
  return {
    action: "remove-track",
    redo: (arrangement) => removeTrack(arrangement, trackId),
    undo: (arrangement) =>
      removed.reduce(
        (current, { track, index }) => insertTrack(current, track, before.notesByTrack?.[track.id] ?? [], index),
        arrangement
      ),
  };
}

/** Mute, solo and arm. The inverse of a boolean flag is the flag, which is why this needs no captured value. */
export function setTrackFlagCommand(trackId: string, flag: "muted" | "soloed" | "armed", value: boolean): ArrangementCommand {
  return setterCommand("track-flag", (arrangement, next: boolean) => setTrackFlag(arrangement, trackId, flag, next), !value, value);
}

/** Folding a folder. Display state, and its own inverse. */
export function setCollapsedCommand(trackId: string, collapsed: boolean): ArrangementCommand {
  return setterCommand("collapse", (arrangement, next: boolean) => setCollapsed(arrangement, trackId, next), !collapsed, collapsed);
}

export function setTrackGainCommand(trackId: string, before: number, after: number): ArrangementCommand {
  return setterCommand("gain", (arrangement, next: number) => setTrackGain(arrangement, trackId, next), before, after);
}

export function setTrackPanCommand(trackId: string, before: number, after: number): ArrangementCommand {
  return setterCommand("pan", (arrangement, next: number) => setTrackPan(arrangement, trackId, next), before, after);
}

export function setTrackSampleCommand(trackId: string, before: string, after: string): ArrangementCommand {
  return setterCommand("instrument", (arrangement, next: string) => setTrackSample(arrangement, trackId, next), before, after);
}

export function setArrangementTempoCommand(before: number, after: number): ArrangementCommand {
  return setterCommand("tempo", setArrangementTempo, before, after);
}

export function setArrangementBarsCommand(before: number, after: number): ArrangementCommand {
  return setterCommand("bars", setArrangementBars, before, after);
}

/**
 * ⭐ **Changing what a track is, whose inverse is the track itself.**
 *
 * `changeTrackKind` is the one edit that is **not** a "same setter, other value": leaving `sampler` deliberately drops
 * the `sample`, and no `setTrackKind(a, id, previousKind)` could put it back. So the previous track object is kept —
 * one track, not the arrangement — and restored whole by `replaceTrack`.
 */
export function changeTrackKindCommand(previous: TrackV2, kind: TrackKindV2): ArrangementCommand {
  return {
    action: "track-kind",
    redo: (arrangement) => changeTrackKind(arrangement, previous.id, kind),
    undo: (arrangement) => replaceTrack(arrangement, previous),
  };
}

/** Turning a grid step on or off is its own inverse, so the same call serves both directions. */
export function toggleStepCommand(trackId: string, index: number): ArrangementCommand {
  return {
    action: "step",
    redo: (arrangement) => toggleStep(arrangement, trackId, index),
    undo: (arrangement) => toggleStep(arrangement, trackId, index),
  };
}

/** Writing a note. Its inverse is removing the note at the position it was written. */
export function addTrackNoteCommand(trackId: string, note: NoteEvent): ArrangementCommand {
  return {
    action: "add-note",
    redo: (arrangement) => addTrackNote(arrangement, trackId, note),
    undo: (arrangement) => removeTrackNote(arrangement, trackId, { pitch: note.pitch, startBeats: note.startBeats }),
  };
}

/** Removing a note, where the note that was there is the inverse. `undefined` means nothing was removed, which is the honest no-op. */
export function removeTrackNoteCommand(trackId: string, at: { pitch: number; startBeats: number }, note: NoteEvent | undefined): ArrangementCommand {
  return {
    action: "remove-note",
    redo: (arrangement) => removeTrackNote(arrangement, trackId, at),
    undo: (arrangement) => (note === undefined ? arrangement : addTrackNote(arrangement, trackId, note)),
  };
}

/** Dragging a note — and back is the same drag with its ends swapped. */
export function moveTrackNoteCommand(
  trackId: string,
  from: { pitch: number; startBeats: number },
  to: { pitch: number; startBeats: number }
): ArrangementCommand {
  return {
    action: "move-note",
    redo: (arrangement) => moveTrackNote(arrangement, trackId, from, to),
    undo: (arrangement) => moveTrackNote(arrangement, trackId, to, from),
  };
}

export function setTrackNoteLengthCommand(
  trackId: string,
  at: { pitch: number; startBeats: number },
  before: number | undefined,
  after: number
): ArrangementCommand {
  return {
    action: "note-length",
    redo: (arrangement) => setTrackNoteLength(arrangement, trackId, at, after),
    undo: (arrangement) => (before === undefined ? arrangement : setTrackNoteLength(arrangement, trackId, at, before)),
  };
}

/** Choosing which take plays. The previous choice is the inverse. */
export function selectTrackTakeCommand(trackId: string, before: string | undefined, after: string | undefined): ArrangementCommand {
  return setterCommand("take", (arrangement, next: string | undefined) => selectTrackTake(arrangement, trackId, next), before, after);
}

/**
 * ⭐ **Filing a recording onto a track** — the one edit whose inverse is a whole track, because the *recording* is what
 * the track gained.
 *
 * `addTake` appends to `takes`, moves `selectedTakeId`, and (when the capture covered a bar range) rewrites
 * `takeRegions` through `assignTakeToRange`, which **splits** the regions it crosses. There is no "un-add a take" that
 * could put the split regions back, so the previous track object is carried — again one track, and the redo still goes
 * through `addTake` rather than through a stored result.
 */
export function addTakeCommand(previous: TrackV2, planned: PlannedTake): ArrangementCommand {
  return {
    action: "record",
    redo: (arrangement) => addTake(arrangement, previous.id, planned),
    undo: (arrangement) => replaceTrack(arrangement, previous),
  };
}
