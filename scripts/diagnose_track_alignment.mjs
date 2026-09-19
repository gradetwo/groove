/**
 * Diagnostic: the frozen left column and the step columns must agree on x.
 *
 *   node scripts/diagnose_track_header.mjs alignment
 *
 * The ruler label, the track headers and the velocity lane all pin to the left edge of
 * the step grid. They used to be 138 / 142 / 126 px wide with two different gaps, so the
 * narrower sticky column of one painted over the wider column of the other. This prints
 * the resolved width and the x of the first step in each layer, so "aligned" is measured
 * rather than assumed.
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
  const round = (n) => Math.round(n * 10) / 10;
  const left = (el) => (el ? round(el.getBoundingClientRect().left) : null);
  const width = (el) => (el ? round(el.getBoundingClientRect().width) : null);
  const root = getComputedStyle(document.documentElement);
  const out = {
    varHeadW: root.getPropertyValue("--trk-head-w").trim(),
    varGap: root.getPropertyValue("--trk-head-gap").trim(),
  };
  const rulerLabel = document.querySelector(".custom-sequencer-scroll > div:nth-child(2) > div:first-child")
    || document.querySelector("[class*='sticky'][class*='z-30']");
  out.rulerLabel = { w: width(rulerLabel), left: left(rulerLabel) };
  const rulerFirstStep = document.querySelector("[class*='sticky'][class*='z-30']")?.nextElementSibling?.firstElementChild;
  out.rulerFirstStepLeft = left(rulerFirstStep);

  const row = document.querySelector(".track-row-0");
  out.rowHeader = { w: width(row?.querySelector(":scope > div")), left: left(row?.querySelector(":scope > div")) };
  const grid = row?.querySelector(":scope > div:nth-child(2)");
  out.rowGridLeft = left(grid);
  out.rowFirstCellLeft = left(grid?.firstElementChild);
  out.rowCellWidth = width(grid?.firstElementChild);
  return out;
})()`;

const browser = await playwright.chromium.launch({ args: ["--no-sandbox"] });
const targets = [
  ["desktop-1440", 1440, 900, null],
  ["iPhone14-portrait", 390, 664, playwright.devices["iPhone 14"]],
  ["iPad11-portrait", 834, 1194, playwright.devices["iPad Pro 11"]],
  ["iPhone14-landscape", 844, 390, playwright.devices["iPhone 14"]],
];

for (const [label, width, height, device] of targets) {
  const context = await browser.newContext({ ...(device ?? {}) });
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
    console.log(`\n### ${label}: no track header rendered`);
    await context.close();
    continue;
  }
  const out = await page.evaluate(PROBE);
  const aligned = out.rulerLabel.w === out.rowHeader.w;
  const firstStepAligned = out.rulerFirstStepLeft === out.rowFirstCellLeft;
  console.log(`\n### ${label}  --trk-head-w=${out.varHeadW} --trk-head-gap=${out.varGap}`);
  console.log(`  ruler label  w=${out.rulerLabel.w} left=${out.rulerLabel.left}`);
  console.log(`  row  header  w=${out.rowHeader.w} left=${out.rowHeader.left}`);
  console.log(`  ruler first step left=${out.rulerFirstStepLeft}   row first cell left=${out.rowFirstCellLeft} (w=${out.rowCellWidth})`);
  console.log(`  widths ${aligned ? "ALIGNED" : "MISALIGNED by " + (out.rulerLabel.w - out.rowHeader.w) + "px"}; first column ${firstStepAligned ? "ALIGNED" : "OFFSET by " + (out.rulerFirstStepLeft - out.rowFirstCellLeft) + "px"}`);
  await context.close();
}

await browser.close();
server.close();
