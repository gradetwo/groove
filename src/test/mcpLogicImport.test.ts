/**
 * The **MCP** half of the Logic import — where the reader meets the arrangement model, and where the one property
 * that keeps three imports from becoming three behaviours is asserted.
 *
 * `src/data/logicToArrangement.ts` answers "what does the file say". This file answers "does what it says land the
 * way the MusicXML and MIDI imports land". That is criterion 5, and it is the criterion with a real failure mode: a
 * Logic importer that built its own track and wrote its own notes would pass every data-layer test in the suite and
 * still be the second implementation this repository's own principle forbids — two imports that drift apart about
 * note order and track naming the first time either changes.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  clearMcpArrangements,
  createMcpArrangement,
  importMcpLogicProject,
  importMcpMidi,
  importMcpMusicXml,
} from "../../mcp/arrangement";
import { resetTrackIdsForTests } from "../data/arrangementEdits";
import { buildLogicProjectData, buildMetaDataPlist } from "./fixtures/logic_project.mjs";

beforeEach(() => {
  clearMcpArrangements();
  resetTrackIdsForTests();
});

/** A two-region project, base64-encoded the way an MCP argument carries it. */
function logicArgs(overrides: { audio?: boolean } = {}) {
  const project = buildLogicProjectData({
    bpm: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    regions: [
      { name: "Piano", notes: [{ startTicks: 0, pitch: 60, velocity: 100, lengthTicks: 480 }, { startTicks: 960, pitch: 64, velocity: 90, lengthTicks: 240 }] },
      { name: "Bass", notes: [{ startTicks: 0, pitch: 36, velocity: 110, lengthTicks: 960 }] },
      ...(overrides.audio === true ? [{ name: "Vocal", notes: [], audioName: "vocal.aif" }] : []),
    ],
  });
  return {
    projectDataBase64: Buffer.from(project).toString("base64"),
    metaDataBase64: Buffer.from(buildMetaDataPlist({ bpm: 120, numerator: 4, denominator: 4 })).toString("base64"),
  };
}

describe("MCP · importing a Logic project", () => {
  it("adds a track per region, with the notes attached to the tracks it named", () => {
    const { arrangementId } = createMcpArrangement({ blankKind: "instrument" });
    const result = importMcpLogicProject(arrangementId, logicArgs().projectDataBase64, logicArgs().metaDataBase64, { partIndex: "all" });
    expect(result.trackIds).toHaveLength(2);
    expect(result.notes).toBe(3);
    const [piano, bass] = result.trackIds!.map((id) => result.summary.tracks.find((track) => track.id === id)!);
    expect(piano!.name).toBe("Piano");
    expect(piano!.notes.map((note) => note.pitch)).toEqual([60, 64]);
    expect(bass!.notes.map((note) => note.pitch)).toEqual([36]);
    // The tempo and meter travel back, so a caller can set the arrangement from the project rather than guessing 120.
    expect(result.tempoBpm).toBe(120);
    expect(result.timeSignature).toBe("4/4");
  });

  it("takes one part by default and refuses a part that is not there, naming how many there are", () => {
    const { arrangementId } = createMcpArrangement({ blankKind: "instrument" });
    const args = logicArgs();
    const first = importMcpLogicProject(arrangementId, args.projectDataBase64, args.metaDataBase64);
    expect(first.trackIds).toHaveLength(1);
    expect(first.summary.tracks.find((track) => track.id === first.trackIds![0])!.name).toBe("Piano");
    expect(() => importMcpLogicProject(arrangementId, args.projectDataBase64, args.metaDataBase64, { partIndex: 9 })).toThrow(/2 part\(s\), so there is no part 9/);
  });

  it("carries the problems through to the caller, audio tracks and all", () => {
    // ⭐ **Criterion 2 at the tool boundary.** An agent that never reads `problems` has still been told, and one that
    // does read them can act; what must not happen is an import that reports success and silently loses the audio.
    const { arrangementId } = createMcpArrangement({ blankKind: "instrument" });
    const args = logicArgs({ audio: true });
    const result = importMcpLogicProject(arrangementId, args.projectDataBase64, args.metaDataBase64, { partIndex: "all" });
    const audio = (result.problems ?? []).find((problem) => problem.includes("audio region reference"));
    expect(audio, (result.problems ?? []).join(" | ")).toBeDefined();
    expect(audio).toContain("no audio track kind");
    expect(result.notes).toBe(3);
  });

  it("refuses empty base64 with a sentence rather than importing nothing", () => {
    const { arrangementId } = createMcpArrangement({ blankKind: "instrument" });
    expect(() => importMcpLogicProject(arrangementId, "", logicArgs().metaDataBase64)).toThrow(/projectDataBase64/);
  });

  it("⛔ writes notes down **one** road: through `addImportedParts`, like MusicXML and MIDI", () => {
    /**
     * ⭐ **Criterion 5, and the reason it is asked in two directions.**
     *
     * The behavioural half above (the notes are on the tracks the reply named) shows the road *works*. This half shows
     * there is only **one** of them: it reads `mcp/arrangement.ts` and counts the calls. `addImportedParts` is the
     * single place any import writes notes, so a Logic importer that opened its own `edit(...)` and set `notesByTrack`
     * itself would fail here even while every behavioural assertion still passed — which is precisely the second
     * implementation the criterion exists to forbid.
     *
     * This is a structural assertion on purpose. The alternative is to mock the module and assert the call, which
     * tests the mock as much as the code; what a future reader needs to know is that there is one road, and that is
     * a fact about the file.
     */
    const source = readFileSync("mcp/arrangement.ts", "utf8");
    const definitions = [...source.matchAll(/^function addImportedParts\s*\(/gm)];
    expect(definitions, "addImportedParts is defined once").toHaveLength(1);
    // Every call site: the definition, plus one per producer. The comment `addImportedParts(` with no `function` in
    // front of it is a call — and the count is what changes when a fourth import grows its own landing.
    const calls = [...source.matchAll(/(?<!function )addImportedParts\(/g)];
    // One definition plus exactly three producers: MusicXML, MIDI, and Logic.
    expect(calls.length, `addImportedParts is called by exactly the three importers, found ${calls.length - 1}`).toBe(4);
    for (const producer of ["importMcpMusicXml(", "importMcpMidi(", "importMcpLogicProject("]) {
      const at = source.indexOf(`export function ${producer}`);
      expect(at, `${producer} is exported`).toBeGreaterThan(0);
      const body = source.slice(at, source.indexOf("\n}\n", at));
      expect(body, `${producer} must reach addImportedParts`).toContain("addImportedParts(");
      // …and must not have grown its own landing: no direct `edit(` and no hand-written `notesByTrack`.
      expect(body, `${producer} must not write notes down its own road`).not.toContain("edit(");
      expect(body, `${producer} must not hand-write notesByTrack`).not.toContain("notesByTrack");
    }
  });

  it("shares the empty-part rule with the other imports rather than inventing one", () => {
    // The rule lives in `addImportedParts`: a part with no notes is one more row to delete, so it is left out and
    // said out loud. An importer with its own landing would have had to write this rule a second time.
    const { arrangementId } = createMcpArrangement({ blankKind: "instrument" });
    const args = logicArgs();
    const result = importMcpLogicProject(arrangementId, args.projectDataBase64, args.metaDataBase64, { partIndex: "all" });
    expect(result.trackIds).toHaveLength(2);
    // A new arrangement arrives with one track of its own, so three here means the two the import added are the two
    // the reply named — and not four, which is what a same-name-but-own-landing importer would produce.
    expect(result.summary.tracks).toHaveLength(3);
    expect(result.summary.tracks.map((track) => track.name)).toEqual(["Instrument", "Piano", "Bass"]);
  });

  it("takes the same `partIndex` union the MusicXML and MIDI tools take", () => {
    // The schema mirrors `import_arrangement_midi`'s: a number, or `"all"` — a union rather than a number plus an
    // `allParts` flag, so "part three, or every part" stays unrepresentable.
    const { arrangementId } = createMcpArrangement({ blankKind: "instrument" });
    const args = logicArgs();
    expect(importMcpLogicProject(arrangementId, args.projectDataBase64, args.metaDataBase64, { partIndex: 0 }).trackIds).toHaveLength(1);
    const all = importMcpLogicProject(arrangementId, args.projectDataBase64, args.metaDataBase64, { partIndex: "all" });
    expect(all.trackIds).toHaveLength(2);
  });

  it("sits beside the other two imports without disturbing them", () => {
    // A cheap cross-check that the new producer did not move the road under the other two: MIDI still lands, and
    // MusicXML still lands, in the same arrangement as the Logic import.
    const { arrangementId } = createMcpArrangement({ blankKind: "instrument" });
    const args = logicArgs();
    importMcpLogicProject(arrangementId, args.projectDataBase64, args.metaDataBase64, { partIndex: "all" });
    const xml = `<?xml version="1.0"?><score-partwise version="4.0">
      <part-list><score-part id="P1"><part-name>Lead</part-name></score-part></part-list>
      <part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes><note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration></note></measure></part>
    </score-partwise>`;
    const result = importMcpMusicXml(arrangementId, xml, { partIndex: "all" });
    expect(result.summary.tracks.map((track) => track.name)).toEqual(expect.arrayContaining(["Piano", "Bass", "Lead"]));
    expect(typeof importMcpMidi).toBe("function");
  });
});
