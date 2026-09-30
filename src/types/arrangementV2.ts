/**
 * The arrangement model that can hold arbitrary tracks — and **reads every song that already exists, losslessly**.
 *
 * Two things about this shape are decisions rather than conveniences.
 *
 * **It is a separate layer, not a replacement.** The songs in this project are the users' data, and their model is fixed: eight clip slots, sections, a note pattern per slot. None of those fields change here.
 * A v2 arrangement **projects** the v1 song and keeps referring to it, so the projection can be checked against the original field by field — which is the only form in which "lossless" means anything.
 *
 * **Notes stay in the pattern; tracks hold identity and routing.** `steps`, `velocity`, `pitch` and `syllables` belong to a clip in this engine, not to a track, so a v2 track carries what Logic's track list
 * carries — name, kind, colour, mute, solo, gain, pan, grouping — and the notes remain where every existing consumer already reads them.
 */

/** The sounding kinds, plus `folder`, which groups without making a sound. A discriminated union rather than a pile of optional fields: "a track that is both a drum kit and a sampler" is a shape the fields would permit and the semantics do not have. */
export type TrackKindV2 = "drumkit" | "instrument" | "sampler" | "fx" | "folder";

export interface TrackV2 {
  /** Stable identity. **Not an array index**, because deleting a track must not rename the others. */
  id: string;
  kind: TrackKindV2;
  name: string;
  color?: string;
  /** Display only. **Folding must never change what is heard** — an easy mistake, and one that would be blamed on the audio engine. */
  collapsed?: boolean;
  muted?: boolean;
  soloed?: boolean;
  gainDb?: number;
  pan?: number;
  /** A `folder` this track belongs to, for a Track Stack. */
  parentId?: string;
  /** The v1 role this track came from, kept so a projection can be verified against its source. */
  fromTrackId?: string;
  /** The v1 second name, for songs with two lanes of one kind. */
  fromLaneId?: string;
  /** Present on `sampler` tracks: the catalogue asset whose SFZ and samples this track plays. */
  sample?: { assetId: string };
  /**
   * Everything recorded onto this track, **whatever kind it is** — takes are content, not identity.
   *
   * A recording is an **input form**, not a track kind: an instrument or drum track records a MIDI performance and an audio track records sound, and both end up here with `source` saying which. Modelling
   * recording as a fifth kind would have made the two inseparable.
   */
  takes?: Take[];
  /** Which take plays when no region overrides it — the whole-track choice. */
  selectedTakeId?: string;
  /**
   * Per-range choices: "this section came from take 3, the next from take 7".
   *
   * Ranges and a whole-track selection are **one mechanism with two uses**, not two features: comping is what you get by choosing per range, and swapping the whole performance is what you get by choosing once.
   */
  takeRegions?: TakeRegion[];
}

export interface Take {
  id: string;
  /** Sortable, so "the most recent take" needs no separate pointer, and a list order cannot disagree with it. */
  recordedAt: number;
  /** What was recorded — the one field that distinguishes an audio take from a MIDI one, instead of the track's kind doing it. */
  source: "audio" | "midi";
  label?: string;
}

export interface TakeRegion {
  /** Bars, inclusive start and exclusive end, so adjacent regions neither overlap nor leave a gap. */
  startBar: number;
  endBar: number;
  takeId: string;
}

/**
 * One note, in musical time.
 *
 * **This replaces a sixteen-step array, which was the v1 pattern's grid carried into a model that no longer needs it.** A step array cannot say where inside a step a note begins, how long it is held, or what pitch it carries beyond one value per column — and
 * those are exactly the three things a piano roll writes. The owner's instruction was to stop letting the old step design constrain this one, and this is the piece of it that did.
 *
 * Time is **beats** (quarter notes), not steps, so the grid a person sees is a view over the model rather than the model itself. A drum part is not a special case: a drum note is a note with a pitch, exactly as it is in a DAW, which is why one model
 * covers both the grid and the roll.
 */
export interface NoteEvent {
  /** MIDI note number. */
  pitch: number;
  /** Where it starts, in beats from the arrangement's beginning. Fractional positions are the point: a roll is not a grid. */
  startBeats: number;
  /** How long it is held, in beats. */
  lengthBeats: number;
  /** 1–127, the same scale the keyboard's velocity slider uses. */
  velocity: number;
}

export interface ArrangementV2 {
  /** The v1 song this was projected from — **kept, not copied**, so nothing can drift out of step with it. */
  songId: string;
  tracks: TrackV2[];
  /**
   * ⭐ **What each track plays**, keyed by `trackId` — because notes are **content**, not identity, exactly as takes are.
   *
   * A v1 song keeps its notes in clips, which is why the earlier design note said "notes stay in the pattern". That describes the old model; a v2 arrangement is not bound to eight slots, so its notes live here, beside
   * the tracks that hold them, and `compileArrangementToLanes(arrangement, notes)` already assumed a map of this shape.
   *
   * **Keys are `trackId`s, which makes deletion a data question**, not just a list edit: a track's notes have to go with it or the model keeps orphans that fire the next time something reuses that id.
   */
  notesByTrack?: Record<string, NoteEvent[]>;
  /**
   * ⭐ **How long the arrangement is, in bars.** Absent means "as long as it needs to be", which is the honest reading of an older file: the length is then the longest thing written plus a bar, so nothing silently loses its end.
   *
   * It exists because a note has a position in **musical time**, and musical time has to have somewhere to be. Without it, a roll can only show the sixteen steps a lane happens to hold, and "write something in bar 3" is not a thing a person can do.
   */
  bars?: number;
  /**
   * ⭐ **How fast it goes, in beats per minute.** Absent means 120, which is what the compile used to hardcode — so an older file plays exactly as it did, and a new one can say what it wants.
   *
   * It belongs to the arrangement rather than to the song it was projected from: a tempo is a performance decision, and the same projection played at two tempos is two performances.
   *
   * It is here for the same reason `bars` is: a note's `startBeats` is a position in musical time, and how long that position lasts — the compiled pattern's `bpm` — has to come from somewhere. It is what lets an arrangement state its own tempo instead of playing at 120 because that number was written into the compile.
   */
  bpm?: number;
  /** Every clip slot that carried at least one track, so a projection can be checked for completeness. */
  sourceSlots: string[];
}
