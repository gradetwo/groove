/**
 * ⭐ **Two tools, one analysis** (mcp/registryAnalysis.ts).
 *
 * `spectral_balance` and `analyze_audio` call the same function with the same argument, so calling both pays for the same
 * decode, measure and curve twice. A creation run measured the two calls at 2.73 s and 2.58 s with byte-identical replies,
 * which is 115-126 s per song spent twice. The measurement is real and so is the cost, so the cheaper half of the fix is
 * for the description to say so: a caller that reads it will not ask for the same analysis twice. Nothing is removed —
 * the tool surface and its gate count it — and this criterion fails if the sentence goes away.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const registry = readFileSync("mcp/registryAnalysis.ts", "utf8");

describe("the analysis tools", () => {
  it("⭐ says out loud that spectral_balance and analyze_audio are one analysis", () => {
    const start = registry.indexOf('name: "spectral_balance"');
    expect(start, "spectral_balance is gone").toBeGreaterThan(-1);
    const block = registry.slice(start, registry.indexOf("readOnly: true", start));
    expect({ overlaps: /analyze_audio/.test(block) }).toEqual({ overlaps: true });
  });
});
