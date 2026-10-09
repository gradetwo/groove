import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * ⭐ **The cold start is not silence** (MCP deep test of v2.35.9: the first render took **126 s** for 14.6 s of audio —
 * *"用戶視角接近卡死"*, and the report's own suggestion was a progress callback or a warm-up hint).
 *
 * Everything before the engine exists is silent: the render child process, `chromium.launch()`, and the app's module graph.
 * For a short piece that silence is the whole render, so a caller cannot tell a cold start from a hang. `report`'s own doc
 * names this case — "`total` is omitted when the length is not known yet — a cold start, before a context exists" — and
 * the warm-up narration that already existed only begins once recordings start loading, which is *after* the slow part.
 */
const renderTools = ["mcp/registryRender.ts", "mcp/registryArrangement.ts"];

describe("every render that can report progress announces the cold start", () => {
  it("⭐ says the engine is starting — and that a first render starts a browser — before any waiting", () => {
    for (const path of renderTools) {
      const source = readFileSync(resolve(__dirname, "../..", path), "utf8");
      expect(source, `${path} hands a reporter to a renderer`).toContain("progress: ctx?.progress");
      expect(source, `${path} announces the start`).toMatch(/ctx\?\.progress\?\.report\(0, "/);
      expect(source, `${path} says why it is slow`).toContain("also starts a browser");
      // ⭐ And the announcement comes **before** the renderer is called, or it lands after the wait it describes.
      const announceAt = source.indexOf('ctx?.progress?.report(0, "');
      const callAt = Math.min(
        ...["await renderAudio(", "await renderStems("].map((needle) => {
          const at = source.indexOf(needle);
          return at === -1 ? Number.POSITIVE_INFINITY : at;
        })
      );
      expect(announceAt, `${path}: the message precedes the call`).toBeLessThan(callAt);
    }
  });
});
