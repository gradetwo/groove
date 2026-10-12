/**
 * The skin catalogue.
 *
 * A skin is a *presentation* choice, not a behaviour: the shell renders the same components and the
 * same routes, and `[data-skin]` on the root element decides which stylesheet rules apply. So this file
 * is only the list — id, name, description — plus the three swatches the picker paints, and the actual
 * skin lives in CSS (`src/skins/*.css`).
 *
 * The swatches are here rather than in CSS because the picker draws a *preview* of a skin that is not
 * active: a preview cannot be styled by the skin's own stylesheet, so the three colours it shows have to
 * travel as data. They are the same values the stylesheet opens with, and the skin test asserts that
 * every skin's swatches are distinct from every other skin's.
 *
 * Domain layer on purpose (`src/data`): the phone shell, the desktop settings panel and any future
 * surface all read the same list, and the catalogue must not know that a screen exists.
 */
import type { SkinId } from "../types/skin";

export interface SkinDefinition {
  id: SkinId;
  /** i18n key for the skin's name. */
  nameKey: string;
  /** i18n key for the one-line description shown under the name. */
  blurbKey: string;
  /**
   * The preview colours: the skin's ground, its ink and its accent. Drawn as the picker's swatch, so a
   * user can tell the four apart before applying one.
   */
  preview: { ground: string; ink: string; accent: string };
}

export const SKINS: readonly SkinDefinition[] = [
  {
    id: "default",
    nameKey: "skin_default_name",
    blurbKey: "skin_default_blurb",
    preview: { ground: "#0b0b14", ink: "#f3f3f9", accent: "#5eead4" },
  },
  {
    id: "minimal",
    nameKey: "skin_minimal_name",
    blurbKey: "skin_minimal_blurb",
    preview: { ground: "#fafafa", ink: "#141414", accent: "#2358e6" },
  },
  {
    id: "comic",
    nameKey: "skin_comic_name",
    blurbKey: "skin_comic_blurb",
    preview: { ground: "#f4e9d2", ink: "#111014", accent: "#ff2d95" },
  },
  {
    id: "soviet",
    nameKey: "skin_soviet_name",
    blurbKey: "skin_soviet_blurb",
    preview: { ground: "#1b1e21", ink: "#ede4cc", accent: "#c8452b" },
  },
  {
    id: "sovietYears",
    nameKey: "skin_soviet_years_name",
    blurbKey: "skin_soviet_years_blurb",
    preview: { ground: "#f4f1e1", ink: "#111111", accent: "#cc0000" },
  },
  {
    id: "pixel",
    nameKey: "skin_pixel_name",
    blurbKey: "skin_pixel_blurb",
    preview: { ground: "#10121c", ink: "#e8e8f0", accent: "#4ce0b3" },
  },
];

export const DEFAULT_SKIN: SkinId = "default";
