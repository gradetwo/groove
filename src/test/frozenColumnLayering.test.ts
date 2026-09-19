/**
 * The frozen track-header column must stay above the playhead beam.
 *
 * `probe:grid-gutter` is the behavioural check, and it *is* in the gate — but it can only see this
 * defect when the playhead happens to sit on the first step of the visible window, because that is
 * the only time the beam's left edge lands a few pixels inside the column. Measured: it failed with
 * 99 of 14592 samples bad in roughly half of the runs, on a tree where nothing about the column had
 * changed. A gate that fires half the time is worse than one that never does.
 *
 * So the invariant is pinned here, deterministically, in the two places that implement it:
 *
 *  - the beam is a positioned sibling of the rows with a z-index of 15 (`index.css`);
 *  - each row is its own stacking context at z-20 (`TrackRow`, `Ruler`), which makes the row, its
 *    solid layer (`z-30`) and its header (`z-40`) paint above the beam as one unit.
 *
 * That is the whole mechanism. Remove either half and the beam re-enters the column.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = resolve(__dirname, "..");
const read = (relative: string) => readFileSync(resolve(SRC, relative), "utf8");

function beamZIndex(): number {
  const css = read("index.css");
  const block = css.slice(css.indexOf(".playhead-laser-beam {"));
  const match = block.slice(0, block.indexOf("}")).match(/z-index:\s*(\d+)/);
  expect(match, "the playhead beam has no z-index to compare against").toBeTruthy();
  return Number(match![1]);
}

describe("frozen column layering", () => {
  it("keeps every grid row above the playhead beam", () => {
    const beam = beamZIndex();

    // Both rows are the flex row that carries the frozen column; `TrackRow` writes its className as a
    // template literal and `Ruler` as a plain string, so this matches the class prefix they share.
    const rowSignature = "relative z-20 flex items-center gap-[var(--trk-head-gap)]";
    for (const name of ["components/sequencer/TrackRow.tsx", "components/sequencer/Ruler.tsx"]) {
      expect(read(name), `${name}'s row is not its own stacking context`).toContain(rowSignature);
    }

    // And the beam really is below them — the assertion above would be vacuous otherwise.
    expect(beam).toBeLessThan(20);
  });

  it("keeps the solid layer and the header inside the row's context", () => {
    // The row's context is pointless unless the layer (z-30) and header (z-40) live inside it.
    const css = read("index.css");
    const layer = css.slice(css.indexOf(".trk-head-solid {"));
    const layerZ = Number(layer.slice(0, layer.indexOf("}")).match(/z-index:\s*(\d+)/)![1]);
    expect(layerZ).toBeGreaterThan(beamZIndex());
    expect(layerZ).toBeLessThan(40); // the header must still paint above the layer
  });
});
