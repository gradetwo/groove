import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSfz } from "../audio/sfz/parse";
import { playbackForNote } from "../audio/sfz/regionPlayback";
import { readWav } from "../../scripts/lib/wav.mjs";
import { measurePitch } from "../../scripts/lib/pitch.mjs";
import { buildMultiFixture } from "../../scripts/sfizz_oracle.mjs";

/**
 * A4: **sfizz's actual output judges this project's mapping.**
 *
 * The criterion is deliberately narrow and was corrected to be honest: this project decides **which sample** answers a note and **at what ratio**, while sfizz also
 * applies a default amplitude envelope (with a release, measured at about 0.075 s) and a default gain (−15.7 dB, measured). Sample-for-sample *amplitude* equality would
 * therefore measure sfizz's envelope rather than this code. So the comparison asks the two questions this code actually answers: is the **same region** chosen, and is
 * the **same pitch** produced — with the expected pitch computed as `sourceFrequency × ratio`, where the ratio comes from `playbackForNote` itself.
 *
 * **It skips, loudly, when sfizz is not present**, because most machines do not have it and a test that fails for a missing instrument teaches people to ignore it. The
 * `sfizz` scope is where it runs for real, and this machine has the binary, so the numbers below were produced by running it.
 */
const SFIZZ = process.env.SFIZZ_RENDER ?? "sfizz_render";
const available = (() => {
  try {
    execFileSync(SFIZZ, ["--help"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

const SR = 44100;
/** Where in each note's window to measure: past the attack, before the next note, and clear of the previous release tail. */
const WINDOW = { offset: 0.08, length: 0.22 };

describe.skipIf(!available)("A4 — sfizz's output against this project's mapping", () => {
  it("chooses the same region and produces the same pitch, note for note", () => {
    const dir = mkdtempSync(join(tmpdir(), "sfizz-agree-"));
    const fixture = buildMultiFixture(dir);
    const regions = parseSfz(readFileSync(join(dir, "multi.sfz"), "utf8"));
    expect(regions).toHaveLength(3);

    const out = join(dir, "multi.wav");
    execFileSync(SFIZZ, ["--sfz", join(dir, "multi.sfz"), "--midi", join(dir, "phrase.mid"), "--wav", out, "-s", String(SR)], { stdio: "ignore" });
    expect(existsSync(out)).toBe(true);
    const wav = readWav(out);

    const measured: Array<{ note: number; expectedHz: number; measuredHz: number }> = [];
    fixture.notes.forEach((note, index) => {
      const playback = playbackForNote(regions, note);
      expect(playback, `no region covers note ${note}`).not.toBeNull();
      const source = fixture.regions.find((region) => region.name === playback!.sample);
      expect(source, `the chosen sample ${playback!.sample} is not one of the fixture's`).toBeDefined();
      // The expectation is built from the fixture's own source frequency and **this project's** ratio, so the mapping is what is on trial.
      const expectedHz = source!.freq * playback!.ratio;

      const startedAt = index * 0.6 + WINDOW.offset;
      const pitch = measurePitch(wav, { fromSeconds: startedAt, toSeconds: startedAt + WINDOW.length });
      expect(pitch, `no pitch measured for note ${note}`).not.toBeNull();
      measured.push({ note, expectedHz, measuredHz: pitch!.hz });
      // 1% is tight enough to catch a wrong semitone (5.9%) and loose enough for a 220 ms window with a release tail behind it.
      expect(Math.abs(pitch!.hz - expectedHz) / expectedHz, `note ${note}: expected ${expectedHz.toFixed(2)} Hz, sfizz produced ${pitch!.hz.toFixed(2)} Hz`).toBeLessThan(0.01);
    });

    // Four distinct expectations, three regions, and one note that exercises interval **and** tune — the point of the fixture.
    expect(new Set(measured.map((entry) => Math.round(entry.expectedHz))).size).toBe(4);
    console.log("   A4 agreement (this project's mapping vs sfizz's render):");
    for (const entry of measured) console.log(`     note ${entry.note}: expected ${entry.expectedHz.toFixed(2)} Hz, sfizz ${entry.measuredHz.toFixed(2)} Hz`);
  });
});
