import { beforeEach, describe, expect, it } from "vitest";
import { createCatalogueRuntime } from "../data/sampleCatalogueRuntime";
import { sampleAssetsFromManifest } from "../data/sampleManifest";
import { mergeUserLibraries, type UserSoundLibrary } from "../data/userLibraries";
import {
  USER_LIBRARIES_STORAGE_KEY,
  changeStoredUserLibraries,
  readStoredUserLibraries,
  recordMeasuredDuration,
  storedUserLibraries,
  type LibraryStorage,
} from "../data/userLibraryStore";

/**
 * ⭐ **A library registered in the web app, and the one line that makes it real.**
 *
 * The pieces that decide what a library is are shared with the MCP surface; what these criteria add is the
 * browser's half — storage that can be absent, and the wiring at catalogue load. The last case is the one that
 * matters: everything else can pass while a registered library never reaches the catalogue, which would be a
 * registry that looks like it works and changes nothing about what you can play.
 */
const stub = (): LibraryStorage & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
  };
};

const library = (over: Record<string, unknown> = {}) => ({
  id: "my-strings",
  name: "My Strings",
  licence: "unknown",
  sfz: "Orchestral/Strings/My.sfz",
  repo: "someone/better-strings",
  pin: "0123456789abcdef0123456789abcdef01234567",
  durationSeconds: 12,
  ...over,
});

/** A manifest with one built-in entry, in the shape `parseManifest` accepts. */
const MANIFEST = JSON.stringify({
  version: 1,
  entries: [
    {
      id: "vsco2ce",
      name: "VSCO 2 CE",
      licence: "CC0",
      durationSeconds: 42,
      instruments: [{ sfz: "Strings/Violin/Vln.sfz", name: "Violin" }],
      files: [],
    },
  ],
});

let storage: ReturnType<typeof stub>;

beforeEach(() => {
  storage = stub();
});

describe("the web registry of your own sound libraries", () => {
  it("adds one, keeps the licence as stated, and can read it back", () => {
    const added = changeStoredUserLibraries({ library: library() }, storage);
    expect(added.changed).toBe("added");
    expect(added.problems).toEqual([]);
    // The licence survives as `unknown` rather than being replaced by a guess a reader would believe.
    expect(readStoredUserLibraries(storage).libraries[0]).toMatchObject({ id: "my-strings", licence: "unknown" });
  });

  it("⭐ refuses an id the project already ships, before writing anything", () => {
    const refused = changeStoredUserLibraries({ library: library({ id: "vsco2ce" }), reservedIds: ["vsco2ce"] }, storage);
    expect(refused.changed).toBe("none");
    expect(refused.problems[0]).toContain("vsco2ce");
    // Nothing stored: registered-but-absent is the failure this rule exists to prevent.
    expect(storage.map.has(USER_LIBRARIES_STORAGE_KEY)).toBe(false);
  });

  it("refuses a malformed entry, and a second library with an id already registered", () => {
    expect(changeStoredUserLibraries({ library: library({ licence: undefined }) }, storage).changed).toBe("none");
    expect(storage.map.has(USER_LIBRARIES_STORAGE_KEY)).toBe(false);

    changeStoredUserLibraries({ library: library() }, storage);
    const again = changeStoredUserLibraries({ library: library({ name: "Again" }) }, storage);
    expect(again.changed).toBe("none");
    expect(again.problems[0]).toContain("already registered");
    expect(readStoredUserLibraries(storage).libraries).toHaveLength(1);
  });

  it("removes what was added, and says so when there is nothing to remove", () => {
    changeStoredUserLibraries({ library: library() }, storage);
    const removed = changeStoredUserLibraries({ remove: "my-strings" }, storage);
    expect(removed.changed).toBe("removed");
    expect(readStoredUserLibraries(storage).libraries).toEqual([]);

    const missing = changeStoredUserLibraries({ remove: "my-strings" }, storage);
    expect(missing.changed).toBe("none");
    expect(missing.problems[0]).toContain("no library with the id");
  });

  it("reports storage it cannot reach rather than pretending nothing is registered", () => {
    // ⭐ `null` is "there is no storage"; `undefined` would mean "use the browser's", which is a different case
    // and the reason this parameter is not a default.
    const read = readStoredUserLibraries(null);
    expect(read.storageAvailable).toBe(false);
    expect(read.problems[0]).toContain("cannot store");
    // And a write says the same rather than appearing to succeed.
    expect(changeStoredUserLibraries({ library: library() }, null).changed).toBe("none");
  });

  it("⭐ puts a registered library into the catalogue at load, through the same merge the MCP surface uses", async () => {
    changeStoredUserLibraries({ library: library() }, storage);

    /**
     * The runtime reads `window.localStorage` through its own default. This is the seam: code under test uses the
     * real browser global, so the case is set up there rather than passed in — which is also what makes the test
     * exercise the wiring rather than a parameter.
     */
    window.localStorage.setItem(USER_LIBRARIES_STORAGE_KEY, JSON.stringify(storedUserLibraries(storage)));

    const runtime = createCatalogueRuntime({
      root: "https://mirror.invalid",
      manifestUrl: "/samples/manifest.json",
      fetchImpl: async () => ({ ok: true, status: 200, text: async () => MANIFEST }),
    });
    const { assets, problems } = await runtime.load();

    const ids = assets.map((asset) => asset.assetId);
    // The built-in is still there, and the registered library now contributes an instrument.
    expect(ids).toContain("vsco2ce:Vln");
    expect(ids.some((id) => id.startsWith("my-strings:"))).toBe(true);
    expect(problems).toEqual([]);
    window.localStorage.removeItem(USER_LIBRARIES_STORAGE_KEY);
  });

  it("does not invent a library when none is registered, so the wiring is not doing something else", async () => {
    window.localStorage.removeItem(USER_LIBRARIES_STORAGE_KEY);
    const runtime = createCatalogueRuntime({
      root: "https://mirror.invalid",
      manifestUrl: "/samples/manifest.json",
      fetchImpl: async () => ({ ok: true, status: 200, text: async () => MANIFEST }),
    });
    const { assets } = await runtime.load();
    // ⭐ The mirror of the case above: without a registration, nothing of the sort appears.
    expect(assets.map((asset) => asset.assetId)).toEqual(["vsco2ce:Vln"]);
  });
});

/**
 * ⭐ **Measuring the duration, which is the way out of the dead end for a library added from a URL.**
 *
 * A library with no duration is merged and excluded — visible and visibly not in the catalogue — because the
 * catalogue refuses an entry without a positive one. Nobody adding a library from a URL knows its total length,
 * so the app renders one note and times it. These criteria hold both directions: measuring turns a library into
 * a real catalogue entry, and a measurement that produced nothing is refused rather than stored, so a failed
 * render cannot pass for a length.
 */
describe("measuring a library's duration", () => {
  /** Merge through the real path, so "is it in the catalogue" is answered by the catalogue and not by a mock. */
  const catalogueIdsFor = (libraries: UserSoundLibrary[]): string[] => {
    const merged = mergeUserLibraries(
      { version: 1, entries: [] },
      libraries
    );
    return sampleAssetsFromManifest(merged.manifest, "https://mirror.invalid").assets.map((asset) => asset.assetId);
  };

  it("⭐ turns an excluded library into a catalogue entry, and says the number was measured", () => {
    const registered = changeStoredUserLibraries({ library: library({ durationSeconds: undefined }) }, storage);
    const before = registered.libraries;
    // Not in the catalogue yet: the manifest's own reason, and no asset.
    expect(before[0]!.durationSeconds).toBeUndefined();
    expect(catalogueIdsFor(before)).toEqual([]);

    const measured = recordMeasuredDuration("my-strings", 3.5, storage);
    expect(measured.changed).toBe("measured");
    expect(measured.problems).toEqual([]);
    expect(measured.libraries[0]).toMatchObject({ durationSeconds: 3.5, durationSource: "measured" });
    // ⭐ And the catalogue now serves it — which is the whole point of measuring.
    expect(catalogueIdsFor(measured.libraries)).toEqual(["my-strings:My"]);
    // It survives a round trip through storage, so a reload does not undo the measurement.
    expect(readStoredUserLibraries(storage).libraries[0]).toMatchObject({
      durationSeconds: 3.5,
      durationSource: "measured",
    });
  });

  it("keeps a stated duration distinguishable from a measured one", () => {
    changeStoredUserLibraries({ library: library({ durationSeconds: 12 }) }, storage);
    expect(readStoredUserLibraries(storage).libraries[0]!.durationSource).toBe("stated");
    // A later measurement replaces both the number and its provenance, rather than the two drifting apart.
    const measured = recordMeasuredDuration("my-strings", 2, storage);
    expect(measured.libraries[0]).toMatchObject({ durationSeconds: 2, durationSource: "measured" });
  });

  it("refuses a measurement that produced nothing, and writes nothing", () => {
    changeStoredUserLibraries({ library: library({ durationSeconds: undefined }) }, storage);
    const before = JSON.stringify(storage.map.get("groove_sample_libraries_v1"));

    for (const nonsense of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const refused = recordMeasuredDuration("my-strings", nonsense, storage);
      expect(refused.changed).toBe("none");
      expect(refused.problems.join(" ")).toContain("not a length");
    }
    // Nothing was written: a failed render must not pass for a length.
    expect(JSON.stringify(storage.map.get("groove_sample_libraries_v1"))).toBe(before);
    expect(readStoredUserLibraries(storage).libraries[0]!.durationSeconds).toBeUndefined();
  });

  it("refuses to measure a library that is not registered, rather than inventing one", () => {
    const missing = recordMeasuredDuration("nope", 3, storage);
    expect(missing.changed).toBe("none");
    expect(missing.problems[0]).toContain("no library with the id");
    expect(storage.map.size).toBe(0);
  });
});
