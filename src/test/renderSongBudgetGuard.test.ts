/**
 * **`maxDurationSec` refuses in one shape, at every magnitude — and says what to do about it.**
 *
 * The owner's creation test reported this guard behaving inconsistently: 8 bars at 72 bpm (~640 s) "returned empty"
 * while 4 bars "refused clearly". Reproduced against the built server, both over-budget cases return the identical
 * structured failure, and the arithmetic says why the report's numbers cannot have come from `create_song`: at
 * 72 bpm a 640 s song is **3072 steps**, i.e. 24 bars — while *every* one of the 159 genres' 8-bar patterns at 72 bpm
 * tops out at **213.3 s**. The guard has one `if` and one `return`, so there was no second shape to be inconsistent
 * with (the full before/after JSON is in the report; this criterion keeps it that way).
 *
 * It also pins the directions the refusal names, because a refusal that only says "no" wastes the one moment a caller
 * is reading — `sampleRate` and `channels` are the two levers that make a long render affordable, and the estimate
 * they do *not* change is stated so the message is not read as a promise that they pass the guard.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { TOOLS } from "../../mcp/registry";
import { findGenre } from "../../mcp/library";
import { clearMcpSongs, createMcpSong } from "../../mcp/song";

type HandlerResult = { content?: Array<{ text?: string }>; isError?: boolean; structuredContent?: unknown };

const renderSong = TOOLS.find((tool) => tool.name === "render_song")!.handler as (
  args: Record<string, unknown>,
  ctx: Record<string, unknown>
) => Promise<HandlerResult>;

const refusal = (result: HandlerResult) => String(result.content?.[0]?.text ?? "");

const song = (bars: number, bpm: number) =>
  createMcpSong({ genreId: "chicago-house", genre: findGenre("chicago-house")!, bars, bpm, name: "guard" });

describe("the maxDurationSec guard", () => {
  beforeEach(() => clearMcpSongs());

  it("refuses a song over the budget, names the numbers, and names the levers", async () => {
    const created = song(24, 72);
    expect(created.secondsEstimate).toBe(640);
    const result = await renderSong({ songId: created.songId, maxDurationSec: 600 }, {});

    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    const message = refusal(result);
    expect(message).toContain("640s");
    expect(message).toContain("maxDurationSec is 600s");
    // The ways forward, and the two that only make the render cheaper.
    expect(message).toMatch(/shorten the arrangement/);
    expect(message).toMatch(/render one section with render_audio/);
    expect(message).toMatch(/sampleRate/);
    expect(message).toMatch(/channels/);
  });

  it("is the same shape at every magnitude — never an empty result", async () => {
    const small = song(4, 72);
    expect(small.secondsEstimate).toBe(106.7);
    const result = await renderSong({ songId: small.songId, maxDurationSec: 100 }, {});

    // One text block, no structured content, `isError` — the shape every over-budget call has, at any size.
    expect(result.isError).toBe(true);
    expect(Object.keys(result).sort()).toEqual(["content", "isError"]);
    expect(result.content).toHaveLength(1);
    expect(result.structuredContent).toBeUndefined();
    expect(refusal(result)).toContain("106.7s");
    expect(refusal(result)).toContain("maxDurationSec is 100s");
  });
});
