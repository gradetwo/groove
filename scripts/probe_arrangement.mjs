#!/usr/bin/env node
/**
 * B3 — does the arrangement view really let a finger move a section, at 44 px?
 *
 *   node scripts/probe_arrangement.mjs [--json]
 *
 * The unit tests pin the *arithmetic* of the view (`songEdit.ts`) and the component's props; this probe is the only
 * place that answers the questions source text cannot:
 *
 *   - is the entry **reachable** on the desktop shell (Tier 2 behind the advanced density) and does it open?
 *   - is each region drawn **above the bar the renderer plays it at** — region left == startBar × bar width?
 *   - is every target a finger must hit really **≥ 44 × 44 px** in the built app, not just in a constant?
 *   - does a **real mouse drag** (pointer capture, not a synthetic event) reorder the song, and does an edge drag
 *     change the repeat count?
 *   - and the negative control: does a nudge that does not cross half a bar leave the arrangement **alone**? A
 *     check that cannot fail proves nothing, and this project has shipped one before (`check_groove.mjs` counted
 *     into `NaN` for a while and never failed).
 *
 * It runs against `dist/`, like the other probes, so it measures what ships.
 */
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const playwright = require("playwright");
const ROOT = process.cwd();

const asJson = process.argv.slice(2).includes("--json");

if (!fs.existsSync(path.join(ROOT, "dist", "index.html"))) {
  console.error("❌ No built app found — run `npm run build` first.");
  process.exit(1);
}

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
};

const server = http.createServer((req, res) => {
  const url = req.url.split("?")[0];
  const rel = url === "/" ? "/index.html" : url;
  const file = path.join(ROOT, "dist", rel);
  if (!file.startsWith(path.join(ROOT, "dist")) || !fs.existsSync(file)) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));

const fail = async (message) => {
  console.error(`❌ ${message}`);
  await browser.close();
  server.close();
  process.exit(1);
};

const browser = await playwright.chromium.launch({ args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => {
  try {
    localStorage.setItem("groove_onboarding_completed", "true");
    // A saved project would bring its own arrangement; measuring the shipped default is the point.
    localStorage.removeItem("groove_project_v1");
  } catch {
    /* disabled */
  }
});
const page = await context.newPage();
await page.goto(`http://127.0.0.1:${server.address().port}/?tab=studio`, { waitUntil: "domcontentloaded" });

try {
  await page.waitForSelector("[data-testid='toolbar-advanced-toggle']", { timeout: 30000 });
} catch {
  await fail("the studio toolbar did not render — cannot open the arrangement view.");
}
await page.waitForTimeout(600);

/**
 * Reach the entry the way a user does: the advanced density, then the button.
 *
 * The tier table puts the arrangement in Tier 2, so this also asserts the tiering contract in the built app — an
 * entry that is supposed to be one click behind the advanced toggle must actually be there.
 */
await page.click("[data-testid='toolbar-advanced-toggle']");
try {
  await page.waitForSelector("[data-testid='toolbar-arrangement-toggle']", { timeout: 5000 });
} catch {
  await fail("the arrangement entry is not reachable from the advanced density — the toolbar tiers it as Tier 2.");
}
await page.click("[data-testid='toolbar-arrangement-toggle']");
try {
  await page.waitForSelector("[data-testid='arrangement-panel']", { timeout: 5000 });
} catch {
  await fail("the arrangement panel did not open.");
}
await page.waitForTimeout(200);

const regionIds = () =>
  page.$$eval("[data-testid^='arrangement-region-']", (nodes) =>
    nodes.map((node) => ({
      id: node.getAttribute("data-testid").replace("arrangement-region-", ""),
      startBar: Number(node.getAttribute("data-start-bar")),
      bars: Number(node.getAttribute("data-bars")),
      slot: node.getAttribute("data-slot"),
    }))
  );

const initial = await regionIds();
if (initial.length < 2) {
  await fail(`expected at least 2 regions for the default two-bar song, found ${initial.length}.`);
}

/**
 * The ruler and the regions must be the same arithmetic.
 *
 * A region drawn one bar off is exactly the defect the model layer was written to prevent, and the only place it
 * can still appear is here — in the DOM, after layout.
 */
const geometry = await page.evaluate(() => {
  const bar = document.querySelector("[data-testid='arrangement-bar-0']");
  // Bar 1, not bar 2: `left(bar2) - left(bar0)` is *two* bar widths, and using it as the step would report every
  // region past the first as half a bar out of place — a check that fails for the wrong reason.
  const barNext = document.querySelector("[data-testid='arrangement-bar-1']");
  const rect = (el) => (el ? el.getBoundingClientRect() : null);
  const b0 = rect(bar);
  const b1 = rect(barNext);
  const rulerLeft = b0 ? b0.left : 0;
  return {
    barWidth: b0 ? b0.width : 0,
    barStep: b0 && b1 ? b1.left - b0.left : 0,
    rulerBottom: b0 ? b0.bottom : 0,
    /**
     * Every region's distance from *its own* bar.
     *
     * A region's `left` is an offset inside the lane, so the comparison has to subtract the ruler's left edge.
     * Checking only the first region would be nearly vacuous — it starts at bar 0, where the expectation is just
     * "the lane starts where the ruler does".
     */
    offsets: [...document.querySelectorAll("[data-testid^='arrangement-region-']")].map((el) => {
      const box = rect(el);
      return {
        id: el.getAttribute("data-testid").replace("arrangement-region-", ""),
        startBar: Number(el.getAttribute("data-start-bar")),
        left: box ? box.left : 0,
        top: box ? box.top : 0,
      };
    }),
    rulerLeft,
  };
});
const misaligned = geometry.offsets
  .map((region) => ({
    ...region,
    error: Math.abs(region.left - geometry.rulerLeft - geometry.barStep * region.startBar),
  }))
  .filter((region) => region.error > 1.5);
if (misaligned.length) {
  await fail(
    `these regions are not drawn above the bar the renderer plays them at: ${misaligned
      .map((r) => `${r.id} bar ${r.startBar} is ${r.error.toFixed(1)} px off`)
      .join(", ")}`
  );
}
if (!geometry.offsets.every((region) => region.top >= geometry.rulerBottom - 1)) {
  await fail("a region is drawn over the ruler rather than under it.");
}
if (!(geometry.barWidth >= 44)) {
  await fail(`the ruler's bar column is ${geometry.barWidth} px wide, below the 44 px contract.`);
}

/** Every target a finger has to hit, measured as it is painted. */
const targets = await page.evaluate(() => {
  const wanted = [
    ...document.querySelectorAll("[data-testid^='arrangement-region-']"),
    ...document.querySelectorAll("[data-testid^='arrangement-move-']"),
    ...document.querySelectorAll("[data-testid^='arrangement-resize-']"),
    ...document.querySelectorAll("[data-testid^='arrangement-form-']"),
    document.querySelector("[data-testid='arrangement-close']"),
    document.querySelector("[data-testid='arrangement-grow']"),
    document.querySelector("[data-testid='arrangement-shrink']"),
    document.querySelector("[data-testid='arrangement-duplicate']"),
    document.querySelector("[data-testid='arrangement-remove']"),
  ].filter(Boolean);
  return wanted.map((el) => {
    const rect = el.getBoundingClientRect();
    return {
      testId: el.getAttribute("data-testid"),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  });
});
const smallTargets = targets.filter((t) => t.width < 44 || t.height < 44);
if (smallTargets.length) {
  await fail(
    `these targets are below 44 × 44 px: ${smallTargets
      .map((t) => `${t.testId} ${t.width}×${t.height}`)
      .join(", ")}`
  );
}

// ---------------------------------------------------------------------------------------------
// Gestures, with a real mouse so pointer capture behaves the way it does on a device.
// ---------------------------------------------------------------------------------------------

const dragBy = async (selector, dx) => {
  const box = await page.locator(selector).first().boundingBox();
  const y = box.y + box.height / 2;
  const x = box.x + Math.min(8, box.width / 4);
  await page.mouse.move(x, y);
  await page.mouse.down();
  // Two moves: a real drag is not a single jump, and a handler that only reads the last event would pass anyway.
  await page.mouse.move(x + dx / 2, y + 1, { steps: 4 });
  await page.mouse.move(x + dx, y + 1, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(60);
};

const first = initial[0];
const barWidth = geometry.barStep;

// The negative control first: a nudge under half a bar must change nothing.
await dragBy(`[data-testid='arrangement-region-${first.id}']`, Math.round(barWidth / 2) - 4);
const afterNudge = await regionIds();
if (JSON.stringify(afterNudge) !== JSON.stringify(initial)) {
  await fail(
    "a nudge that did not cross half a bar changed the arrangement — the probe's own success would then prove " +
      "nothing, because any drag outcome would pass it."
  );
}

// Now a real move: one bar to the right.
await dragBy(`[data-testid='arrangement-region-${first.id}']`, barWidth + 6);
const afterMove = await regionIds();
if (afterMove.map((r) => r.id).join(",") === initial.map((r) => r.id).join(",")) {
  await fail(`dragging ${first.id} one bar to the right did not reorder the arrangement.`);
}
if (afterMove[0].id === first.id) {
  await fail(`dragging ${first.id} right by one bar left it first — the drop target was not resolved.`);
}

// Resize: drag the moved region's right edge one bar further out.
const moved = afterMove.find((r) => r.id === first.id);
await dragBy(`[data-testid='arrangement-resize-${first.id}']`, barWidth + 6);
const afterResize = await regionIds();
const resized = afterResize.find((r) => r.id === first.id);
if (resized.bars !== moved.bars + 1) {
  await fail(
    `edge-dragging ${first.id} one bar changed its repeat count from ${moved.bars} to ${resized.bars}, expected ${
      moved.bars + 1
    }.`
  );
}

// Keyboard: the same edit without a pointer, which is how the PC surface does it.
await page.locator(`[data-testid='arrangement-region-${first.id}']`).focus();
await page.keyboard.press("ArrowLeft");
await page.waitForTimeout(60);
const afterKey = await regionIds();
if (afterKey[0].id !== first.id) {
  await fail(`ArrowLeft on ${first.id} did not move it back to the first position.`);
}

/**
 * B5's editors — a section's name and the lanes it silences — in the built app, at 44 px.
 *
 * The unit tests pin the model functions and the component's props; what they cannot see is whether the row exists
 * once a region is selected *in the built app*, whether a typed name reaches the region, and whether the chips are
 * finger-sized. A section you can only address with a pointer is the same defect the rest of this view was built to
 * avoid.
 */
await page.click(`[data-testid='arrangement-region-${first.id}']`);
await page.waitForTimeout(80);
const editor = await page.evaluate(() => {
  const input = document.querySelector("[data-testid='arrangement-label']");
  const chip = document.querySelector("[data-testid^='arrangement-mute-']");
  const size = (el) => {
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { width: Math.round(rect.width), height: Math.round(rect.height) };
  };
  return { input: size(input), chip: size(chip), chipId: chip?.getAttribute("data-testid") ?? null };
});
if (!editor.input || !editor.chip) {
  await fail("selecting a region did not reveal the label input and the lane chips.");
}
for (const [name, box] of [
  ["arrangement-label", editor.input],
  [editor.chipId, editor.chip],
]) {
  if (box.width < 44 || box.height < 44) {
    await fail(`${name} is ${box.width}x${box.height} px, below the 44 px contract.`);
  }
}

await page.fill("[data-testid='arrangement-label']", "probe drop");
await page.keyboard.press("Enter");
await page.waitForTimeout(80);
const renamed = await page.$eval(`[data-testid='arrangement-region-${first.id}']`, (node) =>
  (node.textContent ?? "").replace(/\s+/g, " ").trim()
);
if (!renamed.includes("probe drop")) {
  await fail(`typing a name did not reach the region: it reads "${renamed}".`);
}

await page.click(`[data-testid='${editor.chipId}']`);
await page.waitForTimeout(80);
const pressed = await page.$eval(`[data-testid='${editor.chipId}']`, (node) => node.getAttribute("aria-pressed"));
if (pressed !== "true") {
  await fail(`the lane chip did not report itself as muting (aria-pressed="${pressed}").`);
}

// The transposition stepper: an octave up, then a semitone back down — the readout has to follow.
const transposeValue = () => page.$eval("[data-testid='arrangement-transpose-value']", (node) => node.textContent ?? "");
if (!(await transposeValue()).includes("+0")) {
  await fail(`the transposition readout does not start at zero: "${await transposeValue()}".`);
}
await page.click("[data-testid='arrangement-transpose-up-octave']");
await page.click("[data-testid='arrangement-transpose-down']");
await page.waitForTimeout(80);
if (!(await transposeValue()).includes("+11")) {
  await fail(`+12 then -1 left the readout at "${await transposeValue()}", expected +11.`);
}

/**
 * B5 — the generator, and the two things a delivered arrangement must show.
 *
 * The unit tests prove the form table and the flattening; this proves the wiring in the built app: the picker is
 * reachable, one click replaces the two-section default with the form's own sections, and the sections that carry a
 * build or a fill *say so on the region*. A generated arrangement whose fill is invisible is one the user has to
 * take on trust.
 */
const beforeGenerate = await regionIds();
await page.click("[data-testid='arrangement-form-club']");
await page.waitForTimeout(120);
const afterGenerate = await regionIds();
if (afterGenerate.length === beforeGenerate.length) {
  await fail(
    `the club form produced ${afterGenerate.length} region(s), the same as the default arrangement — the generator ` +
      "did not reach the store."
  );
}
const labelled = await page.$$eval("[data-testid^='arrangement-region-']", (nodes) =>
  // The visible text, not the id: the point of a generated arrangement is that its sections are *named*.
  nodes.map((node) => (node.textContent ?? "").replace(/\s+/g, " ").trim())
);
const badges = await page.evaluate(() => ({
  builds: document.querySelectorAll("[data-testid^='arrangement-build-']").length,
  fills: document.querySelectorAll("[data-testid^='arrangement-fill-']").length,
}));
if (badges.builds === 0 || badges.fills === 0) {
  await fail(
    `the generated arrangement shows ${badges.builds} build badge(s) and ${badges.fills} fill badge(s); the club form ` +
      "has two of each."
  );
}

const summary = {
  regions: afterKey.length,
  barWidth: Math.round(barWidth),
  maxAlignmentErrorPx: Number(
    geometry.offsets
      .map((region) => Math.abs(region.left - geometry.rulerLeft - geometry.barStep * region.startBar))
      .reduce((max, value) => Math.max(max, value), 0)
      .toFixed(2)
  ),
  smallestTarget: targets
    .map((t) => Math.min(t.width, t.height))
    .reduce((min, value) => Math.min(min, value), Number.POSITIVE_INFINITY),
  orderAfterDrag: afterKey.map((r) => `${r.slot}×${r.bars}`).join(" → "),
  generatedRegions: afterGenerate.length,
  generatedLabels: labelled.join(" → "),
  buildBadges: badges.builds,
  fillBadges: badges.fills,
};

if (asJson) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log(
    `✅ Arrangement view: ${summary.regions} regions, ${summary.barWidth} px bars, ` +
      `worst bar misalignment ${summary.maxAlignmentErrorPx} px, smallest finger target ${summary.smallestTarget} px`
  );
  console.log(`   after drag → move → resize → ArrowLeft: ${summary.orderAfterDrag}`);
  console.log("   negative control: a sub-half-bar nudge changed nothing");
  console.log(
    `   generated (club): ${summary.generatedRegions} regions [${summary.generatedLabels}], ` +
      `${summary.buildBadges} build + ${summary.fillBadges} fill badge(s)`
  );
}

await browser.close();
server.close();
process.exit(0);
