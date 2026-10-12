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
 *  * **It is not complete.** As of 2026-10-02 eleven of the thirteen names that had no recording do have one (see the rows below); {@link sampledInstrumentGap} still names
 *    the two that do not — `slap_bass`, which cannot be mirrored because the only good library forbids this use, and `pan_flute`, whose only clean source is behind a
 *    registration wall — so a report can say "no recording serves this" instead of silently keeping the synthesiser.
 *  * **Its drum half is a second list, not rows here.** A drum lane is decided by its **role** plus the note map in
 *    `src/audio/drumRoles.ts` (General MIDI Percussion), because a kit is one instrument at many pitches and a single
 *    `assetId` cannot describe it; {@link SAMPLED_DRUM_ROLES} says so in code. */
import type { SampleAsset } from "./sampleCatalogue";
import { instrumentIdentityFor, playableTechniques } from "./stringTechniques";
import { DRUM_KIT_ASSET_ID, drumSamplingRefusal, drumVoicingForLane } from "../audio/drumRoles";

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
    assetId: "dsmolken-double-bass:d-smolken-rubner-bass-pizz",
    because: "`walking_upright` is a double bass, and a walking line is **plucked**. This is the *same instrument and the same player* as the row it replaces, taken from the pizzicato program instead: the pinned readmes both say so — `dsmolken-double-bass` is \"1958 Otto Rubner double bass played and mapped by D. Smolken … Fifths tuning (CGDA), Thomastik-Infeld Spirocore strings\", and `karoryfer-meatbass` (the previous answer) is \"samples of a 1958 Otto Rubner double bass played and mapped by Drogomir Smolken … Fifths tuning (CGDA), Thomastik-Infeld Spirocore strings\". What changes is the opcode the four round robins are built on: this program takes them from `seq_length`/`seq_position`, which `src/audio/sfz/parse.ts` implements, while Meatbass's `pizz_basic.sfz` takes them from `lorand`/`hirand`, which that parser does not read — so Meatbass answers every repeat with its first take. The printed range is stated rather than assumed: the file's own header says \"Sampled notes range from C1 through A3 for pizz\". CC0, so no attribution. ⚠️ `amp_velcurve_*` and `bend_up`/`bend_down` are not implemented either (they are in the entry's `needs`), so velocity follows the app's own curve.",
  },
  {
    instrument: "strings_lead",
    assetId: "vsco2ce:ViolinEnsSusVib",
    because: "`strings_lead` is the string ensemble (preset \"String Ensemble\"); VSCO 2 CE's `ViolinEnsSusVib` is a **violin section** sustained with vibrato, which is that ensemble's leading voice.",
  },
  {
    instrument: "sax_lead",
    assetId: "mtg-solo-sax:MTG-Tenor-Sax",
    because: "`sax_lead` is the jazz lead saxophone, and the horn that line is normally written for is the **tenor**. This is that horn, named as a program: MTG Solo Saxophones' program table carries \"Tenor saxophone\" (`MTG Solo Saxophones/MTG Tenor Sax.sfz`), inside what its README calls \"A complete set of Soprano, Alto, Tenor and Baritone solo saxophones built from MTG free samples pack\", recorded by the Music Technology Group (Universitat Pompeu Fabra) and mapped by kinwie at \"24 bit, 48 kHz, Mono\" with \"3 round-robins\" and \"2 velocity layers\". It replaces `vcsl:Tenor-Saxophone-Keyswitch` — the same instrument, but behind a **keyswitch wrapper**: its Vibrato, Non-Vibrato and Staccato articulations are selected by `sw_*` opcodes `src/audio/sfz/parse.ts` does not read, so which take answers a key is decided by region geometry rather than by the switch (the Vibrato group's `F#2` region spans keys 54–56 while the Staccato group writes a `G#2` region with `lokey=56 hikey=56`, so note 56 answers with the staccato take). `src/data/stringTechniques.ts` refuses this library's `-KS` programs for the same reason. ⚠️ Two differences are stated rather than hidden: this row is **CC BY 4.0 and requires the attribution the manifest carries**, and MTG's vibrato and legato are MIDI-CC modulations (`pitchlfo_depth_oncc1`, `locc64`, `trigger=legato`) this loader does not implement, so it plays the app's own envelope and the modwheel adds nothing.",
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
  /**
   * ⭐ **The rows added on 2026-10-02, when the libraries the plan costed were mirrored.** Every one names the recording that *is* the instrument the genre name means, and the
   * two that are a judgement about a neighbouring instrument (`m1_organ`, `bell_lead`) say so in their own `because` rather than being left to look exact.
   */
  {
    instrument: "rhodes_ep",
    assetId: "jlearman-jrhodes3c:jRhodes-both-looped",
    because: "`rhodes_ep` is a Fender Rhodes electric piano, and `jRhodes3c` is a **recorded 1977 Rhodes Mark I Stage 73** — both pickups, five velocity layers, looped. It replaces the synthesiser that used to stand in for this name. The licence is CC BY-NC-SA 4.0, accepted because this project is non-commercial (see `src/data/libraryLicence.ts`).",
  },
  {
    instrument: "m1_organ",
    assetId: "freepats-drawbar-organ",
    because: "⚠️ **A judgement about a neighbour, said out loud.** `m1_organ` is the Korg M1's organ patch — a digital instrument — and no Korg M1 is mirrored. What is mirrored is FreePats' **drawbar/tonewheel organ emulation**, recorded from setBfree: the tonewheel family that patch imitates, and the closest real instrument the catalogue has. It is an **emulation of a Hammond, not a recording of one**, which is a real difference and is why this is the one row here whose instrument is not literally the name.",
  },
  {
    instrument: "organ_lead",
    assetId: "freepats-percussive-organ",
    because: "`organ_lead` is a Hammond-style lead organ; FreePats' percussive registration is the same tonewheel emulation with the percussion stop engaged, which is the colour a jazz lead line is written for. Same caveat as `m1_organ`: a setBfree emulation, not a recorded Hammond.",
  },
  {
    instrument: "pick_bass",
    assetId: "karoryfer-pastabass",
    because: "`pick_bass` is an electric bass played **with a pick**. Karoryfer's Pastabass `linguine` is a picked flatwound bass on its bridge pickup — the readme's own words are \"linguine - flatwound strings, picked, bridge pickup\" — and the engine measures it sounding **keys 33–101 (69 keys, no holes)**, so it answers the D3/F3/G3 that `post-punk`'s bass writes and every note the eight `pick_bass` lanes that were losing their top notes write. It replaces FreePats' `PickedBassYR`, a picked bass too, but one the same measurement puts at **keys 26–46** — which is why those lanes were partial and `post-punk`'s bass was silent. Its licence is CC0 (its `LICENSE` is the CC0 1.0 text), and the readme adds \"royalty-free for all commercial and non-commercial use, including conversion into other sampler formats and redistribution as part of larger sample libraries\". ⚠️ Recorded rather than hidden: the highest **recorded** root is D♭6 (key 85), so keys 84–101 are that one recording transposed up; and `ampeg_release`, `amp_velcurve_*` and `lorand`/`hirand` are outside the implemented subset (they are in the entry's `needs`), so the note ends by the app's own release, velocity follows the app's own curve, and a repeated note takes its first round robin.",
  },
  {
    instrument: "finger_bass",
    assetId: "karoryfer-black-and-blue-basses:05-darkblack-pluck",
    because: "`finger_bass` is a fingerstyle electric bass; Karoryfer's `darkblack` is a fingerstyle bass with **four velocity layers and four round robins** (the plan measured `lovel`/`hivel` 31/63/95/127 and `seq_length=4`), which is the quality-first choice over the 3 MiB FreePats finger variation that is also in the catalogue as `freepats-electric-bass-yr:FingerBassYR-20190930`.",
  },
  {
    instrument: "distorted_guitar",
    assetId: "freepats-fsbs-dist2",
    because: "`distorted_guitar` names an amplified, distorted electric guitar; FreePats' FSBS **Distorted #2** is a Fender sampled through an amplifier and effects rack — distortion is the recording, not a plug-in. The `#1` flavour exists upstream at about twice the size and was not mirrored.",
  },
  {
    instrument: "pluck_string",
    assetId: "freepats-spanish-classical-guitar",
    because: "`pluck_string` is a plucked nylon-strung guitar; this is a **Spanish classical guitar**, one sample per semitone across E1–C6, which is the instrument this name means rather than the electric guitar that used to be the nearest thing.",
  },
  {
    instrument: "brass_section",
    assetId: "sonatina-brass:All-Brass-Sustain",
    because: "`brass_section` is trumpets, horns, trombones and tuba playing together; Sonatina's `All Brass Sustain` is literally that — it includes the trumpet, horn, trombone, bass-trombone and tuba sustain programs in one patch — which is the ensemble the name means. It is a **looped synthetic-hall** recording and the crossfade layers (`xf_*`) and `sw_*` keyswitching are not implemented, so the inner layers and the switch articulations are the file's own; the sustain program itself resolves every note to a mirrored sample.",
  },
  {
    instrument: "accordion_lead",
    assetId: "freepats-button-accordion-hn",
    because: "`accordion_lead` is an accordion; this is a Hohner button accordion recorded by Jeff Stauffer, one velocity layer, looped (`loop_start`/`loop_end`, `loop_continuous` — both implemented). ⚠️ Its `amp_veltrack`, `offset`, `amp_random` and `ampeg_*` are **not implemented**, so it plays with the app's own envelope and a flat velocity response; that is recorded in the entry's `needs`.",
  },
  {
    instrument: "sitar_lead",
    assetId: "discord-gm-sitar:105-Sitar",
    because: "`sitar_lead` is a sitar, and this is a real sitar recording (78 regions, one sample per semitone, C0–C7) contributed to the Discord SFZ GM Bank by Dr. Narayan Bhagawan Raikar under CC0. Its own file says it was \"created for testing purpose only for indian instruments\" — a thin map over real recordings, stated rather than hidden.",
  },
  {
    instrument: "bell_lead",
    assetId: "vcsl:Tubular-Bells-1",
    because: "⚠️ **A judgement about a neighbour, said out loud.** `bell_lead` means a synthesiser bell patch; VCSL's **Tubular Bells 1** is a real orchestral instrument — struck brass tubes — not that patch. It is the row the mirror can afford for free (the bytes were already mirrored), and the two differences are real: a tubular bell is an orchestra's bell rather than a synth bell, and this program's range is **C4–F#5 (MIDI 60–77)** because that is what it was recorded for, so notes outside it are stretched. `ampeg_release=30 s` is also outside the implemented set, so the note ends by the app's own release rather than the file's. An alternative with a wider range was mirrored for comparison — `freepats-tubular-bells1` (A3–C6, two velocity layers, `lorand`/`hirand` round-robin) — and was **removed from the manifest and the mirror on 2026-10-03**, so the catalogue no longer offers it and this row is the only tubular bell the mirror holds.",
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
 * So the rows are **derived from the technique table's mirrored rows, in its own order**: **all 26 rows today** —
 * sustain, quiet, pizzicato, spiccato and tremolo on the violin, viola, cello and contrabass sections plus the solo
 * violin, and `non-vibrato` on the contrabass (the library's only such program) — named `violin_section_sustain`,
 * `violin_section_pizzicato`, … , `solo_violin_tremolo`, `contrabass_solo_non_vibrato`. Until the 2026-10-02 rounds
 * only eight of them were mirrored (sustain and pizzicato on the four sections); the tremolo, spiccato, quiet and
 * solo-violin rows joined when their bytes were mirrored, and `non-vibrato` with the Part 2 round. An unmirrored
 * technique still gets no row, because a name that resolves to a recording the mirror does not hold would be a
 * promise this table cannot keep — which is the same rule the hand-written half follows for a mapped-but-absent
 * asset.
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
 * gaps and are not rows either: `pan_flute` is a gap because a concert flute is a different instrument, and it stayed one
 * after the 2026-10-02 round because no pan flute could be fetched at all — while `pluck_string` **left** this list the
 * same day, when a nylon-strung classical guitar was mirrored and a row was written for it.
 */
export const SAMPLED_INSTRUMENT_GAPS: Readonly<Record<string, string>> = {
  slap_bass:
    "the catalogue holds no slap electric bass, and the best one found cannot be mirrored: Project16's Rickenbacker 4001 is CC BY-NC-SA 3.0 **and** its own text says \"You are not allowed to use this product in a sampling library or in a related product\". That is a prohibition of this use rather than a non-commercial restriction, so the project's non-commercial status does not reach it (the same reason `Pianobook` is out). No CC0 or CC-BY slap bass was found",
  pan_flute:
    "no pan flute is mirrored and none could be fetched: the only cleanly-licensed one found (Polyphone's \"Pan Flute\", public domain) sits behind a registration wall and ships as SF2 rather than SFZ, and the Discord GM Bank's `076-Pan Flute` is a `sample=*sine` stub — it declares no samples at all, so there is nothing to download",
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
  // The **acoustic** drum names, which are no longer a physical model. They keep a row here because this table
  // classifies a name, and the name does not say which drum it is: `acoustic_kick` on a `kick` lane now sounds the
  // catalogue kit (see `src/audio/drumRoles.ts`), while the same name on a lane whose role is not a drum role has no
  // note to play and falls to the model. The list also keeps the old classification's promise — that no name is
  // silently unmapped — and the criterion that asserts these three lists are disjoint and total still holds.
  "acoustic_kick", "punchy_kick", "sub_kick", "808_kick", "acoustic_snare", "tight_snare", "808_snare",
  "clap", "rimshot", "reggae_rim", "closed_hat", "rim_shaker",
];

/**
 * The v1 roles this table applies to **by instrument name** — `bass`, `chords` and `lead`, and nothing else.
 *
 * The name table is for a lane whose sound is decided by what the composer called it. A drum lane is decided instead by
 * the **role** it is (`track_id`) plus the note map in `src/audio/drumRoles.ts`, which is why that half is a second list
 * ({@link SAMPLED_DRUM_ROLES}) rather than rows in {@link SAMPLED_INSTRUMENTS}: a drum role is many notes on one kit,
 * and a single `assetId` cannot describe it without a note. `fx` is a synthesiser effect by construction. Restricting
 * here rather than in each caller means the boundary is stated once, and a future row for a drum *name* cannot silently
 * become a melodic sample.
 */
export const SAMPLED_ROLES: readonly string[] = ["bass", "chords", "lead"];

/**
 * **The v2 roles that sound a catalogue recording too — and they are a different shape, so they are a different list.**
 *
 * `src/audio/drumRoles.ts` is why this can exist at all: a drum lane carries no pitches, so it needed a **role → note**
 * map before a single `assetId` could describe it, and that map is now written data with the General MIDI standard as
 * its reason. The drum half is therefore resolved by the same entry point and reported by the same reporters as the
 * melodic half — one place decides what a lane sounds — but it is kept as a separate list because the two ask different
 * questions: a melodic role has **one** asset and no note (the pattern's own `pitch` supplies that), while a drum role
 * has one asset and **one note per role**.
 *
 * The names here are the drum `track_id`s the engine routes by (`SequencerTrack.track_id`), not instrument names: the
 * instrument `distorted_kick` appears on a **bass** lane in `src/data/genres/**`, so a name is not evidence of a drum.
 */
export const SAMPLED_DRUM_ROLES: readonly string[] = ["kick", "snare", "hihat", "percussion"];

/**
 * The catalogue asset and note for a **drum** lane, or `undefined` when it keeps its physical model.
 *
 * This is the drum arm of the same decision {@link sampledInstrumentFor} makes for a melodic name, and it lives beside it
 * so a caller cannot find one and miss the other: `sampledAssetForLane` below is the one entry point, and it consults
 * this before the name table.
 */
export function sampledDrumVoicingForLane(
  lane: { track_id?: string; instrument?: string } | null | undefined
): { assetId: string; note: number } | undefined {
  const voicing = drumVoicingForLane(lane);
  return voicing ? { assetId: voicing.assetId, note: voicing.note } : undefined;
}

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
 * Three sources, in order, and the order matters:
 *
 *  1. **the lane's own `sample.assetId`** — a lane that says which recording it plays is believed, whether it is a
 *     v1 `audio` lane or a v2 `sampler` track that compiled to one. The lane is more specific than its name.
 *  2. **the drum table** (`src/audio/drumRoles.ts`), keyed by the lane's **role** — a drum lane carries no pitches, so
 *     its role is what says which pad it plays, and the note comes with the asset. Asked before the name table because
 *     a drum role is decided by `track_id`, not by `instrument`: `distorted_kick` is a *bass* lane elsewhere in the data.
 *  3. **the name table**, keyed by the lane's `instrument` — and only for a melodic role ({@link SAMPLED_ROLES}), so a
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
  const drum = sampledDrumVoicingForLane(lane);
  if (drum) return drum.assetId;
  /**
   * ⭐ **A drum role that resolves to nothing resolves to nothing because of the drum table, not because the name is
   * unclassified** — and the distinction has to be made here or every caller downstream draws the wrong conclusion.
   *
   * Without this line, `{ track_id: "kick", instrument: "808_kick" }` falls through to the melodic name table, which does
   * not hold `808_kick` either, so it is `undefined` by accident — and a caller cannot tell "the drum table refused this
   * as a drum machine" from "nobody thought about this name", which is exactly the conflation the three lists exist to
   * prevent. Returning `undefined` here is the same answer, reached on purpose.
   */
  if (SAMPLED_DRUM_ROLES.includes(role)) return undefined;
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
    /**
     * ⭐ **The lane keeps whatever voice it has today, and the sentence names it** — a synthesiser for a melodic lane, a
     * **physical model** for a drum lane. Both are the stated fallback, and both are the same *situation* (a mirror that
     * does not serve the recording) with the same fix, so they share one sentence rather than growing a second report that
     * would then have to be kept in step with this one.
     */
    const laneRole = (lane.track_id ?? "").trim().toLowerCase();
    const kept = SAMPLED_DRUM_ROLES.includes(laneRole)
      ? "this lane keeps its physical model in src/audio/DrumKitModels.ts"
      : "this lane keeps its built-in synthesised voice";
    return `this lane is mapped to the catalogue recording "${assetId}", which no configured sample mirror serves — ${kept} until one does: configure VITE_SAMPLE_ROOT (or point the lane at an asset from list_arrangement_instruments)`;
  }
  const role = (lane.track_id ?? "").trim().toLowerCase();
  /**
   * **A drum lane gets its sentence before the melodic half gives up on it.** `SAMPLED_ROLES` does not hold a drum role,
   * so without this a kick lane whose kit the mirror does not serve would report *nothing* — and "the recording is
   * missing" and "this is a drum machine" would look identical in a render's report. The refusal explains the second
   * case, and `undefined` here is the honest answer for it.
   */
  if (SAMPLED_DRUM_ROLES.includes(role)) {
    /**
     * `drumSamplingRefusal` and not `drumSamplingDecision`: this function is the **problem** report, and a drum machine
     * is what the genre asked for rather than a defect — naming it in every render would put the same sixty lines of
     * noise over the real gaps that `SAMPLED_INSTRUMENT_SYNTHS` exists to keep out. The decision is available for a
     * caller that wants to state it (`drumSamplingDecision`), and the test asserts both forms.
     */
    const refusal = drumSamplingRefusal(lane);
    if (refusal) return refusal;
    /**
     * Reached only for an **acoustic** role — a drum machine has already returned `undefined` from
     * `sampledAssetForLane`, so it never arrives here. This is the "the kit is real and the mirror is not configured"
     * case, which is actionable and therefore reported.
     */
    if (sampledAssetForLane(lane) === undefined) return undefined;
    return `this drum lane keeps its physical model (src/audio/DrumKitModels.ts): the role "${role}" is mapped to the catalogue kit "${DRUM_KIT_ASSET_ID}" in src/audio/drumRoles.ts, and the fix is to configure the mirror that serves it (VITE_SAMPLE_ROOT), not to edit the genre`;
  }
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
