/**
 * Rank tiers and right/wrong verdicts, as **roles the surface can map**.
 *
 * ## Why this file exists
 *
 * The challenge screens used to paint themselves from hexes written in the data layer: `#cd7f32` for bronze,
 * `#c0c0c0` for silver, `#ff5964`/`#4ade80` for the verdict. A hex in JavaScript is the one thing a skin can
 * never reach — `style={{ color: tier.color }}` wins over every stylesheet rule — so after the six-skin
 * round the rank label was the last piece of text still wearing the default theme, and on the Soviet-years
 * paper silver measured **1.6:1**: a label that was not merely off-palette but unreadable.
 *
 * The fix is to keep the *decision* in the data layer (which tier, which outcome) and the *colour* in the
 * surface's token set. `challengeAlgorithm` now says `colourRole: "neutral"`, and each surface answers with
 * one of its own tokens here. Every role maps to a token the readability audit already holds to 4.5:1 on
 * every skin, so a new skin cannot make these labels unreadable by omission — it only has to define the six
 * tokens it already defines.
 *
 * The metal *look* stays the icon's job (🥉🥈🥇): a glyph is not a colour, and it survives every theme.
 */
import type { TierColourRole } from "./challengeAlgorithm";

/** Which token set to answer with. The phone shell and the desktop have separate, independently tuned sets. */
export type ColourSurface = "phone" | "desktop";

/**
 * Role → token, per surface.
 *
 * The phone has no "warning" token of its own, so bronze takes the lighter accent step (`--m-gold-hi`) —
 * what matters is that it is *readable and in-palette*, not that it is bronze. `neutral` is the metal grey
 * both surfaces use for secondary type; `teal` and `violet` come from the category palettes, which every
 * skin defines for exactly this kind of "identity colour" job.
 */
const TIER_TOKENS: Record<ColourSurface, Record<TierColourRole, string>> = {
  phone: {
    warning: "--m-warning",
    neutral: "--m-ink-2",
    accent: "--m-gold",
    teal: "--m-teal",
    violet: "--m-violet",
    danger: "--m-red",
  },
  desktop: {
    warning: "--d-warning",
    neutral: "--d-ink-2",
    accent: "--d-accent",
    teal: "--d-cat-electronic",
    violet: "--d-cat-jazz",
    danger: "--d-danger",
  },
};

/** The CSS value to hand an inline style: `var(--m-teal)`, never a literal. */
export function tierColour(role: TierColourRole, surface: ColourSurface): string {
  return `var(${TIER_TOKENS[surface][role]})`;
}

/**
 * A graded answer's verdict colour.
 *
 * Same reasoning as the tiers: the phone screen used to inline the shell's own pastel hexes, which were
 * unreadable on a light skin's panel. `right`/`wrong` are semantic and both surfaces define them.
 */
export function outcomeColour(outcome: "right" | "wrong", surface: ColourSurface): string {
  const token = outcome === "right" ? (surface === "phone" ? "--m-green" : "--d-success") : surface === "phone" ? "--m-red" : "--d-danger";
  return `var(${token})`;
}

/** Exposed for the tests: every token this module can name, so a rename cannot silently break a surface. */
export const COLOUR_TOKENS: Record<ColourSurface, string[]> = {
  phone: Object.values(TIER_TOKENS.phone),
  desktop: Object.values(TIER_TOKENS.desktop),
};
