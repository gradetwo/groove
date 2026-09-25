/**
 * One clean measurement per instrument: the GS-1 patch against its **native preset**, same note, same lane, nothing else.
 *
 * The instrument sweep measures a genre's mix, and the readings swing several dB between identical runs — a mix is too
 * noisy a probe to calibrate an instrument with. This one removes everything that is not the instrument: a synthetic
 * pattern with **one** lane on the instrument under test, no other lanes, a slow tempo and a long gate so the note is
 * sustained while it is measured, and the same note played twice — once with GS-1 routing on, once with it off, which is
 * the native preset the part was written for.
 *
 * Both takes go through the same channel strip and master, so the comparison is the *voice*, not the mix.
 *
 * The result is the calibration table the sweep's levels want: for each instrument, how many dB the GS-1 patch sits
 * away from its native reference and how its brightness compares, measured with as little else in the picture as the
 * app allows.
 *
 * Usage:
 *   node scripts/probe_gs1_calibration.mjs [--shard=1/4] [--takes=3] [--out=calibration.json]
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const playwright = require("playwright");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const value = (flag, fallback) => {
  const prefix = `--${flag}=`;
  const inline = process.argv.find((a) => a.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const at = process.argv.indexOf(`--${flag}`);
  return at !== -1 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
};
const TAKES = Math.max(1, Number(value("takes", "3")) || 3);
const SHARD = value("shard", "1/1");
const OUT = value("out", "");
const asJson = process.argv.includes("--json");

if (!fs.existsSync(path.join(ROOT, "dist", "index.html"))) {
  console.error("❌ dist/index.html is missing — build first (`npm run build`)");
  process.exit(1);
}

/** The instruments to calibrate, from the same committed dump the sweep uses. */
const lanes = Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", "genreLanes.json"), "utf8")));
const [shardIndex, shardCount] = SHARD.split("/").map(Number);
const targets = lanes
  .map((key) => {
    const [role, instrument] = key.split("::");
    return { role, instrument };
  })
  .filter((_, i) => i % (shardCount || 1) === (shardIndex || 1) - 1);

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const rel = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\//, "");
  const file = path.join(ROOT, "dist", rel);
  if (!file.startsWith(path.join(ROOT, "dist")) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end("not found");
    return;
  }
  res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

const browser = await playwright.chromium.launch({ args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.addInitScript(() => {
  try {
    localStorage.setItem("groove_onboarding_completed", "true");
    localStorage.setItem("groove_audio_started", "1");
    localStorage.removeItem("groove_project_v1");
  } catch {
    /* disabled */
  }
});
await page.goto(`http://127.0.0.1:${server.address().port}/?tab=studio&probe=1`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => Boolean(window.__grooveProbe), null, { timeout: 30000 });
await page.evaluate(() => window.__grooveProbe.engine.primeAudioContext());

/** One note per lane, in the register that lane actually plays in. */
const NOTE_FOR = { chords: 48, lead: 72, fx: 60 };
const TRACK_FOR = { chords: 5, lead: 6, fx: 7 };

const rows = [];
for (const target of targets) {
  try {
    const measured = await page.evaluate(
      async ({ role, instrument, takes }) => {
        const engine = window.__grooveProbe.engine;
        const trackIdx = { chords: 5, lead: 6, fx: 7 }[role];
        const note = { chords: 48, lead: 72, fx: 60 }[role];
        /**
         * A synthetic pattern: **one** lane carrying the instrument under test, every other lane silent. The tempo is
         * slow and the gate long so the note sustains for the whole measurement window.
         */
        const steps = 16;
        const track = (id, name, inst, pitches) => ({
          track_id: id,
          name,
          instrument: inst,
          steps: new Array(steps).fill(id === role ? 1 : 0),
          pitch: pitches,
        });
        const pattern = {
          genre_id: "calibration",
          bpm: 60,
          swing: 0,
          scale: "C minor",
          total_steps: steps,
          tracks: [
            track("chords", "Chords", role === "chords" ? instrument : "unrouted_placeholder", new Array(steps).fill(48)),
            track("lead", "Lead", role === "lead" ? instrument : "unrouted_placeholder", new Array(steps).fill(72)),
            track("fx", "FX", role === "fx" ? instrument : "unrouted_placeholder", new Array(steps).fill(60)),
          ],
        };
        engine.setPattern(pattern, { resetSteps: true });

        const analyser = engine.getMasterAnalyser();
        const wave = new Float32Array(analyser.fftSize);

        const take = async (gs1On) => {
          engine.setGs1Enabled(gs1On);
          // Let the previous take's tail die away, or it lands in this one's window.
          await new Promise((r) => setTimeout(r, 900));
          engine.triggerNote(trackIdx, role === "chords" ? "Chords" : role === "lead" ? "Lead" : "FX", 0.9, note, 1, 4);
          let peak = 0;
          let sum = 0;
          let count = 0;
          let crossings = 0;
          let previous = 0;
          const started = performance.now();
          while (performance.now() - started < 700) {
            analyser.getFloatTimeDomainData(wave);
            for (let i = 0; i < wave.length; i += 1) {
              const v = wave[i];
              const a = Math.abs(v);
              if (a > peak) peak = a;
              sum += v * v;
              count += 1;
              if ((v >= 0) !== (previous >= 0)) crossings += 1;
              previous = v;
            }
            await new Promise((r) => requestAnimationFrame(r));
          }
          return {
            peak,
            rms: Math.sqrt(sum / Math.max(1, count)),
            zcr: crossings / (count / analyser.context.sampleRate),
          };
        };

        const gs1 = [];
        const native = [];
        for (let i = 0; i < takes; i += 1) {
          gs1.push(await take(true));
          native.push(await take(false));
        }
        return { gs1, native };
      },
      { role: target.role, instrument: target.instrument, takes: TAKES }
    );

    const median = (values) => {
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)];
    };
    const gs1Rms = median(measured.gs1.map((m) => m.rms));
    const nativeRms = median(measured.native.map((m) => m.rms));
    const gs1Zcr = median(measured.gs1.map((m) => m.zcr));
    const nativeZcr = median(measured.native.map((m) => m.zcr));
    const db = (v) => (v <= 1e-9 ? -120 : 20 * Math.log10(v));
    rows.push({
      role: target.role,
      instrument: target.instrument,
      gs1Rms: Number(gs1Rms.toFixed(5)),
      nativeRms: Number(nativeRms.toFixed(5)),
      levelDb: Number((db(gs1Rms) - db(nativeRms)).toFixed(1)),
      brightnessRatio: Number((gs1Zcr / Math.max(1, nativeZcr)).toFixed(2)),
    });
  } catch (error) {
    rows.push({ role: target.role, instrument: target.instrument, error: String(error?.message ?? error).slice(0, 120) });
  }
}

await browser.close();
server.close();

rows.sort((a, b) => Math.abs(b.levelDb ?? 0) - Math.abs(a.levelDb ?? 0));
if (OUT) fs.writeFileSync(OUT, `${JSON.stringify(rows, null, 1)}\n`);
if (asJson) {
  console.log(JSON.stringify(rows, null, 1));
} else {
  console.log(`GS-1 instrument calibration · shard ${SHARD} · ${TAKES} takes · one held note per lane, no other lanes`);
  for (const row of rows) {
    if (row.error) {
      console.log(`  ❌ ${row.role.padEnd(7)} ${row.instrument.padEnd(16)} ${row.error}`);
      continue;
    }
    console.log(
      `  ${row.role.padEnd(7)} ${row.instrument.padEnd(16)} level ${String(row.levelDb).padStart(6)} dB  ` +
        `brightness ×${String(row.brightnessRatio).padStart(5)}  (gs1 rms ${row.gs1Rms}, native rms ${row.nativeRms})`
    );
  }
}
process.exit(0);
