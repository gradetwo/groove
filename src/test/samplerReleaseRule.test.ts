import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_SAMPLER_RELEASE_SECONDS, samplerReleaseSeconds } from "../audio/samplerVoice";

/**
 * ⭐ **The owner's click, as a criterion** (reported 2026-10-09: playing the virtual keyboard, every note clicked at the
 * moment the key came up).
 *
 * The cause was a **divergence**: the offline sink released a note whose gate ended before its recording, while the two
 * live paths asked for the same release only when a legato join had handed the note on — so a plain pressed-and-released
 * note was cut at its gate live and rendered cleanly offline. That is exactly why the exported WAV was fine while the
 * keyboard clicked, and why "is it clipping?" and "is it a cut?" had different answers on the two paths.
 */
describe("when a sampled note gets a release instead of a cut", () => {
  it("⭐ releases a note whose written length ends before the recording does — the keyboard's case", () => {
    expect(samplerReleaseSeconds(0.2, 3)).toBe(DEFAULT_SAMPLER_RELEASE_SECONDS);
  });

  it("keeps the sample's own ending when the recording falls silent first", () => {
    expect(samplerReleaseSeconds(3, 0.2)).toBeUndefined();
  });

  it("asks for nothing when no length was written at all — the recording plays out", () => {
    expect(samplerReleaseSeconds(undefined, 3)).toBeUndefined();
  });

  it("⭐ and both the live and the offline paths ask this one function rather than deciding themselves", () => {
    for (const path of ["audio/browserSampleGraph.ts", "audio/samplerSteps.ts", "audio/samplerLaneSink.ts"]) {
      const source = readFileSync(resolve(__dirname, "..", path), "utf8");
      expect(source, `${path} asks the shared rule`).toContain("samplerReleaseSeconds(");
      expect(source, `${path} does not decide on its own`).not.toContain("DEFAULT_SAMPLER_RELEASE_SECONDS");
    }
  });
});
