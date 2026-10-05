/**
 * 🩺 **An id that matches no lane must be named.**
 *
 * The deep-test report of 2026-10-05 found `render_arrangement_preview` returning a silent WAV when it was scoped
 * to specific tracks: `flattenMcpArrangement` keeps only the lanes whose id is in `trackIds`, and an unknown id
 * contributes nothing *by design* — but nothing in the reply said so, so a caller that mistyped one id got silence
 * with no diagnosis. The handler now computes which ids matched nothing and puts them in the reply, both as
 * `unknownTrackIds` and as a sentence in `arrangementProblems`.
 *
 * This pins the mechanism, not the wording: that the handler derives the unknown ids, that the reply carries them,
 * and that the problems list says what they mean. A render that lost its sound source silently would be worse than
 * one that fails, so the criterion exists to keep the difference visible.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SOURCE = "mcp/registryArrangement.ts";

/** The preview handler's body, from its name to the next tool definition. */
function previewHandler(): string {
  const text = readFileSync(SOURCE, "utf8");
  const start = text.indexOf('name: "render_arrangement_preview"');
  if (start < 0) return "";
  const rest = text.slice(start);
  const next = rest.indexOf('name: "render_arrangement"');
  return next < 0 ? rest : rest.slice(0, next);
}

describe("the preview reports track ids that matched nothing", () => {
  it("⭐ derives the unmatched ids from the arrangement's own lanes", () => {
    const body = previewHandler();
    const missing = ["unknownTrackIds", "knownTrackIds", "lanes.tracks"].filter((needle) => !body.includes(needle));
    expect(missing).toEqual([]);
  });

  it("⭐ carries them in the reply and explains them", () => {
    const body = previewHandler();
    expect({ inReply: body.includes("...(unknownTrackIds.length ? { unknownTrackIds }"), explained: /no lane has the id/.test(body) })
      .toEqual({ inReply: true, explained: true });
  });

  it("⭐ still measures, so a moved handler cannot pass quietly", () => {
    const body = previewHandler();
    expect({ found: body.length > 1000, hasHandler: body.includes("handler: async") })
      .toEqual({ found: true, hasHandler: true });
  });
});
