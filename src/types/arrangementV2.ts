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

export interface ArrangementV2 {
  /** The v1 song this was projected from — **kept, not copied**, so nothing can drift out of step with it. */
  songId: string;
  tracks: TrackV2[];
  /** Every clip slot that carried at least one track, so a projection can be checked for completeness. */
  sourceSlots: string[];
}
