/**
 * Diagnostic: the track inspector's geometry on a landscape phone.
 *
 *   node scripts/diagnose_mobile_inspector.mjs
 *
 * The E2E matrix fails on exactly one target (iPhone landscape) because
 * `waitForSelector('[data-testid="track-inspector"]', { state: "visible" })` times out there.
 * This prints the real box, computed styles and hit test so the cause is observed rather than
 * guessed at.
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
    try { localStorage.setItem("groove_onboarding_completed", "true");
localStorage.setItem("groove_audio_started", "1"); } catch { /* disabled */ }
  });
  const page = await context.newPage();
  await page.setViewportSize({ width, height });
  await page.goto(`http://127.0.0.1:${port}/?tab=studio`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-testid='mobile-transport-more'], [data-testid='toolbar-advanced-toggle']", { timeout: 30000 });
  const btn = await page.$("[data-testid='track-inspector-open-0']");
  if (!btn) { console.log(`${label}: no inspector open button`); await context.close(); return; }
  const btnState = await page.evaluate(() => {
    const b = document.querySelector("[data-testid='track-inspector-open-0']");
    if (!b) return { present: false };
    const r = b.getBoundingClientRect();
    const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return {
      present: true,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      topAtCentre: t ? `${t.tagName.toLowerCase()}${t.getAttribute("data-testid") ? `[${t.getAttribute("data-testid")}]` : ""}` : "null",
      reachable: Boolean(t) && (t === b || b.contains(t)),
    };
  });
  console.log(`${label} OPEN BUTTON:`, JSON.stringify(btnState));
  if (btnState.present && btnState.reachable) {
    await page.click("[data-testid='track-inspector-open-0']", { force: true });
  } else if (btnState.present) {
    // Dispatch directly, so we can tell "the button does not fire" from "the button is covered".
    await page.evaluate(() => {
      const b = document.querySelector("[data-testid='track-inspector-open-0']");
      const r = b.getBoundingClientRect();
      const o = { bubbles: true, cancelable: true, composed: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, pointerId: 1, pointerType: "touch", isPrimary: true };
      b.dispatchEvent(new PointerEvent("pointerdown", o));
      b.dispatchEvent(new PointerEvent("pointerup", o));
      b.dispatchEvent(new MouseEvent("click", o));
    });
  }
  await page.waitForTimeout(900);
  console.log(`${label} INSPECTOR:`, JSON.stringify(await page.evaluate(() => {
    const el = document.querySelector("[data-testid='track-inspector']");
    if (!el) return { present: false };
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      present: true,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      display: cs.display, visibility: cs.visibility, opacity: cs.opacity,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      playwrightVisible: r.width > 0 && r.height > 0 && cs.visibility !== "hidden",
      topAtSheetTop: (() => { const t = document.elementFromPoint(r.x + r.width / 2, r.y + Math.min(20, r.height / 2)); return t ? `${t.tagName.toLowerCase()}${t.getAttribute("data-testid") ? `[${t.getAttribute("data-testid")}]` : ""}` : "null"; })(),
    };
  })));
  await context.close();
};

try {
  await probe("PORTRAIT(390x664)", 390, 664);
  await probe("LANDSCAPE(750x340)", 750, 340);
} finally {
  await browser.close();
  server.close();
}
