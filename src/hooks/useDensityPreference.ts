/**
 * Makes the 界面密度 setting real (C-06 / appendix E.5 item 6: "`layout.density` 落地").
 *
 * The setting existed end to end — a three-way control in Settings, a persisted field, a
 * validator — and changed nothing on screen. `SettingsModal` wrote it and `layoutPrefs` stored it;
 * no component read it. That is worse than not shipping the control: the user picks 紧凑, the
 * button lights up, and the interface is identical.
 *
 * It is applied as `data-density` on `<html>` rather than as React state, because the consumers are
 * CSS custom properties in `src/index.css` (`--step-cell-h`, `--track-row-pad-y`). That means the
 * setting reaches every row without a single component subscribing to it, which is what keeps this
 * from becoming a re-render on every preference change — the same reasoning behind the DOM-only
 * playhead bus.
 *
 * The element must reflect the setting *before* the studio renders, or the first frame is drawn at
 * the wrong density and then jumps. So this writes the attribute synchronously on mount and only
 * then subscribes for changes.
 */
import { useEffect } from "react";
import { loadLayoutPrefs, type DensityTier } from "../features/sequencer/layoutPrefs";

/** The attribute CSS selects on. Exported so tests and CSS cannot disagree about the name. */
export const DENSITY_ATTRIBUTE = "data-density";

/**
 * Applies a density tier to the document element.
 *
 * Split out from the hook so it can be tested without React, and so callers that already have the
 * resolved value (the studio holds it for the Settings modal) can push it without re-reading
 * storage.
 */
export function applyDensity(tier: DensityTier, root?: HTMLElement | null): void {
  const el = root ?? (typeof document !== "undefined" ? document.documentElement : null);
  if (!el) return;
  el.setAttribute(DENSITY_ATTRIBUTE, tier);
}

/**
 * Keeps `data-density` in sync with the stored preference, including changes made in Settings.
 *
 * `saveLayoutPrefs` dispatches `groove_layout_prefs_changed`, so a change from the modal arrives
 * here even though this hook does not own the state. The stored value is re-read rather than taken
 * from the event detail, so a caller that patched some *other* field cannot make the density
 * attribute disagree with what is persisted.
 */
export function useDensityPreference(): void {
  useEffect(() => {
    applyDensity(loadLayoutPrefs().density);

    const onChange = () => applyDensity(loadLayoutPrefs().density);
    if (typeof window === "undefined") return;
    window.addEventListener("groove_layout_prefs_changed", onChange);
    return () => window.removeEventListener("groove_layout_prefs_changed", onChange);
  }, []);
}
