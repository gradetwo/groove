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

const genre = value("genre", "house");
const out = value("out", "");
const port = Number(value("port", "6181")) || 6181;

const { chromium } = await import("playwright");
const { server } = await startStaticServer(port);
const browser = await chromium.launch();
const page = await browser.newPage();

try {
  await page.goto(`http://127.0.0.1:${port}/?probe=1`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__grooveProbe), { timeout: 20000 });

  /**
   * The **gesture**, before anything is measured.
   *
   * The first run of this probe reported a difference between the sections and levels of −82 dBFS: the audio context was
   * still suspended by the browser's autoplay policy, so both windows were silence and the "difference" was noise. A
   * check that cannot tell silence from music is worse than no check, so the start gate is clicked first and the context
   * state is asserted before sampling.
   */
  const gate = page.getByRole("button", { name: /启动音频引擎|Start Audio Engine/ });
  if (await gate.count()) await gate.first().click();
  await page.waitForTimeout(1500);

  /**
   * Build the two sections, start the transport, and sample the analyser on both sides of the boundary.
   *
   * The section lengths come from the genre's own pattern: one pass is `totalSteps / 4` beats, so the boundary lands at
   * `bars * secondsPerBar`. Sampling starts well inside each section to avoid the fade between them, and the same number
   * of analyser frames is taken on each side.
   */
  const result = await page.evaluate(
    async ({ genreId, sampleMs }) => {
      const probe = window.__grooveProbe;
      if (!probe) return { error: "no probe surface" };
      const state = probe.readState();
      const bpm = state.bpm || 120;
      const secondsPerBar = (60 / bpm) * 4;

      // Two one-bar sections that are audibly different: the same clip, the second quieter with the lead muted.
      probe.commit({
        type: "SET_SECTIONS",
        sections: [
          { id: "probe-a", slot: "A", bars: 1, label: "probe A" },
          { id: "probe-b", slot: "A", bars: 1, velocityScale: 0.55, mute: ["lead"], label: "probe B" },
        ],
      });
      // The store's song-mode action is a toggle, so set it by reading the live state rather than assuming.
      if (!probe.readState().songMode) probe.commit({ type: "TOGGLE_SONG_MODE" });

      const analyser = probe.engine.getMasterAnalyser();
      if (!analyser) return { error: "the engine exposes no master analyser" };
      const contextState = analyser.context?.state ?? "unknown";
      if (contextState !== "running") return { error: `the audio context is ${contextState}, not running` };
      const bins = new Float32Array(analyser.frequencyBinCount);
      const read = () => {
        analyser.getFloatFrequencyData(bins);
        return Array.from(bins);
      };

      await probe.engine.play();
      const started = performance.now();
      const windows = { a: [], b: [] };
      const sample = () => {
        const t = (performance.now() - started) / 1000;
        // Section A is bar 0, section B is bar 1: sample the middle of each.
        if (t > secondsPerBar * 0.25 && t < secondsPerBar * 0.75) windows.a.push(read());
        if (t > secondsPerBar * 1.25 && t < secondsPerBar * 1.75) windows.b.push(read());
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
        meanLevelA: meanLevel(windows.a),
        meanLevelB: meanLevel(windows.b),
      };
    },
    { genreId: genre, sampleMs: 40 }
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
    const ratio = selfDistanceA ? distanceAB / selfDistanceA : Infinity;
    console.log(
      `\n${ratio >= 3 ? "✅" : "❌"} the two sections differ by ${distanceAB.toFixed(2)} dB/band ` +
        `against a same-section noise floor of ${selfDistanceA?.toFixed(2) ?? "n/a"} (ratio ${ratio.toFixed(1)}×)`
    );
    if (ratio < 3) process.exitCode = 1;
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
