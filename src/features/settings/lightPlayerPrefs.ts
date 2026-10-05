/**
 * The "lighter player" preference: turn the decorative motion off.
 *
 * The vinyl screen's cost was its motion — the disc spin, the pulsing step dots, the sheen, the aura's breath — and a
 * phone that is hot, or a user who simply does not want it, should be able to say so. What this switch does **not** do is
 * change the sound: the canvas kept its clock, its beat slaves and its published tempo, and only the painting was skipped.
 * A stopped picture is not a stopped transport.
 *
 * ⚠️ **Every consumer of the preference went with the phone shell** (`docs/OPEN_WORK.md` §十三, commit `4dffdf0`):
 * `VinylCanvas` and its `lite` prop, the `LightPlayerToggle` switch, and the stylesheet rule that answered the class.
 * What is left is one live half and no live writer:
 *
 *   - `loadLightPlayer` is still called at boot, from `applyStoredLightPlayer` in `src/main.tsx`, and the class it
 *     toggles on `<html>` is still applied;
 *   - nothing writes the key and nothing defines `.m-lite`, so the toggle changes no computed style. Measured, with
 *     every stylesheet the app ships loaded and a skin active: a recursive CSSOM sweep of 1,442 rules found **zero**
 *     matching `.m-lite`, and the two stored values `"1"` and `"0"` produced **50 identical** computed-style readings —
 *     the only difference in the document was the class token itself.
 *
 * The *read* is kept and the stored value is deliberately **not** retired: installs that set it before the cut still hold
 * `groove_light_player_v1`, and retiring a user preference is a product decision with a migration, not a cleanup. The
 * writer and the change event are **not** kept — once the switch was deleted nothing referenced them.
 *
 * Storage follows `skinPrefs.ts`, including its rules: storage can be absent, full or hold a value from an older build,
 * so the read falls back to the default and never throws.
 */

/** Versioned storage key. Bump the suffix if the stored shape ever changes. */
export const LIGHT_PLAYER_STORAGE_KEY = "groove_light_player_v1";

/** Only the two exact strings count; anything else is the default. */
export function normaliseLightPlayer(value: string | null | undefined): boolean {
  return value === "1" || value === "true";
}

/** The stored preference, or `false`. Never throws, even with no storage at all. */
export function loadLightPlayer(): boolean {
  try {
    return normaliseLightPlayer(window.localStorage.getItem(LIGHT_PLAYER_STORAGE_KEY));
  } catch {
    return false;
  }
}

/**
 * The CSS class the preference is applied as.
 *
 * A class rather than a hundred inline checks: the decorative animations it silenced were declared in the phone shell's
 * `mobile.css`, so switching them off was a stylesheet rule and the React tree did not re-render because of a
 * preference.
 *
 * ⚠️ The shell is cut (`docs/OPEN_WORK.md` §十三) and **no stylesheet defines `.m-lite` any more**, so the class is
 * inert: `applyStoredLightPlayer` still toggles it at boot, and nothing answers it. It was already inert on the desktop
 * (the class only ever had phone rules); the change is that it is now inert everywhere. Recorded here so the next reader
 * does not assume it works — and a reader who wants to retire it outright should read the header note first, because that
 * is a product decision about a stored user preference.
 */
export const LIGHT_PLAYER_CLASS = "m-lite";
