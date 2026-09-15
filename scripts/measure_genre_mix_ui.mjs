#!/usr/bin/env node
/**
 * Per-genre mix — user-visible acceptance probe.
 *
 * Reads the mix the way the user does: opens the studio for a genre, floats the mixing
 * console, and reads each channel's fader / pan / reverb send / delay send straight out of
 * the DOM. Deliberately not a module-level check — it proves the arranged mix survives
 * `patternFromGenre` seeding, the sequencer store, the console bindings and the UI.
 *
 * Recorded BEFORE-state, measured against the deployed v1.16.18 on 2026-09-15 with
 * `--genres=bebop,ambient,death-metal,salsa,chicago-house,trap-rap`: all six genres
 * exposed the SAME mix and every send was 0.00 —
 *   kick 0.90/0  snare 0.85/0  hihat 0.70/-0.20  percussion 0.65/+0.25
 *   bass 0.90/0  chords 0.75/0  lead 0.80/+0.10  fx 0.60/0   sends A/B all 0.00
 * i.e. exactly the state the user described, reproduced through the user's own UI.
 *
 *   node scripts/measure_genre_mix_ui.mjs                      # against the deployed site
 *   LIVE_BASE=http://127.0.0.1:4173 node scripts/measure_genre_mix_ui.mjs
 *   node scripts/measure_genre_mix_ui.mjs --genres=bebop,ambient --json=out.json
 */
import { createRequire } from "module";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const arg = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const BASE = process.env.LIVE_BASE || "https://silent-river-9229.gradetwo.workers.dev";
const GENRES = (
  arg("genres", "bebop,ambient,death-metal,salsa,chicago-house,trap-rap") || ""
).split(",").filter(Boolean);
const ROLES = ["kick", "snare", "hihat", "percussion", "bass", "chords", "lead", "fx"];

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1600, height: 950 }, locale: "zh-CN" })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

async function readMix(genreId) {
  await page.goto(`${BASE}/studio?genre=${encodeURIComponent(genreId)}`, { waitUntil: "domcontentloaded" });
  const toggle = page.locator('[data-testid="studio-console-toggle"]');
  await toggle.waitFor({ state: "visible", timeout: 30000 });
  await toggle.click();
  await page.locator('[data-testid="console-overlay"]').waitFor({ state: "visible", timeout: 15000 });
  // Wait for the channel strips to be bound to the store.
  await page.locator('[data-testid="console-fader-0"]').waitFor({ state: "attached", timeout: 15000 });
  const mix = await page.evaluate(() => {
    const out = [];
    for (let i = 0; i < 8; i++) {
      const g = (sel) => {
        const el = document.querySelector(sel);
        return el ? Number(el.value) : null;
      };
      out.push({
        fader: g(`[data-testid="console-fader-${i}"]`),
        pan: g(`[data-testid="console-pan-${i}"]`),
        sendA: g(`[data-testid="console-send-a-${i}"]`),
        sendB: g(`[data-testid="console-send-b-${i}"]`),
      });
    }
    return out;
  });
  await page.keyboard.press("Escape");
  return mix;
}

const results = {};
for (const id of GENRES) {
  const mix = await readMix(id);
  results[id] = mix;
  const row = mix.map((m, i) => `${ROLES[i]}=${m.fader?.toFixed(2)}/${m.pan}`);
  console.log(`\n${id}`);
  console.log(`  vol/pan  ${row.join("  ")}`);
  console.log(`  sends A  ${mix.map((m) => m.sendA?.toFixed(2)).join(" ")}`);
  console.log(`  sends B  ${mix.map((m) => m.sendB?.toFixed(2)).join(" ")}`);
}

// ---- assertions -----------------------------------------------------------
const problems = [];
const tuples = new Set(
  Object.values(results).map((mix) => mix.map((m) => `${m.fader}/${m.pan}`).join("|"))
);
console.log(`\ndistinct (vol,pan) tuples across the ${GENRES.length} sampled genres: ${tuples.size}`);
if (GENRES.length > 1 && tuples.size === 1) {
  problems.push("every sampled genre exposes the SAME mix in the console — the arranged mix is not reaching the UI");
}

for (const [id, mix] of Object.entries(results)) {
  const kick = mix[0];
  const bass = mix[4];
  if (kick && kick.pan !== 0) problems.push(`${id}: kick pan is ${kick.pan}, expected 0 (mono low end)`);
  if (bass && bass.pan !== 0) problems.push(`${id}: bass pan is ${bass.pan}, expected 0 (mono low end)`);
  const snare = mix[1];
  if (snare && Math.abs(snare.pan) > 0.1) problems.push(`${id}: snare pan ${snare.pan} is off-centre`);
  if (mix.some((m) => m.fader === null)) problems.push(`${id}: a channel fader was not found in the DOM`);
}

// Musical direction checks, only when the genres are in the sample.
const chordsOf = (id) => results[id]?.[5]?.fader;
const kickOf = (id) => results[id]?.[0]?.fader;
const percOf = (id) => results[id]?.[3]?.fader;
if (results.ambient && results["death-metal"]) {
  if (!(chordsOf("ambient") > kickOf("ambient"))) {
    problems.push(`ambient: chords (${chordsOf("ambient")}) should sit above kick (${kickOf("ambient")}) — pads carry ambient`);
  }
  if (!(kickOf("death-metal") > kickOf("bebop") || !results.bebop)) {
    problems.push(`death-metal kick (${kickOf("death-metal")}) should exceed bebop's (${kickOf("bebop")})`);
  }
}
if (results.salsa) {
  if (!(percOf("salsa") >= results.salsa[1].fader)) {
    problems.push(`salsa: percussion (${percOf("salsa")}) should be at least as forward as snare (${results.salsa[1].fader})`);
  }
}

const json = arg("json");
if (json) {
  fs.writeFileSync(json, JSON.stringify({ base: BASE, genres: results }, null, 2) + "\n");
  console.log(`wrote ${json}`);
}

console.log(errors.length === 0 ? "\n✅ no page errors" : `\n❌ page errors: ${errors.slice(0, 2).join(" | ")}`);
if (problems.length || errors.length) {
  for (const p of problems) console.error("❌ " + p);
  process.exit(1);
}
console.log("🎉 ALL PER-GENRE MIX UI CHECKS PASSED");
await browser.close();
