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
  setMcpTrackInstrument,
  setMcpTrackKind,
  setMcpTrackParent,
  setMcpTrackSteps,
  summariseArrangement,
} from "../../mcp/arrangement";
import { resetTrackIdsForTests } from "../data/arrangementEdits";
import { buildMxlZip, toBase64 } from "./fixtures/mxlZip";

beforeEach(() => {
  clearMcpArrangements();
  resetTrackIdsForTests();
});

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
    const { arrangementId } = createMcpArrangement({ blankKind: "instrument" });
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
    const added = addMcpTrack(arrangementId, "instrument", "Bass");
    expect(added.problems).toEqual([]);
    const bass = added.summary.tracks.find((track) => track.name === "Bass")!;
    expect(bass.kind).toBe("instrument");
    const removed = removeMcpTrack(arrangementId, bass.id);
    expect(removed.summary.tracks.some((track) => track.id === bass.id)).toBe(false);
  });

  it("points a sampler track at an instrument and reports it back", () => {
    const { arrangementId } = createMcpArrangement({ blankKind: "sampler" });
    const track = summariseArrangement(arrangementId, getMcpArrangement(arrangementId)!).tracks[0]!;
    const result = setMcpTrackInstrument(arrangementId, track.id, "salamander-grand");
    expect(result.summary.tracks[0]!.sampleAssetId).toBe("salamander-grand");
    // The warning about a silent sampler goes away once it has one, which is what makes it worth reading.
    expect(result.problems).toEqual([]);
  });

  it("refuses an instrument on a track whose kind does not play one, rather than doing nothing", () => {
    // The data layer returns the arrangement unchanged for a non-sampler; a caller that cannot see the screen has to be told instead.
    const { arrangementId } = createMcpArrangement({ blankKind: "drumkit" });
    const track = summariseArrangement(arrangementId, getMcpArrangement(arrangementId)!).tracks[0]!;
    expect(() => setMcpTrackInstrument(arrangementId, track.id, "salamander-grand")).toThrow(/only a sampler track/);
  });

  it("writes a whole step pattern and reads back how many are on", () => {
    const { arrangementId } = createMcpArrangement({ blankKind: "drumkit" });
    const track = summariseArrangement(arrangementId, getMcpArrangement(arrangementId)!).tracks[0]!;
    const written = setMcpTrackSteps(arrangementId, track.id, [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
    expect(written.summary.tracks[0]!.stepsOn).toBe(4);
    expect(written.summary.tracks[0]!.steps).toHaveLength(16);
  });

  it("sets a kind, a name, a flag and a folder", () => {
    const { arrangementId } = createMcpArrangement({ blankKind: "instrument" });
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
    const { arrangementId } = createMcpArrangement({ blankKind: "instrument" });
    expect(() => renameMcpTrack(arrangementId, "track-nope", "x")).toThrow(/its tracks are/);
    expect(() => removeMcpTrack(arrangementId, "track-nope")).toThrow(/no track/);
  });

  it("refuses an unknown arrangement id with the tool that creates one", () => {
    expect(() => addMcpTrack("arrangement-nope", "instrument")).toThrow(/create_arrangement/);
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
    const { arrangementId } = createMcpArrangement({ blankKind: "instrument" });
    const track = summariseArrangement(arrangementId, getMcpArrangement(arrangementId)!).tracks[0]!;
    addMcpTake(arrangementId, { trackId: track.id, source: "midi", startBar: 2, endBar: 4, recordedAt: 1 });
    const regions = getMcpArrangement(arrangementId)!.tracks[0]!.takeRegions;
    expect(regions).toEqual([{ startBar: 2, endBar: 4, takeId: "take-1" }]);
  });

  it("refuses a take id that is not on the track", () => {
    const { arrangementId } = createMcpArrangement({ blankKind: "instrument" });
    const track = summariseArrangement(arrangementId, getMcpArrangement(arrangementId)!).tracks[0]!;
    expect(() => selectMcpTake(arrangementId, track.id, "take-9")).toThrow(/has no take/);
    // Clearing is allowed and is not the same request as choosing one that does not exist.
    expect(selectMcpTake(arrangementId, track.id, null).summary.tracks[0]!.selectedTakeId).toBeUndefined();
  });

  it("reads one line per track, so a caller can log what it built", () => {
    const { arrangementId } = createMcpArrangement({ blankKind: "sampler" });
    const track = summariseArrangement(arrangementId, getMcpArrangement(arrangementId)!).tracks[0]!;
    setMcpTrackInstrument(arrangementId, track.id, "salamander-grand");
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
    const { arrangementId } = createMcpArrangement({ blankKind: "instrument" });
    const track = summariseArrangement(arrangementId, getMcpArrangement(arrangementId)!).tracks[0]!;
    addMcpTake(arrangementId, { trackId: track.id, source: "midi", recordedAt: 1 });
    addMcpTake(arrangementId, { trackId: track.id, source: "midi", recordedAt: 2 });
    const claimed = assignMcpTakeRange(arrangementId, track.id, "take-1", 0, 4);
    expect(claimed.summary.problems).toEqual([]);
    expect(getMcpArrangement(arrangementId)!.tracks[0]!.takeRegions).toEqual([{ startBar: 0, endBar: 4, takeId: "take-1" }]);
    // A second range splits the first rather than overlapping it.
    assignMcpTakeRange(arrangementId, track.id, "take-2", 2, 6);
    expect(getMcpArrangement(arrangementId)!.tracks[0]!.takeRegions).toEqual([
      { startBar: 0, endBar: 2, takeId: "take-1" },
      { startBar: 2, endBar: 6, takeId: "take-2" },
    ]);
  });

  it("refuses a range that ends where it starts, and a take that is not there", () => {
    const { arrangementId } = createMcpArrangement({ blankKind: "instrument" });
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
    const { flattened, bars } = flattenMcpArrangement(arrangementId);
    expect(bars).toBeGreaterThan(0);
    expect(flattened.pattern.tracks.length).toBeGreaterThan(0);
    // The default drum track has every fourth step, so the flattened pattern has steps to play rather than a silent lane.
    expect(flattened.totalSteps).toBeGreaterThan(0);
    expect(flattened.pattern.tracks.some((track) => (track.steps ?? []).some((step) => step !== 0))).toBe(true);
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
    const { arrangementId } = createMcpArrangement({ blankKind: "instrument" });
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
    const { arrangementId } = createMcpArrangement({ blankKind: "instrument" });
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
    const { arrangementId } = createMcpArrangement({ blankKind: "instrument" });
    const result = await importMcpMusicXmlBytes(arrangementId, toBase64(buildMxlZip([["score.musicxml", twoPartXml]])), { partIndex: "all" });
    expect(result.format).toBe("mxl");
    expect(result.summary.tracks.map((track) => track.name)).toContain("Left Hand");
    expect(result.notes).toBe(3);
    expect(result.trackIds).toHaveLength(2);
  });

  it("refuses a part index that is not in the file, naming how many there are", () => {
    const { arrangementId } = createMcpArrangement({ blankKind: "instrument" });
    expect(() => importMcpMusicXml(arrangementId, twoPartXml, { partIndex: 7 })).toThrow(/2 part\(s\), so there is no part 7/);
  });

  it("leaves an empty part out and says so, rather than adding a track that holds nothing", () => {
    const xml = `<?xml version="1.0"?><score-partwise version="4.0">
      <part-list><score-part id="P1"><part-name>Silent</part-name></score-part></part-list>
      <part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes><note><rest/><duration>4</duration></note></measure></part>
    </score-partwise>`;
    const { arrangementId } = createMcpArrangement({ blankKind: "instrument" });
    const result = importMcpMusicXml(arrangementId, xml, { partIndex: "all" });
    expect(result.trackIds).toEqual([]);
    expect(result.problems.join(" ")).toMatch(/"Silent" holds no notes/);
  });
});
