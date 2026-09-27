import { describe, expect, it } from "vitest";
import { validateSharePayload } from "../features/customGenre/sharePayloadGuard";
import { resolveTrackId } from "../../mcp/pattern";

/**
 * The ninth kind — `audio` — through the share **guard**, which is where the format's loud failures live (owner decision 2026-09-28).
 *
 * The reconnaissance that opened this work: widening the closed union raises exactly **one** type error, because the codebase's dispatch sites are mostly not
 * exhaustive. So the criteria here are tests rather than a compiler.
 *
 * Two things this file already corrected in me: `validateSharePayload` takes a **JSON string**, not an object (passing an object earns `empty payload`, which
 * looks like a schema complaint and is not), and the guard **rebuilds** every track entry — so anything it does not copy is dropped in silence. The round-trip
 * through `encodeGenreToSharePayload` is the next thing to pin; it is deliberately not asserted here until its encoder-side behaviour is read.
 */
const payload = (tracks: Array<Record<string, unknown>>) => JSON.stringify({ v: 1, id: "x", n: "x", cat: "Electronic", bpm: 120, tracks });

describe("the audio kind in the share guard", () => {
  it("is addressable by the names a model would write", () => {
    for (const name of ["audio", "sample", "sampler", "loop"]) expect(resolveTrackId(name)).toBe("audio");
  });

  it("accepts an audio lane with a sample, keeping both the sample id and the lane name", () => {
    const result = validateSharePayload(payload([{ t: "audio", s: [1, 0, 0, 0], sa: "riser-01", l: "riser" }]));
    expect(result.ok, JSON.stringify(result)).toBe(true);
    // The guard rebuilds each entry, so this is the check that it copies the two new keys rather than dropping them silently.
    expect(JSON.stringify(result)).toContain("riser-01");
    expect(JSON.stringify(result)).toContain("riser");
  });

  it("refuses a sample on a lane that cannot play one, rather than dropping it", () => {
    const result = validateSharePayload(payload([{ t: "kick", s: [1, 0, 0, 0], sa: "riser-01" }]));
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).toMatch(/sample id is only meaningful on an audio lane/);
  });

  it("still refuses an id that is not a lane kind, so opening the union did not open it wide", () => {
    const result = validateSharePayload(payload([{ t: "trombone", s: [1, 0, 0, 0] }]));
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).toMatch(/unknown track id/);
  });
});
