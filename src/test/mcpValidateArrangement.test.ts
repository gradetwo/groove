/**
 * ⭐ **The validation tool exists, writes nothing, and answers in its own shape.**
 *
 * A full render costs about two minutes per track, so a caller that only wants to know whether a lane would resolve
 * needs this tool. Its reply must not borrow a render result's fields: `path`, `bytes`, `truePeakDb` and
 * `integratedLufs` do not exist when no audio is made, and filling them with zeros would be a false reading.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const registry = readFileSync("mcp/registryArrangement.ts", "utf8");
const start = registry.indexOf('name: "validate_arrangement"');
const block = start < 0 ? "" : registry.slice(start, registry.indexOf("\n  },", start));

describe("validate_arrangement", () => {
  it("⭐ is declared, and is read only", () => {
    expect({ present: start > -1 }).toEqual({ present: true });
    expect({ readOnly: /readOnly: true/.test(block) }).toEqual({ readOnly: true });
  });

  it("⭐ returns its own report and claims no audio", () => {
    expect({ own: /\.\.\.report/.test(block) }).toEqual({ own: true });
    expect({ noAudio: !/truePeakDb|integratedLufs|bytes:/.test(block) }).toEqual({ noAudio: true });
  });

  it("⭐ says that a cold cache still pays for the fetch", () => {
    expect({ caveat: /cold one still pays for the fetch/i.test(block) }).toEqual({ caveat: true });
  });
});
