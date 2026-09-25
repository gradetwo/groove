import React, { useState } from "react";
import { genreCoverCandidates, genreCoverUrl } from "./genreArt";
import { useSkin } from "../hooks/useSkin";

/**
 * A genre's cover, resolved for the **active skin**.
 *
 * `public/covers/<skin>/<genre>.jpg` is where each skin's own artwork lives (six skins, 159 genres each), with the
 * shared `public/covers/<genre>.jpg` behind it for a skin that has no art for some genre. The lookup helper has existed
 * since the skins shipped; what was missing is the wiring — the tiles asked for `genreCoverUrl(id)` and so showed the
 * shared image under every skin, which is what the owner noticed.
 *
 * The fallback is a **set of failed URLs** rather than an index: the skin can change while the tile is on screen, and a
 * per-URL memory means the new skin's image is tried immediately instead of inheriting the previous skin's failure. A URL
 * that has failed once is not asked for again; when the list runs out the caller's generated art shows through, exactly
 * as it did before covers existed.
 */
export interface GenreCoverProps {
  genreId: string;
  /** Class names go on the image; the caller keeps its own frame, radius and sizing. */
  className?: string;
  /** `loading="lazy"` unless a caller wants the hero image immediately. */
  eager?: boolean;
  testId?: string;
}

export function GenreCover({ genreId, className, eager = false, testId }: GenreCoverProps) {
  const { skin } = useSkin();
  const [failed, setFailed] = useState<readonly string[]>([]);

  const candidates = genreCoverCandidates(genreId, skin);
  const src = candidates.find((candidate) => !failed.includes(candidate));
  // Nothing left to try: the generated art behind this element is the tile, which is the pre-cover behaviour.
  if (!src) return null;

  return (
    <img
      src={src}
      alt=""
      data-testid={testId}
      loading={eager ? "eager" : "lazy"}
      className={className}
      onError={() => setFailed((previous) => (previous.includes(src) ? previous : [...previous, src]))}
    />
  );
}

/**
 * The URL a skin's tile *should* be showing, for tests and for callers that need the string rather than the element.
 *
 * Kept next to the component so "which image does this skin show" has one answer in the codebase.
 */
export function genreCoverForSkin(genreId: string, skin: string | undefined): string {
  const [primary] = genreCoverCandidates(genreId, skin);
  return primary ?? genreCoverUrl(genreId);
}
