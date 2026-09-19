#!/usr/bin/env node
/**
 * What does the phone surface actually put on screen?
 *
 *   npm run build && node scripts/measure_phone_surface.mjs [--json]
 *
 * The phone UI redesign (the second half of `PRODUCT_PLAN_v2.1.0.md`'s objective) has to start from
 * what is there, not from an impression of it. This probe answers four questions per orientation, on
 * the real built app:
 *
 *   1. **Zoom** — does the viewport meta still let the browser magnify the page, and would a
 *      pinch also raise the iOS magnifier loupe over the step grid? (The objective forbids both.)
 *   2. **Density** — how many interactive controls are visible at once, and how many of them sit in
 *      the *working area* rather than in the two fixed bars? "Never a wall of buttons" is a count.
 *   3. **Targets** — every visible control's box, and which ones are under the 44 px touch minimum.
 *      A control that is too small to hit reliably is a control that should not be offered on a
 *      phone at all.
 *   4. **Text** — the smallest computed font size actually rendered, and its text.
 *
 * It prints; it does not assert. The numbers go into the plan as the redesign's baseline, and the
 * invariants that already hold become gates in the E2E matrix (`scripts/test_matrix.js`) where they
 * can fail a release.
 */
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const playwright = require("playwright");
const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const args = process.argv.slice(2);
const asJson = args.includes("--json");
/** `--shots=DIR` writes one PNG per orientation, because "is this a wall of buttons" is a look. */
const shotsArg = args.find((a) => a.startsWith("--shots="));
const shotsDir = shotsArg ? path.resolve(ROOT, shotsArg.slice("--shots=".length)) : null;

if (!fs.existsSync(path.join(DIST, "index.html"))) {
  console.error("❌ dist/index.html is missing — run `npm run build` first.");
  process.exit(1);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".wasm": "application/wasm",
};

/** Static server with SPA fallback, the same contract the deployed worker has. */
const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  let filePath = path.join(DIST, decodeURIComponent(url.pathname));
  if (url.pathname.endsWith("/")) filePath = path.join(filePath, "index.html");
  if (!filePath.startsWith(DIST) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST, "index.html");
  }
  res.setHeader("Content-Type", MIME[path.extname(filePath)] ?? "application/octet-stream");
  fs.createReadStream(filePath).pipe(res);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}/`;

/** Runs inside the page: the whole inventory, so nothing is measured across two round trips. */
function collectSurface() {
  const MIN_TAP = 44;
  /** The point the user would actually hit, before anything is counted. */
  const receivesHit = (el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) return false;
    const hit = document.elementFromPoint(x, y);
    // A laid-out but clipped element (a collapsed menu, an overflow-hidden container) fails here,
    // which is the point: this counts what the user can touch, not what the tree contains.
    return Boolean(hit && (hit === el || el.contains(hit)));
  };
  const describe = (el) => {
    const label =
      el.getAttribute("aria-label") ||
      el.getAttribute("title") ||
      (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 28) ||
      el.tagName.toLowerCase();
    return { label, testid: el.getAttribute("data-testid") ?? null };
  };
  const inBar = (el) =>
    Boolean(el.closest('[data-testid="mobile-tab-bar"], [data-testid="mobile-transport-bar"]'));
  /**
   * A step grid is not a toolbar.
   *
   * `StepCell` is a focusable `role="gridcell"`, so a naive query counts 16 steps × N tracks as
   * "controls" and reports the whole grid as undersized buttons. Both facts matter, but they are
   * different facts: how many *choices* the grid offers is a design constraint (390 px ÷ 16 steps
   * is 24 px per target no matter how the cell is drawn), while how many buttons a toolbar shows is
   * the density question.
   */
  const isGridCell = (el) =>
    el.getAttribute("role") === "gridcell" || Boolean(el.closest('[role="grid"]'));

  const selector = 'button, a[href], select, input, textarea, [role="button"], [tabindex="0"]';
  const controls = [];
  const gridCells = [];
  for (const el of Array.from(document.querySelectorAll(selector))) {
    if (!receivesHit(el)) continue;
    const rect = el.getBoundingClientRect();
    const entry = {
      tag: el.tagName.toLowerCase(),
      ...describe(el),
      inBar: inBar(el),
      w: Math.round(rect.width),
      h: Math.round(rect.height),
      tooSmall: rect.width < MIN_TAP || rect.height < MIN_TAP,
    };
    (isGridCell(el) ? gridCells : controls).push({ ...entry, role: el.getAttribute("role") });
  }

  const fontSizes = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = (node.textContent ?? "").trim();
    const parent = node.parentElement;
    if (text.length > 1 && parent && receivesHit(parent)) {
      fontSizes.push({
        px: Number.parseFloat(window.getComputedStyle(parent).fontSize),
        text: text.slice(0, 24),
      });
    }
    node = walker.nextNode();
  }
  fontSizes.sort((a, b) => a.px - b.px);

  const bar = (testid) => {
    const el = document.querySelector(`[data-testid="${testid}"]`);
    return el ? Math.round(el.getBoundingClientRect().height) : null;
  };
  const main = document.querySelector("main");
  const cellWidths = gridCells.map((c) => c.w).sort((a, b) => a - b);

  return {
    viewportMeta: document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? null,
    innerW: window.innerWidth,
    innerH: window.innerHeight,
    scrollOverflowPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    controls,
    workingAreaControls: controls.filter((c) => !c.inBar).length,
    gridCells: {
      count: gridCells.length,
      minW: cellWidths[0] ?? null,
      maxW: cellWidths[cellWidths.length - 1] ?? null,
      minH: gridCells.length ? Math.min(...gridCells.map((c) => c.h)) : null,
      under44: gridCells.filter((c) => c.tooSmall).length,
      // The three narrowest, so the report can say *which* cells are small instead of implying
      // every step of the grid is.
      smallest: [...gridCells]
        .sort((a, b) => a.w * a.h - b.w * b.h)
        .slice(0, 3)
        .map((cell) => ({ ...cell, role: cell.role ?? null })),
    },
    mainNodeCount: main ? main.querySelectorAll("*").length : 0,
    smallestFonts: fontSizes.slice(0, 5),
    chrome: {
      tabBar: bar("mobile-tab-bar"),
      transport: bar("mobile-transport-bar"),
    },
  };
}

const report = [];
const browser = await playwright.chromium.launch({ args: ["--no-sandbox"] });
try {
  for (const orientation of ["portrait", "landscape"]) {
    const device = orientation === "portrait" ? "iPhone 14" : "iPhone 14 landscape";
    const context = await browser.newContext({ ...playwright.devices[device] });
    /**
     * Skip the first-run onboarding, the same way the E2E matrix does.
     *
     * Without this the probe measures a *modal* over the studio — the first attempt counted the
     * tour's own buttons as if they were the phone surface. The surface under test is the one a
     * returning user gets.
     */
    await context.addInitScript(() => {
      try {
        localStorage.setItem("groove_onboarding_completed", "true");
      } catch (_) {}
    });
    const page = await context.newPage();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    // The studio is the phone's home tab; wait for the grid, not for a timeout.
    await page.waitForSelector('[data-testid="piano-roll-grid"], [data-testid="step-grid"], main', {
      timeout: 15000,
    });
    await page.waitForTimeout(400);

    const measured = await page.evaluate(collectSurface);
    if (shotsDir) {
      fs.mkdirSync(shotsDir, { recursive: true });
      const file = path.join(shotsDir, `phone-${orientation}.png`);
      await page.screenshot({ path: file });
      measured.screenshot = path.relative(ROOT, file);
    }
    report.push({ orientation, device, ...measured });
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  for (const entry of report) {
    const tooSmall = entry.controls.filter((c) => c.tooSmall);
    const chromePx = (entry.chrome.tabBar ?? 0) + (entry.chrome.transport ?? 0);
    console.log(`\n=== ${entry.device} (${entry.orientation}) ${entry.innerW}×${entry.innerH}`);
    console.log(`viewport meta      ${entry.viewportMeta}`);
    console.log(
      `zoom               ${
        /user-scalable=no/.test(entry.viewportMeta ?? "")
          ? "blocked (user-scalable=no)"
          : "ALLOWED — the magnifier can appear"
      }`
    );
    console.log(`horizontal overflow ${entry.scrollOverflowPx} px`);
    console.log(
      `fixed chrome       ${chromePx} px (${Math.round((chromePx / entry.innerH) * 100)}% of the viewport)` +
        ` — tab bar ${entry.chrome.tabBar} px, transport ${entry.chrome.transport} px`
    );
    console.log(
      `controls           ${entry.controls.length} touchable (${entry.workingAreaControls} in the working area,` +
        ` ${entry.controls.length - entry.workingAreaControls} in the two bars)`
    );
    console.log(`tap targets        ${tooSmall.length} of those under 44 px`);
    for (const control of tooSmall.slice(0, 10)) {
      console.log(`   ${control.w}×${control.h}  ${control.tag} "${control.label}" ${control.testid ?? ""}`);
    }
    const grid = entry.gridCells;
    console.log(
      `step grid          ${grid.count} cells, ${grid.minW}–${grid.maxW}×${grid.minH} px` +
        ` (${grid.under44} under 44 px; ${entry.innerW} px ÷ ${Math.max(1, Math.round(entry.innerW / Math.max(1, grid.maxW)))} steps ≈ ${grid.maxW} px each)`
    );
    for (const cell of grid.smallest ?? []) {
      console.log(
        `   smallest cell    ${cell.w}×${cell.h}  ${cell.tag} role=${cell.role ?? "-"} ${cell.testid ?? cell.label}`
      );
    }
    console.log(`main DOM nodes     ${entry.mainNodeCount}`);
    console.log(
      `smallest text      ${entry.smallestFonts
        .map((f) => `${f.px}px "${f.text}"`)
        .join(" | ")}`
    );
    const bars = entry.controls.filter((c) => c.inBar).map((c) => c.testid ?? c.label);
    console.log(`bar controls       ${bars.join(", ")}`);
    if (entry.screenshot) console.log(`screenshot         ${entry.screenshot}`);
  }
  console.log("\n(no assertions — the invariants that hold belong in scripts/test_matrix.js)");
}
