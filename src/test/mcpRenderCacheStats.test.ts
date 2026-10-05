/**
 * ⭐ **A render says where its time went, not only how long it took.**
 *
 * `sampleCache.ts` has been accumulating `networkMs` and `decodeMs` all along, and nothing reported them: a two hundred
 * and eighty second stem render is a black box, so the largest number this ledger has cannot be cut further. The render
 * reply carries them now, after `durationSec`, because a caller reads the first key first and the answer has to stay
 * first. This criterion reads the source, which is enough to keep the numbers plumbed; that they are correct is a claim
 * only a render can settle, and the ledger says so rather than pretending otherwise.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const headless = readFileSync("mcp/render/headless.ts", "utf8");

describe("the render reply", () => {
  it("⭐ reports the cache's network and decode time beside the duration", () => {
    const start = headless.indexOf("export async function renderPatternHeadless");
    expect(start, "renderPatternHeadless is gone").toBeGreaterThan(-1);
    const body = headless.slice(start, headless.indexOf("\n}", headless.indexOf("return {", start)));
    expect({ reports: /sampleCacheStats/.test(body) }).toEqual({ reports: true });
  });
});
