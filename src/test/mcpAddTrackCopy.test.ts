/**
 * ⭐ **`add_arrangement_track`'s description keeps its boundaries when its long sentence is split.**
 *
 * The description was the longest of the ninety four at twelve hundred and six characters, with a single four hundred
 * and thirty three character sentence. Splitting it and moving the motivation to the end must not cost the two things a
 * caller acts on: where asset ids come from, and that `assetId` and `instrument` are accepted on one kind each and
 * refused elsewhere. The deletion test is to drop either sentence — the corresponding case then fails.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("mcp/registry.ts", "utf8");
const start = source.indexOf('name: "add_arrangement_track"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe("add_arrangement_track's description", () => {
  it("⭐ still says where asset ids come from, and which kind accepts which", () => {
    expect({ source: description.includes("Asset ids come from `list_arrangement_instruments`.") }).toEqual({ source: true });
    expect({
      acceptance: description.includes(
        '**`assetId` is accepted on `kind:\\"sampler\\"` only and `instrument` on `kind:\\"synth\\"` only, each refused — not ignored — for any other kind.**',
      ),
    }).toEqual({ acceptance: true });
  });

  it("⭐ leads with what it does, and no longer hides a four hundred character sentence", () => {
    expect({ leads: description.startsWith("Add a track to an arrangement.") }).toEqual({ leads: true });
    const longest = Math.max(...description.split(/(?<=[.!?])\s+/).map((part) => part.length));
    expect({ longest, under: longest < 400 }).toEqual({ longest, under: true });
  });
});
