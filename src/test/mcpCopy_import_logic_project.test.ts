/**
 * ⭐ **`import_logic_project`'s long sentence, split with brackets and quotes protected.**
 *
 * The assertions run before the write and the exact net loss is checked rather than a split count. Anchors come from the
 * rewrite.
 */
import { registrySource } from "./helpers/registrySource";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const TOOL = "import_logic_project";
const source = registrySource();
const start = source.indexOf('name: "' + TOOL + '"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe(TOOL + "'s description, after the split", () => {
  it("⭐ still carries the sentences the split kept", () => {
    for (const anchor of [
      "**Phase 1 is MIDI only.** Audio tracks, ",
      "Pass the two files that carry the music:",
      "Read a **Logic Pro project** and **add**",
      "The reply names the project's tempo and ",
    ])
      expect({ anchor, present: description.includes(anchor) }).toEqual({ anchor, present: true });
  });

  it("⭐ and no sentence is over two hundred characters", () => {
    const longest = Math.max(...description.split(/(?<=[.!?])\s+/).map((part) => part.length));
    expect({ longest, under: longest < 200 }).toEqual({ longest, under: true });
  });
});
