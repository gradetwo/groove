/**
 * ⭐ **Which audition mode can play a pre-generated clip, as a pure rule** (owner's decision, 2026-10-11).
 *
 * A `full` audition plays the MP3 named by the clip manifest; a `drums` audition keeps the live engine, because the
 * manifest was measured and carries **only the full mix** — its rows hold no stem or drum-only material, so a drums clip
 * cannot exist. Any surface that asks the question reads this, so the answer cannot drift between the genre page and the
 * comparison view. It lives outside `src/mobile/**` on purpose: the desktop views read it, and the phone-shell boundary
 * forbids a desktop surface from importing the shell.
 */
export type AuditionMode = "drums" | "full";

export function usesClipAudition(mode: AuditionMode): boolean {
  return mode === "full";
}
