/**
 * The arrangement surface an agent composes with.
 *
 * The gap this closes was real: MCP could build a v1 song — clips, sections, lane slots — and nothing else, so the arrangement the interface has used since `/new` was unreachable. An agent could not add a track, choose its kind, point a sampler at a
 * mirrored library, write the steps it plays, or file a recording onto it.
 *
 * Two properties are protected here. **The operations are the interface's own** — each function calls `src/data/arrangementEdits`, so an agent's edit and a person's edit cannot become two behaviours — and **a request that cannot be carried out is
 * refused out loud**, because a caller that cannot see the screen has no way to notice that a track id was a typo.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  addMcpTake,
  addMcpTrack,
  addMcpTrackNotes,
  assignMcpTakeRange,
  clearMcpArrangements,
  createMcpArrangement,
  describeMcpArrangement,
  flattenMcpArrangement,
  getMcpArrangement,
  importMcpMusicXml,
  importMcpMusicXmlBytes,
  removeMcpTrack,
  renameMcpTrack,
  selectMcpTake,
  setMcpTrackCollapsed,
  setMcpTrackFlag,
  setMcpTrackAsset,
  setMcpTrackKind,
  setMcpTrackParent,
  setMcpTrackRegion,
  setMcpTrackSteps,
  summariseArrangement,
} from "../../mcp/arrangement";
import { createArrangement, resetTrackIdsForTests } from "../data/arrangementEdits";
import { compileArrangementToLanes } from "../data/arrangementCompile";
import { resolveInstrumentPresetKey } from "../audio/instrumentPresets";
import type { ArrangementV2 } from "../types/arrangementV2";
import { buildMxlZip, toBase64 } from "./fixtures/mxlZip";

beforeEach(() => {
  clearMcpArrangements();
  resetTrackIdsForTests();
});

/**
 * The reply's problems **without the synth-source notice**, which every `synth` track now carries on purpose.
 *
 * The criteria below whose subject is something else — an edit landing, a take range splitting — use this so they keep
 * asserting "nothing else went wrong" rather than being rewritten around a line that is not about them. The notice
 * itself has its own criteria, which assert it is present rather than filtering it away.
 */
const withoutSynthNotice = (problems: readonly string[]): string[] =>
  problems.filter((problem) => !problem.includes("is a synth track and sounds through the built-in preset"));

const template = () => createMcpArrangement({ templateId: "samplers", songId: "s" });

describe("creating an arrangement", () => {
  it("uses a template, and reports the templates it would accept", () => {
    const summary = template();
    expect(summary.trackCount).toBeGreaterThan(0);
    expect(summary.tracks.every((track) => track.kind === "sampler")).toBe(true);
    // Discoverable rather than guessable: a caller should not have to read the repository to name a template.
    expect(summary.templates).toContain("drums-bass");
  });

  it("refuses a template that does not exist, naming the ones that do", () => {
    expect(() => createMcpArrangement({ templateId: "not-a-template" })).toThrow(/the templates are/);
  });

  /**
   * ⭐ **No content the caller did not write.**
   *
   * `createArrangement`/`addTrack` seed a kind's default pattern because a silent track looks broken to a **person**
   * starting a project, and that is unchanged. An agent reaching the MCP surface cannot see the screen, and two field
   * reports describe exactly this: four notes at pitch 60 arriving with a new sampler track, on a drum-kit asset, with
   * nothing in the reply accounting for them. The deletion test is to remove the `notesByTrack: {}` spread in
   * `createMcpArrangement` (or the `delete` in `addMcpTrack`) — this test then sees four notes per track.
   */
  it("hands an MCP caller no notes it did not write, whichever way the arrangement was made", () => {
    const blank = createMcpArrangement({ blankKind: "sampler" });
    const fromTemplate = template();
    const added = addMcpTrack(blank.arrangementId, "drumkit");
    for (const summary of [blank, fromTemplate, added.summary]) {
      for (const track of summary.tracks) expect(track.notes).toEqual([]);
    }
    // The asset is identity rather than content, so it survives: without it the sampler lane would resolve to nothing.
    expect(blank.tracks[0]!.sampleAssetId).toBe("virtuosity-drums-basic");
  });

  /**
   * ⭐ **Where starter content is still seeded, it is named.** The app path still seeds it, so the detector has to fire
   * there and stay quiet once a caller edits anything — a report that fired on "any four notes" would be noise, and one
   * that never fired would be the silence the report was about. Deletion test: remove the `carriesStarterNotes` branch in
   * `summariseArrangement` and the first assertion goes red.
   */
  it("names starter content instead of leaving the caller to find it by ear", () => {
    const seeded = createArrangement("probe", "sampler");
    const trackId = seeded.tracks[0]!.id;
    const notes = seeded.notesByTrack![trackId]!;
    expect(notes.length).toBeGreaterThan(0);
    expect(summariseArrangement("probe", seeded).problems.some((problem) => /starter note\(s\)/.test(problem))).toBe(true);

    const edited = {
      ...seeded,
      notesByTrack: {
        ...seeded.notesByTrack,
        [trackId]: [...notes, { pitch: 67, startBeats: 4, lengthBeats: 0.25, velocity: 100 }],
      },
    };
    expect(summariseArrangement("probe", edited).problems.some((problem) => /starter note\(s\)/.test(problem))).toBe(false);
  });

  /**
   * ⭐ **A chord loses notes to the one-pitch-per-step grid, and the reply names the loss.**
   *
   * The model holds notes, so three may start together; `stepsFromNotes` keeps the lowest and the renderer plays one
   * pitch. Making the lane play the stack would change what every existing chord sounds like, which is the owner's
   * decision and not taken here. What is taken is the silence. Both directions are asserted: a column with three notes
   * is reported with the kept and dropped pitches, and a column with one is not reported at all.
   */
  it("does not report a chord as lost, because a stack column now reaches the lane", () => {
    const { arrangementId } = createMcpArrangement({ blankKind: "synth" });
    const track = summariseArrangement(arrangementId, getMcpArrangement(arrangementId)!).tracks[0]!;
    addMcpTrackNotes(arrangementId, track.id, [
      { pitch: 60, startBeats: 0, lengthBeats: 1, velocity: 100 },
      { pitch: 64, startBeats: 0, lengthBeats: 1, velocity: 100 },
      { pitch: 67, startBeats: 0, lengthBeats: 1, velocity: 100 },
    ]);
    // ⭐ The owner's decision took the other half: the lane plays the whole stack, so nothing is dropped and
    // no problem may say otherwise. This is the mirror of the criterion that used to stand here.
    const chord = summariseArrangement(arrangementId, getMcpArrangement(arrangementId)!).problems.find((problem) =>
      /step 0/.test(problem)
    );
    expect(chord).toBeUndefined();
    // The pitches the model still holds are unchanged: this reports, it does not edit or re-voice the chord.
    expect(summariseArrangement(arrangementId, getMcpArrangement(arrangementId)!).tracks[0]!.notes).toHaveLength(3);

    const single = createMcpArrangement({ blankKind: "synth" });
    const singleTrack = summariseArrangement(single.arrangementId, getMcpArrangement(single.arrangementId)!).tracks[0]!;
    addMcpTrackNotes(single.arrangementId, singleTrack.id, [{ pitch: 60, startBeats: 0, lengthBeats: 1, velocity: 100 }]);
    expect(
      summariseArrangement(single.arrangementId, getMcpArrangement(single.arrangementId)!).problems.some((problem) =>
        /keeps one pitch/.test(problem)
      )
    ).toBe(false);
  });

  it("reports a sampler track's instrument, which the template already gives it", () => {
    /**
     * Measured rather than assumed: a `sampler` track is created with the default catalogue asset already set — `defaultContentFor` gives it one because a sampler with no instrument is a track that cannot sound. So the "will be silent" warning
     * does not fire here, and a test that expected it to was wrong about the model.
     */
    const summary = template();
    expect(summary.tracks.every((track) => track.sampleAssetId !== undefined)).toBe(true);
    expect(summary.problems).toEqual([]);
  });

  it("gives a track that becomes a sampler the default instrument, so no path leads to a silent one", () => {
    /**
     * Measured while writing this, and it changed the model: a kind change used to leave the sample unset, so a sampler track sounded or not depending on whether it had been created or converted. `changeTrackKind` now supplies the default
     * asset that a new sampler track gets, and the warning below stays as the guard for any state that still reaches it.
     */
    const { arrangementId } = createMcpArrangement({ blankKind: "synth" });
    const track = summariseArrangement(arrangementId, getMcpArrangement(arrangementId)!).tracks[0]!;
    const asSampler = setMcpTrackKind(arrangementId, track.id, "sampler");
    expect(asSampler.summary.tracks[0]!.sampleAssetId).toBe("virtuosity-drums-basic");
    expect(asSampler.problems).toEqual([]);
  });

  it("keeps each arrangement under its own id, because calls are stateless", () => {
    const first = createMcpArrangement({ templateId: "drums-bass" });
    const second = createMcpArrangement({ templateId: "samplers" });
    expect(first.arrangementId).not.toBe(second.arrangementId);
    expect(getMcpArrangement(second.arrangementId)).toBeDefined();
    expect(summariseArrangement(first.arrangementId, getMcpArrangement(first.arrangementId)!).tracks).toHaveLength(first.trackCount);
  });
});

describe("editing an arrangement", () => {
  it("adds and removes a track through the same code the interface calls", () => {
    const { arrangementId } = createMcpArrangement({ blankKind: "drumkit" });
    const added = addMcpTrack(arrangementId, "synth", "Bass");
    expect(withoutSynthNotice(added.problems)).toEqual([]);
    const bass = added.summary.tracks.find((track) => track.name === "Bass")!;
    expect(bass.kind).toBe("synth");
    const removed = removeMcpTrack(arrangementId, bass.id);
    expect(removed.summary.tracks.some((track) => track.id === bass.id)).toBe(false);
  });

  it("points a sampler track at an instrument and reports it back", () => {
    const { arrangementId } = createMcpArrangement({ blankKind: "sampler" });
    const track = summariseArrangement(arrangementId, getMcpArrangement(arrangementId)!).tracks[0]!;
    const result = setMcpTrackAsset(arrangementId, track.id, "salamander-grand");
    expect(result.summary.tracks[0]!.sampleAssetId).toBe("salamander-grand");
    // The warning about a silent sampler goes away once it has one, which is what makes it worth reading.
    expect(result.problems).toEqual([]);
  });

  it("refuses an instrument on a track whose kind does not play one, rather than doing nothing", () => {
    // The data layer returns the arrangement unchanged for a non-sampler; a caller that cannot see the screen has to be told instead.
    const { arrangementId } = createMcpArrangement({ blankKind: "drumkit" });
    const track = summariseArrangement(arrangementId, getMcpArrangement(arrangementId)!).tracks[0]!;
    expect(() => setMcpTrackAsset(arrangementId, track.id, "salamander-grand")).toThrow(/only a sampler track/);
  });

  it("writes a whole step pattern and reads back how many are on", () => {
    const { arrangementId } = createMcpArrangement({ blankKind: "drumkit" });
    const track = summariseArrangement(arrangementId, getMcpArrangement(arrangementId)!).tracks[0]!;
    const written = setMcpTrackSteps(arrangementId, track.id, [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
    expect(written.summary.tracks[0]!.stepsOn).toBe(4);
    expect(written.summary.tracks[0]!.steps).toHaveLength(16);
  });

  it("sets a kind, a name, a flag and a folder", () => {
    const { arrangementId } = createMcpArrangement({ blankKind: "synth" });
    const first = summariseArrangement(arrangementId, getMcpArrangement(arrangementId)!).tracks[0]!;
    const asSampler = setMcpTrackKind(arrangementId, first.id, "sampler");
    expect(asSampler.summary.tracks[0]!.kind).toBe("sampler");
    expect(renameMcpTrack(arrangementId, first.id, "Piano").summary.tracks[0]!.name).toBe("Piano");
    expect(setMcpTrackFlag(arrangementId, first.id, "muted", true).summary.tracks[0]!.muted).toBe(true);
    const folder = addMcpTrack(arrangementId, "folder", "Group").summary.tracks.find((track) => track.kind === "folder")!;
    const nested = setMcpTrackParent(arrangementId, first.id, folder.id);
    expect(nested.summary.tracks.find((track) => track.id === first.id)!.parentId).toBe(folder.id);
    // `null` detaches, which is why the parameter is nullable rather than optional.
    expect(setMcpTrackParent(arrangementId, first.id, null).summary.tracks.find((track) => track.id === first.id)!.parentId).toBeUndefined();
  });

  it("refuses a track id that is not there, naming the ones that are", () => {
    const { arrangementId } = createMcpArrangement({ blankKind: "synth" });
    expect(() => renameMcpTrack(arrangementId, "track-nope", "x")).toThrow(/its tracks are/);
    expect(() => removeMcpTrack(arrangementId, "track-nope")).toThrow(/no track/);
  });

  it("⭐ places a track's region where the interface's drag would, and reads it back", () => {
    /**
     * The drag's model edit, reachable by an agent — the guard in `mcpCoverage.test.ts` asks for exactly this rather
     * than an exclusion, and the two callers end in the same `setTrackRegion`.
     */
    const { arrangementId } = createMcpArrangement({ blankKind: "synth" });
    const first = summariseArrangement(arrangementId, getMcpArrangement(arrangementId)!).tracks[0]!;
    // An arrangement starts with no region, which **means** the whole arrangement — eight bars by default.
    expect(getMcpArrangement(arrangementId)!.tracks[0]!.region).toBeUndefined();

    setMcpTrackRegion(arrangementId, first.id, 2, 5);
    expect(getMcpArrangement(arrangementId)!.tracks[0]!.region).toEqual({ startBar: 2, endBar: 5 });
    // Clamped by the same `setTrackRegion` the pointer and the arrow keys call: never shorter than a bar.
    setMcpTrackRegion(arrangementId, first.id, 2, 2);
    expect(getMcpArrangement(arrangementId)!.tracks[0]!.region).toEqual({ startBar: 2, endBar: 3 });
    // `null` for both restores the whole-arrangement region, which the model stores as the field being absent.
    setMcpTrackRegion(arrangementId, first.id, null, null);
    expect(getMcpArrangement(arrangementId)!.tracks[0]!.region).toBeUndefined();
  });

  it("refuses half a range, and a track that is not there — an assumption must not look like a reading", () => {
    const { arrangementId } = createMcpArrangement({ blankKind: "synth" });
    const first = summariseArrangement(arrangementId, getMcpArrangement(arrangementId)!).tracks[0]!;
    expect(() => setMcpTrackRegion(arrangementId, first.id, 2, null)).toThrow(/both startBar and endBar/);
    expect(() => setMcpTrackRegion(arrangementId, "track-nope", 1, 2)).toThrow(/its tracks are/);
  });

  it("refuses an unknown arrangement id with the tool that creates one", () => {
    expect(() => addMcpTrack("arrangement-nope", "synth")).toThrow(/create_arrangement/);
  });
});

describe("recording onto a track", () => {
  it("files a take and selects it, so it is the one heard", () => {
    const { arrangementId } = createMcpArrangement({ blankKind: "sampler" });
    const track = summariseArrangement(arrangementId, getMcpArrangement(arrangementId)!).tracks[0]!;
    const filed = addMcpTake(arrangementId, { trackId: track.id, source: "audio", label: "take one", recordedAt: 10 });
    expect(filed.summary.tracks[0]!.takes).toEqual(["take-1"]);
    expect(filed.summary.tracks[0]!.selectedTakeId).toBe("take-1");
  });

  it("claims the bar range when the capture covered one", () => {
    const { arrangementId } = createMcpArrangement({ blankKind: "synth" });
    const track = summariseArrangement(arrangementId, getMcpArrangement(arrangementId)!).tracks[0]!;
    addMcpTake(arrangementId, { trackId: track.id, source: "midi", startBar: 2, endBar: 4, recordedAt: 1 });
    const regions = getMcpArrangement(arrangementId)!.tracks[0]!.takeRegions;
    expect(regions).toEqual([{ startBar: 2, endBar: 4, takeId: "take-1" }]);
  });

  it("refuses a take id that is not on the track", () => {
    const { arrangementId } = createMcpArrangement({ blankKind: "synth" });
    const track = summariseArrangement(arrangementId, getMcpArrangement(arrangementId)!).tracks[0]!;
    expect(() => selectMcpTake(arrangementId, track.id, "take-9")).toThrow(/has no take/);
    // Clearing is allowed and is not the same request as choosing one that does not exist.
    expect(selectMcpTake(arrangementId, track.id, null).summary.tracks[0]!.selectedTakeId).toBeUndefined();
  });

  it("reads one line per track, so a caller can log what it built", () => {
    const { arrangementId } = createMcpArrangement({ blankKind: "sampler" });
    const track = summariseArrangement(arrangementId, getMcpArrangement(arrangementId)!).tracks[0]!;
    setMcpTrackAsset(arrangementId, track.id, "salamander-grand");
    addMcpTake(arrangementId, { trackId: track.id, source: "audio", recordedAt: 4 });
    const line = describeMcpArrangement(arrangementId);
    expect(line).toContain("salamander-grand");
    expect(line).toContain("1 take(s)");
    expect(line).toContain("steps");
  });

  it("claims an existing take for a bar range, splitting one it crosses", () => {
    /**
     * The comping path, as opposed to filing a recording: `add_arrangement_take` claims a range when the recording covered one, and this claims a range for a take that already exists. Ranges stay disjoint, which is the rule `assignTakeToRange`
     * implements and this reuses rather than restating.
     */
    const { arrangementId } = createMcpArrangement({ blankKind: "synth" });
    const track = summariseArrangement(arrangementId, getMcpArrangement(arrangementId)!).tracks[0]!;
    addMcpTake(arrangementId, { trackId: track.id, source: "midi", recordedAt: 1 });
    addMcpTake(arrangementId, { trackId: track.id, source: "midi", recordedAt: 2 });
    const claimed = assignMcpTakeRange(arrangementId, track.id, "take-1", 0, 4);
    expect(withoutSynthNotice(claimed.summary.problems)).toEqual([]);
    expect(getMcpArrangement(arrangementId)!.tracks[0]!.takeRegions).toEqual([{ startBar: 0, endBar: 4, takeId: "take-1" }]);
    // A second range splits the first rather than overlapping it.
    assignMcpTakeRange(arrangementId, track.id, "take-2", 2, 6);
    expect(getMcpArrangement(arrangementId)!.tracks[0]!.takeRegions).toEqual([
      { startBar: 0, endBar: 2, takeId: "take-1" },
      { startBar: 2, endBar: 6, takeId: "take-2" },
    ]);
  });

  it("refuses a range that ends where it starts, and a take that is not there", () => {
    const { arrangementId } = createMcpArrangement({ blankKind: "synth" });
    const track = summariseArrangement(arrangementId, getMcpArrangement(arrangementId)!).tracks[0]!;
    addMcpTake(arrangementId, { trackId: track.id, source: "midi", recordedAt: 1 });
    expect(() => assignMcpTakeRange(arrangementId, track.id, "take-1", 4, 4)).toThrow(/must end after it starts/);
    expect(() => assignMcpTakeRange(arrangementId, track.id, "take-9", 0, 4)).toThrow(/has no take/);
  });

  it("folds a track without changing what it plays", () => {
    // Display only, and the criterion says so: the steps are identical either side of the fold.
    const { arrangementId } = createMcpArrangement({ blankKind: "drumkit" });
    const before = summariseArrangement(arrangementId, getMcpArrangement(arrangementId)!).tracks[0]!;
    const folded = setMcpTrackCollapsed(arrangementId, before.id, true);
    expect(folded.summary.tracks[0]!.collapsed).toBe(true);
    expect(folded.summary.tracks[0]!.steps).toEqual(before.steps);
  });

  it("flattens to something the renderer can bounce, through the application's own chain", () => {
    /**
     * The last link the surface was missing: an agent could compose an arrangement and not hear it. The chain is the application's — `compileArrangementToSongInput` → `createSong` → `flattenSong` — so this cannot render something the interface would
     * not, which is the rule the rest of the MCP render surface follows.
     */
    const { arrangementId } = createMcpArrangement({ blankKind: "drumkit" });
    /**
     * ⭐ **The caller's own note, because the MCP surface no longer seeds starter content.** A new track arrives empty, so
     * this asks the chain to carry what was written — not what the track was born with, which is what the previous
     * version of this test accidentally measured.
     */
    const track = summariseArrangement(arrangementId, getMcpArrangement(arrangementId)!).tracks[0]!;
    addMcpTrackNotes(arrangementId, track.id, [{ pitch: 36, startBeats: 0, lengthBeats: 0.25, velocity: 100 }]);
    const { flattened, bars } = flattenMcpArrangement(arrangementId);
    expect(bars).toBeGreaterThan(0);
    expect(flattened.pattern.tracks.length).toBeGreaterThan(0);
    expect(flattened.totalSteps).toBeGreaterThan(0);
    expect(flattened.pattern.tracks.some((row) => (row.steps ?? []).some((step) => step !== 0))).toBe(true);
  });

  it("refuses to render an arrangement with no tracks, and says which arrangement to make", () => {
    // An empty arrangement would render silence, and silence reads as a broken renderer rather than as an empty arrangement.
    const { arrangementId } = createMcpArrangement({ blankKind: "drumkit" });
    const track = summariseArrangement(arrangementId, getMcpArrangement(arrangementId)!).tracks[0]!;
    removeMcpTrack(arrangementId, track.id);
    expect(() => flattenMcpArrangement(arrangementId)).toThrow(/no tracks/);
    expect(() => flattenMcpArrangement("arrangement-nope")).toThrow(/create_arrangement/);
  });
});

/**
 * MusicXML in, at the layer an agent calls.
 *
 * The reader has its own criteria; what is checked here is the decision the **tool** makes — which part becomes a track, what the new tracks are called, and that a caller is told which track it just got. The default is the first part, because that is what the tool did before this and a caller's existing scripts must keep working.
 */
describe("importing a score onto the arrangement", () => {
  /** Two named parts with different notes, so "all parts" can be told from "the first part twice". */
  const twoPartXml = `<?xml version="1.0"?><score-partwise version="4.0">
    <part-list>
      <score-part id="P1"><part-name>Right Hand</part-name></score-part>
      <score-part id="P2"><part-name>Left Hand</part-name></score-part>
    </part-list>
    <part id="P1"><measure number="1">
      <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>2</duration></note>
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>2</duration></note>
    </measure></part>
    <part id="P2"><measure number="1">
      <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration></note>
    </measure></part>
  </score-partwise>`;

  it("adds the first part by default, named after the part", () => {
    const { arrangementId } = createMcpArrangement({ blankKind: "synth" });
    const result = importMcpMusicXml(arrangementId, twoPartXml);
    expect(result.trackIds).toHaveLength(1);
    const track = result.summary.tracks.find((candidate) => candidate.id === result.trackIds![0])!;
    expect(track.name).toBe("Right Hand");
    expect(track.notes.map((entry) => entry.pitch)).toEqual([72, 74]);
    expect(result.notes).toBe(2);
    expect(result.problems).toEqual([]);
  });

  it('adds every part as its own track when partIndex is "all"', () => {
    /**
     * The reason the field is a union rather than a separate `allParts` flag: "part 3, or all parts" is a state with no meaning, and the type makes it unrepresentable instead of leaving the reader of a call to work out which one the handler honoured.
     */
    const { arrangementId } = createMcpArrangement({ blankKind: "synth" });
    const result = importMcpMusicXml(arrangementId, twoPartXml, { partIndex: "all" });
    expect(result.trackIds).toHaveLength(2);
    const [right, left] = result.trackIds!.map((id) => result.summary.tracks.find((candidate) => candidate.id === id)!);
    expect(right!.name).toBe("Right Hand");
    expect(left!.name).toBe("Left Hand");
    // Each track holds its own part's notes and nothing of the other's.
    expect(right!.notes.map((entry) => entry.pitch)).toEqual([72, 74]);
    expect(left!.notes.map((entry) => entry.pitch)).toEqual([48]);
    expect(result.notes).toBe(3);
    expect(result.problems).toEqual([]);
  });

  it("reads a compressed .mxl from its bytes, and says that is what it read", async () => {
    const { arrangementId } = createMcpArrangement({ blankKind: "synth" });
    const result = await importMcpMusicXmlBytes(arrangementId, toBase64(buildMxlZip([["score.musicxml", twoPartXml]])), { partIndex: "all" });
    expect(result.format).toBe("mxl");
    expect(result.summary.tracks.map((track) => track.name)).toContain("Left Hand");
    expect(result.notes).toBe(3);
    expect(result.trackIds).toHaveLength(2);
  });

  it("refuses a part index that is not in the file, naming how many there are", () => {
    const { arrangementId } = createMcpArrangement({ blankKind: "synth" });
    expect(() => importMcpMusicXml(arrangementId, twoPartXml, { partIndex: 7 })).toThrow(/2 part\(s\), so there is no part 7/);
  });

  it("leaves an empty part out and says so, rather than adding a track that holds nothing", () => {
    const xml = `<?xml version="1.0"?><score-partwise version="4.0">
      <part-list><score-part id="P1"><part-name>Silent</part-name></score-part></part-list>
      <part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes><note><rest/><duration>4</duration></note></measure></part>
    </score-partwise>`;
    const { arrangementId } = createMcpArrangement({ blankKind: "synth" });
    const result = importMcpMusicXml(arrangementId, xml, { partIndex: "all" });
    expect(result.trackIds).toEqual([]);
    expect(result.problems.join(" ")).toMatch(/"Silent" holds no notes/);
  });
});

/**
 * ⭐ **The sound source is visible, and a synth track says what to do instead.**
 *
 * The report's reproduction: an agent named a track "钢琴", built it as the kind whose name sounded right, wrote 198
 * notes and heard a fixed synthesiser — the mix was muddy and nothing in any reply said which voice was sounding or
 * that a real piano was one call away. These criteria reproduce that path and pin both halves of the answer: the list
 * shows the **built-in preset by name and key**, and `problems` carries the **executable next step**.
 */
describe("what a track actually sounds through", () => {
  it("names the built-in preset on the track, read from the same resolution the renderer performs", () => {
    const { arrangementId } = createMcpArrangement({ blankKind: "synth" });
    const added = addMcpTrack(arrangementId, "synth", "钢琴");
    const piano = added.summary.tracks.find((entry) => entry.name === "钢琴")!;

    expect(piano.kind).toBe("synth");
    expect(piano.sound.source).toBe("builtin-synth");
    expect(piano.sound.presetKey).toBe("analogLead");
    expect(piano.sound.presetName).toBe("Analog Lead");
    // Not selectable: this is the fact the old surface hid — a synth's timbre cannot be pointed at an asset.
    expect(piano.sound.selectable).toBe(false);
    expect(piano.sound.guidance).toMatch(/kind:"sampler"/);

    /**
     * **The report is the renderer's own answer, not a second guess.** The lane the compile builds for this track is
     * asked for its `instrument` and role, and the preset that resolves from those two must be the one reported.
     */
    const lane = compileArrangementToLanes(getMcpArrangement(arrangementId)!).find((entry) => entry.sourceTrackId === piano.id)!;
    expect(piano.sound.presetKey).toBe(resolveInstrumentPresetKey(lane.track.instrument, lane.track.track_id));
    expect(lane.track.track_id).toBe("lead");
    expect(lane.track.instrument).toBe("synth");
  });

  it("puts the explanation and the next step in problems, not a bare 'no instrument'", () => {
    const { arrangementId } = createMcpArrangement({ blankKind: "synth" });
    const added = addMcpTrack(arrangementId, "synth", "钢琴");
    const notice = added.problems.find((problem) => problem.includes("钢琴"));
    expect(notice).toBeDefined();
    // Which track, which preset, and what to call instead — each of the three things the report asked for.
    expect(notice).toMatch(/built-in preset "Analog Lead" \(analogLead\)/);
    expect(notice).toMatch(/kind:"sampler"/);
    expect(notice).toMatch(/add_arrangement_track/);
    expect(notice).toMatch(/list_arrangement_instruments/);
    // It is in the summary too, which is what `get_arrangement` and the render replies' `arrangementProblems` carry.
    const reread = summariseArrangement(arrangementId, getMcpArrangement(arrangementId)!);
    expect(reread.problems.some((problem) => problem.includes("Analog Lead"))).toBe(true);
  });

  it("writes the source on describe_arrangement's own line, so a log says what will be heard", () => {
    const { arrangementId } = createMcpArrangement({ blankKind: "synth" });
    const line = describeMcpArrangement(arrangementId);
    expect(line).toContain('built-in synth preset "Analog Lead" (analogLead)');
  });

  it("takes an assetId in the same call that creates a sampler track — one step, not two", () => {
    // A drum-kit arrangement, so the only problem that could appear is one this criterion is about.
    const { arrangementId } = createMcpArrangement({ blankKind: "drumkit" });
    const created = addMcpTrack(arrangementId, "sampler", "Piano", "salamander-grand");
    const piano = created.summary.tracks.find((entry) => entry.name === "Piano")!;
    expect(piano.sampleAssetId).toBe("salamander-grand");
    expect(piano.sound).toMatchObject({ source: "catalogue-asset", assetId: "salamander-grand", selectable: true });
    // A later read agrees: the one call put it on the track rather than only in its own reply.
    const reread = summariseArrangement(arrangementId, getMcpArrangement(arrangementId)!);
    expect(reread.tracks.find((entry) => entry.id === piano.id)!.sampleAssetId).toBe("salamander-grand");
    expect(reread.problems).toEqual([]);
  });

  it("refuses an assetId on a synth track rather than ignoring it, and adds nothing", () => {
    const { arrangementId } = createMcpArrangement({ blankKind: "synth" });
    expect(() => addMcpTrack(arrangementId, "synth", "Piano", "salamander-grand")).toThrow(/only a sampler track/);
    expect(getMcpArrangement(arrangementId)!.tracks).toHaveLength(1);
  });

  it("refuses a track kind this build does not have, naming it, rather than compiling it as nothing", () => {
    /**
     * The old literal is not read, aliased or migrated — the owner's rule is that old data may be dropped. What is not
     * allowed is the silent reading: a lookup that answered `undefined` would give a lane with no role, and the caller
     * would hear a part missing rather than learn that the arrangement could not be read.
     */
    const legacy = {
      ...createArrangement("s", "synth"),
      tracks: [{ id: "t1", kind: "instrument", name: "钢琴" }],
    } as unknown as ArrangementV2;
    expect(() => compileArrangementToLanes(legacy)).toThrow(/kind "instrument"/);
    expect(() => compileArrangementToLanes(legacy)).toThrow(/synth/);
  });
});
