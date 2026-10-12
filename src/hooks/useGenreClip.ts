import { useCallback, useEffect, useState } from "react";
import { clipForGenre, readClipManifest, type GenreClip, type GenreClipManifest } from "../data/genreClips";

/**
 * ⭐ **The pre-generated clips, read the way the phone reads them.**
 *
 * The manifest is the list of MP3s the Worker serves, and the app's own strict reader is what parses it — a hand-rolled
 * `JSON.parse` would turn a malformed list into a silently empty player, which is the failure mode this project keeps
 * removing. The hook exposes the lookup rather than a single clip because the comparison view holds two to four genres at
 * once and a hook cannot be called inside its map.
 *
 * `loading` is true only until the manifest has been read **or** has failed: a genre with no entry is not "still loading",
 * it is a genre with no clip, and the surfaces are expected to say so.
 */
export interface ClipManifestLookup {
  loading: boolean;
  /** Why the manifest could not be used (a bad field, a bad response, an empty list), or null. */
  unavailable: string | null;
  clipFor: (genreId: string) => GenreClip | undefined;
}

export function useClipManifest(): ClipManifestLookup {
  const [manifest, setManifest] = useState<GenreClipManifest | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const base = (import.meta.env?.BASE_URL ?? "/").replace(/\/+$/, "");
        const response = await fetch(`${base}/genre-clips.json`);
        if (!response.ok) throw new Error(String(response.status));
        const read = readClipManifest(await response.json());
        if (cancelled) return;
        setManifest(read);
        if (read.clips.length === 0) setFailed(read.emptyReason ?? "the manifest lists no clips");
      } catch (error: unknown) {
        if (!cancelled) setFailed(error instanceof Error ? error.message : String(error));
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const clipFor = useCallback(
    (genreId: string) => (manifest ? clipForGenre(manifest, genreId) : undefined),
    [manifest]
  );

  return { loading: manifest === null && failed === null, unavailable: failed, clipFor };
}

export interface GenreClipResult {
  clip: GenreClip | undefined;
  loading: boolean;
  unavailable: string | null;
}

/** ⭐ One genre's clip, for a surface that auditions a single genre at a time. */
export function useGenreClip(genreId: string): GenreClipResult {
  const { loading, unavailable, clipFor } = useClipManifest();
  return { clip: clipFor(genreId), loading, unavailable };
}

/**
 * ⭐ **Start the pre-cut clip for a caller that has no JSX to render it in.**
 *
 * The element is imperative because `useGenreAudition`'s consumers must not have to grow a slot for it, and looping is
 * deliberate: the engine the clip replaces loops, so a one-shot clip would end under a transport that still said
 * "playing". On failure `onFailure` runs — the caller drops its playing state and says why, rather than a button that
 * lies. The caller owns the returned element and must release it with {@link stopClipAudition} on stop, genre change and
 * unmount.
 *
 * ⭐ **It is attached to the document, hidden, and carries the same `data-testid` the React clip element uses.** A
 * detached `new Audio()` is invisible to `document.querySelectorAll("audio")` and to a probe, which cost a whole round of
 * "the timeline does not play a clip" readings that were an instrument problem rather than a defect. A hidden element
 * costs nothing functionally and makes the path observable from the network *and* the DOM.
 */
export function playClipAudition(url: string, onFailure: () => void): HTMLAudioElement {
  const audio = new Audio(url);
  audio.loop = true;
  audio.setAttribute("data-testid", "clip-audition-audio");
  audio.hidden = true;
  if (typeof document !== "undefined") document.body.appendChild(audio);
  void audio.play().catch(onFailure);
  return audio;
}

/** ⭐ Pause a clip and take it out of the document, so a probe sees it appear and disappear with the transport. */
export function stopClipAudition(audio: HTMLAudioElement | null): void {
  if (!audio) return;
  audio.pause();
  audio.remove();
}
