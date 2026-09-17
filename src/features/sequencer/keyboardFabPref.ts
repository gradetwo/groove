/**
 * Storage preference for Virtual Keyboard Floating Action Button (FAB).
 *
 * Persisted in localStorage under "showVirtualKeyboardFab" (default: true).
 */

export const FAB_STORAGE_KEY = "showVirtualKeyboardFab";

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
    window.dispatchEvent(new CustomEvent("groove_fab_pref_changed", { detail: show }));
  } catch {
    /* ignore quota/security errors in private browsing */
  }
}
