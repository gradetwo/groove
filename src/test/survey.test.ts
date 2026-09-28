import { describe, expect, it } from "vitest";
import { manifestEntryFromSurvey } from "../../scripts/lib/survey.mjs";
import { parseManifest } from "../data/sampleManifest";

/**
 * The survey's output must **parse as a manifest**, which is the only assertion that really matters here: an entry that the repository's own validator rejects would be
 * discovered at the worst possible moment — after a 1.2 GB download.
 */
const identity = { id: "virtuosity-drums-basic", name: "Virtuosity Drums — Basic Kit", licence: "CC0", prefix: "virtuosity-drums", repo: "sfzinstruments/virtuosity_drums", pin: "9f04cf9a7345", sfz: "Programs/01-basic-kit.sfz", needs: ["key"] };

describe("manifestEntryFromSurvey", () => {
  it("states the longest sample's duration, and keeps the files with their hashes and sizes", () => {
    const { entry, builtIns } = manifestEntryFromSurvey(identity, [
      { path: "Samples/kick.wav", bytes: 93103, sha256: "a".repeat(64), seconds: 3.0857 },
      { path: "Samples/snare.wav", bytes: 5000, sha256: "b".repeat(64), seconds: 1.934 },
    ]);
    expect(entry.durationSeconds).toBeCloseTo(3.0857, 4);
    expect(entry.files).toEqual([
      { path: "Samples/kick.wav", bytes: 93103, sha256: "a".repeat(64) },
      { path: "Samples/snare.wav", bytes: 5000, sha256: "b".repeat(64) },
    ]);
    // The `*silence` built-in is reported and excluded, because a file list that named it would send a mirror at a URL that cannot exist.
    expect(builtIns).toEqual([]);
    // And the whole thing parses as a manifest, which is the assertion that would have caught a shape mistake before a download rather than after.
    const parsed = parseManifest(JSON.stringify({ version: 1, entries: [entry] }));
    expect(parsed.ok, parsed.errors.join("; ")).toBe(true);
  });

  it("leaves the duration out when nothing was measured, rather than writing a zero the bridge would distrust", () => {
    const { entry } = manifestEntryFromSurvey(identity, [{ path: "Samples/kick.wav", bytes: 10 }]);
    expect(entry.durationSeconds).toBeUndefined();
    expect("durationSeconds" in entry).toBe(false);
    // The bridge's own criterion, restated here: an entry without a duration is a **gap** it reports, not a silent zero.
    expect(entry.files).toHaveLength(1);
  });

  it("reports a `*`-prefixed built-in instead of listing it as a file", () => {
    const { entry, builtIns } = manifestEntryFromSurvey(identity, [
      { path: "Samples/kick.wav", bytes: 10, seconds: 1 },
      { path: "Samples/*silence", bytes: 0, seconds: 0 },
    ]);
    expect(builtIns).toEqual(["Samples/*silence"]);
    expect(entry.files).toEqual([{ path: "Samples/kick.wav", bytes: 10 }]);
    expect(entry.durationSeconds).toBe(1);
  });
});
