/**
 * The two things that make `position: sticky` possible in this app (G.47).
 *
 * Sticky was declared in several places — the app header (`sticky top-0 z-50`), the dossier sidebar
 * — and never worked, anywhere, because `<body>` carried Tailwind's `overflow-x-hidden`. An element
 * with `overflow: hidden` *is* a scroll container, so `body` became the nearest scrollport for every
 * sticky descendant; and because `body` scrolls with the page rather than inside it, the elements
 * moved up and away anyway. Measured after a 400 px wheel at 1440×900: header at `top −400`.
 *
 * Nothing failed, because nothing was asserting it - a CSS property that silently disables another
 * is exactly the kind of defect a jsdom test cannot observe, so it is pinned at the source:
 *
 *   1. `<body>` must not go back to `overflow-x-hidden` (the utility wins over the stylesheet by
 *      specificity, which is what made the fix non-obvious);
 *   2. the stylesheet must clip horizontally with `clip`, not `hidden`;
 *   3. the two sticky elements must be anchored to the header's own height token, and the transport
 *      strip must be a *sibling* of the toolbar rather than a child of it (a sticky element can only
 *      travel inside its parent's box, which was 63 px);
 *   4. the token itself has to exist.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const html = read("index.html");
const css = read("src/index.css");
const header = read("src/components/Header.tsx");
const toolbar = read("src/components/sequencer/Toolbar.tsx");
const dossier = read("src/components/sequencer/InfoDossier.tsx");

describe("sticky anchors · the page must not be a scroll container", () => {
  it("keeps `overflow-x-hidden` off the body tag", () => {
    const bodyTag = /<body[^>]*>/.exec(html)?.[0] ?? "";
    expect(bodyTag, "the <body> tag is gone").not.toBe("");
    expect(bodyTag, "`overflow-x-hidden` on <body> disables every `sticky` in the app").not.toContain(
      "overflow-x-hidden"
    );
  });

  it("clips horizontally with `clip`, keeping the `hidden` fallback for old browsers", () => {
    // The order matters: `hidden` first (Safari < 16 falls back to today's behaviour), then `clip`.
    expect(css).toMatch(/overflow-x:\s*hidden;\s*\n\s*overflow-x:\s*clip;/);
  });

  it("declares the header height both sticky elements anchor to", () => {
    // The first-paint value; the header measures itself into the same custom property on mount,
    // because its height depends on whether it wraps (145/107/69 px at 768/834/1440).
    expect(css).toMatch(/--app-header-h:\s*\d+px;/);
  });

  it("has the header measure itself instead of trusting a constant", () => {
    expect(header).toContain("ResizeObserver");
    expect(header).toContain('setProperty(\n        "--app-header-h"');
    expect(header).toContain("headerRef");
  });

  it("wraps the header instead of letting controls run off the edge", () => {
    // Measured before: the header's contents are 1153 px wide, so at 834 eight controls (search,
    // random, language, settings, version, help, onboarding, shortcuts) sat past the right edge and
    // were unreachable — the header scrolled only programmatically, which is why the E2E's clicks
    // worked while no finger could. `flex-wrap` lets it grow instead; the E2E asserts no header
    // control is outside the viewport on any desktop/tablet target.
    expect(header).toContain("flex flex-wrap items-center justify-between gap-x-4 gap-y-2");
  });
});

describe("sticky anchors · the transport strip", () => {
  it("is sticky, parked under the header by the token", () => {
    expect(toolbar).toContain('data-testid="toolbar-transport-strip"');
    expect(toolbar).toMatch(
      /className="sticky top-\[var\(--app-header-h\)\] z-30 -mx-3 sm:-mx-4[^"]*"/
    );
  });

  it("is a sibling of the toolbar, not a child of it", () => {
    // A sticky element can only move inside its parent's box. Inside the toolbar (one ~116 px row)
    // the strip had 63 px of travel and scrolled away with it; as a sibling its parent is the panel
    // section, which is as tall as the whole panel.
    const stripUsage = toolbar.indexOf("{transportStrip}");
    const toolbarRoot = toolbar.indexOf('data-testid="studio-toolbar"');
    expect(stripUsage).toBeGreaterThan(-1);
    expect(toolbarRoot).toBeGreaterThan(stripUsage);
  });

  it("keeps the transport's own testid, which the E2E reachability check measures", () => {
    expect(toolbar).toContain('data-testid="toolbar-group-transport"');
  });
});

describe("sticky anchors · the dossier sidebar", () => {
  it("stops using a hand-typed offset for the header", () => {
    expect(dossier).toContain("sticky top-[var(--app-header-h)]");
    expect(dossier, "`top-16` (64 px) is 5 px short of the real header").not.toMatch(/sticky top-16\b/);
  });
});
