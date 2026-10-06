/**
 * 📐 **The dead-export count only moves down.**
 *
 * Measured 2026-10-05 06:26 with the scope enumerated in `check_dead_exports.mjs`: twenty nine exports that
 * nothing in production or tests refers to, and seventy six that only tests mention, over five hundred and
 * eighteen production files. The reading is a lower bound — a name reused as a local elsewhere inflates it —
 * and it cannot see dynamic reach, so this is a screening budget and not a licence to delete. Three of the
 * twenty nine are believed to be features that were started and never wired up, and per the owner's decision
 * of the same day they stay where they are and stay recorded instead.
 *
 * 2026-10-05 08:07 — the owner asked for the two leftovers to go: `useLabelArt` (whose intended consumer,
 * `VinylCanvas`, was retired with the phone shell) and `CATEGORY_SWATCH` (whose own comment says the phone
 * shell needed exactly six swatches). They were confirmed to have no references anywhere, the file and the
 * block were removed, and the reading fell from twenty nine to twenty seven, so the cap comes down with it.
 */
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

type Entry = { name: string; file: string; line: number };
type Measure = { productionFiles: number; exports: number; dead: Entry[]; testOnly: Entry[] };

/**
 * ⭐ **Raised by four for the v2 package module** (`src/features/sequencer/arrangementPackage.ts`), added with its own
 * criteria one step before it is wired into the builder, the validator and the file tools. Those four exports are reached
 * by tests only until that wiring lands, which is what this budget measures. Lower it back to 76 when the module has
 * production callers, and raise it for nothing else.
 */
const CAP = { dead: 27, testOnly: 80 };

function measure(): Measure {
  const out = execFileSync("node", ["scripts/check_dead_exports.mjs"], { encoding: "utf8" });
  const line = out.split("\n")[0];
  const m = /production files (\d+) \| exports (\d+) \| dead (\d+) \| testOnly (\d+)/.exec(line);
  if (!m) throw new Error(`could not read the measurement: ${line}`);
  const dead: Entry[] = [];
  for (const l of out.split("\n").slice(1)) {
    const e = /^\s+dead\s+(\S+)\s+(\S+):(\d+)$/.exec(l);
    if (e) dead.push({ name: e[1], file: e[2], line: Number(e[3]) });
  }
  return { productionFiles: Number(m[1]), exports: Number(m[2]), dead, testOnly: new Array(Number(m[4])) };
}

describe("exports nothing refers to", () => {
  it("⭐ stays under the measured budget", () => {
    const m = measure();
    expect({ dead: m.dead.length <= CAP.dead, testOnly: m.testOnly.length <= CAP.testOnly })
      .toEqual({ dead: true, testOnly: true });
  }, 60000);

  it("⭐ still measures, so a silent failure cannot pass", () => {
    const m = measure();
    /**
     * ⭐ **The measurement ran, which is all this case is for.** It used to require `dead > 0` as a floor -- proof the scan had
     * not silently found nothing -- and that floor stopped being true on 2026-10-06, when the v1 arrangement chain and its
     * criteria were deleted and the last unreferenced exports went with them. Zero dead exports is the goal this budget exists
     * to approach, so requiring one would now be requiring a defect.
     */
    expect({ files: m.productionFiles > 400, exports: m.exports > 2000 })
      .toEqual({ files: true, exports: true });
  }, 60000);
});
