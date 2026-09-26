/**
 * The regression check for the step at every note event.
 *
 * `gs_process(n)` writes its `n` samples from index 0, so a block that a timed event splits must be assembled **per chunk**. The
 * processor used to copy `block` frames once after the split loop: the last chunk's audio landed at the start of the block and
 * the rest was stale. A block is split at exactly the frames where an event is due — every note-on and note-off — so the result
 * was a one-sample step with broadband content at every event: the click the owner first reported on UK Garage's lead.
 *
 * It was found by measurement and it is guarded by measurement: this renders one stem through the real offline path and fails if
 * the high-frequency envelope contains jumps that the signal's own texture does not explain. A synthetic unit test was tried
 * first and **passed against the broken code twice** (a release is too gradual to move, and a ramp does not violate its own
 * slope), which is why the guard is the measurement that caught it.
 *
 * `--genre`/`--stem` choose the case, and the default is the one the owner reported. The detector is calibrated for a
 * **sustained** lane: a bright stab's attack is a legitimate high-frequency envelope jump, so a genre whose chords are stabs
 * (dub-techno, say) trips it honestly and is not a useful guard.
 *
 * Usage: node scripts/probe_note_event_continuity.mjs [--genre=uk-garage] [--bars=2] [--stem=lead]
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const value = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const genre = value("genre", "uk-garage");
const bars = value("bars", "2");
const stem = value("stem", "lead");
const wav = path.join(os.tmpdir(), `continuity-${genre}-${stem}.wav`);

const render = spawnSync(
  process.execPath,
  [
    path.join(ROOT, "scripts", "render_genre_wav.mjs"),
    `--genre=${genre}`,
    `--bars=${bars}`,
    `--stem=${stem}`,
    `--solo=${stem}`,
    `--out=${wav}`,
  ],
  { cwd: ROOT, stdio: ["ignore", "pipe", "inherit"], encoding: "utf8" }
);
if (render.status !== 0 || !fs.existsSync(wav)) {
  console.error(`❌ could not render ${genre}/${stem}:\n${(render.stdout ?? "").slice(-600)}`);
  process.exit(1);
}

/**
 * The detector the fix was measured with: 1 ms RMS envelope, 0.2 ms window, high-passed at 6 kHz.
 *
 * Comparing raw samples would flag every drum transient and every bright waveform; the high-frequency envelope is what
 * separates "a step was introduced" from "this is a hi-hat".
 */
const probe = spawnSync(
  process.execPath,
  [path.join(ROOT, "scripts", "probe_click_envelope.mjs"), "--window=0.2", "--highpass=6000", wav],
  { cwd: ROOT, stdio: ["ignore", "pipe", "inherit"], encoding: "utf8" }
);
const output = probe.stdout ?? "";
const clean = /none beyond the sound's own texture/.test(output);
if (probe.status !== 0 || !clean) {
  console.error(`❌ ${genre}/${stem}: the note events leave a step in the render.`);
  console.error(output.split("\n").slice(-4).join("\n"));
  console.error(
    "\n   A block that a timed event splits must be assembled per chunk: `gs_process(n)` writes its `n` samples from\n" +
      "   index 0, so a single `block`-wide copy after the split loop puts the last chunk at the start of the block."
  );
  process.exit(1);
}
console.log(`✅ ${genre}/${stem}: no step at the note events`);
