/**
 * The instrument colours, as **roles** the surfaces map to their own tokens.
 *
 * The eight lane colours used to be hexes in `trackConfig.ts` (`#ff5964`, `#45e0c9`, …), painted into inline
 * styles and into a `--tc` custom property. A hex in JavaScript is the one colour a skin can never reach, so
 * under the light skins those lanes stayed dark-theme bright while the labels on them went white: the audit
 * measured white note names on the bass fill at 1.4:1 and the HI-HAT lane name at 1.55:1 — 208 findings, the
 * largest class it reported.
 *
 * A role keeps the hue *identity* (the product's map from colour to instrument) and lets each surface answer:
 *
 *   · `fill` — the shape itself, derived per skin so white text on it clears 4.5:1 (the note names);
 *   · `ink`  — the lane's name printed on the panel, derived against the panel instead.
 *
 * Both come from the generated sheet (`src/styles/desktopSkins.css`), so the phone and the desktop cannot
 * disagree about which colour "the bass" is.
 */
export type TrackColourRole = "kick" | "snare" | "hat" | "perc" | "bass" | "chord" | "lead" | "fx";

/** The order the studio presents them in; also the set of tokens the sheets must define. */
export const TRACK_COLOUR_ROLES: readonly TrackColourRole[] = [
  "kick",
  "snare",
  "hat",
  "perc",
  "bass",
  "chord",
  "lead",
  "fx",
];

export function trackColour(role: TrackColourRole, kind: "fill" | "ink" = "fill"): string {
  return kind === "ink" ? `var(--d-track-${role}-ink)` : `var(--d-track-${role})`;
}
