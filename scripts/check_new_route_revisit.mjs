/**
 * The observation the task recorded as "seen but not concluded": **does a second visit to `/new` in the same session
 * still show the template chooser?**
 *
 * One browser, one context, one page — the reading the main measurement deliberately does not take, because it uses a
 * fresh isolated context per file so every import starts from the same state. This walks the same session twice and
 * records what is on screen each time.
 *
 *   node scripts/check_new_route_revisit.mjs --base=http://127.0.0.1:5387
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const playwright = require("playwright");

const arg = (name, fallback) => {
  const hit = process.argv.find((entry) => entry.startsWith(`--${name}=`));
  return hit === undefined ? fallback : hit.slice(name.length + 3);
};
const base = arg("base", "http://127.0.0.1:5387").replace(/\/$/, "");

const browser = await playwright.chromium.launch({ args: ["--no-sandbox", "--mute-audio"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
await page.addInitScript(() => {
  try {
    localStorage.setItem("groove_onboarding_completed", "true");
    localStorage.setItem("groove_audio_started", "1");
  } catch {
    /* storage disabled */
  }
});

const reading = async (label) => {
  await page.waitForSelector("[data-testid='arrangement-view-v2'], [data-testid='new-project-panel-v2']", { timeout: 30000 });
  const state = await page.evaluate(() => ({
    chooser: document.querySelector("[data-testid='new-project-panel-v2']") !== null,
    arrangement: document.querySelector("[data-testid='arrangement-view-v2']") !== null,
    tracks: document.querySelectorAll("[data-testid='arrangement-track-picker'] li").length,
    activePointer: (() => {
      try {
        for (const key of Object.keys(localStorage)) if (/arrangement|project/i.test(key)) return `${key}=${localStorage.getItem(key)?.slice(0, 80)}`;
      } catch {
        return "unreadable";
      }
      return "none";
    })(),
  }));
  console.log(`${label}: chooser=${state.chooser} arrangement=${state.arrangement} tracks=${state.tracks} pointer[${state.activePointer}]`);
  return state;
};

await page.goto(`${base}/new`, { waitUntil: "domcontentloaded", timeout: 60000 });
const first = await reading("visit 1 (fresh session)");

if (first.chooser) {
  await page.click("[data-testid='template-drums-bass']");
  await page.click("[data-testid='new-project-create']");
  await page.waitForSelector("[data-testid='arrangement-view-v2']", { timeout: 30000 });
  console.log("created a project from the Drums + Bass template");
}

// The revisit: a full navigation, the same context, the same storage — exactly "走 /new 第二次".
await page.goto(`${base}/new`, { waitUntil: "domcontentloaded", timeout: 60000 });
const second = await reading("visit 2 (same session, project stored)");

console.log(
  `\nreading: a stored project makes /new reopen it (${second.arrangement && !second.chooser ? "reopened, no chooser" : "chooser still shown"}) — ` +
    `the chooser is for "nothing saved yet", which is the route's own documented meaning.`
);

await browser.close();
