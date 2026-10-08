import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * ⭐ **The row height survives a missing variable** (found by instrumenting the e2e assertion, 2026-10-09).
 *
 * The release matrix failed intermittently on WebKit with *"header 0 is at 726px/119px against its lane at 845px/22px —
 * the two columns must share one row height"* and passed on the next attempt. Printing the scene at the point of failure
 * answered it in one line: **both rows reported `variable: ""`** — `--arr-track-h` was not defined in that render — so
 * `height: var(--arr-track-h)` resolved to nothing and each column fell back to **its own content** (119 px for the
 * header's, 22 px for the lane's). The variable lives in `src/index.css`, so this is a stylesheet-timing window, not a
 * layout rule that can be asserted away.
 *
 * A `var()` fallback makes both columns agree **whatever happens to the stylesheet**, which is the property the row-height
 * contract actually needs.
 */
const read = (path: string) => readFileSync(resolve(__dirname, "..", path), "utf8");

describe("the arrangement's track height", () => {
  it("⭐ every use of the height variable carries the design value as a fallback", () => {
    for (const path of ["components/arrangement/ArrangementViewV2.tsx", "components/arrangement/ArrangementLaneV2.tsx"]) {
      const source = read(path);
      const uses = source.match(/var\(--arr-track-h[^)]*\)/g) ?? [];
      expect(uses.length, `${path} uses the variable`).toBeGreaterThan(0);
      for (const use of uses) {
        expect(use, `${path}: ${use} must survive a missing variable`).toContain("96px");
      }
    }
  });
});
