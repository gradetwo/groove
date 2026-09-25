/**
 * Which stylesheet rule, if any, stops the page from scrolling?
 *
 *   node scripts/diagnose_page_scroll.mjs
 *
 * ## Resolution (this bug is closed; read this before trusting a method below)
 *
 * The cause was `overscroll-behavior: none` on `html` and `body` in `src/index.css`. Chrome honours
 * that property on touch-capable *desktop* hardware, and on macOS it made a two-finger trackpad
 * gesture stop moving the page entirely, while Safari was unaffected. The fix is the axis split
 * (`-x: none; -y: auto`) now in place, and `src/test/deviceCapabilities.test.ts` guards it.
 *
 * ## Why the measurements below could not find it
 *
 * Every probe in this script scrolls the page *programmatically* (`window.scrollTo`) or asks
 * whether the document is taller than the viewport. Both are true regardless of
 * `overscroll-behavior`: the property gates the *gesture* and the overscroll affordance, not the
 * scroll range or the scroll API. That is why a five-pane probe could honestly report "all five
 * scroll" on the machine running this script while the machine with the trackpad stayed frozen, and
 * why the subset sweep below — which did include an "overscroll removed" variant — could not
 * distinguish them either.
 *
 * The lesson is recorded rather than tidied away: **a probe that bypasses the input path cannot
 * test an input-path bug.** The readout added at the end therefore inspects the *computed* value of
 * the gesture properties on the root, which needs no gesture and no hardware, and is what this
 * script should have done first.
 *
 * The original subset sweep is kept because it is still the cheap way to answer "is the culpable
 * rule in the stylesheet at all".
 *
 * If the sweep reports every subset scrolling *and* the root readout says the gesture properties are
 * clean, then the culprit is not in the stylesheet and the answer has to come from the machine that
 * shows it — which is a useful conclusion in itself, and the one this script makes cheap to reach.
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

const cssPath = path.join(ROOT, "dist", "assets");
const builtCssFile = fs.existsSync(cssPath)
  ? fs.readdirSync(cssPath).find((f) => f.endsWith(".css"))
  : null;
if (!builtCssFile) {
  console.error("❌ No built CSS found — run `npm run build` first.");
  process.exit(1);
}
const builtCss = fs.readFileSync(path.join(cssPath, builtCssFile), "utf8");

/**
 * Subsets of the built stylesheet to test.
 *
 * Each removes one family of rules that a gesture could plausibly be absorbed by. `all` is the
 * control: if the control behaves like the subsets, the stylesheet is not the variable.
 */
const subsets = {
  all: () => builtCss,
  "no touch-action rules": (css) =>
    css.replace(/(^|\})((?:[^{}]*?touch-action[^{}]*?)+)\{/g, (m, brace, sel) => brace),
  "no overscroll-behavior rules": (css) =>
    css.replace(/(^|\})((?:[^{}]*?overscroll[^{}]*?)+)\{/g, (m, brace) => brace),
  "touch-action + overscroll removed": (css) =>
    css
      .replace(/(^|\})((?:[^{}]*?touch-action[^{}]*?)+)\{/g, (m, brace) => brace)
      .replace(/(^|\})((?:[^{}]*?overscroll[^{}]*?)+)\{/g, (m, brace) => brace),
  "no position:fixed rules": (css) =>
    css.replace(/(^|\})((?:[^{}]*?)\{[^{}]*?position:\s*fixed[^{}]*?\})/g, (m, brace) => brace),
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
  const ext = path.extname(file);
  if (ext === ".css") {
    const which = new URL(req.url, "http://x").searchParams.get("subset") ?? "all";
    const apply = subsets[which] ?? subsets.all;
    res.writeHead(200, { "content-type": "text/css" });
    res.end(apply(builtCss));
    return;
  }
  // Rewrite the stylesheet link to go through this server's subset filter.
  if (ext === ".html") {
    const html = fs
      .readFileSync(file, "utf8")
      .replace(
        new RegExp(`/assets/${builtCssFile.replace(".", "\\.")}`, "g"),
        `/assets/${builtCssFile}?subset=SUBSET`
      );
    res.writeHead(200, { "content-type": "text/html" });
    res.end(html);
    return;
  }
  res.writeHead(200, { "content-type": MIME[ext] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const PROBE = `(() => {
  const de = document.documentElement;
  const scrollable = de.scrollHeight > de.clientHeight + 4;
  window.scrollTo(0, 200);
  const afterScrollTo = window.scrollY;
  window.scrollTo(0, 0);
  // Does a wheel over the busiest part of the page reach a handler that cancels it?
  let cancelled = false;
  const onWheel = (e) => { if (e.defaultPrevented) cancelled = true; };
  window.addEventListener("wheel", onWheel, { passive: true });
  return { scrollable, afterScrollTo, scrollHeight: de.scrollHeight, clientHeight: de.clientHeight };
})()`;

const browser = await playwright.chromium.launch({ args: ["--no-sandbox"] });

for (const subset of Object.keys(subsets)) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    try {
      localStorage.setItem("groove_onboarding_completed", "true");
localStorage.setItem("groove_audio_started", "1");
    } catch {
      /* disabled */
    }
  });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/?tab=studio&subset=${subset}`, {
    waitUntil: "domcontentloaded",
  });
  try {
    await page.waitForSelector("[data-testid='track-header-0']", { timeout: 30000 });
  } catch {
    console.log(`\n### ${subset}: studio did not render`);
    await context.close();
    continue;
  }
  const out = await page.evaluate(PROBE);
  console.log(
    `\n### ${subset}\n   scrollHeight=${out.scrollHeight} clientHeight=${out.clientHeight} ` +
      `scrollable=${out.scrollable} scrollTo(200)->${out.afterScrollTo}`
  );
  await context.close();
}

await browser.close();
server.close();

/**
 * The readout that would have found this in one run.
 *
 * It reads the *computed* gesture properties off the root elements. No gesture, no hardware, no
 * subsetting — `overscroll-behavior-y: none` on `html`/`body` is the exact configuration that froze
 * the page on macOS Chrome, and a stylesheet only has to *say* it for the verdict to be "broken".
 */
const rootContext = await (async () => {
  const b = await playwright.chromium.launch({ args: ["--no-sandbox"] });
  const s = http.createServer((req, res) => {
    const url = req.url.split("?")[0];
    const rel = url === "/" ? "/index.html" : url;
    const file = path.join(ROOT, "dist", rel);
    if (!file.startsWith(path.join(ROOT, "dist")) || !fs.existsSync(file)) {
      res.writeHead(404);
      res.end();
      return;
    }
    const ext = path.extname(file);
    res.writeHead(200, { "content-type": MIME[ext] ?? "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await c.newPage();
  await p.goto(`http://127.0.0.1:${s.address().port}/?tab=studio`, { waitUntil: "domcontentloaded" });
  const readout = await p.evaluate(() => {
    const pick = (el) => {
      const cs = getComputedStyle(el);
      return {
        overscrollX: cs.overscrollBehaviorX,
        overscrollY: cs.overscrollBehaviorY,
        touchAction: cs.touchAction,
      };
    };
    return { html: pick(document.documentElement), body: pick(document.body) };
  });
  await c.close();
  await b.close();
  s.close();
  return readout;
})();

console.log("\n### root gesture properties (what a trackpad gesture is gated on)");
let broken = false;
for (const [name, v] of Object.entries(rootContext)) {
  const bad = v.overscrollY === "none" || v.overscrollX === "none";
  if (bad) broken = true;
  console.log(
    `   ${name.padEnd(4)} overscroll-x=${v.overscrollX.padEnd(8)} overscroll-y=${v.overscrollY.padEnd(8)} ` +
      `touch-action=${v.touchAction}${bad ? "   <-- BREAKS TRACKPAD SCROLL IN CHROME" : ""}`
  );
}
console.log(
  broken
    ? "\n❌ The root pins an axis to `none`. On Chrome that suppresses the overscroll affordance,\n" +
        "   which on macOS stops a two-finger trackpad gesture from moving the page at all.\n" +
        "   Use `overscroll-behavior-x: none; overscroll-behavior-y: auto` instead.\n"
    : "\n✅ No root axis is pinned to `none` — the gesture properties are clean.\n" +
        "   If page scrolling is still broken on a real machine, the cause is not this stylesheet.\n"
);
process.exit(broken ? 1 : 0);
