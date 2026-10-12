import { describe, expect, it } from "vitest";
import { DEFAULT_SAMPLER_ASSET, defaultContentFor } from "../data/defaultContent";
import { notesFromSteps } from "../data/noteEvents";
import { compileArrangementToLanes } from "../data/arrangementCompile";
import { createArrangement, addTrack, starterNotesFor } from "../data/arrangementEdits";
import { collapsedNoteColumns } from "../data/noteEvents";
import { DRUM_ROLE_NOTES, DRUM_ROLE_IDS } from "../audio/drumRoles";
import { percussionPlanNotices } from "../components/arrangement/percussionStaff";

/**
 * Why a new track has content: **a silent track looks like a broken engine.**
 *
 * The first version of the new-project route played an arrangement of empty tracks and correctly reported `planned 0` — the right answer to the wrong first impression. The subtler half is that a sampler lane needs
 * an **asset**: without one it compiles into a lane the planner cannot resolve, which is silence with no visible cause.
 *
 * ⭐ **And why a drum track's content is written in the kit's own notes.** A new drum track used to hold four notes
 * at pitch 60 — `steps(4)` with no pitches, so `notesFromSteps` filled every onset with its fallback. On the
 * percussion staff that is four notes on the snare line plus "GM percussion note 60 is not in the table": a drum
 * track whose starter content is not a drum part. The criteria below pin the correction and its reverse.
 */
describe("default content for a new track", () => {
  it("gives a sounding kind a pattern, and the sampler an asset as well", () => {
    const kit = defaultContentFor("drumkit");
    expect(kit.steps.some((step) => step === 1)).toBe(true);
    // ⭐ The asset is the half that is easy to forget, and the half that makes a sampler track silent without saying so.
    expect(defaultContentFor("sampler").sample).toEqual({ assetId: DEFAULT_SAMPLER_ASSET });
    expect(defaultContentFor("synth").sample).toBeUndefined();
  });

  it("gives a folder and an effect rack nothing, because neither sounds", () => {
    expect(defaultContentFor("folder").steps.every((step) => step === 0)).toBe(true);
    expect(defaultContentFor("folder").sample).toBeUndefined();
    expect(defaultContentFor("fx").sample).toBeUndefined();
  });

  it("compiles a default sampler track into a lane that still names its asset", () => {
    // ⭐ The end of the chain, checked here so a default that stopped carrying the asset would fail where it is decided rather than where it is played.
    const lanes = compileArrangementToLanes({ songId: "s", sourceSlots: [], tracks: [{ id: "t", kind: "sampler", name: "S" }] }, { t: notesFromSteps(defaultContentFor("sampler").steps) });
    expect(lanes[0]!.track.sample).toBeUndefined();
    // The lane carries what the track carries, so a default that forgot the asset is visible right here.
    const withAsset = compileArrangementToLanes({ songId: "s", sourceSlots: [], tracks: [{ id: "t", kind: "sampler", name: "S", sample: { assetId: DEFAULT_SAMPLER_ASSET } }] }, { t: notesFromSteps(defaultContentFor("sampler").steps) });
    expect(withAsset[0]!.track.sample).toEqual({ assetId: DEFAULT_SAMPLER_ASSET });
  });
});

describe("what a new drum track holds", () => {
  /**
   * ⭐ **A drum pattern in the kit's own General MIDI numbers.** The measure is not "eight notes" but *which* numbers:
   * the criterion reads the pitches back and asks each one whether `DRUM_ROLE_NOTES` names it, so a pattern that
   * named a plausible-looking number nobody mapped would fail here rather than on the staff.
   */
  it("writes kick, snare and hat on their own GM numbers — three different instruments, not one repeated", () => {
    const notes = starterNotesFor("drumkit");
    // The shape of the pattern, by beat: kick on 1 and 3, snare on 2 and 4, the closed hat on the offbeats.
    const byBeat = notes.map((note) => `${note.startBeats}:${note.pitch}`);
    expect(byBeat).toEqual([
      "0:36",
      "0.5:42",
      "1:38",
      "1.5:42",
      "2:36",
      "2.5:42",
      "3:38",
      "3.5:42",
    ]);
    // Every number is a role's own note — the property the staff needs, stated independently of the table above.
    const mapped = new Set(DRUM_ROLE_IDS.map((role) => DRUM_ROLE_NOTES[role]!.note));
    for (const note of notes) expect(mapped, `pitch ${note.pitch} is not a DRUM_ROLE_NOTES note`).toContain(note.pitch);
    // And at least the three the task named are all present, which "a pattern" means here.
    expect(new Set(notes.map((note) => note.pitch))).toEqual(new Set([36, 38, 42]));
  });

  it("starts the staff clean: no note falls outside the percussion table", () => {
    // The defect this closes was visible exactly here — the old starter content produced one notice for pitch 60.
    expect(percussionPlanNotices(starterNotesFor("drumkit"))).toEqual([]);
  });

  it("gives every creation route the same pattern, because they all read one default", () => {
    const fromCreate = createArrangement("s", "drumkit");
    const created = fromCreate.notesByTrack![fromCreate.tracks[0]!.id]!;
    const added = addTrack({ songId: "s", tracks: [], sourceSlots: [] }, "drumkit", "Drums");
    const appended = added.notesByTrack![added.tracks[added.tracks.length - 1]!.id]!;
    expect(created).toEqual(starterNotesFor("drumkit"));
    expect(appended).toEqual(starterNotesFor("drumkit"));
  });

  it("puts no two instruments on one square, which is what keeps the step grid from dropping a note", () => {
    /**
     * ⭐ **The reason the hat is on the offbeats rather than under the kick**, as a criterion rather than a comment.
     * The row's step grid holds one pitch per square (`stepsFromNotes` keeps a column's lowest), and the MCP report
     * names the rest as lost (`collapsedNoteColumns`). The starter content therefore has one instrument per square —
     * asserted below against the counterfactual, a hat stacked on the kick, so the criterion fails if a future pattern
     * quietly reintroduces a column the model cannot show back.
     */
    const starter = starterNotesFor("drumkit");
    expect(collapsedNoteColumns(starter, 16)).toEqual([]);
    const stacked = [...starter, { pitch: 42, startBeats: 0, lengthBeats: 0.25, velocity: 100 }];
    expect(collapsedNoteColumns(stacked, 16)).toHaveLength(1);
  });
});

describe("what a new melodic track holds, which is deliberately unchanged", () => {
  /**
   * ⭐ **The reverse criterion.** Correcting the drum default must not move the pitched kinds: a synth or a sampler
   * still starts on four notes at middle C, one per beat, item for item — pitch, position, length and velocity.
   */
  it("keeps a synth's and a sampler's starter content exactly as it was", () => {
    const expected = [0, 1, 2, 3].map((beat) => ({ pitch: 60, startBeats: beat, lengthBeats: 0.25, velocity: 100 }));
    expect(starterNotesFor("synth")).toEqual(expected);
    expect(starterNotesFor("sampler")).toEqual(expected);
    // And the default carries no `pitches` for them, so the pitch is the model's own fallback rather than an array of 60s this file wrote.
    expect(defaultContentFor("synth").pitches).toBeUndefined();
    expect(defaultContentFor("sampler").pitches).toBeUndefined();
  });
});
