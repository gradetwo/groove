import { afterEach, describe, expect, it } from "vitest";
import { clearMcpArrangements, getMcpArrangement, putMcpArrangement } from "../../mcp/arrangement";
import type { ArrangementV2 } from "../types/arrangementV2";

const arrangement = () => ({ songId: "s1", tracks: [{ id: "t1", kind: "sampler", name: "Keys", channel: 1 }], sourceSlots: [] }) as unknown as ArrangementV2;

describe("putting an arrangement into the store", () => {
  afterEach(() => clearMcpArrangements());

  it("stores it under a fresh id, and a second import does not collide with the first", () => {
    const first = putMcpArrangement(arrangement());
    const second = putMcpArrangement(arrangement());
    expect(first.arrangementId).not.toBe(second.arrangementId);
    expect(getMcpArrangement(first.arrangementId)?.tracks).toHaveLength(1);
    expect(getMcpArrangement(second.arrangementId)?.tracks).toHaveLength(1);
  });

  it("takes an id when the caller has one, so a test can predict it", () => {
    const summary = putMcpArrangement(arrangement(), "fixed-id");
    expect(summary.arrangementId).toBe("fixed-id");
    expect(getMcpArrangement("fixed-id")).toBeTruthy();
  });
});
