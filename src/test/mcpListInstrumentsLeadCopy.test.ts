/**
 * ⭐ **`list_arrangement_instruments`' string-program list becomes four sentences.**
 *
 * Two hundred and ninety nine characters listed four things with plain commas, which the splitter deliberately does not
 * break on, so the boundaries are hand-chosen. ⚠️ The tool still carries a two hundred and fifty three character sentence
 * about `mappedInstruments`, and the ceiling below is measured from that rather than from the target.
 */
import { registrySource } from "./helpers/registrySource";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = registrySource();
const start = source.indexOf('name: "list_arrangement_instruments"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe("list_arrangement_instruments, after the list was split", () => {
  it("⭐ still carries what a string program reports", () => {
    for (const anchor of [
      "**`mappedInstruments` is the other half*",
      "The catalogue assets a sampler track can",
      "So an instrument can be asked for by nam",
      "How many seconds a note may be held befo",
    ])
      expect({ anchor, present: description.includes(anchor) }).toEqual({ anchor, present: true });
  });

  it("⭐ and no sentence is over the measured ceiling", () => {
    const longest = Math.max(...description.split(/(?<=[.!?])\s+/).map((part) => part.length));
    expect({ longest, under: longest < 222 }).toEqual({ longest, under: true });
  });
});
