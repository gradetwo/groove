/**
 * ⭐ **What `export_logic_project` promises survives splitting its opening sentence.**
 *
 * A mechanical split at bracket-depth-zero separators with the exact net loss checked rather than a split count.
 * Anchors come from the rewritten text.
 */
import { registrySource } from "./helpers/registrySource";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = registrySource();
const start = source.indexOf('name: "export_logic_project"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe("export_logic_project's description", () => {
  it("⭐ still carries the sentences the split kept", () => {
    for (const anchor of [
      "`ProjectDataBase64` (`Alternatives/NNN/P",
      "The structure follows what real projects",
      "Write this arrangement as the **two file",
      "Whether **Logic itself** opens the resul",
    ])
      expect({ anchor, present: description.includes(anchor) }).toEqual({ anchor, present: true });
  });

  it("⭐ and no sentence is over two hundred and sixty characters", () => {
    const longest = Math.max(...description.split(/(?<=[.!?])\s+/).map((part) => part.length));
    expect({ longest, under: longest < 260 }).toEqual({ longest, under: true });
  });
});
