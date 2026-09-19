#!/usr/bin/env node
/**
 * Why do two repeats of the *same* genre render differ, when the renderer is seeded?
 *
 *   node scripts/diagnose_repeat_determinism.mjs [genreId] [repeats]
 *
 * ## What this found (kept so the next run does not have to rediscover it)
 *
 * Measured on `chicago-house`, 3 repeats in one page, hashing the raw float samples:
 *
 *   repeat 0: sampleHash=fde40084  rmsDb=-9.503720
 *   repeat 1: sampleHash=4763563d  rmsDb=-9.503711
 *   repeat 2: sampleHash=0f01baf5  rmsDb=-9.467722   -> 3 distinct hashes
 *
 * So the **audio itself really differs**; it is not the fingerprint amplifying float noise in a
 * quiet band. The shape of the difference is what makes it interpretable: overall RMS differs by
 * 0.036 dB, bands 6-10 (roughly 500 Hz - 4 kHz) differ by 0.6-1.3 dB, and the *loudest* bands 0-4
 * differ by only 0.02-0.04 dB. A gain difference would move every band by the same number of dB, so
 * this is a **midrange content** change, not a level change.
 *
 * ## Ruled out by measurement, not by reading code
 *
 *  - **per-track**: all eight tracks rendered alone (others zeroed) are UNSTABLE, so no single voice
 *    is responsible;
 *  - **per-stage**: dry (`sendA=sendB=0`), reverb-only and delay-only are all UNSTABLE, so no send
 *    bus is responsible;
 *  - **probability**: neither probed genre has any `probability` array, and the exporter rolls it
 *    from `probabilityPasses()` with a seed derived from `genre_id|bpm|totalSteps`;
 *  - **reverb IR randomness**: `ReverbBus` uses fixed constant seeds and `noise.ts` is a pure LCG;
 *  - **limiter worklet race**: `WavExporter` awaits `graph.limiter.ready` before `startRendering()`.
 *
 * That leaves the master chain every dry render still passes through (master limiter / master
 * saturator / channel strips) or module-level state. The smallest next experiment is to bypass the
 * limiter and re-run: stable means the limiter, still unstable means look at the saturator and the
 * module-level caches.
 *
 * ## Why it matters
 *
 * "Exporting the same project twice gives the same file" is one of this project's central claims,
 * and both audio gates' threshold justifications rest on the repeat noise floor being ~0
 * (`check_timbre_spread.mjs` cites 0.000014 dB). The pre-existing baseline recorded 1.317172 dB for
 * this genre and the post-per-hit-variation one 1.317833 dB, so this predates the drum work and is
 * not a measurement artifact of it.
 */
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const ROOT = process.cwd();

const args = process.argv.slice(2);
const trialArg = args.find((a) => a.startsWith("--limiter-trials="));
const limiterTrials = trialArg ? Math.max(1, Number(trialArg.split("=")[1]) || 1) : 0;
const diffArg = args.find((a) => a.startsWith("--diff-trials="));
const diffTrials = diffArg ? Math.max(2, Number(diffArg.split("=")[1]) || 2) : 0;
const barsArg = args.find((a) => a.startsWith("--bars="));
const diffBars = barsArg ? Math.max(1, Number(barsArg.split("=")[1]) || 1) : 1;
const primitives = args.includes("--primitives");
const streamArg = args.find((a) => a.startsWith("--stream="));
const streamTrials = streamArg ? Math.max(2, Number(streamArg.split("=")[1]) || 2) : 0;
const streamBars = diffBars;
const positional = args.filter((a) => !a.startsWith("--"));
const genreId = positional[0] ?? "chicago-house";
const repeats = Math.max(2, Number(positional[1] ?? 4) || 4);
const port = 3161;

/**
 * `--limiter-trials=N` measures one thing and exits: how often `AudioWorklet.addModule` fails for
 * the master limiter in a fresh `OfflineAudioContext`.
 *
 * This is the hypothesis the sample evidence points at. The two observed bounce outputs are fixed
 * values (the band deltas repeat to five decimals across independent runs), so the renderer picks
 * between two discrete paths rather than adding noise; whichever genre is rendering when the rare
 * event fires is the one that looks unstable; and a worklet load that fails makes `ready` resolve
 * `"fallback"`, which swaps a lookahead true-peak limiter for a `DynamicsCompressor`.
 *
 * The rate is far too low to catch by re-rendering (about 1 render in 200), so this drives the
 * limiter alone, where a trial costs milliseconds instead of seconds.
 */

function startDevServer() {
  return new Promise((resolve, reject) => {
    const viteBin = path.join(ROOT, "node_modules/vite/bin/vite.js");
    const child = spawn(process.execPath, [viteBin, "--port", String(port), "--strictPort"], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const onData = (chunk) => {
      output += chunk.toString();
      if (/Local:\s+http/.test(output) || /ready in/.test(output)) resolve(child);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => reject(new Error(`vite exited early (${code}):\n${output}`)));
    setTimeout(() => reject(new Error(`vite did not become ready in 60s:\n${output}`)), 60000);
  });
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`dev server never answered at ${url}`);
}

const server = await startDevServer();
const baseUrl = `http://127.0.0.1:${port}`;
await waitForServer(baseUrl);
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage();
/**
 * Warnings included, not just errors.
 *
 * The limiter's worklet-install failure path logs `console.warn` and quietly returns "fallback", so a
 * probe that watches only `error` cannot see the one message that would settle the question.
 */
const consoleLines = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") consoleLines.push(`[${m.type()}] ${m.text()}`);
});
await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });

/**
 * `--diff-trials=N` renders N times and describes the *shape* of the difference between the two
 * outcomes rather than just asserting they exist.
 *
 * Two fixed outputs that a render picks between is a strange thing for an audio graph to do, and the
 * shape says where to look: a difference present from sample 0 and steady throughout is a gain or
 * timbre decision made while building the graph; a difference that starts at one moment is an event
 * (a note, an envelope, a limiter attack); a difference whose blocks are signed the same way is a
 * level change, while one that alternates is a phase or timing change.
 */
/**
 * `--primitives` asks the question underneath all of this: is an OfflineAudioContext render
 * bit-reproducible at all, and if not, which node makes it not?
 *
 * Every genre's repeats differ, and the differences are random-signed from the first note onward —
 * which is the signature of a numeric difference inside a node rather than a decision the graph made.
 * A tiny graph per candidate keeps this fast enough to run enough trials to be conclusive, and
 * separating the nodes turns "the bounce is non-deterministic" into a named primitive.
 */
/**
 * `--bisect` walks the *renderer's own inputs* one at a time, on the smallest pattern that still
 * shows the problem.
 *
 * The voices are now individually reproducible, the master graph is reproducible, and the sends are
 * not involved, yet a single-track pattern is still not bit-identical. What is left is everything
 * `renderPatternOffline` adds around a voice: the genre's master FX, the genre's channel-strip
 * insert, the loudness trim, and the mixer state. Removing them one at a time says which.
 */
/**
 * `--force-fallback` asks whether the rare ~1.3 dB outlier is a *fallback limiter* render.
 *
 * The outlier is a discrete event — its magnitude repeats to five decimals across independent runs,
 * and it hits whichever genre happens to be rendering — which is what a two-outcome fork looks like.
 * The one fork of that shape left in the renderer is the master limiter: `createMasterLimiter`
 * prefers an `AudioWorkletNode` and silently falls back to a `DynamicsCompressor` when
 * `addModule` fails, and a page-console warning during one of the renders showed exactly that
 * failure once. 400 direct limiter creations all took the worklet path, which is why it has not
 * shown up as a rate — but a *fallback* render is trivially reachable by breaking `addModule`, and
 * if its fingerprint is the outlier's, the fork is named.
 */
/**
 * `--gs1` asks whether the rare ~1.3 dB outlier is a **GS-1 voice that failed to load**.
 *
 * This is the strongest candidate left, and it fits every property of the outlier measured so far:
 *
 *   - GS-1 routing is on by default (`DEFAULT_GS1_ROUTING_ENABLED = true`), so `renderPatternOffline`
 *     builds a worklet host for the chords and lead tracks on every render;
 *   - a host whose module fails to load is skipped by a **silent** `catch` and that track falls back
 *     to the native synth for that render only — "a failed load leaves the track on the native
 *     engine, exactly like a live failure";
 *   - so the same input has two outcomes chosen by whether a worklet load won a race: fixed values,
 *     stable magnitude, no dependence on the genre, and rare (a load only occasionally fails).
 *
 * It also re-reads the earlier `--force-fallback` result: that run rejected *every* `addModule`,
 * which breaks the master limiter **and** both GS-1 hosts, so its 4.83 dB was never attributable to
 * the limiter alone.
 *
 * Variants, all measured against a normal render:
 *   1. as-is (the control);
 *   2. GS-1 routing switched off — what GS-1 is worth when it does not load;
 *   3. only the *second* `addModule` rejected — i.e. one GS-1 host fails, the limiter still loads;
 *   4. every `addModule` rejected — the limiter and both hosts fail.
 */
/**
 * `--stream=N` answers the question every hypothesis so far has dodged: **is the *scheduling*
 * non-deterministic, or the browser's DSP?**
 *
 * Three explanations have been tested and rejected — the three-oscillator fan-in rule (real, fixed,
 * different defect), the limiter worklet fallback (0.67 dB of band shape), and the silent GS-1 host
 * fallback plus its uncached multi-megabyte core fetch (real, fixed, and the outlier survived both).
 * Each was a guess about *how the graph is built*. This measures instead.
 *
 * It patches `AudioParam`'s scheduling methods (and the source `start` methods, whose buffer offsets
 * are not params) to record every call with a stable per-param id, hashes that stream per render, and
 * compares it with the audio hash of the same render:
 *
 *   - **stream identical, audio different** -> the scheduling is deterministic and the difference is
 *     inside the browser's DSP. No amount of restructuring this project's graph will fix it, and the
 *     honest response is to state the tolerance rather than claim bit-identity;
 *   - **stream differs** -> the difference is ours, and the two hashes narrow it to the exact call.
 *
 * Recording is gated on a flag so the app's own live engine (idle here, but not guaranteed) cannot
 * pollute the stream.
 */
if (streamTrials > 0) {
  /**
   * A bare page on the same origin, with no app mounted.
   *
   * The first version of this mode recorded on the app's page and was unreadable: the call count
   * per render came out as two values differing 4x, because the studio's own live engine schedules
   * and cancels work while the recorder is armed. Measuring a renderer through a running app
   * measures both. Vite serves `/src/**` as modules on any path, so a blank document is enough to
   * import the renderer directly.
   */
  await page.route("**/bare.html", (route) =>
    route.fulfill({ contentType: "text/html", body: "<!doctype html><meta charset=\"utf-8\"><title>bare</title>" })
  );
  await page.goto(`${baseUrl}/bare.html`, { waitUntil: "domcontentloaded" });
  const out = await page.evaluate(
    async ({ id, n, streamBars }) => {
      const calls = [];
      let recording = false;
      /**
       * Reassigned every render.
       *
       * Ids must be handed out in *creation order within this render* or two renders of the same
       * graph hash differently for no reason — the first version kept them for the whole page and
       * its per-param ids climbed monotonically, which made every stream hash unique by
       * construction and hid the very question being asked.
       */
      let paramIds = new WeakMap();
      let nextId = 0;

      const PARAM_METHODS = [
        "setValueAtTime",
        "linearRampToValueAtTime",
        "exponentialRampToValueAtTime",
        "setTargetAtTime",
        "cancelScheduledValues",
        "cancelAndHoldAtTime",
      ];
      const paramProto = Object.getPrototypeOf(
        new OfflineAudioContext(2, 128, 44100).createGain().gain
      );
      const paramOriginals = {};
      for (const m of PARAM_METHODS) {
        paramOriginals[m] = paramProto[m];
        paramProto[m] = function (...a) {
          if (recording) {
            let pid = paramIds.get(this);
            if (pid === undefined) {
              pid = nextId++;
              paramIds.set(this, pid);
            }
            calls.push(`p${pid}.${m}(${a.join(",")})`);
          }
          return paramOriginals[m].apply(this, a);
        };
      }

      const SOURCE_TYPES = ["AudioBufferSourceNode", "OscillatorNode", "ConstantSourceNode"];
      const sourceOriginals = [];
      for (const type of SOURCE_TYPES) {
        const ctor = globalThis[type];
        if (!ctor) continue;
        for (const m of ["start", "stop"]) {
          const original = ctor.prototype[m];
          if (typeof original !== "function") continue;
          sourceOriginals.push([ctor.prototype, m, original]);
          ctor.prototype[m] = function (...a) {
            if (recording) calls.push(`${type}.${m}(${a.join(",")})`);
            return original.apply(this, a);
          };
        }
      }

      const hash = (text) => {
        let h = 0x811c9dc5;
        for (let i = 0; i < text.length; i++) {
          h ^= text.charCodeAt(i);
          h = Math.imul(h, 0x01000193) >>> 0;
        }
        return h.toString(16).padStart(8, "0");
      };

      const wav = await import("/src/audio/WavExporter.ts");
      const mixModule = await import("/src/data/genreMix.ts");
      const genres = await import("/src/data/genres/index.ts");
      const trackUtils = await import("/src/utils/trackUtils.ts");
      const timbre = await import("/src/test/helpers/timbre.ts");

      const genre = genres.ALL_GENRES.find((g) => g.id === id);
      if (!genre) throw new Error(`unknown genre: ${id}`);
      const drumKit = trackUtils.getDefaultDrumKitForGenre(genre);

      const rows = [];
      try {
        for (let r = 0; r < n; r++) {
          calls.length = 0;
          paramIds = new WeakMap();
          nextId = 0;
          recording = true;
          let buffer;
          try {
            buffer = await wav.renderPatternOffline(
              mixModule.applyGenreMixDefaults(genre.sequencer_pattern, genre.id),
              { bars: streamBars, drumKit, loudnessTrimDb: 0 }
            );
          } finally {
            recording = false;
          }
          const channels = [];
          for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
          let audioHash = 0x811c9dc5;
          const view = new DataView(new ArrayBuffer(4));
          for (const ch of channels) {
            for (let i = 0; i < ch.length; i++) {
              view.setFloat32(0, ch[i]);
              const word = view.getUint32(0);
              for (let b = 0; b < 4; b++) {
                audioHash ^= (word >>> (b * 8)) & 0xff;
                audioHash = Math.imul(audioHash, 0x01000193) >>> 0;
              }
            }
          }
          rows.push({
            audio: audioHash.toString(16).padStart(8, "0"),
            stream: hash(calls.join(";")),
            calls: calls.length,
            // Kept only for the two extremes below: a full stream per render is megabytes.
            text: calls.join("\n"),
          });
        }
      } finally {
        for (const m of PARAM_METHODS) paramProto[m] = paramOriginals[m];
        for (const [proto, m, original] of sourceOriginals) proto[m] = original;
      }
      void timbre;
      return rows;
    },
    { id: genreId, n: streamTrials, streamBars }
  );

  await browser.close();
  server.kill();

  const audioHashes = new Set(out.map((r) => r.audio));
  const streamHashes = new Set(out.map((r) => r.stream));
  const callCounts = new Set(out.map((r) => r.calls));

  console.log(
    `\n=== ${genreId}: ${streamTrials} renders, scheduled stream vs rendered audio (${streamBars} bar(s)) ===\n`
  );
  console.log(`   distinct audio hashes  : ${audioHashes.size} / ${out.length}`);
  console.log(`   distinct stream hashes : ${streamHashes.size} / ${out.length}`);
  console.log(`   scheduled calls/render : ${[...callCounts].join(", ")}\n`);

  // The decisive pairing: renders whose *scheduled stream* was identical but whose audio was not.
  const byStream = new Map();
  for (const row of out) {
    if (!byStream.has(row.stream)) byStream.set(row.stream, new Set());
    byStream.get(row.stream).add(row.audio);
  }
  const splitStreams = [...byStream.entries()].filter(([, audios]) => audios.size > 1);
  console.log(
    `   identical stream, different audio : ${splitStreams.length} of ${byStream.size} stream(s)` +
      (splitStreams.length > 0
        ? "\n      -> the scheduling is deterministic; the difference is inside the browser's DSP."
        : "")
  );
  if (callCounts.size > 1) {
    /**
     * Diff the sparsest render against the busiest one.
     *
     * The call *count* is the finding; the diff says which calls the extra ones are, which is what
     * turns "the scheduling varies" into a site to look at.
     */
    const sorted = [...out].sort((a, b) => a.calls - b.calls);
    const low = sorted[0];
    const high = sorted[sorted.length - 1];
    const countOf = (text) => {
      const m = new Map();
      for (const line of text.split("\n")) m.set(line, (m.get(line) || 0) + 1);
      return m;
    };
    const lowCounts = countOf(low.text);
    const highCounts = countOf(high.text);
    const onlyHigh = [];
    const onlyLow = [];
    for (const [line, n] of highCounts) {
      const d = n - (lowCounts.get(line) || 0);
      if (d > 0) onlyHigh.push(`${d}x ${line}`);
    }
    for (const [line, n] of lowCounts) {
      const d = n - (highCounts.get(line) || 0);
      if (d > 0) onlyLow.push(`${d}x ${line}`);
    }
    /** Collapse to the method/parameter shape, so the report is readable. */
    const summarise = (rowsIn) => {
      const groups = new Map();
      for (const entry of rowsIn) {
        const line = entry.replace(/^\d+x /, "");
        const key = line.replace(/\(.*$/, "");
        groups.set(key, (groups.get(key) || 0) + 1);
      }
      return [...groups.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([k, n]) => `      ${String(n).padStart(4)}x  ${k}`)
        .join("\n");
    };
    console.log(
      `\n   calls: low=${low.calls} high=${high.calls}  (audio ${low.audio} vs ${high.audio})`
    );
    console.log(`   call shapes present only in the BUSY render (${onlyHigh.length} distinct):\n${summarise(onlyHigh)}`);
    console.log(`   call shapes present only in the SPARSE render (${onlyLow.length} distinct):\n${summarise(onlyLow)}`);
    void byStream;
  }
  console.log();
  process.exit(0);
}

if (args.includes("--gs1")) {
  const report = await page.evaluate(async ({ id }) => {
    const wav = await import("/src/audio/WavExporter.ts");
    const timbre = await import("/src/test/helpers/timbre.ts");
    const mixModule = await import("/src/data/genreMix.ts");
    const genres = await import("/src/data/genres/index.ts");
    const trackUtils = await import("/src/utils/trackUtils.ts");
    const gs1 = await import("/src/audio/gs1/gs1Tracks.ts");

    const genre = genres.ALL_GENRES.find((g) => g.id === id);
    if (!genre) throw new Error(`unknown genre: ${id}`);
    const drumKit = trackUtils.getDefaultDrumKitForGenre(genre);

    const renderOnce = async () => {
      const buffer = await wav.renderPatternOffline(
        mixModule.applyGenreMixDefaults(genre.sequencer_pattern, genre.id),
        { bars: 3, drumKit, loudnessTrimDb: 0 }
      );
      const channels = [];
      for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
      const fp = timbre.fingerprintChannels(channels, buffer.sampleRate);
      return { bandDb: fp.bandDb, rmsDb: fp.rmsDb };
    };

    const proto = Object.getPrototypeOf(new OfflineAudioContext(2, 128, 44100).audioWorklet);
    const originalAddModule = proto.addModule;

    /** Reject the Nth `addModule` call only (1 = the limiter, 2+ = the GS-1 hosts). */
    const withAddModuleFailure = async (failFrom, failTo) => {
      let call = 0;
      proto.addModule = function (...a) {
        call += 1;
        if (call >= failFrom && call <= failTo) return Promise.reject(new Error(`forced addModule failure #${call}`));
        return originalAddModule.apply(this, a);
      };
      try {
        return await renderOnce();
      } finally {
        proto.addModule = originalAddModule;
      }
    };

    const normal = await renderOnce();

    gs1.setGs1RoutingEnabled(false);
    let gs1Off;
    try {
      gs1Off = await renderOnce();
    } finally {
      gs1.setGs1RoutingEnabled(true);
    }

    // How many `addModule` calls a render makes at all: 1 for the master limiter plus one per
    // GS-1 host, so the count says how many tracks GS-1 is voicing.
    let addModuleCalls = 0;
    proto.addModule = function (...a) {
      addModuleCalls += 1;
      return originalAddModule.apply(this, a);
    };
    try {
      await renderOnce();
    } finally {
      proto.addModule = originalAddModule;
    }

    const limiterOnlyFailed = await withAddModuleFailure(1, 1);
    const firstHostFailed = await withAddModuleFailure(2, 2);
    const secondHostFailed = await withAddModuleFailure(3, 3);
    const allWorksletsFailed = await withAddModuleFailure(1, 99);

    const genre0 = genre.sequencer_pattern.tracks[0];
    void genre0;
    const routedTracks = genre.sequencer_pattern.tracks
      .map((t) => ({ id: t.track_id, instrument: t.instrument }))
      .filter((t) => Boolean(gs1.gs1PatchFor(t.id, t.instrument)));

    return {
      normal,
      gs1Off,
      limiterOnlyFailed,
      firstHostFailed,
      secondHostFailed,
      allWorksletsFailed,
      addModuleCalls,
      routedTracks,
    };
  }, { id: genreId });

  await browser.close();
  server.kill();

  const { normal } = report;
  const show = (label, fp) => {
    const deltas = fp.bandDb.map((v, k) => Math.abs(v - normal.bandDb[k]));
    const worst = deltas.reduce((best, d, k) => (d > best.delta ? { k, delta: d } : best), { k: 0, delta: 0 });
    console.log(
      `   ${label.padEnd(30)} rmsDb ${fp.rmsDb.toFixed(4)}   worst band vs normal ${worst.delta.toFixed(4)} dB (band ${worst.k})`
    );
  };

  console.log(`\n=== ${genreId}: is the outlier a GS-1 host that failed to load? (3 bars) ===\n`);
  console.log(
    `   addModule calls per render: ${report.addModuleCalls} ` +
      `(1 limiter + ${report.addModuleCalls - 1} GS-1 host(s))`
  );
  console.log(
    `   GS-1 voices: ${report.routedTracks.length === 0 ? "nothing" : report.routedTracks.map((t) => `${t.id}=${t.instrument}`).join(", ")}\n`
  );
  show("normal (control)", normal);
  show("GS-1 routing off", report.gs1Off);
  show("limiter failed only", report.limiterOnlyFailed);
  show("1st GS-1 host failed", report.firstHostFailed);
  show("2nd GS-1 host failed", report.secondHostFailed);
  show("every worklet failed", report.allWorksletsFailed);
  console.log();
  process.exit(0);
}

if (args.includes("--force-fallback")) {
  const out = await page.evaluate(async ({ id }) => {
    const wav = await import("/src/audio/WavExporter.ts");
    const mixModule = await import("/src/data/genreMix.ts");
    const genres = await import("/src/data/genres/index.ts");
    const trackUtils = await import("/src/utils/trackUtils.ts");

    const genre = genres.ALL_GENRES.find((g) => g.id === id);
    const drumKit = trackUtils.getDefaultDrumKitForGenre(genre);
    const pattern = () => mixModule.applyGenreMixDefaults(genre.sequencer_pattern, genre.id);

    const renderOnce = async () => {
      const buffer = await wav.renderPatternOffline(pattern(), {
        bars: 3,
        drumKit,
        loudnessTrimDb: 0,
      });
      const channels = [];
      for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
      const timbre = await import("/src/test/helpers/timbre.ts");
      const fp = timbre.fingerprintChannels(channels, buffer.sampleRate);
      return { bandDb: fp.bandDb, rmsDb: fp.rmsDb };
    };

    const normal = await renderOnce();

    // Break the worklet load so every limiter takes the compressor fallback.
    const proto = Object.getPrototypeOf(new OfflineAudioContext(2, 128, 44100).audioWorklet);
    const original = proto.addModule;
    proto.addModule = () => Promise.reject(new Error("forced fallback"));
    let fallback;
    try {
      fallback = await renderOnce();
    } finally {
      proto.addModule = original;
    }

    const afterRestore = await renderOnce();

    return { normal, fallback, afterRestore };
  }, { id: genreId });

  await browser.close();
  server.kill();

  const { normal, fallback, afterRestore } = out;
  const show = (label, fp) => {
    const worst = fp.bandDb
      .map((v, k) => ({ k, delta: Math.abs(v - normal.bandDb[k]) }))
      .sort((a, b) => b.delta - a.delta)[0];
    console.log(
      `   ${label.padEnd(22)} rmsDb ${fp.rmsDb.toFixed(6)}   worst band vs normal ${worst.delta.toFixed(4)} dB (band ${worst.k})`
    );
  };
  console.log(`\n=== ${genreId}: is the outlier a fallback-limiter render? (3 bars) ===\n`);
  show("normal (worklet)", normal);
  show("forced fallback", fallback);
  show("normal again", afterRestore);
  console.log();
  process.exit(0);
}

if (args.includes("--bisect")) {
  const out = await page.evaluate(async ({ id }) => {
    const wav = await import("/src/audio/WavExporter.ts");
    const mixModule = await import("/src/data/genreMix.ts");
    const genres = await import("/src/data/genres/index.ts");
    const trackUtils = await import("/src/utils/trackUtils.ts");

    const genre = genres.ALL_GENRES.find((g) => g.id === id);
    const drumKit = trackUtils.getDefaultDrumKitForGenre(genre);

    const hash = (buffer) => {
      let h = 0x811c9dc5;
      const view = new DataView(new ArrayBuffer(4));
      for (let c = 0; c < buffer.numberOfChannels; c++) {
        const data = buffer.getChannelData(c);
        for (let i = 0; i < data.length; i++) {
          view.setFloat32(0, data[i]);
          const word = view.getUint32(0);
          for (let b = 0; b < 4; b++) {
            h ^= (word >>> (b * 8)) & 0xff;
            h = Math.imul(h, 0x01000193) >>> 0;
          }
        }
      }
      return h.toString(16).padStart(8, "0");
    };

    /** The full pattern, or just the kick with one step, under a chosen set of removals. */
    const variants = [
      ["kick only, as-is", (p) => p, false],
      ["kick only, no genre id (no master FX, default trim)", (p) => ({ ...p, genre_id: "" }), false],
      [
        "kick only, no genre id + dry explicit track states",
        (p) => ({ ...p, genre_id: "" }),
        true,
      ],
      ["full pattern, as-is", (p) => p, false],
    ];

    const results = [];
    for (const [label, transform, explicitStates] of variants) {
      const hashes = [];
      for (let r = 0; r < 2; r++) {
        const mixed = mixModule.applyGenreMixDefaults(genre.sequencer_pattern, genre.id);
        let pattern = transform(mixed);
        if (label.startsWith("kick only")) {
          pattern = {
            ...pattern,
            tracks: pattern.tracks.map((t, i) => ({
              ...t,
              steps: i === 0 ? t.steps : t.steps.map(() => 0),
            })),
          };
        }
        const options = { bars: 1, drumKit, loudnessTrimDb: 0 };
        if (explicitStates) {
          options.trackStates = pattern.tracks.map(() => ({
            mute: false,
            solo: false,
            volume: 0.8,
            pan: 0,
            sendA: 0,
            sendB: 0,
            phaseInvert: false,
          }));
        }
        const buffer = await wav.renderPatternOffline(pattern, options);
        hashes.push(hash(buffer));
      }
      results.push({ label, stable: hashes[0] === hashes[1], hashes });
    }
    return results;
  }, { id: genreId });

  await browser.close();
  server.kill();

  console.log(`\n=== ${genreId}: which renderer input carries the non-determinism? ===\n`);
  for (const r of out) {
    console.log(`   ${r.label.padEnd(56)} ${r.stable ? "stable" : "UNSTABLE"}`);
  }
  console.log();
  process.exit(0);
}

if (primitives) {
  const rows = await page.evaluate(async () => {
    const render = async (build) => {
      const ctx = new OfflineAudioContext(2, 44100, 44100);
      build(ctx);
      const out = await ctx.startRendering();
      let h = 0x811c9dc5;
      const view = new DataView(new ArrayBuffer(4));
      let nan = 0;
      let maxAbs = 0;
      let sumSq = 0;
      let n = 0;
      let nonzero = 0;
      let lastNonzero = -1;
      for (let c = 0; c < out.numberOfChannels; c++) {
        const data = out.getChannelData(c);
        for (let i = 0; i < data.length; i++) {
          const v = data[i];
          if (Number.isNaN(v)) nan++;
          const av = Math.abs(v);
          if (av > maxAbs) maxAbs = av;
          if (av > 0) {
            nonzero++;
            lastNonzero = i;
          }
          sumSq += v * v;
          n++;
          view.setFloat32(0, v);
          const word = view.getUint32(0);
          for (let b = 0; b < 4; b++) {
            h ^= (word >>> (b * 8)) & 0xff;
            h = Math.imul(h, 0x01000193) >>> 0;
          }
        }
      }
      return {
        hash: h.toString(16).padStart(8, "0"),
        nan,
        maxAbs,
        rms: Math.sqrt(sumSq / Math.max(1, n)),
        nonzero,
        lastNonzeroSec: lastNonzero / out.sampleRate,
      };
    };

    // A fixed, seeded IR so the convolver is not itself the source of variation.
    const ir = (ctx) => {
      const buf = ctx.createBuffer(2, 4096, 44100);
      let state = 22222;
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < d.length; i++) {
          state = (state * 1664525 + 1013904223) >>> 0;
          d[i] = (state / 0xffffffff) * 2 - 1;
        }
      }
      return buf;
    };

    const candidates = [
      [
        "oscillator → gain → dest",
        (ctx) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.frequency.value = 220;
          g.gain.value = 0.4;
          osc.connect(g).connect(ctx.destination);
          osc.start(0);
          osc.stop(1);
        },
      ],
      [
        "+ biquad lowpass",
        (ctx) => {
          const osc = ctx.createOscillator();
          const f = ctx.createBiquadFilter();
          const g = ctx.createGain();
          osc.frequency.value = 220;
          f.type = "lowpass";
          f.frequency.value = 1200;
          f.Q.value = 3;
          g.gain.value = 0.4;
          osc.connect(f).connect(g).connect(ctx.destination);
          osc.start(0);
          osc.stop(1);
        },
      ],
      [
        "+ dynamics compressor",
        (ctx) => {
          const osc = ctx.createOscillator();
          const comp = ctx.createDynamicsCompressor();
          const g = ctx.createGain();
          osc.frequency.value = 220;
          g.gain.value = 0.9;
          osc.connect(comp).connect(g).connect(ctx.destination);
          osc.start(0);
          osc.stop(1);
        },
      ],
      [
        "+ waveshaper",
        (ctx) => {
          const osc = ctx.createOscillator();
          const ws = ctx.createWaveShaper();
          const g = ctx.createGain();
          const curve = new Float32Array(1024);
          for (let i = 0; i < curve.length; i++) {
            const x = (i / (curve.length - 1)) * 2 - 1;
            curve[i] = Math.tanh(x * 3);
          }
          ws.curve = curve;
          ws.oversample = "4x";
          osc.frequency.value = 220;
          g.gain.value = 0.9;
          osc.connect(ws).connect(g).connect(ctx.destination);
          osc.start(0);
          osc.stop(1);
        },
      ],
      [
        "+ convolver (fixed IR)",
        (ctx) => {
          const osc = ctx.createOscillator();
          const conv = ctx.createConvolver();
          const g = ctx.createGain();
          conv.normalize = false;
          conv.buffer = ir(ctx);
          osc.frequency.value = 220;
          g.gain.value = 0.9;
          osc.connect(conv).connect(g).connect(ctx.destination);
          osc.start(0);
          osc.stop(1);
        },
      ],
      [
        "2 oscillators summed",
        (ctx) => {
          const a = ctx.createOscillator();
          const b = ctx.createOscillator();
          const g = ctx.createGain();
          a.frequency.value = 220;
          b.frequency.value = 331;
          g.gain.value = 0.4;
          a.connect(g);
          b.connect(g);
          g.connect(ctx.destination);
          a.start(0);
          b.start(0);
          a.stop(1);
          b.stop(1);
        },
      ],
      [
        "+ stereo panner",
        (ctx) => {
          const osc = ctx.createOscillator();
          const p = ctx.createStereoPanner();
          const g = ctx.createGain();
          osc.frequency.value = 220;
          p.pan.value = -0.3;
          g.gain.value = 0.4;
          osc.connect(p).connect(g).connect(ctx.destination);
          osc.start(0);
          osc.stop(1);
        },
      ],
    ];

    /**
     * The project's own master chain, and its limiter worklet alone.
     *
     * Every platform primitive above is reproducible, so if the difference is in the graph it has to
     * be in something this project adds — and the limiter's `AudioWorkletProcessor` is the one
     * component in the bounce that is not a native node.
     */
    const masterModule = await import("/src/audio/masterGraph.ts");
    const limiterModule = await import("/src/audio/MasterLimiter.ts");

    candidates.push([
      "masterGraph + oscillator",
      (ctx) => {
        const graph = masterModule.buildMasterGraph(ctx, { loudnessTrimDb: 0 });
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.frequency.value = 220;
        g.gain.value = 0.9;
        osc.connect(g).connect(graph.drumBusInput);
        osc.start(0);
        osc.stop(1);
      },
    ]);

    candidates.push([
      "master limiter worklet only",
      (ctx) => {
        const handle = limiterModule.createMasterLimiter(ctx);
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.frequency.value = 220;
        g.gain.value = 0.9;
        osc.connect(g).connect(handle.input);
        handle.output.connect(ctx.destination);
        osc.start(0);
        osc.stop(1);
      },
    ]);

    /**
     * The voices on their own, with the real seeded noise buffer.
     *
     * The master graph and every platform primitive are reproducible, and the difference in a real
     * bounce starts at the first note rather than gradually — so the remaining candidate is the
     * synthesis of the notes themselves.
     */
    const drums = await import("/src/audio/DrumKitModels.ts");
    const noiseModule = await import("/src/audio/noise.ts");

    candidates.push([
      "kick voice (fixed position)",
      (ctx) => {
        const buf = noiseModule.createSeededNoiseBuffer(ctx, 2);
        drums.synthesizeKick(ctx, ctx.destination, 0, 1, 0, "808", buf, 12345);
      },
    ]);
    candidates.push([
      "snare voice (fixed position)",
      (ctx) => {
        const buf = noiseModule.createSeededNoiseBuffer(ctx, 2);
        drums.synthesizeSnare(ctx, ctx.destination, 0, 1, 0, "808", buf, 12345);
      },
    ]);
    candidates.push([
      "hihat voice (fixed position)",
      (ctx) => {
        const buf = noiseModule.createSeededNoiseBuffer(ctx, 2);
        drums.synthesizeHiHat(ctx, ctx.destination, 0, 1, 0, "909", 1, 0.125, 0.8, buf, 12345);
      },
    ]);
    candidates.push([
      "percussion voice (fixed position)",
      (ctx) => {
        const buf = noiseModule.createSeededNoiseBuffer(ctx, 2);
        drums.synthesizePercussion(ctx, ctx.destination, 0, 1, 0, "909", buf, 12345, "rim_shaker");
      },
    ]);

    /**
     * The hi-hat is the only unstable voice, so bisect inside it. Its 909 branch is noise
     * (highpass → peaking → gain) *plus* a six-oscillator inharmonic metal cluster, and the two
     * halves fail for completely different reasons — one would be a filter, the other an
     * oscillator — so naming the half is the difference between a fix and a guess.
     */
    const CLUSTER = [310, 387, 466, 522, 681, 1070];
    const hatNoise = (ctx, withPeak) => {
      const buf = noiseModule.createSeededNoiseBuffer(ctx, 2);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 8200;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.65, 0);
      g.gain.exponentialRampToValueAtTime(0.0001, 0.052);
      let tail = hp;
      if (withPeak) {
        const peak = ctx.createBiquadFilter();
        peak.type = "peaking";
        peak.frequency.value = 11500;
        peak.Q.value = 2;
        peak.gain.value = 5;
        hp.connect(peak);
        tail = peak;
      }
      src.connect(hp);
      tail.connect(g).connect(ctx.destination);
      src.start(0, 0.01);
      src.stop(0.072);
    };
    const hatCluster = (ctx, type, throughHp) => {
      const cg = ctx.createGain();
      cg.gain.value = 1 / CLUSTER.length * 0.42 * 0.85;
      const env = ctx.createGain();
      env.gain.setValueAtTime(1, 0);
      env.gain.exponentialRampToValueAtTime(0.0001, 0.0416);
      let tail = cg;
      if (throughHp) {
        const hp = ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 8600;
        cg.connect(hp);
        tail = hp;
      }
      for (const f of CLUSTER) {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(f, 0);
        osc.connect(cg);
        osc.start(0);
        osc.stop(0.072);
      }
      tail.connect(env).connect(ctx.destination);
    };

    candidates.push(["hihat: noise only", (ctx) => hatNoise(ctx, false)]);
    candidates.push(["hihat: noise + peaking", (ctx) => hatNoise(ctx, true)]);
    candidates.push(["hihat: cluster square", (ctx) => hatCluster(ctx, "square", false)]);
    candidates.push(["hihat: cluster sine", (ctx) => hatCluster(ctx, "sine", false)]);
    candidates.push(["hihat: cluster square → highpass", (ctx) => hatCluster(ctx, "square", true)]);

    /**
     * The cluster is unstable with `sine` as well as `square`, and with or without its highpass — so
     * the remaining variables are *how many* oscillators are summed and *whether* an envelope ramp
     * follows them. Splitting those two tells a fix from a guess.
     */
    const polyCluster = (ctx, count, withRamp) => {
      const cg = ctx.createGain();
      cg.gain.value = 1 / count;
      for (let i = 0; i < count; i++) {
        const osc = ctx.createOscillator();
        osc.type = "square";
        osc.frequency.setValueAtTime(CLUSTER[i % CLUSTER.length], 0);
        osc.connect(cg);
        osc.start(0);
        osc.stop(0.072);
      }
      if (!withRamp) {
        cg.connect(ctx.destination);
        return;
      }
      const env = ctx.createGain();
      env.gain.setValueAtTime(1, 0);
      env.gain.exponentialRampToValueAtTime(0.0001, 0.0416);
      cg.connect(env).connect(ctx.destination);
    };

    candidates.push(["cluster: 1 osc + ramp", (ctx) => polyCluster(ctx, 1, true)]);
    candidates.push(["cluster: 2 osc + ramp", (ctx) => polyCluster(ctx, 2, true)]);
    candidates.push(["cluster: 6 osc, NO ramp", (ctx) => polyCluster(ctx, 6, false)]);
    candidates.push(["cluster: 6 osc + ramp (control)", (ctx) => polyCluster(ctx, 6, true)]);

    /** Does reaching a true zero, rather than a -80 dB floor, make it reproducible? */
    candidates.push([
      "cluster: 6 osc + linear ramp to 0",
      (ctx) => {
        const cg = ctx.createGain();
        cg.gain.value = 1 / CLUSTER.length;
        for (const f of CLUSTER) {
          const osc = ctx.createOscillator();
          osc.type = "square";
          osc.frequency.setValueAtTime(f, 0);
          osc.connect(cg);
          osc.start(0);
          osc.stop(0.072);
        }
        const env = ctx.createGain();
        env.gain.setValueAtTime(1, 0);
        env.gain.linearRampToValueAtTime(0, 0.0416);
        cg.connect(env).connect(ctx.destination);
      },
    ]);

    /** ...and does the exponential ramp itself misbehave when its floor is higher? */
    candidates.push([
      "cluster: 6 osc + exp ramp to 0.01",
      (ctx) => {
        const cg = ctx.createGain();
        cg.gain.value = 1 / CLUSTER.length;
        for (const f of CLUSTER) {
          const osc = ctx.createOscillator();
          osc.type = "square";
          osc.frequency.setValueAtTime(f, 0);
          osc.connect(cg);
          osc.start(0);
          osc.stop(0.072);
        }
        const env = ctx.createGain();
        env.gain.setValueAtTime(1, 0);
        env.gain.exponentialRampToValueAtTime(0.01, 0.0416);
        cg.connect(env).connect(ctx.destination);
      },
    ]);

    /**
     * The candidate fix. The cluster is six inharmonic partials; instead of six oscillators summed
     * live, synthesise those partials once into an `AudioBuffer` and play it with a single
     * `AudioBufferSourceNode`. One input, so the summation that is not bit-reproducible disappears —
     * and it removes up to six oscillator nodes from the busiest voice in the pattern.
     *
     * Built with pure arithmetic (`Math.sin`, no `Math.random`), so the buffer itself is fixed.
     */
    const clusterBuffer = (ctx, seconds) => {
      const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const t = i / ctx.sampleRate;
        let v = 0;
        for (const f of CLUSTER) {
          // A band-limited square is a sum of odd harmonics; six partials is what the voice wants.
          v += Math.sin(2 * Math.PI * f * t) + (Math.sin(2 * Math.PI * 3 * f * t) / 3);
        }
        data[i] = v / (CLUSTER.length * 2);
      }
      return buf;
    };

    candidates.push([
      "cluster as ONE precomputed buffer",
      (ctx) => {
        const src = ctx.createBufferSource();
        src.buffer = clusterBuffer(ctx, 0.09);
        const env = ctx.createGain();
        env.gain.setValueAtTime(1, 0);
        env.gain.exponentialRampToValueAtTime(0.0001, 0.0416);
        src.connect(env).connect(ctx.destination);
        src.start(0);
        src.stop(0.072);
      },
    ]);

    /** Where is the threshold? 1 and 2 are reproducible, 6 is not. */
    candidates.push(["sum: 3 oscillators", (ctx) => polyCluster(ctx, 3, false)]);
    candidates.push(["sum: 4 oscillators", (ctx) => polyCluster(ctx, 4, false)]);
    candidates.push(["sum: 5 oscillators", (ctx) => polyCluster(ctx, 5, false)]);

    /** The other multi-layer voice: the anatomy kick's sub + rumble + thump + click. */
    const anatomy = await import("/src/audio/AnatomyKickEngine.ts");
    candidates.push([
      "anatomy kick preset",
      (ctx) => {
        anatomy.synthesizeAnatomyKickVoice(ctx, ctx.destination, 0, 1, "berlin-orphic", null, 12345);
      },
    ]);

    /**
     * Pin the rule down, because the fix depends on its exact shape: is it the *count* of oscillator
     * inputs, the waveform, the frequencies, or oscillators specifically (rather than buffer
     * sources)?
     */
    const summed = (ctx, count, make, connectTo) => {
      const sink = ctx.createGain();
      sink.gain.value = 1 / count;
      for (let i = 0; i < count; i++) {
        const src = make(i);
        src.connect(sink);
        src.start(0);
        src.stop(0.072);
      }
      connectTo(sink);
    };
    const oscOf = (ctx, type, freq) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(freq, 0);
      return o;
    };
    const bufOf = (ctx, freq) => {
      const src = ctx.createBufferSource();
      src.buffer = clusterBuffer(ctx, 0.09);
      return src;
    };

    candidates.push([
      "3 osc, all same frequency",
      (ctx) => summed(ctx, 3, () => oscOf(ctx, "square", 466), (n) => n.connect(ctx.destination)),
    ]);
    candidates.push([
      "3 osc, sine",
      (ctx) => summed(ctx, 3, (i) => oscOf(ctx, "sine", CLUSTER[i]), (n) => n.connect(ctx.destination)),
    ]);
    candidates.push([
      "3 BUFFER sources summed",
      (ctx) => summed(ctx, 3, () => bufOf(ctx, 466), (n) => n.connect(ctx.destination)),
    ]);
    candidates.push([
      "4 osc as a 2-level tree (2 per node)",
      (ctx) => {
        const a = ctx.createGain();
        const b = ctx.createGain();
        a.gain.value = 0.5;
        b.gain.value = 0.5;
        const o = [310, 387, 466, 522].map((f) => oscOf(ctx, "square", f));
        o[0].connect(a);
        o[1].connect(a);
        o[2].connect(b);
        o[3].connect(b);
        const top = ctx.createGain();
        top.gain.value = 1;
        a.connect(top);
        b.connect(top);
        top.connect(ctx.destination);
        for (const x of o) {
          x.start(0);
          x.stop(0.072);
        }
      },
    ]);

    /**
     * The shape the membrane model needs: three partials, each with its own gain *and* its own decay
     * and a 30 ms pitch drop, so they cannot simply be baked into one steady buffer. If pairing two
     * of them and letting the third meet the pair downstream is reproducible, the voice keeps its
     * exact parameters and only its fan-in changes.
     */
    candidates.push([
      "3 osc as (2+1) tree",
      (ctx) => {
        const o = [1, 1.71, 2.13].map((r) => {
          const osc = ctx.createOscillator();
          osc.type = "sine";
          osc.frequency.setValueAtTime(220 * r, 0);
          return osc;
        });
        const g = o.map(() => ctx.createGain());
        g.forEach((x, i) => {
          x.gain.value = i === 0 ? 0.9 : 0.4;
          o[i].connect(x);
        });
        const pair = ctx.createGain();
        pair.gain.value = 1;
        g[0].connect(pair);
        g[1].connect(pair);
        const bus = ctx.createGain();
        bus.gain.value = 1;
        pair.connect(bus);
        g[2].connect(bus);
        bus.connect(ctx.destination);
        for (const osc of o) {
          osc.start(0);
          osc.stop(0.09);
        }
      },
    ]);

    /**
     * The voice and the master chain are each reproducible alone, and the renderer is the thing that
     * puts them together. So: the voice *through* the master graph, including the drum-bus glue and
     * parallel compressors it normally feeds.
     */
    candidates.push([
      "kick voice → masterGraph drum bus",
      (ctx) => {
        const graph = masterModule.buildMasterGraph(ctx, { loudnessTrimDb: 0 });
        const buf = noiseModule.createSeededNoiseBuffer(ctx, 2);
        drums.synthesizeKick(ctx, graph.drumBusInput, 0, 1, 0, "808", buf, 12345);
      },
    ]);
    candidates.push([
      "8 kicks → masterGraph drum bus",
      (ctx) => {
        const graph = masterModule.buildMasterGraph(ctx, { loudnessTrimDb: 0 });
        const buf = noiseModule.createSeededNoiseBuffer(ctx, 2);
        for (let i = 0; i < 8; i++) {
          drums.synthesizeKick(ctx, graph.drumBusInput, i * 0.125, 1, 0, "808", buf, 12345 + i);
        }
      },
    ]);
    candidates.push([
      "8 hats → masterGraph drum bus",
      (ctx) => {
        const graph = masterModule.buildMasterGraph(ctx, { loudnessTrimDb: 0 });
        const buf = noiseModule.createSeededNoiseBuffer(ctx, 2);
        for (let i = 0; i < 8; i++) {
          drums.synthesizeHiHat(ctx, graph.drumBusInput, i * 0.125, 1, 0, "909", 1, 0.125, 0.8, buf, 12345 + i);
        }
      },
    ]);

    /**
     * Eight kicks, identical parameters versus eight with per-hit variation.
     *
     * `hitVariation(0)` is the identity, so passing position 0 to every hit makes eight *identical*
     * oscillators; passing distinct positions gives eight slightly different frequencies. If only the
     * second is unstable, then what breaks across a whole pattern is not the number of oscillators
     * but the number of *distinct tunings* — which decides whether per-hit variation is affordable
     * at all, and whether a pattern that used to be reproducible still is.
     */
    const manyKicks = (ctx, positions) => {
      const graph = masterModule.buildMasterGraph(ctx, { loudnessTrimDb: 0 });
      const buf = noiseModule.createSeededNoiseBuffer(ctx, 2);
      positions.forEach((pos, i) => {
        drums.synthesizeKick(ctx, graph.drumBusInput, i * 0.125, 1, 0, "808", buf, pos);
      });
    };
    candidates.push([
      "8 kicks, IDENTICAL pitch (position 0)",
      (ctx) => manyKicks(ctx, [0, 0, 0, 0, 0, 0, 0, 0]),
    ]);
    candidates.push([
      "8 kicks, per-hit variation (distinct positions)",
      (ctx) => manyKicks(ctx, [1, 2, 3, 4, 5, 6, 7, 8]),
    ]);
    candidates.push(["3 kicks, distinct positions", (ctx) => manyKicks(ctx, [1, 2, 3])]);
    candidates.push(["2 kicks, distinct positions", (ctx) => manyKicks(ctx, [1, 2])]);

    /**
     * Two oscillators were reproducible on their own but two kicks through the master graph's drum
     * bus were not, so separate the two candidates: the compressors on that bus (glue + parallel),
     * or the fact that a "kick" is more than a bare oscillator.
     */
    const plainOsc = (ctx, freq, at) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(freq, at);
      g.gain.setValueAtTime(0.9, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.4);
      o.connect(g);
      o.start(at);
      o.stop(at + 0.45);
      return g;
    };
    candidates.push([
      "2 plain oscillators → drum bus (compressors)",
      (ctx) => {
        const graph = masterModule.buildMasterGraph(ctx, { loudnessTrimDb: 0 });
        plainOsc(ctx, 60, 0).connect(graph.drumBusInput);
        plainOsc(ctx, 60, 0.125).connect(graph.drumBusInput);
      },
    ]);
    candidates.push([
      "2 kicks → plain gain → dest (no compressors)",
      (ctx) => {
        const sum = ctx.createGain();
        sum.connect(ctx.destination);
        const buf = noiseModule.createSeededNoiseBuffer(ctx, 2);
        drums.synthesizeKick(ctx, sum, 0, 1, 0, "808", buf, 1);
        drums.synthesizeKick(ctx, sum, 0.125, 1, 0, "808", buf, 2);
      },
    ]);
    candidates.push([
      "2 kicks → drum bus (compressors)",
      (ctx) => {
        const graph = masterModule.buildMasterGraph(ctx, { loudnessTrimDb: 0 });
        const buf = noiseModule.createSeededNoiseBuffer(ctx, 2);
        drums.synthesizeKick(ctx, graph.drumBusInput, 0, 1, 0, "808", buf, 1);
        drums.synthesizeKick(ctx, graph.drumBusInput, 0.125, 1, 0, "808", buf, 2);
      },
    ]);
    candidates.push([
      "2 plain oscillators → plain gain",
      (ctx) => {
        const sum = ctx.createGain();
        sum.connect(ctx.destination);
        plainOsc(ctx, 60, 0).connect(sum);
        plainOsc(ctx, 60, 0.125).connect(sum);
      },
    ]);

    /**
     * The discriminator that decides how far this goes: is the threshold "three oscillators", or
     * "two oscillators at *different* frequencies"? The earlier 2-oscillator control used one shared
     * frequency, so it cannot tell those apart — and if two distinct frequencies are enough, then
     * every real pattern is affected and the honest fix is to the claim rather than to the graph.
     */
    const twoOsc = (ctx, f1, f2, sameGain) => {
      const sum = sameGain ? ctx.createGain() : ctx.createGain();
      sum.connect(ctx.destination);
      plainOsc(ctx, f1, 0).connect(sum);
      plainOsc(ctx, f2, 0.125).connect(sum);
    };
    candidates.push(["2 plain osc, SAME freq (control)", (ctx) => twoOsc(ctx, 60, 60, true)]);
    candidates.push(["2 plain osc, 60 vs 61 Hz", (ctx) => twoOsc(ctx, 60, 61, true)]);
    candidates.push(["2 plain osc, 60 vs 500 Hz", (ctx) => twoOsc(ctx, 60, 500, true)]);
    candidates.push([
      "2 kicks, IDENTICAL position",
      (ctx) => {
        const sum = ctx.createGain();
        sum.connect(ctx.destination);
        const buf = noiseModule.createSeededNoiseBuffer(ctx, 2);
        drums.synthesizeKick(ctx, sum, 0, 1, 0, "808", buf, 0);
        drums.synthesizeKick(ctx, sum, 0.125, 1, 0, "808", buf, 0);
      },
    ]);

    /**
     * `makeDistortionCurve` returns a *cached, shared* `Float32Array` and every kick assigns that
     * same instance to `shaper.curve`. Two kicks means two `WaveShaperNode`s holding one array, in a
     * graph that is rendered on another thread — while a single kick, and two kicks' worth of plain
     * oscillators, are both reproducible. That is the shape of a shared-buffer bug, so test it
     * directly: the same cached array versus two separately built arrays.
     */
    const kickEngine = await import("/src/audio/AnatomyKickEngine.ts");
    const shaperRun = (ctx, shareCurve) => {
      const sum = ctx.createGain();
      sum.connect(ctx.destination);
      for (let i = 0; i < 2; i++) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        const ws = ctx.createWaveShaper();
        o.frequency.setValueAtTime(60, i * 0.125);
        g.gain.setValueAtTime(0.9, i * 0.125);
        g.gain.exponentialRampToValueAtTime(0.0001, i * 0.125 + 0.4);
        ws.curve = shareCurve
          ? kickEngine.makeDistortionCurve(2)
          : Float32Array.from(kickEngine.makeDistortionCurve(2));
        ws.oversample = "2x";
        o.connect(g).connect(ws).connect(sum);
        o.start(i * 0.125);
        o.stop(i * 0.125 + 0.45);
      }
    };
    candidates.push(["2 shapers SHARING the cached curve", (ctx) => shaperRun(ctx, true)]);
    candidates.push(["2 shapers with their OWN curve copies", (ctx) => shaperRun(ctx, false)]);

    /**
     * The kick's only other moving part is its noise click: a `BufferSource` reading the *shared*
     * seeded noise buffer through a band-pass. Removing it is a one-argument change
     * (`noiseBuffer = null`), so it is the cheapest possible discriminator.
     */
    const twoKicks = (ctx, withNoise, sameTime) => {
      const sum = ctx.createGain();
      sum.connect(ctx.destination);
      const buf = withNoise ? noiseModule.createSeededNoiseBuffer(ctx, 2) : null;
      drums.synthesizeKick(ctx, sum, 0, 1, 0, "808", buf, 1);
      drums.synthesizeKick(ctx, sum, sameTime ? 0 : 0.125, 1, 0, "808", buf, 2);
    };
    candidates.push(["2 kicks, NO noise click layer", (ctx) => twoKicks(ctx, false, false)]);
    candidates.push(["2 kicks, WITH noise click layer (control)", (ctx) => twoKicks(ctx, true, false)]);
    candidates.push(["2 kicks, same start time, with noise", (ctx) => twoKicks(ctx, true, true)]);
    candidates.push(["2 kicks, same start time, no noise", (ctx) => twoKicks(ctx, false, true)]);

    /**
     * The mechanism, in the smallest possible terms: are two `AudioBufferSourceNode`s reading one
     * shared `AudioBuffer` at *different offsets* the thing that is not reproducible?
     */
    const twoSources = (ctx, sameBuffer, sameOffset) => {
      const sum = ctx.createGain();
      sum.connect(ctx.destination);
      const mk = () => {
        const b = ctx.createBuffer(1, 44100, 44100);
        const d = b.getChannelData(0);
        let st = 12345;
        for (let i = 0; i < d.length; i++) {
          st = (st * 1664525 + 1013904223) >>> 0;
          d[i] = (st / 0xffffffff) * 2 - 1;
        }
        return b;
      };
      const shared = mk();
      for (let i = 0; i < 2; i++) {
        const src = ctx.createBufferSource();
        src.buffer = sameBuffer ? shared : mk();
        src.connect(sum);
        src.start(i * 0.125, sameOffset ? 0.1 : 0.1 + i * 0.07);
        src.stop(i * 0.125 + 0.3);
      }
    };
    candidates.push(["2 buffersrc, one buffer, SAME offset", (ctx) => twoSources(ctx, true, true)]);
    candidates.push(["2 buffersrc, one buffer, DIFFERENT offsets", (ctx) => twoSources(ctx, true, false)]);
    candidates.push(["2 buffersrc, two buffers, DIFFERENT offsets", (ctx) => twoSources(ctx, false, false)]);
    candidates.push(["2 buffersrc, two buffers, SAME offset", (ctx) => twoSources(ctx, false, true)]);

    /**
     * Two kicks differ from two plain buffer sources by the band-pass filter and the click envelope,
     * so add them one at a time to the plain-source case that was reproducible.
     */
    const clickShape = (ctx, withFilter, withEnv) => {
      const sum = ctx.createGain();
      sum.connect(ctx.destination);
      const buf = noiseModule.createSeededNoiseBuffer(ctx, 2);
      for (let i = 0; i < 2; i++) {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const g = ctx.createGain();
        if (withEnv) {
          g.gain.setValueAtTime(0.6, i * 0.125);
          g.gain.exponentialRampToValueAtTime(0.0001, i * 0.125 + 0.015);
        } else {
          g.gain.value = 0.6;
        }
        if (withFilter) {
          const f = ctx.createBiquadFilter();
          f.type = "bandpass";
          f.frequency.value = 2400;
          f.Q.value = 4;
          src.connect(f).connect(g).connect(sum);
        } else {
          src.connect(g).connect(sum);
        }
        src.start(i * 0.125, 0.1 + i * 0.07);
        src.stop(i * 0.125 + 0.3);
      }
    };
    candidates.push(["click shape: no filter, no env", (ctx) => clickShape(ctx, false, false)]);
    candidates.push(["click shape: filter only", (ctx) => clickShape(ctx, true, false)]);
    candidates.push(["click shape: env only", (ctx) => clickShape(ctx, false, true)]);
    candidates.push(["click shape: filter + env (the real thing)", (ctx) => clickShape(ctx, true, true)]);

    /**
     * Each half of a kick is reproducible on its own and the pair is not, so the last thing to
     * separate is how many of each kind of source the graph holds.
     */
    const mixed = (ctx, oscCount, bufCount) => {
      const sum = ctx.createGain();
      sum.connect(ctx.destination);
      const buf = noiseModule.createSeededNoiseBuffer(ctx, 2);
      for (let i = 0; i < oscCount; i++) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.setValueAtTime(60, i * 0.125);
        g.gain.setValueAtTime(0.9, i * 0.125);
        g.gain.exponentialRampToValueAtTime(0.0001, i * 0.125 + 0.4);
        o.connect(g).connect(sum);
        o.start(i * 0.125);
        o.stop(i * 0.125 + 0.45);
      }
      for (let i = 0; i < bufCount; i++) {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.6, i * 0.125);
        g.gain.exponentialRampToValueAtTime(0.0001, i * 0.125 + 0.015);
        src.connect(g).connect(sum);
        src.start(i * 0.125, 0.1 + i * 0.07);
        src.stop(i * 0.125 + 0.3);
      }
    };
    candidates.push(["1 osc + 1 buffer", (ctx) => mixed(ctx, 1, 1)]);
    candidates.push(["1 osc + 2 buffers", (ctx) => mixed(ctx, 1, 2)]);
    candidates.push(["2 osc + 1 buffer", (ctx) => mixed(ctx, 2, 1)]);
    candidates.push(["2 osc + 2 buffers", (ctx) => mixed(ctx, 2, 2)]);
    candidates.push(["3 osc + 3 buffers", (ctx) => mixed(ctx, 3, 3)]);

    const out = [];
    for (const [label, build] of candidates) {
      const takes = [];
      for (let i = 0; i < 10; i++) takes.push(await render(build));
      const hashes = takes.map((t) => t.hash);
      const first = takes[0];
      out.push({
        label,
        distinct: new Set(hashes).size,
        sample: {
          nan: first.nan,
          maxAbs: first.maxAbs,
          rms: first.rms,
          nonzero: first.nonzero,
          lastNonzeroSec: first.lastNonzeroSec,
        },
        nanCounts: [...new Set(takes.map((t) => t.nan))],
      });
    }
    return out;
  });

  await browser.close();
  server.kill();

  console.log("\n=== is an OfflineAudioContext render bit-reproducible, node by node? (10 renders each) ===\n");
  for (const row of rows) {
    const s = row.sample;
    console.log(
      `   ${row.label.padEnd(30)} ${(row.distinct === 1 ? "reproducible" : `${row.distinct}/10 DISTINCT`).padEnd(18)}` +
        ` rms ${s.rms.toExponential(2)} max ${s.maxAbs.toExponential(2)} nonzero ${String(s.nonzero).padStart(6)}` +
        ` last ${s.lastNonzeroSec.toFixed(3)}s` +
        (s.nan > 0 ? `  NaN ${s.nan} <-- NaN in the output` : "") +
        (row.distinct > 1 && row.nanCounts.length > 1 ? "  (NaN count varies)" : "")
    );
  }
  console.log();
  process.exit(0);
}

if (diffTrials > 0) {
  const report = await page.evaluate(
    async ({ id, n, diffBars }) => {
      const wav = await import("/src/audio/WavExporter.ts");
      const mixModule = await import("/src/data/genreMix.ts");
      const genres = await import("/src/data/genres/index.ts");
      const trackUtils = await import("/src/utils/trackUtils.ts");

      const genre = genres.ALL_GENRES.find((g) => g.id === id);
      if (!genre) throw new Error(`unknown genre: ${id}`);
      const drumKit = trackUtils.getDefaultDrumKitForGenre(genre);

      const hashChannels = (channels) => {
        let h = 0x811c9dc5;
        const view = new DataView(new ArrayBuffer(4));
        for (const ch of channels) {
          for (let i = 0; i < ch.length; i++) {
            view.setFloat32(0, ch[i]);
            const word = view.getUint32(0);
            for (let b = 0; b < 4; b++) {
              h ^= (word >>> (b * 8)) & 0xff;
              h = Math.imul(h, 0x01000193) >>> 0;
            }
          }
        }
        return h.toString(16).padStart(8, "0");
      };

      const takes = [];
      for (let r = 0; r < n; r++) {
        const buffer = await wav.renderPatternOffline(
          mixModule.applyGenreMixDefaults(genre.sequencer_pattern, genre.id),
          { bars: diffBars, drumKit, loudnessTrimDb: 0 }
        );
        const channels = [];
        for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
        takes.push({
          hash: hashChannels(channels),
          left: channels[0],
          bands: (await import("/src/test/helpers/timbre.ts")).fingerprintChannels(
            channels,
            buffer.sampleRate
          ).bandDb,
          sampleRate: buffer.sampleRate,
        });
      }

      // The two most common outcomes, so a third freak result cannot be mistaken for "the" pair.
      const counts = new Map();
      for (const t of takes) counts.set(t.hash, (counts.get(t.hash) ?? 0) + 1);
      const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
      if (ranked.length < 2) return { takes: takes.map((t) => t.hash), groups: ranked, diff: null };

      const a = takes.find((t) => t.hash === ranked[0][0]);
      const b = takes.find((t) => t.hash === ranked[1][0]);
      const len = Math.min(a.left.length, b.left.length);

      let firstDiff = -1;
      let maxAbs = 0;
      let maxAt = -1;
      let signedSum = 0;
      let absSum = 0;
      const blockSize = Math.round(a.sampleRate * 0.05);
      const blocks = [];
      for (let i = 0; i < len; i++) {
        const d = a.left[i] - b.left[i];
        const ad = Math.abs(d);
        if (firstDiff < 0 && ad > 1e-9) firstDiff = i;
        if (ad > maxAbs) {
          maxAbs = ad;
          maxAt = i;
        }
        signedSum += d;
        absSum += ad;
        const block = Math.floor(i / blockSize);
        if (!blocks[block]) blocks[block] = { signed: 0, abs: 0, n: 0 };
        blocks[block].signed += d;
        blocks[block].abs += ad;
        blocks[block].n++;
      }
      const profile = blocks
        .map((blk, idx) =>
          blk && blk.abs / blk.n > 1e-6
            ? { atSec: (idx * blockSize) / a.sampleRate, signed: blk.signed / blk.n, abs: blk.abs / blk.n }
            : null
        )
        .filter(Boolean);

      const worstBand = a.bands
        ? a.bands
            .map((v, k) => ({ k, delta: Math.abs(v - b.bands[k]) }))
            .sort((x, y) => y.delta - x.delta)[0]
        : null;

      return {
        takes: takes.map((t) => t.hash),
        groups: ranked,
        diff: {
          worstBand,
          lengthSamples: len,
          durationSec: len / a.sampleRate,
          firstDiffSec: firstDiff / a.sampleRate,
          maxAbs,
          maxAtSec: maxAt / a.sampleRate,
          /** Mean signed difference / mean absolute difference: +1 = pure level, 0 = pure phase. */
          signedAbsRatio: absSum > 0 ? signedSum / absSum : 0,
          headBlocks: profile.slice(0, 12),
          tailBlocks: profile.slice(-6),
          movingBlocks: profile.length,
        },
      };
    },
    { id: genreId, n: diffTrials, diffBars }
  );

  await browser.close();
  server.kill();

  console.log(`\n=== ${genreId}: ${diffTrials} renders, difference between the two outcomes ===\n`);
  console.log(`   hashes in order : ${report.takes.join(" ")}`);
  console.log(`   distinct outcomes : ${report.groups.length}`);
  for (const [hash, count] of report.groups) console.log(`     ${hash}  x${count}`);
  if (report.diff) {
    const d = report.diff;
    console.log(`\n   duration          : ${d.durationSec.toFixed(3)} s (${d.lengthSamples} samples)`);
    console.log(`   first difference  : ${d.firstDiffSec.toFixed(4)} s`);
    console.log(`   largest difference: ${d.maxAbs.toExponential(3)} at ${d.maxAtSec.toFixed(4)} s`);
    console.log(
      `   signed/abs ratio  : ${d.signedAbsRatio.toFixed(4)}` +
        `   (${Math.abs(d.signedAbsRatio) > 0.8 ? "a level change" : "not a simple level change"})`
    );
    console.log(`   moving 50 ms blocks: ${d.movingBlocks}`);
    if (d.worstBand) {
      console.log(
        `   worst band delta  : ${d.worstBand.delta.toFixed(4)} dB (band ${d.worstBand.k}) — the figure\n` +
          `                       the timbre baseline records as repeatMaxBandDeltaDb.`
      );
    }
    console.log(`\n   last blocks (mean |Δ| per 50 ms):`);
    for (const blk of d.tailBlocks) {
      console.log(`     t=${blk.atSec.toFixed(3)}s   signed ${blk.signed.toExponential(3)}   abs ${blk.abs.toExponential(3)}`);
    }
    console.log(`\n   first blocks (mean |Δ| per 50 ms):`);
    for (const blk of d.headBlocks) {
      console.log(`     t=${blk.atSec.toFixed(3)}s   signed ${blk.signed.toExponential(3)}   abs ${blk.abs.toExponential(3)}`);
    }
  }
  console.log();
  process.exit(0);
}

if (limiterTrials > 0) {
  const trials = await page.evaluate(async (count) => {
    const limiterModule = await import("/src/audio/MasterLimiter.ts");
    const kinds = { worklet: 0, fallback: 0 };
    const failures = [];
    for (let i = 0; i < count; i++) {
      const ctx = new OfflineAudioContext(2, 128, 44100);
      const handle = limiterModule.createMasterLimiter(ctx);
      const kind = await handle.ready;
      kinds[kind] = (kinds[kind] ?? 0) + 1;
      if (kind !== "worklet") failures.push(i);
      handle.dispose();
    }
    return { kinds, failures };
  }, limiterTrials);

  await browser.close();
  server.kill();

  console.log(`\n=== master limiter module load, ${limiterTrials} fresh OfflineAudioContext(s) ===\n`);
  console.log(`   worklet  : ${trials.kinds.worklet}`);
  console.log(`   fallback : ${trials.kinds.fallback}`);
  const rate = trials.kinds.fallback / limiterTrials;
  console.log(
    `\n   failure rate : ${(rate * 100).toFixed(2)} %` +
      (trials.kinds.fallback > 0
        ? `   -> 1 render in ${Math.round(1 / rate)} silently uses a DIFFERENT limiter,\n` +
          `      which is enough to make the same project render two different files.`
        : "   -> no failure observed in this many trials")
  );
  console.log();
  process.exit(0);
}

const result = await page.evaluate(
  async ({ id, n }) => {
    const wav = await import("/src/audio/WavExporter.ts");
    const timbre = await import("/src/test/helpers/timbre.ts");
    const mixModule = await import("/src/data/genreMix.ts");
    const genres = await import("/src/data/genres/index.ts");
    const trackUtils = await import("/src/utils/trackUtils.ts");
    const limiterModule = await import("/src/audio/MasterLimiter.ts");

    const genre = genres.ALL_GENRES.find((g) => g.id === id);
    if (!genre) throw new Error(`unknown genre: ${id}`);
    const drumKit = trackUtils.getDefaultDrumKitForGenre(genre);

    /**
     * The one categorical difference between two runs of the same render: which limiter path the
     * bounce went through. `renderPatternOffline` awaits `limiter.ready`, so if `addModule` fails on
     * some runs — a cold network fetch versus a warm one, say — the same project is limited by an
     * AudioWorklet on one run and by a `DynamicsCompressor` on the next, and the two never produce
     * the same samples. Creating limiters in fresh contexts directly measures exactly that.
     */
    const limiterKinds = [];
    for (let i = 0; i < 6; i++) {
      const ctx = new OfflineAudioContext(2, 128, 44100);
      const handle = limiterModule.createMasterLimiter(ctx);
      limiterKinds.push(await handle.ready);
      handle.dispose();
    }

    /** FNV-1a over the raw float bits — equality here means "the audio is the same". */
    const hashChannels = (channels) => {
      let h = 0x811c9dc5;
      const view = new DataView(new ArrayBuffer(4));
      for (const ch of channels) {
        for (let i = 0; i < ch.length; i++) {
          view.setFloat32(0, ch[i]);
          const word = view.getUint32(0);
          for (let b = 0; b < 4; b++) {
            h ^= (word >>> (b * 8)) & 0xff;
            h = Math.imul(h, 0x01000193) >>> 0;
          }
        }
      }
      return h.toString(16).padStart(8, "0");
    };

    const rows = [];
    for (let r = 0; r < n; r++) {
      const buffer = await wav.renderPatternOffline(
        mixModule.applyGenreMixDefaults(genre.sequencer_pattern, genre.id),
        { bars: 3, drumKit, loudnessTrimDb: 0 }
      );
      const channels = [];
      for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
      const fp = timbre.fingerprintChannels(channels, buffer.sampleRate);
      rows.push({
        repeat: r,
        sampleHash: hashChannels(channels),
        bandDb: fp.bandDb,
        rmsDb: fp.rmsDb,
      });
    }

    /**
     * Which track is responsible? Renders each track alone (every other track's steps zeroed) twice
     * and reports whether that pair is stable. A single culprit track turns "the renderer is
     * non-deterministic" into one place to look.
     */
    const base = mixModule.applyGenreMixDefaults(genre.sequencer_pattern, genre.id);
    const soloRows = [];
    for (let trackIdx = 0; trackIdx < base.tracks.length; trackIdx++) {
      const build = () => ({
        ...base,
        tracks: base.tracks.map((t, i) => ({
          ...t,
          steps: i === trackIdx ? t.steps : t.steps.map(() => 0),
        })),
      });
      const hashes = [];
      for (let r = 0; r < 2; r++) {
        const buffer = await wav.renderPatternOffline(build(), {
          bars: 3,
          drumKit,
          loudnessTrimDb: 0,
        });
        const channels = [];
        for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
        hashes.push(hashChannels(channels));
      }
      soloRows.push({
        track: base.tracks[trackIdx].track_id,
        instrument: base.tracks[trackIdx].instrument,
        stable: hashes[0] === hashes[1],
        hashes,
      });
    }

    /**
     * Which *stage* is responsible? Every track showed the instability in isolation, so the cause is
     * in the chain every track shares. These configurations remove one shared stage at a time by
     * zeroing the per-track sends; whichever one restores bit-stability names the culprit bus.
     */
    const stageRows = [];
    const stages = [
      ["all sends on (baseline)", () => base],
      [
        "no sends (dry)",
        () => ({
          ...base,
          tracks: base.tracks.map((t) => ({ ...t, sendA: 0, sendB: 0 })),
        }),
      ],
      [
        "reverb send only",
        () => ({
          ...base,
          tracks: base.tracks.map((t) => ({ ...t, sendA: t.sendA ?? 0, sendB: 0 })),
        }),
      ],
      [
        "delay send only",
        () => ({
          ...base,
          tracks: base.tracks.map((t) => ({ ...t, sendA: 0, sendB: t.sendB ?? 0 })),
        }),
      ],
    ];
    for (const [label, build] of stages) {
      const hashes = [];
      for (let r = 0; r < 2; r++) {
        const buffer = await wav.renderPatternOffline(build(), {
          bars: 3,
          drumKit,
          loudnessTrimDb: 0,
        });
        const channels = [];
        for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
        hashes.push(hashChannels(channels));
      }
      stageRows.push({ label, stable: hashes[0] === hashes[1], hashes });
    }

    return { rows, soloRows, stageRows, limiterKinds };
  },
  { id: genreId, n: repeats }
);

await browser.close();
server.kill();

console.log(`\n=== ${genreId}: ${repeats} repeats in one page ===\n`);
const out = result.rows;
const distinctHashes = new Set(out.map((r) => r.sampleHash));
for (const r of out) {
  console.log(`  repeat ${r.repeat}: sampleHash=${r.sampleHash}  rmsDb=${r.rmsDb.toFixed(6)}`);
}
console.log(
  `\n  distinct sample hashes : ${distinctHashes.size} / ${out.length}` +
    (distinctHashes.size === 1
      ? "   -> the AUDIO is bit-identical; the band delta is a fingerprint artifact"
      : "   -> the AUDIO really differs; something is non-deterministic in the render")
);
console.log(`\n  per-repeat bandDb (dB) for the bands that move:`);
for (let k = 0; k < out[0].bandDb.length; k++) {
  const values = out.map((r) => r.bandDb[k]);
  const spread = Math.max(...values) - Math.min(...values);
  if (spread > 1e-9) {
    console.log(
      `   band ${String(k).padStart(2)}  ${values.map((v) => v.toFixed(6).padStart(11)).join("  ")}   spread ${spread.toFixed(6)}`
    );
  }
}
console.log(`\n  limiter path per fresh OfflineAudioContext (6 attempts):`);
console.log(`   ${result.limiterKinds.join(", ")}`);
if (new Set(result.limiterKinds).size > 1) {
  console.log(`   UNSTABLE  <-- the bounce alternates between two different limiters`);
}
if (consoleLines.length) {
  console.log(`\n  page console (errors + warnings):`);
  for (const line of consoleLines) console.log(`   ${line}`);
}
console.log(`\n  per-track isolation (two renders each, other tracks zeroed):`);
for (const s of result.soloRows) {
  console.log(
    `   ${s.track.padEnd(11)} ${String(s.instrument).padEnd(16)} ${s.stable ? "stable" : "UNSTABLE  <-- this track is the cause"}`
  );
}
console.log(`\n  per-stage isolation (two renders each, one shared stage removed at a time):`);
for (const s of result.stageRows) {
  console.log(`   ${s.label.padEnd(24)} ${s.stable ? "stable" : "UNSTABLE  <-- this stage is the cause"}`);
}
console.log();
