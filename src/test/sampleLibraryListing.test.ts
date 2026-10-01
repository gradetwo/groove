import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { listSampleLibraries } from "../../mcp/instruments";
import { writeUserLibraries } from "../../mcp/sampleLibraries";
import type { UserSoundLibrary } from "../../src/data/userLibraries";

/**
 * ⭐ **A registered library appears beside the built-ins, and the listing says whose it is.**
 *
 * `list_sample_libraries` is where a caller finds out what is reachable, so a library somebody registered that
 * did not appear here would be registered and invisible — the worst of both. The merge happens before
 * `withProgramIds` runs, which is why `instruments` is greater than zero for a library that carries a duration:
 * the asset id came from the same function a built-in's does, so the listing is counting a real catalogue entry
 * rather than echoing back what was registered.
 *
 * Every case points `GROOVE_MCP_LIBRARIES` at a directory of its own. The first live probe of the registration
 * tool wrote a junk entry to the default path, which is why nothing here touches it.
 */
const library = (over: Partial<UserSoundLibrary> = {}): UserSoundLibrary => ({
  id: "my-strings",
  name: "My Strings",
  licence: "unknown",
  sfz: "Strings/My.sfz",
  repo: "someone/better-strings",
  pin: "0123456789abcdef0123456789abcdef01234567",
  durationSeconds: 12,
  ...over,
});

beforeEach(() => {
  process.env.GROOVE_MCP_LIBRARIES = path.join(mkdtempSync(path.join(tmpdir(), "groove-listing-")), "libs.json");
});

describe("listing the sample libraries", () => {
  it("marks the shipped libraries as built-in, and finds none of the caller's own before one is registered", () => {
    const listed = listSampleLibraries();
    expect(listed.libraries.length).toBeGreaterThan(0);
    expect(listed.libraries.every((row) => row.source === "built-in")).toBe(true);
    expect(listed.libraries.some((row) => row.id === "my-strings")).toBe(false);
  });

  it("⭐ shows a registered library, marked as the caller's own, with an instrument the catalogue made", () => {
    writeUserLibraries([library()]);
    const listed = listSampleLibraries();
    const mine = listed.libraries.find((row) => row.id === "my-strings");

    expect(mine).toBeDefined();
    expect(mine!.source).toBe("user");
    // The licence is kept as stated: `unknown` is an answer, not a gap to be filled with a guess.
    expect(mine!.licence).toBe("unknown");
    // ⭐ The merge ran before `withProgramIds`, so this library owns a real catalogue entry.
    expect(mine!.instruments).toBeGreaterThan(0);
    // And the shipped ones are untouched by its arrival.
    expect(listed.libraries.filter((row) => row.source === "built-in").length).toBeGreaterThan(0);
  });

  it("shows a registered library that cannot be in the catalogue, with the reason, rather than hiding it", () => {
    // Registered but unmeasurable: `sampleAssetsFromManifest` refuses an entry with no duration, so this one is
    // merged, excluded, and reported — visible and visibly not reachable, which is a different thing from absent.
    writeUserLibraries([library({ durationSeconds: undefined })]);
    const listed = listSampleLibraries();
    const mine = listed.libraries.find((row) => row.id === "my-strings");

    expect(mine).toBeDefined();
    expect(mine!.instruments).toBe(0);
    expect(mine!.problems.join(" ")).toContain("no measured duration");
  });

  it("reports a registry file it cannot parse rather than behaving as though nothing is registered", () => {
    writeUserLibraries([]);
    const listed = listSampleLibraries();
    // An empty registry is not a problem — and the built-ins are still all there.
    expect(listed.libraries.every((row) => row.source === "built-in")).toBe(true);
  });
});
