/**
 * Diagnostic: the insert-EQ band drag on a landscape phone.
 *
 *   node scripts/diagnose_mobile_inspector.mjs
 *
 * The E2E matrix fails on exactly one target (iPhone landscape) with "dragging the mid band handle
 * changed nothing". This reproduces the drag there and prints the handle's box, the hit test and
 * the value before/after, so the cause is observed rather than guessed at.
 */
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const playwright = require("playwright");
const ROOT = process.cwd();

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2", ".wasm": "application/wasm" };

const server = http.createServer((req, res) => {
  const rel = req.url.split("?")[0] === "/" ? "/index.html" : req.url.split("?")[0];
  const file = path.join(ROOT, "dist", rel);
  if (!file.startsWith(path.join(ROOT, "dist")) || !fs.existsSync(file)) return void (res.writeHead(404), res.end());
  res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const browser = await playwright.chromium.launch({ args: ["--no-sandbox"] });

const probe = async (label, width, height) => {
  const context = await browser.newContext({ ...playwright.devices["iPhone 14"] });
  await context.addInitScript(() => {
    try { localStorage.setItem("groove_onboarding_completed", "true"); } catch { /* disabled */ }
  });
  const page = await context.newPage();
  await page.setViewportSize({ width, height });
  await page.goto(`http://127.0.0.1:${port}/?tab=studio`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-testid='mobile-transport-more'], [data-testid='toolbar-advanced-toggle']", { timeout: 30000 });

  await page.click("[data-testid='track-inspector-open-0']", { force: true }).catch(() => {});
  await page.waitForTimeout(600);
  // Mixer tab -> EQ stage.
  // These are inside the inspector's scroller, so scroll each into view before clicking.
  const clickInInspector = async (sel) => {
    const el = await page.$(sel);
    if (!el) return `${sel}: missing`;
    await el.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(200);
    const b = await el.boundingBox();
    if (!b) return `${sel}: no box`;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(40);
    await page.mouse.up();
    await page.waitForTimeout(250);
    return `${sel}: clicked`;
  };
  console.log(`${label} ${await clickInInspector("[data-testid='track-inspector-tab-mix']")}`);
  console.log(`${label} ${await clickInInspector("[data-testid='insert-flow-eq']")}`);

  const handle = await page.$("[data-testid='insert-eq-handle-mid']");
  if (!handle) {
    console.log(`${label}: no EQ handle (inspector=${Boolean(await page.$("[data-testid='track-inspector']"))})`);
    await context.close();
    return;
  }
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  const before = await page.inputValue("[data-testid='track-inspector-mid-gain']");
  console.log(`${label} HANDLE:`, JSON.stringify(await page.evaluate(() => {
    const el = document.querySelector("[data-testid='insert-eq-handle-mid']");
    if (!el) return { present: false };
    const r = el.getBoundingClientRect();
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;
    const top = document.elementFromPoint(cx, cy);
    return {
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      viewport: { w: window.innerWidth, h: window.innerHeight },
      topAtCentre: top ? `${top.tagName.toLowerCase()}${top.getAttribute("data-testid") ? `[${top.getAttribute("data-testid")}]` : ""}` : "null",
      reachable: Boolean(top) && (top === el || el.contains(top)),
    };
  })));

  if (box) {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const roomAbove = cy - 8;
    const dist = Math.max(6, Math.min(24, roomAbove));
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx, cy - dist, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    const after = await page.inputValue("[data-testid='track-inspector-mid-gain']");
    console.log(`${label} DRAG: cy=${Math.round(cy)} dist=${Math.round(dist)} gain ${before} -> ${after}`);
  }
  await context.close();
};

try {
  await probe("PORTRAIT(390x664)", 390, 664);
  await probe("LANDSCAPE(750x340)", 750, 340);
} finally {
  await browser.close();
  server.close();
}
