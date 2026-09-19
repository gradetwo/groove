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
    return { top: Math.round(r.top), h: Math.round(r.height), bottom: Math.round(r.bottom) };
  };
  const vh = window.innerHeight;
  const tabBar = box("[data-testid='mobile-tab-bar']");
  const transport = box("[data-testid='mobile-transport-bar']");
  const grid = box("[role='grid']");
  const chrome = (tabBar?.h ?? 0) + (transport?.h ?? 0);
  /**
   * The band of viewport that is neither bar — the space a user can actually look at.
   *
   * Reported instead of the grid's box height because the grid *scrolls*: its box is the full
   * pattern (747 px of rows in a 390 px viewport), so its height says nothing about how much of
   * the screen the user has. The distance between the two bars does.
   */
  const available = (tabBar ? tabBar.top : vh) - (transport ? transport.bottom : 0);
  return {
    vh,
    layout: document.querySelector("[data-testid='mobile-transport-bar']")?.getAttribute("data-layout") ?? null,
    tabBar,
    transport,
    chromePx: chrome,
    chromePct: Math.round((chrome / vh) * 100),
    grid,
    availablePx: Math.round(available),
    availablePct: Math.round((available / vh) * 100),
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
  console.log(`  fixed chrome   ${out.chromePx}px = ${out.chromePct}% of the viewport`);
  console.log(
    `  free band      ${out.availablePx}px = ${out.availablePct}% of the viewport (between the two bars)`
  );
  await context.close();
}

if (results.portrait && results.landscape) {
  const saved = results.portrait.transport.h - results.landscape.transport.h;
  console.log(
    `\nlandscape transport is ${saved}px shorter than portrait ` +
      `(${results.portrait.transport.h} -> ${results.landscape.transport.h})`
  );
  console.log(
    saved > 0
      ? "OK — the landscape layout is doing something"
      : "*** the landscape layout is identical to portrait ***"
  );
}

await browser.close();
server.close();
