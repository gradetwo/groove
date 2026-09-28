/**
 * The sfizz oracle, as a script that can be run here and in CI — the apparatus from A1, with its reading pinned.
 *
 * It does three things and refuses to do a fourth: builds a fixture whose numbers are known by construction (a 440 Hz sine at peak 0.5, one `<region>`
 * with `pitch_keycenter=60`, one 0.25 s note at 120 bpm through the tested MIDI writer), renders it with `sfizz_render`, and reads the result with the tested WAV
 * reader. The fourth thing — comparing sfizz against **our** engine — needs the browser and belongs to the audio scope, because this script's job is to prove the
 * *instrument*, not the instrument's agreement with us.
 *
 * **The expected numbers are pinned on purpose.** They are sfizz's defaults, read rather than assumed: stereo output from a mono sample, a default amp envelope with
 * a release (0.25 s of note becomes 0.325 s), and a level that is not unity gain (peak 0.5 in, 0.0824 out). If CI's oracle reads something else, it is a different
 * sfizz and every comparison built on it would be measuring the wrong thing.
 */
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readWav } from "./lib/wav.mjs";
import { writeMidi } from "./lib/midi.mjs";

const SR = 44100;
const SECONDS = 0.5;
const PEAK = 0.5;
const FREQ = 440;
const NOTE_SECONDS = 0.25;
const SFIZZ = process.env.SFIZZ_RENDER ?? "sfizz_render";

/** What the fixture must read as, before any comparison exists. */
export const EXPECTED = { channels: 2, frames: 14336, peak: 0.0824, seconds: 0.3251 };

function writeTone(path) {
  const frames = Math.round(SR * SECONDS);
  const bytes = Buffer.alloc(44 + frames * 2);
  bytes.write("RIFF", 0, "ascii");
  bytes.writeUInt32LE(36 + frames * 2, 4);
  bytes.write("WAVE", 8, "ascii");
  bytes.write("fmt ", 12, "ascii");
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(SR, 24);
  bytes.writeUInt32LE(SR * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36, "ascii");
  bytes.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i += 1) {
    bytes.writeInt16LE(Math.round(Math.sin((2 * Math.PI * FREQ * i) / SR) * PEAK * 32767), 44 + i * 2);
  }
  writeFileSync(path, bytes);
  return frames;
}

export function buildFixture(dir) {
  const frames = writeTone(join(dir, "tone.wav"));
  writeFileSync(join(dir, "one.sfz"), "<region> sample=tone.wav pitch_keycenter=60 lokey=0 hikey=127\n");
  writeMidi(join(dir, "note.mid"), { bpm: 120, notes: [{ note: 60, velocity: 100, startSeconds: 0, durationSeconds: NOTE_SECONDS }] });
  return { sourceFrames: frames };
}

/**
 * A **multi-region** fixture, for the comparison A4 actually needs: three samples with three different roots, three regions with different key ranges and one with
 * `tune`, and a three-note phrase that walks across them. A single region cannot fail the interesting ways — wrong region chosen, wrong root, wrong ratio — because
 * with one region every note takes the same path.
 *
 * It is exported rather than inlined so the comparison and the oracle share one definition of "the fixture", and so a change to it changes both.
 */
export function buildMultiFixture(dir) {
  const samples = [
    { name: "low.wav", freq: 220, lokey: 0, hikey: 47, root: 40 },
    { name: "mid.wav", freq: 440, lokey: 48, hikey: 71, root: 60 },
    { name: "high.wav", freq: 880, lokey: 72, hikey: 127, root: 84, tune: 100 },
  ];
  for (const sample of samples) {
    const frames = Math.round(SR * SECONDS);
    const bytes = Buffer.alloc(44 + frames * 2);
    bytes.write("RIFF", 0, "ascii");
    bytes.writeUInt32LE(36 + frames * 2, 4);
    bytes.write("WAVE", 8, "ascii");
    bytes.write("fmt ", 12, "ascii");
    bytes.writeUInt32LE(16, 16);
    bytes.writeUInt16LE(1, 20);
    bytes.writeUInt16LE(1, 22);
    bytes.writeUInt32LE(SR, 24);
    bytes.writeUInt32LE(SR * 2, 28);
    bytes.writeUInt16LE(2, 32);
    bytes.writeUInt16LE(16, 34);
    bytes.write("data", 36, "ascii");
    bytes.writeUInt32LE(frames * 2, 40);
    for (let i = 0; i < frames; i += 1) {
      bytes.writeInt16LE(Math.round(Math.sin((2 * Math.PI * sample.freq * i) / SR) * PEAK * 32767), 44 + i * 2);
    }
    writeFileSync(join(dir, sample.name), bytes);
  }
  writeFileSync(
    join(dir, "multi.sfz"),
    samples
      .map(
        (sample) =>
          `<region> sample=${sample.name} lokey=${sample.lokey} hikey=${sample.hikey} pitch_keycenter=${sample.root}` +
          (sample.tune ? ` tune=${sample.tune}` : "")
      )
      .join("\n") + "\n"
  );
  /**
   * The phrase is built so the pitch criterion **has discriminating power**, which the first version did not: every note sat on its own region's root, so the expected
   * ratio was 1 everywhere and a wrong ratio would have looked exactly like a right one.
   *
   *   note 40 — low region (root 40):  +0 semitones → 220 × 1      = 220.00 Hz
   *   note 52 — mid region (root 60):  −8 semitones → 440 × 2^(−8/12) = 277.18 Hz
   *   note 60 — mid region (root 60):  +0 semitones → 440 × 1      = 440.00 Hz
   *   note 72 — high region (root 84): −12 semitones **and** tune=100 → 880 × 0.5 × 2^(1/12) = 466.16 Hz
   *
   * The last one is the most valuable: it is the only note that exercises pitch **and** `tune` in one expected number.
   *
   * The notes are 0.6 s apart rather than 0.3 s so each measurement window is free of the previous note's release tail — sfizz's default envelope has one, measured at
   * about 0.075 s, and a later window would otherwise contain two pitches.
   */
  const phrase = [
    { note: 40, startSeconds: 0 },
    { note: 52, startSeconds: 0.6 },
    { note: 60, startSeconds: 1.2 },
    { note: 72, startSeconds: 1.8 },
  ];
  writeMidi(join(dir, "phrase.mid"), {
    bpm: 120,
    notes: phrase.map((entry) => ({ ...entry, velocity: 100, durationSeconds: NOTE_SECONDS })),
  });
  return {
    samples: samples.map((sample) => sample.name),
    notes: phrase.map((entry) => entry.note),
    regions: samples,
  };
}

/** Render the fixture with sfizz and read the result. Throws with the reason rather than returning a guessed shape. */
export function renderWithSfizz(dir) {
  const out = join(dir, "out.wav");
  try {
    execFileSync(SFIZZ, ["--sfz", join(dir, "one.sfz"), "--midi", join(dir, "note.mid"), "--wav", out, "-s", String(SR)], {
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    throw new Error(`could not run ${SFIZZ} (${error.message}) — set SFIZZ_RENDER, or build sfztools/sfizz at tag 1.2.3 with -DSFIZZ_RENDER=ON`);
  }
  if (!existsSync(out)) throw new Error(`${SFIZZ} reported success but wrote no WAV`);
  return readWav(out);
}

function main() {
  const dir = mkdtempSync(join(tmpdir(), "sfizz-oracle-"));
  if (process.argv.includes("--multi")) {
    // The multi-region fixture has no pinned numbers yet: the point of printing them is to have them, and to hand the comparison a reference it can be built against.
    const { samples, notes } = buildMultiFixture(dir);
    const out = join(dir, "multi.wav");
    execFileSync(SFIZZ, ["--sfz", join(dir, "multi.sfz"), "--midi", join(dir, "phrase.mid"), "--wav", out, "-s", String(SR)], { stdio: "ignore" });
    const wav = readWav(out);
    console.log(`   fixture : ${samples.join(", ")} — notes ${notes.join(", ")}`);
    console.log(`   sfizz   : ${wav.channels} ch, ${wav.frames} frames (${(wav.frames / wav.sampleRate).toFixed(4)}s), peak ${wav.peak.toFixed(4)}, rms ${wav.rms.toFixed(4)}`);
    console.log("   (numbers printed, not pinned: this fixture exists to give the comparison something concrete to compare against)");
    return;
  }
  const { sourceFrames } = buildFixture(dir);
  const wav = renderWithSfizz(dir);
  const seconds = wav.frames / wav.sampleRate;
  const agree = {
    channels: wav.channels === EXPECTED.channels,
    frames: wav.frames === EXPECTED.frames,
    peak: Math.abs(wav.peak - EXPECTED.peak) < 5e-4,
    seconds: Math.abs(seconds - EXPECTED.seconds) < 5e-4,
  };
  console.log(`   source       : ${sourceFrames} frames (${SECONDS}s) mono, peak ${PEAK}`);
  console.log(`   sfizz output : ${wav.channels} ch, ${wav.frames} frames (${seconds.toFixed(4)}s), peak ${wav.peak.toFixed(4)}, rms ${wav.rms.toFixed(4)}`);
  const mismatched = Object.entries(agree).filter(([, ok]) => !ok).map(([key]) => key);
  if (mismatched.length > 0) {
    console.error(`❌ the oracle in this environment does not read like the known one (${mismatched.join(", ")}) — expected ${JSON.stringify(EXPECTED)}`);
    console.error("   A comparison built on a different sfizz would be measuring the wrong thing, so this is a failure rather than a warning.");
    process.exit(1);
  }
  console.log(`✅ sfizz oracle agrees with its known reading (${JSON.stringify(EXPECTED)})`);
  console.log("   note: stereo from mono, a default release tail, and −15.7 dB — sfizz's defaults, read rather than assumed");
}

if (import.meta.url === `file://${process.argv[1]}`) main();
