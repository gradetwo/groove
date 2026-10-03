/**
 * ⭐ **The whole-corpus `trigger=` census, pinned.**
 *
 * ## Why this file exists
 *
 * The owner's audit sampled 35 libraries and found one defect: `salamander-grand` played a hammer-release noise for MIDI 60. A **sample** cannot say whether the other
 * 34 are safe, and "only Salamander uses `trigger=release`" would have been a guess. So the census was taken over the **whole corpus this repository can read** — every
 * `.sfz`／`.txt`／`.ariax` file declared by every manifest entry carrying a `repo` and a `pin`, fetched from that address — and it is pinned here so the next library to
 * arrive using the opcode fails a test instead of sounding wrong.
 *
 * ## The method, so the numbers can be re-derived rather than trusted
 *
 * ```
 *   corpus      the manifest entries with a repo + pin; their declared .sfz／.txt／.ariax files
 *   address     https://raw.githubusercontent.com/<repo>/<pin>/<path>   (sourceSfzUrl's own address, no mirror)
 *   files read  1 666 of 1 714 — the 48 that are absent are named in TRIGGER_CENSUS_UNREADABLE
 *   counting    /(?<![\w$])trigger\s*=\s*([^\s]+)/g, lower-cased, counted per file and per entry
 * ```
 *
 * ⚠️ **Two different counts live in this file and they are not interchangeable.** `textual` counts **assignments as written** — a `trigger=release` in a `<global>`
 * counts once, however many regions inherit it, and one written in a file no program reaches still counts. `regions` counts **parsed regions**, after inheritance and
 * `#include` expansion, through this repository's own `expandRemoteIncludes` + `parseSfz` over every `.sfz` the entry declares. The work order asks for both ("总次数／各
 * 取值分布" and "每个库里 `trigger=release` 覆盖了多少 region"), so both are here and each says which it is.
 *
 * ## The reading, in one paragraph
 *
 * **2 177 assignments over 14 libraries and five values.** `first` (1 236) and `legato` (794) dominate; `release` is 99 and `release_key` 20; `attack` is written
 * explicitly 28 times, all in `vcsl`. **`last` never appears** — and it is not on <https://sfzformat.com/opcodes/trigger/>, whose table is *"attack, release, first,
 * legato"* for SFZ v1 with `release_key` added under SFZ v2, so its absence is the specification's absence rather than a gap in the crawl. `trigger=release` is written
 * by **five** libraries — `salamander-grand`, `vcsl`, `karoryfer-bear-sax`, `karoryfer-black-and-blue-basses` and `freepats-button-accordion-hn` — and `release_key` by
 * a sixth, `virtuosity-drums-basic`. Only Salamander resolved a note-on to one of them, because only there is a release region *narrower* than the note region it
 * competes with; the others' release regions lose the narrowest-range comparison. **The census is the stronger claim, and it is what makes the next one visible.**
 */
import type { SfzRegion } from "../audio/sfz/parse";

/** The five values <https://sfzformat.com/opcodes/trigger/> and sfizz's `enum class Trigger` agree on (`src/sfizz/Defaults.h:42`). */
export const TRIGGER_VALUES = ["attack", "release", "release_key", "first", "legato"] as const;
export type TriggerValue = (typeof TRIGGER_VALUES)[number];

/** A library's row: what the corpus text says, and what the parser makes of it. */
export interface TriggerCensusRow {
  /** Every `trigger=` written in the entry's declared text files, as written. Absent means zero. */
  textual: Partial<Record<TriggerValue, number>>;
  /** The declared files that carry at least one `trigger=`, sorted. */
  files: readonly string[];
  /**
   * Parsed regions by the value that ended up on them — every declared `.sfz` of the entry expanded with its `#include`s and parsed, so a value inherited from a
   * `<global>` is counted once per region that receives it.
   *
   * `sfzFiles` is how many declared `.sfz` files were actually read; a file that failed to fetch contributes nothing, so `total` is the regions of the files that
   * answered rather than of the files declared. The live criterion re-reads the same corpus, so the two cannot disagree about coverage.
   *
   * **A `total` of 0 means no region count was claimed** — either because the library's programs are 404 at the pin, or because this run's expansion produced no
   * regions. It is not a measured zero.
   */
  regions: { sfzFiles: number; total: number; byTrigger: Partial<Record<TriggerValue | "unknown", number>> };
  /** Why a library is in this table at all, in the corpus's own terms. */
  note?: string;
}

/**
 * The **47 declared files that could not be read**, so the census's coverage is stated rather than implied: **40 in `karoryfer-meatbass`** and **7 in
 * `karoryfer-emilyguitar`**, all 404 at their pinned commit — the same two libraries the audit could not measure, and for the same reason. A further `vcsl` text file
 * (`Idiophones/Struck Idiophones/Tubular Glockenspiel/Non-standard pitch (please transpose).txt`) **fetches and is empty**, so it reads as 0 assignments rather than as
 * a failure. None of the absent files is claimed below, and the live criterion re-reads the corpus so the coverage cannot quietly change.
 */
export const TRIGGER_CENSUS_UNREADABLE: Readonly<Record<string, number>> = { "karoryfer-meatbass": 40, "karoryfer-emilyguitar": 7 };

export const TRIGGER_CENSUS = {
  "salamander-grand": {
    textual: { release: 1 },
    files: ["Salamander Grand Piano V3.sfz"],
    regions: { sfzFiles: 1, total: 1121, byTrigger: { attack: 964, release: 157 } },
    note: "The defect. Its second `<global>` writes `trigger=release`, every `Data/hammer.txt` region inherits it, and those regions write `key=40` — a one-key span against the note regions' three — so the narrowest-range rule preferred the key-release noise for MIDI 60.",
  },
  vcsl: {
    textual: { attack: 28, release: 31 },
    files: [
      "Aerophones/Edge-blown Aerophones/Ocarina, Typical - Keyswitch.sfz",
      "Aerophones/Edge-blown Aerophones/Ocarina, Typical - Sus.sfz",
      "Aerophones/Edge-blown Aerophones/Ocarina, Typical - SusVib.sfz",
      "Aerophones/Free Aerophones/Harmonica-Hohner-Special20-C - Keyswitch.sfz",
      "Aerophones/Free Aerophones/Harmonica-Hohner-Special20-C - Normal.sfz",
      "Aerophones/Free Aerophones/Harmonica-Hohner-Special20-C - Soft.sfz",
      "Aerophones/Free Aerophones/Harmonica-Hohner-Special20-C - Vib.sfz",
      "Aerophones/Free Aerophones/Harmonica-Hohner-Special20-F - Accented.sfz",
      "Aerophones/Free Aerophones/Harmonica-Hohner-Special20-F - HandVib.sfz",
      "Aerophones/Free Aerophones/Harmonica-Hohner-Special20-F - Keyswitch.sfz",
      "Aerophones/Free Aerophones/Harmonica-Hohner-Special20-F - Normal.sfz",
      "Aerophones/Free Aerophones/Harmonica-Hohner-Special20-F - Vib.sfz",
      "Aerophones/Free Aerophones/Harmonica-Hohner-Super64 - Accented.sfz",
      "Aerophones/Free Aerophones/Harmonica-Hohner-Super64 - Keyswitch.sfz",
      "Aerophones/Free Aerophones/Harmonica-Hohner-Super64 - Normal.sfz",
      "Aerophones/Free Aerophones/Harmonica-Hohner-Super64 - Vib.sfz",
      "Idiophones/Friction Idiophones/Wine Glasses - Fast.sfz",
      "Idiophones/Friction Idiophones/Wine Glasses - Keyswitch.sfz",
      "Idiophones/Friction Idiophones/Wine Glasses - Slow.sfz",
      "Idiophones/Struck Idiophones/Suspended Cymbal 2.sfz",
    ],
    regions: { sfzFiles: 155, total: 4118, byTrigger: { attack: 3847, release: 271 } },
    note: "The only library that writes `attack` explicitly (28 times) — the format's own default written out. Its 271 release regions are a harmonica's breath release, an ocarina's key noise, wine-glass and cymbal releases; they lose the narrowest-range comparison to a note region in all six exposed programs that carry them (`Harmonica-Hohner-Special20-C/F/Super64 - Keyswitch`, `Ocarina, Typical - Keyswitch`, `Wine Glasses - Keyswitch`, `Suspended Cymbal 2`), which the change's 322-asset note-on impact run measured as zero changed answers.",
  },
  "karoryfer-bear-sax": {
    textual: { first: 847, legato: 471, release: 62 },
    files: [
      "Programs/bearborg/medium_center_mono.sfz",
      "Programs/bearborg/medium_sides_mono.sfz",
      "Programs/bearborg/single_cycle_center_mono.sfz",
      "Programs/bearborg/single_cycle_sides_mono.sfz",
      "Programs/bearborg/soft_center_mono.sfz",
      "Programs/bearborg/soft_sides_mono.sfz",
      "Programs/duo_legato/dynfade_legato_first_map.sfz",
      "Programs/duo_legato/dynfade_legato_second_map.sfz",
      "Programs/duo_legato/dynfade_marcato_long_map.sfz",
      "Programs/duo_legato/dynfade_marcato_second_map.sfz",
      "Programs/duo_legato/marcato_short_map.sfz",
      "Programs/legato/dynfade_legato_first_map.sfz",
      "Programs/legato/dynfade_legato_second_map.sfz",
      "Programs/legato/dynfade_marcato_long_map.sfz",
      "Programs/legato/dynfade_marcato_second_map.sfz",
      "Programs/legato/marcato_short_map.sfz",
      "Programs/legato/noises_map.sfz",
      "Programs/poly/noises_map.sfz",
    ],
    regions: { sfzFiles: 48, total: 8951, byTrigger: { attack: 5643, first: 2223, legato: 837, release: 248 } },
    note: "The largest `first`/`legato` pair outside bigcat-cello, plus 248 release regions — the sax's key and breath noises. Its four **exposed** programs (`Programs/1-solo-mono.sfz`, `2-solo-poly`, `5-bearcussion`, `6-bearborg`) write no `trigger` at all.",
  },
  "karoryfer-bigcat-cello": {
    textual: { first: 202, legato: 129 },
    files: [
      "Programs/vc_arco_eight_legato_first_map_mw.sfz",
      "Programs/vc_arco_eight_legato_first_map.sfz",
      "Programs/vc_arco_eight_legato_map_mw.sfz",
      "Programs/vc_arco_eight_legato_map.sfz",
      "Programs/vc_arco_four_legato_first_map_mw.sfz",
      "Programs/vc_arco_four_legato_first_map.sfz",
      "Programs/vc_arco_four_legato_map_mw.sfz",
      "Programs/vc_arco_four_legato_map.sfz",
      "Programs/vc_arco_marcato_mono_map.sfz",
      "Programs/vc_arco_sus_legato_first_map_mw.sfz",
      "Programs/vc_arco_sus_legato_first_map.sfz",
      "Programs/vc_arco_sus_legato_for_marcato_mono_first_map_mw.sfz",
      "Programs/vc_arco_sus_legato_for_marcato_mono_first_map.sfz",
      "Programs/vc_arco_sus_legato_for_marcato_mono_map_mw.sfz",
      "Programs/vc_arco_sus_legato_for_marcato_mono_map.sfz",
      "Programs/vc_arco_sus_legato_map_mw.sfz",
      "Programs/vc_arco_sus_legato_map.sfz",
      "Programs/vc_pizz_legato_basic.sfz",
      "Programs/vc_pizz_legato_eight.sfz",
      "Programs/vc_pizz_legato_first_basic.sfz",
      "Programs/vc_pizz_legato_first_eight.sfz",
      "Programs/vc_pizz_legato_first_four.sfz",
      "Programs/vc_pizz_legato_four.sfz",
    ],
    regions: { sfzFiles: 39, total: 4087, byTrigger: { attack: 1649, first: 1354, legato: 1084 } },
    note: "`first`/`legato` in pairs, which is the sampled-legato pattern: the `..._map.sfz` plays when a note is already sounding and the `..._first_map.sfz` when none is. Its three **exposed** programs (`01- Bowed (velocity layer)`, `02- Bowed (mod wheel)`, `03- Plucked`) write no `trigger` at all, so 1 084 legato regions here are unreachable from anything the manifest exposes.",
  },
  "karoryfer-272-merry-orks": {
    textual: { first: 156, legato: 156 },
    files: ["ork_vocals.sfz"],
    regions: { sfzFiles: 3, total: 592, byTrigger: { attack: 280, first: 156, legato: 156 } },
    note: "`ork_vocals.sfz` is an **exposed** program and carries the pairs; its two siblings `ork_dialogue.sfz` and `ork_predrops.sfz` carry none.",
  },
  "discord-gm-sitar": {
    textual: { first: 2, legato: 4 },
    files: ["Discord GM/Melodic/105-Sitar/Sitar.sfz", "Discord GM/Melodic/105-Sitar.sfz"],
    regions: { sfzFiles: 3, total: 175, byTrigger: { attack: 19, first: 52, legato: 104 } },
    note: "Both declared programs are `first`/`legato` programs; their `attack` regions are written without the opcode, so the `first` block is what a note-on reaches on this path, where before the `legato` block could answer instead.",
  },
  "aliexpress-erhu": {
    textual: { first: 12, legato: 12 },
    files: ["Programs/01-erhu_keyswitch.sfz", "Programs/02-erhu_long.sfz", "Programs/05-erhu_sul_tasto.sfz"],
    regions: { sfzFiles: 4, total: 0, byTrigger: {} },
    note: "Two of the four declared programs (`02-erhu_long`, `05-erhu_sul_tasto`) carry the pairs; `01-erhu_keyswitch.sfz` writes them and is not a declared program, and `03-erhu_short`/`04-erhu_marcato` write none. No region count is claimed — this run's expansion produced none.",
  },
  "sonatina-brass": {
    textual: { first: 9, legato: 9 },
    files: [
      "Sonatina Symphonic Orchestra/Brass - Notation/Bass Trombone Solo Legato.sfz",
      "Sonatina Symphonic Orchestra/Brass - Notation/Horn Solo Legato.sfz",
      "Sonatina Symphonic Orchestra/Brass - Notation/Horns Legato.sfz",
      "Sonatina Symphonic Orchestra/Brass - Notation/Tenor Trombone Solo Legato.sfz",
      "Sonatina Symphonic Orchestra/Brass - Notation/Trombones Legato.sfz",
      "Sonatina Symphonic Orchestra/Brass - Notation/Trumpet Solo Legato.sfz",
      "Sonatina Symphonic Orchestra/Brass - Notation/Trumpets Legato.sfz",
      "Sonatina Symphonic Orchestra/Brass - Notation/Tuba Legato.sfz",
    ],
    regions: { sfzFiles: 48, total: 0, byTrigger: {} },
    note: "Eight `... Legato.sfz` programs carry a `trigger=first` block and a `trigger=legato` block. The one **exposed** program, `All Brass Sustain.sfz`, writes neither.",
  },
  "karoryfer-squidpipes": {
    textual: { first: 8, legato: 4 },
    files: ["Programs/01-squidpipes.sfz"],
    regions: { sfzFiles: 3, total: 0, byTrigger: {} },
    note: "`01-squidpipes.sfz` is a declared program and carries the pairs; `02-squidotron`/`03-squynth` write none. No region count is claimed — this run's expansion produced none.",
  },
  "mtg-solo-sax": {
    textual: { legato: 8 },
    files: [
      "MTG Solo Saxophones/MTG Alto Sax (NL).sfz",
      "MTG Solo Saxophones/MTG Alto Sax.sfz",
      "MTG Solo Saxophones/MTG Baritone Sax (NL).sfz",
      "MTG Solo Saxophones/MTG Baritone Sax.sfz",
      "MTG Solo Saxophones/MTG Soprano Sax (NL).sfz",
      "MTG Solo Saxophones/MTG Soprano Sax.sfz",
      "MTG Solo Saxophones/MTG Tenor Sax (NL).sfz",
      "MTG Solo Saxophones/MTG Tenor Sax.sfz",
    ],
    regions: { sfzFiles: 8, total: 0, byTrigger: {} },
    note: "`legato` only, one per program, and **all eight declared programs carry it** — so on this path none of them answers a note-on now, where before every one did. No program of this library is exposed in `src/data/sampledInstruments.ts`; `docs/SAMPLE_LIBRARY_INTEGRATION.md` records the CC-modulated legato this loader does not implement.",
  },
  "ixox-flute": {
    textual: { legato: 1 },
    files: ["Data/setting/legato.txt"],
    regions: { sfzFiles: 1, total: 3113, byTrigger: { attack: 1573, legato: 1540 } },
    note: "The one `legato` sits in a file the program includes, and it lands on 1 540 of the 3 113 parsed regions — the largest single-value share in the corpus. Those regions no longer answer a note-on, which is the format's reading (*\"only if there's a note going on\"*) meeting this project's unimplemented note-off.",
  },
  "karoryfer-black-and-blue-basses": {
    textual: { release: 4 },
    files: [
      "Programs/01-darkblack_keysw.sfz",
      "Programs/02-darkblack_keysw_warm.sfz",
      "Programs/05-darkblack_pluck.sfz",
      "Programs/06-darkblack_pluck_warm.sfz",
    ],
    regions: { sfzFiles: 11, total: 0, byTrigger: {} },
    note: "One `trigger=release` per program — the bass's string/finger noise — and all four are **declared programs**. The audit named this library as one to prove unchanged, and it is: its note-on answers do not move, because the release region never wins the narrowest-range comparison.",
  },
  "freepats-button-accordion-hn": {
    textual: { release: 1 },
    files: ["PRESET Button Accordion HN tuned.sfz"],
    regions: { sfzFiles: 1, total: 34, byTrigger: { attack: 17, release: 17 } },
    note: "One `trigger=release` in a `<group>`, and it lands on **all 17** regions of the file's second half — the accordion's button/key noise. Its note-on answers do not move; the release regions lose to the note ones.",
  },
  "virtuosity-drums-basic": {
    textual: { release_key: 20 },
    files: [
      "Programs/mappings/kickmic_all.sfz",
      "Programs/mappings/lofi_all.sfz",
      "Programs/mappings/lofi_epic_all.sfz",
      "Programs/mappings/mid_all.sfz",
      "Programs/mappings/mid_epic_all.sfz",
      "Programs/mappings/oh_all.sfz",
      "Programs/mappings/oh_epic_all.sfz",
      "Programs/mappings/room_all.sfz",
      "Programs/mappings/room_epic_all.sfz",
      "Programs/mappings/snaremic_all.sfz",
    ],
    regions: { sfzFiles: 0, total: 0, byTrigger: {} },
    note: "The only library writing `release_key` — SFZ v2's *\"Region will play on note-off. Ignores sustain pedal.\"* — twice per microphone mapping. No note-on answer moves.",
  },
  /** The two libraries whose pinned source is 404: named so the guard knows they were looked at rather than forgotten. */
  "karoryfer-meatbass": {
    textual: {},
    files: [],
    regions: { sfzFiles: 0, total: 0, byTrigger: {} },
    note: "39 declared `.sfz` and 1 readme are 404 at the pinned commit `ac9e8595…` — the audit could not measure this library either. **No `trigger=` claim is made about it.**",
  },
  "karoryfer-emilyguitar": {
    textual: {},
    files: [],
    regions: { sfzFiles: 0, total: 0, byTrigger: {} },
    note: "6 declared `.sfz` and 1 readme are 404 at the pinned commit `b4920dc6…`, the same situation as meatbass. **No `trigger=` claim is made about it.**",
  },
} as const satisfies Record<string, TriggerCensusRow>;

/**
 * The same table under its **row interface** rather than its literal type.
 *
 * `as const satisfies` keeps every number a literal, which is what makes a typo in a count a compile error — and it also means `census[id].textual.release` cannot be
 * indexed by a computed key, because the literal type of one row has no `release` property. Consumers that walk the table by key want this view; consumers that want the
 * literals keep the const one. Both point at the same object, so they cannot drift.
 */
export const TRIGGER_CENSUS_ROWS: Readonly<Record<string, TriggerCensusRow>> = TRIGGER_CENSUS;

/** What the parser says a region's trigger is, so a caller can compare a parse against the pinned census without importing the union by hand. */
export const triggerOfRegion = (region: SfzRegion): TriggerValue | "unknown" => region.trigger ?? "attack";
