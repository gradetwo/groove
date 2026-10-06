/**
 * 📐 **A file may get shorter, never longer.**
 *
 * Measured 2026-10-05 01:14 over `mcp/**` and `src/**` (data tables, fixtures and tests excluded): **384**
 * files, **5** at two thousand lines or more, **13** at fifteen hundred, **25** at a thousand, **29** at eight
 * hundred and **46** at six hundred. The largest are `src/audio/AudioEngine.ts` at 3259 lines,
 * `src/components/sequencer/PianoRollLane.tsx` at 3241, `src/audio/WavExporter.ts` at 2608,
 * `src/views/GalaxyView.tsx` at 2356 and `src/components/sequencer/Toolbar.tsx` at 2295.
 *
 * ⚠️ This pins today's sizes; it does not schedule the work of splitting them. Splitting a three thousand
 * line audio engine is a project with its own seams and its own criteria, not something a size cap can
 * demand — what the cap buys is that the number can only move one way while that work happens.
 */
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

type Sizes = {
  files: number;
  atLeast600: number;
  atLeast800: number;
  atLeast1000: number;
  atLeast1500: number;
  atLeast2000: number;
  largest: Array<{ path: string; lines: number }>;
};

const CAPS: Record<string, number> = {
  atLeast600: 46,
  atLeast800: 29,
  atLeast1000: 25,
  atLeast1500: 13,
  atLeast2000: 5,
};

// The twelve largest files, pinned at their measured length.
const FILE_CAPS: Record<string, number> = {
  "src/audio/AudioEngine.ts": 3259,
  "src/components/sequencer/PianoRollLane.tsx": 3241,
  "src/audio/WavExporter.ts": 2608,
  "src/views/GalaxyView.tsx": 2356,
  "src/components/sequencer/Toolbar.tsx": 2295,
  "src/audio/PolySynth.ts": 1949,
  "src/audio/DrumKitModels.ts": 1925,
  "src/views/CompareView.tsx": 1842,
  "src/components/help/HelpCenterModal.tsx": 1687,
  "mcp/render/worker.ts": 1653,
  "src/views/ChordProgressionsView.tsx": 1559,
  "src/views/StudioView.tsx": 1478,
};

function measure(): Sizes {
  const out = execFileSync("node", ["scripts/check_file_sizes.mjs"], { encoding: "utf8" });
  return JSON.parse(out) as Sizes;
}

describe("production source sizes", () => {
  it("⭐ every bucket stays at or under its measured count", () => {
    const m = measure();
    const got: Record<string, boolean> = {};
    for (const [k, cap] of Object.entries(CAPS)) got[k] = (m as unknown as Record<string, number>)[k] <= cap;
    expect(got).toEqual(Object.fromEntries(Object.keys(CAPS).map((k) => [k, true])));
  }, 60000);

  it("⭐ and no pinned file has grown", () => {
    const m = measure();
    const grown = m.largest
      .filter((r) => FILE_CAPS[r.path] !== undefined && r.lines > FILE_CAPS[r.path])
      .map((r) => `${r.path}: ${r.lines} > ${FILE_CAPS[r.path]}`);
    expect({ grown }).toEqual({ grown: [] });
  }, 60000);

  it("⭐ still measures at all, so a silent failure cannot pass", () => {
    const m = measure();
    expect({ files: m.files > 300, largest: m.largest.length === 12 }).toEqual({ files: true, largest: true });
  }, 60000);
});
