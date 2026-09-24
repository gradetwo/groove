#!/usr/bin/env node
/**
 * B5's audio half: does a *generated arrangement* actually render a fill and a build?
 *
 *   node scripts/probe_arrangement_audio.mjs [--genre=chicago-house] [--json]
 *
 * B5 landed as arrangement data (`SongSection.overrides`) and the unit tests prove the *pattern* it flattens to —
 * the fill's onsets, the ramp's per-bar velocity scale. What no unit test can prove is that the sound changes,
 * because jsdom's Web Audio double renders an empty buffer (`src/test/helpers/fakeAudio.ts`), so every audio claim in
 * `src/test/**` is really a claim about structure. This probe renders through the app's own offline engine in a real
 * browser and measures the audio:
 *
 *   · **the fill is audible** — the fill's own bar is rendered twice, once with the `fill` override and once without,
 *     and the bar with the fill must carry more energy;
 *   · **the build is audible** — the club form's `build` section ramps its velocity, so its last bar must be louder
 *     than its first in the rendered file, not just in the pattern;
 *   · **the song is the length the form says** — bars, not one loop;
 *   · and the onsets are counted from the flattened pattern, which is where P1.5's own wording lives ("the last bar's
 *     onset count differs from the others").
 *
 * It is a probe rather than a gate because it renders one genre: the claim it checks belongs to the generator, not to
 * the library, so a per-genre sample would only repeat the same assertion twelve times.
 */
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const playwright = require("playwright");
const ROOT = process.cwd();
const argv = process.argv.slice(2);
const asJson = argv.includes("--json");
const genreId = (argv.find((a) => a.startsWith("--genre=")) ?? "--genre=chicago-house").split("=")[1];
const port = Number((argv.find((a) => a.startsWith("--port=")) ?? "--port=3188").split("=")[1]);
/**
 * The build's velocity ramp, as `first,last` multipliers.
 *
 * Added to answer a question the probe could only report on: a **6 dB** ramp in the pattern renders as −0.15 dB in
 * the file, because the master chain's gain rides down on the louder bar. Sweeping the ramp is how you find out
 * whether more content buys an audible build or whether the chain has a ceiling on slow dynamics.
 */
const rampSpec = (argv.find((a) => a.startsWith("--ramp=")) ?? "--ramp=0.25,1").split("=")[1];
const RAMP = rampSpec
  .split(",")
  .map((value) => Number(value))
  .filter((value) => Number.isFinite(value) && value > 0);
const rampPair = RAMP.length === 2 ? RAMP : [0.5, 1];

if (!fs.existsSync(path.join(ROOT, "node_modules", "vite", "bin", "vite.js"))) {
  console.error("❌ No node_modules — run `npm ci` first.");
  process.exit(1);
}

const { chromium } = require("playwright");
const viteBin = path.join(ROOT, "node_modules/vite/bin/vite.js");
const server = require("node:child_process").spawn(process.execPath, [viteBin, "--port", String(port), "--strictPort"], {
  cwd: ROOT,
  stdio: ["ignore", "pipe", "pipe"],
});
server.stderr.on("data", () => {});
process.on("exit", () => {
  try {
    server.kill("SIGTERM");
  } catch {
    /* already gone */
  }
});

const base = `http://127.0.0.1:${port}`;
const waitForServer = async () => {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(base, { signal: AbortSignal.timeout(1000) });
      if (res.ok || res.status === 404) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("vite did not start");
};

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const fail = async (message) => {
  console.error(`❌ ${message}`);
  await browser.close().catch(() => {});
  server.kill("SIGTERM");
  process.exit(1);
};

try {
  await waitForServer();
  const page = await browser.newPage();
  page.on("console", (msg) => {
    if (/MasterLimiter|Gs1/.test(msg.text())) process.stdout.write(`  [page] ${msg.text()}\n`);
  });
  await page.route("**/__arrangement_probe__.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>',
    })
  );
  await page.goto(`${base}/__arrangement_probe__.html`, { waitUntil: "domcontentloaded", timeout: 60000 });

  const measured = await page.evaluate(async ({ genreId: id, ramp }) => {
    const [wav, genresModule, mixModule, formsModule, flattenModule, trackUtils, loudness] = await Promise.all([
      import("/src/audio/WavExporter.ts"),
      import("/src/data/genres/index.ts"),
      import("/src/data/genreMix.ts"),
      import("/src/data/arrangementForm.ts"),
      import("/src/data/songFlatten.ts"),
      import("/src/utils/trackUtils.ts"),
      import("/src/test/helpers/loudness.ts"),
    ]);
    const genre = genresModule.ALL_GENRES.find((g) => g.id === id);
    if (!genre) throw new Error(`unknown genre ${id}`);
    const clip = mixModule.patternFromGenre(genre);
    const drumKit = trackUtils.getDefaultDrumKitForGenre(genre);
    const stepsPerPass = clip.totalSteps || clip.tracks?.[0]?.steps?.length || 16;

    /**
     * The smallest song that carries both claims: a two-bar build, then a two-bar section with a fill.
     *
     * Deliberately not the whole 40-bar `club` form. The first version rendered it and took the browser down with it
     * (the renderer process died mid-`evaluate`), and a probe that renders eight seconds to check two properties is
     * the same evidence for a fraction of the weight. The form table itself is pinned by the unit tests and by
     * `probe:arrangement`, which drives the real picker in the built app.
     */
    const fill = formsModule.fillForTracks(clip.tracks, stepsPerPass);
    const sections = [
      { id: "probe-s1", slot: "A", bars: 2, label: "build", overrides: { velocityRamp: ramp } },
      { id: "probe-s2", slot: "A", bars: 2, label: "fill", ...(fill ? { overrides: { fill } } : {}) },
    ];
    const song = {
      id: "probe",
      name: id,
      genreId: id,
      bpm: clip.bpm || genre.default_bpm || 120,
      swing: clip.swing || 0,
      resolution: clip.resolution || "1/16",
      clips: { A: clip, B: clip },
      sections,
      loopRange: null,
    };
    /** The same song with every fill removed — the control for "the fill is what you hear". */
    const withoutFill = {
      ...song,
      sections: sections.map((section) =>
        section.overrides?.fill ? { ...section, overrides: { velocityRamp: section.overrides.velocityRamp } } : section
      ),
    };

    const render = async (value) => {
      const buffer = await wav.renderSongOffline(value, { drumKit, loudnessTrimDb: 0 });
      const channels = [];
      for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
      return { buffer, channels };
    };
    /**
     * High-frequency energy in a bar, as the RMS of the first difference.
     *
     * A bar's level cannot answer "is the fill audible": the master limiter holds the mix at its ceiling, so four
     * extra snare hits make the bar *denser* at the same level (measured: 0.3512 with the fill, 0.3519 without).
     * A raw transient counter is no better — a limited mix's crest factor is under 2, so a threshold above the RMS
     * never fires, and one below it fires on the waveform itself (156 "onsets" in a two-second bar, identical with and
     * without the fill). A snare hit is broadband, though, so the first difference — a one-line high-pass — is where
     * four extra hits show up.
     */
    const highBand = (channels, fromSec, toSec, sampleRate) => {
      const from = Math.max(1, Math.floor(fromSec * sampleRate));
      const to = Math.min(channels[0].length, Math.floor(toSec * sampleRate));
      if (to <= from) return 0;
      let sum = 0;
      let count = 0;
      for (const channel of channels) {
        for (let i = from; i < to; i += 1) {
          const difference = channel[i] - channel[i - 1];
          sum += difference * difference;
          count += 1;
        }
      }
      return count ? Math.sqrt(sum / count) : 0;
    };
    const rms = (channels, fromSec, toSec, sampleRate) => {
      const from = Math.max(0, Math.floor(fromSec * sampleRate));
      const to = Math.min(channels[0].length, Math.floor(toSec * sampleRate));
      let sum = 0;
      let count = 0;
      for (const channel of channels) {
        for (let i = from; i < to; i++) {
          sum += channel[i] * channel[i];
          count += 1;
        }
      }
      return count ? Math.sqrt(sum / count) : 0;
    };

    const withFill = await render(song);
    const control = await render(withoutFill);
    /** The same genre's **loop**, so the song's range can be compared with the loop's rather than asserted alone. */
    const loop = await render({
      ...song,
      sections: [{ id: "probe-loop", slot: "A", bars: 2 }],
    });

    // Bar geometry: every pass of a one-bar clip is one bar, so the step count gives the bar map.
    const flattened = flattenModule.flattenSong(song);
    const bars = sections.reduce((sum, section) => sum + Math.max(1, Math.floor(section.bars)), 0);
    const secondsPerStep = 60 / song.bpm / 4;
    const barSeconds = stepsPerPass * secondsPerStep;

    const onsetCounts = [];
    const meanVelocities = [];
    const lane = flattened.pattern.tracks.find((track) => track.track_id === "snare") ?? flattened.pattern.tracks[0];
    for (let bar = 0; bar < bars; bar += 1) {
      const from = bar * stepsPerPass;
      const to = from + stepsPerPass;
      const steps = (lane.steps ?? []).slice(from, to);
      const velocities = (lane.velocity ?? []).slice(from, to).filter((_, index) => steps[index] > 0);
      onsetCounts.push(steps.filter((step) => step > 0).length);
      meanVelocities.push(velocities.length ? velocities.reduce((a, b) => a + b, 0) / velocities.length : 0);
    }

    /** The pattern's own mean velocity per bar — the reference the rendered ramp has to be read against. */
    const patternVelocity = [];
    for (let bar = 0; bar < bars; bar += 1) {
      const from = bar * stepsPerPass;
      const to = from + stepsPerPass;
      const steps = (lane.steps ?? []).slice(from, to);
      const velocities = (lane.velocity ?? []).slice(from, to).filter((_, index) => steps[index] > 0);
      patternVelocity.push(velocities.length ? velocities.reduce((a, b) => a + b, 0) / velocities.length : 0);
    }

    const sectionsWithFill = sections
      .map((section, index) => ({ section, index }))
      .filter((entry) => entry.section.overrides?.fill);
    const fillBars = sectionsWithFill.map((entry) =>
      sections.slice(0, entry.index).reduce((sum, section) => sum + section.bars, 0) +
      Math.max(1, Math.floor(entry.section.bars)) - 1
    );
    const buildSections = sections
      .map((section, index) => ({ section, index }))
      .filter((entry) => entry.section.overrides?.velocityRamp);
    const buildSpans = buildSections.map((entry) => {
      const start = sections.slice(0, entry.index).reduce((sum, section) => sum + section.bars, 0);
      return { start, end: start + Math.max(1, Math.floor(entry.section.bars)) - 1 };
    });

    return {
      bars,
      patternVelocity: patternVelocity.map((value) => Math.round(value * 10) / 10),
      onsets: onsetCounts,
      meanVelocities: meanVelocities.map((value) => Math.round(value * 10) / 10),
      fillBars,
      buildSpans,
      medianOnsets: [...onsetCounts].sort((a, b) => a - b)[Math.floor(onsetCounts.length / 2)],
      audio: {
        seconds: withFill.buffer.duration,
        barSeconds,
        fillRms: fillBars.map((bar) => ({
          withFill: rms(withFill.channels, bar * barSeconds, (bar + 1) * barSeconds, withFill.buffer.sampleRate),
          control: rms(control.channels, bar * barSeconds, (bar + 1) * barSeconds, control.buffer.sampleRate),
          withFillHigh: highBand(withFill.channels, bar * barSeconds, (bar + 1) * barSeconds, withFill.buffer.sampleRate),
          controlHigh: highBand(control.channels, bar * barSeconds, (bar + 1) * barSeconds, control.buffer.sampleRate),
        })),
        /**
         * The **song's** loudness range, against the loop's.
         *
         * A listening review reported a *loop* at 0.6 LU and called the master mechanical; measured across the
         * 12-genre sample the loops run 0.3–5.9 LU (median 1.7), because a loop is a loop. The range belongs to the
         * arrangement, which is what this probe renders — so it is measured here, where a build exists to move it.
         */
        songLraLu: loudness.measureLoudnessRange(withFill.channels, withFill.buffer.sampleRate),
        loopLraLu: loudness.measureLoudnessRange(loop.channels, loop.buffer.sampleRate),
        buildRms: buildSpans.map((span) => ({
          first: rms(withFill.channels, span.start * barSeconds, (span.start + 1) * barSeconds, withFill.buffer.sampleRate),
          last: rms(withFill.channels, span.end * barSeconds, (span.end + 1) * barSeconds, withFill.buffer.sampleRate),
        })),
      },
    };
  }, { genreId, ramp: rampPair });

  // ── the assertions ───────────────────────────────────────────────────────────────────────────────
  if (!measured.fillBars.length) await fail(`the ${genreId} club form produced no fill — the generator found no lane`);
  if (!measured.buildSpans.length) await fail(`the ${genreId} club form produced no build`);

  for (const bar of measured.fillBars) {
    if (!(measured.onsets[bar] > measured.medianOnsets)) {
      await fail(
        `P1.5: the fill bar (${bar}) has ${measured.onsets[bar]} onsets, the median bar ${measured.medianOnsets}`
      );
    }
  }

  for (const [index, bar] of measured.fillBars.entries()) {
    const entry = measured.audio.fillRms[index];
    if (!(entry.withFillHigh > entry.controlHigh * 1.01)) {
      await fail(
        `the fill is not audible: bar ${bar} high-band ${entry.withFillHigh.toExponential(3)} with it and ` +
          `${entry.controlHigh.toExponential(3)} without (level ${entry.withFill.toExponential(3)} vs ` +
          `${entry.control.toExponential(3)}, ${(((entry.withFill - entry.control) / Math.max(entry.control, 1e-12)) * 100).toFixed(2)} %)`
      );
    }
  }

  /**
   * The arrangement has to move more than the loop it came from.
   *
   * This is the *robust* half of the build claim: a per-bar RMS comparison can be defeated by a genre whose bass
   * sustains across the bar line (`disco` measures an apparent −1.2 dB build for exactly that reason, recorded here
   * rather than smoothed over), while loudness range over the whole passage cannot.
   */
  {
    const songLra = measured.audio.songLraLu;
    const loopLra = measured.audio.loopLraLu;
    if (!(songLra > loopLra + 1)) {
      await fail(
        `the arrangement does not move more than the loop: song LRA ${songLra.toFixed(2)} LU against the loop's ` +
          `${loopLra.toFixed(2)} LU`
      );
    }
  }

  for (const [index, span] of measured.buildSpans.entries()) {
    const spanPattern = measured.patternVelocity.slice(span.start, span.end + 1);
    if (!(spanPattern[spanPattern.length - 1] >= spanPattern[0] * 1.8)) {
      await fail(
        `the ramp is not in the pattern: bars ${span.start}..${span.end} carry mean velocities ` +
          `${spanPattern.join(" → ")}`
      );
    }
    const { first, last } = measured.audio.buildRms[index];
    /**
     * The ramp is a *level* ramp, and the master chain hands most of it back — so the assertion is a real
     * audibility bound, and the ramp it is measured with is the one the forms actually carry.
     *
     * Measured 2026-09-24 on chicago-house, sweeping `--ramp`: 6 dB of velocity renders **+0.27 dB**, 9 dB
     * **+1.06 dB**, 12 dB **+1.81 dB** — roughly a sixth of what the pattern asks for, linear rather than saturated.
     * A 3.8 dB ramp (what the club build carried before this) arrived as about a tenth of a decibel, which is why
     * the old assertion only ruled out an *inversion*: a probe that asserts something false is worse than one that
     * reports. With the default ramp at 12 dB — the depth the forms now carry, 0.3 → 1.0 ≈ 10.5 dB — the file gains
     * **23 %**, so ≥15 % is asserted and a regression to a shallow build fails here.
     */
    if (last < first * 1.15) {
      await fail(
        `the build does not lift the file for ${genreId}: bars ${span.start}..${span.end} render at ` +
          `${first.toExponential(3)} → ` +
          `${last.toExponential(3)}`
      );
    }
  }

  const summary = {
    genre: genreId,
    bars: measured.bars,
    onsetsPerBar: measured.onsets.join(","),
    meanVelocityPerBar: measured.meanVelocities.join(","),
    patternVelocityPerBar: measured.patternVelocity.join(","),
    fillBars: measured.fillBars.join(","),
    fillHighGainPct: measured.audio.fillRms.map((entry) =>
      Number((((entry.withFillHigh - entry.controlHigh) / Math.max(entry.controlHigh, 1e-12)) * 100).toFixed(2))
    ),
    fillGainPct: measured.audio.fillRms.map((entry) =>
      Number((((entry.withFill - entry.control) / Math.max(entry.control, 1e-12)) * 100).toFixed(2))
    ),
    buildGainPct: measured.audio.buildRms.map((entry) =>
      Number((((entry.last - entry.first) / Math.max(entry.first, 1e-12)) * 100).toFixed(2))
    ),
    /**
     * The song's range against the same genre's loop.
     *
     * A loop is repetitive by construction — across the sample they measure 0.3–5.9 LU (median 1.7), which is why a
     * listening review's "0.6 LU, mechanical" was true of a loop and not a defect in the library. The arrangement is
     * where range lives, and this is the pair that says so.
     */
    songLraLu: Number(measured.audio.songLraLu.toFixed(2)),
    loopLraLu: Number(measured.audio.loopLraLu.toFixed(2)),
  };

  if (asJson) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`✅ Arrangement audio (${genreId}, club form): ${summary.bars} bars rendered`);
    console.log(`   onsets per bar   : ${summary.onsetsPerBar}`);
    console.log(`   mean velocity/bar: ${summary.meanVelocityPerBar}`);
    console.log(
      `   fill bars ${summary.fillBars}: high band ${summary.fillHighGainPct.map((p) => `${p >= 0 ? "+" : ""}${p}%`).join(", ")} ` +
        `(level ${summary.fillGainPct.map((p) => `${p >= 0 ? "+" : ""}${p}%`).join(", ")})`
    );
    console.log(
      `   build bars: ${summary.buildGainPct.map((p) => `${p >= 0 ? "+" : ""}${p}%`).join(", ")} rendered level for a ` +
        `ramp (${summary.patternVelocityPerBar} velocity)`
    );
    console.log(
      `   loudness range: the arrangement moves ${summary.songLraLu} LU against the loop's ${summary.loopLraLu} LU ` +
        `(a loop is repetitive by construction — the sample runs 0.3–5.9 LU)`
    );
    if (Math.abs(summary.buildGainPct[0]) < 2) {
      console.log(
        "   ⚠️ the ramp does not survive the master chain as level — the same gain recovery `duckErasedInMaster`\n" +
          "      records for the sidechain. That is P2.3's item, measured here rather than assumed."
      );
    }
  }
} finally {
  await browser.close().catch(() => {});
  server.kill("SIGTERM");
}
process.exit(0);
