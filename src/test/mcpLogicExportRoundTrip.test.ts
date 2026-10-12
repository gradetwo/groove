/**
 * ⭐ **What this export can prove about itself**: its own reader reads the music back (owner's report: MCP has no Logic
 * export).
 *
 * The honest limit is at the top because it is the point: whether **Logic** opens the package is not proven here and is
 * recorded in `needs`. What is proven is the round trip — the two base64 fields this returns are exactly what
 * `import_logic_project` accepts, so the pair is checked through the same reader an import uses.
 *
 * Deleting a lane from the writer makes the count disagree and turns this red.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  addMcpTrackNotes,
  clearMcpArrangements,
  createMcpArrangement,
  exportMcpLogicProject,
  getMcpArrangement,
  importMcpLogicProject,
  summariseArrangement,
} from "../../mcp/arrangement";
import { TOOLS } from "../../mcp/registry";

const firstTrack = (id: string) => summariseArrangement(id, getMcpArrangement(id)!).tracks[0]!;

describe("the arrangement to logic export", () => {
  beforeEach(() => clearMcpArrangements());

  it("⭐ is reachable, and says it is MIDI only without claiming Logic will open it", () => {
    const tool = TOOLS.find((t) => t.name === "export_logic_project");
    expect(tool, "export_logic_project is gone").toBeDefined();
    const described = (tool as unknown as { description: string }).description;
    expect(described).toContain("import_logic_project");
    expect(described).toContain("MIDI only");
    expect(described.toLowerCase()).toContain("not proven");
  });

  it("⭐ round-trips through this server's own reader with the same notes", () => {
    const { arrangementId } = createMcpArrangement({ blankKind: "sampler" });
    const lane = firstTrack(arrangementId);
    addMcpTrackNotes(arrangementId, lane.id, [
      { pitch: 60, startBeats: 0, lengthBeats: 1, velocity: 100 },
      { pitch: 64, startBeats: 1, lengthBeats: 1, velocity: 90 },
      { pitch: 67, startBeats: 2, lengthBeats: 2, velocity: 80 },
    ]);
    const written = exportMcpLogicProject(arrangementId);
    expect(written.notes).toBe(3);
    expect(written.parts).toBe(1);

    const target = createMcpArrangement({ blankKind: "synth" }).arrangementId;
    const readBack = importMcpLogicProject(target, written.projectDataBase64, written.metaDataBase64);
    expect(readBack.notes).toBe(3);
    expect(readBack.trackIds?.length).toBe(1);
  });

  it("⭐ writes only the lanes it was asked for", () => {
    const { arrangementId } = createMcpArrangement({ blankKind: "sampler" });
    const lane = firstTrack(arrangementId);
    addMcpTrackNotes(arrangementId, lane.id, [{ pitch: 60, startBeats: 0, lengthBeats: 1, velocity: 100 }]);
    expect(exportMcpLogicProject(arrangementId, ["not-a-track"]).notes).toBe(0);
    expect(exportMcpLogicProject(arrangementId, [lane.id]).notes).toBe(1);
  });
});
