#!/usr/bin/env node
/**
 * The gutter between the frozen track header and the scrolling step grid must stay empty.
 *
 *   node scripts/probe_grid_gutter.mjs [--no-cover] [--json]
 *
 * Reported by eye: "while it keeps playing, step cells appear in the space below the track header —
 * the distance between the header and the grid that you see on first entry is the standard, it must
 * not intrude into that space."
 *
 * The layout makes that easy to get wrong. Each track row is a flex row with
 * `gap: var(--trk-head-gap)` whose first child is a `sticky left-0` header, so the gap sits *outside*
 * the header's box and nothing is painted over it. At rest the first step cell starts after the gap
 * (measured 593 -> 609 px at 1440x900, a 16 px gutter). Once playback auto-scrolls the grid the cells
 * slide left *through* that gutter, so the header appears to touch the grid. Measured before the fix:
 * **0 cells in the gutter at rest, 8 during playback** — one per track.
 *
 * Two things make this check honest rather than decorative:
 *
 *   - it is a **hit test**, not geometry. Cells scroll under the frozen header either way; the
 *     question is whether any of them is *painted* in the gutter, and `elementFromPoint` answers
 *     exactly that. A geometric test reports 8 cells whether or not they are visible (the first
 *     version of this probe did, and passed a broken build).
 *   - `--no-cover` disables the cover with an injected stylesheet and asserts the check *fails*.
 *     A guard that cannot fail is not evidence, and this project has shipped one before.
 */
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const playwright = require("playwright");
const ROOT = process.cwd();

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const noCover = args.includes("--no-cover");

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

const browser = await playwright.chromium.launch({ args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => {
  try {
    localStorage.setItem("groove_onboarding_completed", "true");
  } catch {
    /* disabled */
  }
});
const page = await context.newPage();
await page.goto(`http://127.0.0.1:${server.address().port}/?tab=studio`, {
  waitUntil: "domcontentloaded",
});
try {
  await page.waitForSelector("[data-testid='track-header-0']", { timeout: 30000 });
} catch {
  console.error("❌ The studio did not render — cannot measure the grid gutter.");
  await browser.close();
  server.close();
  process.exit(1);
}
await page.waitForTimeout(800);

if (noCover) {
  await page.addStyleTag({ content: ".trk-head-gap-cover { display: none !important; }" });
}

/**
 * The gutter, in viewport coordinates, captured **at rest**.
 *
 * The report's own words are the right definition: "the distance between the track header and the
 * step grid as it is on first entry is the standard". So the standard is measured before anything
 * scrolls — `[headerRight, gridFirstColumnAtRest)` — and every later sample is taken against those
 * fixed coordinates. Deriving it from where the cells happen to be *during* playback captures a
 * scrolled position and turns the whole check into a tautology, which is what the throwaway version
 * of this probe did before it was replaced.
 */
const gutterAtRest = await page.evaluate(() => {
  const inner = document.querySelector("[data-testid='track-header-0']");
  const header = inner && inner.closest("div.sticky");
  if (!header) return { error: "no sticky track header" };
  let scroller = document.querySelector("[data-step-idx]");
  while (scroller && scroller.scrollWidth <= scroller.clientWidth + 1) scroller = scroller.parentElement;
  if (scroller && Math.round(scroller.scrollLeft) !== 0) {
    return { error: `the grid is already scrolled (scrollLeft ${Math.round(scroller.scrollLeft)})` };
  }
  const hr = header.getBoundingClientRect();
  const cells = [...document.querySelectorAll("[data-step-idx]")].map((c) => c.getBoundingClientRect());
  return {
    headerRight: Math.round(hr.right),
    gapRight: Math.round(Math.min(...cells.map((c) => c.left))),
    // The cover's own width is the stylesheet's resolved gap, a cross-check on the layout figure
    // above: if these two disagree the cover is not filling the gutter it exists for.
    coverWidth: Math.round(
      (document.querySelector(".trk-head-gap-cover")?.getBoundingClientRect().width ?? 0)
    ),
  };
});
if (gutterAtRest.error) {
  console.error(`❌ ${gutterAtRest.error}`);
  await browser.close();
  server.close();
  process.exit(1);
}

/** Hit-test the gutter of every track row that is on screen, and report what is on top. */
const sample = () =>
  page.evaluate(({ gutterLeft, gutterRight }) => {
    const rows = [...document.querySelectorAll("[data-testid^='track-header-']")];
    const samples = [];
    for (const row of rows) {
      const sticky = row.closest("div.sticky");
      if (!sticky) continue;
      const r = sticky.getBoundingClientRect();
      for (const yFrac of [0.3, 0.5, 0.7]) {
        const y = r.top + r.height * yFrac;
        // Rows below the fold cannot be hit-tested, and pretending they were would inflate the
        // sample count with `none` results.
        if (y < 0 || y > window.innerHeight) continue;
        for (const xFrac of [0.25, 0.5, 0.75]) {
          const x = gutterLeft + (gutterRight - gutterLeft) * xFrac;
          const el = document.elementFromPoint(x, y);
          if (!el) continue;
          samples.push({
            x: Math.round(x),
            y: Math.round(y),
            isStepCell: el.hasAttribute("data-step-idx"),
            topmost: el.className.toString().slice(0, 32) || el.tagName.toLowerCase(),
          });
        }
      }
    }
    let scroller = document.querySelector("[data-step-idx]");
    while (scroller && scroller.scrollWidth <= scroller.clientWidth + 1) scroller = scroller.parentElement;
    return { scrollLeft: scroller ? Math.round(scroller.scrollLeft) : null, samples };
  }, { gutterLeft: gutterAtRest.headerRight, gutterRight: gutterAtRest.gapRight });

const phases = [{ label: "at rest", ...(await sample()) }];

await page.click("[data-toolbar-id='play']");
for (const ms of [4000, 5000]) {
  await page.waitForTimeout(ms);
  phases.push({ label: "playing", ...(await sample()) });
}
await page.evaluate(() => {
  const b = document.querySelector("[data-toolbar-id='play']");
  if (b) b.click();
});

await browser.close();
server.close();

const worst = phases.reduce((n, p) => Math.max(n, p.samples.filter((s) => s.isStepCell).length), 0);

if (asJson) {
  console.log(JSON.stringify({ noCover, phases, stepCellsInGutter: worst }, null, 2));
} else {
  console.log(`\n=== step grid gutter, 1440x900${noCover ? " (cover disabled)" : ""} ===\n`);
  const gutterWidth = gutterAtRest.gapRight - gutterAtRest.headerRight;
  console.log(
    `   gutter [${gutterAtRest.headerRight}, ${gutterAtRest.gapRight}) = ${gutterWidth} px; ` +
      `cover is ${gutterAtRest.coverWidth} px`
  );
  if (gutterAtRest.coverWidth !== gutterWidth) {
    console.log(
      `   ⚠️  the cover does not match the gutter: ${gutterAtRest.coverWidth} vs ${gutterWidth} px`
    );
  }
  for (const p of phases) {
    const bad = p.samples.filter((s) => s.isStepCell);
    console.log(
      `   ${p.label.padEnd(12)} scrollLeft ${String(p.scrollLeft).padStart(5)}   ` +
        `${bad.length === 0 ? "gutter empty" : `${bad.length}/${p.samples.length} SAMPLES HIT A STEP CELL`}` +
        `   (topmost: ${[...new Set(p.samples.map((s) => s.topmost))].join(", ")})`
    );
  }
  console.log();
}

if (noCover) {
  if (worst === 0) {
    console.error(
      "❌ With the cover disabled the gutter still reported no step cells, so this check cannot\n" +
        "   detect the defect it exists for. Something else is occluding them, or the sampling is\n" +
        "   wrong — either way the passing runs above prove nothing.\n"
    );
    process.exit(1);
  }
  console.log(`✅ Without the cover the gutter does show step cells (${worst} samples), so the check bites.\n`);
  process.exit(0);
}

if (worst > 0) {
  console.error(
    `❌ ${worst} sample(s) in the header-to-grid gutter resolve to a step cell.\n` +
      "   Step cells are being painted in the frozen header's space during playback; see\n" +
      "   `.trk-head-gap-cover` in src/index.css and PRODUCT_PLAN_v2.1.0.md G.15.\n"
  );
  process.exit(1);
}
process.exit(0);
