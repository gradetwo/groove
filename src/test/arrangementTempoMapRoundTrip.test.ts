import { beforeEach, describe, expect, it } from "vitest";
import {
  clearMcpArrangements,
  createMcpArrangement,
  getMcpArrangement,
  setMcpArrangementTempoMap,
} from "../../mcp/arrangement";

/**
 * ⭐ **The map written through the tool, and read back.** The arrangement's tempo map had two criteria and both measured the
 * description of its tool: sentence lengths, quotations, prose that still says what it said. None of them wrote a map and
 * looked at it, so nothing guarded the round trip the older tool's retirement depends on. This is that reading.
 *
 * The points are the worked example's own — 66 at bar zero, 84 at bar thirty two, 66 again at sixty four — so the one place
 * the semantics are written down and the one place they are asserted agree.
 */
const march = [
  { atBar: 0, bpm: 66 },
  { atBar: 32, bpm: 84 },
  { atBar: 64, bpm: 66 },
];

describe("an arrangement's tempo map, written through the tool", () => {
  beforeEach(() => {
    clearMcpArrangements();
  });

  it("keeps every point in order, so a movement's speeds survive the round trip", () => {
    const created = createMcpArrangement({ songId: "tempo-probe" });
    const written = getMcpArrangement(created.arrangementId)!;
    expect(written).toBeTruthy();

    const result = setMcpArrangementTempoMap(created.arrangementId, march);
    expect(result.summary.arrangementId).toBe(created.arrangementId);

    const read = getMcpArrangement(created.arrangementId)!;
    expect(read.tempoTrack).toEqual(march);
  });

  it("replaces the whole map rather than appending to it, which is what 'the map' means", () => {
    const created = createMcpArrangement({ songId: "tempo-probe" });
    setMcpArrangementTempoMap(created.arrangementId, march);
    setMcpArrangementTempoMap(created.arrangementId, [{ atBar: 0, bpm: 96, curve: "linear" }]);
    expect(getMcpArrangement(created.arrangementId)!.tempoTrack).toEqual([{ atBar: 0, bpm: 96, curve: "linear" }]);
  });
});
