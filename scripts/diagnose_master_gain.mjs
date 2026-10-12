/**
 * Diagnostic: what the master chain actually does to a genre, stage by stage.
 *
 * Reuses the measurement architecture (`measure_genre_loudness.mjs`): a Vite dev server plus
 * Chromium, rendering a genre offline through the *shared* master graph. It answers the question
 * a spread-only report cannot: how much of an applied makeup gain survives to the output, and
 * how much of it the true-peak limiter removes.
 *
 *   node scripts/diagnose_master_gain.mjs --genres=ambient,chicago-house
 */
import http from "http";
import fs from "fs";
import path from "path";
import { spawn } from "node:child_process";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require("playwright");
} catch {
  console.error("Playwright is required for this diagnostic.");
  process.exit(1);
}

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const argValue = (flag, fallback) => {
  const inline = argv.find((a) => a.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const genreIds = (argValue("--genres", "ambient,chicago-house") || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const bars = Math.max(1, Number(argValue("--bars", "3")) || 3);
const port = Number(argValue("--port", "3170")) || 3170;
const busComp = argValue("--buscomp", "on") !== "off";
const trims = (argValue("--trims", "0,3,6,9") || "")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n));
const makeups = (argValue("--makeups", "0,5,10,15") || "")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n));

function startStaticServer() {
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(404);
      res.end();
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function startVite(port) {
  const viteBin = path.join(ROOT, "node_modules/vite/bin/vite.js");
  const child = spawn(process.execPath, [viteBin, "--port", String(port), "--strictPort"], {
    cwd: ROOT,
    env: { ...process.env, BROWSER: "none" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (d) => (output += d.toString()));
  child.stderr.on("data", (d) => (output += d.toString()));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`vite did not start in 60s:\n${output}`)), 60000);
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/`);
        if (res.ok) {
          clearInterval(poll);
          clearTimeout(timer);
          resolve();
        }
      } catch {
        /* keep polling */
      }
    }, 400);
  });
  return child;
}

const main = async () => {
  const server = await startStaticServer();
  const vite = await startVite(port);
  const browser = await playwright.chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  try {
    const page = await browser.newPage();
    await page.route("**/__gain_probe__", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><html><head><meta charset=\"utf-8\"><title>gain probe</title></head><body></body></html>",
      })
    );
    await page.goto(`http://127.0.0.1:${port}/__gain_probe__`, { waitUntil: "domcontentloaded", timeout: 60000 });

    const rows = await page.evaluate(
      async ({ genreIds: ids, bars: barsArg, trims: trimList, makeups: makeupList, busComp }) => {
        const [wav, genresModule, mixModule, loudness, trackUtils] = await Promise.all([
          import("/src/audio/WavExporter.ts"),
          import("/src/data/genres/index.ts"),
          import("/src/data/genreMix.ts"),
          import("/src/test/helpers/loudness.ts"),
          import("/src/utils/trackUtils.ts"),
        ]);
        const out = [];
        for (const id of ids) {
          const genre = genresModule.ALL_GENRES.find((g) => g.id === id);
          if (!genre) continue;
          const drumKit = trackUtils.getDefaultDrumKitForGenre(genre);
          for (const trim of trimList) {
            for (const makeup of makeupList) {
              const buffer = await wav.renderPatternOffline(
                mixModule.applyGenreMixDefaults(genre.sequencer_pattern, genre.id),
                {
                  bars: barsArg,
                  drumKit,
                  loudnessTrimDb: trim,
                  masterMakeupDb: makeup,
                  masterBusCompEnabled: busComp,
                }
              );
              const channels = [];
              for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
              const m = loudness.measureLoudness(channels, buffer.sampleRate);
              out.push({
                id,
                trim,
                makeup,
                lufs: m.integratedLufs,
                truePeakDb: m.truePeakDb,
                samplePeakDb: m.samplePeakDb,
                rmsDb: loudness.sampleRmsDb(channels),
              });
            }
          }
        }
        return out;
      },
      { genreIds, bars, trims, makeups, busComp }
    );

    console.log(`\n  bus compressor: ${busComp ? "on" : "off"}`);
    console.log("\n  genre            trim  makeup    LUFS   truePk   smpPk    crest");
    for (const r of rows) {
      const crest = (r.truePeakDb - r.lufs).toFixed(2);
      console.log(
        `  ${r.id.padEnd(16)} ${String(r.trim).padStart(4)} ${String(r.makeup).padStart(6)}  ` +
          `${r.lufs.toFixed(2).padStart(7)} ${r.truePeakDb.toFixed(2).padStart(7)} ${r.samplePeakDb.toFixed(2).padStart(7)} ${crest.padStart(7)}`
      );
    }
    // How much of a makeup step survives to the output.
    console.log("\n  gain transfer (ΔLUFS per Δmakeup, trim held at the first value):");
    for (const id of genreIds) {
      const first = trims[0];
      const slice = rows.filter((r) => r.id === id && r.trim === first).sort((a, b) => a.makeup - b.makeup);
      for (let i = 1; i < slice.length; i++) {
        const dMakeup = slice[i].makeup - slice[i - 1].makeup;
        const dLufs = slice[i].lufs - slice[i - 1].lufs;
        console.log(
          `    ${id}: +${dMakeup} dB makeup -> +${dLufs.toFixed(2)} LUFS ` +
            `(${((dLufs / dMakeup) * 100).toFixed(0)}% transferred)`
        );
      }
    }
  } finally {
    await browser.close();
    vite.kill();
    server.close();
  }
};

main().catch((err) => {
  console.error(err);
  fs.writeSync(2, String(err?.stack || err));
  process.exit(1);
});
