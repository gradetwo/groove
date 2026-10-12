/**
 * **The other half of "a drum track's notes are a drum part": the lanes a v1 song brings in.**
 *
 * `defaultContentFor` is what a *new* drum track holds; this is what an *old* one brings with it. A v1 genre lane
 * writes `steps` and no `pitch` column at all — measured over the shipped data: **0 of 636 drum lanes carry either
 * `pitch` or `pitches`** — and `notesFromLane` expands a step with no pitch at 0, the engine's own "a drum has no
 * key" convention. Projected into an arrangement unchanged, that made every old drum lane import at pitch 0: the
 * percussion staff drew it on the fallback row and reported "GM percussion note 0 is not in the table", and the MIDI
 * writer would have exported 0.
 *
 * The criteria are written against **the shipped genre data** rather than a fixture, because the claim is about the
 * data the app actually opens, and against the **real projection** (`arrangementFromGroovePackage`) rather than a
 * second reimplementation of it.
 */
import { describe, expect, it } from "vitest";
import { ALL_GENRES } from "../data/genres";
import type { GrooveProjectPackage } from "../types/project";
import type { SequencerPattern, SequencerTrack } from "../types/genre";
import { arrangementFromGroovePackage, projectedDrumPitch } from "../data/arrangementImport";
import { DRUM_ROLE_NOTES, DRUM_ROLE_IDS } from "../audio/drumRoles";
import { percussionPlanNotices } from "../components/arrangement/percussionStaff";

/** The four roles the v1 model writes on a drum lane — the union `SequencerTrack["track_id"]` gives the kit. */
const DRUM_ROLES = ["kick", "snare", "hihat", "percussion"] as const;

/** A v1 `.groove` package around one pattern: the shape a file on disk actually has. */
function v1Package(pattern: SequencerPattern, genreId: string): GrooveProjectPackage {
  return {
    format: "groove-project",
    version: 1,
    exportedAt: 0,
    appVersion: "test",
    project: {
      id: "probe",
      name: "probe",
      genreId,
      genreName: genreId,
      bpm: 120,
      swing: 0,
      timeSignature: "4/4",
      resolution: "1/16",
      stepCount: 16,
      patterns: { A: pattern, B: pattern },
      activeSlot: "A",
      songMode: false,
      songChain: ["A"],
      loopRange: null,
      effectsRack: {},
      drumKit: "acoustic",
      isMetronome: false,
      isCountIn: false,
      tags: [],
      isFavorite: false,
      createdAt: 0,
      updatedAt: 0,
    },
  } as unknown as GrooveProjectPackage;
}

/** One lane, as a genre writes a drum lane: steps and a velocity, and no pitch column. */
function lane(track_id: SequencerTrack["track_id"], steps: number[], extra: Partial<SequencerTrack> = {}): SequencerTrack {
  return { track_id, name: track_id, instrument: track_id, steps, ...extra } as SequencerTrack;
}

function patternWith(...tracks: SequencerTrack[]): SequencerPattern {
  return { genre_id: "probe", bpm: 120, totalSteps: 16, tracks } as unknown as SequencerPattern;
}

/** The drum notes the projection produced, keyed by the v1 role the lane came from. */
function projectedDrumNotes(pattern: SequencerPattern, genreId = "probe"): { byRole: Map<string, number[]>; notes: number[]; problems: string[] } {
  const result = arrangementFromGroovePackage(v1Package(pattern, genreId), "probe");
  const byRole = new Map<string, number[]>();
  const notes: number[] = [];
  for (const track of result.arrangement.tracks) {
    if (track.kind !== "drumkit" || !track.fromTrackId) continue;
    const pitches = (result.arrangement.notesByTrack?.[track.id] ?? []).map((note) => note.pitch);
    byRole.set(track.fromTrackId, pitches);
    notes.push(...pitches);
  }
  return { byRole, notes, problems: result.problems };
}

describe("a v1 drum lane projected into an arrangement", () => {
  it("takes its role's General MIDI number, for every drum lane in every shipped genre", () => {
    /**
     * ⭐ **The whole population, not one fixture.** The defect was invisible in any single lane; what makes the
     * criterion worth its runtime is that it walks the 159 genres that carry drums and asks each projected lane
     * whether its pitches are its role's own number.
     */
    const seenRoles = new Set<string>();
    let genresWithDrums = 0;
    let lanes = 0;
    const offenders: string[] = [];
    for (const genre of ALL_GENRES) {
      const drumLanes = (genre.sequencer_pattern.tracks as SequencerTrack[]).filter((track) => DRUM_ROLES.includes(track.track_id as (typeof DRUM_ROLES)[number]));
      if (drumLanes.length === 0) continue;
      genresWithDrums += 1;
      const { byRole, notes, problems } = projectedDrumNotes(genre.sequencer_pattern as SequencerPattern, genre.id);
      for (const role of DRUM_ROLES) {
        const pitches = byRole.get(role);
        if (!pitches) continue;
        lanes += 1;
        seenRoles.add(role);
        const expected = DRUM_ROLE_NOTES[role]!.note;
        for (const pitch of pitches) {
          if (pitch !== expected) offenders.push(`${genre.id}/${role}: ${pitch} where ${expected} was expected`);
        }
      }
      // The staff's own reading: with every lane on its role's number, no note is outside the table.
      for (const notice of percussionPlanNotices(notes.map((pitch) => ({ pitch })))) offenders.push(`${genre.id}: ${notice}`);
      // And nothing was left at 0 with a sentence about it either.
      for (const problem of problems) if (/DRUM_ROLE_NOTES|pitch 0/.test(problem)) offenders.push(`${genre.id}: ${problem}`);
    }
    expect(lanes).toBeGreaterThan(0);
    expect(genresWithDrums).toBeGreaterThan(0);
    expect(offenders.slice(0, 5), `${offenders.length} offending lane(s)`).toEqual([]);
    // All four roles occur in the shipped data, so the criterion above covered the whole kit rather than one lane of it.
    expect([...seenRoles].sort()).toEqual([...DRUM_ROLES].sort());
  });

  it("writes each role's own number on a four-lane pattern a person would recognise", () => {
    // The concrete reading, so a failure of the population criterion has a small reproduction beside it.
    const pattern = patternWith(
      lane("kick", [1, 0, 0, 0, 0, 0, 0, 0]),
      lane("snare", [0, 0, 0, 0, 1, 0, 0, 0]),
      lane("hihat", [0, 1, 0, 1, 0, 1, 0, 1]),
      lane("percussion", [0, 0, 0, 0, 0, 0, 0, 1])
    );
    const { byRole, notes } = projectedDrumNotes(pattern);
    expect(byRole.get("kick")).toEqual([36]);
    expect(byRole.get("snare")).toEqual([38]);
    expect(byRole.get("hihat")).toEqual([42, 42, 42, 42]);
    expect(byRole.get("percussion")).toEqual([82]);
    expect(percussionPlanNotices(notes.map((pitch) => ({ pitch })))).toEqual([]);
  });

  it("keeps a pitch the lane does write, so this is a fallback rather than a reinterpretation", () => {
    /**
     * A `.groove` v2 package's compiled drum lane carries the arrangement's own pitches (a drum pattern with kick,
     * snare and hat on one lane), and a MIDI import can carry one too. Replacing those with the role's number would
     * collapse a real part onto one pad — the opposite of the correction, and the reason the fallback is only for a
     * step that says nothing.
     */
    const withPitches = lane("kick", [1, 0, 1, 0], { pitch: [36, 0, 42, 0] });
    const { byRole } = projectedDrumNotes(patternWith(withPitches));
    expect(byRole.get("kick")).toEqual([36, 42]);
  });

  it("leaves a melodic lane's import alone, so the correction reaches drum lanes only", () => {
    // A lead lane with a pitch column keeps it; one without is expanded exactly as `notesFromLane` does (pitch 0),
    // because this change is about the kit's vocabulary and not about inventing pitches for pitched tracks.
    const { byRole } = projectedDrumNotes(patternWith(lane("lead", [1, 0, 0, 0], { pitch: [60, 0, 0, 0] })));
    expect(byRole.size).toBe(0);
    const result = arrangementFromGroovePackage(v1Package(patternWith(lane("lead", [1, 0, 0, 0])), "probe"), "probe");
    const lead = result.arrangement.tracks.find((track) => track.fromTrackId === "lead")!;
    expect(result.arrangement.notesByTrack![lead.id]!.map((note) => note.pitch)).toEqual([0]);
  });
});

describe("the pitch a projected drum lane falls back to", () => {
  it("is the role's own number for every role the kit has", () => {
    expect(projectedDrumPitch("kick")).toEqual({ pitch: 36 });
    expect(projectedDrumPitch("snare")).toEqual({ pitch: 38 });
    expect(projectedDrumPitch("hihat")).toEqual({ pitch: 42 });
    expect(projectedDrumPitch("percussion")).toEqual({ pitch: 82 });
    // Every role the projection calls a drum has a number, which is what keeps the sentence below unreachable today.
    for (const role of DRUM_ROLE_IDS) expect(DRUM_ROLE_NOTES[role]!.note).toBe(projectedDrumPitch(role).pitch);
  });

  it("answers a sentence rather than a silent 0 for a role the table does not classify", () => {
    // ⭐ "Role 拿不到号" is not silent: today no such role exists, so this is the branch a fifth drum role would take —
    // and it is a value a criterion can read rather than a `?? 0` nobody could see.
    const answer = projectedDrumPitch("tom");
    expect(answer.pitch).toBeUndefined();
    expect(answer.problem).toContain("tom");
    expect(answer.problem).toContain("DRUM_ROLE_NOTES");
    expect(answer.problem).toContain("pitch 0");
  });
});
