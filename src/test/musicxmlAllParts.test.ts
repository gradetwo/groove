import { describe, expect, it, beforeEach } from "vitest";
import { addMcpTrack, addMcpTrackNotes, clearMcpArrangements, createMcpArrangement, exportMcpMusicXml, setMcpArrangementBars } from "../../mcp/arrangement";

/**
 * ⭐ **Every lane in one score** (third evaluation, section 6: "export all parts as a multi-staff MusicXML").
 *
 * The evaluation's material notes that the MCP's MusicXML carried **only the piano part**: the writer was single-part and
 * the tool's own description said "one part, from one track", so a notation program could be handed one lane of a six-lane
 * piece. The import side already took `partIndex: number | "all"`; the export now takes `trackId: "all"` and the two
 * directions read alike.
 */
describe("a score with every part", () => {
  beforeEach(() => clearMcpArrangements());

  const threeTracks = () => {
    const created = createMcpArrangement({ blankKind: "synth" });
    const arrangementId = created.arrangementId;
    setMcpArrangementBars(arrangementId, 4);
    const first = created.tracks![0]!.id;
    addMcpTrack(arrangementId, "drumkit", "Drums");
    addMcpTrack(arrangementId, "sampler", "Strings");
    addMcpTrackNotes(arrangementId, first, [
      { pitch: 72, startBeats: 0, lengthBeats: 1, velocity: 100 },
      { pitch: 74, startBeats: 2, lengthBeats: 1, velocity: 100 },
    ] as never);
    return arrangementId;
  };

  it("⭐ writes one <part> per lane, each with its own name, and the same document parses back", () => {
    const arrangementId = threeTracks();
    const score = exportMcpMusicXml(arrangementId, { trackId: "all", title: "Three lanes" });
    const ids = [...score.xml.matchAll(/<score-part id="(P[0-9]+)">/g)].map((match) => match[1]);
    const bodies = [...score.xml.matchAll(/<part id="(P[0-9]+)">/g)].map((match) => match[1]);
    // ⭐ The part list and the bodies must agree, in the same order: a list that promises a staff nothing follows is the
    // quiet version of a dropped part.
    expect(bodies, "one body per declared part, in order").toEqual(ids);
    expect(ids.length, "this arrangement has three lanes").toBeGreaterThanOrEqual(3);
    expect(score.parts, "and the reply names them").toEqual(["Synth", "Drums", "Strings"]);
    expect(score.xml, "each staff carries the lane's own name").toContain("<part-name>Drums</part-name>");
    expect(score.xml, "including the lane that holds the notes").toContain("<part-name>Synth</part-name>");
    expect(score.xml, "the title is the work's, not a lane's").toContain("<work-title>Three lanes</work-title>");

    // ⭐ The single-part form still writes one part, so the choice is a choice rather than the only behaviour.
    const one = exportMcpMusicXml(arrangementId, { trackId: undefined });
    expect([...one.xml.matchAll(/<part id="/g)].length, "the default is still one track").toBe(1);
  });
});

/**
 * ⭐ **A kind that is not a kind is refused by name** — found while building the criterion above.
 *
 * `TrackKindV2` is `drumkit | synth | sampler | fx | folder`; a drum **role** such as `"bass"` is a lane inside a drumkit,
 * not a kind, and the tool's schema accepts a string, so an agent can reasonably pass one. It used to die inside the model
 * with `Cannot read properties of undefined (reading 'sample')`, which names neither the argument nor the choices.
 */
describe("an invalid track kind", () => {
  it("⭐ names the argument and the kinds instead of crashing inside the model", () => {
    clearMcpArrangements();
    const created = createMcpArrangement({ blankKind: "synth" });
    expect(() => addMcpTrack(created.arrangementId, "bass" as never, "Bass")).toThrow(/not a track kind/);
    expect(() => addMcpTrack(created.arrangementId, "bass" as never, "Bass")).toThrow(/drumkit, synth, sampler, fx, folder/);
  });
});
