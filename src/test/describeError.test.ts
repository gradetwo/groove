/**
 * 🗣 **A thrown thing becomes a sentence a person can read — or nothing gets shown at all.**
 *
 * Three modules had grown byte-identical copies of this helper, and the copy had a hole: `JSON.stringify(undefined)`
 * returns `undefined` rather than `"undefined"`, so the old body could return `undefined` from a function declared to
 * return a string. The message layer it feeds (`formatMessage`) deliberately preserves unknown placeholders, so the
 * user would have been shown a literal `{error}` — the exact failure the original comment warned about while the code
 * still had it.
 *
 * The criterion pins the two properties that matter to a reader: the answer is always a **non-empty string**, and a
 * plain object is described rather than printed as `[object Object]`.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { describeError } from "../utils/describeError";

describe("describeError", () => {
  it("⭐ always answers with a non-empty string, including for undefined and null", () => {
    const inputs: unknown[] = [undefined, null, new Error("boom"), "plain", { code: 42 }, 0, false, Symbol("s")];
    const bad = inputs
      .map((input) => ({ input: String(input), text: describeError(input) }))
      .filter(({ text }) => typeof text !== "string" || text.length === 0);
    expect(bad).toEqual([]);
  });

  it("⭐ describes an object instead of printing [object Object], and keeps a real message", () => {
    expect(describeError(new Error("boom"))).toBe("boom");
    expect(describeError("plain")).toBe("plain");
    expect(describeError({ code: 42 })).toContain("42");
    expect(describeError({ code: 42 })).not.toContain("[object Object]");
    // A cycle is what JSON refuses, and the last resort still has to be readable.
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(typeof describeError(cyclic)).toBe("string");
  });

  it("⭐ one copy exists, so the family cannot drift apart again", () => {
    const files = [
      "src/utils/describeError.ts",
      "src/features/arrangement/arrangementFiles.ts",
      "src/features/sequencer/hooks/useExportActions.ts",
    ];
    const owning = files.filter((file) => /function describeError\(/.test(readFileSync(file, "utf8")));
    expect(owning).toEqual(["src/utils/describeError.ts"]);
  });
});
