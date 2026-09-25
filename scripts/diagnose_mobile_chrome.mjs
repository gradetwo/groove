/**
 * How much of a phone's viewport is spent on fixed chrome.
 *
 *   node scripts/diagnose_mobile_chrome.mjs
 *
 * The two fixed bars (the phone tab bar and the studio transport bar) cost the same 112 px in both
 * orientations, which is why the *ratio* is the number that matters: 17 % of a 664 px portrait
 * viewport but 29 % of a 390 px landscape one. Landscape is therefore where the working area is
 * actually lost, and it is the orientation every "make the phone usable" decision has to be
 * measured against.
 *
 * Prints, per orientation: each bar's real box, the fixed total as a percentage of the viewport,
 * and the grid's box. The last is the one that describes the user's actual workspace — the bars sit
 * at opposite ends, so the grid's height is what the bars cost.
 *
 *   portrait  vh=664   transport 59px + tab bar 53px = 112px (17%)
 *   landscape vh=390   transport 49px + tab bar 53px = 102px (26%)
 */
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const playwright = require("playwright");
const ROOT = process.cwd();

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
  const rel = req.url.split("?")[0] === "/" ? "/index.html" : req.url.split("?")[0];
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
const port = server.address().port;

const PROBE = `(() => {
  const box = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      left: Math.round(r.left),
      right: Math.round(r.right),
      top: Math.round(r.top),
      h: Math.round(r.height),
      bottom: Math.round(r.bottom),
    };
  };
  const vh = window.innerHeight;
  const tabBar = box("[data-testid='mobile-tab-bar']");
  const transport = box("[data-testid='mobile-transport-bar']");
  const grid = box("[role='grid']");
  /**
   * Whether the bars sit one above the other, share a row, or neither.
   *
   * Computed before the footprint because the footprint depends on it: stacked bars cost the sum of
   * their heights, and bars sharing a row cost only the taller one. "Top minus bottom" is the wrong
   * way to describe either — once they share a row the transport's top is *below* the tab bar's and
   * the subtraction goes negative, which is exactly the misleading number the first version printed.
   */
  const stacked = Boolean(
    tabBar && transport &&
    tabBar.left < transport.right && transport.left < tabBar.right &&
    tabBar.top < transport.bottom && transport.top < tabBar.bottom
  );
  const sideBySide = Boolean(
    tabBar && transport &&
    tabBar.bottom === transport.bottom &&
    (tabBar.right <= transport.left || transport.right <= tabBar.left)
  );
  const stackedFootprintPx = (tabBar?.h ?? 0) + (transport?.h ?? 0);
  return {
    vh,
    layout: document.querySelector("[data-testid='mobile-transport-bar']")?.getAttribute("data-layout") ?? null,
    tabBar,
    transport,
    grid,
    stacked,
    sideBySide,
    /**
     * How much *height* the bars claim — the layout's vertical footprint, and the number a "the bars
     * eat the screen" complaint is actually about.
     *
     * Reported for the bars rather than as an "unobstructed height": in portrait the transport sits
     * in the panel's own flow partway down the page, so "everything below it is free" is true and
     * useless.
     */
    stackedFootprintPx,
    footprintPx: stacked ? stackedFootprintPx : Math.max(tabBar?.h ?? 0, transport?.h ?? 0),
  };
})()`;

const TARGETS = [
  ["portrait", 390, 664],
  ["landscape", 844, 390],
];

const browser = await playwright.chromium.launch({ args: ["--no-sandbox"] });
const results = {};

for (const [label, width, height] of TARGETS) {
  const context = await browser.newContext({ ...playwright.devices["iPhone 14"] });
  await context.addInitScript(() => {
    try {
      localStorage.setItem("groove_onboarding_completed", "true");
localStorage.setItem("groove_audio_started", "1");
    } catch {
      /* disabled */
    }
  });
  const page = await context.newPage();
  await page.setViewportSize({ width, height });
  await page.goto(`http://127.0.0.1:${port}/?tab=studio`, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForSelector("[data-testid='track-header-0']", { timeout: 30000 });
  } catch {
    console.log(`\n### ${label}: studio did not render`);
    await context.close();
    continue;
  }
  const out = await page.evaluate(PROBE);
  results[label] = out;
  console.log(`\n### ${label} viewport ${width}x${height} (vh=${out.vh})`);
  console.log(`  transport bar  ${JSON.stringify(out.transport)}  layout=${out.layout}`);
  console.log(`  tab bar        ${JSON.stringify(out.tabBar)}`);
  console.log(
    `  bars           ${out.stacked ? "STACKED" : out.sideBySide ? "SIDE BY SIDE (one row)" : "neither — check the markup"}`
  );
  console.log(
    `  height claimed ${out.footprintPx}px = ${Math.round((out.footprintPx / out.vh) * 100)}% of the viewport ` +
      `(stacked it would be ${out.stackedFootprintPx}px)`
  );
  await context.close();
}

if (results.portrait && results.landscape) {
  const l = results.landscape;
  console.log(
    `\nlandscape claims ${l.footprintPx}px of height ` +
      `(${Math.round((l.footprintPx / l.vh) * 100)}% of the viewport), bars ` +
      `${l.sideBySide ? "sharing one row" : l.stacked ? "stacked" : "in an unrecognised arrangement"}`
  );
  if (l.sideBySide) {
    console.log(
      `OK — one row of ${l.footprintPx}px instead of ${l.stackedFootprintPx}px stacked, ` +
        `so ${l.stackedFootprintPx - l.footprintPx}px of height is back`
    );
  } else {
    console.log("*** landscape still stacks two full-width bars ***");
  }
  console.log(
    `portrait claims ${results.portrait.footprintPx}px ` +
      `(${Math.round((results.portrait.footprintPx / results.portrait.vh) * 100)}%) — unchanged by design`
  );
}

await browser.close();
server.close();
