/**
 * The genre's artwork for the record's label, loaded and ready to draw.
 *
 * The canvas bake is synchronous and an `Image` is not, so the loading lives here: the hook resolves the **skin's** image
 * (falling back to the shared one, exactly as `GenreCover` does — the two must agree about which picture a skin shows) and
 * hands back a key that changes when the picture does. `VinylCanvas` puts that key into its redraw key, so a late-arriving
 * image repaints even in lite mode.
 *
 * ⭐ **A genre change no longer blanks the label while the next cover loads.** It used to clear the image the moment the
 * genre moved and then load the replacement, so the artwork in the middle of the disc went empty for as long as a network
 * image took to decode — on a phone that reads as the screen flashing black between tracks (owner, 2026-10-13). The
 * previous picture is now kept on screen until its successor has decoded, and covers that have already decoded are
 * cached by URL so a revisit is instant rather than a second load.
 *
 * ⚠️ **The previous picture is kept only while a load is still possible.** If every candidate fails — a genre with no
 * art at all — the hook returns `null` rather than leaving the *last genre's* cover on the disc, because a wrong record
 * label is a lie where a blank one is just plain paper.
 */
import { useEffect, useState } from "react";
import { genreCoverCandidates } from "../utils/genreArt";
import { useSkin } from "./useSkin";

export interface LabelArt {
  image: CanvasImageSource;
  key: string;
}

/**
 * Decoded covers, by URL. Bounded because unbounded is how a cache becomes a leak: past the cap the oldest entry is
 * dropped, and an image the label is currently showing is still held by React state, so evicting it cannot blank the disc.
 */
const DECODED_CAP = 24;
const decoded = new Map<string, CanvasImageSource>();

function remember(url: string, image: CanvasImageSource): void {
  decoded.delete(url);
  decoded.set(url, image);
  while (decoded.size > DECODED_CAP) {
    const oldest = decoded.keys().next();
    if (oldest.done) break;
    decoded.delete(oldest.value);
  }
}

/** What the label has: a picture for a genre, or the fact that this genre is still trying to load one. */
interface Loaded {
  genreId: string;
  art: LabelArt | null;
  pending: boolean;
}

export function useLabelArt(genreId: string): LabelArt | null {
  const { skin } = useSkin();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  /**
   * The last picture actually shown. Kept apart from `loaded` because "this genre has no art *yet*" and "this genre has
   * no art at all" are different states, and only the first may borrow the previous label.
   */
  const [shown, setShown] = useState<LabelArt | null>(null);

  useEffect(() => {
    const candidates = genreCoverCandidates(genreId, skin);
    let alive = true;

    /** A decoded candidate for this genre: the revisit path, which should not wait for a load at all. */
    const cachedKey = candidates.find((url) => decoded.has(url));
    if (cachedKey !== undefined) {
      const art = { image: decoded.get(cachedKey)!, key: cachedKey };
      setLoaded({ genreId, art, pending: false });
      setShown(art);
      return () => {
        alive = false;
      };
    }

    // A load is starting, so whatever is on the disc may stay up until this genre's own picture arrives.
    setLoaded((current) => (current?.genreId === genreId ? current : { genreId, art: null, pending: true }));

    const tryNext = (index: number) => {
      if (!alive) return;
      if (index >= candidates.length) {
        // Every candidate failed. This genre has no art, so the disc keeps its plain paper rather than a stale label.
        setLoaded({ genreId, art: null, pending: false });
        return;
      }
      const url = candidates[index];
      const image = new Image();
      image.decoding = "async";
      image.onload = () => {
        remember(url, image);
        if (!alive) return;
        const art = { image, key: url };
        setLoaded({ genreId, art, pending: false });
        setShown(art);
      };
      // A skin with no art for this genre falls through to the shared image; if that fails too the label keeps its paper.
      image.onerror = () => tryNext(index + 1);
      image.src = url;
    };
    tryNext(0);

    return () => {
      alive = false;
    };
  }, [genreId, skin]);

  /** This genre's picture once it has arrived; the previous one meanwhile, so a track change does not blank the disc. */
  if (loaded?.genreId === genreId) return loaded.art ?? (loaded.pending ? shown : null);
  return loaded?.pending ? shown : null;
}
