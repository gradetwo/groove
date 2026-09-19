/**
 * Does the 界面密度 setting change real geometry?
 *
 *   node scripts/diagnose_density.mjs
 *
 * The unit suite proves `data-density` is written and that the CSS has one link per concern, but
 * jsdom applies no stylesheet — so "the setting does something" can only be answered by measuring
 * a real step cell in a real engine. This sets the stored preference, reloads, and reports the
 * resolved `--step-cell-h`, the cell's real height and the track row's real height, in the three
 * tiers, on desktop and on a phone.
 *
 * It also checks the landscape phone separately, because that is where a density setting is
 * easiest to break: the short-landscape block must re-derive the density *inputs* rather than
 * override the resolved value, or it silently outranks the user's choice by specificity.
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
  const root = getComputedStyle(document.documentElement);
  const cell = document.querySelector("[data-testid='step-cell-0-0'], [data-step-idx='0']")
    || document.querySelector(".track-row-0 > div:nth-child(2) > *");
  const row = document.querySelector(".track-row-0");
  const head = row ? row.querySelector(":scope > div") : null;
  return {
    attr: document.documentElement.getAttribute("data-density"),
    varH: root.getPropertyValue("--step-cell-h").trim(),
    varRowY: root.getPropertyValue("--track-row-pad-y").trim(),
    cellH: cell ? round(cell.getBoundingClientRect().height) : null,
    cellW: cell ? round(cell.getBoundingClientRect().width) : null,
    rowH: row ? round(row.getBoundingClientRect().height) : null,
    headH: head ? round(head.getBoundingClientRect().height) : null,
  };
})()`;

const browser = await playwright.chromium.launch({ args: ["--no-sandbox"] });
const targets = [
  ["desktop-1440x900", 1440, 900, null],
  ["iPhone14-390x664", 390, 664, playwright.devices["iPhone 14"]],
  ["iPhone14-landscape-844x390", 844, 390, playwright.devices["iPhone 14"]],
];

for (const [label, width, height, device] of targets) {
  console.log(`\n### ${label}`);
  const seen = new Map();
  for (const density of ["compact", "standard", "comfortable"]) {
    const context = await browser.newContext({ ...(device ?? {}) });
    await context.addInitScript(
      ({ d }) => {
        try {
          localStorage.setItem("groove_onboarding_completed", "true");
          localStorage.setItem(
            "groove_layout_prefs_v1",
            JSON.stringify({ version: 1, density: d })
          );
        } catch {
          /* disabled */
        }
      },
      { d: density }
    );
    const page = await context.newPage();
    await page.setViewportSize({ width, height });
    await page.goto(`http://127.0.0.1:${port}/?tab=studio`, { waitUntil: "domcontentloaded" });
    try {
      await page.waitForSelector("[data-testid='track-header-0']", { timeout: 30000 });
    } catch {
      console.log(`  ${density}: studio did not render`);
      await context.close();
      continue;
    }
    const out = await page.evaluate(PROBE);
    seen.set(density, out);
    console.log(
      `  ${density.padEnd(12)} attr=${out.attr}  --step-cell-h=${out.varH}  --track-row-pad-y=${out.varRowY}  cell=${out.cellW}x${out.cellH}  rowH=${out.rowH}  headH=${out.headH}`
    );
    await context.close();
  }

  const heights = [...seen.entries()].map(([d, o]) => [d, o.cellH]);
  const distinct = new Set(heights.map(([, h]) => h));
  const compact = seen.get("compact")?.cellH;
  const comfortable = seen.get("comfortable")?.cellH;
  console.log(
    `  -> ${distinct.size} distinct cell height(s): ${heights
      .map(([d, h]) => `${d}=${h}`)
      .join(", ")}`
  );
  if (compact !== null && comfortable !== null && compact !== undefined && comfortable !== undefined) {
    console.log(
      `  -> comfortable - compact = ${Math.round((comfortable - compact) * 10) / 10}px ${
        comfortable > compact ? "OK (the setting is real)" : "*** THE SETTING DOES NOTHING ***"
      }`
    );
  }
}

await browser.close();
server.close();
