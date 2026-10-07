#!/usr/bin/env node
/**
 * Screenshot every interface and check it for layout and interaction problems.
 *
 *   npm run audit:screens                 # every route plus the dialogs, at 1440x900
 *   npm run audit:screens -- --w=1820 --h=918
 *   npm run audit:screens -- --only=chords
 *
 * Writes `e2e-out/audit-<timestamp>/`: one PNG per route and per dialog, `report.json`, and a
 * `summary.md` a person can read.
 *
 * **Why this exists.** The owner's report was "the UI is misaligned in various places" and asking for
 * screenshots of every screen is the only way to answer it without guessing. The screenshots are the
 * evidence; the checks beside them are what a person would otherwise measure by hand:
 *
 *   * an element past the viewport is only a defect when **nothing scrolls it into reach** — a DAW
 *     grid, a mixer and a timeline are all deliberately wider than the window, so the report separates
 *     `clipped` (unreachable) from `overflow` (inside a horizontal scroller);
 *   * a control with no accessible name is a control a screen reader cannot announce;
 *   * `undefined` / `NaN` / `[object Object]` in the visible text is a template that did not fill in;
 *   * a page error or a non-2xx response is recorded with the URL, so a 404 is read (the cover
 *     fallback chain 404s its skin-specific path on purpose, then loads the shared one).
 *
 * It builds nothing and starts no dev server: it serves `dist/`, so run `npm run build` first (or use
 * a tree whose build is current). It is a report, not a gate — exit code 0 unless it cannot run at all.
 */
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const playwright = require("playwright");
const ROOT = process.cwd();
const args = process.argv.slice(2);
const W = Number(args.find((a) => a.startsWith("--w="))?.split("=")[1] ?? 1440);
const H = Number(args.find((a) => a.startsWith("--h="))?.split("=")[1] ?? 900);
const ONLY = args.find((a) => a.startsWith("--only="))?.split("=")[1] ?? null;
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const OUT = path.join("e2e-out", `audit-${stamp}`);
fs.mkdirSync(OUT, { recursive: true });

/** Every destination the router can show. `/new` has no nav word of its own, which is why it is named here. */
const ROUTES = [
  { name: "studio-arrangement", url: "/?tab=studio" },
  { name: "new-project", url: "/new" },
  { name: "chords", url: "/?tab=chords" },
  { name: "kick", url: "/?tab=kick" },
  { name: "analyzer", url: "/?tab=analyzer" },
  { name: "console", url: "/?tab=console" },
  { name: "masterclass", url: "/?tab=masterclass" },
  { name: "galaxy", url: "/?tab=galaxy" },
  { name: "horizontal-timeline", url: "/?tab=horizontal-timeline" },
  { name: "vertical-timeline", url: "/?tab=vertical-timeline" },
  { name: "compare", url: "/?tab=compare" },
  { name: "challenge", url: "/?tab=challenge" },
  { name: "maker", url: "/?tab=maker" },
  { name: "genre-detail", url: "/?tab=detail&genre=chicago-house" },
];

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2",
  ".wasm": "application/wasm", ".webmanifest": "application/manifest+json", ".mp3": "audio/mpeg",
};
const server = http.createServer((req, res) => {
  const url = req.url.split("?")[0];
  /**
   * ⭐ SPA fallback, the same thing `wrangler.toml`'s `not_found_handling = "single-page-application"`
   * does in production: a path with no file extension is a route, not a missing file. Without it `/new`
   * renders nothing and the report blames the app for the harness.
   */
  let file = path.join(ROOT, "dist", url === "/" ? "/index.html" : url);
  if ((!fs.existsSync(file) || fs.statSync(file).isDirectory()) && !/\.[a-z0-9]{1,8}$/i.test(url)) {
    file = path.join(ROOT, "dist", "index.html");
  }
  if (!file.startsWith(path.join(ROOT, "dist")) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await playwright.chromium.launch({ args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] });
const context = await browser.newContext({ viewport: { width: W, height: H } });
await context.addInitScript(() => {
  try {
    localStorage.setItem("groove_onboarding_completed", "true");
    localStorage.setItem("groove_audio_started", "1");
  } catch {
    /* storage can be disabled; the gate is then dismissed by hand below */
  }
});

/** The measurements taken on whatever is on screen. Shared by the route pass and the dialog pass. */
const collect = (page) =>
  page.evaluate(() => {
    const label = (el) =>
      `${el.tagName.toLowerCase()}${el.getAttribute("data-testid") ? `[${el.getAttribute("data-testid")}]` : ""}.${(el.className ?? "").toString().split(" ").slice(0, 2).join(".")}`;
    const scrollerOf = (el) => {
      for (let node = el.parentElement; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (/(auto|scroll)/.test(style.overflowX) && node.scrollWidth > node.clientWidth + 1) return label(node);
      }
      return null;
    };
    const overflow = [];
    const clipped = [];
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > window.innerWidth + 2) {
        const scroller = scrollerOf(el);
        (scroller ? overflow : clipped).push({ el: label(el), right: Math.round(r.right), w: Math.round(r.width), scroller });
      }
      if (overflow.length + clipped.length > 40) break;
    }
    const tiny = [];
    for (const el of document.querySelectorAll("button, a[href], input, select, [role='button']")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.width < 20 || r.height < 20) tiny.push({ el: label(el), size: `${Math.round(r.width)}x${Math.round(r.height)}` });
      if (tiny.length > 25) break;
    }
    const unnamed = [];
    for (const el of document.querySelectorAll("button, a[href], input, select")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const name = (el.getAttribute("aria-label") || el.getAttribute("title") || el.innerText || el.value || "").trim();
      if (!name) unnamed.push(label(el));
      if (unnamed.length > 20) break;
    }
    const text = document.body.innerText || "";
    const dialogs = [...document.querySelectorAll("[role='dialog'], [role='menu'], [role='listbox']")]
      .filter((el) => el.getBoundingClientRect().height > 0)
      .map((el) => el.getAttribute("data-testid") || el.getAttribute("role"));
    return {
      title: document.title,
      bodyText: text.replace(/\s+/g, " ").slice(0, 200),
      bodyHeight: Math.round(document.body.getBoundingClientRect().height),
      clipped,
      overflow,
      tiny,
      unnamed,
      dialogs,
      badText: ["undefined", "NaN", "[object Object]"].filter((n) => text.includes(n)),
    };
  });

const settle = async (page) => {
  const FIRST = "[data-testid='audio-start-gate'], [data-testid='first-run-prompt'], [data-testid='new-project-panel-v2'], [data-testid='arrangement-grid']";
  await page.waitForSelector(FIRST, { state: "attached", timeout: 30000 }).catch(() => null);
  if (await page.$("[data-testid='audio-start-gate']")) {
    await page.click("[data-testid='audio-start-button']", { force: true }).catch(() => {});
    await page.waitForSelector("[data-testid='audio-start-gate']", { state: "detached", timeout: 20000 }).catch(() => null);
  }
  if (await page.$("[data-testid='first-run-prompt']")) {
    await page.click("[data-testid='first-run-prompt-dismiss']", { force: true }).catch(() => {});
    await page.waitForSelector("[data-testid='first-run-prompt']", { state: "detached", timeout: 20000 }).catch(() => null);
  }
  await page.waitForTimeout(1200);
};

const report = [];
const record = async (page, step, problems, extra = {}) => {
  const diag = await collect(page);
  await page.screenshot({ path: path.join(OUT, `${step}.png`), fullPage: false });
  const row = { step, ...extra, ...problems, ...diag };
  report.push(row);
  const flag = diag.clipped.length ? "❌" : "✓";
  console.log(
    `${flag} ${step.padEnd(26)} ${String(diag.bodyHeight).padStart(6)}px  clipped ${String(diag.clipped.length).padStart(2)}  ` +
      `scroller ${String(diag.overflow.length).padStart(2)}  unnamed ${diag.unnamed.length}  errors ${problems.pageErrors.length + problems.consoleErrors.length}`
  );
  return row;
};

const filtered = ROUTES.filter((r) => !ONLY || r.name.includes(ONLY));
for (const route of filtered) {
  const page = await context.newPage();
  const problems = { consoleErrors: [], pageErrors: [], httpErrors: [] };
  page.on("response", (r) => {
    if (r.status() >= 400) problems.httpErrors.push(`${r.status()} ${r.url().replace(base, "")}`);
  });
  page.on("console", (m) => {
    if (m.type() === "error") problems.consoleErrors.push(m.text().slice(0, 160));
  });
  page.on("pageerror", (e) => problems.pageErrors.push(e.message.slice(0, 160)));
  try {
    await page.goto(`${base}${route.url}`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await record(page, `route-${route.name}`, problems, { url: route.url });
  } catch (error) {
    report.push({ step: `route-${route.name}`, url: route.url, ok: false, error: String(error).slice(0, 200), ...problems });
    console.log(`✗ route-${route.name}: ${String(error).slice(0, 140)}`);
  } finally {
    await page.close();
  }
}

if (!ONLY) {
  const page = await context.newPage();
  const problems = { consoleErrors: [], pageErrors: [], httpErrors: [] };
  page.on("pageerror", (e) => problems.pageErrors.push(e.message.slice(0, 160)));
  await page.goto(`${base}/?tab=studio`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const openAndRecord = async (name, opener, key = "Escape") => {
    try {
      await opener();
      await page.waitForTimeout(500);
      await record(page, `dialog-${name}`, problems);
    } catch (error) {
      report.push({ step: `dialog-${name}`, ok: false, error: String(error).slice(0, 160), ...problems });
      console.log(`✗ dialog-${name}: ${String(error).slice(0, 120)}`);
    }
    await page.keyboard.press(key).catch(() => {});
    await page.waitForTimeout(300);
  };
  await openAndRecord("settings", () => page.click("[data-testid='header-settings-open']", { force: true }));
  await openAndRecord("settings-interface", async () => {
    await page.click("[data-testid='header-settings-open']", { force: true });
    await page.click("[data-testid='settings-tab-interface']", { force: true });
  });
  await openAndRecord("help", () => page.click("[data-testid='header-help-button']", { force: true }));
  await openAndRecord("command-palette", () => page.keyboard.press("Control+k"));
  await openAndRecord("explore", () => page.click("button:has-text('Explore')", { force: true }));
  const escaped = await page.evaluate(
    () => [...document.querySelectorAll("[role='dialog']")].filter((el) => el.getBoundingClientRect().height > 0).length
  );
  report.push({ step: "dialogs-closed", dialogsAfterEscape: escaped });
  console.log(`· dialogs still open after Escape: ${escaped}`);
  await page.close();
}

fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
const clipped = report.filter((r) => (r.clipped ?? []).length > 0);
const unnamed = report.filter((r) => (r.unnamed ?? []).length > 0);
const errors = report.filter((r) => (r.pageErrors ?? []).length > 0 || (r.consoleErrors ?? []).length > 0);
fs.writeFileSync(
  path.join(OUT, "summary.md"),
  [
    `# Screen audit — ${stamp}`,
    "",
    `Viewport: ${W}x${H}. Screens: ${report.length}.`,
    "",
    "## Clipped content (nothing scrolls it into reach)",
    ...(clipped.length ? clipped.map((r) => `- ${r.step}: ${r.clipped.map((c) => c.el).join(", ")}`) : ["- none"]),
    "",
    "## Controls with no accessible name",
    ...(unnamed.length ? unnamed.map((r) => `- ${r.step}: ${r.unnamed.join(", ")}`) : ["- none"]),
    "",
    "## Console / page errors",
    ...(errors.length
      ? errors.flatMap((r) => [...(r.pageErrors ?? []).map((e) => `- ${r.step} pageerror: ${e}`), ...(r.consoleErrors ?? []).map((e) => `- ${r.step} console: ${e}`)])
      : ["- none"]),
    "",
    "## Every screen",
    "",
    "| screen | height | clipped | in scroller | tiny | unnamed | http 4xx |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...report.map(
      (r) =>
        `| ${r.step} | ${r.bodyHeight ?? "-"} | ${(r.clipped ?? []).length} | ${(r.overflow ?? []).length} | ${(r.tiny ?? []).length} | ${(r.unnamed ?? []).length} | ${(r.httpErrors ?? []).length} |`
    ),
  ].join("\n")
);
console.log(`\nwrote ${OUT}/ (report.json, summary.md, ${report.length} screenshot(s))`);
await browser.close();
server.close();
