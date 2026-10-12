/**
 * Applies the stored "lighter player" preference to the document element at boot.
 *
 * `applyStoredLightPlayer` is called from `main.tsx` beside the skin, before the first render. What it does today is
 * toggle `m-lite` on `<html>`; ⚠️ **nothing answers that class** — its only rules lived in the phone shell's
 * `mobile.css`, cut in `4dffdf0` (`docs/OPEN_WORK.md` §十三) — so the toggle changes no computed style. The read stays,
 * and the stored value is not retired, for the reason written out in `src/features/settings/lightPlayerPrefs.ts`.
 *
 * The React half of this module is gone: `useLightPlayer` — the hook the deleted `LightPlayerToggle` switch drove — had
 * no callers left once the switch went, so keeping it would have left a preference that looks live and is not. Its
 * writer and change event went with it.
 */
import { LIGHT_PLAYER_CLASS, loadLightPlayer } from "../features/settings/lightPlayerPrefs";

/** Apply the preference to the document element (or an explicit root). */
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
