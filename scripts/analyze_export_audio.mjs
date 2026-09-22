#!/usr/bin/env node
/**
 * Export audio audit — the ten claims, measured on the app's own renders.
 *
 * A listener's report ("clicks on note attack", "harsh hats", "it is mono and dry", "the tail is cut") is a
 * hypothesis about the *audio*, so this turns each one into a number that can be confirmed or refuted on every
 * genre rather than discussed:
 *
 *   A1 clicks        largest sample-to-sample jump (dBFS) and how many jumps stand out from the texture
 *   A2 aliasing      13-band filterbank shape: energy above ~12 kHz relative to the total, plus rolloff band
 *   A3 dynamics      velocity spread in the pattern, and whether velocity reaches gain at all
 *   B1 clipping      4x-oversampled true peak (dBTP), pinned samples, per-genre headroom
 *   B2 hats          8-16 kHz energy share and the spectral centroid, for the hi-hat/percussion content
 *   B3 swing         the pattern's declared swing, and whether any track carries its own offset
 *   C1 space         inter-channel correlation and side energy (is the render effectively mono?),
 *                    plus whether the genre's mix enables the reverb/delay sends at all
 *   C2 tail          RMS and peak of the final milliseconds (a natural decay ends near silence)
 *
 * It renders through `renderPatternOffline` — the app's real offline path, the same one the WAV/MP3 export
 * uses — via the Vite **dev** server, so no test hook ships in the production bundle (the pattern
 * `measure_genre_loudness.mjs` established). The DSP comes from the repo's own tested helpers
 * (`helpers/loudness.ts` for LUFS/true peak, `helpers/timbre.ts` for the band shape, `helpers/audioMetrics.ts`
 * for clicks/clipping/space/tail) — never an inline copy.
 *
 * Usage
 *   node scripts/analyze_export_audio.mjs                      # every genre, export defaults
 *   node scripts/analyze_export_audio.mjs --only=reggaeton,chicago-blues
 *   node scripts/analyze_export_audio.mjs --bars=4             # what a longer render looks like
 *   node scripts/analyze_export_audio.mjs --json               # the raw rows
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name, fallback) => {
  const inline = argv.find((a) => a.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index !== -1 && argv[index + 1] ? argv[index + 1] : fallback;
};

const JSON_OUT = flag("--json");
/**
 * Which tracks get a stem render.
 *
 * All eight per genre would be 8x the render time, and three of them answer every instrument-level claim: the
 * kick (headroom, and whether swing actually reached the audio), the hats (harshness) and the melodic tracks
 * (aliasing).
 */
const STEM_TRACKS = value("--stem-tracks", "kick,hihat,lead,chords")
  .split(",")
  .map((track) => track.trim())
  .filter(Boolean);
const ONLY = value("--only", "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);
/** The **export** default is one bar; `--bars=4` shows what the tail looks like with more material. */
const BARS = Number(value("--bars", "1"));
const PORT = Number(value("--port", "5321"));
const OUT_JSON = value("--out", "scratch/export-audio-audit.json");

function startDevServer() {
  return new Promise((resolve, reject) => {
    const viteBin = path.join(ROOT, "node_modules", "vite", "bin", "vite.js");
    const child = spawn(process.execPath, [viteBin, "--port", String(PORT), "--strictPort"], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(PORT) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const onData = (chunk) => {
      output += chunk.toString();
      if (/Local:\s+http/.test(output) || /ready in/.test(output)) resolve(child);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", reject);
    child.on("exit", (code) => reject(new Error(`vite exited early (${code}):\n${output}`)));
    setTimeout(() => reject(new Error(`vite did not become ready in 60s:\n${output}`)), 60000);
  });
}

/**
 * Render one genre and measure it **inside the page**.
 *
 * The metrics run in the browser because the buffer lives there; only the numbers cross the boundary, so a
 * four-bar stereo render never has to be serialised into Node.
 */
async function measureGenre(page, genreId, bars, soloTracks) {
  return page.evaluate(
    async ({ id, bars: barsArg, soloTracks }) => {
      const [wav, genresModule, mixModule, loudness, timbre, metrics, trackUtils] = await Promise.all([
        import("/src/audio/WavExporter.ts"),
        import("/src/data/genres/index.ts"),
        import("/src/data/genreMix.ts"),
        import("/src/test/helpers/loudness.ts"),
        import("/src/test/helpers/timbre.ts"),
        import("/src/test/helpers/audioMetrics.ts"),
        import("/src/utils/trackUtils.ts"),
      ]);
      const genre = genresModule.ALL_GENRES.find((g) => g.id === id);
      if (!genre) throw new Error(`unknown genre: ${id}`);
      const pattern = genre.sequencer_pattern;
      const drumKit = trackUtils.getDefaultDrumKitForGenre(genre);

      let limiterKind = "fallback";
      const buffer = await wav.renderPatternOffline(pattern, {
        bars: barsArg,
        drumKit,
        onLimiterKind: (kind) => {
          limiterKind = kind;
        },
      });

      const channels = [];
      for (let c = 0; c < buffer.numberOfChannels; c += 1) channels.push(buffer.getChannelData(c));
      const rate = buffer.sampleRate;
      const shape = timbre.fingerprintChannels(channels, rate);

      // The highest three 2/3-octave bands (centres ~8 kHz and up) hold what "harsh" means.
      const bands = shape.bandDb;
      const topShareDb = bands.slice(-3).reduce((acc, db) => acc + 10 ** (db / 10), 0);
      const velocities = pattern.tracks.flatMap((track) => (track.velocity ?? []).filter((_, i) => track.steps[i]));
      const uniqueVelocities = new Set(velocities);
      const mix = mixModule.getGenreMix ? mixModule.getGenreMix(id) : null;

      /**
       * Swing, measured rather than declared: where do the off-16ths actually land?
       *
       * The grid is `60 / bpm / 4` seconds per 16th. An onset in the second half of a beat that sits later than
       * its grid line is the swing a player hears; if every onset is on the grid, the declared `swing` is not
       * reaching the audio.
       */
      const stepSec = 60 / (pattern.bpm || 120) / 4;
      const measureSwing = (stemChannels, rate) => {
        const onsets = metrics.onsetTimesMs(stemChannels, rate);
        const offsets = [];
        for (const ms of onsets) {
          const steps = ms / 1000 / stepSec;
          const nearest = Math.round(steps);
          if (nearest % 2 === 1 && Math.abs(steps - nearest) < 0.35) {
            offsets.push((steps - nearest) * stepSec * 1000);
          }
        }
        if (!offsets.length) return null;
        const mean = offsets.reduce((a, b) => a + b, 0) / offsets.length;
        return { samples: offsets.length, meanOffsetMs: Math.round(mean * 100) / 100 };
      };

      /**
       * Per-track pass: the claims are about *instruments* ("the hats are harsh", "the lead aliases", "the kick
       * gives no headroom"), and a mix-level number cannot tell which track caused it. Each stem is the same
       * pattern with every other track silenced, rendered through the same path.
       */
      const stems = {};
      const stemIds = soloTracks && soloTracks.length ? soloTracks : pattern.tracks.map((t) => t.track_id);
      for (const trackId of stemIds) {
        const solo = {
          ...pattern,
          tracks: pattern.tracks.map((track) =>
            track.track_id === trackId
              ? track
              : {
                  ...track,
                  steps: track.steps.map(() => 0),
                  velocity: track.velocity ? track.velocity.map(() => 0) : undefined,
                  gate: track.gate ? track.gate.map(() => 0) : undefined,
                }
          ),
        };
        let stemBuffer;
        try {
          stemBuffer = await wav.renderPatternOffline(solo, { bars: barsArg, drumKit });
        } catch {
          continue;
        }
        const stemChannels = [];
        for (let c = 0; c < stemBuffer.numberOfChannels; c += 1) stemChannels.push(stemBuffer.getChannelData(c));
        const stemShape = timbre.fingerprintChannels(stemChannels, stemBuffer.sampleRate);
        const stemTop = stemShape.bandDb.slice(-3).reduce((acc, db) => acc + 10 ** (db / 10), 0);
        const onsets = metrics.onsetTimesMs(stemChannels, stemBuffer.sampleRate);
        // Alternating onset intervals: 1.00 is straight 16ths, above 1 is a long-short (swung) pair.
        const intervals = onsets.slice(1).map((ms, i) => ms - onsets[i]).filter((ms) => ms > 20);
        const even = intervals.filter((_, i) => i % 2 === 0);
        const odd = intervals.filter((_, i) => i % 2 === 1);
        const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);
        const meanEven = mean(even);
        const meanOdd = mean(odd);
        stems[trackId] = {
          truePeakDb: loudness.truePeakDbChannels(stemChannels),
          samplePeakDb: metrics.samplePeakDb(stemChannels),
          clippedSamples: metrics.clippedSampleCount(stemChannels),
          centroidHz: stemShape.centroidHz,
          topBandShareDb: 10 * Math.log10(Math.max(stemTop, 1e-12)),
          clicks: metrics.clickAnalysis(stemChannels, stemBuffer.sampleRate, { factor: 6 }),
          onsetCount: onsets.length,
          swingRatio: meanEven && meanOdd ? meanEven / meanOdd : null,
          /** How far the off-16ths sit past their grid line, in ms (0 = straight). */
          swingOffsetMs: measureSwing(stemChannels, stemBuffer.sampleRate)?.meanOffsetMs ?? null,
          swingSamples: measureSwing(stemChannels, stemBuffer.sampleRate)?.samples ?? 0,
        };
      }

      /**
       * The musical claims, which are about the pattern and the mix rather than the signal.
       *
       * A listening report says "every note has the same velocity", "the melody never moves", "there is no
       * swing", "the bass fights the kick", "the mid-range is empty". Each of those is checkable:
       */
      const velocityByTrack = Object.fromEntries(
        pattern.tracks.map((track) => {
          const on = track.steps.map((step, index) => (step ? track.velocity?.[index] ?? 100 : null)).filter((v) => v !== null);
          return [
            track.track_id,
            on.length ? { min: Math.min(...on), max: Math.max(...on), distinct: new Set(on).size, onsets: on.length } : null,
          ];
        })
      );
      const pitchByTrack = Object.fromEntries(
        pattern.tracks
          .filter((track) => track.pitch?.some((p) => p !== null))
          .map((track) => {
            const notes = track.pitch.filter((p) => p !== null);
            return [
              track.track_id,
              { distinct: new Set(notes).size, min: Math.min(...notes), max: Math.max(...notes), changes: notes.filter((p, i) => i > 0 && p !== notes[i - 1]).length },
            ];
          })
      );

      /** Does the bass actually duck when the kick hits? RMS 25 ms after each kick onset vs 25 ms before. */
      const measureDuck = async () => {
        const bassTrack = pattern.tracks.find((t) => t.track_id === "bass");
        const kickTrack = pattern.tracks.find((t) => t.track_id === "kick");
        if (!bassTrack || !kickTrack) return null;
        const soloOf = (track) => ({
          ...pattern,
          tracks: pattern.tracks.map((t) => (t.track_id === track.track_id ? t : { ...t, steps: t.steps.map(() => 0) })),
        });
        const [bassBuf, kickBuf] = await Promise.all([
          wav.renderPatternOffline(soloOf(bassTrack), { bars: barsArg }).catch(() => null),
          wav.renderPatternOffline(soloOf(kickTrack), { bars: barsArg }).catch(() => null),
        ]);
        if (!bassBuf || !kickBuf) return null;
        const bass = bassBuf.getChannelData(0);
        const kick = kickBuf.getChannelData(0);
        const rate = bassBuf.sampleRate;
        const window = Math.round(rate * 0.025);
        const rms = (from, to) => {
          let sum = 0;
          const start = Math.max(0, from);
          const end = Math.min(bass.length, to);
          for (let i = start; i < end; i += 1) sum += bass[i] * bass[i];
          return Math.sqrt(sum / Math.max(1, end - start));
        };
        // Kick onsets: the first sample above half the kick's peak, with a refractory gap of 60 ms.
        const peak = kick.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
        const onsets = [];
        let last = -Infinity;
        for (let i = 0; i < kick.length; i += 1) {
          if (Math.abs(kick[i]) > peak * 0.5 && i - last > rate * 0.06) {
            onsets.push(i);
            last = i;
          }
        }
        if (!onsets.length) return null;
        let before = 0;
        let after = 0;
        for (const at of onsets) {
          before += rms(at - window, at - Math.round(rate * 0.005));
          after += rms(at + Math.round(rate * 0.005), at + window);
        }
        const ratioDb = 20 * Math.log10(after / Math.max(before, 1e-9));
        return { kickOnsets: onsets.length, duckDb: Math.round(ratioDb * 100) / 100 };
      };
      const duck = await measureDuck();

      /** Where the energy sits: the 2/3-octave bands that cover roughly 200 Hz - 2 kHz. */
      const bandCentres = timbre.TIMBRE_BAND_CENTRES_HZ;
      const midBands = bands.map((db, i) => ({ hz: bandCentres[i], db })).filter((b) => b.hz >= 200 && b.hz <= 2000);

      return {
        id,
        musical: {
          velocityByTrack,
          pitchByTrack,
          // Where the off-16ths actually land is measured per stem, in the stem loop below.
          swing: { declared: pattern.swing ?? 0 },
          duck,
          midBandShareDb: 10 * Math.log10(midBands.reduce((acc, b) => acc + 10 ** (b.db / 10), 0)),
          midBands,
          panSends: Object.fromEntries(
            pattern.tracks.map((track) => [
              track.track_id,
              { pan: track.pan ?? 0, sendA: track.sendA ?? 0, sendB: track.sendB ?? 0 },
            ])
          ),
        },
        stems,
        bpm: pattern.bpm,
        bars: barsArg,
        durationSec: buffer.duration,
        sampleRate: rate,
        limiterKind,
        // A1 / A2
        maxStepDb: metrics.maxStepDb(channels),
        medianStepDb: metrics.medianStepDb(channels),
        stepOutliers: metrics.stepOutlierCount(channels),
        clicks: metrics.clickAnalysis(channels, rate, { factor: 6 }),
        centroidHz: shape.centroidHz,
        rolloffBand: shape.rolloffBand,
        topBandShareDb: 10 * Math.log10(Math.max(topShareDb, 1e-12)),
        // B1
        truePeakDb: loudness.truePeakDbChannels(channels),
        samplePeakDb: metrics.samplePeakDb(channels),
        clippedSamples: metrics.clippedSampleCount(channels),
        integratedLufs: loudness.measureLoudness(channels, rate).integratedLufs,
        // C1
        channelCount: buffer.numberOfChannels,
        correlation: channels.length > 1 ? metrics.channelCorrelation(channels[0], channels[1]) : 1,
        sideToMidDb: metrics.sideToMidDb(channels),
        // C2
        tailRmsDb: metrics.tailRmsDb(channels, rate, 50),
        finalPeakDb: metrics.finalPeakDb(channels, rate, 5),
        decayShapeRatio: metrics.decayShapeRatio(channels, rate),
        // A3 / B3 / C1 as *content* facts: what the pattern and the mix actually ask for.
        velocityMin: velocities.length ? Math.min(...velocities) : null,
        velocityMax: velocities.length ? Math.max(...velocities) : null,
        velocityUnique: uniqueVelocities.size,
        declaredSwing: pattern.swing ?? 0,
        tracksWithSwing: pattern.tracks.filter((t) => (t.swing ?? 0) !== 0).length,
        tracksWithPan: pattern.tracks.filter((t) => (t.pan ?? 0) !== 0).length,
        tracksWithReverb: pattern.tracks.filter((t) => (t.sendA ?? 0) > 0).length,
        tracksWithDelay: pattern.tracks.filter((t) => (t.sendB ?? 0) > 0).length,
        mixSends: mix ? Object.keys(mix).filter((key) => /send|reverb|delay/i.test(key)).length : null,
        trackCount: pattern.tracks.length,
      };
    },
    { id: genreId, bars, soloTracks }
  );
}

/**
 * The thresholds a claim has to cross to count as confirmed.
 *
 * They are judgements, so they are written down: every one of them is a statement about what a listener hears,
 * and each has a *control* that must not trip it (a bright hi-hat is not a click; a loud mix is not distortion).
 */
const CLAIMS = {
  /** A discontinuity: a sample 6x (≈ +15.6 dB) above its own local median slew. */
  clicks: (row) => (row.clicks?.count ?? 0) > 0,
  /** Near-Nyquist energy in the hi-hat stem, where "harsh digital fizz" would live. */
  harshHats: (row) => (row.stems?.hihat?.topBandShareDb ?? -99) > -12,
  /** The same for the melodic stems, which is what aliasing sounds like. */
  harshLead: (row) => Math.max(row.stems?.lead?.topBandShareDb ?? -99, row.stems?.chords?.topBandShareDb ?? -99) > -14,
  /** No dynamics at all: every triggered step carries the same velocity. */
  flatVelocity: (row) => (row.velocityUnique ?? 0) <= 1,
  /** A true peak above 0 dBTP is inter-sample clipping by definition. */
  overTruePeak: (row) => row.truePeakDb > 0,
  /** Pinned samples. */
  clipped: (row) => row.clippedSamples > 0,
  /** Effectively mono: nearly identical channels and no side energy worth the name. */
  mono: (row) => row.correlation > 0.98 && row.sideToMidDb < -30,
  /** No send anywhere in the pattern: whatever space there is comes only from the mix defaults. */
  dryPattern: (row) => row.tracksWithReverb === 0 && row.tracksWithDelay === 0,
  /** A tail still at -30 dBFS RMS in its last 50 ms was cut, not decayed. */
  cutTail: (row) => row.tailRmsDb > -30,
  /** Declared swing that the audio does not show: the ratio of alternating intervals stays at 1.00. */
  swingNotAudible: (row) =>
    (row.declaredSwing ?? 0) >= 20 && row.stems?.kick?.swingRatio != null && Math.abs(row.stems.kick.swingRatio - 1) < 0.05,
  /** Hard quantised by design: nothing declares swing. */
  noSwing: (row) => row.declaredSwing === 0 && row.tracksWithSwing === 0,
  /**
   * The musical claims from the listening report, made countable.
   *
   * `flatTracks` counts tracks whose triggered steps all carry **one** velocity — "it sounds like a MIDI dump".
   * The threshold is 4 of 8 because a drum machine legitimately has a fixed kick; it is the *number* of flat
   * tracks that a listener hears as lifeless.
   */
  flatTracks: (row) => {
    const rows = Object.values(row.musical?.velocityByTrack ?? {}).filter(Boolean);
    return rows.length > 0 && rows.filter((v) => v.distinct <= 1).length >= 4;
  },
  /** A declared swing the audio does not show: ≥20 declared, and no offset measurable on the off-16ths. */
  inaudibleSwing: (row) => {
    const declared = row.musical?.swing?.declared ?? 0;
    if (declared < 20) return false;
    const offsets = Object.values(row.stems ?? {})
      .map((stem) => stem.swingOffsetMs)
      .filter((value) => value !== null && value !== undefined);
    if (!offsets.length) return true;
    return Math.max(...offsets.map(Math.abs)) < 3;
  },
  /** The kick and the bass arrive together and nothing ducks: a shallow dip is the same as none. */
  weakDuck: (row) => {
    const duck = row.musical?.duck;
    return Boolean(duck) && duck.kickOnsets > 0 && duck.duckDb > -1.5;
  },
  /** The mid-range is thin: the 200 Hz - 2 kHz bands hold less than the average band's share. */
  thinMids: (row) => (row.musical?.midBandShareDb ?? 0) < -6,
  /** The harmony never moves inside the loop: one chord for the whole pattern. */
  staticHarmony: (row) => {
    const chords = row.musical?.pitchByTrack?.chords;
    return Boolean(chords) && chords.distinct <= 1;
  },
  /** Still effectively mono: correlation this high means the pan in the mix is not reaching the file. */
  narrowStereo: (row) => row.correlation > 0.98,
};

/** A short label for a stem, so the table stays readable. */
const fmt = (value, digits = 1) => (value == null || !Number.isFinite(value) ? "-" : value.toFixed(digits));

(async () => {
  const baseUrl = `http://127.0.0.1:${PORT}`;
  const server = await startDevServer();
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

  const allIds = await page.evaluate(async () => {
    const { ALL_GENRES } = await import("/src/data/genres/index.ts");
    return ALL_GENRES.map((g) => g.id);
  });
  const ids = ONLY.length ? allIds.filter((id) => ONLY.includes(id)) : allIds;
  if (!ids.length) throw new Error("no genres matched");

  const rows = [];
  for (const id of ids) {
    try {
      rows.push(await measureGenre(page, id, BARS, STEM_TRACKS));
    } catch (error) {
      rows.push({ id, error: String(error).slice(0, 200) });
    }
  }

  await browser.close();
  server.kill("SIGTERM");

  const good = rows.filter((row) => !row.error);
  if (!JSON_OUT) {
    console.log("\n🎧 EXPORT AUDIO AUDIT");
    console.log(`   ${good.length}/${rows.length} genres rendered · bars=${BARS} · export defaults\n`);
    console.log(
      "   genre".padEnd(26) +
        "clicks".padEnd(9) +
        "topBand".padEnd(9) +
        "truePk".padEnd(9) +
        "corr".padEnd(7) +
        "tailRms".padEnd(9) +
        "vel".padEnd(9) +
        "swing"
    );
    for (const row of good.slice(0, ONLY.length ? good.length : 12)) {
      console.log(
        `   ${row.id.padEnd(24)}${fmt(row.clicks?.worstDb).padEnd(9)}${row.topBandShareDb.toFixed(1).padEnd(9)}` +
          `${row.truePeakDb.toFixed(2).padEnd(9)}${row.correlation.toFixed(3).padEnd(7)}${row.tailRmsDb.toFixed(1).padEnd(9)}` +
          `${`${row.velocityMin ?? "-"}-${row.velocityMax ?? "-"}(${row.velocityUnique})`.padEnd(9)}${row.declaredSwing}`
      );
    }
    if (!ONLY.length && good.length > 12) console.log(`   … ${good.length - 12} more genres in the JSON`);

    console.log("\n   claim".padEnd(26) + "confirmed".padEnd(12) + "worst");
    for (const [name, test] of Object.entries(CLAIMS)) {
      const hits = good.filter(test);
      let detail = "";
      if (name === "clicks" && hits.length) {
        const row = hits.reduce((a, b) => ((a.clicks?.worstDb ?? 0) > (b.clicks?.worstDb ?? 0) ? a : b));
        detail = `${row.id} worst +${fmt(row.clicks.worstDb)} dB above local floor, ${row.clicks.count} samples`;
      } else if (name === "harshHats" && hits.length) {
        const row = hits.reduce((a, b) => ((a.stems?.hihat?.topBandShareDb ?? -99) > (b.stems?.hihat?.topBandShareDb ?? -99) ? a : b));
        detail = `${row.id} hat top-3 bands ${fmt(row.stems.hihat.topBandShareDb)} dB, centroid ${fmt(row.stems.hihat.centroidHz, 0)} Hz`;
      } else if (name === "harshLead" && hits.length) {
        const row = hits.reduce((a, b) => Math.max(a.stems?.lead?.topBandShareDb ?? -99, a.stems?.chords?.topBandShareDb ?? -99) > Math.max(b.stems?.lead?.topBandShareDb ?? -99, b.stems?.chords?.topBandShareDb ?? -99) ? a : b);
        detail = `${row.id} melodic top-3 bands ${fmt(Math.max(row.stems?.lead?.topBandShareDb ?? -99, row.stems?.chords?.topBandShareDb ?? -99))} dB`;
      } else if (name === "overTruePeak" && hits.length) {
        const row = hits.reduce((a, b) => (a.truePeakDb > b.truePeakDb ? a : b));
        detail = `${row.id} ${fmt(row.truePeakDb, 2)} dBTP`;
      } else if (name === "clipped" && hits.length) {
        const row = hits.reduce((a, b) => (a.clippedSamples > b.clippedSamples ? a : b));
        detail = `${row.id} ${row.clippedSamples} samples pinned`;
      } else if (name === "mono" && hits.length) {
        detail = `${hits.length} genres: correlation \u2265 0.98 with side below -30 dB (e.g. ${hits[0].id})`;
      } else if (name === "cutTail" && hits.length) {
        const row = hits.reduce((a, b) => (a.tailRmsDb > b.tailRmsDb ? a : b));
        detail = `${row.id} ${fmt(row.tailRmsDb)} dBFS in the last 50 ms (final peak ${fmt(row.finalPeakDb)})`;
      } else if (name === "flatVelocity" && hits.length) {
        detail = `${hits.length} genres carry a single velocity, e.g. ${hits[0].id}`;
      } else if (name === "dryPattern" && hits.length) {
        detail = `${hits.length}/${good.length} patterns use no reverb or delay send at all`;
      } else if (name === "swingNotAudible" && hits.length) {
        const row = hits[0];
        detail = `e.g. ${row.id}: declares swing ${row.declaredSwing}, kick intervals ratio ${fmt(row.stems?.kick?.swingRatio, 3)}`;
      }
      console.log(`   ${name.padEnd(24)}${String(hits.length).padEnd(12)}${detail}`);
    }

    // Stem detail for the genres the report named, so the instrument claims have their own line.
    if (ONLY.length) {
      console.log("\n   stem detail (bars=" + BARS + ")");
      for (const row of good) {
        for (const [track, stem] of Object.entries(row.stems ?? {})) {
          console.log(
            `   ${row.id}/${track}`.padEnd(32) +
              `peak ${fmt(stem.truePeakDb, 2)} dBTP`.padEnd(20) +
              `top3 ${fmt(stem.topBandShareDb)} dB`.padEnd(16) +
              `centroid ${fmt(stem.centroidHz, 0)} Hz`.padEnd(20) +
              `clicks ${stem.clicks.count}`.padEnd(12) +
              `onsets ${stem.onsetCount}`.padEnd(12) +
              `swing ${fmt(stem.swingRatio, 3)}`
          );
        }
      }
    }
  }

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify({ bars: BARS, rows }, null, 2));
  if (JSON_OUT) console.log(JSON.stringify({ rows }, null, 2));
  else console.log(`\n   full rows → ${OUT_JSON}`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
