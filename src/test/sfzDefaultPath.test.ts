import { describe, expect, it } from "vitest";
import { defaultPathFrom, resolveSamplePath } from "../audio/sfz/defaultPath";

/**
 * `default_path`, written against what Salamander actually declares (`default_path=Samples/`) rather than against a convenient fixture.
 *
 * The failure this prevents is quiet: a sample resolved one directory too high is not an error, it is a missing file, and the instrument simply does not sound.
 */
describe("SFZ default_path", () => {
  it("joins a relative sample to the declared default path", () => {
    // ⭐ The case the file actually contains.
    expect(resolveSamplePath("piano/C5.flac", "Samples/")).toBe("Samples/piano/C5.flac");
  });

  it("normalises the separators rather than assuming them", () => {
    // A `default_path` without its trailing slash is valid, and `Samples` + `/` + `kick.flac` must not become `Samples//kick.flac`.
    expect(resolveSamplePath("kick.flac", "Samples")).toBe("Samples/kick.flac");
    /**
     * ⭐ And a leading `/` is **not** joined. My first version of this criterion asserted that it was — `Samples/kick.flac` — and the implementation disagreed, which is how the contradiction surfaced: the same function
     * already treated a leading `/` as absolute in the criterion above. In SFZ a leading `/` means "from the library root", and `default_path` is a subdirectory of that root, so joining the two would place a
     * root-relative sample inside the default folder. The criterion now says what the code does and why, rather than what I assumed while writing it.
     */
    expect(resolveSamplePath("/kick.flac", "Samples/")).toBe("/kick.flac");
  });

  it("leaves an absolute path or a URL alone, because joining it would corrupt an address that already works", () => {
    // ⭐ The same rule the include resolution learned: path arithmetic applied to something that is not a relative path breaks it.
    expect(resolveSamplePath("/absolute/kick.flac", "Samples/")).toBe("/absolute/kick.flac");
    expect(resolveSamplePath("https://cdn.example/kick.flac", "Samples/")).toBe("https://cdn.example/kick.flac");
  });

  it("returns the sample unchanged when no default path was declared", () => {
    // "No default path" means the sample is already relative to the program; adding anything would be an invention.
    expect(resolveSamplePath("kit.flac", undefined)).toBe("kit.flac");
    expect(resolveSamplePath("kit.flac", "")).toBe("kit.flac");
  });

  it("reads a backslash separator as a separator, because VSCO 2 CE writes all 75 of its programs that way", () => {
    /**
     * ⭐ The case that made this criterion exist: the strings and winds of a real mirrored library declared `default_path=Strings\Violin Section\susVib\`, and the join produced a path with a backslash on one side and
     * `\/` in the middle. Every sample 404s, and nothing reports it — the instrument is simply silent.
     */
    expect(resolveSamplePath("Vln_susVib_A2_v1.wav", "Strings\\Violin Section\\susVib\\")).toBe("Strings/Violin Section/susVib/Vln_susVib_A2_v1.wav");
    // A `sample=` that is itself written with backslashes is the same rule from the other side.
    expect(resolveSamplePath("Strings\\Harp\\Harp_C4.wav", undefined)).toBe("Strings/Harp/Harp_C4.wav");
    // Mixed separators on both halves still compose to one forward-slash path between them.
    expect(resolveSamplePath("Hit\\Timpani1_Hit_v1.wav", "Percussion/Timpani\\")).toBe("Percussion/Timpani/Hit/Timpani1_Hit_v1.wav");
    // A default path that is the library root, written either way, joins to the bare leaf.
    expect(resolveSamplePath("kick.flac", "\\")).toBe("kick.flac");
    expect(resolveSamplePath("kick.flac", "/")).toBe("kick.flac");
  });

  it("reads the declaration from whichever block carried it", () => {
    expect(defaultPathFrom({ default_path: "Samples/" })).toBe("Samples/");
    // Modern files put it in `<control>`, older ones in `<global>`; the parser merges both into one opcode map, so the lookup is the same.
    expect(defaultPathFrom({ default_path: "   " })).toBeUndefined();
    expect(defaultPathFrom({})).toBeUndefined();
  });
});
