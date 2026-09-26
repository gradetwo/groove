import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * A cold PWA launch showed a black screen for a few seconds, because `#root` was empty until React had downloaded, parsed and
 * run the entry chunk. The document now draws its own first frame — inline markup and inline style, so it paints before any
 * module is fetched — and this holds the two properties that make it work: it is **inside `#root`** (so React replaces it on
 * its first commit, with no code path of ours able to leave it behind) and it needs **no external resource**.
 */
describe("the boot splash", () => {
  const html = fs.readFileSync(path.resolve(__dirname, "../../index.html"), "utf8");

  it("is inside the React root, so the first commit replaces it", () => {
    const root = html.slice(html.indexOf('<div id="root">'));
    // The ids are minified by hand (`bs`), because every byte here is inside the initial-route budget.
    expect(root).toContain("<div id=bs>");
    // …and it is the root's *content*, not a sibling that would have to be removed by hand.
    expect(root.indexOf("<div id=bs>")).toBeLessThan(root.indexOf("</div>\n    <style>"));
  });

  it("styles itself inline, with no stylesheet, font or script to wait for", () => {
    const style = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
    expect(style).toContain("#bs{");
    expect(style).toContain("background:#0a0b0d");
    // A media query for reduced motion: the bar is decoration, not information.
    expect(style).toContain("prefers-reduced-motion");
  });
});
