/**
 * Adding, removing and regrouping tracks — the edits a Logic-like interface is made of, as pure functions.
 *
 * **Identities are stable and generated here**, not derived from position. An index-as-id is the classic version of this mistake: deleting the second of five tracks silently renames three others, and every
 * reference to them — an automation lane, a selection, a solo state — follows the wrong track. So ids come from a counter and are never reused within an arrangement.
 *
 * Every function returns a **new arrangement**, because a track list is state that an interface re-renders from; mutating in place is how a UI ends up showing something the model does not say.
 */
import type { ArrangementV2, NoteEvent, TakeRegion, TrackKindV2, TrackV2 } from "../types/arrangementV2";
import { stepCountFor, stepsPerBarFor } from "./noteEvents";
import type { PlannedTake } from "./takePlanning";
import { DEFAULT_SAMPLER_ASSET, defaultContentFor } from "./defaultContent";
import { addNote, moveNote, notesFromSteps, removeNote, setNoteLength, stepsFromNotes, STEPS_PER_BEAT } from "./noteEvents";

let nextId = 1;

/** Test/reset seam: ids only have to be unique **within** an arrangement, and a deterministic first id keeps criteria readable. */
export function resetTrackIdsForTests(): void {
  nextId = 1;
}

function freshId(kind: TrackKindV2): string {
  return `${kind}-${nextId++}`;
}

/**
 * The kinds this build has, in one array so "what is a valid kind" has one answer.
 *
 * It is runtime data rather than only the type because a value that arrives from outside the type system — an old file,
 * a hand-edited project — has to be checked against it, and a check written against a second copy of the list is the
 * copy that goes stale.
 */
export const TRACK_KINDS: readonly TrackKindV2[] = ["synth", "sampler", "drumkit", "fx", "folder"];

/**
 * ⭐ **A kind this build does not have is refused out loud, never guessed at.**
 *
 * The kind was renamed `instrument` → `synth` and **no compatibility is kept**: a caller that still sends the old word
 * is refused by the schema, which names the values that exist. This function is the same rule for a **value** rather
 * than a request. An arrangement that still carries `"instrument"` must fail with a sentence naming the value, rather
 * than fall through a lookup into `undefined` and become a lane with no role, a track with no name or a render with a
 * part silently missing. "This could not be read" is a result a caller can act on; "read as nothing" is the defect.
 *
 * **Where this is reached today, and what that leaves open.** No v2 arrangement's track list is persisted anywhere yet:
 * `ArrangementViewV2` holds it in `useState` (its own comment says "neither is persisted yet"), a `.groove` package
 * carries only the v1 `patterns`/`sections` that `projectSongToV2` re-derives from, and the MCP arrangements are a
 * process-local map. So the only way an old literal can arrive is as a **value handed to the model**, and this function
 * is called where such a value is compiled. **If a v2 arrangement is ever persisted, this check belongs at that
 * reader too** — the criterion in `src/test/mcpArrangement.test.ts` (which feeds a synthetic legacy value through the
 * compile) will not cover a file reader that never calls the compile, so it has to be re-verified there.
 */
export function requireTrackKind(kind: string, trackName?: string): TrackKindV2 {
  if ((TRACK_KINDS as readonly string[]).includes(kind)) return kind as TrackKindV2;
  throw new Error(
    `${trackName ? `track "${trackName}"` : "a track"} names kind "${kind}", which this build does not have — the kinds are ${TRACK_KINDS.join(", ")}; the kind once spelled "instrument" is now "synth", so an old arrangement that still says "instrument" has to be re-created rather than read as a synth`
  );
}

/**
 * A new arrangement **with one track of the chosen kind** — because an empty list is a question and one track is a place to start.
 *
 * The owner asked for a new-project entry where a template may be chosen *or* blank, and even blank has a default track typed by that choice. The reason is concrete: the record button needs a track to point
 * at, and an empty list has none.
 */
export function createArrangement(songId: string, kind: TrackKindV2 = "synth"): ArrangementV2 {
  const id = freshId(kind);
  const content = defaultContentFor(kind);
  // ⭐ Content arrives with the track: an empty track is silent, and a silent track looks like a broken engine.
  return {
    songId,
    tracks: [{ id, kind, name: DEFAULT_NAME[kind], ...(content.sample ? { sample: content.sample } : {}) }],
    notesByTrack: { [id]: notesFromSteps(content.steps, { velocity: 100 }) },
    // ⭐ Eight bars to start with, because an arrangement exists to hold more than one thing and one bar is where a pattern lives. The templates were written as one-bar patterns, so a new arrangement is long enough for them and short enough to see whole.
    bars: DEFAULT_BARS,
    sourceSlots: [],
  };
}

/**
 * How long a new arrangement is. **Eight rather than one**, because the old one-bar figure was the v1 pattern's length leaking into a surface that is not a pattern: an arrangement is a place where four bars is the shortest useful thing and eight fits on a screen.
 */
export const DEFAULT_BARS = 8;

/** The longest an arrangement may be. Long enough for a whole piece, short enough that a player never walks into a wall of silence. */
export const MAX_BARS = 128;

const DEFAULT_NAME: Record<TrackKindV2, string> = {
  drumkit: "Drums",
  synth: "Synth",
  sampler: "Sampler",
  fx: "FX",
  folder: "Folder",
};

/** The few common combinations, deliberately few: **a template list long enough to need choosing is the same as no templates.** */
export interface Template {
  id: string;
  name: string;
  kinds: Array<{ kind: TrackKindV2; name: string }>;
}

export const TEMPLATES: readonly Template[] = [
  { id: "drums-bass", name: "Drums + Bass", kinds: [{ kind: "drumkit", name: "Drums" }, { kind: "synth", name: "Bass" }] },
  { id: "drums-bass-chords", name: "Drums + Bass + Chords", kinds: [{ kind: "drumkit", name: "Drums" }, { kind: "synth", name: "Bass" }, { kind: "synth", name: "Chords" }] },
  // ⭐ The template that can be heard: sampler tracks are the kind the whole real-instrument path exists for.
  { id: "samplers", name: "Samplers", kinds: [{ kind: "sampler", name: "Sampler 1" }, { kind: "sampler", name: "Sampler 2" }] },
];

/** An arrangement from a template — **never empty**: every template has at least one track, and so does the blank case. */
export function createArrangementFromTemplate(songId: string, templateId: string | undefined, blankKind: TrackKindV2 = "synth"): ArrangementV2 {
  const template = TEMPLATES.find((candidate) => candidate.id === templateId);
  if (!template) return createArrangement(songId, blankKind);

  const tracks: TrackV2[] = [];
  const notesByTrack: Record<string, NoteEvent[]> = {};
  for (const { kind, name } of template.kinds) {
    const id = freshId(kind);
    const content = defaultContentFor(kind);
    tracks.push({ id, kind, name, ...(content.sample ? { sample: content.sample } : {}) });
    notesByTrack[id] = notesFromSteps(content.steps, { velocity: 100 });
  }
  return { songId, tracks, notesByTrack, sourceSlots: [] };
}

/**
 * The **starter notes** a kind is created with, as notes rather than steps — the same conversion `createArrangement`
 * performs, exposed so the MCP surface can tell "the caller wrote this" from "the starter content is still here".
 *
 * It exists because two field reports describe the same surprise: an agent asks for a new sampler track and receives
 * four notes at pitch 60 it did not write, with nothing in the reply saying so. The app's starter experience is
 * deliberately unchanged (§ `createArrangement`); the agent-facing path removes the notes instead, and this is how the
 * remaining case — an arrangement that still carries them — can be *named* rather than assumed away.
 */
export function starterNotesFor(kind: TrackKindV2): NoteEvent[] {
  return notesFromSteps(defaultContentFor(kind).steps, { velocity: 100 });
}

/**
 * True when a track's notes are exactly the untouched starter content for its kind.
 *
 * A note-for-note comparison rather than a flag, because there is no field in the model to mark them and adding one
 * would be a model change for a reporting decision. It is deliberately strict: adding, removing or editing any note
 * makes it false, so it fires on "nobody has touched this" and not on a coincidence of pitches.
 */
export function carriesStarterNotes(kind: TrackKindV2, notes: readonly NoteEvent[] | undefined): boolean {
  const starter = starterNotesFor(kind);
  if (starter.length === 0 || !notes || notes.length !== starter.length) return false;
  return notes.every((note, index) => {
    const expected = starter[index]!;
    return (
      note.pitch === expected.pitch &&
      note.startBeats === expected.startBeats &&
      note.lengthBeats === expected.lengthBeats &&
      note.velocity === expected.velocity
    );
  });
}

/**
 * Changing what a track **is** — which the owner asked for — and therefore deciding what happens to the fields that only made sense for the old kind.
 *
 * The rule is one sentence: **drop what belongs to the route or the sound source, keep what is content.** A `sample` describes which sample this track plays, which means nothing to a synth, so it must not
 * survive — a track carrying both would be the "shape permits it, semantics do not" state the model's criteria already guard against. But `takes` are **content, not identity** (the owner's own earlier
 * correction), so changing what a track is does not un-record what was played onto it, and the take choices travel with them.
 */
export function changeTrackKind(arrangement: ArrangementV2, trackId: string, kind: TrackKindV2): ArrangementV2 {
  return {
    ...arrangement,
    tracks: arrangement.tracks.map((track) => {
      if (track.id !== trackId) return track;
      const { sample: _dropped, ...rest } = track;
      /**
       * **A track that becomes a sampler gets the default instrument, exactly as a new one does.** `defaultContentFor` gives every sampler track an asset "because without it the lane compiles and the planner resolves it to nothing", and a kind
       * change used to leave the sample unset — so a sampler track sounded or not depending on how it had been created. An asset already chosen is kept rather than replaced.
       */
      const sample = kind === "sampler" ? (track.sample ?? { assetId: DEFAULT_SAMPLER_ASSET }) : undefined;
      return { ...rest, kind, ...(sample ? { sample } : {}) };
    }),
  };
}

export function addTrack(arrangement: ArrangementV2, kind: TrackKindV2, name: string, extra: Partial<TrackV2> = {}): ArrangementV2 {
  const id = freshId(kind);
  const content = defaultContentFor(kind);
  return {
    ...arrangement,
    tracks: [...arrangement.tracks, { id, kind, name, ...(content.sample ? { sample: content.sample } : {}), ...extra }],
    notesByTrack: { ...(arrangement.notesByTrack ?? {}), [id]: notesFromSteps(content.steps, { velocity: 100 }) },
  };
}

/**
 * Remove a track **and anything grouped under it**.
 *
 * A folder's children left behind would be orphans: they would still be in the model, still be compiled into lanes, and no longer be reachable from the interface — audible tracks that nothing on screen
 * accounts for.
 */
export function removeTrack(arrangement: ArrangementV2, trackId: string): ArrangementV2 {
  const doomed = new Set([trackId]);
  // Repeated passes, because a folder may contain a folder; the set grows until it stops growing.
  for (let changed = true; changed; ) {
    changed = false;
    for (const track of arrangement.tracks) {
      if (track.parentId && doomed.has(track.parentId) && !doomed.has(track.id)) {
        doomed.add(track.id);
        changed = true;
      }
    }
  }
  // ⭐ The notes go with the track. Leaving them would keep orphans that fire the next time something reuses that id — the same class of problem as a folder's orphaned children.
  const notes = { ...(arrangement.notesByTrack ?? {}) };
  for (const id of doomed) delete notes[id];
  return { ...arrangement, tracks: arrangement.tracks.filter((track) => !doomed.has(track.id)), notesByTrack: notes };
}

/** Move a track into a folder, or out of one with `parentId: undefined`. Refuses a folder into itself, which would make the tree unrenderable. */
export function setTrackParent(arrangement: ArrangementV2, trackId: string, parentId: string | undefined): ArrangementV2 {
  if (parentId === trackId) return arrangement;
  return { ...arrangement, tracks: arrangement.tracks.map((track) => (track.id === trackId ? { ...track, parentId } : track)) };
}

/**
 * The rest of what a track header does: mute, solo, arm, rename, and folding a folder.
 *
 * All of them are `map` over the track list, and the reason to write them here rather than inline in a component is the same reason the others are here: they are the states a song can be in, and a song
 * that is soloed in the model but not in the mixer — or folded in one view and not another — is a contradiction nobody can debug from the screen.
 *
 * **Folding is a display state and nothing else.** `setCollapsed` deliberately touches only `collapsed`, and there is a criterion for it, because a fold that silenced its children would be blamed on the
 * audio engine rather than on this function.
 *
 * `armed` shares this function rather than getting its own: it **is** the same shape of edit — one boolean on one track — and a second function with the same body is the kind of near-duplicate that later drifts.
 * What `armed` is *not* is the same semantics: nothing reads it when a recording starts (the take still goes to the selected track), which is stated on the field in `TrackV2` rather than implied by the
 * button's appearance.
 */
export function setTrackFlag(arrangement: ArrangementV2, trackId: string, flag: "muted" | "soloed" | "armed", value: boolean): ArrangementV2 {
  return { ...arrangement, tracks: arrangement.tracks.map((track) => (track.id === trackId ? { ...track, [flag]: value } : track)) };
}

export function renameTrack(arrangement: ArrangementV2, trackId: string, name: string): ArrangementV2 {
  // An empty name would leave a nameless row that nothing can be said about; the caller's own name is kept instead.
  const trimmed = name.trim();
  if (!trimmed) return arrangement;
  return { ...arrangement, tracks: arrangement.tracks.map((track) => (track.id === trackId ? { ...track, name: trimmed } : track)) };
}

/**
 * A track's level, in dB, where 0 is unity.
 *
 * **A separate edit from mute rather than a value of it**: Logic's track header has both for the same reason — a muted track keeps its level, and unmuting must not also undo a decision about how loud it is. Clamped to a range the engine can honour (±60 dB is already
 * inaudible at both ends), so a slider cannot send a value that means "silence by accident".
 */
/**
 * ⭐ **How long the arrangement is.** The edit exists because the length is content: it decides where a note may be written, how much the roll shows, and how long a bounce is — and those three must agree, so they read one number rather than three.
 *
 * Clamped to 1…128 rather than refused: a slider at its end is not an error, and an imported file with a silly number should open rather than be rejected.
 */
/**
 * ⭐ **The arrangement's tempo.** Clamped to 20…300 rather than refused, for the same reason the length is: a slider at its end is not an error, and an imported file with a silly number should open.
 *
 * It is stored on the arrangement because the compile had **120 hardcoded** — a value nobody chose, which is how a number becomes a decision without anybody making it.
 */
export function setArrangementTempo(arrangement: ArrangementV2, bpm: number): ArrangementV2 {
  const rounded = Math.round(bpm);
  const clamped = Math.max(20, Math.min(300, Number.isFinite(rounded) ? rounded : 120));
  return { ...arrangement, bpm: clamped };
}

/**
 * ⭐ **The tempo map itself, which the model could carry and no tool could set.**
 *
 * Muse's list, re-measured: "arrangement 无 tempo map — 整曲只能一个固定 BPM；变速乐章需手算时间再拼贴". The model,
 * the projection into the song input and the song's own creation were all built in this session — `tempoTrack` travels
 * from the arrangement to the renderer — and **there was still no way to say it from the MCP surface**, which is the
 * half-built shape this repository's `mcpCoverage` invariant exists to catch. `set_arrangement_tempo` writes a single
 * number; this writes the map.
 *
 * Validated, not clamped, for the reason the time signature is: a point silently moved or dropped is a tempo the
 * caller believes is in the file and is not, and every duration computed from it is then wrong in a way that looks
 * like the caller's own arithmetic. Points are sorted by bar on the way in, because a map that depends on the order it
 * was written in is a map that changes meaning when someone reorders it.
 */
export function setArrangementTempoMap(
  arrangement: ArrangementV2,
  points: readonly { atBar: number; bpm: number; curve?: "jump" | "linear" }[]
): ArrangementV2 {
  if (points.length === 0) {
    // Clearing the map is a real operation: it returns the arrangement to its single tempo rather than to nothing.
    const { tempoTrack: _cleared, ...rest } = arrangement;
    return rest;
  }
  const cleaned = points.map((point, index) => {
    /**
     * ⭐ **Validated on the value as written, before anything is rounded away.**
     *
     * `Math.round` used to run first, which made the checks below blind to what the caller wrote: bar `1.5` became
     * `2` and bpm `300.4` became `300`, so a point just outside the declared range was accepted and silently moved —
     * the failure this function's own comment says it exists to prevent. Measured: `{atBar: 1.5}`, `{atBar: 0.4}`,
     * `{bpm: 300.4}` and `{bpm: 19.6}` were all accepted. A bar is now read exactly (a whole number is the contract,
     * so rounding it is a decision the caller did not make), and the bpm range is tested against the written value
     * while an in-range bpm keeps the round-to-integer storage its sibling `setArrangementTempo` uses.
     */
    const { atBar, bpm } = point;
    if (!Number.isInteger(atBar) || atBar < 0) {
      throw new Error(`tempo point ${index + 1} has bar "${point.atBar}" — bars are whole numbers from 0 up`);
    }
    if (!Number.isFinite(bpm) || bpm < 20 || bpm > 300) {
      throw new Error(`tempo point ${index + 1} is ${point.bpm} bpm — the range is 20…300, the same one set_arrangement_tempo enforces`);
    }
    return { atBar, bpm: Math.round(bpm), ...(point.curve === undefined ? {} : { curve: point.curve }) };
  });
  // Sorted by bar, then deduplicated to the last point written for a bar, so two points cannot fight over one.
  const byBar = new Map<number, { atBar: number; bpm: number; curve?: "jump" | "linear" }>();
  for (const point of cleaned) byBar.set(point.atBar, point);
  return { ...arrangement, tempoTrack: [...byBar.values()].sort((a, b) => a.atBar - b.atBar) };
}

export function setArrangementBars(arrangement: ArrangementV2, bars: number): ArrangementV2 {
  const rounded = Math.round(bars);
  const clamped = Math.max(1, Math.min(MAX_BARS, Number.isFinite(rounded) ? rounded : 1));
  return { ...arrangement, bars: clamped };
}

/**
 * ⭐ **A signature that cannot be read is refused, and that is deliberately unlike its two neighbours.**
 *
 * `setArrangementTempo` and `setArrangementBars` above both **clamp** — an unreadable tempo becomes 120, an unreadable
 * length becomes 1 — and for a number that is the right call, because something has to be chosen and the choice is
 * harmless. A time signature is not a number: `"4/5"` or `"waltz"` clamped to `"4/4"` would leave a caller believing a
 * 7/8 arrangement had been written when a 4/4 one had, and every bar length downstream would be wrong in a way that
 * looks like the caller's own arithmetic. **An assumption must not look like a reading** — the rule this work has
 * applied to MIDI tempo, to the analysis curve, and to the summary beside it.
 *
 * The value is normalised to `n/d` with no spaces, because two spellings of one signature is how a later comparison
 * against `"3/4"` starts failing.
 */
export function setArrangementTimeSignature(arrangement: ArrangementV2, timeSignature: string): ArrangementV2 {
  const normalised = timeSignature.trim().replace(/\s*\/\s*/, "/");
  const match = /^(\d+)\/(\d+)$/.exec(normalised);
  const perBar = match ? Number(match[1]) : 0;
  const unit = match ? Number(match[2]) : 0;
  if (!match || perBar <= 0 || unit <= 0) {
    throw new Error(`"${timeSignature}" is not a time signature — write it as two positive numbers, e.g. "4/4", "3/4", "6/8"`);
  }
  return { ...arrangement, timeSignature: normalised };
}

export function setTrackGain(arrangement: ArrangementV2, trackId: string, gainDb: number): ArrangementV2 {
  const clamped = Math.max(-60, Math.min(12, gainDb));
  return {
    ...arrangement,
    tracks: arrangement.tracks.map((track) => (track.id === trackId ? { ...track, gainDb: clamped } : track)),
  };
}

/**
 * A track's position in the stereo field: **−1 hard left, 0 centre, 1 hard right**, the same scale the genres already use.
 *
 * Stored on the track rather than in the notes, because panning a part is a decision about the part; a piano roll that stored it per note would make "move this track a little left" a thing you do 200 times.
 */
export function setTrackPan(arrangement: ArrangementV2, trackId: string, pan: number): ArrangementV2 {
  const clamped = Math.max(-1, Math.min(1, pan));
  return {
    ...arrangement,
    tracks: arrangement.tracks.map((track) => (track.id === trackId ? { ...track, pan: clamped } : track)),
  };
}

export function setCollapsed(arrangement: ArrangementV2, trackId: string, collapsed: boolean): ArrangementV2 {
  return { ...arrangement, tracks: arrangement.tracks.map((track) => (track.id === trackId ? { ...track, collapsed } : track)) };
}

/**
 * Choosing takes — the whole-track choice and the per-range one the owner described ("recorded several times, and playback is one you chose, or one flattened from several").
 *
 * Both are the same model used at different granularity, and two properties matter more than the writes:
 *
 *   * **a region never overlaps another.** Choosing a take for a range splits any region it crosses rather than layering on top, because `resolveTakeForBar` reads the first match — overlapping regions
 *     would make the audible result depend on array order, which is exactly the kind of invisible coupling that turns "it plays the wrong take" into an unreproducible report;
 *   * **choosing a take that does not exist is refused**, not stored. A `selectedTakeId` naming nothing resolves to `undefined` and would silence the track while looking configured.
 */
/**
 * Point a sampler track at a different instrument.
 *
 * `changeTrackKind` decides whether a track *may* hold a sample; this chooses *which* one it plays. Only a `sampler` track accepts it — on any other kind the field would be a claim that something sounds from a track whose kind
 * says it does not, and the model keeps exactly one place where playing a catalogue asset is true.
 */
/**
 * Turn one step of a track's own pattern on or off.
 *
 * The steps are the track's content, and until now nothing in the arrangement interface showed them: the rows carried a name, a kind, mute, solo and delete, so a new project was silent in the sense that nothing on screen accounted for
 * what would be heard. Turning a step is therefore the smallest edit that makes the content both visible and the person's own.
 *
 * Refused for `fx` and `folder`: `defaultContentFor` gives them all-zero steps, and that is their definition rather than an omission — a folder makes no sound and an empty effect does nothing.
 */
export function toggleStep(arrangement: ArrangementV2, trackId: string, index: number): ArrangementV2 {
  const track = arrangement.tracks.find((candidate) => candidate.id === trackId);
  if (!track || track.kind === "fx" || track.kind === "folder") return arrangement;
  const notes = arrangement.notesByTrack?.[trackId] ?? [];
  /**
   * **The grid is a view over notes**, so a toggle is a conversion in both directions rather than an array index flip. The step count is the grid the caller is looking at — sixteen unless the track already says otherwise — and the pitch of a new note is the
   * track's existing lowest note when it has one, so toggling a drum row does not silently move it to middle C.
   */
  /**
   * ⭐ **The bound is the arrangement's length**, not a fixed sixteen and not a function of how many notes there happen to be. The old expression divided the note *count* by four, which is a category mistake that survived because both readings gave sixteen for a one-bar pattern.
   */
  // ⭐ The bar's length comes from the arrangement's signature too, so the grid this edit writes into is the same one the compile builds. Two places computing a bar's length is how a corrected 3/4 grid would have met a sixteen-step one here.
  const stepCount = stepCountFor(notes, arrangement.bars, stepsPerBarFor(arrangement.timeSignature));
  const { steps, pitches } = stepsFromNotes(notes, stepCount);
  if (index < 0 || index >= stepCount) return arrangement;
  steps[index] = steps[index] ? 0 : 1;
  const pitch = pitches.find((value) => value > 0) ?? 60;
  const next = notesFromSteps(steps, { pitches: pitches.map((value) => (value > 0 ? value : pitch)), velocity: 100 });
  return { ...arrangement, notesByTrack: { ...(arrangement.notesByTrack ?? {}), [trackId]: next } };
}

/**
 * Set a track's whole step pattern at once — the drum grid's write.
 *
 * `toggleStep` is what a person does one square at a time; this is what a caller that already knows the pattern states, and a tool whose result depends on the order of its calls is not the kind this surface wants. The length is the caller's: a pattern is the
 * steps it has, so this neither pads nor truncates. A step is **on when its value is non-zero**.
 *
 * It converts to notes rather than storing a grid, because notes are the model and the grid is a view. A step length is what a drum hit means here; a caller writing pitched music uses the note-level edits instead.
 */
export function setTrackSteps(arrangement: ArrangementV2, trackId: string, steps: readonly number[]): ArrangementV2 {
  const track = arrangement.tracks.find((candidate) => candidate.id === trackId);
  if (!track || track.kind === "fx" || track.kind === "folder") return arrangement;
  const existing = arrangement.notesByTrack?.[trackId] ?? [];
  const pitch = existing.length > 0 ? Math.min(...existing.map((note) => note.pitch)) : 60;
  const normalised = steps.map((value) => (value ? 1 : 0));
  return { ...arrangement, notesByTrack: { ...(arrangement.notesByTrack ?? {}), [trackId]: notesFromSteps(normalised, { velocity: 100, pitches: normalised.map(() => pitch) }) } };
}

/**
 * Add one note — what a piano roll, a keyboard or a MIDI file writes.
 *
 * The refusal is the same as the grid's, for the same reason: an effect or folder track makes no sound, so a note on it would be content nothing accounts for.
 */
export function addTrackNote(arrangement: ArrangementV2, trackId: string, note: NoteEvent): ArrangementV2 {
  const track = arrangement.tracks.find((candidate) => candidate.id === trackId);
  if (!track || track.kind === "fx" || track.kind === "folder") return arrangement;
  const notes = arrangement.notesByTrack?.[trackId] ?? [];
  return { ...arrangement, notesByTrack: { ...(arrangement.notesByTrack ?? {}), [trackId]: addNote(notes, note) } };
}

/**
 * ⭐ **A whole part in one call, because a part is not four thousand calls.**
 *
 * Muse measured this: 4176 notes through `add_arrangement_note` meant 4176 tool calls, a `MaxListenersExceededWarning`,
 * and hours of wall clock — for one movement of one piece. Nothing about the model made that necessary; the loop was
 * simply on the caller's side of the wire, where every iteration costs a round trip.
 *
 * It returns the same shape as its single-note neighbour and reports nothing itself, for the reason recorded on
 * `removeTrackNote` below: the arrangement **is** the report — a caller compares note counts before and after, which is
 * also how it discovers that a track of kind `fx` or `folder` swallowed the whole batch, since `addTrackNote` declines
 * those silently. A batch that returns "ok" while adding nothing would be the worse shape.
 */
export function addTrackNotes(arrangement: ArrangementV2, trackId: string, notes: readonly NoteEvent[]): ArrangementV2 {
  return notes.reduce((current, note) => addTrackNote(current, trackId, note), arrangement);
}

/** Remove a note at a position. Reported through the arrangement, so a caller can compare before and after. */
export function removeTrackNote(arrangement: ArrangementV2, trackId: string, at: { pitch: number; startBeats: number }): ArrangementV2 {
  const notes = arrangement.notesByTrack?.[trackId] ?? [];
  return { ...arrangement, notesByTrack: { ...(arrangement.notesByTrack ?? {}), [trackId]: removeNote(notes, at) } };
}

/** Move a note in time and pitch — dragging it in the roll. Refused when the destination already holds a note. */
export function moveTrackNote(
  arrangement: ArrangementV2,
  trackId: string,
  from: { pitch: number; startBeats: number },
  to: { pitch: number; startBeats: number }
): ArrangementV2 {
  const notes = arrangement.notesByTrack?.[trackId] ?? [];
  return { ...arrangement, notesByTrack: { ...(arrangement.notesByTrack ?? {}), [trackId]: moveNote(notes, from, to) } };
}

/** Change how long a note is held. A note shorter than a step is not visible in the grid, so one step is the floor. */
export function setTrackNoteLength(arrangement: ArrangementV2, trackId: string, at: { pitch: number; startBeats: number }, lengthBeats: number): ArrangementV2 {
  const notes = arrangement.notesByTrack?.[trackId] ?? [];
  return { ...arrangement, notesByTrack: { ...(arrangement.notesByTrack ?? {}), [trackId]: setNoteLength(notes, at, lengthBeats) } };
}

export function setTrackSample(arrangement: ArrangementV2, trackId: string, assetId: string): ArrangementV2 {
  return {
    ...arrangement,
    tracks: arrangement.tracks.map((track) =>
      track.id === trackId && track.kind === "sampler" ? { ...track, sample: { assetId } } : track
    ),
  };
}

/**
 * File a finished capture onto a track.
 *
 * The missing half of recording. `RecordButtonV2` captured audio and, on success, did nothing with it — no take reached the track, so the take list stayed empty no matter how many times a person recorded. The capture itself was fine;
 * nothing received it.
 *
 * The new take is selected, so it is the one heard rather than one the person has to find, and a capture that covered a bar range also claims that range through `assignTakeToRange` — reusing the splitting rule that keeps regions
 * disjoint, rather than a second implementation of it here.
 *
 * Every kind accepts a take: recording is an input form rather than a track type, and the owner corrected an earlier design that treated it as one. What differs is what was recorded — audio for a sampler, a MIDI sequence for the others — and
 * that is `Take.source`.
 */
export function addTake(arrangement: ArrangementV2, trackId: string, planned: PlannedTake): ArrangementV2 {
  const track = arrangement.tracks.find((candidate) => candidate.id === trackId);
  if (!track) return arrangement;
  const withTake: ArrangementV2 = {
    ...arrangement,
    tracks: arrangement.tracks.map((candidate) =>
      candidate.id === trackId
        ? { ...candidate, takes: [...(candidate.takes ?? []), planned.take], selectedTakeId: planned.take.id }
        : candidate
    ),
  };
  return planned.region
    ? assignTakeToRange(withTake, trackId, planned.region.startBar, planned.region.endBar, planned.take.id)
    : withTake;
}

export function selectTrackTake(arrangement: ArrangementV2, trackId: string, takeId: string | undefined): ArrangementV2 {
  return {
    ...arrangement,
    tracks: arrangement.tracks.map((track) => {
      if (track.id !== trackId) return track;
      // Refused rather than stored: a selection naming a take that is gone would resolve to nothing and silence the track while appearing configured.
      if (takeId !== undefined && !(track.takes ?? []).some((take) => take.id === takeId)) return track;
      return takeId === undefined ? { ...track, selectedTakeId: undefined } : { ...track, selectedTakeId: takeId };
    }),
  };
}

export function assignTakeToRange(arrangement: ArrangementV2, trackId: string, startBar: number, endBar: number, takeId: string): ArrangementV2 {
  return {
    ...arrangement,
    tracks: arrangement.tracks.map((track) => {
      if (track.id !== trackId) return track;
      if (endBar <= startBar) return track;
      if (!(track.takes ?? []).some((take) => take.id === takeId)) return track;

      // ⭐ Split every region the new one crosses, so regions stay disjoint: an overlap would make the heard take depend on array order.
      const kept: TakeRegion[] = [];
      for (const region of track.takeRegions ?? []) {
        if (region.endBar <= startBar || region.startBar >= endBar) {
          kept.push(region);
          continue;
        }
        if (region.startBar < startBar) kept.push({ ...region, endBar: startBar });
        if (region.endBar > endBar) kept.push({ ...region, startBar: endBar });
      }
      kept.push({ startBar, endBar, takeId });
      // Sorted by start so the stored order matches the musical order, which keeps a saved arrangement readable and a diff meaningful.
      kept.sort((a, b) => a.startBar - b.startBar);
      return { ...track, takeRegions: kept };
    }),
  };
}
