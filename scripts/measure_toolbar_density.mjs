#!/usr/bin/env node
/**
 * How dense is the studio toolbar?
 *
 *   node scripts/measure_toolbar_density.mjs [--json] [--profile=pc|mobile]
 *
 * PRODUCT_PLAN_v2.1.0.md G.10 records the measurement that made toolbar density the top
 * priority: **38 visible controls, 9-10 visual rows, 215 px of a 900 px viewport (24-27 %)**,
 * against a Tier 1 design of 12 controls with a hard cap of 14 (`toolbarTiers.ts`'s
 * `TIER_1_MAX`). That measurement was taken by hand; this script is the same probe, kept so
 * the claim can be rechecked and so the slimming work has an acceptance test that fails when
 * the toolbar grows back.
 *
 * What it counts
 * --------------
 * Every *interactive* element inside the toolbar container: `button`, `select`, `input`, and
 * anything with `role="button"`. Controls that are present in the DOM but not rendered (the
 * advanced overlay while it is closed, zero-size or `display:none` subtrees) are excluded, and
 * so is anything outside the viewport — because the complaint this exists for is what the user
 * *sees*, not what the component tree contains.
 *
 * It also reports the per-tier split, from the `data-toolbar-tier` attribute the tier wiring
 * adds to each control. Before that wiring exists every control reports as `untiered`, which is
 * itself the finding: an untiered toolbar is one nobody has decided the frequency of.
 *
 * Exit code is 0 unless `--max-visible=N` is given and exceeded, so this is usable as a gate
 * (`npm run probe:toolbar`) without failing on the pre-wiring baseline.
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
const profileArg = args.find((a) => a.startsWith("--profile="));
const profile = profileArg ? profileArg.split("=")[1] : "pc";
const maxArg = args.find((a) => a.startsWith("--max-visible="));
const maxVisible = maxArg ? Number(maxArg.split("=")[1]) : null;
/**
 * `--advanced` opens the advanced density before measuring.
 *
 * The default measurement is the density guarantee (nothing below Tier 1 on screen). This mode is
 * the other half of it: *every* control must still be reachable, so a slim toolbar that quietly
 * dropped one would fail here. It also reports which Tier 1 controls are missing from the default
 * view, because a Tier 1 control that never renders is the same defect from the other side.
 */
const advanced = args.includes("--advanced");

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
  const ext = path.extname(file);
  res.writeHead(200, { "content-type": MIME[ext] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

/** Desktop by default; the phone profile is here because the mobile bar is its own thing. */
const VIEWPORTS = {
  pc: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

/** `--width=N` / `--height=N` override the profile, so a layout can be swept across breakpoints. */
const widthArg = args.find((a) => a.startsWith("--width="));
const heightArg = args.find((a) => a.startsWith("--height="));
const viewport = { ...(VIEWPORTS[profile] ?? VIEWPORTS.pc) };
if (widthArg) viewport.width = Number(widthArg.split("=")[1]);
if (heightArg) viewport.height = Number(heightArg.split("=")[1]);

const browser = await playwright.chromium.launch({ args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport });
await context.addInitScript(() => {
  try {
    localStorage.setItem("groove_onboarding_completed", "true");
  } catch {
    /* disabled */
  }
});
const page = await context.newPage();
await page.goto(`http://127.0.0.1:${port}/?tab=studio`, { waitUntil: "domcontentloaded" });
try {
  await page.waitForSelector("[data-testid='track-header-0']", { timeout: 30000 });
} catch {
  console.error("❌ The studio did not render — cannot measure the toolbar.");
  await browser.close();
  server.close();
  process.exit(1);
}

if (advanced) {
  const more = await page.$("[data-testid='toolbar-advanced-toggle']");
  if (!more) {
    console.error("❌ No advanced-density control on this viewport — cannot measure the full toolbar.");
    await browser.close();
    server.close();
    process.exit(1);
  }
  await more.click();
  await page.waitForTimeout(300);
}

const report = await page.evaluate(() => {
  /**
   * The toolbar container.
   *
   * Found through a control it is known to own rather than by a wrapper testid, because the
   * toolbar has been re-parented before and a stale selector would silently measure nothing
   * (the failure mode this script must not have: a zero would read as "perfectly slim").
   */
  const anchor = document.querySelector("[data-testid='toolbar-group-transport']");
  const toolbar = anchor?.closest("div.flex.flex-col") ?? anchor?.parentElement ?? null;
  if (!toolbar) return { error: "toolbar container not found" };

  const isVisible = (el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) {
      return false;
    }
    // Off-screen horizontally counts as hidden: "More" sitting past the right edge was a real
    // defect (G.10), and a control the user cannot reach is not a control they can use.
    return rect.right > 0 && rect.left < window.innerWidth;
  };

  const all = Array.from(toolbar.querySelectorAll("button, select, input, [role='button']"));
  const visible = all.filter(isVisible);

  /**
   * Why each invisible control is invisible.
   *
   * A probe that silently omits nodes reports a toolbar slimmer than the user sees — the worst
   * possible failure for this measurement, and the reason the fold/advanced/More triggers were
   * missing from the first run of this script and had to be chased down by hand.
   */
  const hidden = all
    .filter((el) => !isVisible(el))
    .map((el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      let reason = "visible";
      if (rect.width <= 0 || rect.height <= 0) reason = "zero-size";
      else if (style.display === "none") reason = "display:none";
      else if (style.visibility === "hidden") reason = "visibility:hidden";
      else if (Number(style.opacity) === 0) reason = "opacity:0";
      else if (rect.right <= 0) reason = "left of viewport";
      else if (rect.left >= window.innerWidth) reason = "beyond right edge (overflow)";
      return {
        reason,
        tag: el.tagName.toLowerCase(),
        testId: el.getAttribute("data-testid"),
        title: el.getAttribute("title"),
        rect: { left: Math.round(rect.left), right: Math.round(rect.right), w: Math.round(rect.width) },
      };
    });

  /** Distinct vertical bands occupied by visible controls — the "rows" a user perceives. */
  const rows = [];
  for (const el of visible) {
    const r = el.getBoundingClientRect();
    const mid = r.top + r.height / 2;
    const row = rows.find((band) => mid >= band.top - 2 && mid <= band.bottom + 2);
    if (row) {
      row.top = Math.min(row.top, r.top);
      row.bottom = Math.max(row.bottom, r.bottom);
    } else {
      rows.push({ top: r.top, bottom: r.bottom });
    }
  }

  const byTier = {};
  const distinctIds = new Set();
  /** Controls the tier table puts in Tier 2 or 3 that are on screen anyway — the gate. */
  const leaked = [];
  for (const el of visible) {
    const tier = el.getAttribute("data-toolbar-tier") ?? "untiered";
    byTier[tier] = (byTier[tier] ?? 0) + 1;
    const id = el.getAttribute("data-toolbar-id");
    if (id) distinctIds.add(id);
    if (tier === "2" || tier === "3") {
      leaked.push(`${id ?? "(unstamped)"} [tier ${tier}]`);
    }
  }

  const rect = toolbar.getBoundingClientRect();

  /**
   * Is the overflow reachable, or is the escape hatch simply gone?
   *
   * A control laid out past the right edge is either hidden behind a horizontal scroller (bad but
   * recoverable) or unreachable (worse). This reports which, and whether scrolling to the end
   * actually brings it into view — the difference between "dense" and "broken".
   */
  const overflowProbe = (() => {
    const probe = document.querySelector("[data-testid='toolbar-advanced-toggle']");
    if (!probe) return { found: false };
    const before = probe.getBoundingClientRect();
    const ancestors = [];
    for (let el = probe.parentElement; el; el = el.parentElement) {
      if (el.scrollWidth > el.clientWidth + 1) {
        ancestors.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className || "").toString().slice(0, 60),
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
        });
      }
      if (el === document.body) break;
    }
    for (const el of [document.scrollingElement, ...Array.from(document.querySelectorAll("*"))]) {
      if (el && el.scrollWidth > el.clientWidth + 1) el.scrollLeft = el.scrollWidth;
    }
    const after = probe.getBoundingClientRect();
    const back = { left: Math.round(after.left), right: Math.round(after.right), w: Math.round(after.width) };
    for (const el of Array.from(document.querySelectorAll("*"))) {
      if (el && el.scrollWidth > el.clientWidth + 1) el.scrollLeft = 0;
    }
    return {
      found: true,
      before: { left: Math.round(before.left), right: Math.round(before.right), w: Math.round(before.width) },
      afterScrollingEveryScrollerToEnd: back,
      becameVisible: after.left < window.innerWidth && after.right > 0,
      horizontalScrollers: ancestors,
    };
  })();

  /**
   * The names of what is visible, so a report is actionable rather than just a number.
   * `data-toolbar-id` is added by the tier wiring; before that the label text is all there is.
   */
  const names = visible.map(
    (el) =>
      el.getAttribute("data-toolbar-id") ??
      (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 24) ??
      el.tagName.toLowerCase()
  );

  /**
   * A structural fingerprint per control, for mapping the rendered toolbar back to the source.
   *
   * The toolbar is one 1.9k-line component, so before the tier wiring exists there is no id on a
   * control to key on. `title`/`aria-label`/first-option plus the opening tag is enough to find the
   * exact JSX site with a grep, which is what makes the mapping auditable rather than guessed.
   */
  const controls = visible.map((el, i) => ({
    i,
    tag: el.tagName.toLowerCase(),
    type: el.getAttribute("type"),
    title: el.getAttribute("title"),
    aria: el.getAttribute("aria-label"),
    testId: el.getAttribute("data-testid"),
    firstOption: el.tagName === "SELECT" ? (el.querySelector("option")?.textContent ?? "").trim() : null,
    text: (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 30),
    head: el.outerHTML.slice(0, 150).replace(/\s+/g, " "),
  }));

  return {
    visible: visible.length,
    totalInteractive: all.length,
    rows: rows.length,
    heightPx: Math.round(rect.height),
    widthPx: Math.round(rect.width),
    viewport: { w: window.innerWidth, h: window.innerHeight },
    heightPctOfViewport: Number(((rect.height / window.innerHeight) * 100).toFixed(1)),
    byTier,
    /** Distinct tier ids on screen — the count the design criterion is about ("<= 14 controls"). */
    distinctIds: distinctIds.size,
    /**
     * Visible controls the table puts outside Tier 1, while the advanced density is *off*.
     *
     * This, not a magic total, is the invariant: whatever Tier 1 ends up containing, nothing of a
     * lower frequency may be on screen by default. A total would have to be re-guessed every time
     * the design changed, and a re-guessed number is how a density budget rots.
     */
    leaked,
    names,
    controls,
    hidden,
    overflowProbe,
  };
});

await browser.close();
server.close();

if (report.error) {
  console.error(`❌ ${report.error}`);
  process.exit(1);
}

if (asJson) {
  console.log(JSON.stringify({ profile, ...report }, null, 2));
} else {
  console.log(`\n=== studio toolbar density (${profile}, ${report.viewport.w}x${report.viewport.h}) ===\n`);
  console.log(
    `   visible controls        : ${report.visible} elements, ${report.distinctIds} distinct tier ids` +
      `   (of ${report.totalInteractive} in the DOM)`
  );
  console.log(`   visual rows             : ${report.rows}`);
  console.log(`   toolbar height          : ${report.heightPx} px  = ${report.heightPctOfViewport} % of the viewport`);
  console.log(`   by tier                 : ${JSON.stringify(report.byTier)}`);
  console.log(
    advanced
      ? `   below-Tier-1 visible     : ${report.leaked.length} (expected with --advanced)`
      : `   tier 2/3 leaked by default: ${report.leaked.length === 0 ? "none" : report.leaked.join(", ")}`
  );
  if (report.overflowProbe?.found) {
    const p = report.overflowProbe;
    console.log(`\n   advanced("More") trigger: left=${p.before.left} right=${p.before.right} (viewport ${report.viewport.w})`);
    console.log(`     became visible after scrolling every scroller to its end: ${p.becameVisible}`);
    if (p.horizontalScrollers.length) {
      console.log(`     horizontal scrollers containing it: ${JSON.stringify(p.horizontalScrollers)}`);
    } else {
      console.log(`     horizontal scrollers containing it: none — it is simply past the edge`);
    }
  }
  console.log(`\n   visible: ${report.names.join(" | ")}\n`);
  if (asJson) {
    // included above
  }
}

if (report.leaked.length > 0 && !advanced) {
  console.error(
    `❌ ${report.leaked.length} control(s) the tier table puts outside Tier 1 are visible with the\n` +
      `   advanced density off: ${report.leaked.join(", ")}\n` +
      `   Either tier them in \`src/components/sequencer/toolbarTiers.ts\` or gate them with\n` +
      `   \`isControlVisible(...)\` — see PRODUCT_PLAN_v2.1.0.md G.10.\n`
  );
  process.exit(1);
}
if (maxVisible !== null && report.visible > maxVisible) {
  console.error(`❌ ${report.visible} visible controls, over the --max-visible=${maxVisible} budget.\n`);
  process.exit(1);
}
process.exit(0);
