import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { clipForGenre, readClipManifest, staleClips } from "../data/genreClips";

/**
 * ⭐ **The phone clips' manifest** (owner's decision 2026-10-10: pre-generate MP3s, keep them out of git, and regenerate
 * them in a batch). The audio lives in a Worker; this is the list, and it has to be honest about three things — what each
 * clip is, which build's sound it is, and why it is empty when it is.
 */
const clip = (over: Record<string, unknown> = {}) => ({
  genreId: "bossa-nova",
  url: "https://clips.example/bossa-nova.mp3",
  seconds: 20,
  lufs: -14,
  engineVersion: "2.36.0",
  recipeVersion: "1",
  generatedAt: "2026-10-10",
  recordedLanes: 6,
  builtInLanes: 2,
  ...over,
});

describe("the clip manifest", () => {
  it("⭐ reads a well-formed clip, and can find it by genre", () => {
    const manifest = readClipManifest({ clips: [clip()] });
    expect(clipForGenre(manifest, "bossa-nova")?.url).toContain("bossa-nova.mp3");
    expect(clipForGenre(manifest, "ambient")).toBeUndefined();
  });

  it("⭐ names the field when a clip is malformed, rather than playing the wrong sound", () => {
    expect(() => readClipManifest({ clips: [clip({ url: undefined })] })).toThrow(/clips\[0\] is missing `url`/);
    expect(() => readClipManifest({ clips: [clip({ seconds: 0 })] })).toThrow(/seconds must be a positive number/);
    expect(() => readClipManifest({ clips: "nope" })).toThrow(/must carry a `clips` array/);
  });

  it("⭐ refuses a silently empty manifest: 'the phone has no audio' must be a decision", () => {
    expect(() => readClipManifest({ clips: [] })).toThrow(/must say why it is empty/);
    expect(readClipManifest({ clips: [], emptyReason: "the batch has not run yet" }).emptyReason).toBe("the batch has not run yet");
  });

  it("⭐ calls a clip stale when the engine or the recipe has moved on", () => {
    const manifest = readClipManifest({ clips: [clip(), clip({ genreId: "ambient", engineVersion: "2.35.0" }), clip({ genreId: "lofi", recipeVersion: "0" })] });
    const stale = staleClips(manifest, "2.36.0", "1");
    expect(stale.map((entry) => entry.genreId).sort()).toEqual(["ambient", "lofi"]);
    expect(stale[0]?.reason).toMatch(/engine|recipe/);
    expect(staleClips(manifest, "2.36.0", "1")).toHaveLength(2);
    expect(staleClips(readClipManifest({ clips: [clip()] }), "2.36.0", "1")).toHaveLength(0);
  });

  it("⭐ and the shipped manifest is either fresh for this build or explicitly empty", () => {
    const raw = JSON.parse(readFileSync(resolve(__dirname, "../../public/genre-clips.json"), "utf8"));
    const manifest = readClipManifest(raw);
    if (manifest.clips.length === 0) {
      expect(manifest.emptyReason ?? "", "an empty list carries its reason").not.toBe("");
      return;
    }
    // ⭐ Once the batch has run, this is the criterion that keeps the clips true to the build they ship with.
    const version = JSON.parse(readFileSync(resolve(__dirname, "../../public/version.json"), "utf8")).version as string;
    const stale = staleClips(manifest, version, "1");
    expect(stale, `these clips were cut by another build: ${stale.map((s) => `${s.genreId} (${s.reason})`).join(", ")}`).toEqual([]);
  });
});
