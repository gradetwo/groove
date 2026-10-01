import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { changeUserLibraries, readUserLibraries } from "../../mcp/sampleLibraries";

/**
 * The write surface for a creator's own sound libraries.
 *
 * Every case points `GROOVE_MCP_LIBRARIES` at a directory of its own, so no test can touch a registry someone
 * is actually using — which is not hypothetical: the first live probe of this tool wrote a junk entry to the
 * default path, and finding the bug below came out of running it rather than reading it.
 *
 * The bug it found is why the first criterion here exists. `mergeUserLibraries` refuses a library that takes a
 * built-in's id, and it must, because that is where the catalogue is built — but it runs *after* this function
 * has written the file, so a colliding library was accepted, written, and then dropped at merge time. A library
 * that looks registered and is permanently absent is worse than one that is turned away, and the fix was to
 * apply the same rule at the door.
 */
const RESERVED = ["vsco2ce", "salamander-grand"];

let file = "";

beforeEach(() => {
  const dir = mkdtempSync(path.join(tmpdir(), "groove-libs-"));
  file = path.join(dir, "sample-libraries.json");
  process.env.GROOVE_MCP_LIBRARIES = file;
});

const library = (over: Record<string, unknown> = {}) => ({
  id: "my-strings",
  name: "My Strings",
  licence: "unknown",
  sfz: "Orchestral/Strings/My.sfz",
  repo: "someone/better-strings",
  pin: "0123456789abcdef0123456789abcdef01234567",
  durationSeconds: 12.5,
  ...over,
});

const onDisk = (): unknown => JSON.parse(readFileSync(file, "utf8"));

describe("registering a sound library of your own", () => {
  it("⭐ refuses an id the project already ships, at the door, and writes nothing", () => {
    const result = changeUserLibraries({ library: library({ id: "vsco2ce" }), reservedIds: RESERVED });
    expect(result.changed).toBe("none");
    expect(result.libraries).toEqual([]);
    expect(result.problems[0]).toContain("vsco2ce");
    expect(result.problems[0]).toContain("existing projects");
    // ⭐ The whole point: nothing on disk, so it cannot be registered-but-absent.
    expect(() => onDisk()).toThrow();
  });

  it("adds one, keeps the licence as stated, and leaves it readable", () => {
    const added = changeUserLibraries({ library: library(), reservedIds: RESERVED });
    expect(added.changed).toBe("added");
    expect(added.libraries.map((row) => row.id)).toEqual(["my-strings"]);
    // `unknown` survives rather than being replaced by a guess a reader would believe.
    expect(onDisk()).toMatchObject([{ id: "my-strings", licence: "unknown", durationSeconds: 12.5 }]);
    expect(readUserLibraries().libraries[0]!.pin).toBe("0123456789abcdef0123456789abcdef01234567");
  });

  it("refuses a malformed entry and writes nothing", () => {
    const noLicence = changeUserLibraries({ library: library({ licence: undefined }), reservedIds: RESERVED });
    expect(noLicence.changed).toBe("none");
    expect(noLicence.problems.join(" ")).toContain("unknown");
    expect(() => onDisk()).toThrow();

    const negative = changeUserLibraries({ library: library({ durationSeconds: -1 }), reservedIds: RESERVED });
    expect(negative.changed).toBe("none");
    expect(negative.problems.join(" ")).toContain("durationSeconds");
    expect(() => onDisk()).toThrow();
  });

  it("refuses a second library with an id already registered", () => {
    changeUserLibraries({ library: library(), reservedIds: RESERVED });
    const again = changeUserLibraries({ library: library({ name: "Again" }), reservedIds: RESERVED });
    expect(again.changed).toBe("none");
    expect(again.problems[0]).toContain("already registered");
    // Still exactly one, and still the first one.
    expect(onDisk()).toMatchObject([{ id: "my-strings", name: "My Strings" }]);
  });

  it("registers one with no measured duration and says it will be excluded", () => {
    const result = changeUserLibraries({ library: library({ id: "no-dur", durationSeconds: undefined }), reservedIds: RESERVED });
    expect(result.changed).toBe("added");
    expect(result.libraries[0]!.durationSeconds).toBeUndefined();
    // The reply says what will happen to it, rather than leaving the person to discover it missing.
    expect(readUserLibraries().problems).toEqual([]);
    expect(result.libraries.map((row) => row.id)).toEqual(["no-dur"]);
  });

  it("removes what was added, and reports removing something that is not there", () => {
    changeUserLibraries({ library: library(), reservedIds: RESERVED });
    changeUserLibraries({ library: library({ id: "second", durationSeconds: 3 }), reservedIds: RESERVED });

    const removed = changeUserLibraries({ remove: "my-strings" });
    expect(removed.changed).toBe("removed");
    expect(onDisk()).toMatchObject([{ id: "second" }]);

    // Undoing is not a one-way door, but undoing nothing is not a success either: a misspelt id has to be said.
    const missing = changeUserLibraries({ remove: "my-strings" });
    expect(missing.changed).toBe("none");
    expect(missing.problems[0]).toContain("no library with the id");
    expect(onDisk()).toMatchObject([{ id: "second" }]);
  });

  it("reports a registry file that cannot be parsed rather than starting from nothing", () => {
    writeFileSync(file, "{ this is not json");
    const read = readUserLibraries();
    expect(read.libraries).toEqual([]);
    expect(read.problems[0]).toContain("not valid JSON");
    // And a write still refuses to pretend the broken entries were fine.
    const result = changeUserLibraries({ library: library(), reservedIds: RESERVED });
    expect(result.changed).toBe("added");
    expect(result.problems.join(" ")).toContain("not valid JSON");
  });
});
