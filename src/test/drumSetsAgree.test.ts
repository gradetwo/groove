import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isDrumTrack } from "../utils/trackUtils";

/**
 * The four kinds that make up the kit, in **three** copies — and the ninth kind that must not be one of them.
 *
 * Reading the three found that they had **already drifted**: the shared classifier in `trackUtils.ts` carries nine ids (the canonical four plus `perc`, `clap`,
 * `hat`, `cymbals`, `toms`), while `CompareView.tsx` and `GenreDetailView.tsx` each carry the canonical four and rely on their own keyword fallback for the
 * rest. Asserting "all three are the same set" would therefore be false; what is worth asserting is the thing the copies exist for — that the canonical four
 * agree everywhere, and that an **audio lane is not a drum** in any of them.
 *
 * Three copies is three chances to drift, which is why this is a test rather than a comment. The audio kind is correct here **by absence**, and absence is
 * exactly the kind of correctness that stops being true without anyone noticing.
 */
const CANONICAL_DRUMS = ["kick", "snare", "hihat", "percussion"];

const source = (path: string) => readFileSync(path, "utf8");

describe("the drum sets", () => {
  it("does not call an audio lane a drum, through the shared classifier", () => {
    for (const track of [
      { track_id: "audio", name: "Audio" },
      { track_id: "audio", name: "Riser", laneId: "riser" },
    ]) {
      expect(isDrumTrack(track, 0), JSON.stringify(track)).toBe(false);
    }
  });

  it("keeps the canonical four in every copy, so no copy can quietly lose one", () => {
    // The shared classifier writes them one per line; the two views write them in a single array. Both shapes are checked as a set of ids.
    const files = ["src/utils/trackUtils.ts", "src/views/CompareView.tsx", "src/views/GenreDetailView.tsx"];
    for (const file of files) {
      const text = source(file);
      for (const id of CANONICAL_DRUMS) {
        expect(new RegExp(`"${id}"`).test(text), `${file} lost ${id}`).toBe(true);
      }
    }
  });

  it("names no audio lane in any of them — the decision, held where it is easiest to lose", () => {
    for (const file of ["src/utils/trackUtils.ts", "src/views/CompareView.tsx", "src/views/GenreDetailView.tsx"]) {
      const set = source(file).match(/DRUM_TRACK_IDS = new Set\(\[([\s\S]*?)\]\)/);
      expect(set, `${file} has no DRUM_TRACK_IDS set`).not.toBeNull();
      expect(set![1]!.includes("audio"), `${file} listed an audio lane as a drum`).toBe(false);
    }
  });

  it("records the divergence that is real, rather than pretending the copies match", () => {
    // Two of the three carry only the canonical four; the shared classifier carries the aliases as well. Both are asserted, so a change to either is visible.
    const shared = source("src/utils/trackUtils.ts").match(/DRUM_TRACK_IDS = new Set\(\[([\s\S]*?)\]\)/)![1]!;
    const view = source("src/views/CompareView.tsx").match(/DRUM_TRACK_IDS = new Set\(\[([^\]]*)\]\)/)![1]!;
    expect(shared).toContain('"perc"');
    expect(view).not.toContain('"perc"');
  });
});
