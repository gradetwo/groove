import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readClipManifest } from "../data/genreClips";

/**
 * ⭐ **The shipped list is read by the same reader the app uses** (owner's pipeline, 2026-10-10).
 *
 * This exists because of a real defect: the batch wrote each clip's `url` from the *render format* (`.wav`) while the delivered
 * file was the MP3 the ffmpeg step produced, and nothing in the test suite read the committed manifest — so the two halves
 * could disagree in silence until the merge refused all 139 of them. A criterion that parses the real file with the real
 * reader closes that gap; the batch's own file-existence guard covers the other half (whether the named file is on disk),
 * which cannot live here because the output directory is not part of the repository.
 */
describe("the committed clip manifest", () => {
  it("⭐ parses with the app's own reader, and names delivered audio", () => {
    const raw = JSON.parse(readFileSync(resolve(__dirname, "../../public/genre-clips.json"), "utf8"));
    const manifest = readClipManifest(raw);
    if (manifest.clips.length === 0) {
      expect(manifest.emptyReason, "an empty manifest says why").toBeTruthy();
      return;
    }
    expect(manifest.clips.length, "the list is populated").toBeGreaterThan(0);
    for (const clip of manifest.clips) {
      expect(clip.url, `${clip.genreId} names an audio file`).toMatch(/\.(mp3|wav)$/);
      expect(clip.engineVersion, `${clip.genreId} records the engine that rendered it`).toBeTruthy();
      expect(clip.recipeVersion, `${clip.genreId} records the recipe`).toBeTruthy();
    }
  });

  it("⭐ and every clip that names a recording keeps the genre's own instruments", () => {
    const manifest = readClipManifest(JSON.parse(readFileSync(resolve(__dirname, "../../public/genre-clips.json"), "utf8")));
    for (const clip of manifest.clips) {
      // ⭐ Hard requirement A, checked on the shipped list rather than only inside the batch: a clip with no recorded lane
      // anywhere would be "all synth", which the owner ruled out.
      expect(clip.recordedLanes, `${clip.genreId} keeps at least one recorded lane`).toBeGreaterThan(0);
    }
  });
});
