import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GenreCover, genreCoverForSkin } from "../mobile/GenreCover";
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

  it("asks for the skin's own image first", () => {
    expect(genreCoverForSkin("deep-house", "comic")).toBe("/covers/comic/deep-house.jpg");
    expect(genreCoverForSkin("deep-house", "pixel")).toBe("/covers/pixel/deep-house.jpg");
    // …and the shared image is what a caller with no skin gets, which is the pre-cover behaviour.
    expect(genreCoverForSkin("deep-house", undefined)).toBe("/covers/deep-house.jpg");
  });

  it("renders the active skin's image", () => {
    localStorage.setItem(SKIN_STORAGE_KEY, "soviet");
    render(<GenreCover genreId="deep-house" testId="cover" />);
    expect(screen.getByTestId("cover").getAttribute("src")).toBe("/covers/soviet/deep-house.jpg");
  });

  it("falls back to the shared image when the skin has none, then to nothing", async () => {
    localStorage.setItem(SKIN_STORAGE_KEY, "minimal");
    render(<GenreCover genreId="deep-house" testId="cover" />);
    const image = screen.getByTestId("cover");
    expect(image.getAttribute("src")).toBe("/covers/minimal/deep-house.jpg");

    // A skin with no art for this genre: the shared image takes over.
    fireEvent.error(image);
    await waitFor(() => expect(screen.getByTestId("cover").getAttribute("src")).toBe("/covers/deep-house.jpg"));

    // Neither exists: nothing is rendered, and the caller's generated art is the tile again.
    fireEvent.error(screen.getByTestId("cover"));
    await waitFor(() => expect(screen.queryByTestId("cover")).toBeNull());
  });

  it("tries the new skin's image after a skin change, rather than remembering the old failure", async () => {
    localStorage.setItem(SKIN_STORAGE_KEY, "comic");
    render(<GenreCover genreId="deep-house" testId="cover" />);
    fireEvent.error(screen.getByTestId("cover"));
    await waitFor(() => expect(screen.getByTestId("cover").getAttribute("src")).toBe("/covers/deep-house.jpg"));

    // Switching skins must not inherit that failure: the shared image failed, the new skin's has not been tried.
    localStorage.setItem(SKIN_STORAGE_KEY, "pixel");
    window.dispatchEvent(new Event(SKIN_CHANGED_EVENT));
    await waitFor(() => expect(screen.getByTestId("cover").getAttribute("src")).toBe("/covers/pixel/deep-house.jpg"));
  });
});
