/**
 * **The palette-wiring criteria — the rows this round moved, and the rows it must never move.**
 *
 * The recorded-instrument table (`src/data/sampledInstruments.ts`) is a set of *judgements that were made and can be
 * reviewed*, one row per written instrument name. `src/test/sampledInstruments.test.ts` pins the table's three
 * invariants — totality, exactness, reality — and this file pins the judgements of the 2026-10-03 wiring round:
 *
 *   1. **The rows that were moved name the library they were moved to, and that asset is really in the shipped
 *      manifest.** A "swap" that names an asset nobody mirrored is a mapping that silently never fires, and a row
 *      that was quietly reverted is a library that went back to being unreachable from any genre.
 *   2. **The rows that were deliberately *not* moved still name the library they named.** These are the rows where
 *      the new libraries hold a *different instrument* — a solo cello for a string ensemble, a steel drum for a bell,
 *      a vibraphone or a marimba, an electric piano that is not a Rhodes, an upright bass for an electric one — so
 *      "close enough" would be a claim about a composer's music that nobody made. The forbidden libraries are
 *      additionally asserted to appear in **no** row at all, which is the stronger form of the same rule: a library
 *      whose instrument is not one of the sixty-one names cannot be hard-seated anywhere by a later round.
 *   3. **The partition is unchanged.** Twenty-two written names are mapped, thirty-seven are synthesisers by
 *      definition, two are stated gaps, and those are sixty-one **distinct names** — counted by name, never by row,
 *      because `ALL_SAMPLED_INSTRUMENTS` also carries the derived string-technique identities and a row count is not
 *      a name count. (The 2026-10-03 round measured that derived list at 26 rows, so the table is 22 + 26 = 48
 *      rows today, not the 22 + 3 = 25 a hand-count guessed; the comment in `sampledInstruments.ts` already said
 *      "all 26 rows today". This criterion asserts the **relationship**, so a change to the derived half cannot
 *      masquerade as a change to the partition.)
 *
 * The discipline behind every row is the one the table's own doc comment states: the lookup is an exact match on the
 * whole name, and "a wrong instrument is worse than a synthesiser". Nothing in this round was decided by listening;
 * each row cites a checkable fact — the library's own program table, its README, its licence, or an opcode the loader
 * does or does not implement.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  ALL_SAMPLED_INSTRUMENTS,
  SAMPLED_INSTRUMENTS,
  SAMPLED_INSTRUMENT_GAPS,
  SAMPLED_INSTRUMENT_SYNTHS,
  SAMPLED_TECHNIQUE_INSTRUMENTS,
  sampledAssetForLane,
  sampledInstrumentFor,
} from "../data/sampledInstruments";
import { ALL_GENRES } from "../data/genres/index";
import { catalogueFromManifestText } from "../data/sampleCatalogue";

/** The catalogue the app ships — read from the same manifest `list_arrangement_instruments` reads. */
function shippedCatalogue() {
  const text = readFileSync("public/samples/manifest.json", "utf8");
  return catalogueFromManifestText(text, "").assets;
}

/** Every `track.instrument` string the fifteen genre families write, by distinct name. */
function genreInstrumentNames(): string[] {
  const names = new Set<string>();
  for (const genre of ALL_GENRES) {
    for (const track of genre.sequencer_pattern.tracks) names.add(track.instrument);
  }
  return [...names].sort();
}

/**
 * The rows this round **moved**, with the library each must now name and the asset each used to name.
 *
 * `oldAssetId` is carried so the criterion fails if a later round reverts the row *and* so a reviewer can see what
 * was replaced without reading the git history.
 */
const MOVED_ROWS = [
  {
    instrument: "sax_lead",
    library: "mtg-solo-sax",
    assetId: "mtg-solo-sax:MTG-Tenor-Sax",
    oldAssetId: "vcsl:Tenor-Saxophone-Keyswitch",
  },
  {
    instrument: "walking_upright",
    library: "dsmolken-double-bass",
    assetId: "dsmolken-double-bass:d-smolken-rubner-bass-pizz",
    oldAssetId: "karoryfer-meatbass:pizz-basic",
  },
] as const;

/**
 * The rows this round **refused to move**, and the exact asset each must still name.
 *
 * Three groups, and the reason is written per group rather than per row:
 *
 *  * `strings_lead` is a **string ensemble**; `karoryfer-bigcat-cello` is a **solo cello**. One player is not a
 *    section, and the section's recording is the one the row's own reason names.
 *  * `bell_lead` / `vibraphone` / `marimba_lead` are three different instruments, and `jlearman-steel-drum` is a
 *    fourth. A steel drum is not a bell patch, a vibraphone or a marimba.
 *  * `rhodes_ep` means a **Fender Rhodes**; the candidate this round weighed and refused held a Yamaha CP80, a Hohner
 *    Pianet T and a Wurlitzer EP200 — none is a Rhodes, and **the judgement outlives the library** (it has since left the mirror); `finger_bass` and `pick_bass` are **electric** basses and
 *    `dsmolken-double-bass` is an upright double bass; `flute_lead`'s reason asks for a sustained flute *with the
 *    vibrato a lead line wants*, and Ixox Flute's vibrato is a modwheel LFO (`pitchlfo_depth_oncc1`) this loader does
 *    not implement, so it would answer without the vibrato the recorded `FluteSusVib` program has.
 */
const HELD_ROWS = [
  { instrument: "strings_lead", assetId: "vsco2ce:ViolinEnsSusVib" },
  { instrument: "bell_lead", assetId: "vcsl:Tubular-Bells-1" },
  { instrument: "vibraphone", assetId: "vcsl:Vibraphone-Keyswitch" },
  { instrument: "marimba_lead", assetId: "vcsl:Marimba" },
  { instrument: "rhodes_ep", assetId: "jlearman-jrhodes3c:jRhodes-both-looped" },
  { instrument: "finger_bass", assetId: "karoryfer-black-and-blue-basses:05-darkblack-pluck" },
  { instrument: "pick_bass", assetId: "freepats-electric-bass-yr:PickedBassYR-20190930" },
  { instrument: "flute_lead", assetId: "vsco2ce:FluteSusVib" },
] as const;

/**
 * Libraries whose instrument is **not one of the sixty-one written names**, so no row may name them.
 *
 * Each is a real, good library that this round mirrored; none of them can be *approximated onto* a name, which is
 * the discipline "a name that is not in the table is not approximated". Listing it here means a future round cannot
 * quietly seat one of them on a row by resemblance.
 */
const FOREIGN_LIBRARIES = [
  "karoryfer-bigcat-cello", // a solo cello, not the string ensemble
  "jlearman-steel-drum", // a steel drum, not a bell, a vibraphone or a marimba
  "cithara-barbarica",
  "hungarian-zither",
  "ganjo",
  "aliexpress-erhu",
  "karoryfer-cowsynth",
  "karoryfer-squidpipes",
  "karoryfer-272-merry-orks",
  "karoryfer-bear-sax",
  // Drum kits, which are served by the role map in `src/audio/drumRoles.ts` and never by a melodic row.
  "karoryfer-big-rusty-drums",
  "body-percussion",
] as const;

/** The library id an asset id names: everything before the first colon, or the whole id for a bare entry. */
function libraryOf(assetId: string): string {
  return assetId.includes(":") ? assetId.split(":")[0]! : assetId;
}

describe("the palette row each of the seventeen new libraries was wired into", () => {
  it("moves the two rows onto the library they were moved to, and nowhere else", () => {
    for (const row of MOVED_ROWS) {
      const chosen = sampledInstrumentFor(row.instrument);
      expect(chosen, `${row.instrument} must still have a row`).toBeDefined();
      expect(chosen?.assetId, `${row.instrument} must name ${row.assetId}`).toBe(row.assetId);
      expect(chosen?.assetId, `${row.instrument} must not be back on ${row.oldAssetId}`).not.toBe(row.oldAssetId);
      expect(libraryOf(chosen!.assetId), `${row.instrument} must point into ${row.library}`).toBe(row.library);
    }
  });

  it("reaches the moved asset through the one entry point the engine consults, not only through the table", () => {
    // A row that `sampledInstrumentFor` can find but `sampledAssetForLane` does not return is a mapping no lane plays.
    expect(sampledAssetForLane({ track_id: "lead", instrument: "sax_lead" })).toBe("mtg-solo-sax:MTG-Tenor-Sax");
    expect(sampledAssetForLane({ track_id: "bass", instrument: "walking_upright" })).toBe(
      "dsmolken-double-bass:d-smolken-rubner-bass-pizz"
    );
  });

  it("names an asset the shipped manifest really declares, so the row cannot silently never fire", () => {
    const known = new Set(shippedCatalogue().map((asset) => asset.assetId));
    for (const row of MOVED_ROWS) {
      expect(known.has(row.assetId), `${row.instrument} → ${row.assetId} is not declared by the shipped manifest`).toBe(true);
    }
  });

  it("leaves every deliberate non-move on the library it named, whatever the new catalogue offers", () => {
    for (const row of HELD_ROWS) {
      expect(sampledInstrumentFor(row.instrument)?.assetId, `${row.instrument} must stay on ${row.assetId}`).toBe(row.assetId);
    }
    // The two rows the round *declared* moved are the only rows whose library changed.
    const held = new Set<string>(HELD_ROWS.map((row) => row.instrument));
    for (const moved of MOVED_ROWS) expect(held.has(moved.instrument)).toBe(false);
  });

  it("seats none of the libraries whose instrument is not a written name, on any row", () => {
    const forbidden = new Set<string>(FOREIGN_LIBRARIES);
    const offenders = SAMPLED_INSTRUMENTS.filter((row) => forbidden.has(libraryOf(row.assetId))).map(
      (row) => `${row.instrument} → ${row.assetId}`
    );
    expect(
      offenders,
      `these rows approximate a written name with a different instrument: ${offenders.join(", ")}`
    ).toEqual([]);
  });

  it("keeps the 22 / 37 / 2 partition of the sixty-one distinct names, counted by name and not by row", () => {
    const names = genreInstrumentNames();
    expect(names.length, "the genre data must still write sixty-one distinct instrument names").toBe(61);
    expect(SAMPLED_INSTRUMENTS.length, "twenty-two written names are mapped to a recording").toBe(22);
    expect(Object.keys(SAMPLED_INSTRUMENT_GAPS).length, "two names are stated gaps").toBe(2);
    expect(SAMPLED_INSTRUMENT_SYNTHS.length, "thirty-seven names are synthesisers by definition").toBe(37);
    // Totality: every written name is in exactly one of the three lists, and nothing in them is not written.
    const classified = new Set<string>([
      ...SAMPLED_INSTRUMENTS.map((row) => row.instrument),
      ...Object.keys(SAMPLED_INSTRUMENT_GAPS),
      ...SAMPLED_INSTRUMENT_SYNTHS,
    ]);
    expect(names.filter((name) => !classified.has(name))).toEqual([]);
    expect(classified.size).toBe(61);
    // The derived technique identities are extra *rows* over the same names, never extra names: this is the
    // relationship the 22 + 3 = 25 hand-count got wrong.
    expect(ALL_SAMPLED_INSTRUMENTS.length).toBe(SAMPLED_INSTRUMENTS.length + SAMPLED_TECHNIQUE_INSTRUMENTS.length);
    expect(SAMPLED_TECHNIQUE_INSTRUMENTS.length).toBeGreaterThan(0);
  });
});
