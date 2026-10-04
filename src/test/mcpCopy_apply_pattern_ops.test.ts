/**
 * ⭐ **apply_pattern_ops's opening operation list and its transform aside become separate sentences.**
 *
 * The operation names sit inside brackets, so the splitter cannot see a boundary there and the two chosen here are hand
 * made; both assertions about length and anchors ran before the write.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const TOOL = "apply_pattern_ops";
const source = readFileSync("mcp/registry.ts", "utf8");
const start = source.indexOf('name: "' + TOOL + '"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe(TOOL + "'s description, after two hand splits", () => {
  it("⭐ still lists the operations and says what a transform bakes", () => {
    for (const anchor of [
      "Apply a list of operations (set_step, cl",
      "`transform_pattern` bakes the app's arpe",
      "The input is never mutated; seeded opera",
      "It returns the new pattern plus a per-op",
    ])
      expect({ anchor, present: description.includes(anchor) }).toEqual({ anchor, present: true });
  });

  it("⭐ and no sentence is over two hundred characters", () => {
    const longest = Math.max(...description.split(/(?<=[.!?])\s+/).map((part) => part.length));
    expect({ longest, under: longest < 200 }).toEqual({ longest, under: true });
  });
});
