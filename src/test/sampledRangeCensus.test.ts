/**
 * **Is the recording the palette gives a lane able to sound the notes the genre writes for it?**
 *
 * The palette (`src/data/sampledInstruments.ts`) answers "which catalogue recording serves this written instrument
 * name"; it says nothing about **which keys that recording covers**. The genre data answers "which pitches does this
 * lane write"; it does not know a recording will answer it. Between the two, a lane whose written line sits outside
 * its recording's key range is **stood down from the synthesiser** (`sampledStandDownIndexes`) and has nothing to put
 * in its place — so it is silent, and it looks exactly like a lane whose library failed to load. That was measured on
 * `/genre/bebop`'s lead: `sax_lead` → `mtg-solo-sax:MTG-Tenor-Sax`, a tenor saxophone whose region map stops at key
 * 76, against a line written 82–91. Forty-four notes, no playback, no error.
 *
 * ## What this file pins, and what it deliberately does not
 *
 * It pins **the census**, not the mapping: for every genre and every `bass`/`chords`/`lead` lane the palette maps to
 * a recording, the written notes are read the way `planSamplerSteps` reads them (the `pitches[step]` stack, the
 * singular `pitch[step]` as the fallback, the step's own `velocity`), and each note is compared against the keys the
 * recording was **measured** to sound. The measurements are the `MEASURED_COVERAGE` table below: it was produced by
 * fetching each asset's SFZ from its **manifest pin**, expanding `#include`s with the app's own include base
 * (`sampleLoader.ts`), and calling the engine's `resolveInstrumentNote` once per key 0–127 — so a coverage claim here
 * is the engine's answer, not a hand-read `lokey`/`hikey`.
 *
 * The assertions that matter are the three counts (sounding / partial / silent) and the lanes named in each class. A
 * change to `src/data/genres/**` moves a written range; a change to `src/data/sampledInstruments.ts` moves an asset;
 * either one moves a count and turns this file red. The **online** half re-derives the whole table from the pins and
 * fails if it no longer matches — which is how a library, a pin or a manifest edit gets caught rather than assumed.
 *
 * ## Why the verdict is per note and not a min/max comparison
 *
 * A min/max comparison is wrong in both directions and this file's own table proves it: `dsmolken-double-bass` sounds
 * keys 12–120 but has **no** sample for 61–71 or 90–95, so "-3 to +3 around a root" reasoning over its printed range
 * would claim notes it cannot play; and a lane written inside the range can still lose its only notes to a gap. Every
 * note is asked about individually, and "silent" means **zero** of the lane's written notes resolve.
 *
 * ## The velocity dimension
 *
 * The engine resolves a note with the velocity the lane writes, and a `lovel`/`hivel` split could in principle make a
 * key sound at one velocity and not another. It does not here: for the ten assets the silent and partial lanes used
 * when this table was taken, the sounding key set was measured at velocities 1, 64 and 127 and is **identical** at
 * all three, so the offline verdict (which uses the measured key set) and the online verdict (which resolves at each
 * note's own velocity) agree. ⭐ `karoryfer-pastabass` was measured the same way when the `pick_bass` row moved onto
 * it — 1, 64, 100 and 127 all give the same **33–101 with no holes** — and `PickedBassYR`, the recording that row left,
 * likewise gave the same 26–46 at all four.
 * `docs/SAMPLED_RANGE_COVERAGE.md` §method records the numbers.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { ALL_GENRES } from "../data/genres";
import { patternFromGenre } from "../data/genreMix";
import { sampledAssetForLane } from "../data/sampledInstruments";
import { catalogueFromManifestText } from "../data/sampleCatalogue";
import { parseManifest } from "../data/sampleManifest";
import { expandRemoteIncludes } from "../audio/sfz/remoteIncludes";
import { resolveInstrumentNote } from "../audio/sfz/instrument";
import type { SequencerTrack } from "../types/genre";

/** A lane's written note, with the velocity its own step states — the pair `planSamplerSteps` builds an event from. */
interface WrittenNote {
  step: number;
  pitch: number;
  velocity: number;
}

/** Every note a lane sounds, read exactly as `src/audio/samplerSteps.ts` reads it. */
function writtenNotes(track: SequencerTrack): WrittenNote[] {
  const notes: WrittenNote[] = [];
  track.steps.forEach((value, step) => {
    if (!value) return;
    const stack = track.pitches?.[step];
    const single = track.pitch?.[step];
    const pitches: number[] =
      Array.isArray(stack) && stack.length > 0
        ? stack.filter((candidate): candidate is number => typeof candidate === "number" && candidate > 0)
        : typeof single === "number" && single > 0
          ? [single]
          : [];
    const velocity = typeof track.velocity?.[step] === "number" ? track.velocity[step] : 100;
    for (const pitch of pitches) notes.push({ step, pitch, velocity });
  });
  return notes;
}

/** The keys one recording was measured to sound: a measured span minus its measured holes. */
interface AssetCoverage {
  assetId: string;
  /** Lowest key `resolveInstrumentNote` answered, at velocity 100, over 0–127. */
  first: number;
  /** Highest key it answered. */
  last: number;
  /** Keys inside the span it did **not** answer. */
  holes: readonly number[];
  /** sha256 of the program text fetched from the pin — the manifest declares the same hash for the same file. */
  sha256: string;
}

/**
 * ⭐ **The measurement, taken 2026-10-03 from the manifest's own pins.** Every row was produced by fetching the
 * program, expanding its includes, and calling `resolveInstrumentNote` for keys 0–127; every fetched program's sha256
 * matched `public/samples/manifest.json`'s `files[].sha256` for that path (the online half re-checks it). A row here
 * is a fact about a file at a pin, which is why the online half exists: when the file changes, this table must be
 * re-measured rather than trusted.
 */
const MEASURED_COVERAGE: readonly AssetCoverage[] = [
  { assetId: "discord-gm-sitar:105-Sitar", first: 12, last: 96, holes: [], sha256: "58423ce227b1f595e7c8b406a1bb7b6ba5b16c54141a322775069bb80c204695" },
  { assetId: "dsmolken-double-bass:d-smolken-rubner-bass-pizz", first: 12, last: 120, holes: [61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 90, 91, 92, 93, 94, 95], sha256: "0aea1def56753b0dcc89914b1ac24054200bacc01dd696572745c70787eaec4f" },
  { assetId: "freepats-button-accordion-hn", first: 0, last: 127, holes: [], sha256: "1f273b331061ca72e32321b3673fdff1c66d056a0877456f1ed1499781fec36c" },
  { assetId: "freepats-drawbar-organ", first: 33, last: 98, holes: [], sha256: "d3fbbf3d96833cfd3a706204a1bc8a31c81b9fe253812a74ea8b9574b5cfc184" },
  { assetId: "freepats-fsbs-dist2", first: 35, last: 86, holes: [], sha256: "746b36690f1d4a0e8d4dcc3ab8c7880998b313fa46d060e12671d208e639c754" },
  { assetId: "freepats-percussive-organ", first: 31, last: 108, holes: [], sha256: "ac09175af24dd52ab8a931dc8b0805f14a302f72b65ec67b45cea192dde1130a" },
  { assetId: "freepats-spanish-classical-guitar", first: 29, last: 88, holes: [], sha256: "7edec559c98c0658e9ad9e38156ef16346f81049fab96c6166fbb872f3f7d92e" },
  { assetId: "jlearman-jrhodes3c:jRhodes-both-looped", first: 24, last: 103, holes: [], sha256: "d689a1884b4cf877da712b69ad4873888b6141c73af7c1ed737e3f22a7ac8315" },
  { assetId: "karoryfer-black-and-blue-basses:05-darkblack-pluck", first: 35, last: 76, holes: [], sha256: "9584c30da4ad3f5df609a6322b2e0a2ce6a21aed07188c2386844b6c06948358" },
  { assetId: "karoryfer-emilyguitar:emily-clean", first: 33, last: 96, holes: [], sha256: "e4e0fb4938db52459dc369ae4347548b5894bb75b21ea04ff66a2033be0d96cc" },
  { assetId: "karoryfer-pastabass", first: 33, last: 101, holes: [], sha256: "1faa0913f2b8eae2ebbb73114681abf83bfc193837615730bf50fb9d0b0a55cc" },
  { assetId: "mtg-solo-sax:MTG-Tenor-Sax", first: 39, last: 76, holes: [41, 42, 43], sha256: "28e25102e99a00f8dd864d8596ef2ac2a8a263203fe958814d9c9a54246ed636" },
  { assetId: "salamander-grand", first: 21, last: 108, holes: [], sha256: "c8b282f03fdb2d9e6be24a99df0d97a05e7ece718d1a14e0b882c518161f7837" },
  { assetId: "sonatina-brass:All-Brass-Sustain", first: 28, last: 88, holes: [], sha256: "3f9eeabf84212a3e25bb9df9a680136bdf40ef98a79ab19966d2866c245e9712" },
  { assetId: "vcsl:Harmonica-Hohner-Special20-C-Keyswitch", first: 60, last: 97, holes: [], sha256: "ddae7215822c7dbec1f97918f36af6402c96cf45ac35ad4e0df1c72231ae651e" },
  { assetId: "vcsl:Marimba", first: 41, last: 97, holes: [], sha256: "8d13762fc61641976b09332b72d2c220cab41c21e9ce7e844e20797e1c8a8ea3" },
  { assetId: "vcsl:Tubular-Bells-1", first: 60, last: 77, holes: [], sha256: "63d9d4949f5499f0085332ee5c277d7c34cb024e64f5681237e6c2d75d7a4d38" },
  { assetId: "vcsl:Vibraphone-Keyswitch", first: 57, last: 89, holes: [], sha256: "63d7aee8de84625da70d9338c6dc1e64dcd30390f791542e7e13456e26ffc36d" },
  { assetId: "vsco2ce:FluteSusVib", first: 60, last: 96, holes: [], sha256: "26b0dedaa483b6f7f4201d144673b26ab1d0e4585493a97815d03904319a0734" },
  { assetId: "vsco2ce:TrumpetHarmonMuteSus", first: 58, last: 84, holes: [], sha256: "91432a71a4a16e7558df10594c7844595f0937fb4aa74a4bd70d7fbd18678f46" },
  { assetId: "vsco2ce:TrumpetSus", first: 52, last: 84, holes: [], sha256: "8dc5eca44087b0f0af782b3a54ee10a263520d7756f6ed497aa1e3111eea66a6" },
  { assetId: "vsco2ce:ViolinEnsSusVib", first: 55, last: 86, holes: [], sha256: "4591e212cccf1cbcff0c78cf8429a8221bb0820b70cb7c8dd6685f470ace4eaa" },
];

const coverageOf = (assetId: string): AssetCoverage => {
  const entry = MEASURED_COVERAGE.find((candidate) => candidate.assetId === assetId);
  if (!entry) throw new Error(`no measured coverage for "${assetId}" — the palette moved without this table moving`);
  return entry;
};

/** The same lookup, but `undefined` instead of throwing, so a lane whose asset this table does not hold is a pinned red. */
const coverageFor = (assetId: string): AssetCoverage | undefined => MEASURED_COVERAGE.find((candidate) => candidate.assetId === assetId);

/** The keys a recording sounds, from the measurement — the offline twin of `resolveInstrumentNote`'s answer. */
function soundingKeys(entry: AssetCoverage): Set<number> {
  const keys = new Set<number>();
  for (let note = entry.first; note <= entry.last; note += 1) {
    if (!entry.holes.includes(note)) keys.add(note);
  }
  return keys;
}

/** `bass`, `chords` and `lead` are the roles `sampledAssetForLane` maps by name; a drum role is a different list. */
const MELODIC_ROLES = ["bass", "chords", "lead", "audio"];

type Verdict = "sounding" | "partial" | "silent" | "no-notes" | "unmeasured";

interface LaneCensus {
  key: string;
  genreId: string;
  trackIndex: number;
  trackId: string;
  instrument: string;
  assetId: string;
  noteCount: number;
  /** Every distinct written pitch, ascending. */
  distinct: readonly number[];
  soundingCount: number;
  verdict: Verdict;
}

const CENSUS: readonly LaneCensus[] = ALL_GENRES.flatMap((genre) => {
  const pattern = patternFromGenre(genre);
  const rows: LaneCensus[] = [];
  pattern.tracks.forEach((track, trackIndex) => {
    const assetId = sampledAssetForLane(track);
    if (assetId === undefined) return;
    if (!MELODIC_ROLES.includes(track.track_id)) return;
    const notes = writtenNotes(track);
    const entry = coverageFor(assetId);
    const keys = entry ? soundingKeys(entry) : undefined;
    const soundingCount = keys ? notes.filter((note) => keys.has(note.pitch)).length : 0;
    const distinct = [...new Set(notes.map((note) => note.pitch))].sort((a, b) => a - b);
    rows.push({
      key: `${genre.id}/${track.track_id}#${trackIndex}`,
      genreId: genre.id,
      trackIndex,
      trackId: track.track_id,
      instrument: track.instrument,
      assetId,
      noteCount: notes.length,
      distinct,
      soundingCount,
      verdict:
        entry === undefined ? "unmeasured" : notes.length === 0 ? "no-notes" : soundingCount === 0 ? "silent" : soundingCount === notes.length ? "sounding" : "partial",
    });
  });
  return rows;
});

const countOf = (verdict: Verdict) => CENSUS.filter((lane) => lane.verdict === verdict).length;
/** Genres with at least one palette-mapped lane that sounds **nothing at all** — the number the owner asked for. */
const silentGenres = [...new Set(CENSUS.filter((lane) => lane.verdict === "silent").map((lane) => lane.genreId))].sort();
const summary = (lane: LaneCensus) => `${lane.genreId}/${lane.trackId}:${lane.instrument}→${lane.assetId}(${lane.noteCount} notes, written ${lane.distinct.length ? lane.distinct.join(",") : "—"})`;
/** The census in a stable order (genre, then lane), so a comparison is a set comparison and not a file-order one. */
const inKeyOrder = (verdict: Verdict) => CENSUS.filter((lane) => lane.verdict === verdict).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

/**
 * ⭐ **The census before the four genre lines were folded into their instrument's range** — `sha256` of every lane's
 * `summary(...)` line, sorted, taken on the commit this fix starts from (`docs/SAMPLED_RANGE_COVERAGE.md` §7.4 states
 * the same value and how it was taken: `vitest` on the unfixed tree, over this same `summary`). It is used by the
 * "nothing else moved" criterion: the current census with the four folded rows put back must hash to this.
 */
const PRE_FOLD_CENSUS_DIGEST = "7b9d4bc4caadb7b888fb868e37c48a96f247f59567a16b8064fba7a86ccba761";

/**
 * ⭐ **The `pick_bass` recording the 2026-10-03 swap moved onto, and the one it moved off.**
 *
 * The pre-fold reconstruction below needs both names: the fold happened while `pick_bass` still named
 * `PickedBassYR`, so reproducing that census means undoing *this* edit as well as the fold. The before-name is kept
 * here rather than only in the git history because it is the address whose **measured 26–46 span** is the reason the
 * nine narrow lanes exist, and a future reader should be able to see the swap without a `git log`.
 */
const PICK_BASS_AFTER = "karoryfer-pastabass";
const PICK_BASS_BEFORE = "freepats-electric-bass-yr:PickedBassYR-20190930";

describe("the written pitch range of every palette-mapped lane, against what its recording sounds", () => {
  it("measures 202 palette-mapped lanes across 96 genres and leaves the other 63 genres with none", () => {
    /**
     * The denominators, pinned so a table that silently stopped listing a genre is caught. `src/data/genres/**` holds
     * 159 genres; the palette serves `bass`/`chords`/`lead` lanes in 96 of them, and 63 write none of those three on a
     * mapped name (their voices are synthesisers by definition, or the genre has no such lane).
     */
    expect(ALL_GENRES.length).toBe(159);
    expect(new Set(CENSUS.map((lane) => lane.genreId)).size).toBe(96);
    expect(CENSUS.length).toBe(202);
    expect(new Set(CENSUS.map((lane) => lane.assetId)).size).toBe(22);
  });

  it("⭐ pins the three counts: 181 sounding, 17 partial, 0 silent (and 4 lanes the genre leaves empty)", () => {
    /**
     * ⭐ **These four numbers are the criterion.** They move when a genre's written notes move, when the palette's
     * asset assignment moves, or when the measured coverage table moves — which is exactly the set of edits that can
     * create or remove a silent lane. `no-notes` is kept as its own class rather than folded into "sounding": a lane
     * the genre writes nothing on has no notes to lose, and counting it as healthy would hide a lane that a future
     * genre round fills with an out-of-range line.
     *
     * ⭐ **`{168, 25, 5, 4}` → `{172, 25, 1, 4}`, and why: four written lines were outside their instrument's own
     * playing range, not merely outside the recording the palette picked for them, so the genre content was folded
     * back into range by whole octaves (the reasoning and the sources are in `docs/SAMPLED_RANGE_COVERAGE.md` §7).
     * The four were `bebop`/`free-jazz`/`smooth-jazz` lead (`sax_lead` → a tenor saxophone, a concert instrument
     * whose range is A♭2–E5 = keys 44–76, against lines written 77–91) and `chicago-drill` lead (`bell_lead` →
     * tubular bells, whose written range is C4–F5 = keys 60–77, up to G5 = 79 on a few professional sets, against a
     * line written 79/82/84). Folding moved them from `silent` to `sounding`: 168 + 4 = 172, 5 − 4 = 1.
     *
     * ⭐ **`{172, 25, 1, 4}` → `{181, 17, 0, 4}`, and why: the `pick_bass` row moved onto a wider recording.** The one
     * remaining silent lane was `post-punk` bass (written 50/53/55 — D3, F3, G3) and the 25 partial lanes included
     * **eight more** `pick_bass` lanes that lost their top notes; both were the same fact about the recording, which
     * `resolveInstrumentNote` measures at **26–46** (A♯2). The row now names `karoryfer-pastabass`, whose `linguine`
     * program the same sweep measures at **33–101 with no holes**, so every one of those nine lanes sounds all of its
     * written notes: nine lanes leave `silent`/`partial` for `sounding`, i.e. 172 + 9 = 181, 25 − 8 = 17, 1 − 1 = 0.
     * ⚠️ **The genre data was not touched** — that is the point of the swap: the notes were always ordinary electric
     * bass notes and it was the library that was narrow (see `docs/SAMPLED_RANGE_COVERAGE.md` §8.5(b) and §8.6).
     */
    expect({ sounding: countOf("sounding"), partial: countOf("partial"), silent: countOf("silent"), "no-notes": countOf("no-notes") }).toEqual({
      sounding: 181,
      partial: 17,
      silent: 0,
      "no-notes": 4,
    });
    // And the sounding/partial/silent counts are over lanes that have notes, so the four classes partition the 202.
    expect(countOf("sounding") + countOf("partial") + countOf("silent") + countOf("no-notes")).toBe(CENSUS.length);
  });

  it("⭐ leaves no genre with a palette-mapped lane that should have a recording and sounds nothing", () => {
    /**
     * The creator-facing number, and it is now **zero** — the state the `pick_bass` swap reached. Pinned as a **map**,
     * not a total, so a **new** silent lane, in any of the 159 genres, is a red rather than something a total of zero
     * would hide; the named lane that used to be the one entry is pinned by the case below.
     */
    const byGenre = Object.fromEntries(silentGenres.map((genre) => [genre, CENSUS.filter((lane) => lane.verdict === "silent" && lane.genreId === genre).length]));
    expect(byGenre).toEqual({});
    expect(silentGenres).toHaveLength(0);
  });

  it("⭐ the lane that was silent sounds every note, and the recording it left behind could not have answered it", () => {
    /**
     * ⭐ **The case the swap was made for, pinned as a fact rather than a symptom.** `post-punk`'s bass writes 50, 53
     * and 55 — D3, F3 and G3, ordinary notes for a 4-string electric bass — and every one was refused by
     * `PickedBassYR`, whose measured span was **26–46**. The row now names `karoryfer-pastabass`, whose measured span
     * is **33–101**, so all twelve written notes resolve. Both halves are asserted: a revert to the old asset fails
     * the `assetId` and the `sounding` expectation, and a regression in the genre's notes fails the pitch list.
     */
    const lane = CENSUS.find((candidate) => candidate.genreId === "post-punk" && candidate.trackId === "bass")!;
    expect(lane).toBeDefined();
    expect(lane.instrument).toBe("pick_bass");
    expect(lane.assetId).toBe(PICK_BASS_AFTER);
    expect(lane.distinct).toEqual([50, 53, 55]);
    expect(lane.soundingCount).toBe(lane.noteCount);
    expect(lane.verdict).toBe("sounding");
    // The recording it left: 26–46 as the engine measured it. Every written note is above its top key — which is why
    // the lane was silent, and not because the asset was missing or a loader failed.
    const before = { first: 26, last: 46 };
    for (const pitch of lane.distinct) expect(pitch).toBeGreaterThan(before.last);
    // The recording it moved onto, stated with its own gaps, and the written notes sit inside it.
    const entry = coverageOf(lane.assetId);
    expect([entry.first, entry.last, entry.holes]).toEqual([33, 101, []]);
    for (const pitch of lane.distinct) expect(pitch).toBeLessThanOrEqual(entry.last);
  });

  it("⭐ the four folded lanes sound now, keep their pitch classes, and are the only lanes whose written notes moved", () => {
    /**
     * ⭐ **The criterion for the fix.** Four lanes were written outside the playing range of the instrument the palette
     * maps them to, so their pitches were folded by whole octaves (`folded` below states each lane's before → after).
     * Three things are asserted, and each of them is a way the fix could have gone wrong:
     *
     * 1. **Every note of the four lanes now resolves** — the lane moved from `silent` to `sounding`. The census
     *    predicate is per note against a measured key set, so this is not a min/max comparison.
     * 2. **Pitch classes are unchanged** — a fold may only move a note by whole octaves, so the written pitch set
     *    modulo 12 must be exactly what it was. (This is also what keeps the harmony: the fold cannot introduce a
     *    note that was not already there.)
     * 3. **Nothing else moved** — the whole census, with those four rows put back, hashes to the census taken before
     *    the fold. That is the "only the lanes that were out of range changed" criterion, stated as a comparison
     *    between the before and after states rather than as a promise.
     *
     * The four are named with both the instrument-range evidence and the recording each is mapped to:
     * tenor saxophone A♭2–E5 (`docs/SAMPLED_RANGE_COVERAGE.md` §7.1) and tubular bells C4–F5/G5 (§7.2).
     */
    const folded = [
      { genre: "bebop", lane: "lead", instrument: "sax_lead", assetId: "mtg-solo-sax:MTG-Tenor-Sax", octaves: -2, before: [82, 85, 86, 89, 91], after: [58, 61, 62, 65, 67] },
      { genre: "free-jazz", lane: "lead", instrument: "sax_lead", assetId: "mtg-solo-sax:MTG-Tenor-Sax", octaves: -2, before: [81, 82, 84, 85, 87, 88, 90], after: [57, 58, 60, 61, 63, 64, 66] },
      { genre: "smooth-jazz", lane: "lead", instrument: "sax_lead", assetId: "mtg-solo-sax:MTG-Tenor-Sax", octaves: -1, before: [77, 81, 82], after: [65, 69, 70] },
      { genre: "chicago-drill", lane: "lead", instrument: "bell_lead", assetId: "vcsl:Tubular-Bells-1", octaves: -1, before: [79, 82, 84], after: [67, 70, 72] },
    ];
    for (const expected of folded) {
      const lane = CENSUS.find((candidate) => candidate.genreId === expected.genre && candidate.trackId === expected.lane);
      expect(lane, `${expected.genre}/${expected.lane} is not in the census`).toBeDefined();
      expect(lane!.instrument).toBe(expected.instrument);
      expect(lane!.assetId).toBe(expected.assetId);
      // 1. the fix worked: nothing about the lane is left silent or partial
      expect(lane!.verdict, `${expected.genre}/${expected.lane} should sound every note`).toBe("sounding");
      // 2. the fold kept the pitch classes, and is exactly the stated whole-octave shift
      expect(lane!.distinct).toEqual(expected.after);
      expect(expected.after.map((pitch) => pitch % 12).sort((a, b) => a - b)).toEqual(
        expected.before.map((pitch) => pitch % 12).sort((a, b) => a - b),
      );
      expect(lane!.distinct.map((pitch) => pitch - expected.octaves * 12)).toEqual(expected.before);
      // ...and the whole octave shift is what the instrument's own range forced
      const entry = coverageOf(lane!.assetId);
      for (const pitch of expected.before) expect(pitch).toBeGreaterThan(entry.last);
      for (const pitch of lane!.distinct) expect(pitch).toBeLessThanOrEqual(entry.last);
    }

    /**
     * 3. **Nothing else moved.** The digest is over `genre/lane#index:instrument→asset(count notes, written …)` for
     *    every one of the 202 lanes, sorted, so it is insensitive to file order. The pre-fold text is reconstructed by
     *    undoing **both** edits this table has seen since: the four folded rows go back to their before-notes, and the
     *    sixteen `pick_bass` lanes go back to `PICK_BASS_BEFORE` — the recording the row named when the fold was made,
     *    measured 26–46. Neither edit changed a written pitch, so restoring both must equal the digest this file would
     *    have produced on the commit before the fold (`docs/SAMPLED_RANGE_COVERAGE.md` §7.4 records the same digest).
     */
    const line = (lane: LaneCensus) => summary(lane);
    const undoPickBassSwap = (row: string) => row.replace(`→${PICK_BASS_AFTER}(`, `→${PICK_BASS_BEFORE}(`);
    const laneOf = (genreId: string, trackId: string) => CENSUS.find((lane) => lane.genreId === genreId && lane.trackId === trackId)!;
    const beforeLines = new Map(
      folded.map((expected) => {
        const lane = laneOf(expected.genre, expected.lane);
        return [
          `${expected.genre}/${expected.lane}`,
          `${expected.genre}/${expected.lane}:${expected.instrument}→${expected.assetId}(${lane.noteCount} notes, written ${expected.before.join(",")})`,
        ];
      }),
    );
    const restored = CENSUS.map((lane) => beforeLines.get(`${lane.genreId}/${lane.trackId}`) ?? undoPickBassSwap(line(lane)));
    const digest = (rows: readonly string[]) => createHash("sha256").update([...rows].sort().join("\n")).digest("hex");
    expect(digest(restored)).toBe(PRE_FOLD_CENSUS_DIGEST);
    // and the after-state is a different census, so the assertion above is not vacuous
    expect(digest(CENSUS.map(line))).not.toBe(PRE_FOLD_CENSUS_DIGEST);
    // Twenty rows differ: the four written ranges the fold moved, plus the sixteen `pick_bass` lanes the swap moved
    // onto a different recording. Nothing else in the census has changed since the pre-fold baseline.
    expect(restored.filter((row, index) => row !== line(CENSUS[index]))).toHaveLength(20);
  });

  it("⭐ pins the 17 partial lanes — the ones that lose some notes and keep the rest", () => {
    /**
     * A partial lane is the dangerous middle: something is heard, so nothing looks broken, and the notes that vanish
     * are the top of a line. Pinned by name and by the count of written notes each loses, because "partial" alone
     * cannot tell a lane that loses one note from one that loses five.
     *
     * ⭐ **Eight lines left this list with the `pick_bass` swap and no other line changed.** The eight were
     * `alternative-rock`/`blues-rock`/`doom-metal`/`grunge`/`hard-rock`/`heavy-metal`/`math-rock`/`shoe-gaze` bass,
     * each losing the top of its line to the same 26–46 recording; the one this row now names sounds 33–101, so all
     * eight moved to `sounding`. The remaining seventeen are the *other* narrow cases, which this change does not
     * touch — an instrument written above its own range (guitars, tubular bells, a 61-key organ) or a hole in a
     * recording's key map (`dsmolken-double-bass` 61–71, `microhouse`'s finger bass from 35) — and each is pinned
     * here, verbatim, so that "eight left" cannot quietly become nine.
     */
    const partial = inKeyOrder("partial");
    expect(partial.map((lane) => `${summary(lane)} loses ${lane.noteCount - lane.soundingCount}`)).toEqual([
      "bachata/chords:guitar_lead→karoryfer-emilyguitar:emily-clean(64 notes, written 81,84,88,91,93,96,100,103) loses 16",
      "black-metal/chords:distorted_guitar→freepats-fsbs-dist2(96 notes, written 64,71,76,83,88) loses 12",
      "brooklyn-drill/lead:bell_lead→vcsl:Tubular-Bells-1(12 notes, written 77,79,80) loses 8",
      "funk/chords:guitar_lead→karoryfer-emilyguitar:emily-clean(32 notes, written 76,79,83,86,88,91,95,98) loses 4",
      "gypsy-jazz/chords:guitar_lead→karoryfer-emilyguitar:emily-clean(64 notes, written 79,83,86,90,91,95,98,102) loses 16",
      "hard-bop/lead:sax_lead→mtg-solo-sax:MTG-Tenor-Sax(16 notes, written 72,75,77) loses 4",
      "idm/lead:bell_lead→vcsl:Tubular-Bells-1(16 notes, written 74,77,79,81) loses 8",
      "j-pop/chords:strings_lead→vsco2ce:ViolinEnsSusVib(32 notes, written 77,81,84,88,89,93,96,100) loses 20",
      "kawaii-future-bass/lead:bell_lead→vcsl:Tubular-Bells-1(20 notes, written 72,76,79,83,84) loses 12",
      "microhouse/bass:finger_bass→karoryfer-black-and-blue-basses:05-darkblack-pluck(8 notes, written 34,36,39,44) loses 2",
      "microhouse/chords:vibraphone→vcsl:Vibraphone-Keyswitch(40 notes, written 48,51,55,56,58,60,62,63,65,67,68,70,74,79,80) loses 12",
      "modal-jazz/bass:walking_upright→dsmolken-double-bass:d-smolken-rubner-bass-pizz(16 notes, written 33,38,40,45,47,50,52,57,62) loses 1",
      "nu-disco-house/chords:m1_organ→freepats-drawbar-organ(32 notes, written 81,84,88,91,93,96,100,103) loses 8",
      "samba/chords:guitar_lead→karoryfer-emilyguitar:emily-clean(24 notes, written 79,83,86,90,91,95,98,102) loses 8",
      "sambass/chords:guitar_lead→karoryfer-emilyguitar:emily-clean(48 notes, written 74,78,81,85,86,90,93,97) loses 8",
      "shoe-gaze/chords:guitar_lead→karoryfer-emilyguitar:emily-clean(32 notes, written 81,85,88,92,93,97,100,104) loses 12",
      "trap-rap/lead:bell_lead→vcsl:Tubular-Bells-1(4 notes, written 77,80) loses 2",
    ]);
  });

  it("⭐ the four no-notes lanes are named, so a future genre round that fills one is noticed", () => {
    expect(inKeyOrder("no-notes").map(summary)).toEqual([
      "black-metal/lead:guitar_lead→karoryfer-emilyguitar:emily-clean(0 notes, written —)",
      "death-metal/chords:distorted_guitar→freepats-fsbs-dist2(0 notes, written —)",
      "metalcore/lead:guitar_lead→karoryfer-emilyguitar:emily-clean(0 notes, written —)",
      "west-coast-hip-hop/chords:rhodes_ep→jlearman-jrhodes3c:jRhodes-both-looped(0 notes, written —)",
    ]);
  });

  it("⭐ /genre/bebop's lead is the named case: 44 notes, written 82–91 before the fold and 58–67 after it", () => {
    /**
     * ⭐ **The case the report was opened on, pinned as a fact rather than a symptom.** The lead lane's instrument is
     * `sax_lead`; `sampledAssetForLane` maps it to the tenor saxophone program; the recording's measured top key is 76
     * — which is exactly the instrument's own concert top, E5 — and the lane was written 82–91, above it, so all 44
     * written notes were refused. The line was folded by two octaves and now sounds; this case keeps the *reason* (the
     * mapping, the asset, the recording's span, the instrument's ceiling) pinned, so that a future edit which moves
     * the lane back above 76, or moves the mapping, is a red rather than a rediscovery.
     */
    const lead = CENSUS.find((lane) => lane.genreId === "bebop" && lane.trackId === "lead");
    expect(lead).toBeDefined();
    expect(lead!.instrument).toBe("sax_lead");
    expect(lead!.assetId).toBe("mtg-solo-sax:MTG-Tenor-Sax");
    expect(lead!.noteCount).toBe(44);
    expect(lead!.distinct).toEqual([58, 61, 62, 65, 67]);
    expect(lead!.soundingCount).toBe(lead!.noteCount);
    expect(lead!.verdict).toBe("sounding");
    // The mapping is the palette's own decision, asked through the engine's one entry point rather than restated.
    expect(sampledAssetForLane({ track_id: "lead", instrument: "sax_lead" })).toBe("mtg-solo-sax:MTG-Tenor-Sax");
    // The recording's measured span is stated, with its own gaps, and the folded line sits inside it.
    const entry = coverageOf(lead!.assetId);
    expect([entry.first, entry.last, entry.holes]).toEqual([39, 76, [41, 42, 43]]);
    for (const pitch of lead!.distinct) expect(pitch).toBeLessThanOrEqual(entry.last);
    // The notes as they were written are recorded here too, so the two-octave fold is visible rather than inferred.
    const before = [82, 85, 86, 89, 91];
    for (const pitch of before) expect(pitch).toBeGreaterThan(entry.last);
    expect(lead!.distinct.map((pitch) => pitch + 24)).toEqual(before);
  });

  it("leaves the measurement reachable: every asset in the census has a coverage row, and every row names its sha256", () => {
    /**
     * A lane mapped to an asset this table does not measure is reported as its own verdict rather than thrown during
     * collection, so a palette edit reads as *"this asset has no measured coverage"* with the lane named.
     */
    expect(inKeyOrder("unmeasured").map((lane) => `${lane.genreId}/${lane.trackId}:${lane.instrument}→${lane.assetId}`)).toEqual([]);
    expect([...new Set(CENSUS.map((lane) => lane.assetId))].sort()).toEqual(MEASURED_COVERAGE.map((row) => row.assetId).sort());
    for (const row of MEASURED_COVERAGE) expect(row.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("⭐ the coverage report's `census-current` numbers are the numbers this file measures", () => {
    /**
     * ⭐ **Why this exists: a document that restated an older census sent a reviewer to the wrong conclusion once
     * already.** `docs/SAMPLED_RANGE_COVERAGE.md` describes several rounds — the census, the octave fold, and the
     * `pick_bass` swap — so it necessarily carries old numbers *and* the current ones. Its header marks the current
     * pair with `<!-- census-current -->` and this case reads that line back, so the sentence a reader trusts is the
     * sentence this file measures. Editing either side alone is a red: the document cannot claim a count the census
     * disagrees with, and a count cannot move without its summary moving with it.
     *
     * The comparison is against **`countOf(...)`, the measured value**, not the pinned expectation — so a broken
     * measurement fails here too, rather than two wrong numbers agreeing with each other.
     */
    const report = readFileSync("docs/SAMPLED_RANGE_COVERAGE.md", "utf8");
    // The marker lives inside the report's header blockquote, so the optional `>` is part of the pattern rather than a
    // reason to move the line out of the passage a reader actually reads.
    const marked = /<!-- census-current -->\s*\n>?\s*`sounding: (\d+), partial: (\d+), silent: (\d+), no-notes: (\d+)`/.exec(report);
    expect(marked, "docs/SAMPLED_RANGE_COVERAGE.md no longer carries the `<!-- census-current -->` block").not.toBeNull();
    const [, sounding, partial, silent, noNotes] = marked!;
    expect({ sounding: Number(sounding), partial: Number(partial), silent: Number(silent), "no-notes": Number(noNotes) }).toEqual({
      sounding: countOf("sounding"),
      partial: countOf("partial"),
      silent: countOf("silent"),
      "no-notes": countOf("no-notes"),
    });
  });
});

/* ------------------------------------------------------------------------------------------------------------ */
/*                                            the online half                                                    */
/* ------------------------------------------------------------------------------------------------------------ */

const manifestText = readFileSync("public/samples/manifest.json", "utf8");
const manifest = parseManifest(manifestText).manifest!;
const catalogue = catalogueFromManifestText(manifestText, process.env.GROOVE_SAMPLE_ROOT ?? "");
/** The manifest's own sha256 for each program path, so a change at the pin is caught at the file level too. */
const shaByEntry = new Map(manifest.entries.map((entry) => [entry.id, new Map(entry.files.map((file) => [file.path, file.sha256]))]));

/**
 * The mirror root, from the environment or `.env.local` (which is gitignored). Without it the two assets the mirror
 * is the **only** address for cannot be proved: `freepats-drawbar-organ` and `freepats-percussive-organ` declare a
 * mirror-relative path with no repository at all, so they have no pinned source to try. That is a fact about those
 * two, stated here rather than hidden by a green run.
 *
 * ⭐ **`karoryfer-emilyguitar` was a third name on this list until 2026-10-03, and it did not belong there.** The
 * reading was *"its pinned source has moved and 404s while its mirror copy still answers"* — the source had not
 * moved; the address asked for the release zip's `Emilyguitar/` directory, which the repository does not have.
 * `a522f1e` removed that layer from the source address, so the guitar's program fetches **from the pin** and this
 * criterion proves it like any other. A name left here would make a working library look mirror-only.
 */
const mirrorRoot =
  process.env.GROOVE_SAMPLE_ROOT ??
  (existsSync(".env.local")
    ? (() => {
        const line = readFileSync(".env.local", "utf8")
          .split("\n")
          .find((candidate) => candidate.startsWith("VITE_SAMPLE_ROOT="));
        return line ? line.slice("VITE_SAMPLE_ROOT=".length).trim() : "";
      })()
    : "");

/** The assets with **no pinned source address at all** — no `repo`/`pin`, only a mirror-relative path. */
const MIRROR_ONLY = ["freepats-drawbar-organ", "freepats-percussive-organ"];

const absolute = (url: string): string | undefined => {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) return url;
  return mirrorRoot ? `${mirrorRoot.replace(/\/$/, "")}${url}` : undefined;
};

const fetchText = async (url: string): Promise<string> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.text();
};

interface FetchedProgram {
  assetId: string;
  /** The program text exactly as the pin served it — the half the manifest's sha256 describes. */
  raw: string;
  /** The same text with `#include`s expanded, ready for the parser. */
  expanded: string;
  url: string;
}

/** A manifest sha256 that disagreed with the fetched bytes — reported by a test rather than thrown during collection. */
const shaProblems: string[] = [];

/** Fetch, verify against the manifest, and expand one program — the loader's own address order, source then mirror. */
async function fetchProgram(assetId: string): Promise<FetchedProgram | null> {
  const asset = catalogue.assets.find((candidate) => candidate.assetId === assetId);
  if (!asset?.sfz) return null;
  const addresses = [absolute(asset.sfz.url), asset.sfz.fallbackUrl ? absolute(asset.sfz.fallbackUrl) : undefined].filter((url): url is string => url !== undefined);
  let raw: string | undefined;
  let served: string | undefined;
  for (const url of addresses) {
    try {
      raw = await fetchText(url);
      served = url;
      break;
    } catch {
      // Try the next address, exactly as the loader does; a program neither address answers is reported by the test below.
    }
  }
  if (raw === undefined || served === undefined) return null;
  const entryId = assetId.includes(":") ? assetId.slice(0, assetId.indexOf(":")) : assetId;
  const declared = shaByEntry.get(entryId)?.get(asset.sfz.path!);
  const actual = createHash("sha256").update(raw).digest("hex");
  if (declared !== undefined && declared !== actual) shaProblems.push(`${assetId}: ${served} hashes ${actual}, the manifest pins ${declared}`);
  const path = asset.sfz.path!;
  const expanded = await expandRemoteIncludes(raw, { fetchText, programUrl: path, baseUrl: served.slice(0, served.length - path.length) });
  return { assetId, raw, expanded: expanded.text, url: served };
}

const programs = await Promise.all(MEASURED_COVERAGE.map((row) => fetchProgram(row.assetId)));
const offline = programs.every((program) => program === null);
/** With no mirror root the MIRROR_ONLY assets are expected to be unreachable; with one, nothing is. */
const expectedUnreachable = mirrorRoot ? [] : MIRROR_ONLY;

describe.skipIf(offline)("the measurement still holds at the pins", () => {
  it("fetched every program it is about to prove, except the ones the mirror is the only address for", () => {
    const missing = programs.flatMap((program, index) => (program === null ? [MEASURED_COVERAGE[index].assetId] : []));
    expect(missing.sort()).toEqual([...expectedUnreachable].sort());
  });

  it("fetched the files the manifest pins, byte for byte where a sha256 is declared", () => {
    expect(shaProblems).toEqual([]);
  });

  for (const [index, row] of MEASURED_COVERAGE.entries()) {
    it(`${row.assetId} sounds exactly keys ${row.first}–${row.last}${row.holes.length ? ` minus ${row.holes.length} hole(s)` : ""}`, { timeout: 180_000 }, () => {
      const program = programs[index];
      if (program === null) return; // Named by the case above; skipped only for the mirror-only three.
      const asset = catalogue.assets.find((candidate) => candidate.assetId === row.assetId)!;
      const sounded: number[] = [];
      for (let note = 0; note <= 127; note += 1) {
        if (resolveInstrumentNote(asset, program.expanded, note).ok) sounded.push(note);
      }
      const expected: number[] = [];
      for (let note = row.first; note <= row.last; note += 1) if (!row.holes.includes(note)) expected.push(note);
      expect(sounded).toEqual(expected);
      /**
       * The holes are asserted as **refusals**, not merely as absences: the engine's own reason must name the range it
       * read, which is the sentence a report carries. (`dsmolken-double-bass` is the reason this matters — its printed
       * span is 12–120 and eleven of those keys have no sample at all.)
       */
      for (const hole of row.holes) {
        const answer = resolveInstrumentNote(asset, program.expanded, hole);
        expect(answer.ok, `key ${hole} was expected to have no playback in ${row.assetId}`).toBe(false);
        expect(answer.reason).toMatch(/no playback/);
      }
    });
  }

  it("⭐ every written note of every pick_bass lane now resolves at the velocity its own step writes", { timeout: 180_000 }, () => {
    /**
     * The offline census compares against a measured key set; this case asks the engine directly, per note, at the
     * lane's own velocity — the same call `createSampleLoader.loadNote` makes. It is the criterion for the 2026-10-03
     * swap: the lane that was **silent** (`post-punk` bass, twelve notes at 50/53/55) and the **eight
     * partially-silent** lanes `docs/SAMPLED_RANGE_COVERAGE.md` §8.5(b) named must each resolve **every** note, so a
     * revert to the 26–46 recording turns this red rather than leaving a summary that agrees with itself. All sixteen
     * `pick_bass` lanes are asked, including the seven that already sounded, because a swap that broke one of those
     * would otherwise pass unnoticed.
     */
    const lanes = CENSUS.filter((lane) => lane.instrument === "pick_bass");
    expect(lanes.length, "sixteen lanes play pick_bass, and this criterion is about all of them").toBe(16);
    expect(new Set(lanes.map((lane) => lane.assetId))).toEqual(new Set([PICK_BASS_AFTER]));
    const index = MEASURED_COVERAGE.findIndex((row) => row.assetId === PICK_BASS_AFTER);
    const program = programs[index];
    if (program === null || program === undefined) throw new Error(`${PICK_BASS_AFTER} did not fetch, so the swap could not be re-proved`);
    let checked = 0;
    let refused = 0;
    for (const lane of lanes) {
      const asset = catalogue.assets.find((candidate) => candidate.assetId === lane.assetId)!;
      const genre = ALL_GENRES.find((candidate) => candidate.id === lane.genreId)!;
      const track = patternFromGenre(genre).tracks[lane.trackIndex];
      const notes = writtenNotes(track);
      expect(notes.length).toBe(lane.noteCount);
      for (const note of notes) {
        checked += 1;
        if (!resolveInstrumentNote(asset, program.expanded, note.pitch, { velocity: note.velocity }).ok) refused += 1;
      }
    }
    // 250 is the number of written notes the sixteen lanes carry; zero of them are refused.
    expect({ checked, refused }).toEqual({ checked: 250, refused: 0 });
  });
});
