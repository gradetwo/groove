/**
 * ⭐ **The discontinuity count says what it is, not just how many.**
 *
 * The detector compares each sample-to-sample jump with the file's own median jump, and the code that implements it
 * warns in a comment that dense material makes every edge look like a discontinuity. A real call on a percussive mix
 * returned one thousand eight hundred and twenty four of them with nothing in the reply or the description to say that
 * this is expected, which invites a reader to hear clicks that are not there. The tool now says so up front.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const registry = readFileSync("mcp/registryAnalysis.ts", "utf8");

describe("analyze_audio", () => {
  it("⭐ warns that dense material reports many discontinuities", () => {
    const start = registry.indexOf('name: "analyze_audio"');
    expect(start, "analyze_audio is gone").toBeGreaterThan(-1);
    const block = registry.slice(start, registry.indexOf("readOnly:", start));
    expect({ warns: /dense material/i.test(block) }).toEqual({ warns: true });
  });
});
