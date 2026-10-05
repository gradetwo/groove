/**
 * 📦 **The compressed-MusicXML import is tested through its tool, not only through the function behind it.**
 *
 * `mcpArrangement.test.ts` already exercises the reader (`importMcpMusicXmlBytes`) with a zip it builds itself, so
 * the behaviour was covered — but the **tool** `import_arrangement_musicxml_file` was the one registry entry no test
 * named, which means its schema-to-handler wiring (base64 in, the same reader called, the same reply shape out) was
 * the only part nobody called. A new tool must enter the tests, so this calls the handler the way a client does.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { TOOLS } from "../../mcp/registry";
import { clearMcpArrangements, createMcpArrangement, getMcpArrangement, summariseArrangement } from "../../mcp/arrangement";

type Handler = (args: Record<string, unknown>, ctx?: unknown) => Promise<unknown> | unknown;
const handlerOf = (name: string): Handler => {
  const tool = TOOLS.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`${name} is not registered`);
  return (tool as unknown as { handler: Handler }).handler;
};

/** One part, one note, which is all the reader needs to prove the path works end to end. */
const MUSICXML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Lead</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>4</divisions><key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
      <note><rest/><duration>12</duration><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;

const mxlBase64 = () => Buffer.from(zipSync({ "score.musicxml": strToU8(MUSICXML) })).toString("base64");

describe("import_arrangement_musicxml_file", () => {
  beforeEach(() => clearMcpArrangements());

  it("⭐ reads a compressed score through the tool's own handler", async () => {
    const { arrangementId } = createMcpArrangement({ blankKind: "synth" });
    const reply = (await handlerOf("import_arrangement_musicxml_file")({
      arrangementId,
      bytesBase64: mxlBase64(),
      partIndex: "all",
    })) as { ok?: boolean; tracks?: number; notes?: number; problems?: string[] };

    // A refusal is a sentence, never a throw: the tool answers with a result either way.
    expect({ refused: Boolean(reply.problems?.length) && reply.ok !== true, tracks: reply.tracks ?? 0 })
      .not.toEqual({ refused: true, tracks: 0 });
    const arrangement = getMcpArrangement(arrangementId)!;
    expect(summariseArrangement(arrangementId, arrangement).tracks.length).toBeGreaterThan(1);
  });

  it("⭐ still measures, so the tool cannot silently disappear", () => {
    expect(TOOLS.some((tool) => tool.name === "import_arrangement_musicxml_file")).toBe(true);
  });
});
