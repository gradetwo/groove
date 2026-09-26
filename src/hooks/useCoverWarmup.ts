import { useEffect, useRef } from "react";
import { preloadGenreCover, preloadGenreCovers } from "../mobile/genreArt";
import { useSkin } from "./useSkin";

/**
 * Warm the cover art a view is about to draw.
 *
 * Images are fetched when their element first renders, which is why a list, a hero or the player's disc shows a blank frame and
 * then a picture — the owner's "涉及到图片加载的地方，没有合适的预加载，每次都是触发才下载". `loading="lazy"` cannot fix it: lazy
 * decides *when to start*, not whether the bitmap is ready when the element paints. `preloadGenreCover` fetches and then
 * `decode()`s, which is the step that makes the paint instant.
 *
 * One hook for both shells, because the rule is the same everywhere and three copies of it would drift:
 *
 * * the request is keyed by **skin as well as id** — a skin change is a different file, so it is a new warm-up, not a repeat;
 * * anything already asked for is never asked for again (a re-render costs nothing, and the browser would deduplicate anyway);
 * * at most `concurrency` requests are in flight, so warming never competes with the transport for the main thread;
 * * nothing is warmed after unmount.
 */
export function useCoverWarmup(
  ids: readonly (string | null | undefined)[],
  options: { thumb?: boolean; concurrency?: number } = {}
): void {
  const { skin } = useSkin();
  const { thumb = true, concurrency = 3 } = options;
  const warmedRef = useRef<Set<string>>(new Set());
  /**
   * A stable key for the request, so the effect's dependency is a string rather than an array that changes identity on every
   * render (`useMemo` in the caller would work too, but then every caller has to remember to do it).
   */
  const key = ids.filter((id): id is string => Boolean(id)).join(",");

  useEffect(() => {
    const wanted = key ? key.split(",") : [];
    if (wanted.length === 0) return;
    const stamp = (id: string) => `${skin ?? "default"}:${thumb ? "t" : "f"}:${id}`;
    const missing = wanted.filter((id) => !warmedRef.current.has(stamp(id)));
    if (missing.length === 0) return;
    for (const id of missing) warmedRef.current.add(stamp(id));
    let cancelled = false;
    void preloadGenreCovers(missing, { skin, thumb, concurrency }).catch(() => {
      /* warming is best-effort by definition */
    });
    return () => {
      cancelled = true;
      // `cancelled` is read by nothing below on purpose: the fetches are already in flight and aborting them would waste
      // the bytes the browser has started to receive. What matters is that no *new* work is scheduled after unmount, which
      // the dedupe set guarantees — the effect only ever starts requests for ids it has not started before.
      void cancelled;
    };
  }, [key, skin, thumb, concurrency]);
}

/** Warm one cover in both sizes — the bar shows a thumbnail and the vinyl label bakes from the original. */
export function useCoverWarmupBothSizes(genreId: string | null | undefined): void {
  useCoverWarmup(genreId ? [genreId] : [], { thumb: true });
  useCoverWarmup(genreId ? [genreId] : [], { thumb: false });
}

export { preloadGenreCover };
