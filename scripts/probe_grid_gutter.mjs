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
localStorage.setItem("groove_audio_started", "1");
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
  await page.addStyleTag({ content: ".trk-head-solid { display: none !important; }" });
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
    headerLeft: Math.round(hr.left),
    headerRight: Math.round(hr.right),
    gapRight: Math.round(Math.min(...cells.map((c) => c.left))),
    /**
     * The solid layer must span the header's width plus the gutter, and nothing narrower.
     *
     * A cross-check on the layout arithmetic in the negative margin: one gap too small and every
     * grid in the app shifts; one gap too large and the first cells are covered.
     */
    coverWidth: Math.round(
      (document.querySelector(".trk-head-solid")?.getBoundingClientRect().width ?? 0)
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
/**
 * Is the whole frozen column solid?
 *
 * Every sample point inside `[columnLeft, gridLeft) x [rowTop, rowBottom]` must resolve to something
 * that is *part of the frozen column* — the header, the gutter cover, or a descendant of either.
 *
 * This is deliberately not "is a step cell visible here". The first version of this check asked that,
 * and it passed a build in which the header box was **73 px inside an 85 px row**: the 6 px strips
 * above and below the header were painted by nothing at all, so cells scrolling underneath were
 * visible there whenever they happened to be tall enough to reach — and at the default row height
 * they are 40 px inside that 73 px box, which is why the cell-based check never failed. "Solid" is
 * the invariant the user asked for and the one that can be checked directly.
 */
const sample = () =>
  page.evaluate(
    ({ columnLeft, gridLeft }) => {
      const rows = [...document.querySelectorAll("[data-testid^='track-header-']")];
      const samples = [];
      for (const row of rows) {
        const header = row.closest("div.sticky");
        const rowEl = header?.parentElement;
        if (!header || !rowEl) continue;
        const rr = rowEl.getBoundingClientRect();
        if (rr.bottom < 0 || rr.top > window.innerHeight) continue;
        for (let y = Math.round(rr.top) + 1; y < rr.bottom; y += 2) {
          if (y < 0 || y > window.innerHeight) continue;
          for (let x = Math.round(columnLeft) + 1; x < gridLeft; x += 3) {
            const el = document.elementFromPoint(x, y);
            if (!el) continue;
            /**
             * Three outcomes, and the distinction between the last two is the whole point.
             *
             * `column`  — the header, its solid layer, or something inside them.
             * `row`     — the row's own background. Opaque (it carries `bg-panel`) and therefore
             *             still "solid"; this is the 6 px of row padding that no child can paint.
             * `stepCell`— a grid cell showing through. This is the reported defect.
             *
             * A transparent ancestor (`section`, the scroller) is a failure too: something would be
             * showing through, which is what "the space should feel solid" rules out.
             */
            const isCell = el.hasAttribute("data-step-idx");
            const inColumn =
              el === header ||
              header.contains(el) ||
              el.classList.contains("trk-head-solid");
            const isRowBackground = el === rowEl;
            samples.push({
              x,
              y,
              kind: inColumn ? "column" : isCell ? "stepCell" : isRowBackground ? "row" : "transparent",
              topmost: el.className.toString().slice(0, 40) || el.tagName.toLowerCase(),
            });
          }
        }
      }
      let scroller = document.querySelector("[data-step-idx]");
      while (scroller && scroller.scrollWidth <= scroller.clientWidth + 1) scroller = scroller.parentElement;
      return { scrollLeft: scroller ? Math.round(scroller.scrollLeft) : null, samples };
    },
    { columnLeft: gutterAtRest.headerLeft, gridLeft: gutterAtRest.gapRight }
  );

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

/** A cell showing through, or anything transparent, is a failure. Opaque row padding is not. */
const countBad = (p) => p.samples.filter((s) => s.kind === "stepCell" || s.kind === "transparent").length;
const worst = phases.reduce((n, p) => Math.max(n, countBad(p)), 0);

if (asJson) {
  console.log(JSON.stringify({ noCover, phases, nonColumnSamples: worst }, null, 2));
} else {
  console.log(`\n=== step grid gutter, 1440x900${noCover ? " (cover disabled)" : ""} ===\n`);
  const columnWidth = gutterAtRest.gapRight - gutterAtRest.headerLeft;
  console.log(
    `   frozen column [${gutterAtRest.headerLeft}, ${gutterAtRest.gapRight}) = ${columnWidth} px; ` +
      `solid layer is ${gutterAtRest.coverWidth} px`
  );
  if (gutterAtRest.coverWidth !== columnWidth) {
    console.log(
      `   ⚠️  the solid layer does not match the column: ${gutterAtRest.coverWidth} vs ${columnWidth} px`
    );
  }
  for (const p of phases) {
    const bad = p.samples.filter((s) => s.kind === "stepCell" || s.kind === "transparent");
    const cells = bad.filter((s) => s.kind === "stepCell").length;
    const inColumn = p.samples.filter((s) => s.kind === "column").length;
    const rowBg = p.samples.filter((s) => s.kind === "row").length;
    console.log(
      `   ${p.label.padEnd(12)} scrollLeft ${String(p.scrollLeft).padStart(5)}   ` +
        `${bad.length === 0 ? "solid" : `${bad.length}/${p.samples.length} SHOW THROUGH (${cells} a step cell)`}` +
        `   [column ${inColumn}, row padding ${rowBg}]` +
        (bad.length ? `   e.g. ${bad[0].topmost} at ${bad[0].x},${bad[0].y}` : "")
    );
  }
  console.log();
}

if (noCover) {
  if (worst === 0) {
    console.error(
      "❌ With the solid layer disabled the frozen column still reported as solid, so this check cannot\n" +
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
    `❌ ${worst} sample(s) inside the frozen column show something through it.\n` +
      "   The column must read as solid: no step cell may be visible in it, and nothing transparent\n" +
      "   may be behind it. `.trk-head-solid` fills the gutter and the header's own column; the row\n" +
      "   carries an opaque background for the padding strips no child can reach.\n" +
      "   See PRODUCT_PLAN_v2.1.0.md G.15.\n"
  );
  process.exit(1);
}
process.exit(0);
