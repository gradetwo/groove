import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { expandIncludes } from "../audio/sfz/includes";
import { parseSfz } from "../audio/sfz/parse";
import { samplePathsFor } from "../audio/sfz/mirrorPlan";
import { mirrorFiles } from "../../scripts/lib/mirror.mjs";
import { hashFile } from "../../scripts/lib/files.mjs";
import { audioDurationSeconds } from "../../scripts/lib/audio_duration.mjs";
import { manifestEntryFromSurvey } from "../../scripts/lib/survey.mjs";
import { parseManifest } from "../data/sampleManifest";

/**
 * The mirror run, once per library release — **and off unless asked for**.
 *
 * It downloads a whole library (1.2 GB for the one this was built against), so it must never run by accident: it is skipped unless `SFZ_MIRROR_RUN=1` **and** the `.sfz` tree is
 * present. What it produces is a single JSON object — the **manifest entry** — and printing it is the point of the run: the manifest is the only artifact of a mirror that
 * belongs in the repository.
 *
 * Its steps are the chain already built and tested separately: expand and parse the program, derive the file plan from the SFZ, fetch and hash every file, ask `metaflac` how
 * long each one is, and assemble the entry. The one thing this adds is doing them **in order, on real data, at scale**.
 */
const enabled = process.env.SFZ_MIRROR_RUN === "1";
const ROOT = process.env.SFZ_MIRROR_ROOT ?? "/tmp/vd";
const OUT = process.env.SFZ_MIRROR_OUT ?? "/tmp/vd-mirror-run";
const REPO_PATH = "sfzinstruments/virtuosity_drums";
const PIN = "9f04cf9a7345";

describe.skipIf(!enabled)("the mirror run", () => {
  it("plans, fetches, measures and prints the manifest entry", async () => {
    const { readFileSync, existsSync } = await import("node:fs");
    const read = (path: string) => (existsSync(`${ROOT}/${path}`) ? readFileSync(`${ROOT}/${path}`, "utf8") : undefined);
    const program = read("Programs/01-basic-kit.sfz");
    expect(program, `${ROOT}/Programs/01-basic-kit.sfz is missing — fetch the .sfz tree first`).toBeDefined();

    const expanded = expandIncludes(program!, read, { path: "Programs/01-basic-kit.sfz" });
    const plan = samplePathsFor(parseSfz(expanded.text), "Programs/01-basic-kit.sfz");
    console.log(`   mirror run   : ${plan.length} files planned`);

    const result = await mirrorFiles({
      plan,
      baseUrl: `https://raw.githubusercontent.com/${REPO_PATH}/${PIN}`,
      outDir: OUT,
      writeFile: (path: string, bytes: Uint8Array) => {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, bytes);
      },
    });
    console.log(`   mirror run   : fetched ${result.fetched}, skipped ${result.skipped.length}, problems ${result.problems.length}`);
    for (const problem of result.problems.slice(0, 5)) console.log(`   problem      : ${problem}`);

    const measured = [];
    for (const file of plan) {
      if (file.path.includes("*")) continue;
      const path = `${OUT}/${file.path}`;
      if (!existsSync(path)) continue;
      const fingerprint = await hashFile(path);
      const seconds = audioDurationSeconds(path, { run: (command, args) => execFileSync(command, args, { encoding: "utf8" }) }).seconds;
      measured.push({ path: file.path, bytes: fingerprint.bytes, sha256: fingerprint.sha256, seconds });
    }

    const { entry, builtIns } = manifestEntryFromSurvey(
      {
        id: "virtuosity-drums-basic",
        name: "Virtuosity Drums — Basic Kit",
        licence: "CC0",
        prefix: "virtuosity-drums",
        repo: REPO_PATH,
        pin: PIN,
        sfz: "Programs/01-basic-kit.sfz",
        needs: ["key", "lokey", "hikey", "pitch_keycenter", "lovel", "hivel", "seq_length", "seq_position"],
      },
      measured
    );

    console.log(`   measured     : ${measured.length} files, longest ${String(entry.durationSeconds)}s, builtIns ${builtIns.length}`);
    const parsed = parseManifest(JSON.stringify({ version: 1, entries: [entry] }));
    expect(parsed.ok, `the produced entry does not parse as a manifest: ${parsed.errors.join("; ")}`).toBe(true);
    // Printed last, and printing is the deliverable: this JSON is what goes into `public/samples/manifest.json`.
    console.log(`MANIFEST_ENTRY ${JSON.stringify(entry)}`);
  }, 30 * 60 * 1000);
});
