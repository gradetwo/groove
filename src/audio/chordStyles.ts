/**
 * Which chord-playing styles an instrument can actually produce.
 *
 * ## The defect this closes
 *
 * The chord workbench offered all four styles — block, ballad (broken), arpeggio, strum — for
 * every instrument, so a **piano could be set to strum**. That is not a preference, it is a
 * physical impossibility: a keyboard has no plectrum and no strings to sweep, and the synthesised
 * result (the notes rolled a few milliseconds apart) reads as a badly quantised piano rather than
 * as a guitar. The user's report was exactly this: "选择和弦乐器时候伴奏律动风格应该有差异，
 * 例如钢琴就不能有扫弦".
 *
 * ## The rule
 *
 * Styles are a property of the **instrument**, and the workbench only offers what the instrument
 * can do:
 *
 *   - **piano** — block chords, broken chords (ballad) and arpeggios; never strum.
 *   - **guitar** — all four. A swept chord is what distinguishes it from a keyboard.
 *   - **power-guitar** — strum and block only. Metal power chords are down-picked or muted;
 *     a broken-chord ballad or a finger-picked arpeggio is a different instrument.
 *
 * `coerceStyle` is the safety net for the paths that do not go through the buttons: the curated
 * progressions each carry their own `suggestedTimbre` + `suggestedStyle`, and a pair that the
 * instrument cannot play must be repaired rather than played.
 */
import type { InstrumentTimbre, PlayingStyle } from "./ChordAudioEngine";

export interface TimbreStyles {
  /** The style to fall back to when the current one is impossible on this instrument. */
  default: PlayingStyle;
  /** Every style this instrument can actually produce, in the order the workbench shows them. */
  allowed: readonly PlayingStyle[];
  /** Why the excluded styles are excluded — surfaced to the user, not just to developers. */
  reasonKey: string;
}

/**
 * One entry per `InstrumentTimbre`. `satisfies` keeps it exhaustive: adding a timbre without
 * deciding what it can play is a type error, not a silent omission.
 */
export const TIMBRE_STYLES = {
  piano: {
    default: "block",
    allowed: ["block", "ballad", "arpeggio"],
    reasonKey: "chords_style_note_piano",
  },
  guitar: {
    default: "strum",
    allowed: ["strum", "block", "arpeggio", "ballad"],
    reasonKey: "chords_style_note_guitar",
  },
  "power-guitar": {
    default: "strum",
    allowed: ["strum", "block"],
    reasonKey: "chords_style_note_power",
  },
} satisfies Record<InstrumentTimbre, TimbreStyles>;

/** The styles a timbre may be set to, in display order. */
export function stylesForTimbre(timbre: InstrumentTimbre): readonly PlayingStyle[] {
  return TIMBRE_STYLES[timbre]?.allowed ?? TIMBRE_STYLES.piano.allowed;
}

/** The style a timbre falls back to. */
export function defaultStyleForTimbre(timbre: InstrumentTimbre): PlayingStyle {
  return TIMBRE_STYLES[timbre]?.default ?? TIMBRE_STYLES.piano.default;
}

/** True when this instrument can actually play this style. */
export function isStyleAllowed(timbre: InstrumentTimbre, style: PlayingStyle): boolean {
  return stylesForTimbre(timbre).includes(style);
}

/**
 * The style to use for `style` on `timbre`: the style itself when the instrument can play it,
 * otherwise the instrument's default. Total by design — every caller can apply it unconditionally
 * without branching, which is what makes it usable on the curated-progression path as well as in
 * the button handler.
 */
export function coerceStyle(timbre: InstrumentTimbre, style: PlayingStyle): PlayingStyle {
  return isStyleAllowed(timbre, style) ? style : defaultStyleForTimbre(timbre);
}

/** The i18n key explaining this timbre's style limits. */
export function styleNoteKeyForTimbre(timbre: InstrumentTimbre): string {
  return TIMBRE_STYLES[timbre]?.reasonKey ?? TIMBRE_STYLES.piano.reasonKey;
}
