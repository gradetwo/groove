/**
 * The skin preference: which visual skin the user picked, and where that choice lives.
 *
 * Follows `layoutPrefs.ts` deliberately, including its three rules, because the failure modes are the
 * same ones: `localStorage` can be absent (private mode), full, or hold a value written by an older
 * build, and none of those may break the app. So every read falls back to the default skin and every
 * write is best-effort.
 *
 * The key carries a version and is never rewritten in place — a skin id that a future build removes
 * must not take the whole preference blob with it.
 *
 * The change is published as a DOM event rather than kept in React state, for the reason
 * `useDensityPreference` documents: the picker and the root that applies the attribute do not know
 * about each other, and a preference is not worth a re-render of the studio.
 */
import { DEFAULT_SKIN, SKINS } from "../../data/skins";
import type { SkinId } from "../../types/skin";

/** Versioned storage key. Bump the suffix if the stored shape ever changes. */
export const SKIN_STORAGE_KEY = "groove_skin_v1";

/** Published on `window` whenever the stored skin changes, so every subscriber re-reads it. */
export const SKIN_CHANGED_EVENT = "groove_skin_changed";

/** Anything that is not one of the shipped skins falls back to the default (a stale value). */
export function normaliseSkin(value: string | null | undefined): SkinId {
  return SKINS.some((skin) => skin.id === value) ? (value as SkinId) : DEFAULT_SKIN;
}

/** The stored skin, or the default. Never throws, even with no storage at all. */
export function loadSkin(): SkinId {
  try {
    return normaliseSkin(window.localStorage.getItem(SKIN_STORAGE_KEY));
  } catch {
    return DEFAULT_SKIN;
  }
}

/** Persist a skin and tell everyone. Best-effort: a private-mode failure still updates the live UI. */
export function saveSkin(id: SkinId): void {
  const skin = normaliseSkin(id);
  try {
    window.localStorage.setItem(SKIN_STORAGE_KEY, skin);
  } catch {
    /* private mode: the choice simply does not survive the session */
  }
  try {
    window.dispatchEvent(new CustomEvent(SKIN_CHANGED_EVENT, { detail: { skin } }));
  } catch {
    /* no window (a test environment without a DOM): the attribute is still applied by the caller */
  }
}
