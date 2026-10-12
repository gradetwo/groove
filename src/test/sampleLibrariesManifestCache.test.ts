/**
 * ⭐ **`list_sample_libraries` used to parse the 4.0 MB manifest twice per call.**
 *
 * `parseManifest` runs `JSON.parse` over the whole shipped text and then validates all 16,691 file records — 25.0 ms
 * measured — and `listSampleLibraries` paid for it once itself and once inside `catalogueFromManifestText`. The
 * existing tests (`mcpSampleLibraries.test.ts`, `sampleLibraryListing.test.ts`) assert the *output*, which is
 * identical whether the parse is cached or not: nothing there can catch the cache being lost. So this counts the
 * parser instead, through `vi.mock` (the pattern `budgetHonesty.test.ts` documents — a live-import `vi.spyOn` does
 * not intercept a call site inside another module).
 *
 * It is written to be able to go red: on the pre-change tree the cold count is **2** (the direct `parseManifest` plus
 * the one inside `catalogueFromManifestText`), and a lost cache makes every later call add another. It covers more
 * than the audit's single fixture — no registry, one registered library, a *second* library registered between
 * calls (so `readUserLibraries` is still per call), and that second library being unmeasurable (visible, and visibly
 * absent from the catalogue).
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserSoundLibrary } from "../../src/data/userLibraries";

vi.mock("../../src/data/sampleManifest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/data/sampleManifest")>();
  return { ...actual, parseManifest: vi.fn(actual.parseManifest) };
});

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

/** A fresh module graph, so every shape starts with a cold parse cache and a zeroed counter. */
const fresh = async () => {
  vi.resetModules();
  const instruments = await import("../../mcp/instruments");
  const manifest = await import("../../src/data/sampleManifest");
  const sampleLibraries = await import("../../mcp/sampleLibraries");
  const parseManifest = vi.mocked(manifest.parseManifest);
  // `vi.resetModules` rebuilds `mcp/instruments` (and its caches) but the mocked parser is one `vi.fn` for the file,
  // so its call log has to be cleared by hand or every test counts the previous one's parses.
  parseManifest.mockClear();
  return {
    listSampleLibraries: instruments.listSampleLibraries,
    parseManifest,
    writeUserLibraries: sampleLibraries.writeUserLibraries,
  };
};

beforeEach(() => {
  process.env.GROOVE_MCP_LIBRARIES = path.join(mkdtempSync(path.join(tmpdir(), "groove-parse-")), "libs.json");
});

describe("list_sample_libraries parses the manifest once", () => {
  it("parses once for the process, not twice per call, with no user library registered", async () => {
    const { listSampleLibraries, parseManifest } = await fresh();

    const first = listSampleLibraries();
    expect(first.libraries.length).toBeGreaterThan(0);
    const afterFirst = parseManifest.mock.calls.length;
    listSampleLibraries();
    const afterSecond = parseManifest.mock.calls.length;

    // ⭐ The criterion: one parse for the cold call — two means the catalogue build re-parsed the 4.0 MB text.
    expect(afterFirst).toBe(1);
    // And the second call adds nothing: a lost cache makes this 2, 3, 4, …
    expect(afterSecond).toBe(afterFirst);
  });

  it("parses once with one registered library, and still lists it", async () => {
    const { listSampleLibraries, parseManifest, writeUserLibraries } = await fresh();
    writeUserLibraries([library()]);

    const first = listSampleLibraries();
    const mine = first.libraries.find((row) => row.id === "my-strings");
    expect(mine?.source).toBe("user");
    expect(mine?.instruments).toBeGreaterThan(0);
    const afterFirst = parseManifest.mock.calls.length;
    listSampleLibraries();

    expect(afterFirst).toBe(1);
    expect(parseManifest.mock.calls.length).toBe(afterFirst);
  });

  it("re-reads the registry between calls, including an unmeasurable library, without re-parsing", async () => {
    const { listSampleLibraries, parseManifest, writeUserLibraries } = await fresh();

    // A first, ordinary listing warms the parse cache…
    const before = listSampleLibraries();
    expect(before.libraries.some((row) => row.id === "my-brass")).toBe(false);
    const afterWarm = parseManifest.mock.calls.length;

    // …and a library registered *between* calls must take effect on the next one: the parse is cached, the registry
    // is not. This is the shape the audit did not cover (a second library, with no measured duration).
    writeUserLibraries([library({ id: "my-brass", name: "My Brass", durationSeconds: undefined, sourceUrl: "https://example.test/brass" })]);
    const after = listSampleLibraries();
    const brass = after.libraries.find((row) => row.id === "my-brass");

    expect(brass?.source).toBe("user");
    // Visible and visibly not reachable, rather than hidden: no duration means no catalogue entry.
    expect(brass?.instruments).toBe(0);
    expect(brass?.problems.join(" ")).toContain("no measured duration");
    expect(after.libraries.some((row) => row.source === "built-in")).toBe(true);
    // ⭐ Registering does not invalidate the manifest parse: still exactly the one cold parse.
    expect(parseManifest.mock.calls.length).toBe(afterWarm);
    expect(afterWarm).toBe(1);
  });
});
