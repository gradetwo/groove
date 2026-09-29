import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSfz } from "../audio/sfz/parse";
import { playbackForNote } from "../audio/sfz/regionPlayback";
import { readWav } from "../../scripts/lib/wav.mjs";
import { measurePitch } from "../../scripts/lib/pitch.mjs";
import { buildFixture, buildMultiFixture } from "../../scripts/sfizz_oracle.mjs";
import { writeMidi } from "../../scripts/lib/midi.mjs";

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

  /**
   * **The controller-driven tuning, judged the same way.** `tune_ccN` is linear from zero (measured separately at four controller values), so a file that sets the controller high plays sharp — and this is the case where arithmetic done privately
   * would agree with itself while disagreeing with sfizz. The fixture puts `tune_cc1=1200` on a region and `set_cc1=127` in the file's `<control>`, which means one octave up with no controller sent at all.
   */
  it("plays a controller-tuned region at the pitch sfizz produces for it", () => {
    const dir = mkdtempSync(join(tmpdir(), "sfizz-tune-"));
    // The oracle's own fixture gives the 440 Hz tone and the note-60 phrase; only the SFZ is replaced, so the tuning is the one difference.
    const { sourceFrames } = buildFixture(dir);
    // `<control>` first, then a region whose tuning comes only from the controller — so the cents can come from nowhere else.
    writeFileSync(join(dir, "tuned.sfz"), "<control>\nset_cc1=127\n<region> sample=tone.wav pitch_keycenter=60 tune_cc1=1200\n");

    const regions = parseSfz(readFileSync(join(dir, "tuned.sfz"), "utf8"));
    // The project says one octave, and the assertion below is that sfizz agrees rather than that the arithmetic is self-consistent.
    expect(regions[0]!.tuneCents).toBeCloseTo(1200, 6);
    const playback = playbackForNote(regions, 60)!;
    const expectedHz = 440 * playback.ratio;

    const out = join(dir, "tuned.wav");
    execFileSync(SFIZZ, ["--sfz", join(dir, "tuned.sfz"), "--midi", join(dir, "note.mid"), "--wav", out, "-s", String(SR)], { stdio: ["ignore", "pipe", "pipe"] });
    const wav = readWav(out);
    const pitch = measurePitch(wav, { fromSeconds: WINDOW.offset, toSeconds: WINDOW.offset + WINDOW.length });
    expect(pitch, "no pitch measured").not.toBeNull();
    console.log(`   A4 controller tuning: expected ${expectedHz.toFixed(2)} Hz, sfizz ${pitch!.hz.toFixed(2)} Hz (source ${sourceFrames} frames at 440 Hz)`);
    expect(Math.abs(pitch!.hz - expectedHz) / expectedHz).toBeLessThan(0.01);
  });

  /**
   * **The bipolar curve, judged by sfizz like everything else here.** `tune_curveccN=1` is not a decoration: it changes the mapping from linear-from-zero to bipolar-about-64, and the shipped drum kit uses it on both of its tuning knobs. The fixture puts the
   * controller at 32, where the two shapes differ by more than an octave — linear gives about +300 cents, bipolar about −600 — so agreement cannot be a coincidence of a small difference.
   */
  it("plays a curve-1 region at the pitch sfizz produces, where the two shapes differ by an octave", () => {
    const dir = mkdtempSync(join(tmpdir(), "sfizz-curve-"));
    const { sourceFrames } = buildFixture(dir);
    // The controller is **the file's own default**, not a MIDI message: the parser computes a region's cents from `<control>`, so a comparison has to put both sides at the same value. Sending CC 32 in the MIDI would compare sfizz at 32 against this
    // project at the file's default of 0 — which is exactly the mistake this comment exists to prevent.
    writeFileSync(join(dir, "curved.sfz"), "<control>\nset_cc90=32\n<region> sample=tone.wav pitch_keycenter=60 tune_cc90=1200 tune_curvecc90=1\n");

    const regions = parseSfz(readFileSync(join(dir, "curved.sfz"), "utf8"));
    const playback = playbackForNote(regions, 60)!;
    const expectedHz = 440 * playback.ratio;

    const out = join(dir, "curved.wav");
    execFileSync(SFIZZ, ["--sfz", join(dir, "curved.sfz"), "--midi", join(dir, "note.mid"), "--wav", out, "-s", String(SR)], { stdio: ["ignore", "pipe", "pipe"] });
    const wav = readWav(out);
    const pitch = measurePitch(wav, { fromSeconds: WINDOW.offset, toSeconds: WINDOW.offset + WINDOW.length });
    expect(pitch, "no pitch measured").not.toBeNull();
    console.log(`   A4 curve 1 at CC 32: expected ${expectedHz.toFixed(2)} Hz, sfizz ${pitch!.hz.toFixed(2)} Hz (source ${sourceFrames} frames at 440 Hz)`);
    // A linear reading would be more than an octave away, so 1% is comfortably inside the difference between the two shapes.
    expect(Math.abs(pitch!.hz - expectedHz) / expectedHz).toBeLessThan(0.01);
  });
});
