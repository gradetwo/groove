import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GenreCover, genreCoverForSkin } from "../components/GenreCover";
import { SKIN_CHANGED_EVENT, SKIN_STORAGE_KEY } from "../features/settings/skinPrefs";

/**
 * Each skin shows **its own** genre cover.
 *
 * `public/covers/<skin>/<genre>.jpg` holds every skin's artwork (six skins, 159 genres each) and
 * `public/covers/<genre>.jpg` sits behind it as the shared fallback. The lookup helper has existed since the skins
 * shipped; the tiles simply never used it, so every skin showed the same image — which is what the owner noticed.
 */
describe("a genre's cover follows the active skin", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("asks for the thumbnail first, because a tile is 56 px", () => {
    // The originals are 1024x1024 and 130-626 KB; a library screen decodes a megapixel per tile, which is the shape of the
    // owner's "after a few dozen tracks it stutters, but the recorded audio is fine".
    expect(genreCoverForSkin("deep-house", "comic")).toBe("/covers/_thumbs/comic/deep-house.jpg");
    expect(genreCoverForSkin("deep-house", "pixel")).toBe("/covers/_thumbs/pixel/deep-house.jpg");
    // …and the full image is what a caller asks for explicitly.
    expect(genreCoverForSkin("deep-house", "comic", false)).toBe("/covers/comic/deep-house.jpg");
  });

  it("asks for the skin's own image first when the full image is wanted", () => {
    expect(genreCoverForSkin("deep-house", "comic", false)).toBe("/covers/comic/deep-house.jpg");
    expect(genreCoverForSkin("deep-house", "pixel", false)).toBe("/covers/pixel/deep-house.jpg");
    // …and the shared image is what a caller with no skin gets, which is the pre-cover behaviour.
    expect(genreCoverForSkin("deep-house", undefined, false)).toBe("/covers/deep-house.jpg");
  });

  it("renders the active skin's image", () => {
    localStorage.setItem(SKIN_STORAGE_KEY, "soviet");
    render(<GenreCover genreId="deep-house" testId="cover" />);
    expect(screen.getByTestId("cover").getAttribute("src")).toBe("/covers/_thumbs/soviet/deep-house.jpg");
  });

  it("falls back to the shared image when the skin has none, then to nothing", async () => {
    localStorage.setItem(SKIN_STORAGE_KEY, "minimal");
    render(<GenreCover genreId="deep-house" testId="cover" />);
    const image = screen.getByTestId("cover");
    expect(image.getAttribute("src")).toBe("/covers/_thumbs/minimal/deep-house.jpg");

    // The chain is skin-thumb → shared-thumb → skin-full → shared-full, and it walks it one error at a time.
    const seen: string[] = [];
    for (let step = 0; step < 4; step += 1) {
      const current = screen.queryByTestId("cover");
      if (!current) break;
      seen.push(current.getAttribute("src") ?? "");
      fireEvent.error(current);
      await waitFor(() => {
        const next = screen.queryByTestId("cover");
        // Either it advanced or it is gone; both are progress.
        expect(next === null || (next.getAttribute("src") ?? "") !== seen[seen.length - 1]).toBe(true);
      });
    }
    expect(seen[0]).toBe("/covers/_thumbs/minimal/deep-house.jpg");
    expect(seen).toContain("/covers/_thumbs/deep-house.jpg");
    // Nothing left to try: nothing is rendered, and the caller's generated art is the tile again.
    expect(screen.queryByTestId("cover")).toBeNull();
  });

  it("tries the new skin's image after a skin change, rather than remembering the old failure", async () => {
    localStorage.setItem(SKIN_STORAGE_KEY, "comic");
    render(<GenreCover genreId="deep-house" testId="cover" />);
    fireEvent.error(screen.getByTestId("cover"));
    await waitFor(() =>
      expect(screen.getByTestId("cover").getAttribute("src")).toBe("/covers/_thumbs/deep-house.jpg")
    );

    // Switching skins must not inherit that failure: the shared image failed, the new skin's has not been tried.
    localStorage.setItem(SKIN_STORAGE_KEY, "pixel");
    window.dispatchEvent(new Event(SKIN_CHANGED_EVENT));
    await waitFor(() =>
      expect(screen.getByTestId("cover").getAttribute("src")).toBe("/covers/_thumbs/pixel/deep-house.jpg")
    );
  });
});
