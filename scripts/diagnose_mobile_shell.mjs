/**
 * Diagnostic: what the phone shell actually renders, and why the studio sheet row is absent.
 *
 *   node scripts/diagnose_mobile_shell.mjs
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

const browser = await playwright.chromium.launch({ args: ["--no-sandbox"] });
try {
  const { devices } = require("playwright");
  const ctx = await browser.newContext({ ...devices["iPhone 14"] });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });

  // Mark onboarding complete first so the first-run tour does not cover the shell under test.
  await page.addInitScript(() => {
    try {
      localStorage.setItem("groove_onboarding_completed", "true");
    } catch {
      /* storage disabled */
    }
  });
  await page.goto(`http://127.0.0.1:${port}/?tab=studio`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-testid='mobile-transport-more'], [data-testid='toolbar-advanced-toggle']", { timeout: 30000 });

  const shell = await page.evaluate(() => ({
    viewport: { w: window.innerWidth, h: window.innerHeight },
    coarsePointer: window.matchMedia("(pointer: coarse)").matches,
    hoverNone: window.matchMedia("(hover: none)").matches,
    maxWidth639: window.matchMedia("(max-width: 639px)").matches,
    shortViewport: window.matchMedia("(max-height: 480px)").matches,
    hasMobileTransport: Boolean(document.querySelector("[data-testid='mobile-transport-more']")),
    hasDesktopToolbar: Boolean(document.querySelector("[data-testid='toolbar-advanced-toggle']")),
    hasAudioSettingsInToolbar: Boolean(document.querySelector("[data-testid='studio-audio-settings-open']")),
  }));
  console.log("SHELL:", JSON.stringify(shell, null, 1));

  if (shell.hasMobileTransport) {
    /**
     * Mirror the E2E helper exactly: read the rect, then dispatch pointerdown/pointerup/click at
     * its centre the way `clickVerified` does. A plain `page.click` can succeed where a synthetic
     * click at a stale rect fails, so the diagnostic has to reproduce the real gesture.
     */
    const clickAtCentre = async (selector) =>
      page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return { ok: false, reason: "missing" };
        const r = el.getBoundingClientRect();
        const x = r.x + r.width / 2;
        const y = r.y + r.height / 2;
        const top = document.elementFromPoint(x, y);
        const opts = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, pointerId: 1, pointerType: "touch", isPrimary: true };
        el.dispatchEvent(new PointerEvent("pointerdown", opts));
        el.dispatchEvent(new PointerEvent("pointerup", opts));
        el.dispatchEvent(new MouseEvent("click", opts));
        return {
          ok: top === el || el.contains(top),
          rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
          topAtCentre: top ? `${top.tagName.toLowerCase()}${top.getAttribute("data-testid") ? `[${top.getAttribute("data-testid")}]` : ""}` : "null",
        };
      }, selector);
    // Open the sheet the way a tap does, then track what happens during the row click.
    await page.click("[data-testid='mobile-transport-more']", { timeout: 10000 });
    await page.waitForSelector("[data-testid='mobile-studio-sheet']", { timeout: 10000 });
    // Track sheet presence during a clickVerified-style interaction to find what closes it.
    await page.evaluate(() => {
      window.__sheetLog = [];
      const mo = new MutationObserver(() => {
        window.__sheetLog.push({
          t: Math.round(performance.now()),
          sheet: Boolean(document.querySelector("[data-testid='mobile-studio-sheet']")),
          row: Boolean(document.querySelector("[data-testid='mobile-studio-action-audio-settings']")),
        });
      });
      mo.observe(document.body, { childList: true, subtree: true });
      window.__mo = mo;
    });
    const rowSel = "[data-testid='mobile-studio-action-audio-settings']";
    const st = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
      const r = el.getBoundingClientRect();
      const x = r.x + r.width / 2;
      const y = r.y + r.height / 2;
      const top = document.elementFromPoint(x, y);
      return { rect: { x: Math.round(r.x), y: Math.round(r.y) }, x, y, top: top?.getAttribute("data-testid") ?? top?.tagName };
    }, rowSel);
    console.log("ROW STATE:", JSON.stringify(st));
    await page.mouse.move(st.x, st.y);
    await page.mouse.down();
    await page.waitForTimeout(60);
    await page.mouse.up();
    await page.waitForTimeout(700);
    console.log("AFTER MOUSE CLICK row still there:", await page.evaluate((sel) => Boolean(document.querySelector(sel)), rowSel));
    console.log("SHEET LOG:", JSON.stringify((await page.evaluate(() => window.__sheetLog)).slice(-6)));
    console.log("PANEL OPEN:", await page.evaluate(() => Boolean(document.querySelector("[data-testid='audio-settings-gs1-toggle']"))));
    console.log("AFTER HELPERT-STYLE CLICK sheet:", await page.evaluate(() => Boolean(document.querySelector("[data-testid='mobile-studio-sheet']"))));
    const row = await page.$("[data-testid='mobile-studio-action-audio-settings']");
    console.log("ROW FOUND:", Boolean(row), row ? JSON.stringify(await row.boundingBox()) : "");
    if (row) {
      await page.click("[data-testid='mobile-studio-action-audio-settings']", { timeout: 10000 }).catch((e) => console.log("ROW CLICK ERR:", e.message));
      await page.waitForTimeout(600);
      console.log("AFTER ROW CLICK has audio settings toggle:", await page.evaluate(() => Boolean(document.querySelector("[data-testid='audio-settings-gs1-toggle']"))));
    }
    console.log(
      "ELEMENT AT BUTTON CENTRE:",
      await page.evaluate(() => {
        const btn = document.querySelector("[data-testid='mobile-transport-more']");
        if (!btn) return "(no button)";
        const r = btn.getBoundingClientRect();
        const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        const describe = (n) =>
          n
            ? `${n.tagName.toLowerCase()}${n.getAttribute("data-testid") ? `[${n.getAttribute("data-testid")}]` : ""}.${String(n.className).slice(0, 60)}`
            : "null";
        const chain = [];
        let cur = el;
        while (cur && chain.length < 6) {
          chain.push(describe(cur));
          cur = cur.parentElement;
        }
        return { rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, at: describe(el), chain };
      })
    );
    const afterOpen = await page.evaluate(() => {
      const sheet = document.querySelector("[data-testid='mobile-studio-sheet']");
      return {
        sheetPresent: Boolean(sheet),
        sheetVisible: sheet ? sheet.getBoundingClientRect().height > 0 : false,
        actionIds: [...document.querySelectorAll("[data-testid^='mobile-studio-action-']")].map((el) =>
          el.getAttribute("data-testid")
        ),
        hasAudioSettingsRow: Boolean(document.querySelector("[data-testid='mobile-studio-action-audio-settings']")),
        bodyText: (document.body.innerText || "").slice(0, 400),
      };
    });
    console.log("AFTER OPEN:", JSON.stringify(afterOpen, null, 1));
  }

  console.log(
    "TOP-MOST DIALOGS PRESENT:",
    await page.evaluate(() =>
      [...document.querySelectorAll("[role='dialog']")].map((d) => ({
        testid: d.getAttribute("data-testid") ?? null,
        label: d.getAttribute("aria-label") ?? null,
        heading: (d.querySelector("h1,h2,h3")?.textContent ?? "").slice(0, 60),
        z: getComputedStyle(d).zIndex,
        visible: d.getBoundingClientRect().height > 0,
      }))
    )
  );
  console.log(
    "ANY OVERLAY?",
    await page.evaluate(() =>
      [...document.querySelectorAll("div")].filter((d) => {
        const cs = getComputedStyle(d);
        return cs.position === "fixed" && Number(cs.zIndex) >= 40 && d.getBoundingClientRect().height > 0;
      }).map((d) => ({ cls: String(d.className).slice(0, 70), z: getComputedStyle(d).zIndex })).slice(0, 6)
    )
  );
  console.log("PAGE ERRORS:", errors.slice(0, 8));
} finally {
  await browser.close();
  server.close();
}
