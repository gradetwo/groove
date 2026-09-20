#!/usr/bin/env node
/**
 * Is the desktop/iPad transport still reachable once the studio page is scrolled?
 *
 *   node scripts/probe_transport_reach.mjs [--json]
 *
 * WHY THIS EXISTS
 * ---------------
 * `PRODUCT_PLAN_v2.1.0.md` G.8 item 8 says the PC/iPad transport scrolls away while the phone's is
 * fixed, and asks whether that is deliberate. The stated reason was a comment in
 * `MobileTransportBar.tsx`; there is no such comment, and no test either way — so the item had been
 * sitting on an unverified premise. This probe replaces the premise with numbers: it scrolls the
 * studio page to the bottom at two desktop-ish viewports and reports where the transport group ended
 * up, whether the point in its middle is *hit-testable* (not merely inside the document), and which
 * ancestor would prevent a `sticky` fix from working.
 *
 * A hit test rather than geometry, for the same reason as `probe_grid_gutter.mjs`: an element can be
 * inside the viewport and still not be the thing at that point.
 */
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const playwright = require("playwright");
const ROOT = process.cwd();
const asJson = process.argv.slice(2).includes("--json");

if (!fs.existsSync(path.join(ROOT, "dist", "index.html"))) {
  console.error("❌ No built app found — run `npm run build` first.");
  process.exit(1);
}

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
  const url = req.url.split("?")[0];
  const rel = url === "/" ? "/index.html" : url;
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
const origin = `http://127.0.0.1:${server.address().port}`;

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "ipad-landscape", width: 1194, height: 834 },
  { name: "short-desktop", width: 1280, height: 720 },
];

const browser = await playwright.chromium.launch({ args: ["--no-sandbox"] });
const results = [];

for (const viewport of VIEWPORTS) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(() => {
    try {
      localStorage.setItem("groove_onboarding_completed", "true");
    } catch {
      /* storage disabled */
    }
  });
  const page = await context.newPage();
  await page.goto(`${origin}/?tab=studio`, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForSelector("[data-testid='toolbar-group-transport']", { timeout: 30000 });
  } catch {
    results.push({ viewport: viewport.name, error: "the studio toolbar never rendered" });
    await context.close();
    continue;
  }
  await page.waitForTimeout(700);

  const measurement = await page.evaluate(async () => {
    /** Waits for two frames so a smooth scroll has painted before anything is measured. */
    const settle = () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(null)))
      );

    const group = document.querySelector("[data-testid='toolbar-group-transport']");
    const header = document.querySelector("header.sticky") ?? document.querySelector("header");
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        left: Math.round(r.left),
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
    };

    /** The probe's own coordinates: the middle of the transport group at rest. */
    const atRest = rect(group);
    const headerAtRest = rect(header);
    /** The sticky strip the transport is rendered in (G.47), and the header it parks under. */
    const strip = rect(group?.closest("div.sticky"));
    const pageAtRest = {
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
      scrollY: Math.round(window.scrollY),
    };

    const maxScroll = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    window.scrollTo({ top: maxScroll, behavior: "auto" });
    await settle();

    /**
     * Where the group is after the scroll, and what is actually at that point.
     *
     * `elementFromPoint` is asked about the group's *current* centre: if the group scrolled above the
     * viewport, the centre is negative and the answer is null, which is the honest result ("nothing
     * there"). If it is on screen, the answer must be the group or something inside it.
     */
    const afterScroll = rect(group);
    const centreY = afterScroll ? (afterScroll.top + afterScroll.bottom) / 2 : -1;
    const centreX = afterScroll ? afterScroll.left + Math.min(80, afterScroll.width / 2) : -1;
    const hit = centreY >= 0 && centreY <= window.innerHeight ? document.elementFromPoint(centreX, centreY) : null;
    const reachable = Boolean(
      hit && group && (hit === group || group.contains(hit) || hit.contains(group))
    );

    /**
     * The `sticky` survey: the first ancestor that could not host a sticky child, and whether an
     * ancestor is already sticky (the header is, so a sticky toolbar would need an offset).
     */
    const ancestry = [];
    let node = group;
    let blocker = null;
    while (node && node !== document.documentElement) {
      const style = getComputedStyle(node);
      const tag = node.tagName.toLowerCase();
      const id = node.getAttribute("data-testid") ?? node.className?.toString?.().slice(0, 40) ?? "";
      if (style.position === "sticky" || style.position === "fixed") {
        ancestry.push(`${tag}.${style.position}`);
      }
      if (!blocker && style.overflow !== "visible" && style.overflowY !== "visible") {
        // A scroll container between the transport and the page would make `sticky` stick to *it*.
        blocker = `${tag}[${id}] overflow: ${style.overflow}/${style.overflowY}`;
      }
      node = node.parentElement;
    }

    return {
      pageAtRest,
      maxScroll: Math.round(maxScroll),
      headerAtRest,
      atRest,
      strip,
      afterScroll,
      hit: hit ? `${hit.tagName.toLowerCase()}${hit.getAttribute("data-testid") ? `[${hit.getAttribute("data-testid")}]` : ""}` : null,
      reachable,
      ancestry,
      blocker,
    };
  });

  results.push({ viewport: `${viewport.width}×${viewport.height} (${viewport.name})`, ...measurement });
  await context.close();
}

await browser.close();
server.close();

if (asJson) {
  console.log(JSON.stringify(results, null, 2));
} else {
  console.log("=== desktop / iPad transport reachability ===");
  for (const r of results) {
    if (r.error) {
      console.log(`\n${r.viewport}: ❌ ${r.error}`);
      continue;
    }
    console.log(`\n${r.viewport}`);
    console.log(
      `  page: scrollHeight ${r.pageAtRest.scrollHeight} − clientHeight ${r.pageAtRest.clientHeight} = ${r.maxScroll} px of scroll`
    );
    console.log(`  header at rest: top ${r.headerAtRest?.top} height ${r.headerAtRest?.height}`);
    console.log(`  sticky strip: ${JSON.stringify(r.strip)}`);
    console.log(
      `  transport at rest: top ${r.atRest?.top} bottom ${r.atRest?.bottom} (h ${r.atRest?.height})`
    );
    console.log(
      `  transport scrolled to the bottom: top ${r.afterScroll?.top} bottom ${r.afterScroll?.bottom}`
    );
    console.log(`  at its centre: ${r.hit ?? "nothing (off-screen)"} → reachable: ${r.reachable ? "yes" : "no"}`);
    if (r.blocker) console.log(`  sticky would stick to: ${r.blocker}`);
    if (r.ancestry?.length) console.log(`  already positioned: ${r.ancestry.join(", ")}`);
  }
}

const anyUnreachable = results.some((r) => !r.error && r.maxScroll > 0 && !r.reachable);
process.exit(anyUnreachable ? 2 : 0);
