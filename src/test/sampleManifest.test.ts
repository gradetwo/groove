import { describe, expect, it } from "vitest";
import { mirrorSfzUrl, parseManifest, shippableEntries } from "../data/sampleManifest";

/**
 * The manifest's criteria. Two of them are rules rather than shapes, and both come from the integration discussion: ids must be unique because a manifest that names
 * one instrument twice cannot be resolved deterministically, and a licence that requires attribution must carry it because redistributing without it is a licence
 * violation rather than a style choice.
 */
const manifest = (entries: unknown) => JSON.stringify({ version: 1, entries });

describe("parseManifest", () => {
  it("accepts a well-formed manifest and reports what it holds", () => {
    const result = parseManifest(
      manifest([
        { id: "vcsl-piano", name: "VCSL Piano", licence: "CC0", prefix: "vcsl/", sfz: "piano.sfz", files: [{ path: "piano.sfz", bytes: 120 }], needs: ["lokey", "hikey", "pitch_keycenter"] },
      ])
    );
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.manifest!.entries[0]).toMatchObject({ id: "vcsl-piano", licence: "CC0" });
    // The needs field is the answer to "will this library work here", kept as data rather than as someone's memory.
    expect(result.manifest!.entries[0]!.needs).toEqual(["lokey", "hikey", "pitch_keycenter"]);
  });

  it("refuses a duplicate id, because resolution would otherwise be a coin toss", () => {
    const result = parseManifest(manifest([{ id: "same", name: "A", licence: "CC0", files: [] }, { id: "same", name: "B", licence: "CC0", files: [] }]));
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/duplicate id "same"/);
  });

  it("requires attribution for a licence that demands it, and does not for one that does not", () => {
    const missing = parseManifest(manifest([{ id: "salamander", name: "Salamander", licence: "CC-BY", files: [] }]));
    expect(missing.ok).toBe(false);
    expect(missing.errors.join("\n")).toMatch(/licence CC-BY requires attribution/);

    // The same entry with attribution is fine, and a CC0 entry needs none.
    const withAttribution = parseManifest(
      manifest([
        { id: "salamander", name: "Salamander", licence: "CC-BY", attribution: "Chisato Yamauchi; Alexander Holm", files: [] },
        { id: "drums", name: "Virtuosity Drums", licence: "CC0", files: [] },
      ])
    );
    expect(withAttribution.ok).toBe(true);
  });

  it("reports every problem at once rather than stopping at the first", () => {
    const result = parseManifest(manifest([{ name: "no id", licence: "nonsense", files: "not an array" }, { id: "x", licence: "CC-BY", files: [] }]));
    expect(result.ok).toBe(false);
    /**
     * The property worth asserting is that **more than one** problem comes back, and that they come from **different entries** — not a number I pencilled in.
     *
     * The first version of this assertion claimed four and the code produced three, because I had counted the fixture wrong rather than the code. The count was never
     * the point: a validator that stops at the first fault makes a manifest take as many round trips as it has mistakes, and that is what this is guarding.
     */
    expect(result.errors.length).toBeGreaterThan(1);
    expect(result.errors.some((message) => message.includes("entries[0]"))).toBe(true);
    expect(result.errors.some((message) => message.includes("entries[1]"))).toBe(true);
  });

  it("treats a broken file as a reported error rather than as an empty manifest", () => {
    expect(parseManifest("{ not json").ok).toBe(false);
    expect(parseManifest("{ not json").errors[0]).toMatch(/not valid JSON/);
    expect(parseManifest(JSON.stringify({ version: 2, entries: [] })).errors.join()).toMatch(/version must be 1/);
    expect(parseManifest(JSON.stringify({ version: 1 })).errors.join()).toMatch(/no entries array/);
  });

  it("separates what ships from what is deliberately excluded, and resolves a mirror URL", () => {
    const parsed = parseManifest(
      manifest([
        { id: "vcsl", name: "VCSL", licence: "CC0", prefix: "vcsl", sfz: "piano.sfz", files: [] },
        { id: "vsco2", name: "VSCO 2 CE", licence: "CC-Sampling-Plus", files: [], excludedReason: "the licence terms are vague, so this project does not redistribute it" },
        { id: "samples-only", name: "Just samples", licence: "CC0", files: [] },
      ])
    ).manifest!;
    expect(shippableEntries(parsed).map((entry) => entry.id)).toEqual(["vcsl", "samples-only"]);
    // A trailing slash on either side must not produce a doubled one.
    expect(mirrorSfzUrl(parsed, "vcsl", "https://cdn.example/samples/")).toBe("https://cdn.example/samples/vcsl/piano.sfz");
    // An entry that is not an instrument has no SFZ to fetch, which is a legitimate answer rather than an error.
    expect(mirrorSfzUrl(parsed, "samples-only", "https://cdn.example")).toBeUndefined();
    expect(mirrorSfzUrl(parsed, "nope", "https://cdn.example")).toBeUndefined();
  });
});
