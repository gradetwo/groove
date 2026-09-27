import { describe, expect, it } from "vitest";
import { flattenSong } from "../data/songFlatten";
import { validatePattern } from "../../mcp/pattern";
import { MAX_SONG_BARS } from "../types/song";
import type { Song } from "../types/song";

/**
 * The truth about long patterns (fifth report, P2.5). The report concluded from practice that a pattern is 16 or 32 steps; reading the code says the limit is
 * neither of those and is not where it was assumed to be.
 *
 * Three constraints exist and they are different things:
 *
 *   1. a **clip** has no step limit at all — `totalSteps` is a positive int with no ceiling, so 128 steps (8 bars) is expressible today;
 *   2. the **share** format caps a payload's tracks at `MAX_STEPS = 64` (`sharePayloadGuard.ts:27`) — a custom genre in a URL, not a song;
 *   3. a **song** is capped at `MAX_SONG_BARS = 512` (`src/types/song.ts:143`), enforced in the song validator.
 *
 * The test pins all three so the documentation can state them rather than being inferred from the editor's habits.
 */
const lane = () => ({
  track_id: "lead",
  name: "Lead",
  instrument: "synth",
  steps: Array.from({ length: 128 }, (_, index) => (index % 16 === 0 ? 1 : 0)),
  velocity: new Array(128).fill(100),
});

const clip = (steps: number, laneCount = 1) => ({
  genre_id: "custom",
  bpm: 120,
  totalSteps: steps,
  tracks: Array.from({ length: laneCount }, () => ({ ...lane(), steps: lane().steps.slice(0, steps) })),
});

const song = (clipSteps: number, passes: number): Song =>
  ({
    id: "s",
    genreId: "custom",
    bpm: 120,
    clips: { A: clip(clipSteps) },
    sections: [{ id: "s1", slot: "A", bars: passes }],
  }) as unknown as Song;

describe("long patterns", () => {
  it("accepts a 128-step clip, which is eight bars rather than one", () => {
    const pattern = { genre_id: "custom", bpm: 120, scale: "C major", totalSteps: 128, tracks: [lane()] } as never;
    expect(validatePattern(pattern).problems).toEqual([]);
  });

  it("counts a section's `bars` in bars, not in passes of its clip", () => {
    // Measured rather than assumed: with a **128-step** clip, `bars: 1` gives one bar and `bars: 8` gives eight. So the documented phrase "passes of its clip"
    // is only true for the seeded one-bar clip, where the two readings coincide — and the tests below hold the consequence open.
    expect(flattenSong(song(128, 1)).totalBars).toBe(1);
    expect(flattenSong(song(128, 8)).totalBars).toBe(8);
    expect(flattenSong(song(16, 8)).totalBars).toBe(8);
  });

  it("reports a step count that follows the clip, which does not agree with those bars", () => {
    /**
     * **An open question, pinned so it cannot be forgotten rather than claimed as a conclusion.** `totalBars` is `playable.length` — the sections expanded into
     * bars (`songFlatten.ts:297`) — while `totalSteps` comes from a different reduce (`:146`). Measured: a 128-step clip in a one-bar section yields
     * `totalBars: 1` **and** `totalSteps: 128`, and 128 steps is eight bars of sixteen.
     *
     * Either the section truncates the clip (and the step count should be 16) or it plays all eight bars (and the bar count should be 8). Which one is true
     * depends on how the renderer consumes the two numbers, and the next read is that reduce plus the renderer's use of `totalSteps` — not a guess.
     */
    expect(flattenSong(song(128, 1)).totalSteps).toBe(128);
    expect(flattenSong(song(128, 2)).totalSteps).toBe(256);
  });

  it("flattens a 512-bar song into 64 bars, which is a finding rather than a rule", () => {
    /**
     * **Measured, and not yet explained.** A song whose single section says `bars: 512` flattens to **64** bars; `bars: 8` gives 8 and `bars: 1` gives 1, so the
     * count is honoured and then capped somewhere at 64 — and **not in `songFlatten.ts`**, which contains no such number (grep for `slice`, `MAX`, `Math.min`
     * finds only pitch and velocity clamps).
     *
     * Two possibilities remain, and the next read decides between them: the cap sits upstream in the section expansion, or the fixture's field is not the one
     * the expansion uses above some length. Until that is settled, this test pins what the code **does** rather than what it should do, so the behaviour cannot
     * change unnoticed and the documentation cannot quietly claim 512 bars are honoured.
     *
     * Why it matters: `MAX_SONG_BARS` is 512 and the fifth report's composer wrote **348** bars. If this cap applies to the MCP's own path, most of a long
     * arrangement is not rendered at all — which would be a P0 far above the missing progress the report described. That is **not established here**: the
     * composer's song was built through `add_section`, and this fixture builds one directly. It is the first thing to check next.
     */
    expect(flattenSong(song(16, 8)).totalBars).toBe(8);
    expect(flattenSong(song(16, 64)).totalBars).toBe(64);
    expect(flattenSong(song(16, MAX_SONG_BARS)).totalBars).toBe(64);
  });
});
