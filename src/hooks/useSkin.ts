/**
 * Keeps `data-skin` on `<html>` in sync with the stored skin.
 *
 * The attribute is the whole mechanism: every skin stylesheet is scoped to `:root[data-skin="…"]`, so
 * nothing has to subscribe to this hook for a skin change to reach the screen. The hook exists for the
 * two things an attribute cannot do on its own — choose it from storage, and change it from the
 * picker.
 *
 * Also exports `applyStoredSkin`, which `main.tsx` calls before the first render. Without it the first
 * frame is painted with the default skin and the real skin arrives after hydration, which is a visible
 * flash on every cold load; the same reasoning (and the same shape) as `useDensityPreference`.
 */
import { useCallback, useEffect, useState } from "react";
import { SKINS } from "../data/skins";
import type { SkinId } from "../types/skin";
import { loadSkin, saveSkin, SKIN_CHANGED_EVENT } from "../features/settings/skinPrefs";

/**
 * The desktop *character* sheets, loaded with the skin they belong to.
 *
 * `desktopTokens.css` (the default palette) is in the first paint, because a page that sets no skin still
 * needs one; `desktopSkins.css` carries the five *other* palettes plus the literal map and is loaded here,
 * with the skin that needs it. The character sheets are the opposite: five files of
 * type, edges and texture, of which exactly one is ever in use, and only when a non-default skin is
 * chosen. Keeping them in the entry bundle cost 6 KB of gzip on the initial route (the budget gate caught
 * it at 225.6/220 KB) for CSS most loads never apply.
 *
 * The registry is explicit rather than a template literal so the bundler can see each import and emit a
 * real chunk per skin; a computed path would either fail or pull all five back in. `default` has no
 * character sheet — it is the app as it always looked.
 */
const CHARACTER_SHEETS: Partial<Record<SkinId, () => Promise<unknown>>> = {
  minimal: () => import("../styles/skin-minimal.css"),
  comic: () => import("../styles/skin-comic.css"),
  soviet: () => import("../styles/skin-soviet.css"),
  sovietYears: () => import("../styles/skin-sovietYears.css"),
  pixel: () => import("../styles/skin-pixel.css"),
};

/**
 * Bring in a skin's character, once.
 *
 * Awaited by nobody: the palette is already applied, so the skin is *correct* the moment the attribute is
 * set and the character arrives a frame or two later. Caching happens in the module system, so calling this
 * on every apply is free.
 */
export function loadCharacterSheet(id: SkinId): void {
  if (id === "default") return;
  // The extra palettes and the literal map first (everything else assumes they exist), then the character.
  void import("../styles/desktopSkins.css").catch(() => {});
  void CHARACTER_SHEETS[id]?.().catch(() => {
    /* A missing character sheet is a cosmetic loss, never a reason to break the app. */
  });
}

/** The attribute CSS selects on. Exported so the stylesheets, the hook and the tests cannot disagree. */
export const SKIN_ATTRIBUTE = "data-skin";

/**
 * Apply a skin to the document element (or an explicit root, for tests).
 *
 * Split out from the hook so it can be tested without React and called before render.
 */
export function applySkin(id: SkinId, root?: HTMLElement | null): void {
  const el = root ?? (typeof document !== "undefined" ? document.documentElement : null);
  if (!el) return;
  el.setAttribute(SKIN_ATTRIBUTE, id);
  // Branded skins need their own sheet; the palette above is already in place either way.
  loadCharacterSheet(id);
}

/** Apply whatever is stored, before React renders. Called once from `main.tsx`. */
export function applyStoredSkin(root?: HTMLElement | null): SkinId {
  const skin = loadSkin();
  applySkin(skin, root);
  return skin;
}

export interface SkinControl {
  skin: SkinId;
  setSkin: (id: SkinId) => void;
}

/**
 * The picker's view of the preference.
 *
 * Re-reads storage when the change event arrives instead of trusting the event's payload, so two
 * pickers (or a picker plus a future settings row) cannot disagree about what is stored.
 */
export function useSkin(): SkinControl & { skins: typeof SKINS } {
  const [skin, setLocalSkin] = useState<SkinId>(() => loadSkin());

  useEffect(() => {
    applySkin(skin);
    const onChanged = () => setLocalSkin(loadSkin());
    window.addEventListener(SKIN_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(SKIN_CHANGED_EVENT, onChanged);
  }, [skin]);

  const setSkin = useCallback((id: SkinId) => {
    saveSkin(id);
  }, []);

  return { skin, setSkin, skins: SKINS };
}
