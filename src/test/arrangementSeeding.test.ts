import { beforeEach, describe, expect, it } from "vitest";
import { clearMcpArrangements } from "../../mcp/arrangement";
import { TOOLS } from "../../mcp/registry";

/**
 * ⭐ **A genre seeds the tracks, which is the ability the v1 creator had.** The baseline is measured in the test rather than
 * assumed: a blank arrangement already carries one default track, so the assertions compare the seeded result against that
 * blank one instead of against zero or empty.
 */
const call = async (args: Record<string, unknown>) => {
  const tool = TOOLS.find((candidate) => candidate.name === "create_arrangement");
  expect(tool, "create_arrangement must be on the surface").toBeTruthy();
  return (await tool!.handler(args, {} as never)) as {
    arrangementId?: string;
    tracks?: Array<{ id?: string; kind?: string; name?: string }>;
    isError?: boolean;
    content?: Array<{ text?: string }>;
  };
};

describe("seeding an arrangement from a genre", () => {
  beforeEach(() => clearMcpArrangements());

  it("seeds its tracks from a real genre, and they are not the default one", async () => {
    const blank = await call({ blankKind: "synth" });
    const seeded = await call({ blankKind: "synth", genreId: "chicago-house" });
    expect(seeded.isError, JSON.stringify(seeded).slice(0, 160)).toBeFalsy();
    const blankKeys = (blank.tracks ?? []).map((track) => `${track.kind}/${track.name}`).sort();
    const seededKeys = (seeded.tracks ?? []).map((track) => `${track.kind}/${track.name}`).sort();
    expect(seededKeys, `blank=${blankKeys.join(",")} seeded=${seededKeys.join(",")}`).not.toEqual(blankKeys);
  });

  it("refuses an unknown genre before creating anything, and names the argument", async () => {
    const reply = await call({ blankKind: "synth", genreId: "no-such-genre" });
    expect(reply.isError, JSON.stringify(reply).slice(0, 160)).toBe(true);
    expect(reply.content?.[0]?.text ?? "").toContain("genreId");
  });

  it("still makes the same blank arrangement when no genre is given", async () => {
    const first = await call({ blankKind: "synth" });
    const second = await call({ blankKind: "synth" });
    const keys = (r: typeof first) => (r.tracks ?? []).map((track) => `${track.kind}/${track.name}`).sort();
    expect(keys(second)).toEqual(keys(first));
    expect(keys(first).length).toBeGreaterThan(0);
  });
});
