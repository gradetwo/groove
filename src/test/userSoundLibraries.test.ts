import { describe, expect, it } from "vitest";
import { mergeUserLibraries, parseUserLibraries, type UserSoundLibrary } from "../data/userLibraries";
import { sampleAssetsFromManifest, type SampleManifest } from "../data/sampleManifest";

/**
 * A creator's own sound library, and the two rules that keep it from being a second way of doing things.
 *
 * The audit (`docs/USER_SOUND_LIBRARIES.md`) found that the machinery already exists and the only missing piece
 * is a way to merge extra entries into the catalogue. These criteria hold the two properties that make that
 * merge safe rather than merely convenient: a user library acquires its ids from **the same function** the
 * built-ins go through, and a library that would take a built-in's id is **refused** rather than allowed to
 * shadow it and quietly change what every existing project sounds like.
 */
const builtIn = (): SampleManifest => ({
  version: 1,
  entries: [
    {
      id: "vsco2ce",
      name: "VSCO 2 CE",
      licence: "CC0",
      // A built-in entry carries a duration because this project measured one.
      durationSeconds: 42,
      instruments: [{ sfz: "Strings/Violin Section/susVib/VlnEns_susVib_B2_v2.sfz", name: "ViolinEnsSusVib" }],
      files: [],
    },
  ],
});

const library = (over: Partial<UserSoundLibrary> = {}): UserSoundLibrary => ({
  id: "my-strings",
  name: "My Strings",
  licence: "unknown",
  sfz: "Orchestral/Strings/susVib/MyEnsSusVib.sfz",
  repo: "someone/better-strings",
  pin: "0123456789abcdef0123456789abcdef01234567",
  sourceUrl: "https://example.invalid/better-strings",
  /** Stated rather than measured, because nothing here has seen the library's audio yet. */
  durationSeconds: 12.5,
  ...over,
});

describe("a creator's own sound library", () => {
  it("gets its asset ids from the same function the built-ins go through", () => {
    const before = sampleAssetsFromManifest(builtIn(), "https://mirror.invalid");
    const merged = mergeUserLibraries(builtIn(), [library()]);
    const after = sampleAssetsFromManifest(merged.manifest, "https://mirror.invalid");

    // The built-in is untouched by the merge, which is what makes a user library additive rather than a change.
    expect(before.assets.map((asset) => asset.assetId)).toEqual(["vsco2ce:VlnEns-susVib-B2-v2"]);
    expect(after.assets.map((asset) => asset.assetId)).toContain("my-strings:MyEnsSusVib");
    expect(merged.added).toEqual(["my-strings"]);
    expect(merged.problems).toEqual([]);
  });

  it("refuses a library that would take a built-in's id, and says why", () => {
    // ⭐ The one thing worth being strict about: shadowing `vsco2ce` would change what existing projects sound
    // like without anyone asking. A refusal is visible; a shadow is not.
    const merged = mergeUserLibraries(builtIn(), [library({ id: "vsco2ce" })]);
    expect(merged.added).toEqual([]);
    expect(merged.problems).toHaveLength(1);
    expect(merged.problems[0]).toContain("vsco2ce");
    expect(merged.problems[0]).toContain("existing projects");
    // And it is genuinely absent, not merely warned about.
    const assets = sampleAssetsFromManifest(merged.manifest, "https://mirror.invalid");
    expect(assets.assets).toHaveLength(1);
  });

  it("keeps the licence as stated, including unknown, rather than defaulting it", () => {
    const merged = mergeUserLibraries(builtIn(), [library({ licence: "unknown" })]);
    const entry = merged.manifest.entries.find((row) => row.id === "my-strings");
    // A guess here would be believed, which is worse than saying nothing.
    expect(entry?.licence).toBe("unknown");
    expect(entry?.attribution).toBeUndefined();
  });

  it("⭐ excludes a library nobody has measured, with the reason attached, rather than inventing a duration", () => {
    /**
     * `sampleAssetsFromManifest` refuses an entry with no positive duration — "a duration nobody measured is not
     * a duration" — and a person adding a library from a URL usually cannot know it. So the entry is merged and
     * **visibly excluded**, which is the manifest's own mechanism, rather than admitted with a made-up number or
     * dropped in silence. `added` still names it, because the registration itself did happen.
     */
    const merged = mergeUserLibraries(builtIn(), [library({ durationSeconds: undefined })]);
    expect(merged.added).toEqual(["my-strings"]);
    const entry = merged.manifest.entries.find((row) => row.id === "my-strings");
    expect(entry?.excludedReason).toContain("no duration has been measured");
    expect(entry?.durationSeconds).toBeUndefined();
    // And it is genuinely out of the catalogue, with the builder's own reason to match.
    const assets = sampleAssetsFromManifest(merged.manifest, "https://mirror.invalid");
    expect(assets.assets.map((asset) => asset.assetId)).toEqual(["vsco2ce:VlnEns-susVib-B2-v2"]);
  });

  it("reads a stored list totally: every input yields libraries or a problem, never a throw", () => {
    // Nothing stored is not a problem.
    expect(parseUserLibraries("")).toEqual({ libraries: [], problems: [] });
    expect(parseUserLibraries(undefined)).toEqual({ libraries: [], problems: [] });

    expect(parseUserLibraries("not json").problems[0]).toContain("not valid JSON");
    expect(parseUserLibraries({ nope: true }).problems[0]).toContain("expected a list");
    expect(parseUserLibraries([{ id: "x" }]).problems[0]).toContain("needs a name");
    // A licence that is left out is refused with the advice to say unknown, which is the honest answer.
    expect(parseUserLibraries([{ id: "x", name: "X" }]).problems[0]).toContain("unknown");
    expect(parseUserLibraries([{ id: "x", name: "X", licence: "MIT", sfz: "a.sfz" }]).problems[0]).toContain("licence must be");
    expect(parseUserLibraries([{ id: "x", name: "X", licence: "CC0" }]).problems[0]).toContain("needs an sfz");
    expect(parseUserLibraries([{ id: "has space", name: "X", licence: "CC0", sfz: "a.sfz" }]).problems[0]).toContain("letters, digits");

    // Two with one id is refused, and the first is kept.
    const both = parseUserLibraries([
      { id: "a", name: "A", licence: "CC0", sfz: "a.sfz" },
      { id: "a", name: "A again", licence: "CC0", sfz: "a.sfz" },
    ]);
    expect(both.libraries).toHaveLength(1);
    expect(both.problems[0]).toContain("share this id");

    // A good one survives a round trip through JSON, which is how storage hands it back.
    const good = parseUserLibraries(JSON.stringify([library()]));
    expect(good.problems).toEqual([]);
    expect(good.libraries[0]!.id).toBe("my-strings");
    expect(good.libraries[0]!.pin).toBe("0123456789abcdef0123456789abcdef01234567");
  });
});
