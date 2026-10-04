/**
 * ⭐ A line number in the prose is a promise with a short life.
 *
 * The registry used to be one file, so documents could say "render_arrangement lives at
 * `mcp/registry.ts:395`" and be right. It is twelve modules now, the barrel is three hundred and
 * twenty eight lines, and twenty two of those citations pointed past the end of the file they
 * named — they did not merely drift, they could not be true. Twenty of them were rewritten as a
 * module reference without a line number, and this keeps the next one from landing.
 *
 * ⚠️ `docs/OPEN_WORK.md` is exempt **on purpose**: its citations are a record of what was true when
 * they were written, and rewriting them would be editing history rather than fixing a reference.
 * Everything else is checked, and a citation past the end of the file is a failure.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REGISTRY = "mcp/registry.ts";
const EXEMPT = new Set(["docs/OPEN_WORK.md"]);

function docs(dir = "docs"): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...docs(path));
    else if (entry.endsWith(".md")) out.push(path);
  }
  return out;
}

describe("registry line citations in documentation", () => {
  it("never points past the end of the file it names", () => {
    const lines = readFileSync(REGISTRY, "utf8").split("\n").length;
    const bad: string[] = [];
    for (const file of docs()) {
      if (EXEMPT.has(file)) continue;
      for (const m of readFileSync(file, "utf8").matchAll(/mcp\/registry\.ts:(\d+)/g)) {
        if (Number(m[1]) > lines) bad.push(`${file}: ${m[0]} (the file has ${lines} lines)`);
      }
    }
    expect(bad, `stale registry citations:\n  ${bad.join("\n  ")}`).toEqual([]);
  });

  it("keeps the exemption explicit, and the check non-vacuous", () => {
    expect(EXEMPT.has("docs/OPEN_WORK.md")).toBe(true);
    expect(docs().length).toBeGreaterThan(20);
  });
});
