/**
 * The debug switch — a **setting**, not a URL flag.
 *
 * `?diag=1` was the first shape and it was the wrong one twice over: on a phone the panel is unusable (the layout
 * pushes it off the visible area), and asking someone to edit a URL on a device they are holding is not a feature. It
 * is a persisted setting now, on every surface, and `?diag=1` still forces it on for a probe or a test.
 *
 * The store is the same shape as the GS-1 setting next door (`useSyncExternalStore` over a module-level value with a
 * small subscribe list), because a second state pattern for one boolean would be a second thing to get wrong.
 */
const STORAGE_KEY = "groove_debug_v1";

type Listener = () => void;
const listeners = new Set<Listener>();

function read(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

let enabled = typeof localStorage === "undefined" ? false : read();

export function isDebugModeEnabled(): boolean {
  return enabled;
}

export function setDebugModeEnabled(next: boolean): void {
  if (enabled === next) return;
  enabled = next;
  try {
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    /* private mode: the switch still works for this session */
  }
  for (const listener of listeners) listener();
}

export function subscribeDebugMode(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether this page asked for the panel through the URL. Read once; the setting is what persists. */
export function debugModeForcedByUrl(search: string = typeof window === "undefined" ? "" : window.location.search): boolean {
  try {
    return new URLSearchParams(search).get("diag") === "1";
  } catch {
    return false;
  }
}

/** Test seam. */
export function resetDebugModeForTests(): void {
  enabled = false;
  listeners.clear();
}
