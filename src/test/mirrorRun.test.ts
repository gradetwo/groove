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
    /**
     * **The plan carries the program tree, not only the samples it names.**
     *
     * The first version planned `sample=` paths alone, so **419 `.sfz` files — the entry program and every one of its 126 includes — were never uploaded**, while a reachability check on the entry
     * program was still passing because it had been built on the same plan. The expander has always known which files it read, so the plan takes them from there: **the program tree is carried by
     * construction rather than by remembering to copy a directory.**
     */
    // Named `programEntry` rather than `entryPath`: this file already declares that name further down, and the typechecker caught the collision instead of letting the later one shadow the earlier.
    const programEntry = "Programs/01-basic-kit.sfz";
    const programFiles = [programEntry, ...expanded.included].map((path) => ({ path, regions: 0 }));
    const sampleFiles = samplePathsFor(parseSfz(expanded.text), programEntry);
    // Deduplicated by path, because a program that also names an `.sfz` as a sample would otherwise be fetched twice.
    const plan = [...new Map([...programFiles, ...sampleFiles].map((file) => [file.path, file])).values()];
    console.log(`   mirror run   : ${plan.length} files planned (${programFiles.length} program, ${sampleFiles.length} sample)`);

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
    /**
     * **Written to a file as well as printed, because the print does not survive.** The first successful run measured all 1659 files and then produced an entry of well over a
     * hundred kilobytes, which GitHub truncated inside a single log line — so the numbers were visible (`longest 14.529542s`) and the artifact was not. A file is the deliverable;
     * the log line is a summary.
     */
    const { writeFileSync: writeJson } = await import("node:fs");
    const entryPath = process.env.SFZ_MIRROR_ENTRY ?? "manifest-entry.json";
    writeJson(entryPath, JSON.stringify(entry, null, 2));
    console.log(`   entry        : written to ${entryPath} (${JSON.stringify(entry).length} characters)`);
    console.log(`MANIFEST_ENTRY_SUMMARY ${JSON.stringify({ id: entry.id, files: (entry.files as unknown[]).length, durationSeconds: entry.durationSeconds })}`);
  }, 30 * 60 * 1000);
});
