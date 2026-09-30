/**
 * What an SFZ says, reported rather than re-derived.
 *
 * Muse's gap: `note_polyphony` and `amplitude_onccN` had criteria and **no way to see the values of a given file from
 * a tool**, so debugging a sampler meant reading the parser's source. The parser had kept the opcodes all along, so
 * the capability is a summary — and a summary is exactly the kind of thing that is wrong quietly, which is what these
 * criteria are for.
 */
import { describe, expect, it } from "vitest";
import { summariseSfzParameters } from "../../mcp/sfzInspect";

const region = (opcodes: Record<string, string>, inherited?: Record<string, string>) => ({ opcodes, ...(inherited ? { inherited } : {}) });

describe("summarising an instrument's parameters", () => {
  it("reports the parameters that were written, with the values as written", () => {
    const rows = summariseSfzParameters([region({ sample: "a.wav", note_polyphony: "2", amplitude_oncc7: "100" })]);
    // `sample` is not a parameter worth surfacing: it says which file, not how it behaves.
    expect(rows.map((row) => `${row.opcode}=${row.value}`)).toEqual(["amplitude_oncc7=100", "note_polyphony=2"]);
  });

  it("marks a value that came from a parent group", () => {
    // ⭐ The distinction a person debugging a library is actually looking for: "this region says nothing" versus
    // "its group told it". Reporting both the same way would erase it.
    const rows = summariseSfzParameters([
      region({ sample: "a.wav" }, { note_polyphony: "1" }),
      region({ sample: "b.wav", note_polyphony: "2" }),
    ]);
    const fromGroup = rows.find((row) => row.value === "1")!;
    const own = rows.find((row) => row.value === "2")!;
    expect(fromGroup.inherited, "a value only the group carried").toBe(true);
    expect(own.inherited, "a value the region wrote itself").toBe(false);
  });

  it("counts how many regions carry each value", () => {
    // A parameter set once on a group and once on a region is a different fact from one set everywhere.
    const rows = summariseSfzParameters([region({ tune: "0" }), region({ tune: "0" }), region({ tune: "12" })]);
    expect(rows.find((row) => row.value === "0")!.regions).toBe(2);
    expect(rows.find((row) => row.value === "12")!.regions).toBe(1);
    // Most widespread first, so the table reads as a summary rather than as file order.
    expect(rows[0]!.value).toBe("0");
  });

  it("finds the counted opcodes, which is how a library writes a layer", () => {
    // `locc64`, `amplitude_oncc20`, `sw_last` — the real library's own spellings, not a fixed list of exact names.
    const rows = summariseSfzParameters([region({ locc64: "127", amplitude_oncc20: "200", irrelevant: "1" })]);
    expect(rows.map((row) => row.opcode).sort()).toEqual(["amplitude_oncc20", "locc64"]);
  });

  it("says nothing rather than guessing when an instrument has no interesting parameters", () => {
    expect(summariseSfzParameters([region({ sample: "a.wav", lokey: "0" })])).toEqual([]);
  });
});
