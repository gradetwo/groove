/**
 * Storage preference for Virtual Keyboard Floating Action Button (FAB).
 *
 * Persisted in localStorage under "showVirtualKeyboardFab" (default: true).
 */

export const FAB_STORAGE_KEY = "showVirtualKeyboardFab";

/**
 * In-tab change signal for the preference above.
 *
 * The `storage` event only fires in *other* tabs, so a surface that changes the setting in this tab
 * has to announce it; `useKeyboardPerformance` listens for this and re-reads the value. Exported as a
 * constant because a writer and a listener disagreeing by a typo is a silent bug — the reader would
 * simply keep showing the old value.
 */
export const FAB_PREF_CHANGED_EVENT = "groove_fab_pref_changed";

export function loadKeyboardFabPref(): boolean {
  try {
    const val = localStorage.getItem(FAB_STORAGE_KEY);
    if (val === null) return true;
    return val !== "false";
  } catch {
    return true;
  }
}

export function saveKeyboardFabPref(show: boolean): void {
  try {
    localStorage.setItem(FAB_STORAGE_KEY, String(show));
    window.dispatchEvent(new CustomEvent(FAB_PREF_CHANGED_EVENT, { detail: show }));
  } catch {
    /* ignore quota/security errors in private browsing */
  }
}
