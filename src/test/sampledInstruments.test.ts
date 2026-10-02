/**
 * The recorded-instrument table — the criterion for the one thing that has to be right about it.
 *
 * Three properties, and each is a way the feature fails silently rather than loudly:
 *
 *   1. **Totality.** Every instrument name the genre data writes is *classified*: mapped to a recording, recorded as a
 *      gap, or recorded as a synthesiser. Without this, "we never mapped it" and "it is a synthesiser" are the same
 *      absence in the data, and a mapped instrument can stay unmapped for a year with nothing going red.
 *   2. **Exactness.** The lookup is an exact match on the whole name. A substring or case-insensitive match would answer
 *      "the piano" for names that are not a piano, which is the failure the table exists to prevent.
 *   3. **Reality.** Every `assetId` a row names is declared in the manifest the app ships. A row pointing at an asset
 *      nobody mirrored is a mapping that silently never fires.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  SAMPLED_INSTRUMENTS,
  SAMPLED_INSTRUMENT_GAPS,
  SAMPLED_INSTRUMENT_SYNTHS,
  SAMPLED_ROLES,
  sampledAssetForLane,
  sampledInstrumentFor,
  sampledInstrumentGap,
  sampledInstrumentGapReason,
} from "../data/sampledInstruments";
import { ALL_GENRES } from "../data/genres/index";
import { catalogueFromManifestText } from "../data/sampleCatalogue";

/** The catalogue the app ships — read from the same manifest `list_arrangement_instruments` reads. */
function shippedCatalogue() {
  const text = readFileSync("public/samples/manifest.json", "utf8");
  return catalogueFromManifestText(text, "").assets;
}

/** Every `track.instrument` string the fifteen genre families write. */
function genreInstrumentNames(): string[] {
  const names = new Set<string>();
  for (const genre of ALL_GENRES) {
    for (const track of genre.sequencer_pattern.tracks) names.add(track.instrument);
  }
  return [...names].sort();
}

describe("the recorded-instrument table", () => {
  it("classifies every instrument name the genre data writes, so none is silently unmapped", () => {
    const classified = new Set<string>([
      ...SAMPLED_INSTRUMENTS.map((choice) => choice.instrument),
      ...Object.keys(SAMPLED_INSTRUMENT_GAPS),
      ...SAMPLED_INSTRUMENT_SYNTHS,
    ]);
    const unclassified = genreInstrumentNames().filter((name) => !classified.has(name));
    expect(unclassified, `these genre instrument names are neither mapped, nor a recorded gap, nor recorded as a synthesiser: ${unclassified.join(", ")}`).toEqual([]);
  });

  it("does not classify the same name twice, which would make the three lists disagree", () => {
    const mapped = SAMPLED_INSTRUMENTS.map((choice) => choice.instrument);
    const gaps = Object.keys(SAMPLED_INSTRUMENT_GAPS);
    const overlap = mapped.filter((name) => gaps.includes(name) || SAMPLED_INSTRUMENT_SYNTHS.includes(name));
    expect(overlap).toEqual([]);
    const gapOverlap = gaps.filter((name) => SAMPLED_INSTRUMENT_SYNTHS.includes(name));
    expect(gapOverlap).toEqual([]);
    expect(new Set(mapped).size).toBe(mapped.length);
  });

  it("names a catalogue asset that the shipped manifest actually declares", () => {
    const known = new Set(shippedCatalogue().map((asset) => asset.assetId));
    const missing = SAMPLED_INSTRUMENTS.filter((choice) => !known.has(choice.assetId)).map((choice) => `${choice.instrument} → ${choice.assetId}`);
    expect(missing, `these rows name assets the shipped manifest does not declare: ${missing.join(", ")}`).toEqual([]);
  });

  it("matches the whole name exactly, and never a prefix, a case variant or a synonym", () => {
    // The owner's examples, by their names in the genre data.
    expect(sampledInstrumentFor("piano_lead")?.assetId).toBe("salamander-grand");
    expect(sampledInstrumentFor("walking_upright")?.assetId).toBe("karoryfer-meatbass:pizz-basic");
    expect(sampledInstrumentFor("strings_lead")?.assetId).toBe("vsco2ce:ViolinEnsSusVib");
    // And the answers a guessing matcher would give, which must be `undefined`.
    expect(sampledInstrumentFor("piano")).toBeUndefined();
    expect(sampledInstrumentFor("Piano_Lead")).toBeUndefined();
    expect(sampledInstrumentFor("piano_lead_2")).toBeUndefined();
    expect(sampledInstrumentFor("strings")).toBeUndefined();
    expect(sampledInstrumentFor("bass")).toBeUndefined();
    expect(sampledInstrumentFor("钢琴")).toBeUndefined();
    expect(sampledInstrumentFor(undefined)).toBeUndefined();
    // Surrounding whitespace is trimmed, because that is a spelling of the same name rather than a different one.
    expect(sampledInstrumentFor("  piano_lead  ")?.assetId).toBe("salamander-grand");
  });

  it("applies to the melodic roles only, so a drum lane cannot become one recorded note", () => {
    expect(SAMPLED_ROLES).toEqual(["bass", "chords", "lead"]);
    expect(sampledAssetForLane({ track_id: "chords", instrument: "piano_lead" })).toBe("salamander-grand");
    expect(sampledAssetForLane({ track_id: "lead", instrument: "strings_lead" })).toBe("vsco2ce:ViolinEnsSusVib");
    expect(sampledAssetForLane({ track_id: "bass", instrument: "walking_upright" })).toBe("karoryfer-meatbass:pizz-basic");
    expect(sampledAssetForLane({ track_id: "kick", instrument: "piano_lead" })).toBeUndefined();
    expect(sampledAssetForLane({ track_id: "fx", instrument: "piano_lead" })).toBeUndefined();
  });

  it("believes a lane's own asset over its name, which is what a v2 sampler compiles to", () => {
    expect(sampledAssetForLane({ track_id: "audio", sample: { assetId: "vcsl:Marimba" } })).toBe("vcsl:Marimba");
    expect(sampledAssetForLane({ track_id: "chords", instrument: "piano_lead", sample: { assetId: "vcsl:Marimba" } })).toBe("vcsl:Marimba");
    // A drum lane that carries an asset is the contradiction `sampleReferenceProblem` refuses, not a mapping.
    expect(sampledAssetForLane({ track_id: "snare", sample: { assetId: "vcsl:Marimba" } })).toBeUndefined();
  });

  it("says why a lane keeps its synthesiser, and stays quiet about a synthesiser by definition", () => {
    const catalogue = shippedCatalogue();
    // A stated gap: a real instrument the mirrored libraries do not carry — the two left after the 2026-10-03 round.
    expect(sampledInstrumentGapReason("pan_flute")).toMatch(/pan flute/);
    expect(sampledInstrumentGap({ track_id: "chords", instrument: "pan_flute" }, catalogue)).toMatch(/no catalogue recording is mapped/);
    expect(sampledInstrumentGap({ track_id: "bass", instrument: "slap_bass" }, catalogue)).toMatch(/electric bass/);
    // ⭐ The names this round filled: each was a gap and now resolves to the recording that was mirrored for it. Asserted one by one because a mapping row is the
    // judgement this whole file exists to record, and "a gap quietly became a row" and "a row quietly became a gap" look the same in a diff of two lists.
    for (const [instrument, assetId] of [
      ["rhodes_ep", "jlearman-jrhodes3c:jRhodes-both-looped"],
      ["m1_organ", "freepats-drawbar-organ"],
      ["organ_lead", "freepats-percussive-organ"],
      ["pick_bass", "freepats-electric-bass-yr:PickedBassYR-20190930"],
      ["finger_bass", "karoryfer-black-and-blue-basses:05-darkblack-pluck"],
      ["distorted_guitar", "freepats-fsbs-dist2"],
      ["pluck_string", "freepats-spanish-classical-guitar"],
      ["brass_section", "sonatina-brass:All-Brass-Sustain"],
      ["accordion_lead", "freepats-button-accordion-hn"],
      ["sitar_lead", "discord-gm-sitar:105-Sitar"],
      ["bell_lead", "vcsl:Tubular-Bells-1"],
    ] as const) {
      expect(sampledInstrumentGapReason(instrument), `${instrument} must no longer be a stated gap`).toBeUndefined();
      expect(sampledInstrumentGap({ track_id: "lead", instrument }, catalogue), `${instrument} must be served by ${assetId}`).toBeUndefined();
      expect(sampledInstrumentFor(instrument)?.assetId, `${instrument} must map to ${assetId}`).toBe(assetId);
    }
    // A synthesiser: not a gap, and reporting it would drown the real gaps in noise.
    expect(sampledInstrumentGapReason("warm_pad")).toBeUndefined();
    expect(sampledInstrumentGap({ track_id: "chords", instrument: "warm_pad" }, catalogue)).toBeUndefined();
    expect(sampledInstrumentGap({ track_id: "lead", instrument: "saw_lead" }, catalogue)).toBeUndefined();
    // A drum lane is a physical model, not a gap.
    expect(sampledInstrumentGap({ track_id: "kick", instrument: "acoustic_kick" }, catalogue)).toBeUndefined();
    // Mapped and served: nothing to say.
    expect(sampledInstrumentGap({ track_id: "chords", instrument: "piano_lead" }, catalogue)).toBeUndefined();
    // Mapped but not served: the second half of the owner's rule, said out loud.
    expect(sampledInstrumentGap({ track_id: "chords", instrument: "piano_lead" }, [])).toMatch(/no configured sample mirror serves/);
  });
});
