import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseManifest } from "../data/sampleManifest";

/**
 * A regression guard on the **real data this repository ships**, not on a fixture.
 *
 * The manifest in `public/samples/manifest.json` was produced by a mirror run against a real 1.2 GB library: 1660 files planned from the SFZ, 1659 fetched (one skipped — SFZ's
 * `*silence` built-in), every byte hashed, and every duration measured with `ffprobe`. Those numbers are facts about a specific commit of someone else's library, and the point
 * of pinning them here is that **a future entry cannot quietly disagree with them**.
 *
 * It reads the file as shipped, so it is fast and needs no network. A change to the mirror, the survey or the entry builder that moves any of these figures fails here rather
 * than in a review nobody runs.
 */
const shipped = JSON.parse(readFileSync("public/samples/manifest.json", "utf8"));

describe("the manifest this repository ships", () => {
  it("parses, and still names exactly the libraries that were surveyed", () => {
    const parsed = parseManifest(JSON.stringify(shipped));
    expect(parsed.ok, parsed.errors.join("; ")).toBe(true);
    expect(parsed.manifest!.entries.map((entry) => entry.id)).toEqual(["virtuosity-drums-basic", "salamander-grand"]);
  });

  it("keeps the measured instrument's figures exactly as the mirror produced them", () => {
    const entry = parseManifest(JSON.stringify(shipped)).manifest!.entries.find((candidate) => candidate.id === "virtuosity-drums-basic")!;
    // 1659 files, not 1660: the plan has one more, and the extra one is `*silence`, which is a built-in rather than a file.
    expect(entry.files).toHaveLength(1659);
    // The longest sample, measured rather than guessed — and the figure two independent tools agreed on.
    expect(entry.durationSeconds).toBeCloseTo(14.529542, 6);
    // Pinned, because a different commit of the library is a different set of files.
    expect(entry.pin).toBe("9f04cf9a7345");
    expect(entry.licence).toBe("CC0");
    // Every file carries both promises, which is what makes an upload verifiable rather than hopeful.
    const incomplete = entry.files.filter((file) => !/^[0-9a-f]{64}$/.test(file.sha256 ?? "") || !(typeof file.bytes === "number" && file.bytes > 0));
    expect(incomplete.map((file) => file.path)).toEqual([]);
  });

  it("keeps the surveyed total, which is what a program costs rather than what the library weighs", () => {
    const entry = parseManifest(JSON.stringify(shipped)).manifest!.entries.find((candidate) => candidate.id === "virtuosity-drums-basic")!;
    const gigabytes = entry.files.reduce((sum, file) => sum + (file.bytes ?? 0), 0) / 1e9;
    // 0.442 GB of files for a program inside a repository that is about 1.2 GB — the distinction a manifest exists to make.
    expect(gigabytes).toBeGreaterThan(0.44);
    expect(gigabytes).toBeLessThan(0.45);
  });

  it("leaves the second entry honestly incomplete, because nothing has been mirrored for it", () => {
    const salamander = parseManifest(JSON.stringify(shipped)).manifest!.entries.find((candidate) => candidate.id === "salamander-grand")!;
    // It is CC BY, so its attribution is required and present — and its duration is absent rather than invented, which the bridge reports as a gap.
    expect(salamander.licence).toBe("CC-BY");
    expect(salamander.attribution).toContain("Alexander Holm");
    expect(salamander.durationSeconds).toBeUndefined();
  });
});
