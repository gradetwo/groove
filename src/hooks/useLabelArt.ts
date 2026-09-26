/**
 * The genre's artwork for the record's label, loaded and ready to draw.
 *
 * The canvas bake is synchronous and an `Image` is not, so the loading lives here: the hook resolves the **skin's** image
 * (falling back to the shared one, exactly as `GenreCover` does — the two must agree about which picture a skin shows) and
 * hands back a key that changes when the picture does. `VinylCanvas` puts that key into its redraw key, so a late-arriving
 * image repaints even in lite mode.
 *
 * Returns `null` until an image has decoded; the label bakes with its paper and gains the picture on the next frame.
 */
import { useEffect, useState } from "react";
import { genreCoverCandidates } from "../mobile/genreArt";
import { useSkin } from "./useSkin";

export interface LabelArt {
  image: CanvasImageSource;
  key: string;
}

export function useLabelArt(genreId: string): LabelArt | null {
  const { skin } = useSkin();
  const [art, setArt] = useState<LabelArt | null>(null);

  useEffect(() => {
    const candidates = genreCoverCandidates(genreId, skin);
    let alive = true;
    setArt(null);

    const tryNext = (index: number) => {
      if (!alive || index >= candidates.length) {
        if (alive) setArt(null);
        return;
      }
      const url = candidates[index];
      const image = new Image();
      image.decoding = "async";
      image.onload = () => {
        if (alive) setArt({ image, key: url });
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

  return art;
}
