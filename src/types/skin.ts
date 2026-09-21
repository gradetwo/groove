/**
 * The four skins the app ships.
 *
 * Kept next to the other cross-surface types rather than in the shell: the skin is a property of the
 * whole product (the desktop settings panel offers it too), and the phone shell must not be the only
 * thing that knows the list.
 */
export type SkinId = "default" | "minimal" | "comic" | "soviet" | "sovietYears" | "pixel";
