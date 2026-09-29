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
  clearMcpArrangements,
  createMcpArrangement,
  describeMcpArrangement,
  getMcpArrangement,
  removeMcpTrack,
  renameMcpTrack,
  selectMcpTake,
  setMcpTrackFlag,
  setMcpTrackInstrument,
  setMcpTrackKind,
  setMcpTrackParent,
  setMcpTrackSteps,
  summariseArrangement,
} from "../../mcp/arrangement";
import { resetTrackIdsForTests } from "../data/arrangementEdits";

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
});
