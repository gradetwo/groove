/**
 * The record screen's one line of status text, as a pure function.
 *
 * Extracted for two reasons, both of them the same lesson this project keeps re-learning about criteria:
 *
 *  1. **It can be held to a criterion.** The screen around it builds a canvas, a skin context and a genre record, so a
 *     test that renders it is mostly a test of the mocks; the decision itself is four lines of precedence.
 *  2. **"A refused clip must not read the same as never having pressed play" is that decision.** The shell clears
 *     `clipGenreId` when the browser refuses `play()`, so `isPlaying` is false and a bare `idle` would hide the failure
 *     entirely — the "no error anywhere" half of the 2026-10-13 report. Pinning the precedence is what keeps a later
 *     edit from quietly folding the failure back into the idle case.
 *
 * The reason the refusal came with is **not** part of this sentence: the reader gets one translated, actionable line, and
 * the technical detail travels beside it as a diagnostic (`MobilePlayerScreen` puts it in the element's `title`).
 */
export type RecordStatusKey =
  | "mobile_player_status_failed"
  | "mobile_player_status_dropping"
  | "mobile_player_status_playing"
  | "mobile_player_status_idle";

export interface RecordStatusInput {
  /** True when the clip's `play()` was refused or the clip would not load. */
  playFailed: boolean;
  isPlaying: boolean;
  /** The needle is on its way down for about half a second (the reference's 落针). */
  dropping: boolean;
}

/**
 * Which translation key the status line shows.
 *
 * Precedence: a refusal wins over everything, because it is the only state the user cannot infer — the record going
 * quiet looks exactly like a record that was never started. Then the drop animation, then plain playing, then idle.
 */
export function recordStatusKey({ playFailed, isPlaying, dropping }: RecordStatusInput): RecordStatusKey {
  if (playFailed) return "mobile_player_status_failed";
  if (!isPlaying) return "mobile_player_status_idle";
  return dropping ? "mobile_player_status_dropping" : "mobile_player_status_playing";
}
