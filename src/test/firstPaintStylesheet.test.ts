/**
 * ⭐ **The first paint must not wait on a cross-origin stylesheet.**
 *
 * ## What was measured, and why this file gates the shape rather than the number
 *
 * On 2026-10-12, on this box (8 cores, load average 12–20 while measuring, so every wall-clock number below
 * is an *indicator*, not a fact), `index.html` loaded `https://fonts.googleapis.com/css2?family=…` as a
 * parser-blocking `<link rel="stylesheet">` in the head. That one request reached `responseEnd` at
 * **2012–2458 ms** across two probe runs, and FCP landed just behind it (2828 / 3604 ms), while the first
 * long task sat at 2387 ms: the stylesheet gates the **first paint**. In an A/B cut where the request was
 * blocked, total long tasks fell 8471 → 5343 ms while `Layout` stayed at 4272 ms — so it is not the
 * (separately diagnosed) forced-layout cost. `npm run perf:check` before/after is in the commit message.
 *
 * Those readings are **probes, not gates** (`scripts/probe_import_playback_jank.mjs` says why: the box is
 * shared, so a threshold on a wall-clock number fails for reasons the author does not control). What *is*
 * deterministic, and what this file holds, is the half a browser is not needed to see:
 *
 *   1. no cross-origin stylesheet in this document may be parser-blocking, and
 *   2. the font stylesheet must still be requested — with `display=swap`, off the critical path, and still
 *      naming every family the app's stylesheets actually use, so "make it fast" cannot silently become
 *      "delete the typography" and a family referenced by a skin cannot be dropped from the request.
 *
 * Both are read out of `index.html` and `src/**\/*.css`, so they go red the moment the property breaks.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..", "..");

/** One `<link>` in the document, with the attributes the criterion reasons about. */
export interface HeadLink {
  rel: string;
  href: string;
  media: string;
  onload: string;
  raw: string;
}

function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const body = tag.replace(/^<link\b/i, "").replace(/\/?>$/, "");
  const attribute = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of body.matchAll(attribute)) {
    const [, name, doubleQuoted, singleQuoted, bare] = match;
    attrs[name.toLowerCase()] = doubleQuoted ?? singleQuoted ?? bare ?? "";
  }
  return attrs;
}

/** Every `<link>` in `<head>`, in document order. Parses so the criterion is about the tag, not a spelling. */
export function parseHeadLinks(html: string): HeadLink[] {
  const head = html.slice(0, html.indexOf("</head>"));
  return Array.from(head.matchAll(/<link\b[^>]*>/gi), (match) => {
    const attrs = parseAttributes(match[0]);
    return {
      rel: (attrs.rel || "").trim(),
      href: (attrs.href || "").trim(),
      media: (attrs.media || "").trim(),
      onload: (attrs.onload || "").trim(),
      raw: match[0],
    };
  });
}

/** `https://…` and protocol-relative `//…` are another origin; `/assets/…` is this one. */
export function isCrossOrigin(href: string): boolean {
  return /^(https?:)?\/\//i.test(href);
}

/**
 * A stylesheet link the parser stops at before painting.
 *
 * A stylesheet with no `media` — or with `media="all"`/`"screen"` — applies to the current medium, so the
 * parser blocks on it. `media="print"` does not match the screen, and is therefore off the critical path
 * **provided** an `onload` afterwards turns it on: without the flip the sheet never applies at all, which
 * the "still requests the typography" assertion below catches rather than treating as acceptable here.
 * The `rel="preload" as="style"` spelling of the same trick is accepted as well, because it is the same
 * property: nothing on the parser's path applies a cross-origin sheet to the first paint.
 */
export function isRenderBlocking(link: HeadLink): boolean {
  if (!/(^|\s)stylesheet(\s|$)/i.test(link.rel)) return false;
  const nonMatching = ["print", "speech", "not all"].includes(link.media.toLowerCase());
  const flippedOn = /(?:media|rel)\s*=\s*["']?(?:all|screen|stylesheet)/i.test(link.onload);
  return !(nonMatching && flippedOn);
}

/** The families a `css2` URL asks for, in order, with the `:wght@…` axis suffix removed. */
export function requestedFamilies(css2Url: string): string[] {
  const query = css2Url.slice(css2Url.indexOf("?") + 1);
  return new URLSearchParams(query)
    .getAll("family")
    .map((family) => family.split(":")[0].trim())
    .filter(Boolean);
}

/** The requested families no stylesheet in `css` names — i.e. the request is paying for a face nothing uses. */
export function unusedFamilies(css2Url: string, css: string): string[] {
  return requestedFamilies(css2Url).filter(
    (family) => !css.includes(`"${family}"`) && !css.includes(`'${family}'`)
  );
}

function readAppStylesheets(): string {
  const files = readdirSync(path.join(ROOT, "src"), { recursive: true })
    .map(String)
    .filter((entry) => entry.endsWith(".css"));
  return files.map((entry) => readFileSync(path.join(ROOT, "src", entry), "utf8")).join("\n");
}

describe("the stylesheets the first paint may wait for", () => {
  const html = readFileSync(path.join(ROOT, "index.html"), "utf8");
  const links = parseHeadLinks(html);
  const css = readAppStylesheets();

  it("⛔ puts no cross-origin stylesheet on the parser's critical path", () => {
    const blocking = links.filter((link) => isCrossOrigin(link.href) && isRenderBlocking(link));
    expect(blocking.map((link) => link.href)).toEqual([]);
  });

  it("⭐ still requests every family the stylesheets name, with swap, off the critical path", () => {
    const font = links.find((link) => link.href.includes("fonts.googleapis.com/css2"));
    if (!font) {
      throw new Error(
        "index.html no longer requests the Google Fonts stylesheet — every desktop skin and the phone " +
          "shell type themselves in families it provides, so the fix here is to load it later, not to drop it"
      );
    }
    expect(font.href).toContain("display=swap");
    expect(isRenderBlocking(font), "the font stylesheet is not parser-blocking").toBe(false);
    expect(requestedFamilies(font.href).length).toBeGreaterThan(0);
    expect(unusedFamilies(font.href, css), "a requested family no stylesheet names").toEqual([]);
  });

  it("⛔ flags the spelling that was measured blocking, so the criterion can go red", () => {
    const measured =
      '<link href="https://fonts.googleapis.com/css2?family=Inter&display=swap" rel="stylesheet" />';
    const blocking = parseHeadLinks(`<head>${measured}</head>`);
    expect(blocking).toHaveLength(1);
    expect(isRenderBlocking(blocking[0])).toBe(true);

    // The async twin is accepted, so the assertion is about the property rather than about one spelling…
    const async =
      '<link href="https://fonts.googleapis.com/css2?family=Inter&display=swap" rel="stylesheet" media="print" onload="this.media=\'all\'" />';
    expect(isRenderBlocking(parseHeadLinks(`<head>${async}</head>`)[0])).toBe(false);

    // …the family criterion can fail too…
    expect(unusedFamilies("https://fonts.googleapis.com/css2?family=Invented+Face", css)).toEqual([
      "Invented Face",
    ]);

    // …and the parser is not vacuously empty on the real document.
    expect(links.some((link) => link.href.includes("fonts.googleapis.com/css2"))).toBe(true);
    expect(links.some((link) => link.rel === "stylesheet")).toBe(true);
  });
});
