/**
 * ⭐ **The vocal patches have to be codes this repository's own decoder accepts, not strings that look like codes.**
 *
 * A share code is an opaque base64url payload (`gs1.1.<b64url>`), and these five were read out of the synth's
 * `gs1.patch.get` over MCP. `vocalPatches.ts` is generated from that answer, which means the failure to catch is a
 * **copy that drifted**: a truncated or re-encoded string still starts with `gs1.1.` and would only show up much later as
 * a vowel that sounds wrong or a host that refuses the patch.
 *
 * So the criterion decodes each one with the same function `Gs1VoicePool` uses when it loads a lane's patch, and asserts
 * the payload is a patch the synth would recognise — plus that the vowel mapping is total, because a vocal lane picked by
 * vowel has to find a patch for every vowel offered.
 */
import { describe, it, expect } from "vitest";
import { FACTORY_VOCAL_PATCHES, vocalPatchById } from "../data/vocalPatches";
import { GS1_PATCH_PREFIX, decodeGs1PatchCode } from "../audio/gs1/gs1PatchCode";

describe("the factory vocal patches", () => {
  it("⭐ decodes with this repository's own share-code reader, so a drifted copy cannot pass", () => {
    expect(FACTORY_VOCAL_PATCHES.length, "the five formant choir presets").toBe(5);
    for (const patch of FACTORY_VOCAL_PATCHES) {
      expect(patch.shareCode.startsWith(GS1_PATCH_PREFIX), `${patch.id} carries the plain prefix`).toBe(true);
      const decoded = decodeGs1PatchCode(patch.shareCode);
      expect(decoded.ok, `${patch.id} decodes: ${decoded.ok ? "" : decoded.problem}`).toBe(true);
    }
  });

  it("⭐ is keyed by the synth's own preset id, so a caller names the voice the synth names", () => {
    for (const id of ["vocalah", "vocaloh", "vocalee", "vocaloo", "vocalhum"]) {
      expect(vocalPatchById(id), `${id} is a preset a caller may ask for`).toBeDefined();
    }
    // And an id the synth does not have is `undefined` rather than a guess — the caller can then refuse it out loud.
    expect(vocalPatchById("vocalsaxophone")).toBeUndefined();
  });

  it("⭐ gives every patch a distinct code and a vowel, because two identical voices would be a silent mistake", () => {
    const codes = new Set(FACTORY_VOCAL_PATCHES.map((patch) => patch.shareCode));
    expect(codes.size, "no two patches share a code").toBe(FACTORY_VOCAL_PATCHES.length);
    // Every patch names a vowel, and they are distinct — this is what makes "pick by lyric" meaningful rather than a
    // list of five names that all sound the same.
    const vowels = FACTORY_VOCAL_PATCHES.map((patch) => patch.vowel);
    expect(vowels.every((v) => v.length > 0)).toBe(true);
    expect(new Set(vowels).size).toBe(vowels.length);
  });
});
