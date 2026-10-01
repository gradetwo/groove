#!/usr/bin/env node
/**
 * What the **offline renderer** does with a VSCO 2 CE sampler lane when the SFZ and its sample bytes cannot be fetched.
 *
 * ## Why this exists
 *
 * An independent user re-tested VSCO 2 CE end to end and reported that the sampler lane had never produced sound: at one commit it was
 * `skippedLanes` with "an audio lane has no notes to schedule"; at the next the lane was still skipped, now with *"neither address served the
 * SFZ — Failed to fetch"*, while `curl` on both addresses returned 200. The −28.8 dB / −31.1 dB of audio she measured came from the **default
 * instrument** track a `blankKind: "sampler"` arrangement starts with.
 *
 * That report is about the browser's `fetch` failing where `curl` succeeds. This probe reproduces it on purpose, with no network dependence
 * on GitHub: it renders the same arrangement through the same page `mcp/render/worker.ts` drives, while a Playwright route makes every
 * `raw.githubusercontent.com` request fail the way an unreachable host does. What it prints is the renderer's **own report** and the lane's
 * real contribution, so "the lane is silent" and "the reply says the lane rendered" can be compared rather than assumed.
 *
 * ## Running it
 *
 *     node scripts/probe_vsco_fetch_failure.mjs
 *     node scripts/probe_vsco_fetch_failure.mjs --allow-source   # leave GitHub reachable: the control
 *
 * It drives a real Vite dev server and a real Chromium, so it needs the repository's own `node_modules` and Playwright's browsers. Nothing it
 * prints is synthesised: the numbers are the exported WAV's own measurements.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const allowSource = process.argv.includes("--allow-source");

const loudness = await import("../src/test/helpers/loudness.ts");
const timbre = await import("../src/test/helpers/timbre.ts");

function aFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => (port > 0 ? resolve(port) : reject(new Error("no free port"))));
    });
  });
}

/** The address the manifest gives VSCO's staccato bassoon, byte-for-byte what the worker threads into the page. */
const MIRROR_ROOT = "https://r2mirror.groove.wangda.today";
const MANIFEST = fs.readFileSync(path.join(ROOT, "public", "samples", "manifest.json"), "utf8");

/** One bar, one VSCO sampler lane, four pitched notes — plus the default kit notes `blankKind: "sampler"` starts with. */
const STEPS = 16;
const steps = new Array(STEPS).fill(0);
const pitch = new Array(STEPS).fill(null);
steps[0] = 1; pitch[0] = 48;
steps[4] = 1; pitch[4] = 50;
steps[8] = 1; pitch[8] = 52;
steps[12] = 1; pitch[12] = 53;
const pattern = {
  genre_id: "custom",
  bpm: 120,
  scale: "chromatic",
  resolution: "1/16",
  totalSteps: STEPS,
  tracks: [
    {
      track_id: "audio",
      laneId: "sampler-1",
      name: "Sampler",
      instrument: "sampler",
      steps,
      velocity: new Array(STEPS).fill(100),
      pitch,
      gate: new Array(STEPS).fill(1),
      volume: 0.8,
      pan: 0,
      mute: false,
      solo: false,
      sample: { assetId: "vsco2ce:BassoonStac" },
    },
  ],
};

const port = await aFreePort();
const viteBin = path.join(ROOT, "node_modules", "vite", "bin", "vite.js");
if (!fs.existsSync(viteBin)) throw new Error(`cannot render in a browser: ${viteBin} not found`);
const child = spawn(process.execPath, [viteBin, "--port", String(port), "--strictPort"], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});

let browser = null;
try {
  await new Promise((resolve, reject) => {
    let output = "";
    const onData = (chunk) => {
      output += chunk.toString();
      if (/Local:\s+http/.test(output) || /ready in/.test(output)) resolve();
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("exit", (code) => reject(new Error(`vite exited early (${code}):\n${output}`)));
    setTimeout(() => reject(new Error(`vite did not become ready in 60s:\n${output}`)), 60000);
  });

  const { chromium } = await import("playwright");
  browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage();
  /** The trace is the point of the probe: the exact URL the loader asked for, and what the browser said about it. */
  page.on("request", (r) => {
    if (/r2mirror|raw\.githubusercontent/.test(r.url())) console.log(`  >>> ${r.method()} ${r.url()}`);
  });
  page.on("response", (r) => {
    if (/r2mirror|raw\.githubusercontent/.test(r.url())) console.log(`  <<< ${r.status()} ${r.url()}`);
  });
  page.on("requestfailed", (r) => {
    if (/r2mirror|raw\.githubusercontent/.test(r.url())) console.log(`  !!! ${r.failure()?.errorText} ${r.url()}`);
  });
  if (!allowSource) {
    await page.route("**://raw.githubusercontent.com/**", (route) => route.abort("connectionfailed"));
    console.log("route: every raw.githubusercontent.com request is aborted (connectionfailed)\n");
  }
  /**
   * A long navigation budget on purpose: this repository's machines run parallel worktrees, and a loaded host takes tens of seconds to reach
   * `domcontentloaded` on an app of this size. A 30 s default read as "the probe is broken" while the page was in fact arriving (measured: the
   * Vite client connected at ~15 s under a load average of 11). The timeout is not a correctness knob, so it is set where it cannot mislead.
   */
  page.setDefaultTimeout(180000);
  await page.goto(`http://127.0.0.1:${port}`, { waitUntil: "domcontentloaded", timeout: 180000 });

  /**
   * **Phase 1: what the *mirror* thinks it is serving.**
   *
   * This is the measurement a `curl` cannot make. A cross-origin `fetch` of the mirror either resolves (the response carried
   * `Access-Control-Allow-Origin`) or throws, and when it throws the same URL is asked again in `no-cors` mode: that one skips the CORS check, so a
   * resolution there means the host served the object and the *page* was refused — the exact pair of facts the user's report juxtaposed
   * ("curl 200" beside "Failed to fetch") without a way to connect.
   */
  const mirrorVerdict = await page.evaluate(async (url) => {
    const out = { url };
    try {
      const response = await fetch(url);
      out.cors = { ok: response.ok, status: response.status, acao: response.headers.get("access-control-allow-origin") };
    } catch (error) {
      out.cors = { threw: String(error) };
    }
    try {
      const response = await fetch(url, { mode: "no-cors" });
      out.noCors = { type: response.type, status: response.status };
    } catch (error) {
      out.noCors = { threw: String(error) };
    }
    return out;
  }, `${MIRROR_ROOT}/vsco2ce/BassoonStac.sfz`);
  console.log("\n=== the mirror's own SFZ, fetched inside the page ===");
  console.log(`  ${MIRROR_ROOT}/vsco2ce/BassoonStac.sfz`);
  console.log(`  fetch()          -> ${JSON.stringify(mirrorVerdict.cors)}`);
  console.log(`  fetch(no-cors)   -> ${JSON.stringify(mirrorVerdict.noCors)}`);
  const mirrorRefusedByCors = "threw" in mirrorVerdict.cors && !("threw" in mirrorVerdict.noCors);
  console.log(
    mirrorRefusedByCors
      ? "  ⇒ the mirror serves the object and the page is refused it: the response carries no `Access-Control-Allow-Origin`.\n" +
        "    That is a bucket setting (R2 → the bucket → Settings → CORS), not a path and not the loader."
      : "  ⇒ the mirror did not answer in either mode, so this is not an origin decision."
  );

  const args = JSON.stringify({ pattern, manifest: MANIFEST, root: MIRROR_ROOT });
  const expression = `(async () => {
    const args = ${args};
    const [wav, catalogue, timeline] = await Promise.all([
      import("/src/audio/WavExporter.ts"),
      import("/src/data/sampleCatalogue.ts"),
      import("/src/audio/offlineAudioLanes.ts"),
    ]);
    const { assets } = catalogue.catalogueFromManifestText(args.manifest, args.root);
    let report = null;
    const buffer = await wav.renderPatternOffline(args.pattern, {
      bars: 1,
      audioLaneCatalogue: assets,
      onAudioLanes: (r) => { report = r; },
    });
    const chans = [];
    for (let c = 0; c < buffer.numberOfChannels; c += 1) chans.push(buffer.getChannelData(c));
    const bytes = new Uint8Array(chans[0].byteLength * chans.length);
    chans.forEach((d, c) => bytes.set(new Uint8Array(d.buffer, d.byteOffset, d.byteLength), c * d.byteLength));
    let binary = "";
    const chunk = 1 << 15;
    for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
    return { base64: btoa(binary), sampleRate: buffer.sampleRate, channels: buffer.numberOfChannels, report };
  })()`;
  const rendered = await page.evaluate(expression);

  const bytes = Buffer.from(rendered.base64, "base64");
  const per = bytes.length / rendered.channels;
  const chans = [];
  for (let c = 0; c < rendered.channels; c += 1) {
    const copy = bytes.subarray(c * per, (c + 1) * per);
    chans.push(new Float32Array(copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength)));
  }
  const fingerprint = timbre.fingerprintChannels(chans, rendered.sampleRate);
  const report = rendered.report;
  const laneRendered = (report?.lanes ?? []).length > 0;
  const laneAudio = (report?.events ?? 0) > 0;

  console.log("\n=== the renderer's own report for the VSCO lane ===");
  console.log(JSON.stringify(report, null, 2));
  console.log("\n=== the file it produced ===");
  console.log(`truePeak   ${loudness.truePeakDbChannels(chans).toFixed(2)} dB`);
  console.log(`LUFS       ${loudness.measureLoudness(chans, rendered.sampleRate).integratedLufs.toFixed(2)}`);
  console.log(`rmsDb      ${fingerprint.rmsDb.toFixed(2)} dB`);
  console.log(`events     ${report?.events ?? 0}`);
  console.log(`\nrenderedAudioLanes = ${laneRendered ? "PRESENT (the reply reads as rendered)" : "absent"}`);
  console.log(`events > 0        = ${laneAudio}`);
  console.log(
    laneRendered && !laneAudio
      ? "\nVERDICT  the reply claims the lane rendered while no sample reached the mix — this is the failure to fix"
      : !laneRendered
        ? "\nVERDICT  the lane is reported as unresolvable, with the reason above"
        : "\nVERDICT  the lane really rendered"
  );
} finally {
  await browser?.close().catch(() => undefined);
  child.kill("SIGTERM");
}
