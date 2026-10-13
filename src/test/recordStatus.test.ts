/**
 * ⭐ **"The clip was refused" must never read the same as "nobody pressed play".**
 *
 * The phone shell draws its transport from `clipGenreId`, and a refused `play()` clears it — so `isPlaying` is false in
 * exactly the case the user needs told about. Before the status line carried the failure, the record, the bar and the
 * timer said "playing" over silence and nothing on screen said otherwise (owner, 2026-10-13); after it, the wording is
 * one translation key picked by this four-line precedence, so the failure must win over the transport state.
 *
 * The cases are the precedence itself: refusal over everything, then the drop animation, then playing, then idle.
 */
import { describe, it, expect } from "vitest";
import { recordStatusKey } from "../mobile/vinyl/recordStatus";

const idle = { playFailed: false, isPlaying: false, dropping: false };

describe("the record's status line", () => {
  it("⭐ says the clip failed even though the transport reads idle, which is what a refusal does", () => {
    expect(recordStatusKey({ ...idle, playFailed: true })).toBe("mobile_player_status_failed");
    // The trap: a refusal leaves `isPlaying` false, so a naive precedence would answer `idle` here.
    expect(recordStatusKey({ playFailed: true, isPlaying: false, dropping: false })).not.toBe("mobile_player_status_idle");
    // And it wins even mid-drop, where the needle is already moving.
    expect(recordStatusKey({ playFailed: true, isPlaying: true, dropping: true })).toBe("mobile_player_status_failed");
  });

  it("still tells playing, dropping and idle apart when nothing failed", () => {
    expect(recordStatusKey(idle)).toBe("mobile_player_status_idle");
    expect(recordStatusKey({ ...idle, isPlaying: true })).toBe("mobile_player_status_playing");
    expect(recordStatusKey({ ...idle, isPlaying: true, dropping: true })).toBe("mobile_player_status_dropping");
    // A drop with no transport is not a state the screen reaches; idle is the honest answer rather than "dropping".
    expect(recordStatusKey({ ...idle, dropping: true })).toBe("mobile_player_status_idle");
  });

  it("names keys from the word table, so both languages are covered by the locale criteria", () => {
    for (const input of [
      { playFailed: true, isPlaying: false, dropping: false },
      { playFailed: false, isPlaying: true, dropping: true },
      { playFailed: false, isPlaying: true, dropping: false },
      idle,
    ]) {
      expect(recordStatusKey(input), "a key, not a sentence").toMatch(/^mobile_player_status_/);
    }
  });
});
