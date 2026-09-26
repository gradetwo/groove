/**
 * Keeps the "lighter player" preference applied to the document element, and gives the settings switch a way to change it.
 *
 * The mechanism is the same one the skin uses: a class on `<html>` (`m-lite`), so the decorative animation rules in
 * `mobile.css` can switch themselves off without any component re-rendering, and the canvas reads the preference once
 * (through `useLightPlayer`) to decide whether to paint. `applyStoredLightPlayer` is called from `main.tsx` beside the
 * skin, before the first render, so a phone that has the preference on never paints a spinning record first.
 */
import { useCallback, useEffect, useState } from "react";
import {
  LIGHT_PLAYER_CHANGED_EVENT,
  LIGHT_PLAYER_CLASS,
  loadLightPlayer,
  saveLightPlayer,
} from "../features/settings/lightPlayerPrefs";

/** Apply the preference to the document element (or an explicit root, for tests). */
export function applyLightPlayer(enabled: boolean, root?: HTMLElement | null): void {
  const el = root ?? (typeof document !== "undefined" ? document.documentElement : null);
  if (!el) return;
  el.classList.toggle(LIGHT_PLAYER_CLASS, Boolean(enabled));
}

/** Apply whatever is stored, before React renders. Called once from `main.tsx`. */
export function applyStoredLightPlayer(root?: HTMLElement | null): boolean {
  const enabled = loadLightPlayer();
  applyLightPlayer(enabled, root);
  return enabled;
}

export interface LightPlayerControl {
  lightPlayer: boolean;
  setLightPlayer: (enabled: boolean) => void;
}

/**
 * The switch's view of the preference.
 *
 * Re-reads storage when the change event arrives rather than trusting the payload, for the same reason `useSkin` does:
 * two readers cannot then disagree about what is stored.
 */
export function useLightPlayer(): LightPlayerControl {
  const [lightPlayer, setLocal] = useState<boolean>(() => loadLightPlayer());

  useEffect(() => {
    applyLightPlayer(lightPlayer);
    const onChanged = () => {
      const next = loadLightPlayer();
      setLocal(next);
      applyLightPlayer(next);
    };
    window.addEventListener(LIGHT_PLAYER_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(LIGHT_PLAYER_CHANGED_EVENT, onChanged);
  }, [lightPlayer]);

  const setLightPlayer = useCallback((enabled: boolean) => {
    saveLightPlayer(enabled);
  }, []);

  return { lightPlayer, setLightPlayer };
}
