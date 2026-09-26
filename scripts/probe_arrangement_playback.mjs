/**
 * B7's listening proof: does the transport actually **play** the arrangement?
 *
 * The arrangement plan left this as its largest honest gap. Playback used to bypass `patternForExport`, so a session
 * could be arranged, exported, measured — and still loop one pattern live. The first slice fed the console's answer to
 * the engine, and the unit tests pinned what the console feeds and how the playhead maps; what nothing could show was
 * that the **sound** changes when the playhead crosses a section boundary, because the engine is created inside the app
 * and a probe had no analyser to sample.
 *
 * `?probe=1` now exposes exactly that seam (`src/platform/probeHooks.ts`, asserted by a test to *not* exist without the
 * flag). This probe uses it: it makes a two-section song whose halves are deliberately different — the second quieter and
 * with the lead muted — plays it, and samples the master analyser inside each section. If the transport plays the
 * arrangement, the two windows differ by far more than the run-to-run noise of the same window; if it loops the pattern
 * being edited, they are the same sound and the check fails.
 *
 * Usage:
 *   node scripts/probe_arrangement_playback.mjs [--genre=house] [--bar-seconds=1.9] [--out=report.json]
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The MIME types the built app actually asks for. */
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

/**
 * Serve `dist/`, the same shape the other probes use.
 *
 * A no-store static server rather than a rebuild: the loudness re-record measures the *same* build this probe drives, and
 * rebuilding underneath it would change the artefact mid-measurement. A playback-only check does not need a new bundle —
 * and should not make one.
 */
function startStaticServer(port) {
  const dist = path.join(ROOT, "dist");
  if (!fs.existsSync(path.join(dist, "index.html"))) {
    console.error("❌ dist/index.html not found — run `npm run build` first.");
    process.exit(1);
  }
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    let file = path.join(dist, decodeURIComponent(url.pathname));
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, "index.html");
    const body = fs.readFileSync(file);
    res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

const args = process.argv.slice(2);
const value = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const genre = value("genre", "uk-garage");
/**
 * The control experiment, and the one that decides what the last three runs meant.
 *
 * Every run so far has measured ~−80 dBFS, so the ratio has been a statement about silence. With this flag the probe commits **no
 * sections** and measures the plain loop instead, with the same analyser and the same windows: a silent loop means the probe's own
 * audio path is broken and B7 has no listening proof yet, while a loud loop with a silent song is a real finding about the
 * transport. The numbers are identical either way, which is what makes it a control.
 */
const controlLoop = process.argv.includes("--control-loop");
const out = value("out", "");
const port = Number(value("port", "6181")) || 6181;

const { chromium } = await import("playwright");
const { server } = await startStaticServer(port);
/**
 * The autoplay flag, because this is the one probe that needs a **live** context.
 *
 * Every other audio probe renders offline (`OfflineAudioContext`), where no gesture is required. A transport check has to
 * run the real engine, and headless Chromium keeps a live context suspended unless it is told not to — which is what left
 * the first honest runs measuring −80 dBFS of silence.
 */
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
/**
 * Surface the page's own failures.
 *
 * A probe that reports "the surface never appeared" without saying whether the app threw on the way there is a probe that
 * costs another run to interpret — and this one has already cost several.
 */
const pageFailures = [];
page.on("pageerror", (error) => pageFailures.push(`pageerror: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") pageFailures.push(`console: ${message.text().slice(0, 200)}`);
});

/**
 * Keep the surface once it has existed, because the app **installs and removes** it.
 *
 * The engine's teardown calls `uninstallProbeHooks`, and StudioView mounts more than once on a cold hash route, so the seam
 * appears and then vanishes — which is why a 3-second wait found it, a 5-second wait did not, and `waitForFunction` timings
 * out. An accessor installed before any app code runs records the first surface the app publishes, and that reference is what
 * the probe drives.
 */
await page.addInitScript(() => {
  let seen;
  Object.defineProperty(window, "__grooveProbe", {
    configurable: true,
    get: () => seen,
    set: (value) => {
      seen = value;
      window.__grooveProbeSeen = value;
    },
  });
});

try {
  /**
   * Open the **studio** on a genre, not the home screen.
   *
   * The hash router supports `#/studio?genre=…` (`src/app/router.tsx`), which is the difference between a probe that
   * measures a playing genre and one that measures silence — the failure the first honest run reported at −80 dBFS.
   */
  await page.goto(`http://127.0.0.1:${port}/?probe=1#/studio?genre=${encodeURIComponent(genre)}`, {
    waitUntil: "domcontentloaded",
  });
  /**
   * The **gesture**, before anything is measured.
   *
   * The first run of this probe reported a difference between the sections and levels of −82 dBFS: the audio context was
   * still suspended by the browser's autoplay policy, so both windows were silence and the "difference" was noise. A
   * check that cannot tell silence from music is worse than no check, so the start gate is clicked first and the context
   * state is asserted before sampling.
   */
  // The studio installs the surface with the engine; the **phone** shell has a start gate instead, and clicking a button
  // by a loose name turned out to navigate away from the studio rather than start the audio. So: wait for the surface, then
  // resume the context from inside it — the gesture a browser wants is satisfied by any user interaction, and the engine's
  // own `play()` is one.
  /**
   * Start the audio by the **gate's own test id**, then wait for the surface.
   *
   * The app shows a start overlay until a real gesture starts the context (`components/AudioStartGate.tsx`,
   * `data-testid="audio-start-gate"`), and the probe surface is installed with the engine — so the order is: gate,
   * surface, sound. Clicking a button *by its visible name* was the earlier mistake: a loose match navigated away from
   * the studio instead of starting anything.
   */
  /**
   * Four steps, each of which cost a run to find (recorded in `docs/ARRANGEMENT_PLAN.md`):
   *
   * 1. `#/studio?genre=…` loads the studio **on its Chords view**, where there is no transport at all — so the Studio tab
   *    is clicked first;
   * 2. the desktop has no `audio-start-gate` (that is the phone shell) — the engine, and therefore the probe surface, is
   *    built by the first thing that needs audio, which is the transport's own play control;
   * 3. the transport's control is found by the **app's own label** (`播放`/`Play`), not a loose text match, which once
   *    navigated away from the studio instead of starting anything;
   * 4. a settle, not a poll: `waitForFunction` was the flaky half of this probe.
   */
  console.error("debug: surface at 0s:", await page.evaluate(() => Boolean(window.__grooveProbe)));
  const gate = page.locator('[data-testid="audio-start-gate"]');
  if (await gate.count()) {
    await gate.getByRole("button").first().click();
  } else {
    // The nav item's label comes from the app's own translation, and the exact-name match is what the debug dump's
    // "Studio" text implies; a `hasText` regex was matching nothing.
    const studioTab = page.getByRole("button", { name: "Studio", exact: true }).first();
    if (await studioTab.count()) await studioTab.click();
    /**
     * …and **stop there**. The surface exists once the studio mounts (the engine lifecycle installs it), and pressing the
     * transport by hand turned out to tear the engine down again — the cleanup removes the hook — so the surface appeared
     * after the tab click and vanished after the play click. The transport is started from inside the surface instead
     * (`probe.engine.play()`), which is the whole reason the seam exists.
     */
    await page.waitForTimeout(1500);
  }
  await page.waitForTimeout(4000);
  const surfaceReady = await page.evaluate(() => Boolean(window.__grooveProbeSeen));
  if (!surfaceReady) {
    // Where it stopped, so the next attempt does not have to guess: the URL, the visible text, and whether the Studio
    // tab was even found.
    console.error("debug: url", page.url());
    console.error("debug: studio tab found:", await page.getByRole("button", { name: "Studio", exact: true }).count());
    console.error("debug: body", (await page.evaluate(() => document.body.innerText)).slice(0, 160).replace(/\n+/g, " | "));
    console.error("debug: page failures", pageFailures.slice(0, 5));
  }
  if (!surfaceReady) throw new Error("the probe surface never appeared — is the app serving ?probe=1 on this route?");

  /**
   * Build the two sections, start the transport, and sample the analyser on both sides of the boundary.
   *
   * The section lengths come from the genre's own pattern: one pass is `totalSteps / 4` beats, so the boundary lands at
   * `bars * secondsPerBar`. Sampling starts well inside each section to avoid the fade between them, and the same number
   * of analyser frames is taken on each side.
   */
  const result = await page.evaluate(
    async ({ genreId, sampleMs, controlLoop }) => {
      const probe = window.__grooveProbeSeen || window.__grooveProbe;
      if (!probe) return { error: "no probe surface" };
      const state = probe.readState();
      const bpm = state.bpm || 120;
      const secondsPerBar = (60 / bpm) * 4;

      // Two one-bar sections that are audibly different: the same clip, the second quieter with the lead muted.
      if (!controlLoop) probe.commit({
        type: "SET_SECTIONS",
        sections: [
          { id: "probe-a", slot: "A", bars: 2, label: "probe A" },
          /**
           * Structurally different, not merely quieter: the drums are muted, so the section's **spectral shape** changes rather
           * than its level. The earlier pair (0.55 velocity, lead muted) was so close that a mean spectrum over a bar could not
           * tell them apart — the geometry could not answer the question it was asked.
           */
          { id: "probe-b", slot: "A", bars: 2, velocityScale: 0.75, mute: ["kick", "snare", "hihat", "percussion"], label: "probe B" },
        ],
      });
      // The store's song-mode action is a toggle, so set it by reading the live state rather than assuming.
      if (!probe.readState().songMode) probe.commit({ type: "TOGGLE_SONG_MODE" });

      const analyser = probe.engine.getMasterAnalyser();
      if (!analyser) return { error: "the engine exposes no master analyser" };
      // A suspended context is silence, and silence is what the first honest run measured: resume it here, then insist.
      if (analyser.context?.state !== "running") await analyser.context?.resume?.();
      /**
       * Hand the engine the pattern the session is holding.
       *
       * The app does this from the console when it mounts; a probe that only calls `play()` runs an engine with nothing to
       * play, which is why both windows measured about −85 dBFS even with the surface reached. `readState().pattern` is the
       * same object the store renders (eight tracks, the genre's own bpm), and `setPattern` is the engine's own entry point
       * for it.
       */
      const sessionPattern = state.pattern;
      if (sessionPattern) probe.engine.setPattern(sessionPattern, true);
      const contextState = analyser.context?.state ?? "unknown";
      if (contextState !== "running") return { error: `the audio context is ${contextState}, not running` };
      const bins = new Float32Array(analyser.frequencyBinCount);
      const read = () => {
        analyser.getFloatFrequencyData(bins);
        if (!rawBins.first.length) {
          rawBins.first = [bins[1], bins[8], bins[64], bins[512], bins[bins.length - 1]].map((v) =>
            Number.isFinite(v) ? Number(v.toFixed(1)) : String(v)
          );
          for (let i = 0; i < bins.length; i += 1) if (Number.isFinite(bins[i])) rawBins.max = Math.max(rawBins.max, bins[i]);
        }
        return Array.from(bins);
      };
      /**
       * The waveform, and it is what separates the two ways this probe can see silence.
       *
       * Five runs have reported ~−80 dBFS on the FFT bands, and the control proved the plain loop is silent too — so the silence
       * is in the probe's audio path, not in the transport. The FFT cannot say *where*, because a −80 dB floor looks the same
       * whether no signal reaches the analyser or no signal is generated: a time-domain peak of exactly 0 means the analyser is
       * tapped off the bus that carries the sound, while a non-zero peak with a −80 dB spectrum would mean the opposite. The
       * engine's own view of itself comes back with it.
       */
      /**
       * The raw bins, because the waveform proves sound and the spectrum denies it.
       *
       * Peak 0.858 with bands at −85 dB is a contradiction that only a raw look resolves: if *every* bin sits at the floor the
       * reading is wrong as a whole (units, scaling, or an analyser that was reconfigured after it was wired), and if the low
       * bins are high while the rest are at the floor then the reading is fine and the bands being averaged are the wrong ones.
       */
      const rawBins = { first: [], max: -Infinity, minDecibels: analyser.minDecibels, fftSize: analyser.fftSize };
      const time = new Float32Array(analyser.fftSize);
      const wave = { peak: 0, rms: 0 };
      const readWave = () => {
        analyser.getFloatTimeDomainData(time);
        let peak = 0;
        let sum = 0;
        for (let i = 0; i < time.length; i += 1) {
          peak = Math.max(peak, Math.abs(time[i]));
          sum += time[i] * time[i];
        }
        wave.peak = Math.max(wave.peak, peak);
        wave.rms = Math.max(wave.rms, Math.sqrt(sum / time.length));
      };

      await probe.engine.play();
      const started = performance.now();
      const windows = { a: [], a2: [], b: [] };
      const sample = () => {
        const t = (performance.now() - started) / 1000;
        /**
         * Section A is bar 0 and section B is bar 1, and each window now spans its **whole** bar rather than its middle half.
         *
         * The first CI run reported a same-section "noise floor" of 9.94 dB/band against a 5.43 dB/band section difference
         * (ratio 0.5×) — and a floor that large from comparing a section with itself is not a floor. With ~12 frames per
         * window, halving them leaves ~6 frames of a bar whose content changes from beat to beat, so the "floor" was measuring
         * the music's own variation rather than measurement noise. Doubling the window halves that variance again before the
         * ratio is trusted; the levels are printed with it so silence and a real floor stay distinguishable.
         */
        /**
         * Section A occupies bars 0–1 and section B bars 2–3, so the windows are **the same beats of different bars**: `a` and
         * `a2` are two bars of the *same* section (the noise floor, time-aligned, so the music's own movement cancels) and `b` is
         * the first bar of the other section (the signal).
         */
        if (t > 0 && t < secondsPerBar) windows.a.push(read());
        if (t > secondsPerBar && t < secondsPerBar * 2) windows.a2.push(read());
        if (t > secondsPerBar * 2 && t < secondsPerBar * 3) windows.b.push(read());
        readWave();
      };
      const timer = setInterval(sample, 40);
      await new Promise((resolve) => setTimeout(resolve, secondsPerBar * 2000 + 300));
      clearInterval(timer);
      probe.engine.stop();

      const mean = (frames) => flatten(frames);
      /** The average band level in dB, so "is this silence?" has an answer. */
      const meanLevel = (frames) => {
        const spectrum = flatten(frames);
        return spectrum ? spectrum.reduce((a, b) => a + b, 0) / spectrum.length : null;
      };
      // Mean dB per band, and the average absolute difference between two sets of frames — the run-to-run noise floor.
      /** Mean dB per band across frames — a *spectrum*, not a sum of arrays. */
      const flatten = (frames) => {
        if (!frames.length) return null;
        const out = new Array(frames[0].length).fill(0);
        for (const frame of frames) for (let i = 0; i < frame.length; i++) out[i] += frame[i] / frames.length;
        return out;
      };
      const spectrumDistance = (left, right) => {
        if (!left || !right) return null;
        let sum = 0;
        for (let i = 0; i < left.length; i++) sum += Math.abs(left[i] - right[i]);
        return sum / left.length;
      };
      const noise = (() => {
        const frames = windows.a;
        if (frames.length < 4) return null;
        const half = Math.floor(frames.length / 2);
        return spectrumDistance(flatten(frames.slice(0, half)), flatten(frames.slice(half)));
      })();
      return {
        secondsPerBar,
        frames: { a: windows.a.length, b: windows.b.length },
        distanceAB: spectrumDistance(mean(windows.a), mean(windows.b)),
        selfDistanceA: noise,
        /** The time-aligned floor: two different bars of the same section, so what remains is measurement noise. */
        alignedFloor: spectrumDistance(mean(windows.a), mean(windows.a2)),
        meanLevelA: meanLevel(windows.a),
        meanLevelB: meanLevel(windows.b),
        wavePeak: wave.peak,
        waveRms: wave.rms,
        rawBins,
        // Whatever the engine believes about itself: playing or not, and which material it holds.
        statePreview: (() => {
          try {
            return JSON.stringify(probe.readState()).slice(0, 300);
          } catch (error) {
            return `readState threw: ${String(error)}`;
          }
        })(),
      };
    },
    { genreId: genre, sampleMs: 40, controlLoop }
  );

  const report = { genre, ...result };
  const text = JSON.stringify(report, null, 2);
  if (out) fs.writeFileSync(out, text);
  console.log(text);
  const { distanceAB, selfDistanceA, frames } = report;
  if (distanceAB === null || distanceAB === undefined) {
    console.error("❌ the probe could not measure both sections");
    process.exitCode = 1;
  } else if (!frames?.a || !frames?.b) {
    console.error("❌ one section produced no analyser frames — the transport may not have reached it");
    process.exitCode = 1;
  } else {
    /**
     * The ratio uses the **time-aligned** floor when it exists: two bars of the same section, same beats, so the music's own
     * movement cancels instead of being counted as noise. The frame-split floor stays in the output for comparison.
     */
    const floor = report.alignedFloor ?? selfDistanceA;
    const ratio = floor ? distanceAB / floor : Infinity;
    console.log(
      `\n${ratio >= 3 ? "✅" : "❌"} the two sections differ by ${distanceAB.toFixed(2)} dB/band ` +
        `against a time-aligned floor of ${floor?.toFixed(2) ?? "n/a"} (ratio ${ratio.toFixed(1)}×; frame-split floor ${selfDistanceA?.toFixed(2) ?? "n/a"})`
    );
    /**
     * The levels come with the ratio, because the two ways this measurement can be wrong look identical in the ratio: silence
     * (both windows near −80 dBFS) and a floor that is really the music's own variation. Printing them is what tells the two
     * apart, and it is the diagnostic the plan named before the next run.
     */
    console.log(
      `   window levels    : A ${report.meanLevelA?.toFixed(1) ?? "n/a"} dB · B ${report.meanLevelB?.toFixed(1) ?? "n/a"} dB` +
        ` · frames A/B ${report.frames?.a ?? 0}/${report.frames?.b ?? 0}`
    );
    /** Zero means the analyser is tapped off the sounding bus; non-zero with a −80 dB spectrum means the opposite. */
    console.log(
      `   analyser         : waveform peak ${report.wavePeak?.toFixed(6) ?? "n/a"} · rms ${report.waveRms?.toFixed(6) ?? "n/a"}`
    );
    console.log(`   engine state     : ${report.statePreview ?? "n/a"}`);
    /** The bins themselves: all at the floor means the reading is wrong; a loud low end means the reading is fine. */
    console.log(
      `   raw bins         : [${(report.rawBins?.first ?? []).join(", ")}] · max ${report.rawBins?.max ?? "n/a"} dB` +
        ` · minDecibels ${report.rawBins?.minDecibels ?? "n/a"} · fftSize ${report.rawBins?.fftSize ?? "n/a"}`
    );
    if (ratio < 3) process.exitCode = 1;
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
