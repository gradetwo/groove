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
 *
 * ⚠️ **`testOnly` 80 → 101, 2026-10-15, and this one is a finding rather than a raise.** Deleting the dead
 * `components/sequencer/PianoRollLane.tsx` (3,264 lines, whose only importer was its own test) revealed what it had been
 * the sole production consumer of: `features/sequencer/rollModel.ts` — 1,293 lines and 49 exports of chord stamps,
 * arpeggiation, humanisation and note arithmetic — has **no production consumer at all** now that it is gone, and neither
 * does anything else in the live editor: `PianoRollV2` does not import `rollModel`. So ~27 of those exports became
 * test-only, and the module and its four criteria are the only things that reach them.
 *
 * The module is **kept** rather than deleted: it is a coherent, tested library and deleting it would also delete the
 * capability's last expression, which is an owner's call rather than a budget's. `docs/OPEN_WORK.md` records it. `dead`
 * went **down** 27 → 26 in the same change, because one export had no reader at all and was removed.
 *
 * ⭐ **The `Gs1PresetPreview` bump was reverted the same day, which is the lifecycle this number should have.** It was briefly
 * 102 while the audition yard (owner's B1) existed with green criteria and **no interface constructing it** — a real
 * work-in-progress, and counted rather than wired half-way, because a preview button with no context to build a yard from is a
 * control that looks like it plays and does not. Wiring it into `ArrangementViewV2` put it back to 101. Recorded because the
 * round-trip is the evidence that the number means something.
 */
const CAP = { dead: 27, testOnly: 101 };

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
        /**
     * ⭐ The floor only has to prove the scan read the tree, so it follows the tree down. Retiring the v1 sequencer chain removed
     * exports along with the files that declared them -- the count sits at 1999 -- and a floor that stayed at 2000 would report a
     * healthy scan as a broken one. The budget the case exists to protect is `dead` and `testOnly`, and neither moved.
     */
    expect({ files: m.productionFiles > 400, exports: m.exports > 1900 })
      .toEqual({ files: true, exports: true });
  }, 60000);
});
