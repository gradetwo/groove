import { describe, expect, it } from "vitest";
import { createRenderProgress } from "../../mcp/render/progress";

/**
 * ⭐ **A stage that begins where the last one ended is still a stage** (third evaluation, section 6: stage progress).
 *
 * The reporter dropped anything that did not strictly increase, which is right for a counter and wrong for a stage: the
 * MP3 encode starts exactly where "render finished; writing the file" left off, so its announcement arrived at an equal
 * progress and was swallowed. F07 measured that encode at 480.5 ms per 5 s of audio — the slowest step of a render — so
 * the one stage a caller most needs to see was the one nobody could hear.
 */
const collect = () => {
  const sent: Array<{ progress: number; message: string }> = [];
  const reporter = createRenderProgress("token", (_token, progress, _total, message) => sent.push({ progress, message }));
  return { sent, reporter: reporter! };
};

describe("the render's stage progress", () => {
  it("⭐ delivers the encode's own announcement at the progress the render finished on", () => {
    const { sent, reporter } = collect();
    reporter.reportOf(1000, 1000, "render finished; writing the file");
    reporter.reportOf(1000, 1000, "encoding MP3 — 300s of audio at 192 kbps");
    expect(sent.map((entry) => entry.message)).toEqual([
      "render finished; writing the file",
      "encoding MP3 — 300s of audio at 192 kbps",
    ]);
  });

  it("⭐ still refuses a repeat, and still refuses to go backwards", () => {
    const { sent, reporter } = collect();
    reporter.reportOf(500, 1000, "halfway");
    // An identical message at the same progress is a repeat, which is what the old rule was protecting against.
    reporter.reportOf(500, 1000, "halfway");
    // And progress never decreases: a client that saw 500 must not then see 400 under a new sentence.
    reporter.reportOf(400, 1000, "a different sentence");
    expect(sent.map((entry) => entry.message)).toEqual(["halfway"]);
  });
});
