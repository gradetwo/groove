import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ⭐ **A palette triple is not a colour, and this is where that was learned.**
 *
 * The desktop palette stores colours as bare RGB triples — `--d-line` is `20 20 20` — designed to be used
 * inside `rgb()`. `index.css` says as much in its own words: one place decides what a line is, and the
 * hand-written rules there resolve through `rgb(var(--d-line))`.
 *
 * The new-project surface passed the triples straight through instead. `border-[var(--d-line)]` compiled to
 * `border-color: 20 20 20`, a declaration the browser drops, so every hairline and the bar grid painted
 * nothing — which the owner reported as a blank sheet with no grid lines in the light skin, where there is no
 * dark panel behind the emptiness to hide it. Ninety-five uses across fourteen files were wrapped in `rgb()`.
 *
 * This criterion is the guard, and it is deliberately written over the **source text** rather than over a
 * rendered result: the failure is a declaration the browser silently discards, so nothing in a jsdom render
 * would look broken. Reading the files is what catches it, and it catches the whole class rather than the one
 * element someone thought to assert.
 */
const DIR = path.join(__dirname, "..", "components", "arrangement");

/** Any bare palette-triple use: `var(--d-…)` not already inside `rgb(…)`. */
const BARE_TRIPLE = /(?<!rgb\()var\(--d-[a-z0-9-]+\)/g;

const arrangementSources = (): Array<{ file: string; text: string }> =>
  readdirSync(DIR)
    .filter((name) => name.endsWith(".tsx") || name.endsWith(".ts"))
    .map((name) => ({ file: name, text: readFileSync(path.join(DIR, name), "utf8") }));

describe("colours in the arrangement surface", () => {
  it("never passes a palette triple where a colour is required", () => {
    const offenders: string[] = [];
    for (const { file, text } of arrangementSources()) {
      for (const match of text.matchAll(BARE_TRIPLE)) {
        offenders.push(`${file}: ${match[0]}`);
      }
    }
    // ⭐ The message names the fix, because the next person to hit this will be looking at a screen that is
    // simply empty rather than at an error.
    expect(offenders, `wrap these in rgb(): ${offenders.join(", ")}`).toEqual([]);
  });

  it("leaves nothing double-wrapped, so the rule above cannot be satisfied by accident", () => {
    const doubled: string[] = [];
    for (const { file, text } of arrangementSources()) {
      // `rgb(rgb(…))` is invalid too, and a careless sweep produces it.
      for (const match of text.matchAll(/rgb\(\s*rgb\(/g)) doubled.push(`${file}: ${match[0]}`);
    }
    expect(doubled).toEqual([]);
  });

  it("has something to check, so a passing run means the files were read", () => {
    // A criterion that silently reads nothing would pass forever. If the directory moves, this fails loudly.
    const sources = arrangementSources();
    expect(sources.length).toBeGreaterThan(5);
    const withColour = sources.filter(({ text }) => text.includes("rgb(var(--d-"));
    expect(withColour.length).toBeGreaterThan(5);
  });
});
