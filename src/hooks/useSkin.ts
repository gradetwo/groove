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
