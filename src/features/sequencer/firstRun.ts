/**
 * "Has this visitor ever started playback?"
 *
 * The first screen is a dense editor with a loaded pattern and no single instruction (U1). The guide
 * covers a first-time visitor, but anyone who dismissed it — or came back tomorrow — is left with a
 * grid and a transport and no idea which one to touch first.
 *
 * One key, written the first time playback actually starts (or the prompt is dismissed). Deliberately
 * one key for both events: in each case the answer to "should this be shown again?" is no.
 */
const FIRST_PLAY_KEY = "groove_first_play_done";

/** `true` once playback has started or the prompt was dismissed. Storage failures read as "no". */
export function hasStartedPlayback(): boolean {
  try {
    return localStorage.getItem(FIRST_PLAY_KEY) === "true";
  } catch {
    // A storage that refuses to be read must not make the prompt permanent.
    return false;
  }
}

/** Records that the prompt has served its purpose. Silent when storage refuses to write. */
export function markPlaybackStarted(): void {
  try {
    localStorage.setItem(FIRST_PLAY_KEY, "true");
  } catch {
    /* the prompt will simply appear again; nothing else depends on this */
  }
}

/** Test/QA helper: forget the record so the first-run path can be exercised again. */
export function resetFirstRunRecord(): void {
  try {
    localStorage.removeItem(FIRST_PLAY_KEY);
  } catch {
    /* nothing to do */
  }
}
