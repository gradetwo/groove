/**
 * Screenshot the new arrangement in each skin, and **measure the grid while doing it**.
 *
 * The owner reported "the new arrangement is a blank sheet with no grid lines in the light skin", and the cause
 * was a palette triple being passed where a colour is required: `border-[var(--d-line)]` compiles to
 * `border-color: 20 20 20`, which the browser drops, so every hairline and the bar grid painted nothing. A
 * screenshot showed it; a screenshot is also the thing that proves it fixed, because the failure is a
 * declaration the browser silently discards and nothing in a jsdom render looks broken.
 *
 * So this does both. It walks the route the way a person does — past the onboarding tour and the audio gate,
 * choosing the blank template and pressing Create — and it prints the grid's **computed** background-image,
 * which is the difference between "a valid colour is on the line element" and "the line element exists".
 * `rgb(20, 20, 20)` in that string on the light skin is the grid being drawn; a bare triple would be missing
 * from it entirely.
 *
 * Run it against a dev server:
 *
 *   npx vite --port 5199 &
 *   node scripts/shoot_arrangement.mjs --base http://127.0.0.1:5199 --out /tmp/arr-shots
 *
 * Two things are seeded in `localStorage` before the app loads rather than clicked, because both are
 * deterministic that way and racy as clicks: the onboarding-completed key, and the skin key the app's own
 * `useSkin` reads. Setting `data-skin` on the element afterwards does **not** work — the app owns the skin in
 * state and rewrites the attribute on render — which is worth knowing before trying it again.
 *
 * Exits non-zero if the arrangement never appears, so this is usable as a check and not only as a picture.
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// Resolve playwright from the repository, so this runs from anywhere.
const require = createRequire(path.join(repoRoot, "package.json"));
const { chromium } = require("playwright");

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const base = arg("base", "http://127.0.0.1:5199").replace(/\/$/, "");
const out = arg("out", "/tmp/arr-shots");
const skins = arg("skins", "minimal,default").split(",").map((s) => s.trim()).filter(Boolean);
mkdirSync(out, { recursive: true });

const ONBOARDING_KEY = "groove_onboarding_completed";
const SKIN_KEY = "groove_skin_v1";

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const problems = [];

for (const skin of skins) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(
    ([onboardingKey, skinKey, value]) => {
      try {
        localStorage.setItem(onboardingKey, "1");
        localStorage.setItem(skinKey, value);
      } catch {
        /* storage unavailable: the walk below will report what it cannot reach */
      }
    },
    [ONBOARDING_KEY, SKIN_KEY, skin]
  );

  const state = async () =>
    page.evaluate(() => {
      const ids = [...document.querySelectorAll("[data-testid]")].map((e) => e.getAttribute("data-testid"));
      return {
        skin: document.documentElement.dataset.skin,
        toolbar: ids.includes("arrangement-toolbar"),
        gate: ids.includes("audio-start-gate"),
      };
    });

  try {
    await page.goto(`${base}/new`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(2500);
    // The audio gate responds to its own button; the tour is already suppressed by the seeded key.
    const gate = page.locator('[data-testid="audio-start-button"]').first();
    if (await gate.count()) await gate.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1200);
    // Select the blank template, then commit it. The card only selects; **Create is what navigates**, and
    // clicking the card alone leaves this page exactly as it was.
    await page.locator('[data-testid="template-blank"]').first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: /^Create$/ }).first().click({ timeout: 6000 }).catch(() => {});
    await page.waitForSelector('[data-testid="arrangement-toolbar"]', { timeout: 20000 });

    const probe = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const line = [...document.querySelectorAll("div")].find((d) =>
        (d.getAttribute("style") || "").includes("repeating-linear-gradient")
      );
      return {
        skin: document.documentElement.dataset.skin,
        pageBackground: root.getPropertyValue("--d-bg").trim(),
        lineToken: root.getPropertyValue("--line").trim(),
        gridFound: Boolean(line),
        gridComputed: line ? getComputedStyle(line).backgroundImage.slice(0, 120) : null,
      };
    });

    const file = path.join(out, `arrangement-${skin}.png`);
    await page.screenshot({ path: file });

    /**
     * ⭐ **The check, not just the picture.** The computed image must contain a resolved colour. A bare triple
     * would not appear here at all, which is exactly the failure the owner saw as an empty page.
     */
    const resolved = /rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+/.test(probe.gridComputed || "");
    if (!probe.gridFound) problems.push(`${skin}: no grid element carries a repeating-linear-gradient`);
    else if (!resolved) problems.push(`${skin}: the grid's computed background has no resolved rgb() colour — it is the dropped-declaration failure`);
    if (probe.skin !== skin) problems.push(`${skin}: the page reports skin "${probe.skin}"`);

    console.log(
      `  ${skin.padEnd(9)} skin=${String(probe.skin).padEnd(9)} page-bg=${probe.pageBackground.padEnd(12)} ` +
        `--line=${probe.lineToken.padEnd(16)} grid=${probe.gridFound ? "yes" : "NO "} ` +
        `resolved-colour=${resolved ? "yes ✓" : "NO ✗"} → ${file}`
    );
  } catch (error) {
    problems.push(`${skin}: ${String(error).split("\n")[0].slice(0, 140)} (reached ${JSON.stringify(await state().catch(() => ({})))})`);
  } finally {
    await page.close();
  }
}

await browser.close();

if (problems.length > 0) {
  console.error("\n未通过：");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`\n${skins.length} 套皮肤都到达了编排界面，网格颜色都是已解析的 ✓`);
