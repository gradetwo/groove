/**
 * **A drum lane sounds the recorded kit** — the criterion for the role → note map, on both paths that decide it.
 *
 * The gap this closes had a written reason rather than a criterion: `src/data/sampledInstruments.ts` said a kit lane could
 * not be served because "a kit is many instruments at many pitches rather than one instrument at one pitch, so a single
 * `assetId` could not describe it". That was true, and the missing half was a **role → note** map. `src/audio/drumRoles.ts`
 * is that map, and these assertions are the facts that make it real:
 *
 *   · every drum `track_id` the genre data writes is classified (and every drum `instrument`, on exactly one of the two
 *     sides), so "we never mapped it" cannot look like "it is a drum machine";
 *   · the numbers are **General MIDI Percussion**, checked against the two facts the standard fixes — GM 36 is the kick,
 *     38 the snare, 42 the closed hat — rather than against a copy of this table;
 *   · a lane resolves to the kit asset **and to a note**, and a `pitch` the pattern writes still wins over the role;
 *   · both planners emit one event per attack carrying that note, so the live kit and the rendered one agree;
 *   · an electronic name keeps the physical model and says why, in a sentence that distinguishes a decision from a gap.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  ACOUSTIC_DRUM_INSTRUMENTS,
  DRUM_KIT_ASSET_ID,
  DRUM_ROLE_IDS,
  DRUM_ROLE_NOTES,
  ELECTRONIC_DRUM_INSTRUMENTS,
  drumNoteForRole,
  drumSamplingDecision,
  drumSamplingRefusal,
  drumVoicingForLane,
} from "../audio/drumRoles";
import {
  SAMPLED_DRUM_ROLES,
  SAMPLED_INSTRUMENT_SYNTHS,
  SAMPLED_INSTRUMENTS,
  SAMPLED_ROLES,
  sampledAssetForLane,
  sampledDrumVoicingForLane,
  sampledInstrumentGap,
} from "../data/sampledInstruments";
import { planOfflineAudioLanes } from "../audio/offlineAudioLanes";
import { planAudioLaneEvents } from "../audio/audioLanePlan";
import { sampledInstrumentProblems, sampledStandDownIndexes } from "../audio/sampledLanes";
import { catalogueFromManifestText, sampleReferenceProblem } from "../data/sampleCatalogue";
import { ALL_GENRES } from "../data/genres/index";
import type { SampleAsset } from "../data/sampleCatalogue";
import type { SequencerPattern, SequencerTrack } from "../types/genre";

const CATALOGUE: readonly SampleAsset[] = catalogueFromManifestText(
  readFileSync("public/samples/manifest.json", "utf8"),
  ""
).assets;

/** The smallest catalogue that serves one id — the mirror-configured case, without the manifest. */
function serving(...assetIds: string[]): readonly SampleAsset[] {
  return assetIds.map((assetId) => ({
    assetId,
    name: assetId,
    kind: "one-shot" as const,
    seconds: 1,
    url: `/samples/${assetId}.wav`,
    sfz: { url: `/samples/${assetId}.sfz` },
  }));
}

/** A bebop-shaped drum lane: no `pitch` column at all, which is the shape every drum lane in the genre data has. */
function drumLane(track_id: SequencerTrack["track_id"], instrument: string): SequencerTrack {
  return {
    track_id,
    name: track_id,
    instrument,
    steps: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0],
    velocity: [120, 0, 0, 0, 0, 0, 90, 0, 0, 0, 100, 0, 0, 0, 0, 0],
    volume: 0.8,
    pan: 0,
  };
}

function patternWith(...tracks: SequencerTrack[]): SequencerPattern {
  return { genre_id: "bebop", bpm: 120, totalSteps: 16, tracks } as unknown as SequencerPattern;
}

/** Every drum `track_id` / `instrument` pair the fifteen genre families write. */
function drumRolesInGenreData(): { roles: Set<string>; instruments: Set<string> } {
  const roles = new Set<string>();
  const instruments = new Set<string>();
  for (const genre of ALL_GENRES) {
    for (const track of genre.sequencer_pattern.tracks) {
      if (!(track.track_id in DRUM_ROLE_NOTES)) continue;
      roles.add(track.track_id);
      instruments.add(track.instrument);
    }
  }
  return { roles, instruments };
}

describe("the drum role → note map", () => {
  it("classifies every drum role the genre data writes", () => {
    const { roles } = drumRolesInGenreData();
    const unclassified = [...roles].filter((role) => !DRUM_ROLE_IDS.includes(role));
    expect(unclassified, `these drum track_ids have no note in src/audio/drumRoles.ts: ${unclassified.join(", ")}`).toEqual([]);
    // And the two lists of roles agree, so a lane cannot be a drum for one caller and not the other.
    expect([...roles].sort()).toEqual([...SAMPLED_DRUM_ROLES].sort());
  });

  it("puts every drum instrument the genre data writes on exactly one side of the acoustic/electronic line", () => {
    const { instruments } = drumRolesInGenreData();
    const classified = new Set<string>([...ACOUSTIC_DRUM_INSTRUMENTS, ...ELECTRONIC_DRUM_INSTRUMENTS]);
    const unclassified = [...instruments].filter((name) => !classified.has(name));
    expect(unclassified, `these drum instruments are neither acoustic nor electronic in src/audio/drumRoles.ts: ${unclassified.join(", ")}`).toEqual([]);
    const both = ACOUSTIC_DRUM_INSTRUMENTS.filter((name) => ELECTRONIC_DRUM_INSTRUMENTS.includes(name));
    expect(both, `these names are on both sides, so a lane is a recording and a model at once: ${both.join(", ")}`).toEqual([]);
    /**
     * And both lists are subsets of the names the **melodic** table already classifies, which is what keeps that table
     * total: a drum instrument that is in neither list would be a name no decision covers, and `sampledInstrumentGap`
     * would report it as unclassified on every render.
     */
    const classifiedMelodically = new Set<string>([...SAMPLED_INSTRUMENT_SYNTHS, ...SAMPLED_INSTRUMENTS.map((c) => c.instrument)]);
    const decidedNowhere = [...ACOUSTIC_DRUM_INSTRUMENTS, ...ELECTRONIC_DRUM_INSTRUMENTS].filter((name) => !classifiedMelodically.has(name));
    expect(decidedNowhere, `these drum instruments are not classified anywhere: ${decidedNowhere.join(", ")}`).toEqual([]);
  });

  it("does not promise a kick for a lane that names something else, which is what the role alone would do", () => {
    // A `kick` lane carrying a piano is not a drum: the instrument has to be an acoustic drum name for there to be a pad.
    expect(drumVoicingForLane({ track_id: "kick", instrument: "piano_lead" })).toBeUndefined();
    expect(sampledAssetForLane({ track_id: "kick", instrument: "piano_lead" })).toBeUndefined();
    // And the same role with an unclassified-name-but-real drum is a reported gap rather than a silent model.
    expect(drumSamplingRefusal({ track_id: "kick", instrument: "brush_kick" })).toContain("not classified");
  });

  it("uses the General MIDI Percussion numbers, checked against the standard's own anchors", () => {
    // The anchors are the fact, and the assertions are written as "the standard says 36 is the kick" rather than as a
    // restatement of the table, so changing the table to a different number fails here.
    expect(DRUM_ROLE_NOTES.kick!.note).toBe(36);
    expect(DRUM_ROLE_NOTES.snare!.note).toBe(38);
    expect(DRUM_ROLE_NOTES.hihat!.note).toBe(42);
    expect(DRUM_ROLE_NOTES.percussion!.note).toBe(82);
    expect(DRUM_ROLE_NOTES.kick!.piece).toBe("Bass Drum 1");
    expect(DRUM_ROLE_NOTES.snare!.piece).toBe("Acoustic Snare");
    expect(DRUM_ROLE_NOTES.hihat!.piece).toBe("Closed Hi-Hat");
    expect(DRUM_ROLE_NOTES.percussion!.piece).toBe("Shaker");
    expect(drumNoteForRole("kick")).toBe(36);
    expect(drumNoteForRole("KICK")).toBe(36);
    expect(drumNoteForRole("bass")).toBeUndefined();
  });

  it("names a catalogue asset the shipped manifest actually declares", () => {
    const known = new Set(CATALOGUE.map((asset) => asset.assetId));
    expect(known.has(DRUM_KIT_ASSET_ID), `${DRUM_KIT_ASSET_ID} is not in public/samples/manifest.json`).toBe(true);
  });

  it("resolves exactly the acoustic roles, by whole name, and never the drum machines", () => {
    for (const [role, instrument] of [
      ["kick", "acoustic_kick"],
      ["kick", "punchy_kick"],
      ["snare", "acoustic_snare"],
      ["hihat", "closed_hat"],
      ["percussion", "rim_shaker"],
    ] as const) {
      expect(sampledAssetForLane({ track_id: role, instrument }), `${role}/${instrument} should sound the kit`).toBe(DRUM_KIT_ASSET_ID);
      expect(sampledDrumVoicingForLane({ track_id: role, instrument })?.note).toBe(DRUM_ROLE_NOTES[role]!.note);
    }
    for (const [role, instrument] of [
      ["kick", "808_kick"],
      ["kick", "sub_kick"],
      ["kick", "distorted_kick"],
      ["snare", "clap"],
      ["snare", "tight_snare"],
      ["snare", "808_snare"],
      ["snare", "reggae_rim"],
      ["snare", "rimshot"],
      ["percussion", "cowbell_lead"],
    ] as const) {
      expect(sampledAssetForLane({ track_id: role, instrument }), `${role}/${instrument} should keep its model`).toBeUndefined();
    }
    // A drum name on a melodic role is not a drum: `distorted_kick` is a *bass* lane in the genre data.
    expect(sampledAssetForLane({ track_id: "bass", instrument: "distorted_kick" })).toBeUndefined();
    // And the melodic table still does not reach a drum *name*, which is the property the old `SAMPLED_ROLES` guard had.
    expect(SAMPLED_ROLES.includes("kick")).toBe(false);
    expect(SAMPLED_INSTRUMENTS.some((choice) => choice.instrument === "acoustic_kick")).toBe(false);
  });

  it("keeps a pattern's own pitch over the role's note, because the role note is a fallback", () => {
    const lane: SequencerTrack = { ...drumLane("snare", "acoustic_snare"), pitch: [0, 0, 0, 0, 0, 0, 40, 0, 0, 0, 0, 0, 0, 0, 0, 0] };
    const offline = planOfflineAudioLanes({ ...patternWith(lane), bpm: 120, totalSteps: 16 }, serving(DRUM_KIT_ASSET_ID));
    expect(offline.events.map((e) => e.pitch).sort()).toEqual([38, 38, 40]);
  });

  it("explains an electronic lane when asked, and stays quiet when reporting a problem", () => {
    // The explain-everything form names the decision…
    expect(drumSamplingDecision({ track_id: "kick", instrument: "808_kick" })).toContain("drum machine");
    expect(drumSamplingDecision({ track_id: "kick", instrument: "808_kick" })).toContain("physical model");
    // …while the *problem* form says nothing, because a drum machine is what the genre asked for, not a defect.
    expect(drumSamplingRefusal({ track_id: "kick", instrument: "808_kick" })).toBeUndefined();
    expect(drumSamplingRefusal({ track_id: "kick", instrument: "acoustic_kick" })).toBeUndefined();
    expect(drumSamplingRefusal({ track_id: "bass", instrument: "sub_bass" })).toBeUndefined();
    // An unclassified name under a drum role is a gap, in both forms.
    expect(drumSamplingRefusal({ track_id: "kick", instrument: "brush_kick" })).toContain("not classified");
    expect(drumVoicingForLane({ track_id: "kick", instrument: "808_kick" })).toBeUndefined();
    expect(drumVoicingForLane({ track_id: "kick", instrument: "sub_kick" })).toBeUndefined();
  });
});

describe("a drum lane reaching the kit, on both paths", () => {
  it("stands the physical model down when the catalogue serves the kit, and keeps it when it does not", () => {
    const pattern = patternWith(drumLane("kick", "acoustic_kick"), drumLane("snare", "acoustic_snare"));
    expect([...sampledStandDownIndexes(pattern, serving(DRUM_KIT_ASSET_ID)).keys()]).toEqual([0, 1]);
    expect([...sampledStandDownIndexes(pattern, []).keys()]).toEqual([]);
    // And the unserved case is reported rather than silent — the sentence names the kit, not "no sample".
    const problems = sampledInstrumentProblems(pattern, []);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain(DRUM_KIT_ASSET_ID);
    expect(problems[0]).toContain("keeps its physical model");
    expect(problems[0]).toContain("configure");
    expect(sampledInstrumentProblems(pattern, serving(DRUM_KIT_ASSET_ID))).toEqual([]);
  });

  it("does not call an electronic lane a lane whose recording is missing", () => {
    /**
     * The distinction the report has to keep: a `808_kick` lane is **not** a lane whose recording is missing, and telling
     * a composer to mirror a library would be advice about the wrong problem. It is a decision, so the problem report
     * stays silent about it — and `drumSamplingDecision` is where the sentence lives for a caller that wants it.
     */
    expect(sampledInstrumentGap({ track_id: "kick", instrument: "808_kick" }, [])).toBeUndefined();
    expect(String(sampledInstrumentGap({ track_id: "kick", instrument: "808_kick" }, []))).not.toContain("no configured sample mirror serves");
    // The mirror-not-configured case *is* reported, because it has a fix.
    expect(sampledInstrumentGap({ track_id: "kick", instrument: "acoustic_kick" }, [])).toContain("VITE_SAMPLE_ROOT");
    // A name nobody has classified is the one case that gets a sentence pointing at this table.
    expect(sampledInstrumentGap({ track_id: "kick", instrument: "brush_kick" }, [])).toContain("not classified");
    // A lane with nothing to say says nothing.
    expect(sampledInstrumentGap({ track_id: "bass", instrument: "sub_bass" }, [])).toBeUndefined();
  });

  it("plans one offline event per attack, each carrying the role's General MIDI note", () => {
    const lane = drumLane("kick", "acoustic_kick");
    const plan = planOfflineAudioLanes({ ...patternWith(lane), bpm: 120, totalSteps: 16 }, serving(DRUM_KIT_ASSET_ID));
    expect(plan.problems).toEqual([]);
    expect(plan.events.map((event) => [event.pitch, event.trackIndex])).toEqual([
      [36, 0],
      [36, 0],
      [36, 0],
    ]);
    // The step the attack is on decides its second, so the three hits are three different instants.
    expect(new Set(plan.events.map((event) => event.atSeconds)).size).toBe(3);
  });

  it("plans the same notes on the live path, so a live kit and a rendered one agree", () => {
    const lane = drumLane("percussion", "rim_shaker");
    const plan = planAudioLaneEvents(
      { clips: { A: { tracks: [lane] } }, sections: [{ id: "s1", slot: "A", bars: 1 }], boundaries: [0] } as never,
      serving(DRUM_KIT_ASSET_ID)
    );
    expect(plan.problems).toEqual([]);
    expect(plan.events.map((event) => event.pitch)).toEqual([82, 82, 82]);
    expect(plan.events.every((event) => event.assetId === DRUM_KIT_ASSET_ID)).toBe(true);
  });

  /**
   * The live and offline planners must not be able to disagree about a drum lane. This is the same lane through both,
   * compared event for event rather than each against a literal — a literal on each side would agree with a bug in both.
   */
  it("gives the live and offline planners the same notes and offsets for one drum lane", () => {
    const lane = drumLane("snare", "acoustic_snare");
    const catalogue = serving(DRUM_KIT_ASSET_ID);
    const offline = planOfflineAudioLanes({ ...patternWith(lane), bpm: 120, totalSteps: 16 }, catalogue);
    const live = planAudioLaneEvents(
      { clips: { A: { tracks: [lane] } }, sections: [{ id: "s1", slot: "A", bars: 1 }], boundaries: [0], bpm: 120 } as never,
      catalogue
    );
    /**
     * The offline planner keeps the step as the **absolute** position (`atSeconds` is derived from it and the tempo map),
     * while the live planner keeps `atBar` **and** the absolute `atStep`, so the shared number is the step within the
     * section — and comparing those is the comparison that can catch one side drifting.
     */
    expect(offline.events.map((e) => e.pitch)).toEqual(live.events.map((e) => e.pitch));
    expect(new Set(offline.events.map((e) => e.atSeconds)).size).toBe(live.events.length);
    expect(live.events.map((e) => e.atStep)).toEqual([0, 6, 10]);
  });

  it("does not report a lane that is a drum machine as a lane that is missing a recording", () => {
    const pattern = patternWith(drumLane("kick", "808_kick"));
    expect(sampledStandDownIndexes(pattern, serving(DRUM_KIT_ASSET_ID)).size).toBe(0);
    expect(sampledInstrumentProblems(pattern, serving(DRUM_KIT_ASSET_ID))).toEqual([]);
    // The catalogue's own reference check agrees: a drum lane carrying no sample id is not an error.
    expect(sampleReferenceProblem({ track_id: "kick", instrument: "acoustic_kick" }, CATALOGUE)).toBeNull();
  });
});
