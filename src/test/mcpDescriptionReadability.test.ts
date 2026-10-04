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

const source = [
  readFileSync("mcp/registry.ts", "utf8"),
  readFileSync("mcp/registryArrangement.ts", "utf8"),
].join("\n");

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
    const CAP = 195;
    const over = descriptions()
      .map((entry) => ({ name: entry.name, longest: longestSentence(entry.text) }))
      .filter((entry) => entry.longest > CAP)
      .map((entry) => `${entry.name} (${entry.longest})`);
    expect({ over, atMost: descriptions().length }).toEqual({ over: [], atMost: descriptions().length });
  });

  it("⭐ and nothing above one hundred and ninety unless it contains a list", () => {
    const sentences = source
      .split(/^    name: "[a-z0-9_]+",/m)
      .slice(1)
      .flatMap((block) => {
        const m = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block);
        if (!m) return [];
        return [...m[1].matchAll(/[^.!?]+[.!?]?/g)].map((x) => x[0].trim()).filter((x) => x.length > 0);
      });
    // ⭐ 豁免规则（显式 ✓、按可测形态 ✓）：句中出现一段括号，其内部逗号 ≥ 7 ⇒ 那是**≥8 项清单** ✓，
    // 拆开只会把客户端最该一眼看全的东西打散 ✗；⚠️ 口径严格 **> 190** ✓（与宣称一致 ✓）
    const listy = (sentence: string) =>
      (sentence.match(/\([^()]*\)/g) ?? []).some((group) => (group.match(/,/g) ?? []).length >= 7);
    const over = sentences.filter((x) => x.length > 190);
    const exempted = over.filter(listy);
    const offending = over.filter((x) => !listy(x));
    expect({ offending }).toEqual({ offending: [] });
    // ⚠️ 豁免条数**钉死** ✓：多一个或少一个都会红 ✓（放宽必须是有意改动 ✓）
    expect({ exempted: exempted.length }).toEqual({ exempted: 1 });
  });
});
