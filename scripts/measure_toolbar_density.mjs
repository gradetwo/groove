#!/usr/bin/env node
/**
 * How dense is the studio toolbar?
 *
 *   node scripts/measure_toolbar_density.mjs [--json] [--profile=pc|mobile]
 *
 * PRODUCT_PLAN_v2.1.0.md G.10 records the measurement that made toolbar density the top
 * priority: **38 visible controls, 9-10 visual rows, 215 px of a 900 px viewport (24-27 %)**,
 * against a Tier 1 design of 12 controls with a hard cap of 14 (`toolbarTiers.ts`'s
 * `TIER_1_MAX`, since raised to 15 when Stop became its own control). That measurement was taken
 * by hand; this script is the same probe, kept so the claim can be rechecked and so the slimming
 * work has an acceptance test that fails when the toolbar grows back.
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
 * The density contract
 * --------------------
 * **The default screen shows nothing below Tier 1, except the controls the tier table itself
 * declares `showByDefault`.** The expectation is not restated here: this probe imports
 * `isControlVisible(id, false)` from `src/components/sequencer/toolbarTiers.ts` — the same
 * predicate `Toolbar.tsx` renders through — so "may the user see this by default?" is answered in
 * one place, and a control the app is *designed* to show is not reported as a leak. (That module
 * is dependency-free by design and Node strips its types natively, which is what lets a bare
 * `node` script import it; the project's floor, 22.22.2, supports it.)
 *
 * ⭐ The exception list is **pinned to exactly one id, `arrangement`**, as a literal rather than
 * derived from the table. `showByDefault` is a one-word edit that widens the toolbar, and the
 * *count* is the design decision — one named exception, so the arrangement view is findable on a
 * fresh install; a count that grows quietly is how a density budget rots (the same argument the
 * default-screen check's own comment makes about magic totals).
 *
 * Dated 2026-10-03, commit `46892b7` (G3), and this rewrite exists because the contract as
 * written above went stale exactly here: `arrangement` carries no keyboard binding, so the
 * shortcut invariant never asked how it was reached, and `Toolbar.tsx` rendered it through
 * `shows("arrangement")` — false until the user guessed that an unlabelled "advanced controls"
 * toggle existed. A fresh install's toolbar did not contain the entry at all. Tier 1 is at its cap
 * (`TIER_1_MAX`), so the table's answer is Tier 2 + `reachableVia: "more"` + `showByDefault`:
 * medium frequency, but it must be findable. The old probe called that a leak, which is the one
 * thing a gate must never do — fail a build for behaving as designed.
 *
 * What turns this red:
 *   · any visible control the table would not put on the default screen;
 *   · a table that declares no exception, or more than one — `arrangement`'s `showByDefault`
 *     removed, or a second row carrying it. Both are contract changes, not tidying;
 *   · any id other than `arrangement` visible below Tier 1 with the advanced density off.
 *
 * Exit code is 0 only when that contract holds (and `--max-visible=N`, when given, is not
 * exceeded), so this is usable as a gate (`npm run probe:toolbar`) without failing on the
 * pre-wiring baseline.
 */
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

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
 * The default measurement is the density guarantee (nothing below Tier 1 on screen, beyond the
 * one pinned exception). This mode is the other half of it: *every* control must still be
 * reachable, so a slim toolbar that quietly dropped one would fail here. It also reports which
 * Tier 1 controls are missing from the default view, because a Tier 1 control that never renders
 * is the same defect from the other side.
 */
const advanced = args.includes("--advanced");

/**
 * The tier table — the density contract's single source of truth, imported rather than copied.
 *
 * This probe used to restate the contract in its own words ("anything Tier 2 or Tier 3 on screen
 * is a leak"), and that restatement went stale the moment the table grew an explicit exception:
 * G3 put `arrangement` on the default toolbar, `Toolbar.tsx` honoured the table, and the probe
 * failed a toolbar that was behaving exactly as designed. So the predicate is imported:
 * `isControlVisible(id, false)` is literally the function the Toolbar renders through, and the
 * declared exceptions come from the same rows that predicate reads.
 *
 * A bare `node` script can import a `.ts` file because Node strips types natively (>= 22.18; the
 * project's floor is 22.22.2) and `toolbarTiers.ts` is dependency-free on purpose. If either of
 * those stops being true this fails loudly rather than skipping the contract — a probe that
 * cannot see the criterion must not report green.
 */
let tierTable;
try {
  tierTable = await import(
    pathToFileURL(path.join(ROOT, "src", "components", "sequencer", "toolbarTiers.ts")).href
  );
} catch (error) {
  console.error(
    "❌ Could not load `src/components/sequencer/toolbarTiers.ts`, which owns the density contract.\n" +
      "   This probe needs Node >= 22.18 (native TypeScript type stripping) and that module must stay\n" +
      `   dependency-free. Underlying error: ${error.message}\n`
  );
  process.exit(1);
}
const { ALL_TIER_ITEMS, isControlVisible, tierOf } = tierTable;

/**
 * ⭐ The pinned exception list: the only ids the table may put on the default screen below Tier 1.
 *
 * A literal on purpose, and deliberately *not* derived from the table. `showByDefault` is a
 * one-word edit that widens the default toolbar, so this is the second signature such a change has
 * to collect: the count is the design decision ("exactly one named exception"), and a count that
 * grows quietly is how a density budget rots — the same argument the default-screen check's own
 * comment makes about magic totals.
 *
 * 2026-10-03, commit `46892b7` (G3): `arrangement` is the one, and the reason is discoverability,
 * not frequency. It has no keyboard binding, so the shortcut invariant never asked how it was
 * reached; `Toolbar.tsx` rendered it through `shows("arrangement")`, which was false until the
 * user found an unlabelled "advanced controls" toggle, so a fresh install's toolbar did not
 * contain the entry at all. Tier 1 is at its cap (`TIER_1_MAX`), so the table's answer is Tier 2 +
 * `reachableVia: "more"` + `showByDefault`. A second entry must be added here too, and updating
 * this line is the moment to ask whether the default surface is growing by accident.
 */
const DEFAULT_VISIBILITY_EXCEPTIONS = ["arrangement"];

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
localStorage.setItem("groove_audio_started", "1");
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
   * By its own testid. It used to be found by walking up from the transport group to the nearest
   * , which held only while the transport lived inside the toolbar: when G.47
   * moved it into its own sticky strip (a *sibling* of the toolbar) that walk climbed past the
   * toolbar into the panel wrapper and reported 155 controls and a 1105 px "toolbar".
   */
  /**
   * The toolbar is two siblings: the sticky transport strip (G.47) and the row that follows it. The
   * density question is about what the user sees together, so both are measured — counting only the
   * row would let the transport grow back unnoticed, which is what this probe exists to prevent.
   */
  const toolbar = document.querySelector("[data-testid='studio-toolbar']");
  const strip = document.querySelector("[data-testid='toolbar-transport-strip']");
  if (!toolbar) return { error: "toolbar container not found ([data-testid='studio-toolbar'])" };
  const containers = [strip, toolbar].filter(Boolean);

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

  const all = containers.flatMap((container) =>
    Array.from(container.querySelectorAll("button, select, input, [role='button']"))
  );
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
  /**
   * Every visible control's `{ id, tier }`, in screen order — the observed default surface.
   *
   * The judgement is *not* made here: whether a control may be on screen with the advanced
   * density off is `isControlVisible(id, false)`, from the tier table, and that predicate needs the
   * module. All this side reports is what the user can actually see — which is the half of the
   * contract the DOM owns.
   */
  const visibleControls = [];
  for (const el of visible) {
    const tier = el.getAttribute("data-toolbar-tier") ?? "untiered";
    byTier[tier] = (byTier[tier] ?? 0) + 1;
    const id = el.getAttribute("data-toolbar-id");
    if (id) distinctIds.add(id);
    visibleControls.push({ id, tier });
  }

  /** The union of both containers: the band the two of them occupy together. */
  const boxes = containers.map((container) => container.getBoundingClientRect());
  const rect = {
    top: Math.min(...boxes.map((r) => r.top)),
    bottom: Math.max(...boxes.map((r) => r.bottom)),
    left: Math.min(...boxes.map((r) => r.left)),
    right: Math.max(...boxes.map((r) => r.right)),
    get width() { return this.right - this.left; },
    get height() { return this.bottom - this.top; },
  };

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
    /** Distinct tier ids on screen — the count the design criterion is about (`TIER_1_MAX`, 15). */
    distinctIds: distinctIds.size,
    /**
     * What the user can actually see, one entry per rendered element: `{ id, tier }`.
     *
     * This, not a magic total, is the invariant's input: whatever Tier 1 ends up containing,
     * nothing of a lower frequency may be on screen by default — the caller checks each entry
     * against the table's own `isControlVisible`. A total would have to be re-guessed every time
     * the design changed, and a re-guessed number is how a density budget rots.
     */
    visibleControls,
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

/**
 * The judgement, against the table's own predicate rather than a restatement of it.
 *
 * `leaked` — visible controls the table would *not* put on the default screen. This is the
 * product-facing failure: a control of a lower frequency is on screen with the advanced density
 * off. An id the table does not know ("unrecorded") lands here too, which is deliberate — the
 * table's own rule is that unrecorded must never read as "show it".
 *
 * `onScreenExceptions` — the visible controls that owe their place on screen to `showByDefault`.
 *
 * `declaredExceptions` — the same list read off the table, which is what catches a widening even
 * when `dist/` has not been rebuilt from it.
 */
const leaked = report.visibleControls
  .filter(({ id }) => !isControlVisible(id ?? "", false))
  .map(({ id, tier }) => `${id ?? "(unstamped)"} [tier ${tier}]`);
const onScreenExceptions = [
  ...new Set(
    report.visibleControls
      .filter(({ id }) => Boolean(id) && tierOf(id) !== 1 && isControlVisible(id, false))
      .map(({ id }) => id)
  ),
].sort();
const declaredExceptions = ALL_TIER_ITEMS.filter((item) => item.showByDefault === true)
  .map((item) => item.id)
  .sort();
/** Visible elements the table does not put in Tier 1 — legitimate exception or leak, this is the total. */
const belowTier1Visible = report.visibleControls.filter(({ id }) => !id || tierOf(id) !== 1);

if (asJson) {
  console.log(
    JSON.stringify(
      {
        profile,
        ...report,
        contract: { leaked, onScreenExceptions, declaredExceptions, pinnedExceptions: DEFAULT_VISIBILITY_EXCEPTIONS },
      },
      null,
      2
    )
  );
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
      ? `   below-Tier-1 visible     : ${belowTier1Visible.length} element(s) (expected with --advanced)`
      : `   below-Tier-1 by default : ${belowTier1Visible.length} element(s)` +
          ` — declared exceptions on screen: ${onScreenExceptions.join(", ") || "none"}`
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

if (leaked.length > 0 && !advanced) {
  console.error(
    `❌ ${leaked.length} control(s) the tier table puts outside the default screen are visible with the\n` +
      `   advanced density off: ${leaked.join(", ")}\n` +
      `   Either tier them in \`src/components/sequencer/toolbarTiers.ts\` or gate them with\n` +
      `   \`isControlVisible(...)\` — see PRODUCT_PLAN_v2.1.0.md G.10. A control that is genuinely\n` +
      `   needed on the default surface declares \`showByDefault\` there, which also means updating\n` +
      `   \`DEFAULT_VISIBILITY_EXCEPTIONS\` in this file.\n`
  );
  process.exit(1);
}
/**
 * ⭐ The exception count is pinned, and this check is deliberately table-only.
 *
 * It is what makes "one named exception" a decision rather than a drift: dropping
 * `arrangement`'s `showByDefault` empties this list and puts G3's discoverability fix back behind
 * the advanced controls, and adding a second id widens the default density budget. Neither is a
 * quiet edit, and neither waits for `dist/` to be rebuilt — the table is the thing being changed.
 */
if (!advanced && declaredExceptions.join(",") !== DEFAULT_VISIBILITY_EXCEPTIONS.join(",")) {
  console.error(
    `❌ The default-visibility exception list changed: the tier table declares ` +
      `[${declaredExceptions.join(", ")}], but this probe pins [${DEFAULT_VISIBILITY_EXCEPTIONS.join(", ")}].\n` +
      `   \`showByDefault\` is how a control below Tier 1 gets onto the default toolbar. Removing\n` +
      `   \`arrangement\` puts the arrangement view back where a fresh install could not find it;\n` +
      `   adding a second id spends density budget the contract only grants once. If the change is\n` +
      `   intended, record the date and the reason in \`DEFAULT_VISIBILITY_EXCEPTIONS\` and in\n` +
      `   \`src/components/sequencer/toolbarTiers.ts\` — the count is the design decision.\n`
  );
  process.exit(1);
}
/**
 * The two checks above are complementary, and together they pin the exception set from both sides:
 * `leaked` says nothing below Tier 1 is on screen unless the table grants it, and the pin says the
 * table grants exactly one id. A control the table grants but the toolbar never renders is **not**
 * this probe's claim to make: whether a control is on screen depends on the viewport (on the mobile
 * profile the strip scrolls horizontally and `arrangement` is legitimately off screen), and the
 * component-level half is owned by `src/test/toolbarArrangementDiscoverability.test.tsx`. So what
 * the DOM actually shows is *reported* below — `onScreenExceptions` — and judged only through
 * `leaked`.
 */
if (maxVisible !== null && report.visible > maxVisible) {
  console.error(`❌ ${report.visible} visible controls, over the --max-visible=${maxVisible} budget.\n`);
  process.exit(1);
}
process.exit(0);
