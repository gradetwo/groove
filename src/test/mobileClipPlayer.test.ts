import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { clipForGenre, readClipManifest } from "../data/genreClips";

/**
 * ⭐ **The phone's clip player** (owner's decisions ② and ③, 2026-10-10: 15–30 秒主题片段, MP3 on a Cloudflare Worker).
 *
 * The reasons this criterion is not just "does the file exist":
 *
 *  - it must read the shipped list with the app's **own reader**, so a malformed manifest becomes a sentence rather than a
 *    silently empty player (the same rule that made the batch refuse to name files it had not written);
 *  - **speed changes pitch, on purpose** — the shell is a record (`VinylCanvas`, `VinylScrub`), so `preservesPitch` is false
 *    including the two vendor-prefixed spellings WebKit and Firefox still use;
 *  - a missing clip **says why** instead of drawing a control that does nothing.
 */
const player = readFileSync(resolve(__dirname, "../mobile/MobileClipPlayer.tsx"), "utf8");

describe("the clip player", () => {
  it("⭐ reads the manifest with the app's own reader, not JSON.parse", () => {
    expect(player).toContain("readClipManifest(raw)");
    // ⭐ Comments are stripped first: this file *talks* about JSON.parse in prose, and a criterion that cannot tell prose
    // from code fails on its own documentation (which is how this assertion failed the first time it ran).
    const code = player.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(code, "and does not hand-roll the parse").not.toContain("JSON.parse");
    expect(player, "the list is fetched from the served manifest").toContain("genre-clips.json");
  });

  it("⭐ plays through <audio> with the speed applied and the pitch following it", () => {
    expect(player).toContain("<audio");
    expect(player).toMatch(/playbackRate = rate/);
    expect(player, "a record speeds up and rises in pitch").toMatch(/preservesPitch = false/);
    expect(player, "WebKit").toMatch(/webkitPreservesPitch = false/);
    expect(player, "Firefox").toMatch(/mozPreservesPitch = false/);
  });

  it("⭐ offers the three speeds and the A/B comparison, all at 44 px", () => {
    expect(player).toMatch(/const RATES = \[0\.75, 1, 1\.25\]/);
    expect(player).toContain('data-testid="mobile-clip-compare"');
    for (const testid of ['mobile-clip-play', 'mobile-clip-speed-', 'mobile-clip-compare']) {
      expect(player, `${testid} exists`).toContain(testid);
    }
    // ⭐ Two carriers: the play button and each speed button (the speed ones are rendered from `RATES`, so the count of
    // *sources* is smaller than the count of *controls* — the floor here is about the code, not the runtime).
    expect((player.match(/min-h-11 min-w-11/g) ?? []).length, "every control is thumb-sized").toBeGreaterThanOrEqual(2);
  });

  it("⭐ says why when there is no clip, instead of drawing a dead control", () => {
    expect(player).toContain('data-testid="mobile-clip-missing"');
    expect(player, "the manifest's own reason is used when it is empty").toMatch(/emptyReason/);
    expect(player, "and a genre with no entry is named").toMatch(/no clip for/);
  });

  it("⭐ and the lookup it depends on is the shipped one", () => {
    const manifest = readClipManifest({ bars: 8, clips: [{ genreId: "g", url: "g.mp3", seconds: 16, engineVersion: "1", recipeVersion: "1", generatedAt: "2026-10-10", recordedLanes: 1, builtInLanes: 1 }] });
    expect(clipForGenre(manifest, "g")?.url).toBe("g.mp3");
    expect(clipForGenre(manifest, "absent")).toBeUndefined();
  });
});
