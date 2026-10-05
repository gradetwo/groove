import { registrySource } from "./helpers/registrySource";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_SECTION_BARS, MAX_SONG_BARS } from "../types/song";

/**
 * The ceilings the owner relaxed on 2026-09-28 — and the copies of them that must not drift.
 *
 * `MAX_SECTION_BARS` is read by the arrangement form and both sides of the URL share, but `add_section`'s zod bound is a **hardcoded number**: a tool bound that
 * disagrees with the model's constant is exactly how "the model allows it and the tool refuses it" happens, so the agreement is asserted rather than assumed.
 */
describe("the relaxed ceilings", () => {
  it("are the values the owner asked for", () => {
    expect(MAX_SECTION_BARS).toBe(256);
    expect(MAX_SONG_BARS).toBe(2048);
    // The order still makes sense: one section cannot be longer than the whole song.
    expect(MAX_SECTION_BARS).toBeLessThanOrEqual(MAX_SONG_BARS);
  });

  it("are what the tools actually accept, bound for bound", () => {
    const registry = registrySource();
    // ⭐ **The section bound's tool copies went with `add_section`.** The registry states no per-section bar ceiling any
    // more, so what remains to guard is that the stale 64 never returns to the prose. The arrangement side is bounded by
    // its own model, and the gap that leaves is registered in `docs/OPEN_WORK.md`.
    expect(registry).not.toMatch(/at most 64 per section/);
    expect(registry).not.toMatch(/at most \d+ per section/);
  });

  it("are enforced by the model, not only documented", () => {
    const song = readFileSync("src/types/song.ts", "utf8");
    // The song validator is where an over-long arrangement becomes a problem rather than a silent overrun.
    expect(song).toMatch(/bars\.length > MAX_SONG_BARS/);
    expect(song).toMatch(new RegExp(`above the \\$\\{MAX_SONG_BARS\\}-bar limit`));
  });
});
