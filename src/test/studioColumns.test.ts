/**
 * The studio's two columns, at the source (G.46).
 *
 * ## What went wrong
 *
 * The grid is `lg:grid-cols-[352px_1fr]` and the dossier declares `order-2 lg:order-1`, so the
 * *editor* has to declare the other half of that contract. It used to: the sequencer was a direct
 * grid child carrying `order-1 lg:order-2`. Then the first-run hint and the save indicator were
 * added above it inside a new `<div className="min-w-0 flex flex-col">` — and the order classes stayed
 * on the `section` *inside* that wrapper, where they do nothing. With the wrapper at the default
 * `order: 0`, the dossier's `lg:order-1` sorted it first, so at ≥1024px the dossier took the `1fr`
 * track (measured 1012px at 1440×900) and the sequencer was squeezed into 352px — three step cells
 * per track.
 *
 * ## Why a source test as well as the browser check
 *
 * The end-to-end matrix now compares the two grid items to each other in a real layout
 * (`scripts/test_matrix.js`), which is the check that would have caught this. It needs a built app
 * and a browser, though, and it can only say "they are swapped"; this file pins the *contract* that
 * keeps them right — the grid item, not its child, carries the order — so the reason is visible where
 * somebody would edit it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const studioView = readFileSync(path.join(SRC_DIR, "views/StudioView.tsx"), "utf8");
const infoDossier = readFileSync(path.join(SRC_DIR, "components/sequencer/InfoDossier.tsx"), "utf8");

describe("studio columns · the grid items carry the order", () => {
  it("gives the sequencer's wrapper the half of the order contract the dossier does not own", () => {
    expect(studioView).toContain('<div className="min-w-0 flex flex-col order-1 lg:order-2">');
  });

  it("keeps the dossier on the other half, so the two cannot both be first", () => {
    expect(infoDossier).toMatch(/order-2 lg:order-1/);
  });

  it("puts the order classes on a direct grid child, with the panel inside it", () => {
    // The regression was exactly "the order classes ended up one level below the grid item", so the
    // assertion is structural: the wrapper is inside the grid, and the panel is inside the wrapper.
    const gridStart = studioView.indexOf("lg:grid-cols-[352px_1fr]");
    const wrapperAt = studioView.indexOf('<div className="min-w-0 flex flex-col order-1 lg:order-2">');
    const gridEnd = studioView.indexOf("</main>", gridStart);
    expect(gridStart).toBeGreaterThan(-1);
    expect(wrapperAt).toBeGreaterThan(gridStart);
    expect(wrapperAt).toBeLessThan(gridEnd);

    const panelAt = studioView.indexOf("<SequencerPanel", wrapperAt);
    expect(panelAt).toBeGreaterThan(wrapperAt);
    expect(panelAt).toBeLessThan(gridEnd);
  });

  it("keeps the two-column grid itself, and the collapsed/single-column escape", () => {
    expect(studioView).toContain("lg:grid-cols-[352px_1fr]");
    expect(studioView).toContain('isSidebarCollapsed || isEditorMaximized ? "grid-cols-1"');
  });
});
