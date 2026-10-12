#!/usr/bin/env node
/**
 * The score's ink is readable in **every** skin, and it follows the skin when it changes.
 *
 * ## Why this exists
 *
 * `ScoreV2` draws with VexFlow, whose `SVGContext` opens with `fill: 'black', stroke: 'black'` and was
 * never told otherwise. The stave, the clefs, the noteheads and the beams were therefore **black on all six
 * skins** — 1.07:1 on the default skin, 1.25:1 on Soviet, 1.13:1 on pixel, which is the owner's "score 在
 * 深色模式黑布隆冬看不见". Nothing in the repository could see it: the skin gates are stylesheet scans
 * (`check:skins`, `check:skin-roles`, `readabilityAudit`), the last of which walks **text elements** — and
 * VexFlow writes **SVG presentation attributes**, which no stylesheet scan and no text walk ever looks at.
 *
 * So the measurement has to be the one the eye makes: **what the browser actually painted**, on the ink the
 * shapes ended up with, against the colour actually behind them.
 *
 * ## What it asserts, per skin
 *
 *   · **Contrast.** The ink VexFlow painted (computed `fill`/`stroke` of the shapes it created, which is
 *     inherited from the renderer's own `<svg>`) against the nearest painted ancestor of the score canvas.
 *     The floor is **4.5:1**, WCAG 2.1 SC 1.4.3 (<https://www.w3.org/TR/WCAG21/#contrast-minimum>); SC
 *     1.4.11's 3:1 for "parts of graphics required to understand the content"
 *     (<https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html>) also applies, and a stave is
 *     drawn in one ink, so the stricter of the two is enforced.
 *   · **The switch.** The skin is changed **in the same page**, after the stave is on screen, and the ink is
 *     read again. It has to change, and it has to become the new skin's `--d-ink`. This is the assertion that
 *     a drawing which bakes a colour in at draw time and never redraws cannot pass — and it is measured in a
 *     browser, not read off the source, because "it redraws" is a claim about the running application.
 *
 * ## Running it
 *
 *   node scripts/measure_score_ink.mjs                # serves dist/ itself (like the other probes)
 *   node scripts/measure_score_ink.mjs --base <url>   # measure a server that is already running
 *   node scripts/measure_score_ink.mjs --skins=minimal,soviet
 *   node scripts/measure_score_ink.mjs --shots <dir>  # write one screenshot per skin
 *
 * It exits non-zero when any skin fails, and the report names the skin, the two colours and the ratio.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const argValue = (name, fallback) => {
  const inline = argv.find((a) => a.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index !== -1 && argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[index + 1] : fallback;
};

const DIST = path.resolve(argValue("--dist", path.join(ROOT, "dist")));
const BASE = argValue("--base", "");
const SHOTS = argValue("--shots", "");

/** Every skin the app ships. `default` first, because `default` → anything is the switch that races. */
const SKINS = ["default", "minimal", "comic", "soviet", "sovietYears", "pixel"];
const ONLY_SKINS = argValue("--skins", "");
const skinsToRun = ONLY_SKINS
  ? ONLY_SKINS.split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  : SKINS;

/** The floor, and its source: WCAG 2.1 SC 1.4.3 (text) is 4.5:1, SC 1.4.11 (graphics) is 3:1. One ink draws both. */
const FLOOR = 4.5;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
};

/** The same static handler the other probes use: unknown paths fall back to `index.html` for the SPA. */
function startServer() {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(path.join(DIST, "index.html"))) {
      reject(new Error(`no build at ${DIST} — run \`npm run build\`, or pass --base <url>`));
      return;
    }
    const server = http.createServer((req, res) => {
      let rel = (req.url || "/").split("?")[0];
      if (rel === "/") rel = "/index.html";
      let file = path.join(DIST, rel);
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, "index.html");
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

/**
 * The score's own reading of the page: what colour the shapes are, and what colour is behind them.
 *
 * Both come from `getComputedStyle`, not from attributes: VexFlow writes `fill="black" stroke="black"` on
 * the renderer's root `<svg>` and each shape declares only the one it needs, so the *other* is inherited —
 * an attribute scan would call a black-rooted stave "an unstyled element" and miss the whole defect.
 */
const MEASURE = () => {
  const host = document.querySelector("[data-testid='score-canvas']");
  if (!host) return { error: "no [data-testid='score-canvas']" };
  const svg = host.querySelector("svg");
  if (!svg) return { error: "the score canvas has no svg" };

  const inks = new Map();
  for (const shape of svg.querySelectorAll("path, rect, text, polyline, line, polygon")) {
    const styles = getComputedStyle(shape);
    for (const property of ["fill", "stroke"]) {
      const value = styles[property];
      if (!value || value === "none" || value === "transparent") continue;
      inks.set(value, (inks.get(value) || 0) + 1);
    }
  }
  const painted = [...inks.entries()].sort((a, b) => b[1] - a[1]);

  let node = host;
  let ground = null;
  while (node) {
    const background = getComputedStyle(node).backgroundColor;
    if (background && !/rgba\(0,\s*0,\s*0,\s*0\)|transparent/.test(background)) {
      ground = { where: node.getAttribute("data-testid") || String(node.className).slice(0, 40), background };
      break;
    }
    node = node.parentElement;
  }

  const root = getComputedStyle(document.documentElement);
  return {
    inks: painted,
    shapeCount: svg.querySelectorAll("*").length,
    ground,
    skin: document.documentElement.getAttribute("data-skin"),
    tokens: {
      ink: root.getPropertyValue("--d-ink").trim(),
      surface: root.getPropertyValue("--d-surface").trim(),
    },
  };
};

const channel = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const luminance = ([r, g, b]) => 0.2126 * channel(r / 255) + 0.7152 * channel(g / 255) + 0.0722 * channel(b / 255);
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const toRgb = (value) => {
  const match = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(value || "");
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
};
/** The rendered form of a `--d-ink` triple: what this probe expects to see painted for that skin. */
const inkFor = (triple) => {
  const parts = (triple || "").trim().split(/\s+/);
  return parts.length === 3 ? `rgb(${parts.join(", ")})` : null;
};

/** One page through the arrangement to a drawn stave: the user steps, not a test hook. */
async function openScore(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-testid='template-blank']", { timeout: 60000 });
  await page.click("[data-testid='template-blank']");
  await page.click("[data-testid='new-project-create']");
  await page.waitForSelector("[data-testid='track-list-add'] button:nth-child(1)", { timeout: 60000 });
  await page.click("[data-testid='track-list-add'] button:nth-child(1)");
  await page.waitForSelector("[data-testid='arrangement-editor-tabs']", { timeout: 60000 });
  await page.click("[data-testid='arrangement-editor-score']");
  await page.waitForSelector("[data-testid='score-canvas'] svg", { timeout: 60000 });
}

/**
 * Switch the skin **in the open page**, through the Settings picker when it is reachable.
 *
 * The picker is the honest path — it is what a person does — and it is preferred. The stored-preference
 * fallback writes the same key and publishes the same `groove_skin_changed` event that `saveSkin` does (the
 * picker's own call); it is used only when this route does not render the header's settings button, and the
 * report says which path was taken.
 */
async function switchSkin(page, skin) {
  const opened = await page
    .$("[data-testid='header-settings-open']")
    .then((handle) => !!handle)
    .catch(() => false);
  if (opened) {
    await page.click("[data-testid='header-settings-open']");
    const tab = await page.$("[data-testid='settings-tab-interface']");
    if (tab) {
      await tab.click();
      const choice = await page.$(`[data-testid='settings-skin-${skin}']`);
      if (choice) {
        await choice.click();
        await page.keyboard.press("Escape");
        return "picker";
      }
    }
    await page.keyboard.press("Escape");
  }
  await page.evaluate((id) => {
    window.localStorage.setItem("groove_skin_v1", id);
    window.dispatchEvent(new CustomEvent("groove_skin_changed", { detail: { skin: id } }));
  }, skin);
  return "stored preference + change event";
}

const { server, base } = BASE ? { server: null, base: BASE } : await startServer();
const browser = await chromium.launch();
const rows = [];
let failed = 0;

for (const skin of skinsToRun) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  await context.addInitScript((id) => {
    try {
      window.localStorage.setItem("groove_skin_v1", id);
      window.localStorage.setItem("groove_onboarding_completed", "1");
      // The entry gate overlays the app until it is tapped; a measurement run starts after it.
      window.localStorage.setItem("groove_audio_started", "1");
      window.localStorage.setItem("groove_language", "en");
    } catch {
      /* storage may be unavailable; the audit then measures the default skin */
    }
  }, skin);
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("pageerror", (error) => consoleErrors.push(String(error).slice(0, 200)));

  const row = { skin, errors: consoleErrors };
  try {
    await openScore(page, `${base}/new`);
    await page.waitForTimeout(600);
    const before = await page.evaluate(MEASURE);
    if (before.error) throw new Error(before.error);

    const ink = toRgb(before.inks[0][0]);
    const ground = toRgb(before.ground.background);
    row.ink = before.inks[0][0];
    row.inkShapes = before.inks[0][1];
    row.shapes = before.shapeCount;
    row.inkVariants = before.inks.length;
    row.ground = before.ground.background;
    row.groundWhere = before.ground.where;
    row.ratio = ink && ground ? contrast(ink, ground) : null;
    row.canvasSkin = before.skin;
    row.tokenInk = inkFor(before.tokens.ink);
    row.inkIsTheRole = row.ink !== null && row.ink === row.tokenInk;
    if (SHOTS) await page.locator("[data-testid='score-v2']").screenshot({ path: path.join(SHOTS, `${skin}-score.png`) });

    /**
     * ⭐ **And now switch, on the page that is already showing the stave.** The pair is chosen so every skin
     * is tried, and `default` → `minimal` — the light ink a palette read taken a tick too early bakes in —
     * is one of them.
     *
     * The redraw is detected by **the renderer's element being replaced** (the component clears its host and
     * VexFlow builds a new `<svg>`), not by the colour: "the score did not repaint at all" has to be a
     * failure of its own, and the expected colour is read *after* the redraw, from the palette the redraw is
     * drawing under — asking before it would answer with the previous skin's role and assert nothing.
     */
    await page.evaluate(() => {
      document.querySelector("[data-testid='score-canvas'] svg")?.setAttribute("data-probe-generation", "before");
    });
    const target = SKINS[(SKINS.indexOf(skin) + 1) % SKINS.length];
    row.switchedTo = target;
    row.switchPath = await switchSkin(page, target);
    row.redrew = await page
      .waitForFunction(
        () => {
          const svg = document.querySelector("[data-testid='score-canvas'] svg");
          return !!svg && svg.getAttribute("data-probe-generation") !== "before";
        },
        null,
        { timeout: 15000 }
      )
      .then(() => true)
      .catch(() => false);
    const expectedAfter = inkFor(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--d-ink")));
    await page
      .waitForFunction(
        (expected) => document.querySelector("[data-testid='score-canvas'] svg")?.getAttribute("fill") === expected,
        expectedAfter,
        { timeout: 15000 }
      )
      .catch(() => {});
    const after = await page.evaluate(MEASURE);
    row.afterInk = after.inks?.[0]?.[0] ?? null;
    row.afterSkin = after.skin;
    row.afterRatio =
      after.inks?.[0]?.[0] && after.ground ? contrast(toRgb(after.inks[0][0]), toRgb(after.ground.background)) : null;
    // The whole claim: it repainted, and the ink it repainted with is the new skin's role.
    row.switchFollows = row.redrew && row.afterInk !== row.ink && row.afterInk === expectedAfter;
    row.expectedAfter = expectedAfter;
  } catch (error) {
    row.error = String(error).slice(0, 300);
  } finally {
    /**
     * A context that cannot be closed must not take the report with it — the measurement above is the point,
     * and a browser that died mid-run is (usually) this machine's load, not the app's.
     */
    await context.close().catch(() => {});
  }

  /**
   * Readable, in the skin's own ink, drawn in **one** ink, and repainted when the skin changed. The single
   * ink is part of it: VexFlow's own `Stave` default for the ledger lines is a fixed grey, and a stave with
   * two colours on it is the defect measured, not a detail.
   */
  row.ok =
    !row.error &&
    row.ratio !== null &&
    row.ratio >= FLOOR &&
    row.inkIsTheRole === true &&
    row.inkVariants === 1 &&
    row.switchFollows === true;
  if (!row.ok) failed += 1;
  rows.push(row);
}

await browser.close();
server?.close();

console.log(`\nThe score's ink, measured in a browser (floor ${FLOOR}:1 — WCAG 2.1 SC 1.4.3; SC 1.4.11 asks 3:1 for graphics)\n`);
for (const row of rows) {
  if (row.error) {
    console.log(`❌ ${row.skin.padEnd(12)} ${row.error}`);
    continue;
  }
  console.log(
    `${row.ok ? "✅" : "❌"} ${row.skin.padEnd(12)} ink ${String(row.ink).padEnd(22)} on ${String(row.ground).padEnd(22)} ` +
      `${row.ratio.toFixed(2)}:1  ${row.inkShapes}/${row.shapes} shapes  ` +
      `switch→${String(row.switchedTo).padEnd(12)} ${row.switchFollows ? "✓" : "✗"} ${row.switchFollows ? `(${row.afterInk}, ${row.afterRatio?.toFixed(2)}:1)` : `(expected ${row.expectedAfter ?? "?"}, got ${row.afterInk ?? "?"})`}`
  );
  if (!row.inkIsTheRole) console.log(`   · the painted ink is not the skin's --d-ink (${row.tokenInk})`);
  if (row.inkVariants > 1) console.log(`   · ${row.inkVariants} distinct inks on one stave — a colour VexFlow chose itself`);
  if (row.redrew === false) console.log("   · the score did not repaint when the skin changed");
  if (row.switchPath && row.switchPath !== "picker") console.log(`   · the skin was switched by ${row.switchPath}`);
  if (row.errors.length) console.log(`   · page error: ${row.errors[0]}`);
}

if (failed) {
  console.error(`\n❌ ${failed}/${rows.length} skin(s) fail: the score's ink is not the skin's, or does not follow it.`);
  console.error("   The ink is read from --d-ink at draw time in ScoreV2.tsx and the effect depends on the skin;");
  console.error("   see src/test/scoreInk.test.tsx for the same claim at unit speed.");
  process.exit(1);
}
console.log("\n✅ every skin draws the stave in the skin's ink, and redraws with the next one");
