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
 * ## Why it also sweeps velocity
 *
 * The third axis is **velocity**, added after the genre-stem sweep reported +30 dB for `strings_lead` while this
 * calibration called the same instrument perfect: both uses send the same velocity to both engines, but the **native**
 * presets carry `velocityToCutoff` and `velocityToFilterEnv` (a soft note is a *darker* note) while a GS-1 voice reads
 * velocity as amplitude. A lane played quietly is therefore two different sounds, and the only way to know how far apart
 * is to measure it.
 *
 * The first version played one held note and called all 26 instruments correct — and a lane that calibrated at ±0.0 dB
 * still rendered 13 dB quiet in its genre, because the patch attacked over 360 ms where its native preset attacked in
 * 80 ms and the genre cut the note first. **A held note cannot see an attack**, and one note cannot see keyboard
 * tracking. So each instrument is measured at three notes in the register its lane actually plays, and at each note
 * twice: held (gate 4) and as a **stab** (gate 0.3), which is what a great many of these lanes actually play.
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
/** The velocities a lane is actually played at: `velocityScale` sections and soft parts live in the lower half. */
const VELOCITIES = (value("velocities", "0.35,0.9") || "0.35,0.9")
  .split(",")
  .map((v) => Number(v))
  .filter((v) => Number.isFinite(v) && v > 0 && v <= 1);
const SHARD = value("shard", "1/1");
/** A single lane/instrument to measure, for iterating on one row instead of all 26. */
const ONLY = value("instrument", "");
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
  .filter((target) => !ONLY || target.instrument === ONLY)
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

/**
 * The register each lane actually plays in: three notes, so keyboard tracking shows up as a difference between them.
 * `chords` sits low, `lead` sits high, and `fx` in between — the spans come from the catalogue's own patterns.
 */
const NOTES_FOR = { chords: [36, 48, 60], lead: [60, 72, 84], fx: [48, 60] };
const TRACK_FOR = { chords: 5, lead: 6, fx: 7 };

const rows = [];
for (const target of targets) {
  try {
    const measured = await page.evaluate(
      async ({ role, instrument, notes, takes, velocities }) => {
        const engine = window.__grooveProbe.engine;
        const trackIdx = { chords: 5, lead: 6, fx: 7 }[role];
        /**
         * A synthetic pattern: **one** lane carrying the instrument under test, every other lane silent. The tempo is
         * slow so a held note is long enough to measure through.
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
        const nameFor = { chords: "Chords", lead: "Lead", fx: "FX" }[role];

        /** One note through the requested routing, measured for `windowMs`, returning peak / rms / zero-crossings. */
        /**
         * Wait until the room is **actually** quiet before the next note.
         *
         * A fixed delay was the first version, and it produced a stab reading of exactly 0.0 dB for every instrument:
         * a pad's release is longer than the delay, so both takes were measuring the *previous* note's tail. The probe
         * now polls the analyser until the level falls below a floor (or gives up after three seconds, so a genuinely
         * stuck voice is visible as a bad reading rather than a hang).
         */
        const waitForQuiet = async (floor = 0.004, budgetMs = 3000) => {
          const started = performance.now();
          while (performance.now() - started < budgetMs) {
            analyser.getFloatTimeDomainData(wave);
            let peak = 0;
            for (let i = 0; i < wave.length; i += 1) peak = Math.max(peak, Math.abs(wave[i]));
            if (peak < floor) return true;
            await new Promise((r) => requestAnimationFrame(r));
          }
          return false;
        };
        const take = async (gs1On, note, gate, windowMs, velocity = 0.9) => {
          engine.setGs1Enabled(gs1On);
          await waitForQuiet();
          engine.triggerNote(trackIdx, nameFor, velocity, note, 1, gate);
          let peak = 0;
          let sum = 0;
          let count = 0;
          let crossings = 0;
          let previous = 0;
          const started = performance.now();
          while (performance.now() - started < windowMs) {
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
          return { peak, rms: Math.sqrt(sum / Math.max(1, count)), zcr: crossings / (count / analyser.context.sampleRate) };
        };

        const out = [];
        for (const note of notes) {
          /**
           * The velocity sweep: the same note at each velocity a lane is played at, held. This is where a preset's
           * velocity-to-cutoff response and a GS-1 voice's flat amplitude response part company.
           */
          const velocityRows = [];
          for (const velocity of velocities) {
            const g = [];
            const n = [];
            for (let i = 0; i < takes; i += 1) {
              g.push(await take(true, note, 4, 700, velocity));
              n.push(await take(false, note, 4, 700, velocity));
            }
            velocityRows.push({ velocity, gs1: g, native: n });
          }
          const held = [];
          const stab = [];
          for (let i = 0; i < takes; i += 1) {
            held.push({ gs1: await take(true, note, 4, 700), native: await take(false, note, 4, 700) });
            /**
             * A **stab**: the articulation most of these lanes actually play (a beat or so, not a click). At 60 bpm a
             * gate of 1.2 is a ~450 ms note — long enough to include the attack-to-sustain transition, which is exactly
             * where a patch whose attack is slower than its native preset loses its level. A 0.3 gate measured the
             * initial transient instead and reported 0.0 dB for every instrument, which is a measurement of nothing.
             */
            stab.push({ gs1: await take(true, note, 1.2, 500), native: await take(false, note, 1.2, 500) });
          }
          out.push({ note, held, stab, velocityRows });
        }
        return out;
      },
      {
        role: target.role,
        instrument: target.instrument,
        notes: NOTES_FOR[target.role] ?? [60],
        takes: TAKES,
        velocities: VELOCITIES,
      }
    );

    const median = (values) => {
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)];
    };
    const db = (v) => (v <= 1e-9 ? -120 : 20 * Math.log10(v));
    const perNote = measured.map((entry) => {
      const gs1Held = median(entry.held.map((t) => t.gs1.rms));
      const nativeHeld = median(entry.held.map((t) => t.native.rms));
      /**
       * The stab's **rms**, not its peak: a note that reaches the master limiter shows the limiter's ceiling as its
       * peak, and two different instruments both measured 0.667 — a metric that reports the same number for everything
       * is measuring the ceiling, not the voice.
       */
      const gs1Stab = median(entry.stab.map((t) => t.gs1.rms));
      const nativeStab = median(entry.stab.map((t) => t.native.rms));
      const gs1Zcr = median(entry.held.map((t) => t.gs1.zcr));
      const nativeZcr = median(entry.held.map((t) => t.native.zcr));
      const byVelocity = entry.velocityRows.map((row) => {
        const gs1 = median(row.gs1.map((t) => t.rms));
        const native = median(row.native.map((t) => t.rms));
        return { velocity: row.velocity, levelDb: Number((db(gs1) - db(native)).toFixed(1)) };
      });
      return {
        note: entry.note,
        byVelocity,
        heldLevelDb: Number((db(gs1Held) - db(nativeHeld)).toFixed(1)),
        stabLevelDb: Number((db(gs1Stab) - db(nativeStab)).toFixed(1)),
        brightnessRatio: Number((gs1Zcr / Math.max(1, nativeZcr)).toFixed(2)),
        // Raw values, because a delta of exactly 0.0 is either a coincidence or a measurement of nothing.
        gs1HeldRms: Number(gs1Held.toFixed(5)),
        nativeHeldRms: Number(nativeHeld.toFixed(5)),
        gs1StabRms: Number(gs1Stab.toFixed(5)),
        nativeStabRms: Number(nativeStab.toFixed(5)),
      };
    });
    const heldSpread = Math.max(...perNote.map((n) => n.heldLevelDb)) - Math.min(...perNote.map((n) => n.heldLevelDb));
    const worstStab = perNote.reduce((worst, n) => (Math.abs(n.stabLevelDb) > Math.abs(worst) ? n.stabLevelDb : worst), 0);
    const worstHeld = perNote.reduce((worst, n) => (Math.abs(n.heldLevelDb) > Math.abs(worst) ? n.heldLevelDb : worst), 0);
    const worstBrightness = perNote.reduce(
      (worst, n) => (Math.abs(Math.log(n.brightnessRatio)) > Math.abs(Math.log(worst)) ? n.brightnessRatio : worst),
      1
    );
    rows.push({
      role: target.role,
      instrument: target.instrument,
      perNote,
      /** How much the level changes across the register: keyboard tracking shows up here. */
      registerSpreadDb: Number(heldSpread.toFixed(1)),
      /** How far apart the two engines sit at the *quiet* end versus the loud end: a velocity-response mismatch. */
      velocitySpreadDb: Number(
        (
          Math.max(...perNote.flatMap((n) => n.byVelocity.map((v) => v.levelDb))) -
          Math.min(...perNote.flatMap((n) => n.byVelocity.map((v) => v.levelDb)))
        ).toFixed(1)
      ),
      worstHeldDb: worstHeld,
      worstStabDb: worstStab,
      worstBrightness,
      verdict:
        Math.abs(worstHeld) > 3 || Math.abs(worstStab) > 3
          ? Math.abs(worstStab) > Math.abs(worstHeld)
            ? "stab-level"
            : "level"
          : worstBrightness > 1.5 || worstBrightness < 1 / 1.5
            ? "timbre"
            : heldSpread > 4
              ? "register"
              : Math.abs(
                    Math.max(
                      ...perNote.flatMap((n) => n.byVelocity.filter((v) => v.velocity < 0.5).map((v) => v.levelDb))
                    )
                  ) > 3
                ? "velocity"
                : "ok",
    });
  } catch (error) {
    rows.push({ role: target.role, instrument: target.instrument, error: String(error?.message ?? error).slice(0, 120) });

  }
}

await browser.close();
server.close();

rows.sort((a, b) => Math.abs(b.worstStabDb ?? 0) - Math.abs(a.worstStabDb ?? 0));
if (OUT) fs.writeFileSync(OUT, `${JSON.stringify(rows, null, 1)}\n`);
if (asJson) {
  console.log(JSON.stringify(rows, null, 1));
} else {
  console.log(
  `GS-1 instrument calibration · shard ${SHARD} · ${TAKES} takes · per note "held/stab" level vs native, one lane, no other lanes`
);
  for (const row of rows) {
    if (row.error) {
      console.log(`  ❌ ${row.role.padEnd(7)} ${row.instrument.padEnd(16)} ${row.error}`);
      continue;
    }
    const notes = row.perNote
      .map((n) => `${n.note}:${n.heldLevelDb >= 0 ? "+" : ""}${n.heldLevelDb}/${n.stabLevelDb >= 0 ? "+" : ""}${n.stabLevelDb}`)
      .join(" ");
    console.log(
      `  ${row.verdict === "ok" ? "✅" : "⚠️ "} ${row.role.padEnd(7)} ${row.instrument.padEnd(16)} ` +
        `held/stab ${notes.padEnd(28)} reg ${String(row.registerSpreadDb).padStart(4)} dB  vel ${String(row.velocitySpreadDb).padStart(5)} dB  ×${row.worstBrightness}  ${row.verdict}`
    );
  }
}
process.exit(0);
