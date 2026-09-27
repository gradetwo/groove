import { afterEach, describe, expect, it } from "vitest";
import { clearMcpSongs, createMcpSong, getMcpSong, setMcpTempo } from "../../mcp/song";

/**
 * Decision 2b at the tool boundary: setting a tempo map is a **validated** write, and a rejected one leaves the song alone.
 *
 * Reading ignores a point it cannot use, which is right for somebody else's file; a caller who is *writing* a map should be told, because a silently dropped
 * point means the tempo they asked for is not the tempo they get.
 */
const clip = () => ({
  genre_id: "custom",
  bpm: 120,
  totalSteps: 16,
  tracks: [{ track_id: "kick", name: "Kick", instrument: "drum", steps: new Array(16).fill(0) }],
});

const song = () => createMcpSong({ genreId: "custom", pattern: clip() } as never).songId;

afterEach(() => clearMcpSongs());

describe("setMcpTempo", () => {
  it("leaves the reported length alone when the map is empty, and removes the key entirely", () => {
    const songId = song();
    const before = setMcpTempo(songId, []).summary.secondsEstimate;
    const raw = getMcpSong(songId) as never as Record<string, unknown>;
    expect(raw).not.toHaveProperty("tempoTrack");
    expect(before).toBeCloseTo(Number((16 * (60 / 120 / 4)).toFixed(1)), 6);
  });

  it("makes the reported length follow the map", () => {
    const songId = song();
    const plain = setMcpTempo(songId, []).summary.secondsEstimate;
    const doubled = setMcpTempo(songId, [{ atBar: 0, bpm: 240 }]).summary.secondsEstimate;
    expect(doubled).toBeCloseTo(plain / 2, 1);
    expect((getMcpSong(songId) as never as { tempoTrack?: unknown[] }).tempoTrack).toHaveLength(1);
  });

  it("rejects an unreadable point and changes nothing, rather than dropping it", () => {
    const songId = song();
    setMcpTempo(songId, [{ atBar: 0, bpm: 90 }]);
    const before = JSON.stringify(getMcpSong(songId));

    for (const bad of [
      [{ atBar: -1, bpm: 120 }],
      [{ atBar: 0, bpm: 0 }],
      [{ atBar: 1.5, bpm: 120 }],
      [{ atBar: 0, bpm: 120, curve: "bend" as never }],
    ]) {
      const result = setMcpTempo(songId, bad as never);
      expect(result.problems.length, JSON.stringify(bad)).toBeGreaterThan(0);
    }
    // Not one of those attempts touched the store.
    expect(JSON.stringify(getMcpSong(songId))).toBe(before);
  });

  it("clears a map back to the song's own tempo when given an empty list", () => {
    const songId = song();
    setMcpTempo(songId, [{ atBar: 0, bpm: 240 }]);
    const cleared = setMcpTempo(songId, []);
    expect(cleared.problems).toEqual([]);
    expect(getMcpSong(songId) as never as Record<string, unknown>).not.toHaveProperty("tempoTrack");
    expect(cleared.summary.secondsEstimate).toBeCloseTo(Number((16 * (60 / 120 / 4)).toFixed(1)), 6);
  });
});
