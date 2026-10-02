/**
 * ⭐ **What the pinned string library can actually play, and which program plays it.**
 *
 * The owner asked for two things in one breath: *"弦乐类乐器是要特别注意"* and *"弦乐的各种演奏技巧还是很重要的"*
 * — strings need special care, and their playing techniques matter. This file is the inventory half of the
 * answer: **every articulation the pinned library holds, named by the program that plays it, with its
 * measured coverage, its velocity layers and its sample length.**
 *
 * ## Measured, not read off the file names
 *
 * Every number and every program name below was taken from the pinned upstream tree
 * (`schollz/VSCO-2-CE@6dd651d55dde97fd4028699be9d4481f26917891`, `SFZ` branch) by parsing the program with this
 * repository's own `parseSfz`, resolving each `sample=` through the region's own `default_path`, and reading the
 * WAV headers. The method and its full output are recorded in `docs/STRING_TECHNIQUES.md`.
 *
 * **A name is not a technique.** `*Spic` and `*Stac` are different files but both mean "short"; `*SusNV` and
 * `*SusVib` are the same technique at two vibrato settings; `-KS` files are not a technique at all but several
 * folded into one file behind key switches. Each row here therefore carries what the *player* does, and the
 * `technique` field is the thing callers are allowed to choose by.
 *
 * ## The two facts that constrain everything
 *
 * **1 — The sustained strings are one-shot recordings and cannot be held forever.** Measured: none of the pinned
 * tree's 75 programs declares a `loop` opcode, and none of its mirrored `.wav` files carries a `smpl` chunk. So a
 * sustained note stops when its recording stops — the longest `ViolinEnsSusVib` sample is **15.200 s** and the
 * shortest is **8.988 s**. That is the "弦乐长音会停" limit, and it is a property of the material rather than of
 * any player. `maxSampleSeconds` below carries it so a caller can be told *before* writing a 40-second pad.
 *
 * **2 — The mirror now holds every string technique the pinned library has a program for.** The 2026-10-02 round
 * added the four section tremolos, the four section spiccatos, the four section `-Quiet` takes and the whole
 * solo-violin family, and its Part 2 added the library's only `non-vibrato` program (the contrabass's
 * `ContrabassSusNV`), so **all 26 rows below are mirrored**. Of the eight technique words this file names, only
 * `col-legno` and `harmonics` have **no program upstream at all** — those two are the whole of the gap now, and
 * `non-vibrato` is a real row on the one instrument that has it. The library's `-KS` keyswitch programs stay out on
 * purpose: they fold several articulations into one file behind `sw_*` opcodes this loader does not implement, so
 * including one would answer a request for a technique with whichever regions matched instead of with the
 * articulation asked for. The `mirrored` flag is kept in the data rather than hidden, because "this technique exists
 * in the library but its bytes are not in the mirror" is a different statement from "this library cannot play it".
 *
 * ## The shape of the table: one row per (instrument, technique)
 *
 * A row is deliberately **not** keyed by program name. The same technique is a different program on every
 * instrument (`ViolinEnsSusVib`, `ViolaEnsSusVib`, `CelloEnsSusVib`, `ContrabassSusVB` — note the contrabass
 * spells it differently), and a caller that resolves by name will eventually write the wrong one. The asset id
 * is what the catalogue actually accepts, so the asset id is what a row carries.
 */
import type { NoteEvent } from "../types/arrangementV2";

/**
 * The playing techniques **bowed and plucked strings** have, in the words a player uses.
 *
 * `sustain` is the bowed, vibrating long tone; `quiet` is the same program's soft take at a lower dynamic, and
 * `non-vibrato` is the bow without the vibrato. `pizzicato` is plucked, `spiccato` is the short bouncing bow,
 * `tremolo` is the rapid repeated bow. `col-legno` and `harmonics` are named here **although the pinned library has
 * neither** — an absent technique is worth having a word for, so a request for it can be refused by name instead of
 * falling through to a sustain and sounding merely wrong.
 */
export type StringTechnique =
  | "sustain"
  | "non-vibrato"
  | "quiet"
  | "pizzicato"
  | "spiccato"
  | "tremolo"
  | "col-legno"
  | "harmonics";

/** The string instruments the pinned library covers. `solo-violin` is a distinct instrument upstream, not a section part. */
export type StringInstrument = "violin" | "viola" | "cello" | "contrabass" | "solo-violin";

/** Everything about one program: what it plays, on what, over which notes, at which dynamics, for how long. */
export interface StringTechniqueProgram {
  instrument: StringInstrument;
  technique: StringTechnique;
  /** The catalogue id the sampler lane accepts, exactly as `list_arrangement_instruments` reports it. */
  assetId: string;
  /** The upstream program file, so a claim here can be checked against the pinned tree. */
  program: string;
  /** A person's name for it, in the same voice the manifest uses. */
  name: string;
  /**
   * Whether the mirror holds **every** sample this program's regions resolve to.
   *
   * `false` does not mean "the technique does not exist" — it means the bytes are not shipped, so choosing this row
   * today produces nothing. That is the honest form of a gap, and the test beside this file asserts the two agree.
   */
  mirrored: boolean;
  /** The lowest and highest MIDI note any region of the program covers, measured across its regions. */
  lowestNote: number;
  highestNote: number;
  /**
   * The `lovel`/`hivel` pairs the program's regions declare, as `[low, high]`, ascending and de-duplicated.
   *
   * This is the whole of the dynamic resolution the material offers: a velocity **selects** a layer rather than
   * scaling one, which is why `velocityPlan` below exists.
   */
  velocityLayers: ReadonlyArray<readonly [number, number]>;
  /**
   * ⭐ **How long a note can sound before the recording runs out** — the *longest* sample of the program.
   *
   * A note shorter than this always has material. A note longer than this does not, because the samples do not
   * loop; `resolveLengthConstraint` is where that becomes advice.
   */
  maxSampleSeconds: number;
  /**
   * The length at or below which **every** sample of the program suffices — its *shortest* sample.
   *
   * Being under `maxSampleSeconds` is not the same as being safe: which sample answers a note depends on pitch, and
   * the shortest one belongs to some pitch. A note between `safeSeconds` and `maxSampleSeconds` sounds only if the
   * sample for *its* pitch happens to be long enough, which is a risk worth naming rather than rounding away.
   */
  safeSeconds: number;
  /** `seq_length` from the program: 1 means no round robin, 2 means a repeated note alternates samples. */
  roundRobin: number;
  /** A short reason this row exists, kept beside the data the way `CHORD_ARTICULATIONS` keeps its notes. */
  note: string;
}

/**
 * ⭐ **The table.**
 *
 * Twenty-six rows: five instruments, and the techniques each one actually has a program for. Read it as the answer
 * to "can we play a tremolo cello, and what do we call it" — `CelloEnsTrem`, `mirrored: true` since the
 * 2026-10-02 round, with the measured 11.183 s longest / 6.605 s shortest samples in its own row.
 *
 * The `maxSampleSeconds` and `safeSeconds` values are the measured longest and shortest samples of each program
 * (a program's samples are spread across pitch, which is why the two differ by several seconds). They are
 * carried per row rather than derived from the manifest's single `durationSeconds`, because that field is the
 * longest sample across the *whole library* — 42.175 s, a bowed cymbal, after the Part 2 round added the
 * percussion and organ programs — and using it here would promise a violin forty seconds it does not have.
 */
export const STRING_TECHNIQUES: readonly StringTechniqueProgram[] = [
  /* ---------------------------------------------------------------- violin -- */
  {
    instrument: "violin",
    technique: "sustain",
    assetId: "vsco2ce:ViolinEnsSusVib",
    program: "ViolinEnsSusVib.sfz",
    name: "Violin Section, sustained",
    mirrored: true,
    lowestNote: 55,
    highestNote: 86,
    velocityLayers: [
      [0, 62],
      [63, 127],
    ],
    maxSampleSeconds: 15.2,
    safeSeconds: 8.988,
    roundRobin: 1,
    note: "The section bed. Vibrato is recorded in, so it is the warm default for held harmony; 22 samples, two dynamic layers, no round robin.",
  },
  {
    instrument: "violin",
    technique: "quiet",
    assetId: "vsco2ce:ViolinEnsSusVib-Quiet",
    program: "ViolinEnsSusVib-Quiet.sfz",
    name: "Violin Section, sustained (quiet)",
    mirrored: true,
    lowestNote: 55,
    highestNote: 86,
    velocityLayers: [[0, 127]],
    maxSampleSeconds: 13.275,
    safeSeconds: 8.988,
    roundRobin: 1,
    note: "The soft take of the violin section's sustained program, and **not a separate recording**: all 11 of its regions name the `_v1` samples the main program already uses for its 0–62 layer, remapped across 0–127. So the 2026-10-02 round cost no new bytes for it — the samples were uploaded with the main program — and it is one single layer, for a whole part that must sit soft rather than for shaping one note.",
  },
  {
    instrument: "violin",
    technique: "pizzicato",
    assetId: "vsco2ce:ViolinEnsPizz",
    program: "ViolinEnsPizz.sfz",
    name: "Violin Section, pizzicato",
    mirrored: true,
    lowestNote: 55,
    highestNote: 86,
    velocityLayers: [
      [0, 62],
      [63, 127],
    ],
    maxSampleSeconds: 3.016,
    safeSeconds: 0.44,
    roundRobin: 1,
    note: "Plucked: a short attack and a natural decay of 0.44–3.02 s, so the note's own length past ~3 s buys nothing but the tail. Two layers.",
  },
  {
    instrument: "violin",
    technique: "spiccato",
    assetId: "vsco2ce:ViolinEnsSpic",
    program: "ViolinEnsSpic.sfz",
    name: "Violin Section, spiccato",
    mirrored: true,
    lowestNote: 55,
    highestNote: 86,
    velocityLayers: [
      [0, 62],
      [63, 127],
    ],
    maxSampleSeconds: 3.208,
    safeSeconds: 0.497,
    roundRobin: 2,
    note: "The bouncing short bow, 44 samples with a round robin of 2 so a repeated note alternates takes. Longest 3.208 s and shortest 0.497 s — a spiccato is for short notes, which is why `short-repeating` preferred pizzicato until these bytes were mirrored and now reaches its first choice.",
  },
  {
    instrument: "violin",
    technique: "tremolo",
    assetId: "vsco2ce:ViolinEnsTrem",
    program: "ViolinEnsTrem.sfz",
    name: "Violin Section, tremolo",
    mirrored: true,
    lowestNote: 55,
    highestNote: 86,
    velocityLayers: [
      [0, 62],
      [0, 127],
      [63, 127],
    ],
    maxSampleSeconds: 13.13,
    safeSeconds: 7.565,
    roundRobin: 1,
    note: "Rapid repeated bowing, recorded as a continuous texture — the one gesture that says tension rather than warmth. Mirrored in the 2026-10-02 round: 21 samples, three velocity ranges (soft 0–62, loud 63–127, and one top-of-range F#3 region written 0–127 because upstream has no take pair for it), longest sample 13.130 s and shortest 7.565 s. `tension-tremolo` therefore now reaches its first choice.",
  },

  /* ----------------------------------------------------------------- viola -- */
  {
    instrument: "viola",
    technique: "sustain",
    assetId: "vsco2ce:ViolaEnsSusVib",
    program: "ViolaEnsSusVib.sfz",
    name: "Viola Section, sustained",
    mirrored: true,
    lowestNote: 48,
    highestNote: 86,
    velocityLayers: [
      [0, 62],
      [63, 127],
    ],
    maxSampleSeconds: 13.746,
    safeSeconds: 7.565,
    roundRobin: 1,
    note: "The viola's held tone, 26 samples across two layers.",
  },
  {
    instrument: "viola",
    technique: "quiet",
    assetId: "vsco2ce:ViolaEnsSusVib-Quiet",
    program: "ViolaEnsSusVib-Quiet.sfz",
    name: "Viola Section, sustained (quiet)",
    mirrored: true,
    lowestNote: 48,
    highestNote: 86,
    velocityLayers: [[0, 127]],
    maxSampleSeconds: 10.814,
    safeSeconds: 7.565,
    roundRobin: 1,
    note: "The soft take of the viola section's sustained program: the same 13 `_v1` samples as the main program's soft layer, remapped across 0–127, so no new bytes and one layer. Longest sample 10.814 s.",
  },
  {
    instrument: "viola",
    technique: "pizzicato",
    assetId: "vsco2ce:ViolaEnsPizz",
    program: "ViolaEnsPizz.sfz",
    name: "Viola Section, pizzicato",
    mirrored: true,
    lowestNote: 48,
    highestNote: 86,
    velocityLayers: [
      [0, 62],
      [0, 127],
      [63, 127],
    ],
    maxSampleSeconds: 3.366,
    safeSeconds: 0.282,
    roundRobin: 1,
    note: "The shortest of the pizzicati: 0.282 s at the top, so a viola pizz line is for short notes only.",
  },
  {
    instrument: "viola",
    technique: "spiccato",
    assetId: "vsco2ce:ViolaEnsSpic",
    program: "ViolaEnsSpic.sfz",
    name: "Viola Section, spiccato",
    mirrored: true,
    lowestNote: 48,
    highestNote: 86,
    velocityLayers: [
      [0, 62],
      [63, 127],
    ],
    maxSampleSeconds: 3.102,
    safeSeconds: 0.56,
    roundRobin: 2,
    note: "Viola section spiccato, 48 samples, round robin of 2. Longest sample 3.102 s. Mirrored in the 2026-10-02 round.",
  },
  {
    instrument: "viola",
    technique: "tremolo",
    assetId: "vsco2ce:ViolaEnsTrem",
    program: "ViolaEnsTrem.sfz",
    name: "Viola Section, tremolo",
    mirrored: true,
    lowestNote: 48,
    highestNote: 86,
    velocityLayers: [
      [0, 62],
      [63, 127],
    ],
    maxSampleSeconds: 15.572,
    safeSeconds: 7.371,
    roundRobin: 1,
    note: "The viola section's rapid repeated bow, 24 samples in two layers. Longest sample 15.572 s — the longest tremolo in the library — and shortest 7.371 s. Mirrored in the 2026-10-02 round.",
  },

  /* ----------------------------------------------------------------- cello -- */
  {
    instrument: "cello",
    technique: "sustain",
    assetId: "vsco2ce:CelloEnsSusVib",
    program: "CelloEnsSusVib.sfz",
    name: "Cello Section, sustained",
    mirrored: true,
    lowestNote: 36,
    highestNote: 77,
    velocityLayers: [
      [0, 41],
      [0, 62],
      [42, 62],
      [63, 127],
    ],
    maxSampleSeconds: 12.747,
    safeSeconds: 6.387,
    roundRobin: 1,
    note: "Four layer ranges here, the only string program in the mirror with a split inside its soft half (0–41 and 42–62 both resolve).",
  },
  {
    instrument: "cello",
    technique: "quiet",
    assetId: "vsco2ce:CelloEnsSusVib-Quiet",
    program: "CelloEnsSusVib-Quiet.sfz",
    name: "Cello Section, sustained (quiet)",
    mirrored: true,
    lowestNote: 36,
    highestNote: 77,
    velocityLayers: [
      [0, 41],
      [0, 127],
      [42, 127],
    ],
    maxSampleSeconds: 9.641,
    safeSeconds: 6.387,
    roundRobin: 1,
    note: "The soft take of the cello section's sustained program: 14 of the main program's `_v1` samples across 0–127, no new bytes, one layer plus the file's own 0–41 / 42–127 split. Longest 9.641 s.",
  },
  {
    instrument: "cello",
    technique: "pizzicato",
    assetId: "vsco2ce:CelloEnsPizz",
    program: "CelloEnsPizz.sfz",
    name: "Cello Section, pizzicato",
    mirrored: true,
    lowestNote: 36,
    highestNote: 77,
    velocityLayers: [
      [0, 62],
      [63, 127],
    ],
    maxSampleSeconds: 3.999,
    safeSeconds: 0.873,
    roundRobin: 2,
    note: "The one pizzicato with a round robin of 2, and the longest samples of the four (up to 3.999 s) — a plucked cello rings longer than a plucked violin.",
  },
  {
    instrument: "cello",
    technique: "spiccato",
    assetId: "vsco2ce:CelloEnsSpic",
    program: "CelloEnsSpic.sfz",
    name: "Cello Section, spiccato",
    mirrored: true,
    lowestNote: 36,
    highestNote: 77,
    velocityLayers: [
      [0, 62],
      [63, 127],
    ],
    maxSampleSeconds: 3.502,
    safeSeconds: 0.773,
    roundRobin: 2,
    note: "Cello section spiccato, 52 samples, round robin of 2. Its 3.502 s longest sample is the longest of the five spiccati, which is what a low short bow needs.",
  },
  {
    instrument: "cello",
    technique: "tremolo",
    assetId: "vsco2ce:CelloEnsTrem",
    program: "CelloEnsTrem.sfz",
    name: "Cello Section, tremolo",
    mirrored: true,
    lowestNote: 36,
    highestNote: 77,
    velocityLayers: [
      [0, 62],
      [0, 127],
      [63, 127],
    ],
    maxSampleSeconds: 11.183,
    safeSeconds: 6.605,
    roundRobin: 1,
    note: "The cello section's rapid repeated bow, 25 samples. Its longest sample, 11.183 s, is shorter than the same section's sustained 12.747 s, so a tremolo note runs out sooner than a bowed one of the same length.",
  },

  /* ------------------------------------------------------------ contrabass -- */
  {
    instrument: "contrabass",
    technique: "sustain",
    // ⭐ The contrabass is the one instrument whose program is *not* named like the others: it is `SusVB`
    // (vibrato, bowed) rather than `SusVib`, and its directory is capitalised differently from the others'.
    // A caller resolving by a name pattern would miss it, which is why rows carry asset ids.
    assetId: "vsco2ce:ContrabassSusVB",
    program: "ContrabassSusVB.sfz",
    name: "Solo Contrabass, sustained",
    mirrored: true,
    lowestNote: 24,
    highestNote: 60,
    velocityLayers: [
      [0, 62],
      [63, 127],
    ],
    maxSampleSeconds: 17.332,
    safeSeconds: 6.539,
    roundRobin: 1,
    note: "Solo, not a section — upstream has no contrabass section. Its longest sample, 17.332 s, is the longest sustained string sample in the mirror.",
  },
  {
    instrument: "contrabass",
    technique: "quiet",
    assetId: "vsco2ce:ContrabassSusVB-Quiet",
    program: "ContrabassSusVB-Quiet.sfz",
    name: "Solo Contrabass, sustained (quiet)",
    mirrored: true,
    lowestNote: 24,
    highestNote: 60,
    velocityLayers: [[0, 127]],
    maxSampleSeconds: 17.332,
    safeSeconds: 6.539,
    roundRobin: 1,
    note: "The soft take of the solo contrabass's sustained program: the same 13 `_v1` samples remapped across 0–127, so no new bytes and one layer. Its longest sample, 17.332 s, is the same recording that makes the main program the longest sustained string in the mirror.",
  },
  {
    instrument: "contrabass",
    technique: "non-vibrato",
    assetId: "vsco2ce:ContrabassSusNV",
    program: "ContrabassSusNV.sfz",
    name: "Solo Contrabass, sustained (non-vibrato)",
    mirrored: true,
    lowestNote: 24,
    highestNote: 60,
    velocityLayers: [
      [0, 62],
      [63, 127],
    ],
    maxSampleSeconds: 18.195,
    safeSeconds: 6.591,
    roundRobin: 1,
    note: "The library's **only** `non-vibrato` program, and its longest sample, 18.195 s, is the longest sustained string sample in the whole mirror — half a second longer than the vibrato contrabass's 17.332 s. Two layers over the same 24–60 compass; 28 samples. Mirrored in the 2026-10-02 Part 2 round. ⚠️ No other instrument upstream has a `SusNV`: the violin, viola and cello sections have none, so `non-vibrato` is a **contrabass-only** row, and even here the `sustained-bed` rule reaches `sustain` and `quiet` first over the same compass — this row is reachable by name (and by {@link programForIdentity}) rather than by falling through to it.",
  },
  {
    instrument: "contrabass",
    technique: "pizzicato",
    assetId: "vsco2ce:ContrabassPizz",
    program: "ContrabassPizz.sfz",
    name: "Solo Contrabass, pizzicato",
    mirrored: true,
    lowestNote: 24,
    highestNote: 60,
    velocityLayers: [
      [0, 62],
      [0, 127],
      [63, 127],
    ],
    maxSampleSeconds: 6.024,
    safeSeconds: 0.961,
    roundRobin: 1,
    note: "The walking-bass pizzicato, and the pizzicato that rings longest (6.024 s), which is what makes a low pizz line read as a bass line rather than a series of clicks.",
  },
  {
    instrument: "contrabass",
    technique: "spiccato",
    assetId: "vsco2ce:ContrabassSpic",
    program: "ContrabassSpic.sfz",
    name: "Solo Contrabass, spiccato",
    mirrored: true,
    lowestNote: 24,
    highestNote: 60,
    velocityLayers: [
      [0, 62],
      [0, 127],
      [63, 127],
    ],
    maxSampleSeconds: 3.283,
    safeSeconds: 1.103,
    roundRobin: 1,
    note: "Solo contrabass spiccato, 42 samples. ⚠️ The two takes are named `_rr1`/`_rr2` in the file names but the program declares **no** `seq_length`/`seq_position`, so `roundRobin` is 1 and the loader always answers with the first take: the round robin is in the file names rather than in the opcodes, and only one of the two is reachable. Shortest sample 1.103 s, the most material under a short note of the five.",
  },
  {
    instrument: "contrabass",
    technique: "tremolo",
    assetId: "vsco2ce:ContrabassTrem",
    program: "ContrabassTrem.sfz",
    name: "Solo Contrabass, tremolo",
    mirrored: true,
    lowestNote: 24,
    highestNote: 60,
    velocityLayers: [
      [0, 62],
      [63, 127],
    ],
    maxSampleSeconds: 10.639,
    safeSeconds: 6.11,
    roundRobin: 1,
    note: "Solo contrabass tremolo — upstream has no contrabass section, so this is one player, like the pizzicato and sustained programs beside it. 16 samples in two layers; longest 10.639 s.",
  },

  /* ------------------------------------------------------------ solo violin -- */
  {
    instrument: "solo-violin",
    technique: "sustain",
    assetId: "vsco2ce:SViolinVib",
    program: "SViolinVib.sfz",
    name: "Solo Violin, sustained",
    mirrored: true,
    lowestNote: 55,
    highestNote: 96,
    velocityLayers: [
      [0, 62],
      [63, 127],
    ],
    maxSampleSeconds: 17.554,
    safeSeconds: 11.263,
    roundRobin: 1,
    note: "A **solo violin**, a different instrument from the section: its own 55–96 compass, 30 samples in two layers, and the longest sustained string sample in the mirror at 17.554 s (the shortest is 11.263 s). Before this row nothing in the shipped catalogue played a solo violin.",
  },
  {
    instrument: "solo-violin",
    technique: "quiet",
    assetId: "vsco2ce:SViolinVib-Quiet",
    program: "SViolinVib-Quiet.sfz",
    name: "Solo Violin, sustained (quiet)",
    mirrored: true,
    lowestNote: 55,
    highestNote: 96,
    velocityLayers: [[0, 127]],
    maxSampleSeconds: 17.554,
    safeSeconds: 12.895,
    roundRobin: 1,
    note: "The soft take of the solo violin's sustained program: 15 of the same 30 samples — the `_p` (piano) half — remapped across 0–127, so it shares the 17.554 s longest sample but its shortest is 12.895 s rather than 11.263 s. One layer.",
  },
  {
    instrument: "solo-violin",
    technique: "pizzicato",
    assetId: "vsco2ce:SViolinPizz",
    program: "SViolinPizz.sfz",
    name: "Solo Violin, pizzicato",
    mirrored: true,
    lowestNote: 55,
    highestNote: 96,
    velocityLayers: [
      [0, 62],
      [0, 127],
      [63, 127],
    ],
    maxSampleSeconds: 4.839,
    safeSeconds: 0.751,
    roundRobin: 1,
    note: "Solo violin pizzicato, 44 samples. ⚠️ Like the contrabass spiccato, its two takes are named `_RR1`/`_RR2` while the program declares no `seq_length`, so `roundRobin` is 1 and only the first take is reachable. Longest 4.839 s — a plucked solo violin rings longer than the section's 3.016 s.",
  },
  {
    instrument: "solo-violin",
    technique: "spiccato",
    assetId: "vsco2ce:SViolinSpic",
    program: "SViolinSpic.sfz",
    name: "Solo Violin, spiccato",
    mirrored: true,
    lowestNote: 55,
    highestNote: 96,
    velocityLayers: [
      [0, 62],
      [63, 127],
    ],
    maxSampleSeconds: 2.221,
    safeSeconds: 0.81,
    roundRobin: 2,
    note: "Solo violin spiccato, 60 samples with a round robin of 2. Longest 2.221 s and shortest 0.810 s — the shortest-bowed of the spiccati, so it is the one to reach for on the fastest figures.",
  },
  {
    instrument: "solo-violin",
    technique: "tremolo",
    assetId: "vsco2ce:SViolinTrem",
    program: "SViolinTrem.sfz",
    name: "Solo Violin, tremolo",
    mirrored: true,
    lowestNote: 55,
    highestNote: 96,
    velocityLayers: [
      [0, 62],
      [0, 127],
      [63, 127],
    ],
    maxSampleSeconds: 9.447,
    safeSeconds: 5.606,
    roundRobin: 1,
    note: "The solo violin's rapid repeated bow, 27 samples over the same 55–96 compass as its sustained program. Longest sample 9.447 s, shortest 5.606 s.",
  },
];

/** Every technique a given instrument has a row for, whether or not its bytes are mirrored. */
export function techniquesFor(instrument: StringInstrument): StringTechniqueProgram[] {
  return STRING_TECHNIQUES.filter((program) => program.instrument === instrument);
}

/** The row for one instrument and technique, or `undefined` when the library has no such program at all. */
export function programFor(instrument: StringInstrument, technique: StringTechnique): StringTechniqueProgram | undefined {
  return STRING_TECHNIQUES.find((program) => program.instrument === instrument && program.technique === technique);
}

/** The rows whose bytes are actually in the mirror — what a caller can choose today. */
export function playableTechniques(): StringTechniqueProgram[] {
  return STRING_TECHNIQUES.filter((program) => program.mirrored);
}

/**
 * ⭐ **The instrument identity a chosen program is declared by — the name that goes on `TrackV2.instrument`.**
 *
 * ## Why a technique needs a name of its own
 *
 * The owner's report was that the chosen `assetId` had nowhere to go, and the bridge that landed
 * (`TrackV2.instrument` + `src/data/sampledInstruments.ts`) resolves a **written instrument name** to a catalogue
 * recording. So a chosen technique has to *have* a name, and the name has to be one the recorded-instrument table
 * maps — otherwise the track falls back to the built-in preset and the selection is lost in exactly the silent way
 * this line exists to prevent.
 *
 * The name is **derived** rather than hand-written beside each row, so a new technique row cannot be added without
 * an identity: `violin` + `pizzicato` → `violin_section_pizzicato`, `contrabass` + `sustain` →
 * `contrabass_solo_sustain`. The instrument half keeps the word the table's own `name` uses — the violin, viola and
 * cello rows are **sections**, and the contrabass row is **solo** (upstream has no contrabass section) — so the
 * identity says the same thing the row does instead of flattening the two.
 *
 * `strings_lead` in `sampledInstruments.ts` is unchanged and still means the violin section sustained: this is a
 * **second** name for the same recording, for a caller that chooses by playing technique rather than by genre role.
 */
const IDENTITY_PREFIX: Record<StringInstrument, string> = {
  violin: "violin_section",
  viola: "viola_section",
  cello: "cello_section",
  contrabass: "contrabass_solo",
  "solo-violin": "solo_violin",
};

/** The `TrackV2.instrument` name for a program — `<instrument>_<technique>`, e.g. `violin_section_pizzicato`. */
export function instrumentIdentityFor(program: Pick<StringTechniqueProgram, "instrument" | "technique">): string {
  // A hyphen separates words in `non-vibrato`, and an underscore is what the rest of these names use.
  return `${IDENTITY_PREFIX[program.instrument]}_${program.technique.replace(/-/g, "_")}`;
}

/** The program a `TrackV2.instrument` identity names, or `undefined` for a name this table does not claim. */
export function programForIdentity(identity: string): StringTechniqueProgram | undefined {
  const wanted = identity.trim();
  return STRING_TECHNIQUES.find((program) => instrumentIdentityFor(program) === wanted);
}

/**
 * The techniques the pinned library has a program for but the mirror does not ship.
 *
 * ⭐ **Empty since the 2026-10-02 round, and that is the point of keeping it.** All 26 rows are mirrored now — the
 * Part 1 rows that used to be listed here (`ViolinEnsTrem`, `CelloEnsSpic`, the `-Quiet` takes, the solo-violin
 * family) and the Part 2 `non-vibrato` row are playable — and the only two techniques this library genuinely cannot
 * play are the ones with **no row at all** (`col-legno`, `harmonics`). A caller that wants "what is still out of
 * reach" should read this function **and** {@link STRING_SITUATION_RULES}'s preferences, because a preference with
 * no row is a different shape of gap from a row with no bytes.
 */
export function unmirroredTechniques(): StringTechniqueProgram[] {
  return STRING_TECHNIQUES.filter((program) => !program.mirrored);
}

/* ------------------------------------------------------------------------------------------------ */
/*                                     velocity selects a layer                                       */
/* ------------------------------------------------------------------------------------------------ */

/** Which of a program's recorded dynamic layers a velocity lands in. */
export interface VelocityLayerChoice {
  /** The layer's own range, as the SFZ file declares it. */
  layer: readonly [number, number];
  /** Its index in `velocityLayers`, which the loader and any report can refer to. */
  index: number;
  /**
   * Whether the velocity sat at the very top or bottom edge of the layer, where a neighbouring take would have been
   * the same loudness. Stated because it is the honest limit of a two-take recording: 62 and 63 are one step apart
   * and several dB apart.
   */
  atEdge: boolean;
}

/**
 * ⭐ **The dynamic mapping as it actually is: velocity _selects_ a recorded take; it does not scale one.**
 *
 * This is the second thing the owner asked to have written down, and the honest answer is narrower than "velocity
 * works". For `ViolinEnsSusVib` there are exactly **two** recorded dynamics, split at 62/63, and every velocity
 * below 63 reaches the same take at the same gain. So a caller who writes a crescendo as a velocity ramp gets
 * **one step** out of it, not a curve — and between the takes the file itself compensates the level with `volume`
 * (the soft layer is written `volume=20`, the loud one `volume=7`), meaning the loudness difference is a property
 * of the recordings rather than of anything the player does.
 *
 * `undefined` means the velocity is outside every declared layer, which for these programs does not happen (they
 * cover 0–127 between them) but which is reported rather than clamped, because a velocity of 200 is a caller's
 * mistake and silently folding it into the top layer would hide it.
 */
export function velocityLayerFor(
  program: Pick<StringTechniqueProgram, "velocityLayers">,
  velocity: number
): VelocityLayerChoice | undefined {
  const index = program.velocityLayers.findIndex(([low, high]) => velocity >= low && velocity <= high);
  if (index === -1) return undefined;
  const layer = program.velocityLayers[index]!;
  return { layer, index, atEdge: velocity === layer[0] || velocity === layer[1] };
}

/**
 * How many distinct dynamics the material can express — the number a crescendo actually has to work with.
 *
 * One layer means a velocity ramp does nothing at all to the timbre, which is worth saying about the `quiet`
 * programs: they are for "this whole part is soft", not for shaping one note.
 */
export function dynamicSteps(program: Pick<StringTechniqueProgram, "velocityLayers">): number {
  return program.velocityLayers.length;
}

/* ------------------------------------------------------------------------------------------------ */
/*                                    how long a note can sound                                       */
/* ------------------------------------------------------------------------------------------------ */

/**
 * ⭐ **What happens when a note is longer than the recording** — measured advice, never a silent truncation.
 *
 * The owner's lesson was "弦乐长音会停", and the cause is that the pinned strings are one-shot recordings with no
 * loop. This type is the consequence: a caller writing a note longer than `program.maxSampleSeconds` is told, and
 * told **which of three remedies** they are choosing between, each with its cost written down.
 */
/**
 * One way out of a note that is longer than its sample, and what it costs.
 *
 * Named rather than inlined so the remedy list below can be typed by it, and so a caller can hold one.
 */
export interface LengthRemedy {
  remedy: "truncate" | "switch-technique" | "retrigger";
  cost: string;
}

export type LengthVerdict =
  | {
      kind: "fits";
      /** How much of the sample is left unused at the note's end. */
      headroomSeconds: number;
    }
  | {
      kind: "risky";
      /**
       * The note is shorter than the program's *longest* sample but longer than its *shortest*. Whether it sounds
       * whole depends on which pitch answered, which this function cannot know without resolving the note.
       */
      safeSeconds: number;
      maxSampleSeconds: number;
    }
  | {
      kind: "exceeds";
      maxSampleSeconds: number;
      /** The three remedies, with the price of each. See the field's own note for why there are exactly three. */
      remedies: readonly LengthRemedy[];
    };

/**
 * The remedies for an over-long note.
 *
 * Three, and no fourth, because those are the three things the library itself permits: the material can be cut
 * short, a different program can be chosen, or more than one note can be written. **The costs are the reason this
 * is data rather than a sentence in a comment** — each one is audible, and a caller picking between them should be
 * picking with the price in front of them.
 */
export const LENGTH_REMEDIES: readonly LengthRemedy[] = [
  {
    remedy: "truncate",
    cost: "The note stops where the sample stops. Audible as an unnatural end if the note was written to ring on, because the recording's own decay — not the composer's note-off — is what ends it. Nothing to arrange, so this is the cheap one.",
  },
  {
    remedy: "switch-technique",
    cost: "A different program holds longer, so the note keeps sounding — but the articulation changes with it, and a sostenuto line played by a pizzicato program is a different gesture rather than the same one held longer.",
  },
  {
    remedy: "retrigger",
    cost: "Two or more overlapping notes of the same pitch, each within the sample's length, staggered so the second attack lands under the first one's tail. Keeps the technique and the length; costs a re-attack the recording did not have, which reads as a bow change and is wrong for a single sustained tone but right for repeated strokes.",
  },
];

/**
 * ⭐ **Whether a note of this length can sound whole on this program, and what to do if it cannot.**
 *
 * The beats-to-seconds conversion happens here rather than at the call site because it is the one place the tempo
 * enters the question, and a caller passing beats without a tempo would otherwise get a confident wrong answer.
 * `NoteEvent.lengthBeats` is the model's own unit, so it is what this takes.
 */
export function resolveLengthConstraint(
  program: Pick<StringTechniqueProgram, "maxSampleSeconds" | "safeSeconds">,
  lengthBeats: number,
  bpm: number
): LengthVerdict {
  const seconds = (lengthBeats * 60) / bpm;
  if (seconds <= program.safeSeconds) {
    return { kind: "fits", headroomSeconds: round3(program.safeSeconds - seconds) };
  }
  if (seconds <= program.maxSampleSeconds) {
    return { kind: "risky", safeSeconds: program.safeSeconds, maxSampleSeconds: program.maxSampleSeconds };
  }
  return {
    kind: "exceeds",
    maxSampleSeconds: program.maxSampleSeconds,
    remedies: LENGTH_REMEDIES,
  };
}

/** Three decimals, so a seconds figure reads as a measurement rather than a float tail. */
function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/* ------------------------------------------------------------------------------------------------ */
/*                          overlap is not legato: chord-change re-attacks                            */
/* ------------------------------------------------------------------------------------------------ */

/**
 * ⭐ **Where a sustained bed overlaps into the next chord and still re-attacks — the writing half of "断".**
 *
 * ## The distinction this exists for
 *
 * The owner heard the strings break, and narrowed it to one instant. `legatoGapsFor` (`src/data/legatoGaps.ts`)
 * reports the case where a chord **fails to reach** the next one, and on the owner's project it reports nothing:
 * every note is held 8.5 beats and the chords are 8 beats apart, so each chord is still sounding half a beat into
 * the next. By that measurement the writing is already the connected kind.
 *
 * **But overlap is not connection.** A chord whose notes are still ringing while the next chord's notes begin is a
 * *dovetail*, not a bow change that never stopped: each new note is a new voice with its own attack, and whether the
 * join is heard as one continuous sound or as an attack laid over a dying one is decided by the player, not by the
 * arithmetic of `lengthBeats`. So this reports the other half — **every chord change at which the previous chord is
 * still sounding and the next one starts anyway** — which is exactly the set of instants a legato treatment would
 * have to act on.
 *
 * ## What it is not
 *
 * It is a **detector**, like `legatoGapsFor`: it reports and changes nothing. Whether a re-attack is wrong depends
 * on the music — a rhythmic string figure wants one on every chord, and a pad does not — so the answer travels with
 * the count and the caller decides.
 */
export interface ChordChangeReattack {
  trackId: string;
  trackName: string;
  /** One entry per chord change where the previous chord had not finished. */
  changes: Array<{
    /** When the new chord begins, in beats. */
    atBeats: number;
    /** The same instant in seconds at this tempo — the number a person would look for in an editor. */
    atSeconds: number;
    /** How long the previous chord was still sounding when the new one began, in seconds. Positive by construction. */
    overlapSeconds: number;
    /** How many notes the new chord has, which is how many fresh attacks land at this instant. */
    attacks: number;
  }>;
  /** How many chord changes there are altogether, before the cap. */
  changesTotal: number;
  /** How many notes the track holds, so "one change in four notes" and "one in four hundred" read differently. */
  notes: number;
}

/** How many changes one track may report; the count above stays exact. */
const MAX_REPORTED_CHANGES = 8;

/** Notes starting and ending at these are the same instant rather than a float artefact — the same rule `legatoGaps` uses. */
const REATTACK_EPSILON = 1e-6;

/**
 * Every track whose sustained chords overlap and re-attack, with the instants and the counts.
 *
 * `bpm` defaults to **120**, which is the same default the arrangement's own compile uses when the model states no
 * tempo (`ArrangementV2.bpm` is optional) — so a call site that has not looked the tempo up cannot report a second
 * that the renderer would not produce.
 */
export function chordChangeReattacks(
  arrangement: { tracks: readonly { id: string; name: string }[]; notesByTrack?: Record<string, readonly NoteEvent[] | undefined> },
  bpm = 120
): ChordChangeReattack[] {
  const reports: ChordChangeReattack[] = [];
  for (const track of arrangement.tracks) {
    const notes = [...(arrangement.notesByTrack?.[track.id] ?? [])];
    if (notes.length < 2) continue;
    /** Grouped by onset so a chord is one chord — the same rule `legatoGapsFor` follows, and for the same reason. */
    const chords = new Map<number, NoteEvent[]>();
    for (const note of notes) {
      const key = Math.round(note.startBeats * 1e6) / 1e6;
      chords.set(key, [...(chords.get(key) ?? []), note]);
    }
    const onsets = [...chords.keys()].sort((a, b) => a - b);
    if (onsets.length < 2) continue;
    /** A sustained bed, by the same test `legatoGapsFor` uses: chordal, or notes averaging a beat or more. */
    const chordal = [...chords.values()].some((chord) => chord.length >= 2);
    const meanLength = notes.reduce((sum, note) => sum + note.lengthBeats, 0) / notes.length;
    if (!chordal && meanLength < 1) continue;

    const changes: ChordChangeReattack["changes"] = [];
    let total = 0;
    for (let index = 0; index + 1 < onsets.length; index += 1) {
      const current = chords.get(onsets[index]!)!;
      const next = chords.get(onsets[index + 1]!)!;
      const currentEnd = Math.max(...current.map((note) => note.startBeats + note.lengthBeats));
      const nextStart = onsets[index + 1]!;
      const overlapBeats = currentEnd - nextStart;
      // Strictly overlapping: a chord that has already released is a seam, and `legatoGapsFor` owns that case.
      if (overlapBeats <= REATTACK_EPSILON) continue;
      total += 1;
      if (changes.length < MAX_REPORTED_CHANGES) {
        changes.push({
          atBeats: round3(nextStart),
          atSeconds: round3((nextStart * 60) / bpm),
          overlapSeconds: round3((overlapBeats * 60) / bpm),
          attacks: next.length,
        });
      }
    }
    if (total > 0) reports.push({ trackId: track.id, trackName: track.name, changes, changesTotal: total, notes: notes.length });
  }
  return reports;
}

/**
 * The sentence a reply carries about re-attacks, or null when there is nothing to report.
 *
 * Written as the owner's own distinction — **overlap is not legato** — because "the notes overlap" is a fact a caller
 * can read off the model and would otherwise take as reassurance that nothing more is needed.
 */
export function chordChangeReattackNote(reports: readonly ChordChangeReattack[]): string | null {
  if (reports.length === 0) return null;
  const parts = reports.map((report) => {
    const first = report.changes[0];
    const where = first
      ? `; first at beat ${first.atBeats} = ${first.atSeconds} s, where ${first.attacks} note(s) attack over the previous chord's ${first.overlapSeconds} s of remaining sound`
      : "";
    return `${report.trackName} (${report.trackId}): ${report.changesTotal} chord change(s) across ${report.notes} note(s)${where}`;
  });
  return (
    `chordChangeReattacks: ${parts.join(" | ")}. ` +
    "The notes overlap, so the part is not detached — but overlap is not legato: each new note starts its own attack, " +
    "so at these instants a fresh onset lands on top of a sounding one. A sustained bed usually wants the join to be " +
    "continuous rather than re-struck; a rhythmic figure wants the re-strike. This is reported rather than changed."
  );
}

/* ------------------------------------------------------------------------------------------------ */
/*                                     which technique for what                                       */
/* ------------------------------------------------------------------------------------------------ */

/**
 * The musical situations the owner named, in their words.
 *
 * Each one is a **situation**, not a technique: "short and repeating" is something the music is doing, and the
 * technique that serves it is a separate decision with its own column below. Keeping the two apart is what makes
 * the table a rule rather than a synonym list.
 */
export type StringSituation =
  | "sustained-bed"
  | "legato-line"
  | "short-repeating"
  | "plucked-walking"
  | "tension-tremolo"
  | "accent-attack";

/** One rule: a situation, the techniques that serve it in preference order, and why. */
export interface StringSituationRule {
  situation: StringSituation;
  /** In preference order. The first whose bytes are mirrored **and** whose range covers the note is chosen. */
  preferred: readonly StringTechnique[];
  /**
   * ⭐ **The register the situation lives in**, as `[lowest, highest]` MIDI notes, or absent when the situation is
   * not about a register.
   *
   * It is here rather than in a caller because "walking" is not a technique, it is a **low line**: a viola
   * pizzicato is a plucked string and is not a walking bass. Measured on this table, adding the register is what
   * turns `plucked-walking` from four plucked programs into the one contrabass program the words actually mean.
   */
  range?: readonly [number, number];
  /** Why this is the order, in the owner's terms. */
  why: string;
  /** What the situation is recognised by in the model, so the rule can be checked rather than believed. */
  recognisedBy: string;
}

/**
 * ⭐ **The rules — "什么音乐情形该用什么演奏法", written down.**
 *
 * Read each `why` as the answer to the owner's question, and each `preferred` list as an **ordered** decision
 * rather than a set: the first entry is what a player would reach for, and the later ones exist because the first
 * one's bytes or range may not be there.
 *
 * **No rule here matches on a program's name.** Every choice is made against the table above — technique,
 * mirrored bytes, note range, and the measured length limit — which is the difference between a rule and a guess
 * at a string.
 */
export const STRING_SITUATION_RULES: readonly StringSituationRule[] = [
  {
    situation: "sustained-bed",
    // Sustained vibrato first because the section's vibrato is recorded in and a held chord wants it; the quiet
    // take second, because a bed that must sit under everything is a different request rather than a lower velocity.
    // ⭐ Both are mirrored since 2026-10-02, and Part 2 added the third preference's only program — the contrabass's
    // `ContrabassSusNV`. It is a **contrabass-only** row: no other instrument upstream has a `SusNV`, and on the
    // contrabass `sustain` and `quiet` cover the same 24–60 compass and come first, so this preference is reachable
    // by name rather than by falling through to it. That is stated rather than hidden.
    preferred: ["sustain", "quiet", "non-vibrato"],
    why: "长和弦铺底: the section's recorded vibrato is the warm default, and the quiet take is the answer when the bed has to sit under everything — one recorded layer at the file's own `volume=20`, for a whole part that must sit soft rather than for shaping one note. Non-vibrato is the third preference and has exactly one program upstream, the contrabass's `ContrabassSusNV` (mirrored in the 2026-10-02 Part 2 round; 18.195 s longest sample, the longest sustained string in the mirror), so on every other instrument that preference has no row and the choice falls through to sustain.",
    recognisedBy: "several notes starting together, each with lengthBeats reaching the next chord's start (what `legatoGapsFor` reads), or a part whose mean length is a beat or more",
  },
  {
    situation: "legato-line",
    preferred: ["sustain", "quiet"],
    /**
     * ⭐ **Overlap is not legato, and this distinction is the answer to the owner's "断" at a chord change.**
     *
     * `lengthBeats` reaching past the next chord's start produces an **overlap** — the previous chord is still
     * sounding when the next one begins. It does not by itself produce a **connection**: whether the join is heard
     * as one continuous bow or as a new attack laid over a dying one depends on the player, and each note starts its
     * own envelope. `legatoGapsFor` reports when the notes *fail* to overlap; `chordChangeReattacks` below reports
     * the other half — where they overlap and still re-attack.
     */
    why: "连奏: a line that must sound connected is one sustained note per pitch group whose releases overlap the next attack. The technique is the same as a bed; what differs is that the notes must be written overlapping, which is `legatoGaps`'s report and not this table's choice. **Overlap is the writing half only** — a note that starts its own gain envelope from silence re-attacks however much it overlaps, so this rule is a statement about the notes and not yet a guarantee about the sound.",
    recognisedBy: "a single-voice part whose consecutive notes are joined (`legatoGapsFor` reports none) and whose mean length is under a bar",
  },
  {
    situation: "short-repeating",
    // ⭐ Spiccato was upstream-only when this rule was written and the comment said "the moment the bytes are
    // mirrored, the rule needs no edit". That moment was 2026-10-02: the four section spiccatos and the solo
    // violin's are in the mirror, so this lands on the bow and pizzicato is now the fallback rather than the answer.
    preferred: ["spiccato", "pizzicato"],
    why: "短促/重复(跳音、节奏型): spiccato is the bouncing short bow and is what a repeated staccato figure is, with a round robin of 2 so the repeats do not machine-gun one sample. ⭐ Its bytes are mirrored since 2026-10-02, so this resolves to the bow (measured: the violin's longest spiccato sample is 3.208 s, the cello's 3.502 s, the contrabass's 3.283 s), and pizzicato is the fallback for an instrument whose spiccato is out of range rather than the everyday answer it used to be.",
    recognisedBy: "many notes of the same pitch in a run, or notes whose lengthBeats is a fraction of the gap to the next onset",
  },
  {
    situation: "plucked-walking",
    preferred: ["pizzicato"],
    // The one rule with a register, and it needs one: "walking" is a low line, not merely a plucked one.
    range: [24, 60],
    why: "拨弦/低音走动: pizzicato on the contrabass is the walking bass, and its 6.024 s longest sample is why a low plucked line reads as a line rather than as clicks. The register is part of the situation — a viola pizzicato is a plucked string and is not a walking bass — so this rule carries a range and the others do not.",
    recognisedBy: "a low part (MIDI 24–60, the contrabass's own compass) whose notes are short and separated, or a part explicitly marked plucked",
  },
  {
    situation: "tension-tremolo",
    preferred: ["tremolo", "sustain"],
    why: "震音/紧张: tremolo is the rapid repeated bow, and it is the one texture that says tension rather than warmth. ⭐ Its bytes are mirrored since 2026-10-02 (four section programs plus the solo violin's), so this now reaches the tremolo itself — measured longest samples 13.130 s violin, 15.572 s viola, 11.183 s cello, 10.639 s contrabass, 9.447 s solo violin — and `sustain` is the fallback for a note outside the five programs' 24–96 compass rather than the everyday answer it used to be.",
    recognisedBy: "a note written much longer than its neighbours with no change of pitch, or an explicit tremolo marking",
  },
  {
    situation: "accent-attack",
    // The one situation that is about a single note rather than a texture, so the technique choice is about the
    // attack: a pluck has one, a bowed sustain does not.
    preferred: ["pizzicato", "spiccato"],
    why: "重音/突强: a sforzando needs an attack, and a bowed sustain recorded with a soft onset does not have one — no velocity will add it, because velocity selects a take rather than shaping a note. A pluck supplies the attack; where the note must then be held, the honest answer is that this library cannot do both at once.",
    recognisedBy: "one note much louder than its neighbours in the same part (a velocity far above the part's own median)",
  },
];

/**
 * ⭐ **Every situation id, in the rules' own order** — the list an input schema's `enum` is built from.
 *
 * Derived rather than restated, so a tool that offers these words cannot drift from the table that answers them:
 * adding a rule adds the word, and removing one removes it.
 */
export const STRING_SITUATION_IDS: readonly StringSituation[] = STRING_SITUATION_RULES.map((rule) => rule.situation);

/** The rule for a situation, or `undefined` when the situation is not one this table covers. */
export function ruleFor(situation: StringSituation): StringSituationRule | undefined {
  return STRING_SITUATION_RULES.find((rule) => rule.situation === situation);
}

/**
 * ⭐ **Every string instrument the table has a row for, in the table's own order** — the list an input schema's
 * `enum` is built from.
 *
 * Derived rather than restated, for the same reason {@link STRING_SITUATION_IDS} is: a tool that offers these words
 * cannot drift from the table that answers them. `solo-violin` is here although none of its rows is mirrored — the
 * caller can still ask, and the answer is a refusal that names the reason rather than a schema error that pretends
 * the instrument does not exist.
 */
export const STRING_INSTRUMENT_IDS: readonly StringInstrument[] = [...new Set(STRING_TECHNIQUES.map((program) => program.instrument))];

/** Why a choice came out the way it did — one entry per preference that was considered, so a fallback is visible. */
export interface TechniqueRejection {
  technique: StringTechnique;
  reason: "not-mirrored" | "out-of-range" | "no-program" | "length-exceeds";
}

/** The answer to "play this note, in this situation". */
export interface TechniqueChoice {
  instrument: StringInstrument;
  situation: StringSituation;
  /** The program to play, when one was found. */
  program?: StringTechniqueProgram;
  /** The catalogue id to give the sampler lane. */
  assetId?: string;
  /** Every preference that was passed over, and why — so a fallback to pizzicato is visible rather than silent. */
  rejected: TechniqueRejection[];
  /** Whether the chosen technique is the one the rule preferred first. `false` means the choice is a fallback. */
  firstChoice: boolean;
  /**
   * What the note's length does to this program, or `undefined` when no program was chosen.
   *
   * ⭐ This is the 11.7 s lesson made operational: the length verdict is returned **with** the choice rather than
   * left for the caller to compute, because a caller that has to remember to ask will not.
   */
  length?: LengthVerdict;
}

/**
 * ⭐ **Choose a program for one note in one musical situation** — the rules above, applied.
 *
 * The walk is deliberately simple and total: for each preferred technique in order, the first row that has a
 * program, has its bytes mirrored, and covers the note wins. A requirement that fails is **recorded** rather than
 * skipped, so a caller whose tremolo came back as a sustain can see that tremolo was asked for first and why it
 * was not given.
 *
 * `velocity` participates only in the report (`dynamicSteps`), never in the choice — the situation decides the
 * technique and the velocity decides the layer, and letting either do the other's job is how a rule table rots.
 */
export function chooseTechnique(input: {
  instrument: StringInstrument;
  situation: StringSituation;
  /**
   * The note's pitch, so range coverage is checked rather than assumed.
   *
   * **Omissible**, and the omission is meaningful: a caller that has no note yet (`add_arrangement_track` runs before
   * anything is written) cannot have coverage checked, so the range test is skipped and the answer is a technique
   * without a register claim. Passing a guessed pitch would turn "not checked" into a confident wrong answer.
   */
  note?: number;
  /** Beats held, for the length verdict. Omit to skip the check. */
  lengthBeats?: number;
  /** Tempo, required for the length verdict to mean anything. */
  bpm?: number;
}): TechniqueChoice {
  const rule = ruleFor(input.situation);
  const rejected: TechniqueRejection[] = [];
  if (!rule) {
    return { instrument: input.instrument, situation: input.situation, rejected, firstChoice: false };
  }
  /**
   * ⭐ **A rule's register is checked before any technique is**, because it is a fact about the situation rather than
   * about the program. "Walking" is a low line, so a note in the viola's register is not that situation at all, and
   * answering it with a viola pizzicato would be the name-matching this table replaces — one level up.
   */
  if (rule.range && input.note !== undefined && (input.note < rule.range[0] || input.note > rule.range[1])) {
    return { instrument: input.instrument, situation: input.situation, rejected, firstChoice: false };
  }
  for (let index = 0; index < rule.preferred.length; index += 1) {
    const technique = rule.preferred[index]!;
    const program = programFor(input.instrument, technique);
    if (!program) {
      rejected.push({ technique, reason: "no-program" });
      continue;
    }
    if (!program.mirrored) {
      rejected.push({ technique, reason: "not-mirrored" });
      continue;
    }
    if (input.note !== undefined && (input.note < program.lowestNote || input.note > program.highestNote)) {
      rejected.push({ technique, reason: "out-of-range" });
      continue;
    }
    const verdict =
      input.lengthBeats !== undefined && input.bpm !== undefined
        ? resolveLengthConstraint(program, input.lengthBeats, input.bpm)
        : undefined;
    /**
     * A note too long for this program is **not** a reason to reject it. The three remedies in `LENGTH_REMEDIES`
     * all assume the technique was the right one and only the length is wrong; silently switching to a longer
     * program would answer a different musical question. So the choice stands and the verdict travels with it.
     */
    return {
      instrument: input.instrument,
      situation: input.situation,
      program,
      assetId: program.assetId,
      rejected,
      firstChoice: index === 0,
      ...(verdict ? { length: verdict } : {}),
    };
  }
  return { instrument: input.instrument, situation: input.situation, rejected, firstChoice: false };
}

/**
 * ⭐ **The note's own length in beats, at this tempo** — a number a caller can print beside the verdict.
 *
 * Kept separate from `resolveLengthConstraint` because a reply that says "this exceeds the sample" without saying
 * by how much is a reply a person has to re-derive.
 */
export function secondsForNote(note: Pick<NoteEvent, "lengthBeats">, bpm: number): number {
  return round3((note.lengthBeats * 60) / bpm);
}
