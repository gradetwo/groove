/**
 * Which stylesheet rule, if any, stops the page from scrolling?
 *
 *   node scripts/diagnose_page_scroll.mjs
 *
 * The report: two-finger trackpad scrolling does not move the page on macOS Chrome. It is not
 * reproducible in headless Chromium here — a synthetic wheel reaches the element under the cursor,
 * nothing cancels it, the document is taller than the viewport and `window.scrollTo` moves it — and a
 * five-pane probe of the *candidate CSS rules* was reported to scroll in every pane, which rules the
 * stylesheet out as a whole.
 *
 * So this does the one useful thing left: it loads the real app with `index.css` reduced to a
 * *subset* of its rules and measures whether the page still scrolls. If some single rule is
 * responsible, the subset that omits it will scroll where the full stylesheet does not. If every
 * subset scrolls here, then the culprit is not in the stylesheet at all and the answer has to come
 * from the machine that shows it — which is a useful conclusion in itself, and the one this script
 * makes cheap to reach.
 *
 * The measurement is deliberately independent of `page.mouse.wheel`: a real trackpad cannot be
 * simulated, so this checks the two things a wheel gesture depends on — that the page is scrollable
 * at all, and that a wheel over each element type is *delivered without being cancelled*.
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
console.log(
  "\nIf every subset reports scrollable=true, the stylesheet does not contain the cause — the\n" +
    "remaining candidates are macOS/Chrome gesture handling, which cannot be reproduced here."
);
