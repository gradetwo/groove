/**
 * Auditioning one note: the question the whole SFZ layer exists to answer.
 *
 * The agent surface could render a whole arrangement and not a single drum hit, so "which sample does this library use for this note, at what rate, and does the file call it a one-shot?" was answerable only by a CI probe. The rendering needs a browser — like every other audio tool here — so the criterion holds the parts that do not: the filename rule and the declarations.
 *
 * The resolved fields are the reason this tool is worth its browser: a **silent** render with a `samplePath` is a gain problem, and a silent render without one is a library that never resolved. Reporting the two the same way would make the tool useless for exactly the case it was added for.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { auditionFilename } from "../../mcp/render/worker";

const root = join(__dirname, "..", "..");
const registry = readFileSync(join(root, "mcp", "registry.ts"), "utf8");
const gate = readFileSync(join(root, "scripts", "check_mcp.mjs"), "utf8");

describe("the audition's filename", () => {
  it("names the note so two auditions cannot overwrite each other", () => {
    expect(auditionFilename("virtuosity-drums-basic", 38)).toBe("virtuosity-drums-basic_note38.wav");
    expect(auditionFilename("virtuosity-drums-basic", 40)).not.toBe(auditionFilename("virtuosity-drums-basic", 38));
  });

  it("survives an asset id with a colon in it, because multi-instrument libraries use one", () => {
    // `vcsl:foo/bar` is a real shape; a colon is not a legal filename character on every platform this may run on.
    const name = auditionFilename("vcsl:Idiophones/Struck Idiophone", 60);
    expect(name).not.toMatch(/[:/\\]/);
    expect(name.endsWith("_note60.wav")).toBe(true);
  });
});

describe("the audition is declared where the surface is checked", () => {
  it("is in the registry with the two arguments that define it", () => {
    expect(registry).toContain('"render_instrument_note"');
    expect(registry).toContain("assetId: z.string()");
    expect(registry).toContain("midi: z.number().int().min(0).max(127)");
  });

  it("is asserted by the MCP gate, because a tool nothing calls is a tool nobody has", () => {
    expect(gate).toContain("render_instrument_note");
  });
});
