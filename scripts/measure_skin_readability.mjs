#!/usr/bin/env node
/**
 * Runtime skin readability audit.
 *
 * ## Why this exists
 *
 * The six-skin round shipped with three *structural* gates — the CSS contract, the generated-palette check and
 * a source-level contrast scan — and still needed five agents to find its bugs by looking at screenshots. The
 * one they kept hitting was always the same shape: **text that is technically a token, or a literal, and
 * unreadable where it actually lands.** The challenge's A/B/C/D chips were `bg-neutral-800` under the shell's
 * ink (invisible on paper); the rank label inlined a hex (silver at 1.6:1 on the Soviet-years paper); the
 * HI-HAT lane label used a glow colour as small text (1.55:1).
 *
 * A stylesheet scan cannot see any of those, because the answer depends on what the browser actually painted:
 * which ancestor supplied the background, what the gradient's stops are, what alpha composited to. So this
 * probe walks the *rendered* page, element by element, and measures the contrast the user's eye gets.
 *
 * ## What it checks, per skin per view
 *
 *   · **Contrast**: every visible text element, against the background it is really drawn on — the nearest
 *     painted colour, composited through translucent layers, with gradient stops taken at their worst. Body
 *     text must clear 4.5:1, large text 3:1 (WCAG 1.4.3).
 *   · **Clipping**: no interactive control whose box falls outside the viewport horizontally.
 *   · **Console**: no page errors, no React key/act warnings that indicate a broken render.
 *
 * ## Running it
 *
 *   node scripts/measure_skin_readability.mjs              # sampled: 3 skins × 5 views (the gate)
 *   node scripts/measure_skin_readability.mjs --full       # all 6 skins × 12 views (manual CI)
 *   node scripts/measure_skin_readability.mjs --dist <dir> # measure a specific build
 *   node scripts/measure_skin_readability.mjs --json
 *
 * It serves `dist/` itself, like the other probes, and exits non-zero when a skin fails — with the element's
 * test id, its text, the two colours and the ratio, so the report names the exact place to fix.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const argValue = (name, fallback) => {
  const inline = argv.find((a) => a.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index !== -1 && argv[index + 1] ? argv[index + 1] : fallback;
};

const FULL = flag("--full");
/**
 * `--report` prints the same table and never fails.
 *
 * The full sweep (6 skins x 12 views) is a *diagnostic*, not a push gate: it is where the work items come from
 * — its first run showed the pixel skin with 227 low-contrast elements on the compare view alone, which is a
 * character sheet to fix rather than a regression to block a merge on. The gate is the sampled sweep inside
 * `verify`, whose budgets are a ratchet that can only go down.
 */
const REPORT_ONLY = flag("--report");
const JSON_OUT = flag("--json");
const DIST = path.resolve(argValue("--dist", path.join(ROOT, "dist")));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let rel = (req.url || "/").split("?")[0];
      if (rel === "/") rel = "/index.html";
      let file = path.join(DIST, rel);
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, "index.html");
      res.writeHead(200, {
        "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, () => resolve({ server, port: server.address().port }));
  });
}

const SKINS = ["default", "minimal", "comic", "soviet", "sovietYears", "pixel"];
/** Desktop views render on every target; the phone views only exist on a phone-sized, touch target. */
const DESKTOP_VIEWS = [
  { name: "studio", url: "/?tab=studio", waitFor: "[data-toolbar-id='play'], [data-testid='mobile-transport-play']" },
  { name: "chords", url: "/?tab=chords", waitFor: "[data-testid^='chord-style-'], [data-testid='mobile-explore']" },
  { name: "challenge", url: "/?tab=challenge", waitFor: "[data-testid='challenge-view'], [data-testid='mobile-challenge']" },
  { name: "compare", url: "/?tab=compare", waitFor: "[data-testid='compare-view'], [data-testid='mobile-shell']" },
  { name: "timeline", url: "/?tab=timeline", waitFor: "[data-testid='timeline-view'], [data-testid='mobile-shell']" },
  { name: "analyzer", url: "/?tab=analyzer", waitFor: "[data-testid='analyzer-view'], [data-testid='mobile-shell']" },
  { name: "kick", url: "/?tab=kick", waitFor: "[data-testid='kick-view'], canvas, [data-testid='mobile-shell']" },
  { name: "galaxy", url: "/?tab=galaxy", waitFor: "canvas, [data-testid='mobile-shell']" },
];
const PHONE_VIEWS = [
  { name: "phone-home", url: "/m/home", waitFor: "[data-testid^='mobile-genre-row-']" },
  { name: "phone-jam", url: "/m/jam", waitFor: "[data-testid='mobile-jam-tempo']" },
  { name: "phone-challenge", url: "/m/challenge", waitFor: "[data-testid^='mobile-challenge-option-']" },
  { name: "phone-explore", url: "/m/explore", waitFor: "[data-testid^='chord-style-']" },
];

const SAMPLE_SKINS = ["minimal", "sovietYears", "comic"];
const SAMPLE_DESKTOP = ["studio", "chords", "challenge"];
const SAMPLE_PHONE = ["phone-home", "phone-challenge"];

/** Installed in the page: the measurement itself. Extracted so the runner stays readable. */
const AUDIT = () => {
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const ratio = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const parse = (value) => {
    if (!value) return null;
    const m = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?/.exec(value);
    if (!m) return null;
    return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], a: m[4] === undefined ? 1 : Number(m[4]) };
  };
  const over = (fg, bg) => fg.rgb.map((c, i) => Math.round(c * fg.a + bg[i] * (1 - fg.a)));
  /** Every colour a gradient mentions, as `{rgb}` — the text must read against the worst of them. */
  const gradientStops = (image) => {
    const stops = [];
    for (const m of image.matchAll(/rgba?\([^)]*\)/g)) {
      const parsed = parse(m[0]);
      if (parsed) stops.push(parsed);
    }
    for (const m of image.matchAll(/#[0-9a-f]{3,8}\b/gi)) {
      const hex = m[0].slice(1);
      const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
      stops.push({ rgb: [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)), a: 1 });
    }
    return stops;
  };

  /**
   * The colours behind an element, worst-first — with decorations composited rather than taken raw.
   *
   * The first version returned a gradient's stops *as they are*, which reported a false positive on every
   * element that paints a pattern over a solid colour: the comic skin's halftone dot grid and the phone's grain
   * both contain a light stop, so paper-on-ink labels were "measured" against that stop (paper on paper, 1:1)
   * even though the ink ground is what a reader sees. The candidates are now the *results* of painting each stop
   * over the ground behind it: a 30 %-alpha halftone composites to almost the ground, while an opaque gradient
   * stop still becomes itself. Both cases come out right.
   */
  const backgrounds = (el) => {
    /** Every layer from the text outwards: its own colour, its own decoration, then the ancestors'. */
    const layers = [];
    let node = el;
    let ground = null;
    while (node && node !== document.documentElement.parentElement) {
      const style = getComputedStyle(node);
      const bg = parse(style.backgroundColor);
      /**
       * A background-image only counts as a ground when it **covers the element**.
       *
       * `background-size: 6px 6px` is the comic skin's halftone screen and `100% 6px` is Soviet-years' red
       * stripe along the top edge of its tab bar: both are decoration, and the second one produced a false
       * positive on every tab label (dark ink "on the flag red") even though the labels sit on the paper plate
       * the bar actually is. Sizes that name a fixed pixel dimension are textures; `auto`/`cover`/`100% 100%`
       * are grounds.
       */
      /**
       * A texture is recognised by the *image*, not by `background-size`.
       *
       * The comic skin's dot screen is `radial-gradient(… 1px, transparent 1.3px)` and Soviet-years' stripe is
       * `linear-gradient(… 0 6px …)`: both name a tiny stop radius, so they are decoration. The size alone was
       * the wrong test — a character sheet sets `background-size: 6px 6px` on a *button* for its screen, and the
       * button's real fill (a Tailwind gradient) was then discarded, which is why the comic CTA measured
       * paper-on-paper.
       */
      const size = style.backgroundSize || "auto";
      const imageLooksLikeTexture = (image) => /repeating-/.test(image) || /\b[1-4](\.\d+)?px\b/.test(image);
      /**
       * …and the size is not consulted at all.
       *
       * The comic sheet sets `background-size: 6px 6px` on a button for its dot screen, so any rule that reads
       * the size concludes "texture" — even when the element's own computed image is a Tailwind gradient, which
       * is what is actually painted. A texture is an image whose *stops* name a tiny radius, or a `repeating-`
       * gradient; that is the whole test.
       */
      void size;
      const coversBox = !imageLooksLikeTexture(style.backgroundImage || "");
      /**
       * Resolve `var(--tw-gradient-…)` before parsing.
       *
       * A Tailwind gradient compiles to `linear-gradient(to right, var(--tw-gradient-stops))`, so the computed
       * value the audit reads has **no colours in it at all**. Without this every gradient element was measured
       * against whatever was behind it — a blue-to-purple button on the minimal skin was "paper on white, 1.04:1",
       * a phantom failure on two skins.
       */
      const resolveOnce = (image) =>
        image.replace(/var\(\s*(--[a-zA-Z0-9-]+)\s*(?:,\s*([^)]*))?\)/g, (_match, name, fallback) => {
          const value = style.getPropertyValue(name).trim();
          return value || (fallback ?? "").trim() || "transparent";
        });
      /**
       * Tailwind's gradient variables nest: `--tw-gradient-stops` is `var(--tw-gradient-from), var(…)`, and each
       * of those is a colour. One pass left `var(` in the string, the stops were discarded, and the audit fell
       * back to whatever was behind the button — reporting "paper on white, 1.04:1" for a blue-to-purple fill.
       */
      let rawImage = style.backgroundImage && style.backgroundImage !== "none" ? style.backgroundImage : "";
      for (let pass = 0; pass < 5 && rawImage.includes("var("); pass += 1) rawImage = resolveOnce(rawImage);
      const stops = coversBox && rawImage && !rawImage.includes("var(") ? gradientStops(rawImage) : [];
      layers.push({ bg, stops });
      if (bg && bg.a >= 0.999) {
        ground = bg.rgb;
        break;
      }
      node = node.parentElement;
    }
    const opaque = ground ?? [10, 11, 13];

    /**
     * Paint the layers from the deepest up, **replacing** the candidates whenever a layer covers what is under
     * it.
     *
     * The previous version collected the union of every layer's colours and reported the worst ratio, so an
     * opaque gradient's ground was still a candidate even though nothing of it is painted where the text sits —
     * which is how the comic skin's teal CTA was reported as "paper on paper, 1.05:1" while its computed style
     * was a solid teal gradient. A covering layer hides its ground; a translucent one composites onto it.
     */
    let current = opaque;
    let candidates = [opaque];
    for (let i = layers.length - 1; i >= 0; i -= 1) {
      const layer = layers[i];
      if (layer.stops.length) {
        const painted = layer.stops.map((stop) => (stop.a >= 0.999 ? stop.rgb : over(stop, current)));
        const opaqueStop = layer.stops.every((stop) => stop.a >= 0.999);
        candidates = opaqueStop ? painted : painted.map((colour) => over({ rgb: colour, a: 1 }, current));
        // The brightest/darkest stop is what the text may sit on; keep the first as the working colour.
        current = painted[0];
        if (opaqueStop) {
          candidates = painted;
        } else {
          candidates = painted;
        }
      }
      if (layer.bg && layer.bg.a > 0) {
        current = over(layer.bg, current);
        candidates = candidates.map((colour) => over(layer.bg, colour));
      }
    }
    return candidates;

  };

  const isVisible = (el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    if (rect.bottom < 0 || rect.top > window.innerHeight * 4) return false;
    const style = getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity) > 0.3;
  };

  const label = (el) => {
    const id = el.getAttribute("data-testid");
    const text = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);
    const classes = (el.className || "").toString().split(/\s+/).filter((c) => /text-|color/.test(c)).slice(0, 3).join(" ");
    return { testid: id, text, classes, tag: el.tagName.toLowerCase() };
  };

  const failures = [];
  const checked = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode()) {
    const text = (walker.currentNode.nodeValue || "").trim();
    // A single glyph is usually decoration (an arrow, a bullet, a star) and may legitimately be a shape colour.
    if (text.length < 2) continue;
    const el = walker.currentNode.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    if (el.closest("canvas, svg, [aria-hidden='true']")) continue;
    if (!isVisible(el)) continue;

    const style = getComputedStyle(el);
    const fg = parse(style.color);
    if (!fg || fg.a < 0.2) continue;
    const bgs = backgrounds(el);
    if (!bgs.length) continue;

    const size = Number.parseFloat(style.fontSize);
    const weight = Number(style.fontWeight) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const floor = large ? 3 : 4.5;

    let worst = Infinity;
    let worstBg = null;
    for (const bg of bgs) {
      if (!bg) continue;
      const composited = fg.a >= 0.999 ? fg.rgb : over(fg, bg);
      const value = ratio(composited, bg);
      if (value < worst) {
        worst = value;
        worstBg = bg;
      }
    }
    if (!worstBg || !Number.isFinite(worst)) continue;
    const record = { ...label(el), ratio: Math.round(worst * 100) / 100, floor, colour: style.color, bg: `rgb(${worstBg.join(" ")})` };
    checked.push(record);
    if (worst < floor) failures.push(record);
  }

  /**
   * Clipped controls: a control whose box leaves the viewport horizontally cannot be tapped fully.
   *
   * …unless it lives in a container that scrolls horizontally, which is a deliberate design (the toolbars and
   * the genre rails are scroll strips: their contents are *meant* to extend past the edge). Without this the
   * check reported every control in every rail as a defect.
   */
  const inScrollRail = (node) => {
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (/(auto|scroll)/.test(style.overflowX)) return true;
    }
    return false;
  };
  const clipped = [];
  for (const node of document.querySelectorAll("button, select, input, textarea, a[href], [role='button']")) {
    if (node.closest("canvas, svg")) continue;
    const rect = node.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    if (rect.left < -0.5 || rect.right > window.innerWidth + 0.5) {
      if (inScrollRail(node)) continue;
      clipped.push(label(node));
    }
  }

  return { failures, checked: checked.length, clipped };
};

async function main() {
  if (!fs.existsSync(path.join(DIST, "index.html"))) {
    console.error(`❌ no build at ${DIST} — run \`npm run build\` first.`);
    process.exit(1);
  }
  const { server, port } = await startServer();
  const base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch();
  const results = [];

  for (const skin of FULL ? SKINS : SAMPLE_SKINS) {
    for (const isPhone of [false, true]) {
      const views = isPhone ? PHONE_VIEWS : DESKTOP_VIEWS;
      const names = isPhone ? (FULL ? views.map((v) => v.name) : SAMPLE_PHONE) : FULL ? views.map((v) => v.name) : SAMPLE_DESKTOP;
      for (const view of views.filter((v) => names.includes(v.name))) {
        const context = await browser.newContext({
          viewport: isPhone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
          isMobile: isPhone,
          hasTouch: isPhone,
          deviceScaleFactor: 1,
        });
        await context.addInitScript((id) => {
          try {
            localStorage.setItem("groove_skin_v1", id);
            localStorage.setItem("groove_onboarding_completed", "1");
            localStorage.setItem("groove_language", "en");
          } catch {
            /* storage may be unavailable; the audit then measures the default skin */
          }
        }, skin);
        const page = await context.newPage();
        const consoleErrors = [];
        page.on("pageerror", (error) => consoleErrors.push(String(error).slice(0, 160)));
        page.on("console", (message) => {
          if (message.type() === "error") consoleErrors.push(message.text().slice(0, 160));
        });

        try {
          await page.goto(`${base}${view.url}`, { waitUntil: "domcontentloaded" });
          await page.waitForSelector(view.waitFor, { timeout: 30000 }).catch(() => {});
          await page.waitForTimeout(1400);
          const audit = await page.evaluate(AUDIT);
          results.push({ skin, view: view.name, errors: consoleErrors, ...audit });
        } catch (error) {
          results.push({ skin, view: view.name, errors: [...consoleErrors, String(error).slice(0, 160)], failures: [], checked: 0, clipped: [] });
        }
        await context.close();
      }
    }
  }

  await browser.close();
  server.close();

  const summary = results.map((r) => ({
    skin: r.skin,
    view: r.view,
    checked: r.checked,
    lowContrast: r.failures.length,
    clipped: r.clipped.length,
    errors: r.errors.length,
  }));

  /**
   * Budgets, as a ratchet.
   *
   * Zero is the goal; the numbers below are **today's measurements**, printed with a "could be tightened"
   * hint exactly like the phone touch-target gate. A view whose count rises fails; a view whose count falls
   * reports the tighter number it could be set to, so the budget can only go down.
   *
   * Why a budget rather than a clean sweep before shipping: what is left are colours *chosen in components* —
   * a chord chip that paints itself with the ink token, a view that assumes a dark plate, an inline genre
   * accent — each a small UI decision rather than a palette bug. The gate makes them countable and stops them
   * growing while they are worked off.
   */
  const BUDGET = {
    /**
     * **Zero everywhere.**
     *
     * The ratchet started at 8/130/3/6/6 when this gate was written and has been tightened four times; the
     * remaining findings were fixed rather than budgeted — the chord page went 129 → 0, the studio 7 → 0, and
     * both phone views were already there. A budget of zero means any new unreadable element in any sampled
     * skin × view fails the build, which is what a gate is for once the debt is paid.
     */
    studio: 0,
    chords: 0,
    challenge: 0,
    "phone-home": 0,
    "phone-challenge": 0,
  };

  /**
   * The report.
   *
   * A gate that only says "pass" is not much use while there is work left, and a *diagnostic* run has to be
   * machine-readable — this block was lost in an earlier edit of this file (the table, the offender list and
   * `--json` all went missing while the gate itself kept working), which is why it is written out here again
   * with the reason attached.
   */
  if (JSON_OUT) {
    // Only the data reaches stdout, so `--json` can be piped into anything. The exit code is still the gate.
    console.log(JSON.stringify({ summary, results }, null, 2));
  } else {
    console.log("\n🎨 SKIN READABILITY AUDIT\n");
    const allowedFor = (view) => BUDGET[view] ?? (FULL ? 0 : Infinity);
    for (const row of summary) {
      const allowed = allowedFor(row.view);
      const broken = row.clipped > 0 || row.errors > 0 || row.lowContrast > allowed;
      const warn = !broken && row.lowContrast > 0;
      console.log(
        `  ${broken ? "❌" : warn ? "⚠️" : "✅"} ${row.skin.padEnd(12)} ${row.view.padEnd(16)} text ${String(row.checked).padStart(4)}  ` +
          `low-contrast ${row.lowContrast}${warn || broken ? `/${allowed}` : ""}  clipped ${row.clipped}  console ${row.errors}`
      );
    }
    const offenders = results.flatMap((r) => r.failures.map((f) => ({ skin: r.skin, view: r.view, ...f })));
    if (offenders.length) {
      console.log(`\n  ${offenders.length} element(s) below the floor:`);
      for (const o of offenders.slice(0, 40)) {
        console.log(
          `   · ${o.skin}/${o.view}  ${o.ratio}:1 (floor ${o.floor})  ${o.colour} on ${o.bg}  ` +
            `"${o.text}"  [${o.testid ?? o.tag}] ${o.classes ?? ""}`
        );
      }
      if (offenders.length > 40) console.log(`   … and ${offenders.length - 40} more`);
    }
    const clipped = results.flatMap((r) => r.clipped.map((c) => ({ skin: r.skin, view: r.view, ...c })));
    if (clipped.length) {
      console.log(`\n  ${clipped.length} clipped control(s):`);
      for (const c of clipped.slice(0, 20)) console.log(`   · ${c.skin}/${c.view}  "${c.text}"  [${c.testid ?? c.tag}]`);
    }
    const errored = results.filter((r) => r.errors.length);
    if (errored.length) {
      console.log(`\n  ${errored.length} page(s) with console errors:`);
      for (const e of errored.slice(0, 10)) console.log(`   · ${e.skin}/${e.view}  ${e.errors[0]}`);
    }
  }

  const over = [];
  const tighten = [];
  for (const row of summary) {
    const allowed = BUDGET[row.view] ?? (FULL ? 0 : Infinity);
    if (row.lowContrast > allowed) over.push(`${row.skin}/${row.view}: ${row.lowContrast} low-contrast (budget ${allowed})`);
    else if (BUDGET[row.view] !== undefined && row.lowContrast < allowed) {
      tighten.push(`${row.view} ${row.lowContrast} < ${allowed}`);
    }
  }
  if (!JSON_OUT && tighten.length) console.log(`\n  budget could be tightened: ${[...new Set(tighten)].join(", ")}`);

  const failed = over.length > 0 || results.some((r) => r.clipped.length || r.errors.length);
  if (REPORT_ONLY) {
    // Still exit 0: the point of this mode is the table, and a red exit would turn a diagnostic into a gate.
    console.log(
      failed
        ? `\n📋 report only: ${over.length} view(s) over budget, ${results.reduce((n, r) => n + r.failures.length, 0)} element(s) below the floor (not failing)`
        : "\n📋 report only: everything inside budget"
    );
    return;
  }
  if (failed) {
    console.error("\n❌ skin readability audit failed");
    for (const line of over) console.error(`   · ${line}`);
    process.exit(1);
  }
  console.log("\n✅ skin readability holds: unclipped, error-free, and inside the contrast budget");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
