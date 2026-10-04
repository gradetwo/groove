/**
 * Stems: the parts of a mix, as files an agent can measure.
 *
 * The app has exported stems from the sequencer's menu for a while, and the MCP surface could only render the whole mix — so the one thing an agent most needs to *fix* a balance ("let me hear the bass alone") was the one thing it could not ask for.
 *
 * The rendering itself runs on either host — Chromium, or the Node Web Audio host with `headless: true` (held for real in `src/test/mcpHeadlessRender.test.ts`) — so this criterion holds the half that needs neither engine: **the naming rule**, which is decided in Node so that it is one testable rule rather than two. Two tracks with the same name must stay two files, and a name with slashes or spaces must not become a path.
 */
import { registrySource } from "./helpers/registrySource";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stemFilename } from "../data/stemNaming";

const registry = registrySource();

describe("stem filenames", () => {
  it("leads with the track's position, so two tracks of one name stay two files", () => {
    // ⭐ A drum kit routinely has two tracks a person would both call "Percussion"; overwriting one with the other loses a stem silently.
    const first = stemFilename("Percussion", 0, 120);
    const second = stemFilename("Percussion", 1, 120);
    expect(first).not.toBe(second);
    expect(first.startsWith("01_")).toBe(true);
    expect(second.startsWith("02_")).toBe(true);
  });

  it("turns a name into something a filesystem will accept", () => {
    // The name comes from a file the user supplied, so it can contain anything at all.
    const name = stemFilename("Bass / Lead: take 2", 3, 128);
    expect(name).not.toMatch(/[/\\:]/);
    expect(name).not.toContain(" ");
    expect(name.endsWith("_128bpm.wav")).toBe(true);
  });

  it("falls back to the position when a track has no name at all", () => {
    expect(stemFilename("", 4, 120)).toContain("track_5");
  });

  it("leaves the tempo out rather than writing a nonsense one", () => {
    // A pattern with no tempo is a real state; `NaN` in a filename is not a tempo.
    expect(stemFilename("Kick", 0, Number.NaN)).toBe("01_kick.wav");
    expect(stemFilename("Kick", 0, 0)).toBe("01_kick.wav");
  });
});

describe("the tool is declared where the surface is checked", () => {
  it("is in the registry with its arrangement argument", () => {
    expect(registry).toContain('"render_arrangement_stems"');
    expect(registry).toContain("arrangementId: z.string()");
  });

  it("is asserted by the MCP gate, because a tool nothing calls is a tool nobody has", () => {
    // The same rule the gate learned for `import_arrangement_musicxml`: declared, and named in the required list.
    const gate = readFileSync(join(__dirname, "..", "..", "scripts", "check_mcp.mjs"), "utf8");
    expect(gate).toContain("render_arrangement_stems");
  });
});
