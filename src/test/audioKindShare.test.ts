import { describe, expect, it } from "vitest";
import { decodeSharePayloadToGenre, encodeGenreToSharePayload } from "../features/customGenre/customGenreCodec";
import { validateSharePayload } from "../features/customGenre/sharePayloadGuard";
import { resolveTrackId } from "../../mcp/pattern";
import type { Genre } from "../types/genre";

/**
 * The ninth kind — `audio` — through the share format, which is the one place the compiler noticed the widening (owner decision 2026-09-28).
 *
 * The reconnaissance that opened this work found that widening the closed union raises exactly **one** type error, because the codebase's dispatch sites are
 * mostly not exhaustive. So the criteria are tests rather than a compiler: an audio lane must survive a round trip with its sample, a genre **without** one must
 * come back with nothing added, and a sample on a lane that cannot play one must be **refused loudly**.
 */
const lane = (track_id: string, extra: Record<string, unknown> = {}) => ({
  track_id,
  name: track_id,
  instrument: "synth",
  steps: Array.from({ length: 16 }, (_, index) => (index === 0 ? 1 : 0)),
  volume: 0.8,
  mute: false,
  swing: 0,
  ...extra,
});

const genre = (tracks: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}) =>
  ({
    id: "custom-test",
    name: "Test",
    category: "Electronic",
    default_bpm: 120,
    time_signature: "4/4",
    sequencer_pattern: { scale: "C Minor", bpm: 120, totalSteps: 16, tracks },
    ...extra,
  }) as unknown as Genre;

const payload = (tracks: Array<Record<string, unknown>>) =>
  JSON.stringify({ v: 1, id: "x", n: "x", cat: "Electronic", bpm: 120, tracks });

describe("the audio kind in the share format", () => {
  it("is addressable by the names a model would write", () => {
    for (const name of ["audio", "sample", "sampler", "loop"]) expect(resolveTrackId(name)).toBe("audio");
  });

  it("survives a round trip with its lane name and its sample id", async () => {
    const encoded = await encodeGenreToSharePayload(
      genre([lane("kick"), lane("audio", { laneId: "riser", sample: { assetId: "riser-01" } })])
    );
    const decoded = await decodeSharePayloadToGenre(encoded);
    expect(decoded).not.toBeNull();
    const audio = decoded!.sequencer_pattern!.tracks.find((track) => track.track_id === "audio")!;
    expect(audio).toBeTruthy();
    expect(audio.laneId).toBe("riser");
    expect(audio.sample?.assetId).toBe("riser-01");
  });

  it("adds nothing to a genre that has no audio lane and no lane name", async () => {
    const decoded = await decodeSharePayloadToGenre(await encodeGenreToSharePayload(genre([lane("kick"), lane("lead")])));
    for (const track of decoded!.sequencer_pattern!.tracks) {
      expect(track.laneId).toBeUndefined();
      expect(track.sample).toBeUndefined();
      expect(JSON.stringify(track)).not.toContain("assetId");
    }
  });

  it("shares a genre that has no cultural context — the bug the round trip found", async () => {
    // The encoder wrote `ctx: { en: "", zh: "" }` for a genre without context, and its own guard refuses that (`invalid cultural context`), so such a genre
    // could not be shared at all: share → import → share failed. Omitting the key lets the guard's default apply, so the decoded genre has real context again.
    const decoded = await decodeSharePayloadToGenre(await encodeGenreToSharePayload(genre([lane("kick")])));
    expect(decoded).not.toBeNull();
    expect(decoded!.cultural_context?.en ?? "").not.toBe("");
    expect(decoded!.cultural_context?.zh ?? "").not.toBe("");
  });

  it("accepts an audio lane with a sample, keeping both the sample id and the lane name", () => {
    const result = validateSharePayload(payload([{ t: "audio", s: [1, 0, 0, 0], sa: "riser-01", l: "riser" }]));
    expect(result.ok, JSON.stringify(result)).toBe(true);
    // The guard **rebuilds** each entry, so this is the check that it copies the two new keys rather than dropping them silently.
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
