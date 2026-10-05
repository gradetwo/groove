import { beforeEach, describe, expect, it } from "vitest";
import {
  addMcpTrack,
  clearMcpArrangements,
  createMcpArrangement,
  getMcpArrangement,
  renameMcpTrack,
  setMcpArrangementBars,
  undoMcpArrangement,
} from "../../mcp/arrangement";
import { TOOLS } from "../../mcp/registry";

/**
 * ⭐ **A run of changes comes back, and creation is not a change.** The history is recorded inside the one seam every
 * writing tool goes through, so what these assert is what an agent gets: the state before the last change, the state before
 * several, and a refusal when there is nothing behind.
 */
describe("undoing an arrangement", () => {
  beforeEach(() => clearMcpArrangements());

  it("returns the state before the last change, and says what it now stands at", () => {
    const created = createMcpArrangement({ songId: "undo-probe" });
    const before = getMcpArrangement(created.arrangementId)!.bars;
    setMcpArrangementBars(created.arrangementId, 32);
    expect(getMcpArrangement(created.arrangementId)!.bars).toBe(32);
    const back = undoMcpArrangement(created.arrangementId);
    expect(back.summary.arrangementId).toBe(created.arrangementId);
    expect(getMcpArrangement(created.arrangementId)!.bars).toBe(before);
  });

  it("steps back several changes at once", () => {
    const created = createMcpArrangement({ songId: "undo-probe" });
    const id = created.arrangementId;
    setMcpArrangementBars(id, 16);
    setMcpArrangementBars(id, 24);
    setMcpArrangementBars(id, 32);
    undoMcpArrangement(id, 3);
    expect(getMcpArrangement(id)!.bars).toBe(created.bars);
  });

  it("refuses when there is nothing to undo, rather than reporting a change it did not make", () => {
    const created = createMcpArrangement({ songId: "undo-probe" });
    expect(() => undoMcpArrangement(created.arrangementId)).toThrow(/nothing to undo/);
  });

  it("counts a track addition and a rename as changes of their own", () => {
    const created = createMcpArrangement({ songId: "undo-probe" });
    const id = created.arrangementId;
    const added = addMcpTrack(id, "synth", "Keys");
    const trackId = added.summary.tracks[added.summary.tracks.length - 1]!.id;
    renameMcpTrack(id, trackId, "Pads");
    expect(getMcpArrangement(id)!.tracks.some((track) => track.name === "Pads")).toBe(true);
    undoMcpArrangement(id);
    expect(getMcpArrangement(id)!.tracks.some((track) => track.name === "Pads")).toBe(false);
  });

  it("is on the surface under its own name, so an agent can reach the store's history", () => {
    const tool = TOOLS.find((candidate) => candidate.name === "undo_arrangement");
    expect(tool, "undo_arrangement must be on the MCP surface").toBeTruthy();
    expect(tool!.title).toMatch(/arrangement/i);
  });
});
