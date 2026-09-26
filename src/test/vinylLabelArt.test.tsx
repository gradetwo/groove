import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { labelCacheKey, type LabelSpec } from "../mobile/vinyl/vinylTexture";

/**
 * The genre's artwork on the record's label.
 *
 * Two things are worth pinning and neither needs a canvas: the label re-bakes when the **picture** changes (otherwise
 * switching skin would keep the previous skin's print, which is the bug the covers had on the tiles), and the spec carries
 * the image as its bottom layer rather than replacing anything the label already prints.
 */
const spec = (over: Partial<LabelSpec> = {}): LabelSpec => ({
  title: "DEEP HOUSE",
  subtitle: "House",
  footer: "GROOVE REC · 33 1/3 RPM",
  lanes: [[true, false], [false, false], [true, false], [false, false]],
  art: { shape: "rings", bg: "#111", fg: "#eee" } as LabelSpec["art"],
  accent: "#5eead4",
  displayFont: "Space Grotesk",
  monoFont: "IBM Plex Mono",
  ...over,
});

describe("the record's label artwork", () => {
  it("re-bakes when the picture changes, and not when it does not", () => {
    const without = labelCacheKey(spec());
    const oneSkin = labelCacheKey(spec({ cover: { image: {} as CanvasImageSource, key: "/covers/comic/deep-house.jpg" } }));
    const otherSkin = labelCacheKey(spec({ cover: { image: {} as CanvasImageSource, key: "/covers/pixel/deep-house.jpg" } }));
    expect(oneSkin).not.toBe(without);
    expect(otherSkin).not.toBe(oneSkin);
    // The same picture twice is the same key: the label must not re-bake on every frame.
    expect(labelCacheKey(spec({ cover: { image: {} as CanvasImageSource, key: "/covers/comic/deep-house.jpg" } }))).toBe(oneSkin);
  });

  it("keeps the text on the label in the key, cover or no cover", () => {
    const base = labelCacheKey(spec({ cover: { image: {} as CanvasImageSource, key: "/covers/comic/a.jpg" } }));
    const renamed = labelCacheKey(spec({ title: "TECH HOUSE", cover: { image: {} as CanvasImageSource, key: "/covers/comic/a.jpg" } }));
    expect(renamed).not.toBe(base);
  });
});

/**
 * The canvas itself needs a 2D context, so the paint gate is tested where it can be: by checking that the prop is part of
 * the picture's redraw key. Without that, an image arriving after the first frame would never be drawn in lite mode.
 */
describe("lite mode still redraws when the picture changes", () => {
  it("includes the label art key in the redraw key", async () => {
    const source = await import("node:fs").then((fs) => fs.readFileSync("src/mobile/vinyl/VinylCanvas.tsx", "utf8"));
    expect(source).toMatch(/state\.labelArt\?\.key/);
    expect(source).toMatch(/if \(lite && !dirty\) return;/);
  });
});
