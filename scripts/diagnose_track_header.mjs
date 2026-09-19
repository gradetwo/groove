/**
 * Diagnostic: per-element geometry of the track header column.
 *
 *   node scripts/diagnose_track_header.mjs [target]
 *
 * "轨道头区域也有点乱" is a geometry claim, so this prints the real boxes and the
 * real overflow chain instead of guessing which of the ~15 controls does not fit.
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

const PROBE = `((rowIdx) => {
  const round = (n) => Math.round(n * 10) / 10;
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height), right: round(r.right) };
  };
  const label = (el) => {
    const id = el.getAttribute && el.getAttribute("data-testid");
    return el.tagName.toLowerCase() + (id ? "[" + id + "]" : "");
  };
  const row = document.querySelector(".track-row-" + rowIdx);
  if (!row) return { error: "no row " + rowIdx };
  const head = row.querySelector(":scope > div");
  const hb = head.getBoundingClientRect();
  const cs = getComputedStyle(head);
  const out = {
    rowBox: box(row),
    headBox: box(head),
    headStyle: {
      overflow: cs.overflow,
      overflowX: cs.overflowX,
      width: cs.width,
      flex: cs.flex,
      minWidth: cs.minWidth,
      boxSizing: cs.boxSizing,
    },
    headScroll: { scrollW: head.scrollWidth, clientW: head.clientWidth },
    ruler: null,
    children: [],
  };
  const ruler = document.querySelector(".custom-sequencer-scroll [class*='sticky'][class*='z-30']");
  if (ruler) out.ruler = { box: box(ruler), z: getComputedStyle(ruler).zIndex, w: getComputedStyle(ruler).width };

  const walk = (el, depth) => {
    if (depth > 3) return;
    for (const child of el.children) {
      const ccs = getComputedStyle(child);
      out.children.push({
        d: depth,
        tag: label(child),
        box: box(child),
        right: round(child.getBoundingClientRect().right - hb.left),
        overflowsHead: Math.round(child.getBoundingClientRect().right) > Math.round(hb.right),
        w: ccs.width,
        flex: ccs.flex,
        minW: ccs.minWidth,
        overflow: ccs.overflowX,
        display: ccs.display,
        text: (child.textContent || "").trim().slice(0, 14),
      });
      if (depth < 3) walk(child, depth + 1);
    }
  };
  walk(head, 0);
  return out;
})`;

const TARGETS = {
  desktop: ["desktop-1440", 1440, 900, null, null],
  portrait: ["iPhone14-portrait", 390, 664, playwright.devices["iPhone 14"], null],
  landscape: ["iPhone14-landscape", 844, 390, playwright.devices["iPhone 14"], null],
};

const wanted = process.argv[2] ? [TARGETS[process.argv[2]]] : Object.values(TARGETS);
const ROW = Number(process.argv[3] ?? 2);

const browser = await playwright.chromium.launch({ args: ["--no-sandbox"] });

for (const [label, width, height, device] of wanted) {
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
  const out = await page.evaluate(`${PROBE}(${ROW})`);
  console.log(`\n### ${label} row ${ROW}`);
  console.log("head:", JSON.stringify(out.headBox), JSON.stringify(out.headStyle), JSON.stringify(out.headScroll));
  console.log("ruler:", JSON.stringify(out.ruler));
  for (const c of out.children ?? []) {
    const pad = "  ".repeat(c.d);
    const flag = c.overflowsHead ? "  <== OVERFLOWS HEAD" : "";
    console.log(
      `${pad}${c.tag.padEnd(22)} x=${String(c.box.x).padStart(6)} w=${String(c.box.w).padStart(6)} right=${String(c.right).padStart(6)} flex=${c.flex} minW=${c.minW} ovf=${c.overflow} "${c.text}"${flag}`,
    );
  }
  await context.close();
}

await browser.close();
server.close();
