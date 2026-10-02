/**
 * **Which written instrument name plays which catalogue recording — the table the genre data never had.**
 *
 * Every genre in `src/data/genres/**` declares a `track.instrument` per lane (sixty-one distinct names across
 * fifteen families), and every one of them resolved to a **synthesised** voice: a built-in subtractive preset
 * (`src/audio/instrumentPresets.ts`), a physical drum model, or a GS-1 patch. The mirrored sample libraries —
 * Salamander Grand Piano, VSCO 2 CE, VCSL, Karoryfer Meatbass and Emilyguitar, Virtuosity Drums — were reachable
 * from `kind: "sampler"` tracks and from nowhere else, so a bebop chart declaring `piano_lead` on its chords and
 * `walking_upright` on its bass sounded two synthesisers and a real piano and a real double bass were sitting in
 * the repository unused. This file is the missing mapping, written down.
 *
 * ## Why a table, and not a better guess
 *
 * The names are not a controlled vocabulary and they are not English sentences: `piano_lead` is a piano,
 * `walking_upright` is a double bass played pizzicato, and `warm_pad` is a synthesiser and stays one. Anything
 * that tried to *infer* the recording from the words — a substring match, a synonym list, a multilingual
 * dictionary — would answer "the piano" for `piano_lead` and "something stringy" for `pluck_string`, and it would
 * answer **confidently and wrongly** for the sixty names where there is no honest answer at all. A wrong
 * instrument is worse than a synthesiser: it is a claim about a composer's music that nobody made.
 *
 * So each row here is a **judgement that was made and can be reviewed**, with the reason attached, and the lookup
 * is an **exact match on the whole name** (`===` after trimming) — the same discipline `DEFAULT_SYNTH_PRESETS`
 * already uses for a name that is itself a preset key. `piano` does not match; `piano_lead` does. A name that is
 * not in the table is **not** approximated: it is reported as a gap (see {@link sampledInstrumentGap}), and the
 * lane keeps the synthesiser it has today.
 *
 * ## What this table is *not*
 *
 *  * **It is not "everything a real instrument".** `warm_pad`, `supersaw`, `acid_303`, `sub_bass`, `808_bass`,
 *    `saw_lead`, `noise_sweep` and their neighbours are **synthesisers by definition**; a recording of a piano
 *    would be the wrong answer for them, so they are deliberately absent rather than missing.
 *  * **It is not complete.** There is no electric piano, no electric bass, no distorted guitar, no accordion, no
 *    sitar and no section brass in the mirrored libraries — {@link sampledInstrumentGap} names those so a report
 *    can say "no recording serves this" instead of silently keeping the synthesiser.
 *  * **It is not a drum-kit mapping.** Drum lanes are physical models (`playKick`/`playSnare`/…) and a kit is not
 *    one instrument at one pitch; {@link SAMPLED_ROLES} says so in code.
 */
import type { SampleAsset } from "./sampleCatalogue";
import { instrumentIdentityFor, playableTechniques } from "./stringTechniques";

/**
 * One row: a genre data instrument name, the catalogue asset that serves it, and why.
 *
 * `instrument` is the exact string `src/data/genres/**` writes in `track.instrument`, and `assetId` is the exact
 * id `list_arrangement_instruments` lists (which comes from `public/samples/manifest.json`). Both are literals
 * here rather than one being derived from the other, precisely so that a review of this file is a review of the
 * mapping.
 */
export interface SampledInstrumentChoice {
  instrument: string;
  assetId: string;
  /** Why this recording serves this name — the judgement, not a restatement of the two ids beside it. */
  because: string;
}

/**
 * **The mapping, and the owner's own examples are the first three rows.**
 *
 * A row is here only when the recording **is the instrument the name means**. Where it is a neighbouring
 * instrument — a pipe organ for a Korg M1 organ, a concert flute for a pan flute, a clean electric guitar for a
 * nylon-strung one — the row is absent and the gap is named, because "close enough to sound better" is a claim
 * that has to be made out loud and not by a table.
 */
export const SAMPLED_INSTRUMENTS: readonly SampledInstrumentChoice[] = [
  {
    instrument: "piano_lead",
    assetId: "salamander-grand",
    because: "`piano_lead` is the genre data's acoustic piano (it resolves to the preset named \"Acoustic Piano\"), and `salamander-grand` is the catalogue's Acoustic Piano — a grand piano recorded note by note.",
  },
  {
    instrument: "walking_upright",
    assetId: "karoryfer-meatbass:pizz-basic",
    because: "`walking_upright` is a double bass, and a walking line is **plucked**: Meatbass's `pizz` programs are the plucked half of the same instrument the name describes (`arco` would be bowed).",
  },
  {
    instrument: "strings_lead",
    assetId: "vsco2ce:ViolinEnsSusVib",
    because: "`strings_lead` is the string ensemble (preset \"String Ensemble\"); VSCO 2 CE's `ViolinEnsSusVib` is a **violin section** sustained with vibrato, which is that ensemble's leading voice.",
  },
  {
    instrument: "sax_lead",
    assetId: "vcsl:Tenor-Saxophone-Keyswitch",
    because: "`sax_lead` is the jazz lead saxophone; VCSL's tenor saxophone is the horn that line is normally written for (the library also carries a Saxello — a soprano variant — which would be the smaller, brighter answer).",
  },
  {
    instrument: "trumpet_lead",
    assetId: "vsco2ce:TrumpetSus",
    because: "`trumpet_lead` is a trumpet, sustained; VSCO 2 CE's `TrumpetSus` is exactly that, and it is the same family as the harmon-muted row below.",
  },
  {
    instrument: "muted_trumpet",
    assetId: "vsco2ce:TrumpetHarmonMuteSus",
    because: "`muted_trumpet` names the mute, and the catalogue's own program name is \"Trumpet, harmon mute\" — a one-to-one match rather than a family resemblance.",
  },
  {
    instrument: "flute_lead",
    assetId: "vsco2ce:FluteSusVib",
    because: "`flute_lead` is a concert flute, sustained; VSCO 2 CE's `FluteSusVib` is that instrument with the vibrato a lead line wants.",
  },
  {
    instrument: "vibraphone",
    assetId: "vcsl:Vibraphone-Keyswitch",
    because: "The name is the instrument. VCSL's Vibraphone is a struck idiophone with motorised-vibrato keyswitch articulations.",
  },
  {
    instrument: "marimba_lead",
    assetId: "vcsl:Marimba",
    because: "The name is the instrument — `marimba_lead` is a marimba, and VCSL's Marimba is that instrument's full range.",
  },
  {
    instrument: "harmonica_lead",
    assetId: "vcsl:Harmonica-Hohner-Special20-C-Keyswitch",
    because: "`harmonica_lead` is a harmonica; VCSL carries three Hohner harmonicas by key, and the C Special 20 is the standard chromatic-friendly diatonic. The key is a real difference and is stated rather than hidden.",
  },
  {
    instrument: "guitar_lead",
    assetId: "karoryfer-emilyguitar:emily-clean",
    because: "`guitar_lead` is a guitar — in `traditional-jazz` it comps, in the rock families it leads — and Emilyguitar's `emily clean` is the clean single-note program. It is an **electric** guitar where `bossa-nova`'s chords mean a nylon-strung one; the name does not say which, and this row is the one that was chosen.",
  },
];

/**
 * ⭐ **The string techniques, as instrument identities** — the rows that let a chosen *playing technique* reach a track.
 *
 * ## Why this table is derived rather than hand-written
 *
 * `src/data/stringTechniques.ts` is the one place that measures what the pinned string library can play and which
 * program plays it. The bridge that landed resolves a track's `instrument` name through this file to a catalogue
 * recording, so a technique selection needs a name **here**; writing those names out by hand would be a second copy
 * of a mapping that already exists, and the first time a row's `assetId` was corrected the two would disagree — the
 * "two places, one thing" failure this file's own doc comment refuses.
 *
 * So the rows are **derived from the technique table's mirrored rows, in its own order**: eight playable rows today
 * (sustain and pizzicato on violin, viola, cello and contrabass), named `violin_section_sustain`,
 * `violin_section_pizzicato`, … , `contrabass_solo_pizzicato`. An unmirrored technique gets no row at all, because a
 * name that resolves to a recording the mirror does not hold would be a promise this table cannot keep — which is the
 * same rule the hand-written half follows for a mapped-but-absent asset.
 *
 * `strings_lead` above is still the violin section sustained; the derived `violin_section_sustain` is the same
 * recording under the name a caller reaches by **technique** instead of by genre role.
 */
export const SAMPLED_TECHNIQUE_INSTRUMENTS: readonly SampledInstrumentChoice[] = playableTechniques().map((program) => ({
  instrument: instrumentIdentityFor(program),
  assetId: program.assetId,
  because: `the ${program.technique} row of src/data/stringTechniques.ts — ${program.name} (${program.program}), measured there against the pinned library. ${
    program.note
  }`,
}));

/**
 * **Every name this table resolves** — the hand-written genre names and the derived technique identities.
 *
 * The lookup is built from this list rather than from {@link SAMPLED_INSTRUMENTS} alone, so a caller can name a playing
 * technique (`violin_section_pizzicato`) and a genre role (`strings_lead`) with the same exact-match rule and reach
 * the recording either way.
 */
export const ALL_SAMPLED_INSTRUMENTS: readonly SampledInstrumentChoice[] = [
  ...SAMPLED_INSTRUMENTS,
  ...SAMPLED_TECHNIQUE_INSTRUMENTS,
];

/**
 * **The names a composer would expect a recording for and the catalogue cannot serve** — the gaps, as data.
 *
 * Kept apart from {@link SAMPLED_INSTRUMENT_SYNTHS} on purpose, and the split is the whole point: a *gap* is a real
 * instrument this mirror does not carry, so it is worth a sentence in a report ("no electric piano is mirrored"), while
 * a **synthesiser is not a gap** — `warm_pad` is what the name means and the built-in preset is the correct answer, not
 * a fallback. Reporting both would put sixty lines of noise in every render and hide the four that matter.
 *
 * A row is here only when the name is a **real acoustic or electric instrument**. "Close enough" neighbours are not
 * gaps and are not rows either: `pan_flute` is a gap because a concert flute is a different instrument, while
 * `pluck_string` is one because an electric guitar is.
 */
export const SAMPLED_INSTRUMENT_GAPS: Readonly<Record<string, string>> = {
  rhodes_ep: "the catalogue holds no electric piano (VCSL's TX81Z is an FM synth module, not a Rhodes)",
  m1_organ: "the catalogue's organs are pipe and renaissance organs (VCSL `Pipe Organ`, `Renaissance Organ`), not the Korg M1 organ this name means",
  organ_lead: "the same gap as `m1_organ` — a Hammond drawbar organ is not a pipe organ",
  pick_bass: "the catalogue holds no electric bass; Meatbass is a double bass, and mapping a picked electric line to it would rename the instrument",
  finger_bass: "the same gap as `pick_bass` — a fingerstyle electric bass is not a double bass",
  slap_bass: "the same gap as `pick_bass`",
  distorted_guitar: "the catalogue holds no amplified or distorted guitar; Emilyguitar is clean",
  pluck_string: "`pluck_string` is a nylon-strung guitar; Emilyguitar is electric and VCSL has no guitar",
  brass_section: "VSCO 2 CE carries solo brass (trumpet, trombone, horn, tuba) and string **sections**, but no brass section",
  accordion_lead: "no accordion is mirrored",
  sitar_lead: "no sitar is mirrored",
  pan_flute: "no pan flute is mirrored; VSCO 2 CE's flute is a concert flute",
  bell_lead: "VCSL's Tubular Bells are an orchestral instrument, not the synthesiser bell patch this name means",
};

/**
 * **The names that are a synthesiser, an effect or a drum model by definition** — every one of the sixty-one names
 * the genre data uses that is not in {@link SAMPLED_INSTRUMENTS} or {@link SAMPLED_INSTRUMENT_GAPS}.
 *
 * It exists so that the classification is **total and checked**: a criterion asserts that mapped ∪ gaps ∪ synths is
 * exactly the set of names `src/data/genres/**` writes, so a new genre instrument cannot be added without someone
 * deciding which of the three it is. Before this, "we never mapped it" and "it is a synthesiser" looked identical in
 * the data, which is how a mapped instrument stays unmapped for a year.
 *
 * The list is not read at runtime; it is the recorded judgement the criterion checks.
 */
export const SAMPLED_INSTRUMENT_SYNTHS: readonly string[] = [
  // Bass roles that are synthesisers: a recording would be the wrong answer, not a better one.
  "sub_bass", "808_bass", "reese_bass", "acid_303", "analog_bass", "growl_lead", "square_lead", "fm_lead",
  "saw_lead", "distorted_kick",
  // Chord and lead voices that are synthesisers.
  "warm_pad", "supersaw", "brass_synth", "pluck_synth", "sine_lead", "cowbell_lead",
  // Effects and textures.
  "noise_sweep", "noise_rise", "sweep_down", "sub_drop", "laser_zap", "tape_stop", "reverse_cymbal",
  "vinyl_crackle", "horn_stab",
  // Drum lanes: a physical model, and a kit is many instruments at many pitches rather than one at one.
  "acoustic_kick", "punchy_kick", "sub_kick", "808_kick", "acoustic_snare", "tight_snare", "808_snare",
  "clap", "rimshot", "reggae_rim", "closed_hat", "rim_shaker",
];

/**
 * The v1 roles this table applies to — **`bass`, `chords` and `lead`, and nothing else**.
 *
 * A drum role is a physical model in the engine's own dispatch (`playKick`/`playSnare`/`playHiHat`/`playPercussion`),
 * and a kit is many instruments at many pitches rather than one instrument at one pitch, so a single `assetId` could
 * not describe it: `virtuosity-drums-basic` would need a note map per role, which is a different feature. `fx` is a
 * synthesiser effect by construction. Restricting here rather than in each caller means the boundary is stated once,
 * and a future row for a drum name cannot silently become a melodic sample.
 */
export const SAMPLED_ROLES: readonly string[] = ["bass", "chords", "lead"];

/** The row for an instrument name, by **exact** match on the trimmed name — no normalisation, no prefix, no synonyms. */
export function sampledInstrumentFor(instrument: string | undefined): SampledInstrumentChoice | undefined {
  if (typeof instrument !== "string") return undefined;
  const wanted = instrument.trim();
  if (!wanted) return undefined;
  return ALL_SAMPLED_INSTRUMENTS.find((choice) => choice.instrument === wanted);
}

/**
 * The catalogue asset a **lane** sounds, or `undefined` when it is not a recorded instrument.
 *
 * Two sources, in order, and the order matters:
 *
 *  1. **the lane's own `sample.assetId`** — a lane that says which recording it plays is believed, whether it is a
 *     v1 `audio` lane or a v2 `sampler` track that compiled to one. The lane is more specific than its name.
 *  2. **this table, keyed by the lane's `instrument`** — and only for a melodic role ({@link SAMPLED_ROLES}), so a
 *     drum or an effect name that later appears in the table cannot turn a kit lane into one piano note.
 *
 * It is one function because three separate callers have to agree about it — the offline planner, the live
 * scheduler and the sound report — and a second copy would be the "two places, one thing" failure this codebase
 * keeps paying for.
 */
export function sampledAssetForLane(
  lane:
    | { track_id?: string; instrument?: string; sample?: { assetId?: string } }
    | null
    | undefined
): string | undefined {
  if (!lane) return undefined;
  const role = (lane.track_id ?? "").trim().toLowerCase();
  const own = lane.sample?.assetId;
  if (typeof own === "string" && own.trim() !== "") {
    /**
     * A lane that names a recording plays it — an `audio` lane (the ninth kind, v1's own shape) or a melodic lane,
     * which is the shape this table compiles a mapped instrument to. A **drum or effect** lane that happens to
     * carry a sample id is not honoured: that is the case `sampleReferenceProblem` refuses out loud, and returning
     * an asset here would silently turn a kit lane into one note.
     */
    return role === "audio" || SAMPLED_ROLES.includes(role) ? own : undefined;
  }
  if (!SAMPLED_ROLES.includes(role)) return undefined;
  return sampledInstrumentFor(lane.instrument)?.assetId;
}

/** True when this lane's sound is a catalogue recording, whatever the catalogue holds. See {@link sampledAssetForLane}. */
export function isSampledLane(lane: Parameters<typeof sampledAssetForLane>[0]): boolean {
  return sampledAssetForLane(lane) !== undefined;
}

/**
 * **The recorded reason a name is a gap, without needing a catalogue** — for a report that says *why* a lane keeps a
 * synthesiser but cannot ask "and does this session's mirror carry it" (the arrangement surface has no catalogue).
 *
 * `undefined` for a synthesiser by definition, for a mapped name, and for an unclassified one; a report that wants the
 * "nobody has classified this yet" case should ask {@link sampledInstrumentGap}, which needs the catalogue.
 */
export function sampledInstrumentGapReason(instrument: string | undefined): string | undefined {
  const name = (instrument ?? "").trim();
  if (!name) return undefined;
  return SAMPLED_INSTRUMENT_GAPS[name];
}

/**
 * Why a lane that names a recorded instrument has none — the **executable** sentence a report carries when the
 * answer is "a synthesiser, and here is what to do about it".
 *
 * Three cases, and they send a reader to three different places:
 *
 *  * the asset is not in the catalogue **at all** — the mirror is not configured or the manifest does not declare
 *    that library, and the fix is to configure one (`VITE_SAMPLE_ROOT`), not to edit the genre;
 *  * the name is a **stated gap** ({@link SAMPLED_INSTRUMENT_GAPS}) — a judgement, and the fix is either a new
 *    library or a new row;
 *  * the name is **not in the table** and is not a gap — a name nobody has classified yet, which the row's own
 *    absence is the report of.
 *
 * `undefined` when there is nothing to say: the lane either plays a recording or is a synthesiser by definition.
 */
export function sampledInstrumentGap(
  lane: { track_id?: string; instrument?: string; sample?: { assetId?: string } } | null | undefined,
  catalogue: readonly SampleAsset[]
): string | undefined {
  if (!lane) return undefined;
  const assetId = sampledAssetForLane(lane);
  if (assetId !== undefined) {
    // A local membership test rather than `findSampleAsset`: this module is imported *by* `sampleCatalogue` (the
    // reference check has to know which lanes may carry a sample), so importing back would be a cycle.
    if (catalogue.some((asset) => asset.assetId === assetId)) return undefined;
    return `this lane is mapped to the catalogue recording "${assetId}", which no configured sample mirror serves — configure VITE_SAMPLE_ROOT (or point the lane at an asset from list_arrangement_instruments) and it plays the recording`;
  }
  const role = (lane.track_id ?? "").trim().toLowerCase();
  if (!SAMPLED_ROLES.includes(role)) return undefined;
  const instrument = (lane.instrument ?? "").trim();
  if (!instrument) return undefined;
  const gap = SAMPLED_INSTRUMENT_GAPS[instrument];
  if (gap) return `no catalogue recording is mapped for the instrument "${instrument}" (${gap}), so this lane keeps its built-in synthesised voice — mirror a library that carries it and add a row to src/data/sampledInstruments.ts`;
  // A synthesiser is not a gap: the built-in preset **is** the answer, and saying so in every render would drown the
  // handful of real gaps in sixty lines of noise. See `SAMPLED_INSTRUMENT_SYNTHS`.
  if (SAMPLED_INSTRUMENT_SYNTHS.includes(instrument)) return undefined;
  if (sampledInstrumentFor(instrument)) return undefined;
  return `the instrument "${instrument}" is neither mapped to a catalogue recording, nor listed as a known gap, nor recorded as a synthesiser in src/data/sampledInstruments.ts, so this lane keeps its built-in synthesised voice — classify it: a reviewed row if a mirrored library carries it, otherwise an entry in SAMPLED_INSTRUMENT_SYNTHS`;
}
