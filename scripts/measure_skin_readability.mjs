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
   * The colours behind an element, worst-first.
   *
   * Walks up compositing translucent layers until something opaque is found, and if any ancestor paints a
   * gradient it returns that gradient's stops as separate candidates — because text sits on *one* of them and
   * the audit cannot know which.
   */
  const backgrounds = (el) => {
    let stack = [];
    let node = el;
    let base = null;
    while (node && node !== document.documentElement.parentElement) {
      const style = getComputedStyle(node);
      if (style.backgroundImage && style.backgroundImage !== "none") {
        const stops = gradientStops(style.backgroundImage);
        if (stops.length) {
          // Composite the accumulated translucent layers over each stop.
          const resolved = stops.map((stop) => over({ rgb: stop.rgb, a: stop.a }, stack.length ? stack[stack.length - 1] : [255, 255, 255]));
          return resolved.map((rgb) => (stack.length ? over(stack[0], rgb) : rgb));
        }
      }
      const bg = parse(style.backgroundColor);
      if (bg && bg.a > 0) {
        stack.unshift(bg);
        if (bg.a >= 0.999) {
          base = bg.rgb;
          break;
        }
      }
      node = node.parentElement;
    }
    const opaque = base ?? [10, 11, 13];
    let result = opaque;
    for (let i = stack.length - 1; i >= 0; i -= 1) result = over(stack[i], result);
    return [result];
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
     * Today's measurements, per view: the ratchet starts where the code is and can only go down.
     *
     * Tightened from 8/130/3/6/6 after the role-kind, named-ink and accent-ink fixes took the chord page from
     * 129 to 13 elements in the worst skin. What is left is listed in the changelog: mostly component-level
     * colour decisions (a chip painted with the ink token, a legend on a dark plate) rather than palette gaps.
     */
    studio: 6,
    chords: 14,
    challenge: 3,
    "phone-home": 6,
    "phone-challenge": 6,
  };
  if (!JSON_OUT) {
    console.log("\n🎨 SKIN READABILITY AUDIT\n");
    /**
     * Three states, not two: a view with findings that are inside its budget is a ⚠️, not a ❌.
     *
     * Printing ❌ for a run that passes (which this did until it was looked at) is the kind of report people
     * stop reading — and the budget exists precisely so "known, counted, being worked off" is a different
     * state from "this regressed".
     */
    for (const row of summary) {
      const allowed = BUDGET[row.view] ?? (FULL ? 0 : Infinity);
      const broken = row.clipped || row.errors || row.lowContrast > allowed;
      const warn = !broken && row.lowContrast > 0;
      console.log(
        `  ${broken ? "❌" : warn ? "⚠️" : "✅"} ${row.skin.padEnd(12)} ${row.view.padEnd(16)} text ${String(row.checked).padStart(4)}  ` +
          `low-contrast ${row.lowContrast}${warn ? `/${allowed}` : ""}  clipped ${row.clipped}  console ${row.errors}`
      );
    }
    const offenders = results.flatMap((r) => r.failures.map((f) => ({ skin: r.skin, view: r.view, ...f })));
    if (offenders.length) {
      console.log(`\n  ${offenders.length} element(s) below the contrast floor:`);
      for (const o of offenders.slice(0, 40)) {
        console.log(`   · ${o.skin}/${o.view}  ${o.ratio}:1 (floor ${o.floor})  ${o.colour} on ${o.bg}  "${o.text}"  [${o.testid ?? o.tag}]`);
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
  } else {
    console.log(JSON.stringify({ summary, results }, null, 2));
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
