import { describe, expect, it } from "vitest";
import { expandIncludes } from "../audio/sfz/includes";
import { parseSfz, unresolvedVariables } from "../audio/sfz/parse";
import { playbackForNote } from "../audio/sfz/regionPlayback";

/**
 * A **real** library, read end to end, with its reading pinned.
 *
 * Six gaps were found by running a real file through this parser, and four of them were bugs of mine — an include resolved from the wrong base, inheritance taken from the
 * last group instead of the region's own, a directive with a trailing comment silently ignored, an unresolved variable that made every region match every note, and CRLF
 * line endings. **Not one was found by reasoning.** So the reading is a criterion now rather than a session note: if a change moves any of these numbers, this fails.
 *
 * The library is CC0 and **not vendored** — nothing is added to this repository. The `.sfz` files are fetched from the pinned commit at test time (about 1.7 MB, the
 * samples are never downloaded) and the whole step is **skipped, loudly, when the network is unavailable**, because a test that fails for a missing network teaches people
 * to ignore it.
 */
const REPO = "sfzinstruments/virtuosity_drums";
const PIN = "9f04cf9a7345";

/** What the reading must be. Every number here was produced by running the real library, not by estimating. */
const EXPECTED = {
  includes: 126,
  regions: 1676,
  unresolvedRegions: 0,
  notes: {
    35: "kickmic_kick_snoff_vl4_rr1.flac",
    36: "kickmic_kick_snon_vl4_rr1.flac",
    38: "kickmic_snare_center_vl29.flac",
    42: "kickmic_hh_closed_vl4_rr1.flac",
    46: "kickmic_hh_open_vl4_rr1.flac",
    49: "kickmic_crash_crash_vl3_rr1.flac",
    55: "kickmic_flatride_crash_vl4.flac",
    57: "kickmic_crash_sizzle_vl3_rr1.flac",
  },
};

async function fetchSfzTree(): Promise<Map<string, string> | null> {
  try {
    const tree = await fetch(`https://api.github.com/repos/${REPO}/git/trees/${PIN}?recursive=1`, {
      headers: { accept: "application/vnd.github+json" },
    });
    if (!tree.ok) return null;
    const listing = (await tree.json()) as { tree?: Array<{ path: string }> };
    const paths = (listing.tree ?? []).map((entry) => entry.path).filter((path) => path.startsWith("Programs/") && path.endsWith(".sfz"));

    const files = new Map<string, string>();
    // Batched rather than one request at a time: 419 files is a lot of round trips, and the whole set is under two megabytes.
    for (let start = 0; start < paths.length; start += 25) {
      const batch = paths.slice(start, start + 25);
      const bodies = await Promise.all(
        batch.map(async (path) => {
          const response = await fetch(`https://raw.githubusercontent.com/${REPO}/${PIN}/${path}`);
          return response.ok ? ([path, await response.text()] as const) : null;
        })
      );
      for (const body of bodies) if (body) files.set(body[0], body[1]);
    }
    return files.size > 0 ? files : null;
  } catch {
    return null;
  }
}

const files = await fetchSfzTree();

describe.skipIf(files === null)("a real library, read end to end", () => {
  it("reads the whole include chain and every variable, and maps the drum notes the library intends", () => {
    const read = (path: string) => files!.get(path);
    const program = files!.get("Programs/01-basic-kit.sfz");
    expect(program, "the pinned entry program was not fetched").toBeDefined();

    const expanded = expandIncludes(program!, read, { path: "Programs/01-basic-kit.sfz" });
    const regions = parseSfz(expanded.text);
    const report = unresolvedVariables(regions);

    // The numbers, pinned — this is what a change to the parser has to keep true.
    expect({ includes: expanded.included.length, regions: regions.length, unresolvedRegions: report.regions, problems: expanded.problems.length }).toEqual({
      includes: EXPECTED.includes,
      regions: EXPECTED.regions,
      unresolvedRegions: EXPECTED.unresolvedRegions,
      problems: 0,
    });

    // And the musical claim, checked note by note rather than in aggregate.
    for (const [note, sample] of Object.entries(EXPECTED.notes)) {
      const playback = playbackForNote(regions, Number(note));
      expect(playback, `note ${note} must resolve`).not.toBeNull();
      expect(playback!.sample.split("/").pop(), `note ${note} resolves to the wrong sample`).toBe(sample);
      // Nothing should be transposed: this kit's regions set no pitch_keycenter, and a drum plays as recorded.
      expect(playback!.ratio, `note ${note} must not be transposed`).toBeCloseTo(1, 6);
    }
  });

  it("says the pin it read, so a failure identifies the data rather than only the code", () => {
    expect(PIN).toMatch(/^[0-9a-f]{12,40}$/);
    expect(files!.size).toBeGreaterThan(400);
  });
});
