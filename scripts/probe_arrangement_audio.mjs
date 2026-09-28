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
      /**
       * The build carries `riser` as well, because the club form's build step does — that is what A4 asks about: does the top
       * end rise **only** where the arrangement says it should. Without the flag the probe renders the same audio and reports
       * nothing about it.
       */
      { id: "probe-s1", slot: "A", bars: 2, label: "build", overrides: { velocityRamp: ramp, riser: true } },
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

    /**
     * Where a render first makes sound — the only honest way to get a latency.
     *
     * A declared latency is exactly the kind of number that drifts from the measured one, and the difference is inaudible until it is not.
     * The floor is well above the noise a silent graph produces, so the first crossing is the onset rather than a denormal.
     */
    const firstNonZeroMs = (channels, sampleRate, floor = 1e-4) => {
      for (let i = 0; i < (channels[0]?.length ?? 0); i += 1) {
        for (const channel of channels) if (Math.abs(channel[i]) > floor) return Number(((i / sampleRate) * 1000).toFixed(3));
      }
      return null;
    };

    const render = async (value, extra = {}) => {
      const buffer = await wav.renderSongOffline(value, { drumKit, loudnessTrimDb: 0, ...extra });
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

    /**
     * A4's measurement, and it is an A/B rather than a bar comparison.
     *
     * The riser and the velocity ramp occupy the **same** bars (the build step carries both), so comparing "riser bars against
     * the others" measures the ramp — which is why the first attempt read −25.7% and meant nothing. The clean question is what
     * the **texture lane itself** contributes, and the way to ask it is to render the same song **without that lane** and look
     * at the difference per bar. The lane is found the way `songFlatten.textureLanes` finds it (its own regex is not exported,
     * so it is repeated here deliberately, in a probe).
     */
    const textureLaneIds = (tracks) =>
      tracks
        .filter((track) =>
          /(^|[^a-z])(fx|riser|texture|sweep|noise)([^a-z]|$)/.test(`${track.track_id ?? ""} ${track.name ?? ""}`)
        )
        .map((track) => track.track_id);
    const withoutTextureLane = (source) => {
      const clips = { ...(source.clips ?? {}) };
      for (const [slot, pattern] of Object.entries(clips)) {
        if (!pattern?.tracks) continue;
        const drop = new Set(textureLaneIds(pattern.tracks));
        if (drop.size === 0) continue;
        clips[slot] = { ...pattern, tracks: pattern.tracks.filter((track) => !drop.has(track.track_id)) };
      }
      return { ...source, clips };
    };
    const noTexture = await render(withoutTextureLane(song));

    /**
     * Stage 3's criterion, measured with the app's own counter: does a fade at the section boundaries move the discontinuity
     * count, and does it leave a song with no jumps alone?
     *
     * `clickAnalysis` is the function `analyze_audio` counts discontinuities with (`src/test/helpers/audioMetrics.ts:207`,
     * imported by `mcp/render/worker.ts`), so this is the same number the composers saw rather than a second implementation.
     * The two renders differ by exactly one option.
     */
    const metrics = await import("/src/test/helpers/audioMetrics.ts");
    const discontinuities = (channels, rate) => metrics.clickAnalysis(channels, rate).count;
    /**
     * A **small** song for this pair, because the club form is minutes of audio per render and five of them outran the probe's
     * own timeout. Two sections whose second one **mutes the drums** is a hard jump at a known step, which is what the fade is
     * for, at a fraction of the weight.
     */
    const jumpSong = {
      ...song,
      sections: [
        { id: "probe-jump-a", slot: "A", bars: 2 },
        { id: "probe-jump-b", slot: "A", bars: 2, mute: ["kick", "snare", "hihat", "percussion"] },
      ],
    };
    /**
     * Workstream 6's second prerequisite, first row: what the FX rack costs in latency.
     *
     * `bypassFxRack` exists as a diagnostic in the exporter, so the same song can be measured with and without it — and comparing the two
     * onsets is the rack's contribution rather than an impression of it. Every other effect in the chain (the master limiter, the channel
     * strip) is in both renders, so what differs is the rack.
     */
    const withRack = await render(jumpSong);
    const withoutRack = await render(jumpSong, { bypassFxRack: true });
    const latency = {
      withRackMs: firstNonZeroMs(withRack.channels, withRack.buffer.sampleRate),
      withoutRackMs: firstNonZeroMs(withoutRack.channels, withoutRack.buffer.sampleRate),
      sampleRate: withRack.buffer.sampleRate,
    };

    /**
     * The fourth report's second item, measured rather than quoted.
     *
     * The report names a −8 dB phase null at 38 Hz when two sub kicks are stacked, and cites `src/dsp/kickEngine.ts` — a file that does not exist, so its
     * number has no source here. The engine's own API is what makes the claim testable: `synthesizeAnatomyKickVoice` schedules **one voice into a context
     * the caller owns**, so two calls with two presets and the same destination *are* the stacking.
     *
     * The two presets are the ones the report names: `berlin-orphic` at `basePitch: 42` and `somatic-808-gravity` at `basePitch: 36`. Six hertz apart, so
     * their overlap sits right where the report puts the notch.
     *
     * The criterion was written before this code: band energy 30–45 Hz over the first 60 ms, classified as **cancellation** below −1 dB against the louder
     * single, **reinforcement** above +1 dB, and **inconclusive** in between — because two signals that differ this much in level can make a window-energy
     * comparison about level rather than phase.
     */
    /**
     * **The audio lane's own latency**, measured with a synthetic impulse (owner decision 2026-09-28, the read-only slice's last step).
     *
     * The catalogue ships empty, so there is no real sample to decode — but the question does not need one: "which frame does the scheduling path put the sound at"
     * has nothing to do with what the sample contains. So an impulse at frame 0 is handed to the **real scheduler and the real adapter** through a fake loader
     * (bypassing decode, which is asynchronous byte-fetching rather than a scheduling delay), and the first non-zero frame of the render says where the audio path put
     * it. Expected: exactly where it was asked to be, because `AudioBufferSourceNode.start(when)` is specified to begin exactly then.
     *
     * A zero here is a **result**, not a non-event: the row this feeds says "no compensation, because the start is exact by specification", rather than a
     * compensation invented to fill a table.
     *
     * Wrapped like its neighbours: it prints a number or it prints why it could not.
     */
    const audioLaneLatency = await (async () => {
      try {
        const [scheduler, graph] = await Promise.all([
          import("/src/audio/audioLaneScheduler.ts"),
          import("/src/audio/browserSampleGraph.ts"),
        ]);
        const sampleRate = 44100;
        const atSeconds = 0.5;
        const frames = Math.round(sampleRate * 1);
        const context = new OfflineAudioContext(1, frames, sampleRate);
        const impulse = context.createBuffer(1, 64, sampleRate);
        impulse.getChannelData(0)[0] = 1;

        const asset = { assetId: "probe-impulse", name: "Probe impulse", kind: "one-shot", seconds: 0.01 };
        const loader = { load: async () => impulse, decodes: () => 0 };
        const plan = {
          clips: { A: { tracks: [{ track_id: "audio", name: "Probe", sample: { assetId: "probe-impulse" } }] } },
          sections: [{ id: "probe", slot: "A", bars: 1 }],
          boundaries: [0],
          bpm: 120,
        };
        const report = await scheduler.scheduleAudioLaneSamples(
          plan,
          loader,
          graph.browserSampleSink(context, context.destination),
          0,
          [asset]
        );
        const rendered = await context.startRendering();
        const channel = rendered.getChannelData(0);
        let first = -1;
        for (let i = 0; i < channel.length; i += 1) {
          if (Math.abs(channel[i]) > 1e-4) {
            first = i;
            break;
          }
        }
        return {
          atSeconds,
          scheduled: report.scheduled,
          firstNonZeroFrame: first,
          latencyMs: first < 0 ? null : Number((((first / sampleRate) - atSeconds) * 1000).toFixed(4)),
          problems: report.problems.length,
        };
      } catch (error) {
        return { error: String(error && error.message ? error.message : error) };
      }
    })();

    /**
     * **Chunked rendering, measured before it is built** (fifth report P0, sixth report VI).
     *
     * The design under test: a chunk is **a song with a subset of its sections** — no step slicing, no new exporter option — so this needs no production change to
     * measure. What it must answer is whether the parts add up to the whole, and the suspicion is already named: the master chain is **stateful** (the bus
     * compressor has an envelope, the limiter has lookahead), so a chunk that masters itself is only ever approximate.
     *
     * So the measurement pins the fork rather than a hope: it renders the song whole, then renders it one section at a time with the same master settings, and
     * reports how far apart the concatenation and the whole are. If the difference is at the level of the state, the answer is the design already chosen — master
     * once, **after** concatenation — and this number is what justifies building it rather than assuming it.
     *
     * Wrapped so that a failure here cannot take the run down: it prints a number or it prints why it could not.
     */
    const chunking = await (async () => {
      try {
        const parts = song.sections ?? [];
        if (parts.length < 2) return { skipped: `only ${parts.length} section(s) in this fixture` };
        const whole = await render(song, {});
        const pieces = [];
        for (let index = 0; index < parts.length; index += 1) {
          // A section-level chunk: the same song with one section. This is the cut `planRenderChunks` generalises to bars.
          const piece = await render(
            { ...song, id: `${song.id}-chunk-${index}`, sections: [parts[index]] },
            {}
          );
          pieces.push(piece.channels);
        }
        const channels = whole.channels.length;
        const wholeSamples = whole.channels[0].length;
        let chunkSamples = 0;
        for (const piece of pieces) chunkSamples += piece[0].length;
        let maxAbsDiff = 0;
        let sumAbsDiff = 0;
        let compared = 0;
        const limit = Math.min(wholeSamples, chunkSamples);
        // Compare sample by sample where the two have the same length: an offset would show up as a huge difference, which is itself the finding.
        let at = 0;
        for (const piece of pieces) {
          for (let i = 0; i < piece[0].length && at + i < limit; i += 1) {
            for (let c = 0; c < channels; c += 1) {
              const diff = Math.abs(piece[c][i] - whole.channels[c][at + i]);
              if (diff > maxAbsDiff) maxAbsDiff = diff;
              sumAbsDiff += diff;
              compared += 1;
            }
          }
          at += piece[0].length;
        }
        /**
         * **Variant two: masterless chunks, with every tail but the last trimmed.**
         *
         * The first number said why both halves are needed. The extra length is the genre's reverb/delay tail, which every render carries, so `extra / (chunks - 1)`
         * **is** the tail length — the measurement supplies the constant rather than the code declaring one. And the sample-level disagreement says per-chunk
         * mastering is unusable, so the chunks here go out with no trim, no makeup and no bus compressor. The limiter cannot be switched off (no such option), so
         * whatever difference remains **is** the limiter's own state — which is exactly the number that decides whether "master once, after concatenation" is
         * achievable this way or needs a masterless path through the graph.
         */
        const masterless = { loudnessTrimDb: 0, masterMakeupDb: 0, masterBusCompEnabled: false };
        const lean = [];
        for (let index = 0; index < parts.length; index += 1) {
          const piece = await render({ ...song, id: `${song.id}-lean-${index}`, sections: [parts[index]] }, masterless);
          lean.push(piece.channels);
        }
        const leanSamples = lean.reduce((sum, piece) => sum + piece[0].length, 0);
        const extra = leanSamples - wholeSamples;
        const tailFrames = parts.length > 1 ? Math.max(0, Math.round(extra / (parts.length - 1))) : 0;
        const kept = lean.map((piece, index) =>
          index === lean.length - 1 ? piece : piece.map((channel) => channel.subarray(0, Math.max(0, channel.length - tailFrames)))
        );
        const keptSamples = kept.reduce((sum, piece) => sum + piece[0].length, 0);
        let leanMax = 0;
        let leanSum = 0;
        let leanCompared = 0;
        let leanAt = 0;
        for (const piece of kept) {
          const frames = Math.min(piece[0].length, Math.max(0, wholeSamples - leanAt));
          for (let i = 0; i < frames; i += 1) {
            for (let c = 0; c < channels; c += 1) {
              const diff = Math.abs(piece[c][i] - whole.channels[c][leanAt + i]);
              if (diff > leanMax) leanMax = diff;
              leanSum += diff;
              leanCompared += 1;
            }
          }
          leanAt += piece[0].length;
        }

        /**
         * **Variant three: overlapping renders.**
         *
         * The finding it tests is that state crosses the boundary — chunk one's reverb decays into the start of chunk two in the whole render, while a chunk
         * rendered alone starts dry. So a chunk is rendered here with the **previous section in front of it**, and everything before the chunk's own start is
         * discarded. That lead-in is what carries the reverb, the limiter and the compressor into the chunk.
         *
         * Note what this does **not** need: step slicing. A chunk is still "a song with a subset of its sections", just with one extra section at the front — so
         * the simplification survives, which is not what I expected when I recorded the correction.
         */
        const overlapped = [];
        for (let index = 0; index < parts.length; index += 1) {
          const ownFrames = lean[index][0].length;
          if (index === 0) {
            overlapped.push(lean[index].map((channel) => channel.subarray(0, ownFrames)));
            continue;
          }
          const lead = await render(
            { ...song, id: `${song.id}-lead-${index}`, sections: [parts[index - 1], parts[index]] },
            masterless
          );
          overlapped.push(lead.channels.map((channel) => channel.subarray(Math.max(0, channel.length - ownFrames))));
        }
        const overSamples = overlapped.reduce((sum, piece) => sum + piece[0].length, 0);
        let overMax = 0;
        let overSum = 0;
        let overCompared = 0;
        let overAt = 0;
        for (const piece of overlapped) {
          const frames = Math.min(piece[0].length, Math.max(0, wholeSamples - overAt));
          for (let i = 0; i < frames; i += 1) {
            for (let c = 0; c < channels; c += 1) {
              const diff = Math.abs(piece[c][i] - whole.channels[c][overAt + i]);
              if (diff > overMax) overMax = diff;
              overSum += diff;
              overCompared += 1;
            }
          }
          overAt += piece[0].length;
        }

        /**
         * **Where the difference lives**, which the three variants could not say.
         *
         * All three reported max ≈ 1.7 and a small mean, and the overlap — which carries the boundary state across — was no better. A difference concentrated at
         * **each render's own start** (a limiter attack, where a whole-song render has only one) produces exactly that: a big max, a small mean, and no improvement
         * from a lead-in. So each lean chunk's own frames are split into a head, a middle and a tail of roughly 50 ms, and the difference is reported per segment.
         *
         * The head winning means a start trim settles it; spread evenly across the tail and middle means the state hypothesis stands. A number that cannot separate
         * the two cases cannot decide between them — which is the whole reason this block exists rather than another variant.
         */
        const window50 = Math.round(0.05 * (whole.buffer.sampleRate || 44100));
        const segments = { head: { max: 0, sum: 0, n: 0 }, middle: { max: 0, sum: 0, n: 0 }, tail: { max: 0, sum: 0, n: 0 } };
        let segAt = 0;
        for (const piece of lean) {
          const frames = Math.min(piece[0].length, Math.max(0, wholeSamples - segAt));
          for (let i = 0; i < frames; i += 1) {
            const where = i < window50 ? "head" : i >= frames - window50 ? "tail" : "middle";
            for (let c = 0; c < channels; c += 1) {
              const diff = Math.abs(piece[c][i] - whole.channels[c][segAt + i]);
              if (diff > segments[where].max) segments[where].max = diff;
              segments[where].sum += diff;
              segments[where].n += 1;
            }
          }
          segAt += piece[0].length;
        }
        const segmentReport = Object.fromEntries(
          Object.entries(segments).map(([name, value]) => [
            name,
            { max: Number(value.max.toExponential(3)), mean: Number((value.sum / Math.max(1, value.n)).toExponential(3)), samples: value.n },
          ])
        );

        return {
          sections: parts.length,
          wholeSamples,
          segments: segmentReport,
          chunkSamples,
          lengthRatio: Number((chunkSamples / Math.max(1, wholeSamples)).toFixed(4)),
          maxAbsDiff: Number(maxAbsDiff.toExponential(3)),
          meanAbsDiff: Number((sumAbsDiff / Math.max(1, compared)).toExponential(3)),
          compared,
          tailFrames,
          leanLengthRatio: Number((keptSamples / Math.max(1, wholeSamples)).toFixed(4)),
          leanMaxAbsDiff: Number(leanMax.toExponential(3)),
          leanMeanAbsDiff: Number((leanSum / Math.max(1, leanCompared)).toExponential(3)),
          leanCompared,
          overlapLengthRatio: Number((overSamples / Math.max(1, wholeSamples)).toFixed(4)),
          overlapMaxAbsDiff: Number(overMax.toExponential(3)),
          overlapMeanAbsDiff: Number((overSum / Math.max(1, overCompared)).toExponential(3)),
          overlapCompared: overCompared,
        };
      } catch (error) {
        return { error: String(error && error.message ? error.message : error) };
      }
    })();

    const kickPhase = await (async () => {
      const kick = await import("/src/audio/AnatomyKickEngine.ts");
      const sampleRate = 44100;
      const frames = Math.round(sampleRate * 0.5);
      const renderPresets = async (presetIds) => {
        const ctx = new OfflineAudioContext(1, frames, sampleRate);
        const dest = ctx.createGain();
        dest.connect(ctx.destination);
        for (const presetId of presetIds) kick.synthesizeAnatomyKickVoice(ctx, dest, 0, 1, presetId, null);
        const buffer = await ctx.startRendering();
        return buffer.getChannelData(0);
      };
      /** Energy at one frequency over the first `ms`, by Goertzel: narrow enough to see a notch, cheap enough to run in a probe. */
      const toneEnergy = (samples, frequency, ms) => {
        const n = Math.min(samples.length, Math.round((ms / 1000) * sampleRate));
        const coeff = 2 * Math.cos((2 * Math.PI * frequency) / sampleRate);
        let s1 = 0;
        let s2 = 0;
        for (let i = 0; i < n; i += 1) {
          const s0 = samples[i] + coeff * s1 - s2;
          s2 = s1;
          s1 = s0;
        }
        return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - coeff * s1 * s2)) / Math.max(1, n);
      };
      const band = (samples) => {
        let sum = 0;
        let count = 0;
        for (let f = 30; f <= 45; f += 1) {
          sum += toneEnergy(samples, f, 60) ** 2;
          count += 1;
        }
        return Math.sqrt(sum / count);
      };

      const A = await renderPresets(["berlin-orphic"]);
      const B = await renderPresets(["somatic-808-gravity"]);
      const AB = await renderPresets(["berlin-orphic", "somatic-808-gravity"]);
      const eA = band(A);
      const eB = band(B);
      const eAB = band(AB);
      const louder = Math.max(eA, eB);
      const ratio = louder > 0 ? eAB / louder : 0;
      const at38 = Math.max(toneEnergy(A, 38, 60), toneEnergy(B, 38, 60));
      return {
        presetA: "berlin-orphic (basePitch 42)",
        presetB: "somatic-808-gravity (basePitch 36)",
        band30to45: { a: eA, b: eB, ab: eAB },
        ratioToLouderDb: Number((20 * Math.log10(Math.max(ratio, 1e-9))).toFixed(2)),
        notch38Db: at38 > 0 ? Number((20 * Math.log10(Math.max(toneEnergy(AB, 38, 60) / at38, 1e-9))).toFixed(2)) : null,
        verdict: ratio < 0.891 ? "cancellation" : ratio > 1.122 ? "reinforcement" : "inconclusive",
      };
    })();


    const withoutFade = await render(jumpSong, { boundaryFadeMs: 0 });
    const withFade = await render(jumpSong, { boundaryFadeMs: 8 });
    /**
     * The **local** criterion, because the whole-file count cannot see an edit this small: four bars of house carry ~1200 of
     * their own transients (CI measured 1211 → 1206 for an 8 ms fade, −0.4%), so a number about the entire render says nothing
     * about twenty milliseconds of it. This measures the click itself — the largest sample-to-sample step inside ±10 ms of the
     * boundary — and the same window on a boundary with **no** jump, where the fade must be a no-op.
     */
    const boundaryStep = 32; // two bars of sixteen steps, then the second section starts
    const windowStep = (channels, sampleRate, atSample, ms) => {
      const half = Math.max(1, Math.round((ms / 1000) * sampleRate));
      const from = Math.max(1, atSample - half);
      const to = Math.min(channels[0].length - 1, atSample + half);
      let worst = 0;
      for (const channel of channels) {
        for (let i = from; i <= to; i += 1) worst = Math.max(worst, Math.abs(channel[i] - channel[i - 1]));
      }
      return worst;
    };
    const atBoundary = (result) =>
      Math.round(boundaryStep * (60 / jumpSong.bpm / 4) * result.buffer.sampleRate);
    /** Two identical sections: their boundary is not a jump, so the fade has nothing to remove. */
    const smoothSong = {
      ...jumpSong,
      sections: [jumpSong.sections[0], { ...jumpSong.sections[0], id: "probe-smooth-b" }],
    };
    const smoothWithout = await render(smoothSong, { boundaryFadeMs: 0 });
    const smoothWith = await render(smoothSong, { boundaryFadeMs: 8 });
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
    /**
     * The bars the arrangement marks as a **riser**, which is A4's question: does the top end rise only where the
     * arrangement says it should?
     *
     * The club form's build step carries both a `velocityRamp` and `riser: true`, so these spans overlap the build's — which
     * is the point (the riser is what the build asks for on top of the ramp), and why they are reported side by side rather than
     * merged. The band measure here is the same first-difference high band the fill check uses: a **proxy** for "top end", not
     * the plan's three bands. It answers whether the arranged bars gain top end at all before anyone extends it.
     */
    const riserSpans = sections
      .map((section, index) => ({ section, index }))
      .filter((entry) => entry.section.overrides?.riser)
      .map((entry) => {
        const start = sections.slice(0, entry.index).reduce((sum, section) => sum + section.bars, 0);
        return { start, end: start + Math.max(1, Math.floor(entry.section.bars)) - 1 };
      });
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
        riserBars: riserSpans.flatMap((span) => {
          const out = [];
          for (let bar = span.start; bar < span.end; bar += 1) out.push(bar);
          return out;
        }),
        riserHigh: riserSpans.flatMap((span) => {
          const out = [];
          for (let bar = span.start; bar < span.end; bar += 1) {
            out.push(highBand(withFill.channels, bar * barSeconds, (bar + 1) * barSeconds, withFill.buffer.sampleRate));
          }
          return out;
        }),
        otherHigh: (() => {
          const riser = new Set(
            riserSpans.flatMap((span) => {
              const out = [];
              for (let bar = span.start; bar < span.end; bar += 1) out.push(bar);
              return out;
            })
          );
          const out = [];
          for (let bar = 0; bar < bars; bar += 1) {
            if (riser.has(bar)) continue;
            out.push(highBand(withFill.channels, bar * barSeconds, (bar + 1) * barSeconds, withFill.buffer.sampleRate));
          }
          return out;
        })(),
        /**
         * The texture lane's own contribution to the top end, per bar: the same song rendered without it.
         *
         * A positive number in the bars the arrangement marks as a riser, and ~0% elsewhere, is A4's exit criterion measured
         * rather than asserted.
         */
        textureDelta: (() => {
          const perBar = [];
          for (let bar = 0; bar < bars; bar += 1) {
            const withLane = highBand(withFill.channels, bar * barSeconds, (bar + 1) * barSeconds, withFill.buffer.sampleRate);
            const withoutLane = highBand(noTexture.channels, bar * barSeconds, (bar + 1) * barSeconds, noTexture.buffer.sampleRate);
            perBar.push(withoutLane > 0 ? (withLane / withoutLane - 1) * 100 : 0);
          }
          return { perBar };
        })(),
        /** Stage 3: the same song, faded at its boundaries or not, counted with the app's own discontinuity counter. */
        boundaryFade: {
          /** Whole-file counts, for context only — dominated by the music's own transients. */
          without: discontinuities(withoutFade.channels, withoutFade.buffer.sampleRate),
          with: discontinuities(withFade.channels, withFade.buffer.sampleRate),
          /** The click itself, ±10 ms around the jump, before and after the fade. */
          clickWithout: windowStep(withoutFade.channels, withoutFade.buffer.sampleRate, atBoundary(withoutFade), 10),
          clickWith: windowStep(withFade.channels, withFade.buffer.sampleRate, atBoundary(withFade), 10),
          /** The control: the same window on a boundary with no jump, where the fade must change nothing. */
          clickSmoothWithout: windowStep(smoothWithout.channels, smoothWithout.buffer.sampleRate, atBoundary(smoothWithout), 10),
          clickSmoothWith: windowStep(smoothWith.channels, smoothWith.buffer.sampleRate, atBoundary(smoothWith), 10),
          /**
           * The control — two identical sections back to back, where a fade must change nothing — is `--control`, run
           * separately: the club form plus this pair was seven full renders in one page, which took the browser down.
           */
          ...(control
            ? (() => {
                const sameTwice = {
                  ...song,
                  sections: [song.sections[0], { ...song.sections[0], id: "probe-same" }],
                };
                return {};
              })()
            : {}),
        },
        /** The FX rack's latency, measured as the difference between two renders of the same song. */
        latency,
        /** Item 2: two stacked sub kicks against each alone, over the window the report's claim is about. */
        kickPhase,
        chunking,
        audioLaneLatency,
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
    console.log(
      `   fx rack latency  : first sound at ${measured.audio.latency.withoutRackMs} ms bypassed vs ` +
        `${measured.audio.latency.withRackMs} ms with the rack (${measured.audio.latency.sampleRate} Hz)`
    );
    {
      const k = measured.audio.kickPhase;
      const ok = k.verdict !== "inconclusive";
      console.log(
        `   ${k.verdict === "cancellation" ? "❌" : k.verdict === "reinforcement" ? "✅" : "⚠️"} kick stacking : ` +
          `${k.band30to45.a.toExponential(3)} (${k.presetA.split(" ")[0]}) · ${k.band30to45.b.toExponential(3)} (${k.presetB.split(" ")[0]}) · ` +
          `${k.band30to45.ab.toExponential(3)} stacked = ${k.ratioToLouderDb >= 0 ? "+" : ""}${k.ratioToLouderDb} dB vs the louder single, ` +
          `38 Hz ${k.notch38Db >= 0 ? "+" : ""}${k.notch38Db} dB → ${k.verdict}`
      );
      if (!ok) console.log("   (inconclusive: the two singles differ enough in level that this window cannot separate phase from gain)");
    }
    {
      const l = measured.audio.audioLaneLatency ?? { error: "not collected" };
      console.log(
        l.error
          ? `   ⚠️ audio lane path : could not measure (${l.error})`
          : `   audio lane path  : asked at ${l.atSeconds}s, first sound at frame ${l.firstNonZeroFrame} → **${l.latencyMs} ms** of its own latency (${l.scheduled} sample(s) scheduled, ${l.problems} problem(s))`
      );
    }
    {
      const c = measured.audio.chunking ?? { error: "not collected" };
      console.log(
        c.error
          ? `   ⚠️ chunked vs whole : could not measure (${c.error})`
          : c.skipped
            ? `   ⚠️ chunked vs whole : ${c.skipped}`
            : `   chunked vs whole : ${c.sections} sections · length ${c.lengthRatio}x · max |Δ| ${c.maxAbsDiff} · mean |Δ| ${c.meanAbsDiff} (${c.compared} samples)\n` +
              `   lean chunks      : tail ${c.tailFrames} frames trimmed · length ${c.leanLengthRatio}x · max |Δ| ${c.leanMaxAbsDiff} · mean |Δ| ${c.leanMeanAbsDiff} (${c.leanCompared} samples)` +
              `\n   overlap chunks   : length ${c.overlapLengthRatio}x · max |Δ| ${c.overlapMaxAbsDiff} · mean |Δ| ${c.overlapMeanAbsDiff} (${c.overlapCompared} samples)` +
              (c.segments ? `\n   where the diff is: head max ${c.segments.head.max} mean ${c.segments.head.mean} · mid max ${c.segments.middle.max} mean ${c.segments.middle.mean} · tail max ${c.segments.tail.max} mean ${c.segments.tail.mean}` : "")
      );
    }
    {
      const fade = measured.audio.boundaryFade;
      console.log(
        `   boundary click   : worst step within ±10 ms of the jump ${fade.clickWithout.toExponential(2)} → ${fade.clickWith.toExponential(2)}` +
          ` · no-jump control ${fade.clickSmoothWithout.toExponential(2)} → ${fade.clickSmoothWith.toExponential(2)}`
      );
      console.log(
        `   boundary fade    : discontinuities ${fade.without} → ${fade.with} with an 8 ms fade` +
          (fade.smoothWith === undefined ? "" : ` · control (no jumps) ${fade.smoothWithout} → ${fade.smoothWith}`)
      );
    }
    if (measured.audio.textureDelta) {
      console.log(
        `   texture lane A/B : top-end proxy ${measured.audio.textureDelta.perBar
          .map((value, bar) => `bar ${bar} ${value >= 0 ? "+" : ""}${value.toFixed(1)}%`)
          .join(", ")}`
      );
    }
    if (measured.audio.riserBars.length > 0) {
      const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
      const relative = mean(measured.audio.otherHigh) > 0
        ? (mean(measured.audio.riserHigh) / mean(measured.audio.otherHigh) - 1) * 100
        : 0;
      console.log(
        `   riser bars ${measured.audio.riserBars.join(", ")}: top-end proxy ${relative >= 0 ? "+" : ""}${relative.toFixed(1)}% ` +
          `against the other bars (one high band; the plan's three-band split is still to come)`
      );
    }
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
