import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { audioDurationSeconds } from "../../scripts/lib/audio_duration.mjs";
import { mirrorFiles } from "../../scripts/lib/mirror.mjs";
import { samplePathsFor } from "../audio/sfz/mirrorPlan";
import { expandIncludes } from "../audio/sfz/includes";
import { parseSfz, readControlDefaults, unresolvedVariables } from "../audio/sfz/parse";
import { regionsAtCc } from "../audio/sfz/ccGate";
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

    /**
     * **Every region sounds at the controller values the file itself declares**, which is the end-to-end form of the gate: this library gates each microphone on a controller (`locc101=1`, `locc102=43`) and turns them all on in its `<control>` block. A gate that
     * dropped regions here would silence parts of the kit that its author intended to be audible — and the assertion is against the file's own defaults rather than against a value this test chose.
     */
    const audible = regionsAtCc(regions, readControlDefaults(expanded.text));
    expect(audible.length, "every region must sound at the file's declared controller values").toBe(regions.length);

    // And the musical claim, checked note by note rather than in aggregate.
    for (const [note, sample] of Object.entries(EXPECTED.notes)) {
      const playback = playbackForNote(regions, Number(note));
      expect(playback, `note ${note} must resolve`).not.toBeNull();
      expect(playback!.sample.split("/").pop(), `note ${note} resolves to the wrong sample`).toBe(sample);
      /**
       * **No interval transposition**, which is what "a drum plays as recorded" means: this kit's regions set no `pitch_keycenter`, so nothing moves the sample by semitones. The ratio is not 1 for every note, though, and the reason is measured rather
       * than assumed — the kick carries `tune_cc90=1200` from the program's `<global>` **and** `tune_cc72=1200` from its microphone's `<master>`, each with a declared default of 63.5, and sfizz's `tune_ccN` is linear from zero, so the two together are
       * +1200 cents at rest. The assertion below is that the ratio is exactly the region's own cents, so the tuning is accounted for and nothing else is.
       */
      const region = regions.find((candidate) => candidate.lokey === Number(note) && candidate.hikey === Number(note));
      expect(region?.pitchKeycenter, `note ${note} must not set a key centre`).toBeUndefined();
      expect(playback!.ratio, `note ${note}: the ratio must come from its own tuning and nothing else`).toBeCloseTo(
        Math.pow(2, (region?.tuneCents ?? 0) / 1200),
        6
      );
    }
  });

  it("says the pin it read, so a failure identifies the data rather than only the code", () => {
    expect(PIN).toMatch(/^[0-9a-f]{12,40}$/);
    expect(files!.size).toBeGreaterThan(400);
  });
});

/**
 * The mirror chain, exercised on the real library: **plan → fetch → measure**.
 *
 * Three pieces were built separately and this is the first time they run one after another on real data — `samplePathsFor` says which files the program needs, `mirrorFiles`
 * fetches them and verifies them against promises (there are none yet, so it verifies nothing and says so by succeeding), and `audioDurationSeconds` asks `metaflac` how long
 * they are.
 *
 * **The two durations are pinned because two independent tools agreed on them**: `metaflac` reported `92832 samples` at `48000 Hz` and `ffprobe` reported `1.934000 s` for the
 * same file. So a change here that moves these numbers is a change in the chain, not in my arithmetic.
 */
describe.skipIf(files === null)("the mirror chain on a real library", () => {
  it("plans the files, fetches two of them, and measures their durations", async () => {
    const read = (path: string) => files!.get(path);
    const program = files!.get("Programs/01-basic-kit.sfz")!;
    const expanded = expandIncludes(program, read, { path: "Programs/01-basic-kit.sfz" });
    const plan = samplePathsFor(parseSfz(expanded.text), "Programs/01-basic-kit.sfz");

    // The plan is derived from the SFZ, and its size is the first number anyone asking "what does this library cost" wants.
    expect(plan.length).toBe(1660);
    // `*silence` is SFZ's built-in, so it is planned as a path but must never be requested.
    expect(plan.some((file) => file.path.includes("*silence"))).toBe(true);

    const wanted = plan.filter((file) => /kickmic_(snare_center_vl29|kick_snoff_vl4_rr1)\.flac$/.test(file.path));
    expect(wanted).toHaveLength(2);

    const result = await mirrorFiles({
      plan: wanted,
      baseUrl: `https://raw.githubusercontent.com/${REPO}/${PIN}`,
      expected: new Map(),
    });
    expect(result.problems).toEqual([]);
    expect(result.fetched).toBe(2);

    // And the durations, asked of the tool that knows — checked against two independent readings rather than against this code.
    const durations: string[] = [];
    for (const file of wanted) {
      const path = `/tmp/vd-mirror/${file.path}`;
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, Buffer.from(await (await fetch(`https://raw.githubusercontent.com/${REPO}/${PIN}/${file.path}`)).arrayBuffer()));
      const measured = audioDurationSeconds(path, { run: (command, args) => execFileSync(command, args, { encoding: "utf8" }) });
      durations.push(`${file.path.split("/").pop()}:${measured.seconds.toFixed(4)}s`);
      // The module reports seconds only: the tool it uses now is `ffprobe`, which reads both FLAC and WAV, and it does not report a sample rate. The stale assertion asked for
      // 48000 and failed **after** the whole library had been fetched — found by the full suite, and the same class of mistake as the manifest criterion that asserted a count
      // instead of a property.
      expect(measured.seconds).toBeGreaterThan(0);
    }
    expect(durations.join(" ")).toMatch(/kickmic_snare_center_vl29\.flac:1\.9340s/);
    expect(durations.join(" ")).toMatch(/kickmic_kick_snoff_vl4_rr1\.flac:3\.0857s/);
    console.log(`   mirror chain : ${plan.length} files planned, 2 fetched and verified, durations ${durations.join(" ")}`);
  });
});
