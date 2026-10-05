import { beforeEach, describe, expect, it } from "vitest";
import { clearMcpArrangements, getMcpArrangement } from "../../mcp/arrangement";
import { TOOLS } from "../../mcp/registry";

/**
 * ⭐ **A name to tell one arrangement from another.** The v1 creator offered this and the arrangement did not, so a list of
 * arrangements could only be told apart by id. Absence stays absence rather than becoming an empty string, which is the
 * model's habit everywhere else.
 */
const call = async (name: string, args: Record<string, unknown>) => {
  const tool = TOOLS.find((candidate) => candidate.name === name);
  expect(tool, `${name} must be on the surface`).toBeTruthy();
  return (await tool!.handler(args, {} as never)) as Record<string, unknown>;
};

describe("naming an arrangement", () => {
  beforeEach(() => clearMcpArrangements());

  it("keeps the name a caller gives, and reads it back", async () => {
    const created = await call("create_arrangement", { blankKind: "synth", name: "chorus idea" });
    expect(created.name, JSON.stringify(created).slice(0, 140)).toBe("chorus idea");
    const read = await call("get_arrangement", { arrangementId: created.arrangementId });
    expect(read.name).toBe("chorus idea");
    expect(getMcpArrangement(String(created.arrangementId))?.name).toBe("chorus idea");
  });

  it("leaves the name absent when nobody gave one, rather than empty", async () => {
    const created = await call("create_arrangement", { blankKind: "synth" });
    expect("name" in created ? created.name : undefined).toBeUndefined();
    expect(getMcpArrangement(String(created.arrangementId))?.name).toBeUndefined();
  });
});
