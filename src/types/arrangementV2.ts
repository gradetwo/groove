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
import type { NoteConvention } from "../data/pitchTruth";
import type { SequencerTrack } from "./genre";

/**
 * The sounding kinds, plus `folder`, which groups without making a sound. A discriminated union rather than a pile of optional fields: "a track that is both a drum kit and a sampler" is a shape the fields would permit and the semantics do not have.
 *
 * ⭐ **`synth`, not `instrument`.** The kind was called `instrument` and that name was the defect: a person or an agent
 * who wants a piano reads "instrument", picks it, and gets a **built-in synthesiser whose timbre cannot be pointed at a
 * recorded piano** — the report's "build an instrument track, write 198 notes, hear something muddy" is that choice
 * being made for them by a word. `synth` says what the kind actually is, and the sampled instruments live on `sampler`
 * (`set_arrangement_track_asset`).
 *
 * **Why not `gs1`:** the name has to cover both synthesis roads this kind takes. Most roles resolve through the built-in
 * subtractive presets (`src/audio/instrumentPresets.ts` → `PolySynth.ts`); only `chords`/`lead`/`texture` route to GS-1
 * (`GS1_*_ROUTING`). `gs1` would be **narrower than the kind** and would mislabel the larger half.
 *
 * **The old spelling is not accepted, anywhere.** `"instrument"` is not an input alias and is not normalised on read:
 * callers get the schema's own error, and a value carrying the old literal is refused out loud by `requireTrackKind`
 * rather than falling into a lookup that would answer `undefined`.
 */
export type TrackKindV2 = "drumkit" | "synth" | "sampler" | "fx" | "folder";

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
  /**
   * Record-armed: the track the user has said they intend to record onto.
   *
   * A track flag like `muted`/`soloed` rather than view state, because "this track is armed" is a fact about the
   * track that outlives the row it is drawn in. **It does not yet decide where a recording lands** — the recording
   * path still puts a take on the selected track — and that is written here rather than left for the button to imply.
   */
  armed?: boolean;
  gainDb?: number;
  pan?: number;
  /** A `folder` this track belongs to, for a Track Stack. */
  parentId?: string;
  /**
   * ⭐ **This track's own GS-1 sound, as the synth project's share code** (`gs1.1.…`). Absent means the instrument table's answer, which is
   * what every track had before the v1 pattern carried the field -- the arrangement keeps the same idea on the track that makes the sound.
   */
  gs1Patch?: string;
  /**
   * ⭐ **Per-parameter overrides on top of {@link gs1Patch}**, so a lane can be tuned without touching the share code.
   *
   * The shape is the engine's own (`SequencerTrack["gs1PatchOverrides"]`, `{ parameters?, routes? }`) rather than a flat
   * name→number record: it is read by `resolveGs1Lane` and written by `apply_gs1_patch`, and two spellings of one
   * stored field would be a second format the renderer never agreed to. Deriving it means a change to the engine's
   * shape is a type error here instead of a patch that writes a field nothing reads.
   */
  gs1PatchOverrides?: NonNullable<SequencerTrack["gs1PatchOverrides"]>;
  /** The v1 role this track came from, kept so a projection can be verified against its source. */
  fromTrackId?: string;
  /** The v1 second name, for songs with two lanes of one kind. */
  fromLaneId?: string;
  /**
   * ⭐ **The v1 lane's declared instrument, when this track was projected from one** — `piano_lead`, `walking_upright`,
   * `rhodes_ep`, `warm_pad`, …
   *
   * It is carried because it is the **key of the recorded-instrument table** (`src/data/sampledInstruments.ts`): a genre
   * says "this lane is a piano" with this name and nothing else, so a projection that dropped it left the arrangement
   * unable to tell a piano from a pad, and every projected track sounded the role's default synthesiser. Kept beside
   * `fromTrackId`/`fromLaneId`, which exist for the same reason — the source's own words, preserved rather than
   * reinterpreted.
   *
   * **Absent** for a track created in the new interface: those are `synth` tracks with a built-in voice and no recorded
   * identity, and `undefined` says exactly that rather than inventing a name.
   */
  instrument?: string;
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
  /**
   * ⭐ **Where this track's region sits, when it has been moved or shortened.**
   *
   * `docs/ARRANGEMENT_UI_DESIGN.md` §4 recorded two roads and chose (a) first: *"每轨派生一个覆盖
   * `1..arrangement.bars` 的区域（如实的摘要，模型零改动）"*, with (b) waiting until arranging in sections was real:
   * *"把 `TakeRegion` 的 `{startBar,endBar}` 提升为通用的区域模型"*. **The drag is that "real"**: a region whose bar
   * is a fact the user set cannot be a pure derivation, because there is nowhere in the model to put "this bar".
   * So this is (b), in its smallest form — the same half-open `{startBar, endBar}` convention `TakeRegion` already
   * uses, one region per track (which is what the lane draws), not a new list of clips.
   *
   * **Absent means the region covers the whole arrangement** — bars `0..(arrangement.bars ?? DEFAULT_REGION_BARS)` —
   * which is option (a) exactly. So every arrangement written before this field reads unchanged, and a region dragged
   * back to its default span drops the field again (`setTrackRegion`), which is the same "a thing put back is
   * identical to a thing that never was" rule a label, a mute and a transpose already follow.
   *
   * **Bars, and fractional**: the unit the ruler and the loop brace are already in, so a dragged edge is a position
   * the model's own range types can express. The lane converts to beats with the same `BEATS_PER_BAR` it always has.
   */
  region?: TrackRegion;
}

/**
 * A track's region over the arrangement's bars, half-open (`startBar` inclusive, `endBar` exclusive) — deliberately
 * the same shape as `TakeRegion` minus the take, so the two can be compared without a translation nobody wrote down.
 */
export interface TrackRegion {
  startBar: number;
  endBar: number;
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
  /**
   * The syllable sung on this note, when this note is a sung one.
   *
   * A lyric is written **on the note it is sung on**, not in an array beside a grid: `startBeats` already gives a note identity, and the exporters sort,
   * split at barlines and merge ties, so a position-indexed list would come back shifted by the first note that moved. `SequencerTrack.syllables` stays
   * where it is — a step grid is a view over notes, and its index *is* the step — and a projection writes each step's syllable onto the note that sounds
   * there. Absent means the note is not sung, which is every note in every project written before this field existed.
   */
  syllable?: string;
}

export interface ArrangementV2 {
  /** The v1 song this was projected from — **kept, not copied**, so nothing can drift out of step with it. */
  songId: string;
  /** ⭐ **What a person calls it**; absent means unnamed. The v1 song had this and the arrangement did not. */
  name?: string;
  /**
   * ⭐ **The note-name convention this project states.** Absent for an older file, which reads as C4 — a label, never a fact
   * about the music: changing it must not move a single note number.
   */
  noteConvention?: NoteConvention;
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
  /**
   * ⭐ **Where the tempo changes, when one number cannot say it.**
   *
   * Muse composed a nine-movement piece whose movements run at 66–168 bpm and had to split it into **nine arrangements** rendered separately and stitched outside, because an arrangement could carry only a single tempo. The song layer has had a tempo map all along (`set_tempo`), the renderer schedules bar by bar from it (`src/data/tempoMap.ts`), and the arrangement's compile already projects into a song input — so the only thing missing was a way for the arrangement to say it, which is this field.
   *
   * Same shape as the song's own points, deliberately: `atBar` is **0-based**, exactly as `set_arrangement_tempo_map` documents it, so a caller who has used one can read the other without learning a second convention.
   */
  tempoTrack?: { atBar: number; bpm: number; curve?: "jump" | "linear" }[];
  /**
   * ⭐ **How many beats a bar holds, when it is not four.**
   *
   * The pattern has carried this all along (`src/types/genre.ts`, whose comment names `"3/4"`, `"6/8"`, `"5/4"` and `"7/8"`), and the arrangement did not — so a 3/4 movement had to be converted by hand, `ceil(bars × beatsPerBar / 4)`, because the step grid is built from a constant that is sixteen *because a bar is four beats*.
   *
   * Added exactly as `tempoTrack` above was, and for the same reason: the arithmetic to honour it already exists (`stepsPerBarFor`, and `stepCountFor`'s optional parameter behind it), so what was missing was only a way for an arrangement to say it. Absent means 4/4, which is what every existing arrangement already assumes.
   */
  timeSignature?: string;
  /** Every clip slot that carried at least one track, so a projection can be checked for completeness. */
  sourceSlots: string[];
}
