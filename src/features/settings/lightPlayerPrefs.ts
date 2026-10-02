/**
 * The "lighter player" preference: turn the decorative motion off.
 *
 * The vinyl screen's cost is its motion — the disc spin, the pulsing step dots, the sheen, the aura's breath — and a
 * phone that is hot, or a user who simply does not want it, should be able to say so. What this switch does **not** do is
 * change the sound: the canvas keeps its clock, its beat slaves and its published tempo, and only the painting is skipped
 * (see `VinylCanvas`'s `lite` prop). A stopped picture is not a stopped transport.
 *
 * Follows `skinPrefs.ts` deliberately, including its rules: storage can be absent, full or hold a value from an older
 * build, so every read falls back to the default and every write is best-effort. The change is published as a DOM event
 * because the switch and the screens that honour it do not know about each other.
 */

/** Versioned storage key. Bump the suffix if the stored shape ever changes. */
export const LIGHT_PLAYER_STORAGE_KEY = "groove_light_player_v1";

/** Published on `window` whenever the preference changes, so every subscriber re-reads it. */
export const LIGHT_PLAYER_CHANGED_EVENT = "groove_light_player_changed";

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

/** Persist the preference and tell everyone. Best-effort: a private-mode failure still updates the live UI. */
export function saveLightPlayer(enabled: boolean): void {
  const next = Boolean(enabled);
  try {
    window.localStorage.setItem(LIGHT_PLAYER_STORAGE_KEY, next ? "1" : "0");
  } catch {
    /* private mode: the choice simply does not survive the session */
  }
  try {
    window.dispatchEvent(new CustomEvent(LIGHT_PLAYER_CHANGED_EVENT, { detail: { lightPlayer: next } }));
  } catch {
    /* no window (a test environment without a DOM): the caller still applies it */
  }
}

/**
 * The CSS class the preference toggles on `<html>`.
 *
 * A class rather than a hundred inline checks: the decorative animations it silenced were declared in
 * the phone shell's `mobile.css`, so switching them off was a stylesheet rule and the React tree did
 * not re-render because of a preference.
 *
 * ⚠️ The shell is cut (`docs/OPEN_WORK.md` §十三) and **no stylesheet defines `.m-lite` any more**, so
 * the preference is inert: `applyStoredLightPlayer` still toggles the class at boot, and nothing
 * answers it. It was already inert on the desktop (the class only ever had phone rules); the change is
 * that it is now inert everywhere. Kept — rather than deleted with the shell — because it is a
 * *preference* with a stored value on real installs, and retiring a user setting is a product decision
 * with a migration, not a cleanup. Recorded here so the next reader does not assume it works.
 */
export const LIGHT_PLAYER_CLASS = "m-lite";
