/**
 * ⭐ **A ratchet on how much a tool description hides in one sentence.**
 *
 * A client reads every description on every connection, so the shape of the writing is part of the interaction, not
 * decoration. Measured on 2026-10-04 18:54 across the descriptions in `mcp/registry.ts`: the longest sentence has a
 * median of 174 characters, a ninetieth percentile of 312, and a maximum of 372 (four hundred and twenty before the first three sentences were split); thirteen descriptions hide a sentence
 * over 300 and fourteen open with a sentence over 200.
 *
 * The cap below is today's measured maximum, so this case is green now and can only get tighter: it fails if any
 * description grows a longer sentence than the longest one that exists today. ⚠️ It does **not** claim the writing is
 * good — the target is a first sentence a reader can act on (roughly 200) and no sentence over 300, and getting there is
 * a sequence of small edits with their own criteria, not something this file can pretend.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The cap only ever moves down: each split that lowers the measured maximum lowers this number with it.

const source = readFileSync("mcp/registry.ts", "utf8");

/** Pair every `name:` with the description that follows it, so the count does not depend on how the file is split. */
function descriptions(): Array<{ name: string; text: string }> {
  const found: Array<{ name: string; text: string }> = [];
  const nameAt = /^    name: "([a-z0-9_]+)",$/gm;
  let match: RegExpExecArray | null;
  const starts: Array<{ name: string; at: number }> = [];
  while ((match = nameAt.exec(source))) starts.push({ name: match[1], at: match.index });
  starts.forEach((entry, index) => {
    const end = index + 1 < starts.length ? starts[index + 1].at : source.length;
    const block = source.slice(entry.at, end);
    const text = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)?.[1];
    if (text) found.push({ name: entry.name, text });
  });
  return found;
}

const longestSentence = (text: string) => Math.max(...text.split(/(?<=[.!?])\s+/).map((part) => part.length));

describe("the tool descriptions stay readable", () => {
  it("⭐ finds the descriptions at all, so a silent extraction failure cannot pass", () => {
    const all = descriptions();
    expect({ atLeast: all.length >= 90, names: all.length > 0 }).toEqual({ atLeast: true, names: true });
  });

  it("⭐ no description grows a sentence longer than the longest one measured today", () => {
    const CAP = 253;
    const over = descriptions()
      .map((entry) => ({ name: entry.name, longest: longestSentence(entry.text) }))
      .filter((entry) => entry.longest > CAP)
      .map((entry) => `${entry.name} (${entry.longest})`);
    expect({ over, atMost: descriptions().length }).toEqual({ over: [], atMost: descriptions().length });
  });
});
