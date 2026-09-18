/**
 * Studio layout preferences (D-01).
 *
 * Why this file exists: all five layout toggles in `StudioView` were plain
 * `useState(false)` with **zero** persistence anywhere in the repo, so every refresh —
 * and every trip to the console/compare view and back — made the user re-collapse the
 * sidebar and re-open the velocity lane. That contrasted badly with project data, which
 * *is* persisted. This is the single reader/writer for those toggles.
 *
 * Three rules this module is built around:
 *
 * 1. **Never throw, never lose the app.** `localStorage` can be absent (SSR, some
 *    privacy modes), full (quota), or hold data written by an older/newer build. Every
 *    read falls back to defaults, and every write is best-effort. A corrupt preference
 *    blob must not be able to break the studio.
 * 2. **Per-field recovery, not all-or-nothing.** One unrecognised field is repaired on
 *    its own; the rest of the user's layout survives. Discarding five good settings
 *    because one boolean arrived as a string would be a worse outcome than the bug this
 *    fixes.
 * 3. **The key carries a version and is never rewritten in place.** `D-01` is flagged
 *    irreversible in the plan: once `groove_layout_prefs_v1` is on a user's machine it
 *    stays there. A future shape change must add `groove_layout_prefs_v2` and keep
 *    reading v1 as a migration source — the same "release history only grows" discipline
 *    the repo already applies to `changelog.json` (red line R7c).
 *
 * Deliberately **not** persisted here, and this is a decision rather than an oversight
 * (D-06): `isDrumsOnly`, `isKeyboardMode`, `isRecordArmed`. They describe a live
 * performance state, not a layout preference — silently re-arming the recorder or
 * re-entering drum-only mode on the next visit would be a surprise, and possibly a
 * destructive one.
 */

/** Versioned storage key. See rule 3 above before changing this string. */
export const LAYOUT_PREFS_KEY = "groove_layout_prefs_v1";

/** Schema version stored *inside* the payload as well as in the key. */
export const LAYOUT_PREFS_VERSION = 1;

/** Density tiers (C-06 lands the UI; the field exists here so the shape is stable). */
export const DENSITY_TIERS = ["compact", "standard", "comfortable"] as const;
export type DensityTier = (typeof DENSITY_TIERS)[number];

export interface LayoutPrefs {
  version: number;
  isSidebarCollapsed: boolean;
  isEditorMaximized: boolean;
  isVelocityLaneOpen: boolean;
  isAnalyzerOpen: boolean;
  /** Piano roll drawer (item ⑦). */
  isPianoRollOpen: boolean;
  showAdvancedControls: boolean;
  density: DensityTier;
  /** Auto-scroll step matrix horizontally to follow the playhead. */
  autoFollowPlayhead: boolean;
}

/** The persisted booleans, in one place so tests can assert the exact set. */
export const LAYOUT_BOOLEAN_KEYS = [
  "isSidebarCollapsed",
  "isEditorMaximized",
  "isVelocityLaneOpen",
  "isAnalyzerOpen",
  "isPianoRollOpen",
  "showAdvancedControls",
  "autoFollowPlayhead",
] as const satisfies readonly (keyof LayoutPrefs)[];

export type LayoutBooleanKey = (typeof LAYOUT_BOOLEAN_KEYS)[number];

/**
 * Session-only flags. Exported so a test can assert they never reach storage — the
 * cheapest way to stop a future "just persist everything" edit from re-introducing the
 * surprise described above.
 */
export const SESSION_ONLY_FLAGS = ["isDrumsOnly", "isKeyboardMode", "isRecordArmed"] as const;

export const DEFAULT_LAYOUT_PREFS: Readonly<LayoutPrefs> = Object.freeze({
  version: LAYOUT_PREFS_VERSION,
  isSidebarCollapsed: false,
  isEditorMaximized: false,
  isVelocityLaneOpen: false,
  isAnalyzerOpen: false,
  isPianoRollOpen: false,
  showAdvancedControls: false,
  density: "standard",
  autoFollowPlayhead: true,
});

/** A fresh, mutable copy of the defaults (never hand out the frozen object). */
export function defaultLayoutPrefs(): LayoutPrefs {
  return { ...DEFAULT_LAYOUT_PREFS };
}

/**
 * Resolves a `Storage` implementation without assuming one exists.
 *
 * `window.localStorage` itself throws on access in some privacy configurations, which is
 * why even the lookup is wrapped.
 */
export function resolveLayoutStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDensityTier(value: unknown): value is DensityTier {
  return typeof value === "string" && (DENSITY_TIERS as readonly string[]).includes(value);
}

/**
 * Coerces an arbitrary parsed payload into a valid `LayoutPrefs`.
 *
 * Starts from the defaults and adopts only fields that pass validation, so a payload
 * with one bad field still contributes its good fields.
 */
export function coerceLayoutPrefs(raw: unknown): LayoutPrefs {
  const prefs = defaultLayoutPrefs();
  if (!isPlainObject(raw)) return prefs;

  // An unrecognised version means the payload was written by a build whose shape we do
  // not know. Merging it field-by-field would be guesswork, so fall back wholesale —
  // unlike a single bad *field*, which is safe to repair in place.
  if (raw.version !== LAYOUT_PREFS_VERSION) return prefs;

  for (const key of LAYOUT_BOOLEAN_KEYS) {
    const value = raw[key];
    if (typeof value === "boolean") prefs[key] = value;
  }
  if (isDensityTier(raw.density)) prefs.density = raw.density;

  return prefs;
}

/**
 * Reads the stored preferences, or the defaults when anything at all goes wrong
 * (no storage, empty, malformed JSON, wrong shape, unknown version).
 */
export function loadLayoutPrefs(storage: Storage | null = resolveLayoutStorage()): LayoutPrefs {
  if (!storage) return defaultLayoutPrefs();
  let raw: string | null = null;
  try {
    raw = storage.getItem(LAYOUT_PREFS_KEY);
  } catch {
    return defaultLayoutPrefs();
  }
  if (!raw) return defaultLayoutPrefs();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaultLayoutPrefs();
  }
  return coerceLayoutPrefs(parsed);
}

/**
 * Merges `patch` over what is currently stored and writes the result back.
 *
 * Returns the preferences that are now in effect, so a caller can use the return value as
 * the new state instead of re-reading. Best-effort: a storage failure (quota, disabled)
 * is swallowed — losing a layout preference must never surface as a broken UI.
 */
export function saveLayoutPrefs(
  patch: Partial<Omit<LayoutPrefs, "version">>,
  storage: Storage | null = resolveLayoutStorage()
): LayoutPrefs {
  const current = loadLayoutPrefs(storage);
  const next = coerceLayoutPrefs({ ...current, ...patch, version: LAYOUT_PREFS_VERSION });

  if (!storage) return next;
  try {
    storage.setItem(LAYOUT_PREFS_KEY, JSON.stringify(next));
  } catch {
    /* Quota exceeded or storage disabled: the in-memory state is still correct. */
  }
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new CustomEvent("groove_layout_prefs_changed", { detail: next }));
    } catch {
      /* ignore */
    }
  }
  return next;
}

/**
 * Removes only this module's key, for an explicit "reset layout" action.
 *
 * It deliberately does not clear anything else: `D-01` is irreversible in the sense that
 * the key lives on users' machines, and a reset must not become a way to wipe unrelated
 * settings.
 */
export function clearLayoutPrefs(storage: Storage | null = resolveLayoutStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(LAYOUT_PREFS_KEY);
  } catch {
    /* nothing to do */
  }
}

/** Projects the full prefs object down to exactly what is persisted (used by tests). */
export function toPersistedShape(prefs: LayoutPrefs): Record<string, unknown> {
  const out: Record<string, unknown> = { version: LAYOUT_PREFS_VERSION };
  for (const key of LAYOUT_BOOLEAN_KEYS) out[key] = prefs[key];
  out.density = prefs.density;
  return out;
}
