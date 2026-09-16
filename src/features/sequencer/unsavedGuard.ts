import type { Genre, SequencerPattern, SequencerTrack } from "../../types/genre";
import { patternFromGenre } from "../../data/genreMix";

/**
 * "You have unsaved changes" — detection and the ask-once preference (item ⑧).
 *
 * The reported scenario: edit a pattern, click another genre, and your work is gone with no
 * question. `SET_GENRE` replaces **both** pattern slots with the new genre's defaults, so the
 * loss is total rather than partial; the same is true of loading a project, switching slots and
 * "Inspire Me". Those are the destructive actions this module exists to gate.
 *
 * ## Why compare against a regenerated default instead of tracking a dirty flag
 *
 * A flag has to be set by every mutating action and cleared by every load — twenty-odd actions,
 * and the first one somebody forgets makes the prompt lie in the expensive direction (silent
 * data loss) or the annoying direction (a prompt with nothing to lose). Regenerating the genre's
 * default is stateless and self-correcting: whatever the pattern contains, it is compared with
 * what switching away would actually give you. `patternFromGenre` is deterministic (V-01), so
 * this is a pure function of the data.
 *
 * The comparison is canonical (fixed field order, absent fields normalised to `null`) so that a
 * pattern which merely gained an explicit `gate: 0.8` array is correctly seen as edited, while
 * key-order differences after a spread are not mistaken for edits.
 */

/** Musically meaningful projection of a track, with absent fields normalised. */
function canonicalTrack(track: SequencerTrack) {
  return {
    track_id: track.track_id,
    instrument: track.instrument ?? null,
    steps: track.steps ?? [],
    velocity: track.velocity ?? null,
    pitch: track.pitch ?? null,
    gate: track.gate ?? null,
    ratchet: track.ratchet ?? null,
    probability: track.probability ?? null,
    trackLength: track.trackLength ?? null,
    volume: track.volume ?? null,
    pan: track.pan ?? null,
    swing: track.swing ?? null,
    sendA: track.sendA ?? null,
    sendB: track.sendB ?? null,
    mute: track.mute ?? null,
    solo: track.solo ?? null,
    phaseInvert: track.phaseInvert ?? null,
  };
}

export function canonicalPattern(pattern: SequencerPattern | null | undefined) {
  if (!pattern) return null;
  return {
    genre_id: pattern.genre_id ?? null,
    bpm: pattern.bpm ?? null,
    scale: pattern.scale ?? null,
    swing: pattern.swing ?? 0,
    timeSignature: pattern.timeSignature ?? "4/4",
    resolution: pattern.resolution ?? "1/16",
    totalSteps: pattern.totalSteps ?? null,
    tracks: (pattern.tracks ?? []).map(canonicalTrack),
  };
}

export function patternsEqual(a: SequencerPattern | null | undefined, b: SequencerPattern | null | undefined): boolean {
  return JSON.stringify(canonicalPattern(a)) === JSON.stringify(canonicalPattern(b));
}

/**
 * True when either slot differs from what the genre would load.
 *
 * Both slots matter: `SET_GENRE` overwrites A *and* B, so an edit in the inactive slot is just
 * as lost as one in the active slot.
 */
export function isPatternDirty(
  patterns: { A: SequencerPattern | null | undefined; B: SequencerPattern | null | undefined },
  genre: Genre | null | undefined
): boolean {
  if (!genre) return false;
  const defaultPattern = patternFromGenre(genre);
  return !patternsEqual(patterns.A, defaultPattern) || !patternsEqual(patterns.B, defaultPattern);
}

/**
 * The "do not ask again" preference.
 *
 * Stored under its own key with the same defensive-read discipline as the layout prefs: a corrupt
 * or hostile payload falls back to asking (the safe direction — the user loses nothing by being
 * asked), and a wrong-typed field is repaired rather than taking the whole payload down.
 */
export const UNSAVED_PROMPT_KEY = "groove_unsaved_prompt_v1";

export interface UnsavedPromptPrefs {
  version: number;
  /** When true, destructive actions proceed without asking. */
  suppress: boolean;
}

const UNSAVED_PROMPT_VERSION = 1;

export function defaultUnsavedPromptPrefs(): UnsavedPromptPrefs {
  return { version: UNSAVED_PROMPT_VERSION, suppress: false };
}

function resolveStorage(storage?: Storage | null): Storage | null {
  if (storage !== undefined) return storage;
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function loadUnsavedPromptPrefs(storage?: Storage | null): UnsavedPromptPrefs {
  const store = resolveStorage(storage);
  if (!store) return defaultUnsavedPromptPrefs();
  let raw: string | null = null;
  try {
    raw = store.getItem(UNSAVED_PROMPT_KEY);
  } catch {
    return defaultUnsavedPromptPrefs();
  }
  if (!raw) return defaultUnsavedPromptPrefs();
  try {
    const parsed = JSON.parse(raw) as Partial<UnsavedPromptPrefs>;
    // An unknown version is not guessed at; asking again is always safe.
    if (parsed.version !== UNSAVED_PROMPT_VERSION) return defaultUnsavedPromptPrefs();
    return { version: UNSAVED_PROMPT_VERSION, suppress: parsed.suppress === true };
  } catch {
    return defaultUnsavedPromptPrefs();
  }
}

export function saveUnsavedPromptPrefs(prefs: UnsavedPromptPrefs, storage?: Storage | null): void {
  const store = resolveStorage(storage);
  if (!store) return;
  try {
    store.setItem(UNSAVED_PROMPT_KEY, JSON.stringify({ version: UNSAVED_PROMPT_VERSION, suppress: prefs.suppress }));
  } catch {
    /* quota / private mode: the prompt simply keeps asking */
  }
}
