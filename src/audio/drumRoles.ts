/**
 * **Which drum a lane is, as a note number — the map the drum lane never had.**
 *
 * A drum lane carries `steps` and `velocity` and **no pitches**: `kick` is one instrument, and which instrument it is
 * lives in `track_id` and `instrument` rather than in a column of the pattern. A sampled kit is the opposite shape —
 * one program that answers *many* notes — so something has to say "a `kick` lane is note 36 on this kit", and until now
 * nothing did. `src/audio/DrumKitModels.ts` answers every note with a physical model keyed by genre, which is why every
 * drum lane in the app sounds synthesised while a real kit sits in the catalogue.
 *
 * ## Why this is a table and not a rule
 *
 * The mapping is **General MIDI Percussion**, and that is a decision rather than a convenience: it is the convention
 * the library itself is written in. `virtuosity-drums-basic`'s own `Programs/keymaps/keymap_basic.sfz` writes
 *
 * ```
 * #define $KICK_SNWRONG_KEY 35
 * #define $KICK_SNRIGHT_KEY 36
 * #define $SNARE_CENTER_KEY 38
 * #define $HH_CLOSED_KEY 42
 * #define $HH_PEDAL_KEY 44
 * #define $HH_OPEN_KEY 46
 * …
 * //General MIDI percussion keys
 * ```
 *
 * and names that comment in its own source, so "note 38 on this kit" is not this project's invention. Everything an
 * inference would do here — match the *word* "kick" against a sample name, or pick the lowest sample per piece — answers
 * **confidently and wrongly** on a kit whose pads are in a different order, and a wrong drum is worse than a synthesised
 * one because nothing downstream can tell it was wrong. Each row is therefore a **judgement with its reason attached**,
 * and the lookup is an **exact match on the whole name** (the same discipline `src/data/sampledInstruments.ts` uses).
 *
 * ## What this table is not
 *
 *  * **It is not a claim that these are the only drum notes.** 54–84 are reachable on the kit; what the *genre data*
 *    writes is a role, and a role has exactly one answer here.
 *  * **It is not a synthesiser's map.** `808_kick`, `sub_kick` and `cyber` kits stay `DrumKitModels` — a TR-808 kick is
 *    a circuit, not a recording of a drum, so a recorded kit is the *wrong* answer for those lanes and
 *    {@link DrumVoicing.why} records that per row rather than hiding it in a default.
 *  * **It is not complete for every kit.** The note numbers are the standard's; whether a *particular* library has a
 *    sample behind them is a property of that library and is measured, not assumed — see `docs/DRUM_KIT_MAPPING.md`.
 */

/** The catalogues' answer for one drum lane: which library, which note, and the judgement that joins them. */
export interface DrumVoicing {
  /** The catalogue asset that serves the lane, by the id `list_arrangement_instruments` lists. */
  assetId: string;
  /** The General MIDI Percussion note this role plays on that kit. */
  note: number;
  /** Why this note is this role — the judgement, not a restatement of the two fields beside it. */
  why: string;
}

/**
 * **The role → note table.** Keyed by the lane's `track_id`, which is the engine's own name for a drum lane
 * (`SequencerTrack.track_id`: `kick | snare | hihat | percussion`) and the field the mixer, the dispatch and the
 * reporters already agree on — not by `instrument`, because `distorted_kick` appears on a **bass** lane as well as on
 * a kick lane (`src/data/genres/**`), so the instrument name alone does not say it is a drum.
 *
 * The note numbers are General MIDI Percussion; the source is cited in `docs/DRUM_KIT_MAPPING.md` §2.
 */
export const DRUM_ROLE_NOTES: Readonly<Record<string, { note: number; piece: string; because: string }>> = {
  kick: {
    note: 36,
    piece: "Bass Drum 1",
    because: "GM 36 is Bass Drum 1, the acoustic kick — and the kit's own keymap defines `$KICK_SNRIGHT_KEY 36` for `kickmic_kick_snon`.",
  },
  snare: {
    note: 38,
    piece: "Acoustic Snare",
    because: "GM 38 is Acoustic Snare, the hit at the centre of the head — the kit's `$SNARE_CENTER_KEY 38` names the same thing.",
  },
  hihat: {
    note: 42,
    piece: "Closed Hi-Hat",
    because: "GM 42 is Closed Hi-Hat. It is the default because a lane that carries one hat sound is the closed one in every genre the data writes; GM 44/46 (pedal/open) are the same kit's other hats and are reachable as percussion notes.",
  },
  percussion: {
    note: 82,
    piece: "Shaker",
    because: "GM 82 is Shaker, and the one instrument the data puts on this lane is `rim_shaker`. The kit's `$PERC_SHAKER_KEY 82` and `$PERC_MARACAS_KEY 70` are the two it carries; 82 is the shaker the name asks for.",
  },
};

/**
 * **The kit a drum lane plays, or `undefined` when it keeps its physical model.**
 *
 * `undefined` is the answer for a lane whose role is not in {@link DRUM_ROLE_NOTES} and for a lane whose `instrument`
 * names an **electronic** kit — `808_kick`, `sub_kick`, `808_snare`, `clap`, `tight_snare`, `reggae_rim`, `rimshot`.
 * That second half is a judgement rather than a lookup, so it is written as a list with the reason on it: those names
 * are drum *machines* and one-shot effects, and `virtuosity-drums-basic` is an acoustic kit, so pointing a TR-808 lane
 * at it would replace the sound the genre asked for with the wrong instrument — the failure this table exists to avoid,
 * in the other direction.
 */
export const DRUM_KIT_ASSET_ID = "virtuosity-drums-basic";

/**
 * The instrument names that mean **a drum machine or an effect, not an acoustic kit** — a lane whose `instrument` is one
 * of these keeps `DrumKitModels` whatever the kit's role says.
 *
 * It is a list of names rather than a rule ("contains 808", "starts with cyber") for the reason the whole codebase
 * keeps re-learning: `punchy_kick` and `acoustic_kick` must go to the recording, `distorted_kick` must not (it is a
 * processed sound the genre asked for), and a substring rule cannot tell those apart without a table that is the same
 * size and less honest.
 */
export const ELECTRONIC_DRUM_INSTRUMENTS: readonly string[] = [
  "808_kick",
  "808_snare",
  "sub_kick",
  "distorted_kick",
  "clap",
  "tight_snare",
  "reggae_rim",
  "rimshot",
  "cowbell_lead",
  "reverse_cymbal",
];

/**
 * **And the names that are acoustic, which is the other half of the same judgement.**
 *
 * This list exists so that "which drum names are a recording" is **total and checkable** rather than resting on a
 * refusal list that has to be complete in the negative: a criterion asserts that every drum `instrument` the genre data
 * writes is in exactly one of the two lists, so a new name cannot arrive and be silently classified by the default. It
 * is also what keeps the two from overlapping — a name in both would be a lane that is a recording and a model at once.
 *
 * `rim_shaker` is here rather than in the refusal list, and it is the row this list earned: the percussion lane's only
 * instrument, which reads like a synthetic effect but is a **shaker** — GM 82, which the kit carries as
 * `perc/close/shaker_up|down` and as `$PERC_SHAKER_KEY 82`. Refusing it by the sound of its name is exactly the kind of
 * guess this file exists to replace.
 */
export const ACOUSTIC_DRUM_INSTRUMENTS: readonly string[] = [
  "acoustic_kick",
  "punchy_kick",
  "acoustic_snare",
  "closed_hat",
  "rim_shaker",
];

/**
 * The catalogue voicing for a lane — **the role says which pad, and the instrument has to be an acoustic drum name for
 * there to be a pad at all.**
 *
 * Both halves are needed, and the second one is a correction the existing melodic criterion made: a `kick` lane whose
 * `instrument` is `piano_lead` is not a drum, and neither is any other role/instrument pair the data does not write. An
 * earlier version of this function asked only "is the role a drum role", which quietly promised a kick for a lane that
 * names a piano. Requiring membership of {@link ACOUSTIC_DRUM_INSTRUMENTS} keeps the answer reversible — a lane is a drum
 * only if the *data* says it is one — and the electronic list matches nothing here, so it drops out by construction
 * rather than by being consulted second.
 *
 * The match is on the **whole trimmed name**: no prefix, no substring, no synonyms, for the reason the melodic table
 * states (`punchy_kick` is served, `distorted_kick` is not, and no substring rule separates them honestly).
 */
export function drumVoicingForLane(
  lane: { track_id?: string; instrument?: string } | null | undefined
): DrumVoicing | undefined {
  if (!lane) return undefined;
  const instrument = (lane.instrument ?? "").trim().toLowerCase();
  // The same allowance as drumSamplingRefusal: a lane may name its instrument by its own role, and the row
  // above already says which note that role takes. No genre does this; only callers that name by role do.
  const roleName = (lane.track_id ?? "").trim().toLowerCase();
  if (!ACOUSTIC_DRUM_INSTRUMENTS.includes(instrument) && instrument !== roleName) return undefined;
  const row = DRUM_ROLE_NOTES[(lane.track_id ?? "").trim().toLowerCase()];
  if (!row) return undefined;
  return { assetId: DRUM_KIT_ASSET_ID, note: row.note, why: row.because };
}

/**
 * **Why a drum lane keeps its physical model** — the executable sentence a report carries, or `undefined` when there is
 * nothing to act on.
 *
 * `undefined` is the answer for the **decision**: an electronic kit is what the genre asked for, so a report that named it
 * on every render would be sixty lines of noise over the handful of real gaps — the same line `SAMPLED_INSTRUMENT_SYNTHS`
 * draws for a melodic synthesiser, applied to the drum half. A name under a drum role that is in **neither** list is the
 * other thing: this table has not classified it, which is a gap worth a sentence. {@link drumSamplingDecision} is the
 * explain-everything form, for a caller that wants to state the decision out loud.
 */
export function drumSamplingRefusal(
  lane: { track_id?: string; instrument?: string } | null | undefined
): string | undefined {
  if (!lane) return undefined;
  const role = (lane.track_id ?? "").trim().toLowerCase();
  if (!DRUM_ROLE_NOTES[role]) return undefined;
  const instrument = (lane.instrument ?? "").trim();
  if (instrument === "") return undefined;
  const lower = instrument.toLowerCase();
  // A lane that names its instrument by its own role (for example instrument "kick" on the kick role) is
  // served by that role's row above: no genre ever writes a bare role word as an instrument (measured across
  // all of src/data/genres: zero occurrences), so this only stops role-named callers being reported as gaps.
  if (lower === role) return undefined;
  if (ACOUSTIC_DRUM_INSTRUMENTS.includes(lower) || ELECTRONIC_DRUM_INSTRUMENTS.includes(lower)) return undefined;
  return `the instrument "${instrument}" is not classified in src/audio/drumRoles.ts under the drum role "${role}", so this lane keeps the model in src/audio/DrumKitModels.ts — classify it: an entry in ACOUSTIC_DRUM_INSTRUMENTS if a mirrored library carries it, otherwise an entry in ELECTRONIC_DRUM_INSTRUMENTS`;
}

/**
 * **The same decision, always explained** — for a caller that is describing what a lane sounds rather than reporting a
 * problem, such as a sound report or a picker's tooltip. It never returns `undefined` for a drum role that has an
 * unclassified name either, and it names which of the two lists the instrument would belong in.
 */
export function drumSamplingDecision(
  lane: { track_id?: string; instrument?: string } | null | undefined
): string | undefined {
  if (!lane) return undefined;
  const role = (lane.track_id ?? "").trim().toLowerCase();
  if (!DRUM_ROLE_NOTES[role]) return undefined;
  const instrument = (lane.instrument ?? "").trim();
  const lower = instrument.toLowerCase();
  if (ACOUSTIC_DRUM_INSTRUMENTS.includes(lower)) return undefined;
  if (ELECTRONIC_DRUM_INSTRUMENTS.includes(lower)) {
    return `"${instrument}" is a drum machine or a one-shot effect, not an acoustic kit, so this lane keeps its physical model in src/audio/DrumKitModels.ts — a recording of an acoustic drum would be the wrong instrument, not a better one`;
  }
  return drumSamplingRefusal(lane);
}

/** The note a role plays on the kit, or `undefined` for a role this table does not classify. */
export function drumNoteForRole(trackId: string | undefined): number | undefined {
  if (typeof trackId !== "string") return undefined;
  return DRUM_ROLE_NOTES[trackId.trim().toLowerCase()]?.note;
}

/**
 * **The role names this table classifies** — so a criterion can assert it covers every drum `track_id` the genre data
 * writes, which is what keeps "we never mapped it" from looking identical to "it is a synthesiser".
 */
export const DRUM_ROLE_IDS: readonly string[] = Object.keys(DRUM_ROLE_NOTES);
