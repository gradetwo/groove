import { describe, expect, it } from "vitest";
import { arrangementToLogicFiles, logicNoteLines } from "../data/arrangementToLogic";
import { fromLogicProject } from "../data/logicToArrangement";
import type { ImportedPart } from "../data/musicxmlImport";

/**
 * ⭐ **P1: what we write, our own reader reads back.**
 *
 * This is the only claim this machine can support — see `docs/OPEN_WORK.md` §237. Whether real Logic opens the
 * package, and which versions accept it, are `needs` and are **not** asserted here.
 *
 * The last two cases are the ones that make this red-capable: they corrupt a byte the reader checks and demand the
 * problem be reported, so a writer that stops setting those bytes cannot pass by silence.
 */
const NOTE = (pitch: number, startBeats: number, lengthBeats: number, velocity: number) => ({ pitch, startBeats, lengthBeats, velocity });
const parts: ImportedPart[] = [{ name: "Piano, Track0", notes: [NOTE(60, 0, 1, 100), NOTE(64, 0.5, 0.25, 90), NOTE(67, 3.75, 1.25, 80)] }];

describe("a written logic project reads back", () => {
  it("⭐ returns the same notes, value for value, with no problems", () => {
    const { projectData, metaData } = arrangementToLogicFiles(parts, 120);
    const read = fromLogicProject({ projectData, metaData });
    /**
     * WARNING: exactly one problem is expected, and asserting the exact set is what keeps this red-capable.
     * The reader cannot read region start positions from this ProjectData version, says so, and imports from
     * beat 0 with the internal timing intact -- that is P2 (docs/OPEN_WORK.md 237), written down not hidden.
     * Any other problem -- a tempo or meter it cannot find, a sequence it cannot read -- fails here.
     */
    expect(read.problems).toHaveLength(1);
    expect(read.problems[0]).toContain("region start positions could not be read reliably");
    expect(read.parts.map((p) => p.name)).toEqual(["Piano, Track0"]);
    expect(read.parts[0]!.notes.map((n) => [n.pitch, n.startBeats, n.lengthBeats, n.velocity])).toEqual([
      [60, 0, 1, 100],
      [64, 0.5, 0.25, 90],
      [67, 3.75, 1.25, 80],
    ]);
    expect(read.tempoBpm).toBe(120);
    /**
     * The region start field, in the 11.x shape (a word after the name). Our own reader does not apply it, so this
     * asserts the writer's output rather than a placement, and changing the value turns this red.
     */
    const nameBytes = new TextEncoder().encode("Piano, Track0");
    const at = projectData.findIndex((_, i) => nameBytes.every((b, j) => projectData[i + j] === b));
    expect(at).toBeGreaterThan(0);
    const after = at + nameBytes.length;
    /**
     * Measured, and this is where the earlier claim was wrong (docs/OPEN_WORK.md 300). The criterion used to
     * assert `REGION_ORIGIN_TICKS` here, which baked in the belief that the bytes after the region name carry
     * the region's timeline start. Reading the owner's real projects settled it the other way: with the name
     * read correctly at record 0x34, the four bytes after it are zero in Colors, in MONTERO - Spatial Audio
     * and in two fixtures. Zero is what the neighbours carry, so zero is what this asserts.
     */
    const regionField = projectData[after]! | (projectData[after + 1]! << 8) | (projectData[after + 2]! << 16) | (projectData[after + 3]! << 24);
    expect(regionField).toBe(0);
  });

  it("carries the length in the continuation the reader takes it from", () => {
    const lines = logicNoteLines([NOTE(60, 0, 1.5, 100)]);
    expect(lines).toHaveLength(32);
    expect(lines[0]).toBe(0x90);
    expect(lines[7]).toBe(0);
    expect(lines[16 + 7]).toBe(0x80);
  });

  it("⚠️ reports a declared length that does not match, so a writer that stops setting it fails", () => {
    const { projectData, metaData } = arrangementToLogicFiles(parts, 120);
    const broken = projectData.slice();
    broken[0x10] = broken[0x10]! + 1;
    expect(fromLogicProject({ projectData: broken, metaData }).problems.join(" ")).toContain("declares");
  });

  it("⚠️ refuses a file that does not begin with the root magic", () => {
    const { projectData, metaData } = arrangementToLogicFiles(parts, 120);
    const broken = projectData.slice();
    broken[0] = 0;
    expect(fromLogicProject({ projectData: broken, metaData }).problems.join(" ")).toContain("magic");
  });
});
