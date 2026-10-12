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
 * than the audit's single fixture, in one process and one call log: no registry, one registered library, and then a
 * second registration between calls whose library is unmeasurable (visible, and visibly absent from the catalogue).
 *
 * ⚠️ Deliberately **no `vi.resetModules()` per shape**: that resets the module registry under the async mock factory
 * and the re-import can race back to the real `parseManifest` (`mockClear is not a function` under load, seen when
 * this file ran beside others). One process, delta assertions — the cache is a per-process fact and this is how it is
 * actually used.
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

import { listSampleLibraries } from "../../mcp/instruments";
import { writeUserLibraries } from "../../mcp/sampleLibraries";
import * as manifest from "../../src/data/sampleManifest";

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
  process.env.GROOVE_MCP_LIBRARIES = path.join(mkdtempSync(path.join(tmpdir(), "groove-parse-")), "libs.json");
});

describe("list_sample_libraries parses the manifest once", () => {
  it("parses once for the process, not once per call, across every registry shape", () => {
    const parses = () => vi.mocked(manifest.parseManifest).mock.calls.length;

    // Shape 1 — nothing registered. ⭐ The criterion: one parse for the cold call (two means the catalogue build
    // re-parsed the 4.0 MB text).
    const first = listSampleLibraries();
    expect(first.libraries.length).toBeGreaterThan(0);
    expect(first.libraries.every((row) => row.source === "built-in")).toBe(true);
    expect(parses()).toBe(1);

    // And a second call adds nothing: a lost cache makes this 2, 3, 4, …
    listSampleLibraries();
    expect(parses()).toBe(1);

    // Shape 2 — one registered library, read from the registry on this call.
    writeUserLibraries([library()]);
    const withOne = listSampleLibraries();
    const mine = withOne.libraries.find((row) => row.id === "my-strings");
    expect(mine?.source).toBe("user");
    expect(mine?.instruments).toBeGreaterThan(0);
    expect(parses()).toBe(1);

    // Shape 3 — a second registration *between* calls, and it is unmeasurable: it must appear, be marked as the
    // caller's own, and be visibly not in the catalogue — while the parse is still the one cold parse.
    writeUserLibraries([
      library(),
      library({ id: "my-brass", name: "My Brass", durationSeconds: undefined, sourceUrl: "https://example.test/brass" }),
    ]);
    const withBrass = listSampleLibraries();
    const brass = withBrass.libraries.find((row) => row.id === "my-brass");
    expect(brass?.source).toBe("user");
    expect(brass?.instruments).toBe(0);
    expect(brass?.problems.join(" ")).toContain("no measured duration");
    expect(withBrass.libraries.some((row) => row.source === "built-in")).toBe(true);
    expect(parses()).toBe(1);
  });
});
