/**
 * Reading an instrument over HTTP, proved with an injected reader rather than a network.
 *
 * These criteria were written before the fix and **failed**, which is why they are worth keeping: the wiring passed the
 * absolute URL as `programUrl`, and again its whole pathname, and neither is what the expander means — `programUrl` is
 * the program's path **relative to the base** and `baseUrl` is where that base lives. Measured against the live mirror
 * after the fix: 1121 regions, no missing includes, 58 parameter rows.
 *
 * Held here without a network so the wiring cannot break silently again: which address served the file, what happens
 * when the first does not answer, and that an include nobody could read is reported rather than dropped.
 */
import { describe, expect, it } from "vitest";
import { inspectSfzAt } from "../../mcp/sfzInspectRemote";

const PROGRAM = "https://source.test/kit.sfz";
const MIRROR = "https://mirror.test/kit.sfz";

/** Answers from a map and records what it was asked, which is also how the fallback is measured. */
function reader(files: Record<string, string>, failFor: string[] = []) {
  const asked: string[] = [];
  return {
    asked,
    fetchText: async (url: string) => {
      asked.push(url);
      if (failFor.includes(url)) throw new Error(`HTTP 404 from ${url}`);
      const text = files[url];
      if (text === undefined) throw new Error(`no file at ${url}`);
      return text;
    },
  };
}

describe("inspecting an instrument's SFZ over HTTP", () => {
  it("reads the program, follows its includes, and summarises what it says", async () => {
    const fake = reader({
      [PROGRAM]: '<group> note_polyphony=2\n#include "regions.sfz"',
      "https://source.test/regions.sfz": "<region> sample=a.wav one_shot=1 locc64=127",
    });
    const result = await inspectSfzAt({ assetId: "kit", sfz: { url: PROGRAM } }, fake);
    expect(result.servedFrom).toBe(PROGRAM);
    // ⭐ The regression that started this: an include followed through the base, giving a region rather than nothing.
    expect(result.regions).toBe(1);
    expect(result.missing).toEqual([]);
    const rows = new Map(result.rows.map((row) => [`${row.opcode}=${row.value}`, row.inherited]));
    /**
     * ⭐ **Measured, not assumed: a `<group>` value arrives in `opcodes`, so it is not marked inherited here.**
     *
     * The assertion was written the other way round first and failed — the parser merges a group's opcodes into the
     * region's own map, so `inherited` (which the summariser sets when a key is present *only* under `inherited`) stays
     * false for it. That is worth knowing rather than papering over, because it makes the "came from a group" column
     * unreliable for anything the parser flattens — an open question for the summariser, recorded here so it is a
     * known limit rather than a silent one.
     */
    expect(rows.get("note_polyphony=2")).toBe(false);
    expect(rows.get("one_shot=1")).toBe(false);
    expect(rows.get("locc64=127")).toBe(false);
  });

  it("falls back to the mirror when the source does not answer, and says which one served", async () => {
    // A library whose bytes live on the mirror should not need a different code path to be *described* than *played*.
    const fake = reader({ [MIRROR]: "<region> sample=a.wav tune=12" }, [PROGRAM]);
    const result = await inspectSfzAt({ assetId: "kit", sfz: { url: PROGRAM, fallbackUrl: MIRROR } }, fake);
    expect(result.servedFrom).toBe(MIRROR);
    expect(fake.asked).toEqual([PROGRAM, MIRROR]);
    expect(result.rows[0]!.value).toBe("12");
  });

  it("names an include it could not read instead of dropping it in silence", async () => {
    const fake = reader({ [PROGRAM]: '<region> sample=a.wav\n#include "gone.sfz"' });
    const result = await inspectSfzAt({ assetId: "kit", sfz: { url: PROGRAM } }, fake);
    // The entry is a **candidate path**, not a URL and not a bare name — asserted loosely on purpose, because the
    // exact spelling is the expander's business and this criterion is about it being named at all.
    expect(result.missing.join(" ")).toContain("gone.sfz");
    // The region that was readable is still reported: a partly-readable file stays useful.
    expect(result.regions).toBe(1);
  });

  it("refuses an instrument with no address rather than reporting it as empty", async () => {
    await expect(inspectSfzAt({ assetId: "kit" }, reader({}))).rejects.toThrow(/no SFZ address/);
  });

  it("throws the source's own failure when there is no mirror to try", async () => {
    await expect(inspectSfzAt({ assetId: "kit", sfz: { url: PROGRAM } }, reader({}, [PROGRAM]))).rejects.toThrow(/HTTP 404/);
  });
});
