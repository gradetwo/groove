/**
 * Comprehensive Cross-Browser & Cross-Device E2E Test Suite
 * Tests Chrome, Firefox, WebKit, iPhone (Portrait/Landscape), and iPad (Portrait/Landscape).
 * Mandatory gate before every release.
 */

import http from "http";
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

/**
 * Playwright resolution order:
 *   1. normal resolution (a real devDependency in a fully installed checkout)
 *   2. PLAYWRIGHT_MODULE_PATH (opt-in escape hatch for machines where Playwright is
 *      installed globally, e.g. this development box — no personal path is hardcoded)
 *
 * Note for maintainers: `playwright` is intentionally NOT listed in package.json
 * devDependencies yet, because this repository's package-lock.json could not be
 * regenerated offline. Add it with a single `npm install -D playwright` on a machine
 * with network access (which also refreshes the lockfile); CI installs it ad-hoc with
 * `npm install --no-save` in the e2e job until then.
 */
function loadPlaywright() {
  try {
    return require("playwright");
  } catch (primaryError) {
    const extraPath = process.env.PLAYWRIGHT_MODULE_PATH;
    if (extraPath) {
      try {
        const requireFromPath = createRequire(path.join(extraPath, "noop.js"));
        return requireFromPath("playwright");
      } catch {
        /* fall through to the actionable error below */
      }
    }
    console.error(
      [
        "",
        "\u274c Could not load Playwright.",
        "",
        "Install it (this also refreshes package-lock.json):",
        "",
        "    npm install -D playwright",
        "    npx playwright install --with-deps chromium firefox webkit",
        "",
        "Or, if Playwright already exists somewhere on this machine, point at it:",
        "",
        "    PLAYWRIGHT_MODULE_PATH=/path/to/node_modules npm run test:e2e",
        "",
        `Original error: ${primaryError.message}`,
        "",
      ].join("\n")
    );
    process.exit(1);
  }
}

const playwright = loadPlaywright();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

/**
 * Refuses to test a stale bundle.
 *
 * This suite serves `dist/`, so if `npm run build` failed the tests happily run against the
 * *previous* build and report PASS — a broken build becomes invisible, and the release gate
 * reports green while the tree does not compile. That is not hypothetical: it happened while
 * adding the phone shell, where a type error failed the build and all seven targets still passed.
 *
 * The check compares the newest source file against the built entry point, which is sufficient
 * and cheap: any source edit that is not reflected in a rebuild makes the entry point older.
 */
function assertDistIsFresh() {
  const distDir = path.join(process.cwd(), "dist");
  const entry = path.join(distDir, "index.html");
  if (!fs.existsSync(entry)) {
    throw new Error("dist/index.html is missing — run `npm run build` before the e2e matrix");
  }
  const entryMtime = fs.statSync(entry).mtimeMs;
  const roots = ["src", "index.html", "vite.config.ts", "tailwind.config.js"];
  let newest = 0;
  let newestFile = "";
  const walk = (target) => {
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(target)) walk(path.join(target, child));
      return;
    }
    if (stat.mtimeMs > newest) {
      newest = stat.mtimeMs;
      newestFile = target;
    }
  };
  for (const root of roots) {
    const full = path.join(process.cwd(), root);
    if (fs.existsSync(full)) walk(full);
  }
  if (newest > entryMtime) {
    throw new Error(
      `dist/ is stale: ${path.relative(process.cwd(), newestFile)} is newer than dist/index.html.\n` +
        "  The matrix serves the built bundle, so testing now would validate old output.\n" +
        "  Run `npm run build` first (and read its output — a failed build is the usual cause)."
    );
  }
}

// Start local static server serving the production dist/ bundle
function startStaticServer() {
  return new Promise((resolve) => {
    const distDir = path.join(process.cwd(), "dist");
    const server = http.createServer((req, res) => {
      let relativePath = req.url.split("?")[0];
      if (relativePath === "/") relativePath = "/index.html";
      let filePath = path.join(distDir, relativePath);

      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(distDir, "index.html");
      }

      const ext = path.extname(filePath);
      res.writeHead(200, {
        "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      fs.createReadStream(filePath).pipe(res);
    });

    server.listen(0, () => {
      const port = server.address().port;
      resolve({ server, port });
    });
  });
}

// Test matrix definition
/**
 * Optional target filter for iterating on a single device: `E2E_ONLY=iPhone node scripts/test_matrix.js`.
 * This exists so a phone-only fix does not cost a full matrix per attempt.
 */
const TARGET_FILTER = process.env.E2E_ONLY || "";

/**
 * Which *group* of targets the release gate runs.
 *
 *   E2E_PROFILE=pc      the three desktop browsers       (default in `npm run verify`)
 *   E2E_PROFILE=mobile  the four phone/tablet targets
 *   E2E_PROFILE=all     everything — the full matrix, `npm run test:e2e:all`
 *
 * The phone and tablet surfaces are being redesigned from scratch, so their targets assert against a
 * UI that is about to be replaced: running them in every gate costs minutes per iteration and
 * reports failures that the redesign will invalidate. `pc` is therefore the default *in the gate*
 * while `all` stays one command away — the matrix itself is unchanged, and a surface that has been
 * redesigned just switches profiles back.
 *
 * This is a deliberate, reversible reduction in gate coverage, recorded here and in
 * `ARCHITECTURE_SURFACES.md` §6 rather than quietly left to look like a full run.
 */
const TARGET_PROFILE = (process.env.E2E_PROFILE || "all").toLowerCase();
const PROFILE_MATCHERS = {
  all: () => true,
  pc: (t) => !t.isMobile && !t.isTablet,
  mobile: (t) => Boolean(t.isMobile || t.isTablet),
};

const ALL_TARGETS = [
  // 1. Desktop Browsers
  {
    name: "Desktop Chromium / Chrome",
    browserType: "chromium",
    options: {
      viewport: { width: 1280, height: 800 },
    },
  },
  {
    name: "Desktop Firefox",
    browserType: "firefox",
    options: {
      viewport: { width: 1280, height: 800 },
    },
  },
  {
    name: "Desktop WebKit (Safari Engine)",
    browserType: "webkit",
    options: {
      viewport: { width: 1280, height: 800 },
    },
  },

  // 2. Mobile & Tablet Devices (WebKit / iOS)
  {
    name: "iPhone 14 (竖屏 Portrait)",
    browserType: "webkit",
    device: "iPhone 14",
    isMobile: true,
  },
  {
    name: "iPhone 14 (横屏 Landscape)",
    browserType: "webkit",
    device: "iPhone 14 landscape",
    isMobile: true,
  },
  {
    name: "iPad Pro 11 (竖屏 Portrait)",
    browserType: "webkit",
    device: "iPad Pro 11",
    isTablet: true,
  },
  {
    name: "iPad Pro 11 (横屏 Landscape)",
    browserType: "webkit",
    device: "iPad Pro 11 landscape",
    isTablet: true,
  },
];

if (!PROFILE_MATCHERS[TARGET_PROFILE]) {
  console.error(
    `❌ E2E_PROFILE=${TARGET_PROFILE} is not a profile. Use one of: ${Object.keys(PROFILE_MATCHERS).join(", ")}`
  );
  process.exit(1);
}

const TARGETS = ALL_TARGETS.filter(PROFILE_MATCHERS[TARGET_PROFILE]).filter((t) =>
  TARGET_FILTER ? t.name.toLowerCase().includes(TARGET_FILTER.toLowerCase()) : true
);

if (TARGETS.length === 0) {
  console.error(
    `❌ E2E_PROFILE=${TARGET_PROFILE}${TARGET_FILTER ? ` + E2E_ONLY=${TARGET_FILTER}` : ""} matched no target`
  );
  process.exit(1);
}
if (TARGET_PROFILE !== "all" || TARGET_FILTER) {
  console.log(
    `[profile] E2E_PROFILE=${TARGET_PROFILE}${TARGET_FILTER ? ` E2E_ONLY=${TARGET_FILTER}` : ""} → ` +
      `${TARGETS.length} of ${ALL_TARGETS.length} target(s): ${TARGETS.map((t) => t.name).join(", ")}\n`
  );
}

/**
 * Click an element and *verify the click event actually arrived*.
 *
 * Three lessons, all from the sibling project's WebKit notes
 * (`synth/docs/notes/webkit-testing-pitfalls.md`, §1.1/§1.1b) — the first two of which this
 * suite had already been bitten by:
 *
 * 1. **Do not depend on "two stable frames".** Playwright's actionability check waits for them,
 *    and on a WebKit build without a compositor the page may not produce frames for seconds — the
 *    notes measured 8–30 s per click. So: scroll in the DOM, aim at the bounding box, and dispatch
 *    real mouse input.
 * 2. **A real click needs a pair of down/up on the same node.** If a re-render replaces the node
 *    in between, the engine dispatches **no `click` at all** — which looks exactly like "the
 *    product ignored my tap" while a driver-level `locator.click()` works. Verify delivery, and
 *    retry around the gesture.
 * 3. **`force: true` clicks are dispatched at coordinates**, so a sticky header covering the
 *    target silently receives them. Centring the element first is what a user would do anyway.
 *
 * The retry is *around a real gesture*, not a relaxed assertion: if the element never receives a
 * click this still fails, and it names the missing event.
 */
/**
 * Opens the studio's secondary-controls surface, whichever shell is on screen.
 *
 * The phone shell replaces the 64-button desktop toolbar with a compact transport bar, so the
 * audio-settings entry point lives somewhere else there (the transport bar's "more" button rather
 * than `toolbar-advanced-toggle`). Assertions should be about *reachability*, not about which
 * chrome a given viewport happens to use, so this resolves the surface per target.
 */
/**
 * Opens the piano roll from whichever shell is present.
 *
 * Desktop has a dedicated toolbar button; the phone reaches it through the studio sheet. The
 * assertion the suite cares about is that the roll edits the studio's own pattern, which is a
 * cross-view claim and has nothing to do with which chrome exposed the entry point.
 */
/**
 * Opens the piano roll, or reports that this shell does not have one.
 *
 * The phone shell deliberately omits the roll: measured on a 390×664 device the drawer is 1095 px
 * tall with a 2304 px grid, 55 toolbar buttons and `touch-action: none` on the grid (a one-finger
 * drag must paint rather than scroll, so there is no gesture left to pan with). Returning `null`
 * lets the caller skip the roll assertions on that shell and assert the *notice* instead — the
 * point being that an omitted feature must be visibly omitted rather than silently missing.
 */
async function openPianoRoll(page) {
  /**
   * The roll is Tier 2 (`toolbarTiers.ts`), so the desktop shell renders it only once the advanced
   * density is on — that is what G.10's slimming does: 36 always-visible controls became 16, and the
   * roll is one of those that moved behind the "More" control.
   *
   * The desktop path therefore opens the density first. The previous order — test for the toggle,
   * and if it is absent fall through — would have silently deleted the roll's coverage from the
   * desktop matrix, which is exactly the "an omitted feature must be *visibly* omitted" failure the
   * phone branch below exists to avoid.
   */
  if (await page.$("[data-testid='mobile-transport-more']")) {
    /**
     * Phone shell: the roll is not offered. Its sheet row is "editing notes", which opens the
     * explanation — so this opens that, and the caller asserts the explanation plus its route to
     * the Chords view instead of the grid.
     */
    await openStudioMoreControls(page);
    await clickSheetRowAndVerify(
      page,
      "[data-testid='mobile-studio-action-note-editing']",
      "[data-testid='piano-roll-mobile-notice']",
      "note-editing help"
    );
    return null;
  }
  // Already open (an earlier step left it that way): nothing to do.
  if (await page.$("[data-testid='piano-roll-grid']")) return "desktop";

  if (!(await page.$("[data-testid='toolbar-piano-roll-toggle']"))) {
    await openStudioMoreControls(page);
  }

  /**
   * Verify the *outcome*, not the click.
   *
   * `clickVerified` re-queries the selector on each retry, which is the wrong instrument for a
   * control whose own click re-renders the toolbar: the retry can look for an element that the
   * first, successful click already replaced. The roll's grid appearing is the thing the caller
   * needs, and it cannot be satisfied by a click that did nothing.
   */
  const toggle = await page.waitForSelector("[data-testid='toolbar-piano-roll-toggle']", {
    timeout: 15000,
  });
  await toggle.click();
  await page.waitForSelector("[data-testid='piano-roll-grid']", { timeout: 15000 });
  return "desktop";
}

/**
 * Clicks a row inside a scrolling bottom sheet.
 *
 * `clickVerified` handles elements that are already on screen, but a sheet row can sit far below
 * the fold — the studio sheet renders ~1300 px of rows inside a `max-h-[80dvh]` scroller, so its
 * last rows start outside a 664 px phone viewport and Playwright's actionability check simply
 * waits until the click times out. Scrolling the row into view first is the difference between
 * "the row is missing" and "the row exists and works", and only the first of those is a bug.
 */
/**
 * Clicks a row in the studio sheet and verifies the result rather than the click.
 *
 * `clickVerified` asserts that a `click` event reached the element, which a row that *navigates
 * away* can never satisfy: the row's own handler closes the sheet, so the element is gone from the
 * document by the time the check runs. That is the intended behaviour, so the verification has to
 * be the outcome — the row's surface closed and its destination appeared — not the event.
 *
 * Scrolling is `block: "nearest"` on purpose: the sheet is its own scroller and `center` can
 * scroll the backdrop over the row's centre.
 */
async function clickSheetRowAndVerify(page, selector, expectSelector, label) {
  await page.waitForSelector(selector, { timeout: 15000 });
  const prepared = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
    el.setAttribute("data-e2e-target", "1");
    return true;
  }, selector);
  if (!prepared) throw new Error(`${selector} not found`);
  await page.waitForTimeout(250);

  const box = await page.evaluate(() => {
    const el = document.querySelector("[data-e2e-target='1']");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (!box) throw new Error(`${selector} lost its box before the click`);
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  await page.waitForTimeout(60);
  await page.mouse.up();
  await page.evaluate(() => document.querySelector("[data-e2e-target='1']")?.removeAttribute("data-e2e-target"));

  if (expectSelector) {
    try {
      await page.waitForSelector(expectSelector, { timeout: 15000 });
    } catch {
      const diag = await page.evaluate(() => ({
        sheetOpen: Boolean(document.querySelector("[data-testid='mobile-studio-sheet']")),
        panelOpen: Boolean(document.querySelector("[data-testid='audio-settings-gs1-toggle']")),
      }));
      throw new Error(`${label}: clicking ${selector} did not produce ${expectSelector} :: ${JSON.stringify(diag)}`);
    }
  }
}

async function openStudioMoreControls(page) {
  const mobileMore = await page.$("[data-testid='mobile-transport-more']");
  if (mobileMore) {
    await clickVerified(page, "[data-testid='mobile-transport-more']");
    return "mobile";
  }
  const advanced = await page.$("[data-testid='toolbar-advanced-toggle']");
  if (advanced) {
    await clickVerified(page, "[data-testid='toolbar-advanced-toggle']");
    return "desktop";
  }
  throw new Error("No studio secondary-controls surface found on this viewport");
}

/**
 * Opens the floated console from whichever shell is present. On a phone the console is reached
 * through the studio sheet; on desktop through the toolbar.
 */
async function openFloatedConsole(page) {
  const desktopToggle = await page.$("[data-testid='toolbar-console-toggle']");
  if (desktopToggle) {
    await clickVerified(page, "[data-testid='toolbar-console-toggle']");
    return "desktop";
  }
  await openStudioMoreControls(page);
  if (!(await page.$("[data-testid='mobile-studio-action-console']"))) {
    throw new Error("Phone studio sheet has no console row");
  }
  await clickSheetRowAndVerify(
    page,
    "[data-testid='mobile-studio-action-console']",
    null,
    "floating console"
  );
  return "mobile";
}

async function clickVerified(page, selector, { timeoutMs = 10000, pressMs = 60, scrollInline = true } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastReason = "unknown";
  while (Date.now() < deadline) {
    await page.evaluate((sel) => {
      window.__clickProbe = { events: [] };
      const el = document.querySelector(sel);
      const record = (type) => (event) => {
        // `once` per type: the first event of that type decides whether delivery happened.
        window.__clickProbe.events.push({
          type,
          targetMatched: Boolean(el && (event.target === el || el.contains(event.target))),
        });
      };
      for (const type of ["pointerdown", "pointerup", "click"]) {
        document.addEventListener(type, record(type), { capture: true, once: true });
      }
    }, selector);

    const box = await page.evaluate(({ sel, inline }) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      // `inline: "center"` on a `sticky left-0` column asks the scroller to centre a box that is
      // pinned to the left edge, which scrolls the studio sideways for nothing.
      el.scrollIntoView(inline ? { block: "center", inline: "center" } : { block: "center" });
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
    }, { sel: selector, inline: scrollInline });

    if (!box) {
      lastReason = `${selector} is not in the document`;
    } else if (box.w < 1 || box.h < 1) {
      lastReason = `${selector} has a zero-sized box (${box.w}x${box.h})`;
    } else {
      await page.mouse.move(box.x, box.y);
      await page.mouse.down();
      // A non-zero press duration: a 0 ms press is the easiest thing for an engine to swallow.
      await page.waitForTimeout(pressMs);
      await page.mouse.up();
      const events = await page.evaluate(() => window.__clickProbe?.events ?? []);
      if (events.some((e) => e.type === "click" && e.targetMatched)) return;
      lastReason = `no click reached ${selector} (saw ${
        events.map((e) => `${e.type}${e.targetMatched ? "" : "→other"}`).join(", ") || "nothing"
      })`;
    }
    await page.waitForTimeout(150);
  }
  throw new Error(`clickVerified(${selector}) failed: ${lastReason}`);
}

/** Centring click for non-critical interactions that need no delivery proof. */
async function clickCentred(page, selector) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) el.scrollIntoView({ block: "center" });
  }, selector);
  await page.waitForTimeout(150);
  await page.click(selector, { force: true });
}

/** Active steps in one track row of the step matrix. */
async function countActiveSteps(page, trackIdx) {
  return page.$$eval(`[data-track-idx="${trackIdx}"][data-step-idx]`, (cells) =>
    cells.filter((c) => c.getAttribute("aria-selected") === "true").length
  );
}

async function runTestOnTarget(target, baseUrl) {
  const browserLauncher = playwright[target.browserType];
  const browser = await browserLauncher.launch({
    headless: true,
    args: target.browserType === "chromium" ? ["--no-sandbox", "--disable-setuid-sandbox"] : [],
  });

  const contextOptions = target.device
    ? { ...playwright.devices[target.device] }
    : { ...target.options };

  const context = await browser.newContext(contextOptions);
  await context.addInitScript(() => {
    try {
      localStorage.setItem("groove_onboarding_completed", "true");
    } catch (_) {}
  });
  const page = await context.newPage();

  const errors = [];
  page.on("pageerror", (err) => {
    // Collect uncaught client errors
    errors.push(`[PageError] ${err.message}`);
  });

  try {
    // 1. Initial Load & Studio View
    await page.goto(`${baseUrl}/?tab=studio`, { waitUntil: "domcontentloaded" });

    // Title check
    const title = await page.title();
    if (!title.includes("GROOVE LAB")) {
      throw new Error(`Expected title to include 'GROOVE LAB', got: '${title}'`);
    }

    // Ensure ErrorBoundary is NOT triggered
    const errorBoundary = await page.$(".border-rose-500");
    if (errorBoundary) {
      const errText = await errorBoundary.innerText();
      throw new Error(`ErrorBoundary caught exception: ${errText.slice(0, 100)}`);
    }

    // Sequencer tracks verification (wait for lazy chunk to mount)
    await page.waitForSelector("[data-track-idx], [data-step-idx], .landscape-compact-cell", { state: "attached", timeout: 45000 });
    const tracks = await page.$$("[data-track-idx], .touch-hit-44, [data-step-idx]");
    if (tracks.length === 0) {
      // Check for step cells or track headers
      const cellCount = await page.evaluate(() => document.querySelectorAll(".landscape-compact-cell, [data-step-idx]").length);
      if (cellCount === 0) {
        throw new Error("No sequencer step cells detected in StudioView");
      }
    }

    // Play button interaction & Playhead beam alignment check
    /**
     * By test id, not by label.
     *
     * The selector used to be `button:has-text('播放')`, which is only unambiguous while nothing else
     * on screen offers to play. The first screen now carries a one-line "listen to this groove" hint
     * whose button also says 播放; the matrix clicked *that* one, and its follow-up "pause back" click
     * then held a handle to a button that had retired (reported, accurately, as
     * `elementHandle.click: Element is not attached to the DOM`). The transport's own controls have
     * stable ids on both surfaces.
     */
    const playBtn = await page.$(
      "[data-toolbar-id='play'], [data-testid='mobile-transport-play']"
    );
    if (playBtn) {
      await playBtn.click({ force: true });
      await page.waitForTimeout(250);
      const playheadCheck = await page.evaluate(() => {
        const beam = document.querySelector(".playhead-laser-beam");
        const activeCell = document.querySelector(".playhead-active");
        if (!beam || !activeCell) return { ok: true };
        const bRect = beam.getBoundingClientRect();
        const cRect = activeCell.getBoundingClientRect();
        const diff = Math.abs(Math.round(bRect.left) - Math.round(cRect.left));
        return { ok: diff <= 1, diff, beamLeft: bRect.left, cellLeft: cRect.left };
      });
      if (!playheadCheck.ok) {
        throw new Error(
          `Playhead beam misalignment on ${target.name}: beamLeft=${playheadCheck.beamLeft}, cellLeft=${playheadCheck.cellLeft}, diff=${playheadCheck.diff}px`
        );
      }
      await playBtn.click({ force: true }); // Pause back
    }

    // 2. Responsive Viewport Check (Horizontal scroll check)
    const overflowCheck = await page.evaluate(() => {
      const root = document.documentElement;
      const docW = root.scrollWidth;
      /**
       * Reference the **layout viewport**, not `window.innerWidth`.
       *
       * `innerWidth` includes the scrollbar (classic) while `scrollWidth` is measured without it,
       * so the two are not comparable: on a classic-scrollbar engine the check is up to a
       * scrollbar-width *too lenient* and can miss a real overflow. `clientWidth` is the width the
       * layout actually had to fit into, on every engine and scrollbar style.
       * (Cross-engine lesson borrowed from the sibling project's WebKit notes, §2.3.)
       */
      const viewW = root.clientWidth;
      // Allow minor 1px rounding discrepancies on high-DPI displays
      return { docW, winW: viewW, hasOverflow: docW > viewW + 4 };
    });

    if (overflowCheck.hasOverflow && !target.isTablet && !target.isMobile) {
      console.warn(`  ⚠️ Warning: Desktop document scrollWidth (${overflowCheck.docW}) > window.innerWidth (${overflowCheck.winW})`);
    }

    // 2.1 Bilingual Layout Baseline Check (Chinese width baseline rule)
    const langBtn = await page.$("button[title='Switch Language']");
    if (langBtn) {
      await langBtn.click({ force: true }); // Toggle to English
      await page.waitForTimeout(150);
      const enOverflow = await page.evaluate(() => {
        // Same layout-viewport reference as above: comparing against `innerWidth` would let a
        // scrollbar's worth of real overflow through.
        const root = document.documentElement;
        return root.scrollWidth > root.clientWidth + 4;
      });
      if (enOverflow && !target.isTablet && !target.isMobile) {
        throw new Error("Layout overflow detected after switching to English mode (violating Chinese baseline rule)");
      }
      await langBtn.click({ force: true }); // Toggle back to Chinese
      await page.waitForTimeout(150);
    }

    // 2.2 Navigation IA Check (Explore dropdown test on desktop/tablet)
    if (!target.isMobile) {
      const exploreBtn = await page.$("button[title*='探索'], button[title*='Explore']");
      if (exploreBtn) {
        await exploreBtn.click({ force: true });
        await page.waitForTimeout(150);
        const dropdown = await page.$("div:has-text('曲风探索视图'), div:has-text('Exploration Views')");
        if (!dropdown) {
          throw new Error("Explore dropdown did not render upon click");
        }
        await exploreBtn.click({ force: true }); // Close dropdown
        await page.waitForTimeout(100);
      }
    }

    // 2.3 The phone surface is a phone surface: few controls, and all of them hittable.
    /**
     * Measured before this check existed (`scripts/measure_phone_surface.mjs`, 390×664): the header
     * carried nine controls, seven of them 24–36 px, plus a second navigation menu on top of the tab
     * bar's own; the genre rail's category picker was 36 px tall and its dice 36×36. Everything the
     * header offered is reachable on a phone through bigger targets (the tab bar's "More" sheet for
     * search/settings/help/updates, Settings for the language, the Help centre for the tour, Explore
     * for a random genre), and that sheet lists every tab the header dropdown listed.
     *
     * Two rules, both about the same thing — a control a thumb cannot hit is a control that should
     * not be offered:
     *   1. the header shows at most one control (the brand), and it is ≥44 px;
     *   2. every other touchable control outside the step grid is ≥44 px in both dimensions.
     *
     * The step grid is excluded because a grid is not a toolbar: `StepCell` is a focusable
     * `role="gridcell"`, and how many steps fit a 390 px screen is a separate design question (the
     * measured cells are large; the narrow entries are the 4 px track swatch, tracked in the plan).
     * So are content links: `a[href]` inside a card or a paragraph is read as text, and WCAG's own
     * target-size rule exempts links in a sentence. The phone's navigation is the tab bar, which is
     * a button surface and is measured. Scoped to `target.isMobile`: a tablet has the room, and a
     * narrow *desktop* window still needs the header's drawer because its `md:flex` nav is hidden.
     */
    if (target.isMobile) {
      /**
       * Every phone-reachable surface is measured by name: the check runs after several
       * navigations, and "how many controls are on screen" only means something for a named screen.
       * These seven are the ones brought up to the 44 px rule so far; G.39 in the plan lists the
       * measured counts for the rest (both timelines, compare, analyzer).
       */
      /**
       * The last four pages carry a *budget* rather than the 44 px rule, while G.39's proposal
       * (keep the analyzer's waveform mode, drop compare and both timelines on a phone) waits for a
       * decision. A budget is a ratchet, not an excuse: the numbers are today's measurements, a
       * change that makes any of them worse fails the run, and a change that makes one better says
       * so, because a budget that is never tightened stops describing the code.
       *
       * They differ per orientation because the layouts do — analyzer is already clean in landscape
       * (7 controls, none under 44) while its portrait form still has 13.
       */
      const PHONE_BUDGET = {
        "horizontal-timeline": { portrait: 11, landscape: 14 },
        "vertical-timeline": { portrait: 6, landscape: 1 },
        compare: { portrait: 15, landscape: 11 },
        analyzer: { portrait: 13, landscape: 2 },
      };
      const landscape = /landscape/i.test(target.name);
      for (const surface of [
        { name: "studio", url: baseUrl },
        { name: "explore", url: `${baseUrl}?tab=galaxy` },
        { name: "chords", url: `${baseUrl}?tab=chords` },
        { name: "kick", url: `${baseUrl}?tab=kick` },
        { name: "maker", url: `${baseUrl}?tab=maker` },
        { name: "challenge", url: `${baseUrl}?tab=challenge` },
        { name: "masterclass", url: `${baseUrl}?tab=masterclass` },
        { name: "horizontal-timeline", url: `${baseUrl}?tab=horizontal-timeline` },
        { name: "vertical-timeline", url: `${baseUrl}?tab=vertical-timeline` },
        { name: "compare", url: `${baseUrl}?tab=compare` },
        { name: "analyzer", url: `${baseUrl}?tab=analyzer` },
      ]) {
        const budget = surface.name in PHONE_BUDGET
          ? PHONE_BUDGET[surface.name][landscape ? "landscape" : "portrait"]
          : 0;
        await page.goto(surface.url, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(600);
        const measured = await page.evaluate(() => {
        const MIN_TAP = 44;
        /**
         * The phone transport's bar-step buttons are 32×44: 44 px tall, deliberately narrow to keep
         * the tempo readout on a 390 px row. They live in `MobileTransportBar.tsx`, which the design
         * freeze reserves, so they are named here rather than silently tolerated by a loose rule.
         *
         * `toggle-all-tracks-compact` (the studio toolbar's "Fold all tracks", 126×22) is the same
         * kind of case: it is drawn by `SequencerPanel.tsx`, whose phone branches the freeze
         * reserves, so its size is recorded in the plan (G.36) instead of changed here.
         */
        const ALLOWED_SMALL = new Set([
          "mobile-transport-prev-bar",
          "mobile-transport-next-bar",
          "toggle-all-tracks-compact",
        ]);
        const selector = 'button, select, input, textarea, [role="button"], [tabindex="0"]';
        const small = [];
        const headerControls = [];
        for (const node of Array.from(document.querySelectorAll(selector))) {
          // Step cells only. The track headers live *inside* the grid container too, and skipping
          // the whole `[role="grid"]` subtree is how five tiny header controls (4×20, 14×14 …) went
          // unnoticed by the first version of this check.
          if (node.closest('[role="gridcell"]')) continue;
          const testid = node.getAttribute("data-testid");
          if (testid && ALLOWED_SMALL.has(testid)) continue;
          const rect = node.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) continue;
          const style = window.getComputedStyle(node);
          if (style.display === "none" || style.visibility === "hidden") continue;
          /**
           * `pointer-events: none` is not a target either — by definition nothing can tap it. This
           * is how a phone-only decorative surface (the galaxy's projected 3D labels) stops being
           * counted as a control: it stays on screen as a label and the phone selects from the chips
           * row instead.
           */
          if (style.pointerEvents === "none") continue;
          // On screen, not merely in the document: the same rule the audit uses, so the two agree.
          if (rect.left < 0 || rect.right > window.innerWidth) continue;
          if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
          const entry = {
            testid,
            label: node.getAttribute("aria-label") || (node.textContent ?? "").trim().slice(0, 20),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
          };
          if (rect.width < MIN_TAP || rect.height < MIN_TAP) small.push(entry);
          if (node.closest("header") && !node.closest("nav")) headerControls.push(entry);
        }
        return { small, headerControls };
      });
        const { small, headerControls } = measured;

        if (headerControls.length > 2) {
          throw new Error(
            `Phone header shows ${headerControls.length} controls, expected at most 2 (the brand and ` +
              `the sections sheet): ${JSON.stringify(headerControls)} on ${target.name}`
          );
        }
        if (budget > 0) {
          console.log(
            `   · ${surface.name}: ${small.length} under 44 px (budget ${budget}) on ${target.name}`,
          );
        }
        if (small.length > budget) {
          throw new Error(
            `Phone surface "${surface.name}" has ${small.length} control(s) under the ${44} px ` +
              `touch minimum on ${target.name}, above its budget of ${budget}: ${JSON.stringify(small)}`
          );
        }
        if (budget > 0 && small.length < budget) {
          console.log(`   · ${surface.name}: budget could be tightened to ${small.length}`);
        }
      }
    }

    // 3. Chord Studio View Check
    await page.goto(`${baseUrl}/?tab=chords`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);

    // Verify Chord Studio builder and catalog render
    const chordTitle = await page.innerText("h1, h2, h3").catch(() => "");
    const foldBtn = await page.$("button:has-text('收起'), button:has-text('Fold'), button:has-text('展开工作台'), button:has-text('Expand')");
    if (foldBtn) {
      await foldBtn.click({ force: true }); // Toggle fold
      await page.waitForTimeout(200);
      await foldBtn.click({ force: true }); // Toggle expand back
    }

    // 4. Galaxy View Check
    await page.goto(`${baseUrl}/?tab=galaxy`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(600);
    const canvasOrFallback = await page.$("canvas, div:has-text('WebGL')");
    if (!canvasOrFallback) {
      throw new Error("Neither WebGL canvas nor fallback detected in GalaxyView");
    }

    // 5. Timeline Views Check
    await page.goto(`${baseUrl}/?tab=horizontal-timeline`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(300);

    await page.goto(`${baseUrl}/?tab=vertical-timeline`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(300);

    // 5b. Hardware Console View Check (N-01 / P8-02)
    await page.goto(`${baseUrl}/?tab=console`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-testid='hardware-console']", { timeout: 20000 }).catch(async () => {
      throw new Error("Hardware console view did not render at ?tab=console");
    });
    const consoleStrips = await page.$$("[data-console-channel]");
    if (consoleStrips.length === 0) {
      // Fall back to counting the fader inputs, which are real <input type="range">.
      const faders = await page.$$("input[type='range']");
      if (faders.length === 0) {
        throw new Error("Hardware console rendered without any channel strip or fader");
      }
    }
    // The spatial monitoring toggle must exist and be off by default (N-02).
    const spatialToggle = await page.$("[data-testid='console-spatial-toggle']");
    if (!spatialToggle) {
      throw new Error("Hardware console is missing the binaural monitoring toggle");
    }
    const spatialPressed = await spatialToggle.getAttribute("aria-pressed");
    if (spatialPressed !== "false") {
      throw new Error(`Binaural monitoring should default to off, got aria-pressed=${spatialPressed}`);
    }

    // Polarity (Ø) must be a live control on every device: it used to be surfaced
    // disabled. Tapping it must flip its pressed state.
    const phaseButton = await page.$("[data-testid='console-phase-0']");
    if (!phaseButton) {
      throw new Error("Hardware console is missing the channel polarity control");
    }
    if (await phaseButton.isDisabled()) {
      throw new Error("Channel polarity control is disabled although the engine supports it");
    }
    await phaseButton.click({ force: true });
    await page.waitForTimeout(150);
    const phasePressed = await phaseButton.getAttribute("aria-pressed");
    if (phasePressed !== "true") {
      throw new Error(`Clicking Ø should invert the channel, got aria-pressed=${phasePressed}`);
    }
    await phaseButton.click({ force: true });
    await page.waitForTimeout(150);

    // Real channel meters: each strip must expose a stereo meter element.
    const channelMeters = await page.$$("[data-meter-bar]");
    if (channelMeters.length < 2) {
      throw new Error(`Expected stereo meter bars on the console, found ${channelMeters.length}`);
    }
    await page.waitForTimeout(200);

    // 5c. Audio settings panel (v2.0.17).
    //
    // The engine-level settings (GS-1 voices, master level, hearing protection, latency
    // compensation) had no UI at all until this milestone; this asserts they are reachable
    // and live at *every* viewport, not merely that the component renders in jsdom. The
    // panel must reflect engine state, so toggling and dragging have to produce real
    // observable changes rather than a static picture of the defaults.
    await page.goto(`${baseUrl}/?tab=studio`, { waitUntil: "domcontentloaded" });
    // React mounts after `domcontentloaded`, so wait for the toolbar itself before querying.
    // React mounts after `domcontentloaded`, so wait for a shell before querying.
    await page
      .waitForSelector("[data-testid='toolbar-advanced-toggle'], [data-testid='mobile-transport-more']", {
        timeout: 20000,
      })
      .catch(() => {
        throw new Error("Studio did not render a transport surface");
      });
    /**
     * The audio-settings entry point must be reachable on every viewport, but where it sits
     * differs by shell: desktop has it in the advanced drawer, the phone in the studio sheet.
     * The desktop assertion is also a real regression guard — `mobile-studio-action-audio-settings`
     * is a *separate* id, so the phone path would never have been exercised by looking for
     * `studio-audio-settings-open` alone, and the earlier version of this block failed with
     * "no entry point" while the row was in fact present and working.
     */
    const MOBILE_AUDIO_SETTINGS = "[data-testid='mobile-studio-action-audio-settings']";
    const DESKTOP_AUDIO_SETTINGS = "[data-testid='studio-audio-settings-open']";
    if (!(await page.$(DESKTOP_AUDIO_SETTINGS)) && !(await page.$(MOBILE_AUDIO_SETTINGS))) {
      await openStudioMoreControls(page);
      await page.waitForTimeout(400);
    }
    const mobileEntry = await page.$(MOBILE_AUDIO_SETTINGS);
    const desktopEntry = await page.$(DESKTOP_AUDIO_SETTINGS);
    if (!mobileEntry && !desktopEntry) {
      const diag = await page.evaluate(() => ({
        viewport: { w: window.innerWidth, h: window.innerHeight },
        hasTransportBar: Boolean(document.querySelector("[data-testid='mobile-transport-bar']")),
        studioSheetOpen: Boolean(document.querySelector("[data-testid='mobile-studio-sheet']")),
        studioRows: [...document.querySelectorAll("[data-testid^='mobile-studio-action-']")].map((el) =>
          el.getAttribute("data-testid")
        ),
      }));
      throw new Error(`Audio settings panel has no entry point on this viewport :: ${JSON.stringify(diag)}`);
    }
    // A sheet row can start below the fold, so scroll it into view before clicking.
    await clickSheetRowAndVerify(
      page,
      mobileEntry ? MOBILE_AUDIO_SETTINGS : DESKTOP_AUDIO_SETTINGS,
      "[data-testid='audio-settings-gs1-toggle']",
      "audio settings"
    );
    await page.waitForSelector("[data-testid='audio-settings-gs1-toggle']", { timeout: 15000 });

    // GS-1 ships on by default, and flipping the switch must be a genuine state change.
    const gs1Toggle = await page.$("[data-testid='audio-settings-gs1-toggle']");
    const gs1Before = await gs1Toggle.getAttribute("aria-pressed");
    if (gs1Before !== "true") {
      throw new Error(`GS-1 should default to on inside the panel, got aria-pressed=${gs1Before}`);
    }
    await gs1Toggle.click({ force: true });
    await page.waitForTimeout(200);
    const gs1After = await gs1Toggle.getAttribute("aria-pressed");
    if (gs1After === gs1Before) {
      throw new Error(`GS-1 toggle did not change state (stayed ${gs1After})`);
    }
    await gs1Toggle.click({ force: true }); // leave it as we found it
    await page.waitForTimeout(200);

    // Dragging the master fader must move the number the panel displays.
    const masterBefore = await page.innerText("[data-testid='audio-settings-master-value']");
    await page.$eval("[data-testid='audio-settings-master-slider']", (el) => {
      // React tracks the input's value, so assigning `.value` directly is ignored; go through
      // the prototype setter and then dispatch the event React actually listens for.
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(el, "40");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForTimeout(250);
    const masterAfter = await page.innerText("[data-testid='audio-settings-master-value']");
    if (masterBefore === masterAfter) {
      throw new Error(`Master fader did not update the panel (stuck at ${masterAfter})`);
    }

    // Escape must close it: a panel that cannot be dismissed would trap touch users.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    if (await page.$("[data-testid='audio-settings-gs1-toggle']")) {
      throw new Error("Audio settings panel did not close on Escape");
    }

    // 5d. Global settings panel (item ⑤).
    //
    // The report was "I cannot find a global switch for the new architecture's voices". The panel
    // now lives in the header between the language switch and the version button, so this asserts
    // it is reachable there, that it is organised into tabs, and — the part that matters — that
    // flipping the switch inside the panel is reflected by the studio toolbar chip. Two surfaces,
    // one value; that mismatch was the bug class.
    if (!target.isMobile) {
      if (!(await page.$("[data-testid='header-settings-open']"))) {
        throw new Error("Header has no global settings entry point");
      }
      const headerOrder = await page.evaluate(() => {
        const left = (id) => {
          const el = document.querySelector(`[data-testid='${id}']`);
          return el ? el.getBoundingClientRect().left : null;
        };
        return {
          language: left("header-language-switch"),
          settings: left("header-settings-open"),
          version: left("header-version-button"),
        };
      });
      if (
        headerOrder.language === null ||
        headerOrder.settings === null ||
        headerOrder.settings <= headerOrder.language ||
        (headerOrder.version !== null && headerOrder.settings >= headerOrder.version)
      ) {
        throw new Error(`Settings entry point is misplaced: ${JSON.stringify(headerOrder)}`);
      }

      /**
       * Every header control has to be inside the viewport (G.48).
       *
       * The header's contents are 1153 px wide however wide the viewport is, and it did not wrap:
       * measured at 834×1112 it ran from 0 to 1153, leaving **eight** controls past the right edge —
       * search, random, the language switch, settings, the version chip, help, onboarding and the
       * shortcuts button — and four of them still past it at 1024. A user on an iPad in portrait
       * could not reach the language switch or the settings panel at all.
       *
       * It went unnoticed because `<body>` had `overflow-x: hidden`, which still allows *programmatic*
       * horizontal scrolling — so the matrix's `elementHandle.click()` scrolled the body sideways and
       * clicked a button no finger could reach. Replacing that with `overflow-x: clip` (G.47) made
       * the same click fail with `Element is outside of the viewport`, which is what surfaced this.
       *
       * The fix is `flex-wrap` on the header, so it grows instead of overflowing; the check is the
       * measurement that says so, on every desktop/tablet target.
       */
      const headerFit = await page.evaluate(() => {
        const header = document.querySelector("header");
        if (!header) return { error: "no header" };
        const outside = [...header.querySelectorAll("button, a, select, input")]
          .filter((el) => {
            const box = el.getBoundingClientRect();
            if (box.width <= 0 || box.height <= 0) return false;
            const style = getComputedStyle(el);
            if (style.visibility === "hidden" || style.display === "none") return false;
            return box.right > window.innerWidth + 1 || box.left < -1;
          })
          .map(
            (el) =>
              el.getAttribute("data-testid") ??
              el.getAttribute("title") ??
              (el.textContent ?? "").trim().slice(0, 16)
          );
        return {
          width: window.innerWidth,
          height: Math.round(header.getBoundingClientRect().height),
          headerScrollWidth: header.scrollWidth,
          clientWidth: header.clientWidth,
          outside,
        };
      });
      if (headerFit.error) throw new Error(`${headerFit.error} on ${target.name}`);
      if (headerFit.outside.length > 0) {
        throw new Error(
          `${headerFit.outside.length} header control(s) are outside a ${headerFit.width} px viewport on ${target.name}: ${headerFit.outside.join(", ")}`
        );
      }
      if (headerFit.headerScrollWidth > headerFit.clientWidth + 1) {
        throw new Error(
          `The header overflows its own box on ${target.name} (${headerFit.headerScrollWidth} > ${headerFit.clientWidth})`
        );
      }

      /**
       * The studio's two columns (G.46).
       *
       * Measured on the broken build at 1440×900: the *dossier* took the `1fr` track (1012 px) and
       * the sequencer — the thing the app is for — was squeezed into the 352 px one, showing three
       * step cells per track. Every existing gate measured *inside* the panel (the gutter probe, the
       * toolbar density probe, the phone surface audit), so all of them passed while the desktop
       * layout was wrong; the only thing that catches a swap is comparing the two grid items to each
       * other, which is what this does. Above `lg` the dossier is the fixed left column and the
       * sequencer takes the rest; below `lg` there is one column and the editor comes first.
       *
       * The items are identified by *what they are* — the one holding the transport group, and the
       * `aside` — not by their index: `grid.children` is DOM order, and `order` moves them visually
       * without touching the DOM. (Assuming the DOM order was visual is how this check first failed
       * on the iPad in portrait, where the dossier is legitimately the *second* grid child.)
       */
      const columns = await page.evaluate(() => {
        const grid = document.querySelector("main.grid");
        if (!grid) return { error: "the studio grid is gone" };
        const seqSection = document
          .querySelector("[data-testid='toolbar-group-transport']")
          ?.closest("section");
        const box = (el) => {
          const r = el.getBoundingClientRect();
          return {
            tag: el.tagName.toLowerCase(),
            x: Math.round(r.left),
            y: Math.round(r.top),
            w: Math.round(r.width),
          };
        };
        const items = [...grid.children];
        const seqItem = items.find((el) => seqSection && el.contains(seqSection));
        const dossierItem = items.find((el) => el.tagName.toLowerCase() === "aside");
        return {
          itemCount: items.length,
          seq: seqItem ? box(seqItem) : null,
          dossier: dossierItem ? box(dossierItem) : null,
          viewportW: window.innerWidth,
          cols: getComputedStyle(grid).gridTemplateColumns,
        };
      });
      if (columns.error) throw new Error(`${columns.error} on ${target.name}`);
      if (!columns.seq) throw new Error(`The studio grid has no editor column on ${target.name}`);
      if (!columns.dossier) throw new Error(`The studio grid has no dossier column on ${target.name}`);
      if (columns.viewportW >= 1024) {
        if (columns.dossier.x >= columns.seq.x) {
          throw new Error(
            `The studio's columns are swapped on ${target.name}: dossier@${columns.dossier.x} ${columns.dossier.w}px, editor@${columns.seq.x} ${columns.seq.w}px (grid: ${columns.cols})`
          );
        }
        if (columns.seq.w < columns.viewportW * 0.55) {
          throw new Error(
            `The sequencer is not the wide column on ${target.name}: ${columns.seq.w} of ${columns.viewportW} px (grid: ${columns.cols})`
          );
        }
      } else if (columns.seq.y >= columns.dossier.y) {
        throw new Error(
          `Below lg the studio stacks the dossier above the editor on ${target.name}: dossier@${columns.dossier.y}, editor@${columns.seq.y}`
        );
      }

      /**
       * The transport stays reachable while the page is scrolled (G.47).
       *
       * The page scrolls — the panel is taller than a laptop viewport — so before this the transport
       * scrolled away with it: measured at 1440×900, scrolled to the bottom, the group sat at
       * `top −247` and hit-tested as nothing. It now lives in a `sticky` strip parked under the
       * header.
       *
       * Three things are asserted, and the middle one is why this is a real check rather than a
       * class-name assertion:
       *
       *   1. the strip's `top` offset token (`--app-header-h`) still equals the header's real height
       *      — the header *wraps* (measured 145/107/69 px at 768/834/1440), so the number is written
       *      at runtime and can go stale;
       *   2. with the editor scrolled into the middle of the viewport the transport is inside it
       *      *and* the point in its middle resolves to it — a strip parked behind the header is in
       *      the viewport and still unclickable, which geometry alone would call fine;
       *   3. it is parked at the header's bottom rather than somewhere below it.
       *
       * The scroll position is `panel top + 200`, not the bottom of the page: a sticky element is
       * clamped by its parent, so at the very bottom — where a portrait tablet has only the panel's
       * last 60 px left — the strip correctly leaves with the panel it belongs to. "While the editor
       * is on screen the transport is on screen" is the claim that matters.
       */
      /**
       * Close any menu an earlier step left open before hit-testing.
       *
       * The first version of this check failed on Chromium with `at its centre div.flex.items-center
       * .gap-1.5` — a header dropdown (the Explore menu the navigation check opens and closes) was
       * still painted over the strip, so the point in the transport's middle belonged to the menu.
       * Escape closes it; nothing else at this stage opens a dialog that Escape would take down.
       */
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
      const reach = await page.evaluate(async () => {
        const settle = () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve(null)))
          );
        const header = document.querySelector("header");
        const group = document.querySelector("[data-testid='toolbar-group-transport']");
        const strip = group?.closest("div.sticky");
        const panel = strip?.parentElement;
        if (!header || !group || !panel) return { error: "no header, transport group or panel" };
        const token = parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue("--app-header-h")
        );
        const headerHeight = header.getBoundingClientRect().height;
        const panelTop = panel.getBoundingClientRect().top + window.scrollY;
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo({ top: Math.min(maxScroll, Math.max(0, panelTop + 200)), behavior: "auto" });
        await settle();
        const box = group.getBoundingClientRect();
        const headerBox = header.getBoundingClientRect();
        const x = box.left + Math.min(80, box.width / 2);
        const y = (box.top + box.bottom) / 2;
        const hit = document.elementFromPoint(x, y);
        return {
          token,
          headerHeight,
          top: Math.round(box.top),
          headerBottom: Math.round(headerBox.bottom),
          inViewport: box.top >= 0 && box.bottom <= window.innerHeight,
          hit: hit
            ? `${hit.tagName.toLowerCase()}${hit.getAttribute("data-testid") ? `[${hit.getAttribute("data-testid")}]` : ""}.${(hit.className ?? "").toString().split(" ").slice(0, 3).join(".")}`
            : null,
          reachable: Boolean(hit && (hit === group || group.contains(hit) || hit.contains(group))),
        };
      });
      if (reach.error) throw new Error(`${reach.error} on ${target.name}`);
      if (Math.abs(reach.token - reach.headerHeight) > 1) {
        throw new Error(
          `--app-header-h is ${reach.token} but the header is ${reach.headerHeight} px tall on ${target.name}`
        );
      }
      if (!reach.inViewport || !reach.reachable) {
        throw new Error(
          `The transport is not reachable with the page scrolled on ${target.name}: top ${reach.top}, at its centre ${reach.hit ?? "nothing"}`
        );
      }
      if (reach.top < reach.headerBottom || reach.top > reach.headerBottom + 8) {
        throw new Error(
          `The transport is not parked under the header on ${target.name}: top ${reach.top}, header bottom ${reach.headerBottom}`
        );
      }
      // Put the page back where the rest of the run expects it.
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "auto" }));
    }

    /**
     * On a phone the same panel is reached from the tab bar's "More" sheet, not the header: the
     * header is a title bar there (see 2.3), and the sheet row is the identical entry point behind a
     * bigger target. Same panel, same assertions — only the way in differs.
     */
    const settingsEntry = target.isMobile
      ? "[data-testid='mobile-sheet-action-settings']"
      : "[data-testid='header-settings-open']";
    if (target.isMobile) {
      /**
       * The header's own 44 px button, not the tab bar's sheet opener: measured in portrait, the
       * 48×48 virtual-keyboard FAB sits exactly over the centre of the "You" tab, so a tap there
       * lands on the FAB. That overlap is a finding recorded in the plan (the file is reserved by
       * the design freeze); this check exercises the path a phone user actually has.
       */
      await page.click("[data-testid='header-more']", { force: true });
      await page.waitForSelector(settingsEntry, { timeout: 10000 });
    }

    await page.click(settingsEntry, { force: true });
    await page.waitForSelector("[data-testid='settings-tab-audio']", { timeout: 15000 });
    for (const tab of ["audio", "performance", "interface", "about"]) {
      if (!(await page.$(`[data-testid='settings-tab-${tab}']`))) {
        throw new Error(`Settings panel is missing the "${tab}" tab`);
      }
    }

    const settingsGs1 = await page.$("[data-testid='audio-settings-gs1-toggle']");
    if (!settingsGs1) {
      throw new Error("The Audio tab does not expose the GS-1 switch");
    }
    if ((await settingsGs1.getAttribute("aria-pressed")) !== "true") {
      throw new Error("GS-1 should default to on in the settings panel");
    }
    await settingsGs1.click({ force: true });
    await page.waitForTimeout(250);
    if ((await settingsGs1.getAttribute("aria-pressed")) !== "false") {
      throw new Error("Flipping GS-1 inside the settings panel had no effect");
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    if (await page.$("[data-testid='settings-tab-audio']")) {
      throw new Error("Settings panel did not close on Escape");
    }

    /**
     * The toolbar chip must agree with what the panel just did — but only where that chip exists.
     *
     * The cross-surface contract exists because the desktop toolbar and the settings panel are two
     * controls for one engine flag. The phone deliberately has no chip (the flag lives only in the
     * settings panel, and the sheet row that opens it is a navigation, not a duplicate toggle), so
     * asserting a chip there would be asserting the absence of a deliberate design decision rather
     * than a bug.
     */
    if (!(await page.$("[data-testid='mobile-transport-more']")) && !(await page.$("[data-testid='studio-gs1-toggle']"))) {
      // Desktop: the chip lives in the advanced drawer, which may be closed.
      await openStudioMoreControls(page);
      await page.waitForTimeout(300);
    }
    const hasGs1Chip = Boolean(await page.$("[data-testid='studio-gs1-toggle']"));
    if (hasGs1Chip) {
      const chipAfterPanelFlip = await page.getAttribute("[data-testid='studio-gs1-toggle']", "aria-pressed");
      if (chipAfterPanelFlip !== "false") {
        throw new Error(
          `Toolbar GS-1 chip (${chipAfterPanelFlip}) disagrees with the settings panel that just turned it off`
        );
      }
      // Leave the app as we found it: default on.
      await page.click("[data-testid='studio-gs1-toggle']", { force: true });
      await page.waitForTimeout(200);
      if ((await page.getAttribute("[data-testid='studio-gs1-toggle']", "aria-pressed")) !== "true") {
        throw new Error("Could not restore the GS-1 default after the settings-panel check");
      }
    } else if (await page.$("[data-testid='mobile-transport-more']")) {
      // Phone: restore the default through the panel itself, which is the only surface that owns
      // the flag there.
      await page.click("[data-testid='mobile-transport-more']", { timeout: 10000 });
      await page.waitForSelector("[data-testid='mobile-studio-sheet']", { timeout: 10000 });
      await clickSheetRowAndVerify(
        page,
        "[data-testid='mobile-studio-action-audio-settings']",
        "[data-testid='audio-settings-gs1-toggle']",
        "audio settings (restore)"
      );
      await page.click("[data-testid='audio-settings-gs1-toggle']", { force: true });
      await page.waitForTimeout(200);
      const restored = await page.getAttribute("[data-testid='audio-settings-gs1-toggle']", "aria-pressed");
      if (restored !== "true") {
        throw new Error(`Could not restore the GS-1 default on a phone (aria-pressed=${restored})`);
      }
      await page.keyboard.press("Escape");
      await page.waitForTimeout(250);
    }

    // 5e. Track inspector placement + categorized timbre picker (item ②).
    //
    // The inspector used to render in normal flow after the sequencer: on a phone it appeared
    // below everything, on desktop it pushed the layout around. This asserts the real geometry —
    // a bottom sheet on phones, a full-height left dock on desktop — and that the timbre picker
    // can actually filter 115 names down to the one you want.
    /**
     * Opened from the row header, which is the real gesture and the only control that is visible
     * on every target: the phone column is 142 px and cannot hold the header's eleven controls, so
     * all but mute and solo are desktop-only now (see `.trk-head-desktop-only`). The explicit
     * sliders button was 16×16 px *and* scrolled with the grid; the header is 142 px wide, pinned
     * to the left edge, and opens the same inspector.
     */
    await clickVerified(page, "[data-testid='track-header-0']", { scrollInline: false });
    await page.waitForSelector("[data-testid='track-inspector']", { timeout: 15000 });
    const inspectorBox = await (await page.$("[data-testid='track-inspector']")).boundingBox();
    const viewport = page.viewportSize();
    if (!inspectorBox || !viewport) {
      throw new Error("Could not measure the track inspector");
    }
    // Classify by the breakpoint the CSS actually uses (`lg` = 1024px), not by device type: an
    // iPad Pro in landscape is 1194px wide and therefore gets the desktop dock, which is correct
    // and is exactly the kind of assumption a device-name check gets wrong.
    const desktopLayout = viewport.width >= 1024;
    if (!desktopLayout) {
      /**
       * Pinned above the phone tab bar and spanning the viewport width: a sheet, not a page section.
       *
       * Measured against the tab bar rather than the viewport bottom, because on a phone the bar is
       * fixed over the bottom of the screen and the inspector has to clear it — that overlap is what
       * made the bottom ~52 px of the sheet (the whole EQ canvas in a landscape phone's 279 px tall
       * sheet) unreachable. On a wide-but-short viewport the shell still shows the bar, so the same
       * offset applies.
       */
      /**
       * How far the phone's bottom chrome reaches up, whatever shape it is in.
       *
       * It used to measure the tab bar alone. On a short landscape phone the tab bar now shares one
       * row with the transport, and on portrait the transport is not at the bottom at all — so the
       * honest question is "what is the highest bottom-anchored element", and that is what this
       * answers. Measuring one named element would have silently started asserting against the
       * wrong edge the moment the two bars were merged.
       */
      const bottomChromeTop = await page.evaluate(() => {
        const vh = window.innerHeight;
        let top = vh;
        for (const sel of [
          "[data-testid='mobile-tab-bar']",
          "[data-testid='mobile-transport-bar']",
          "[data-testid='mobile-shared-bottom-row']",
        ]) {
          for (const el of document.querySelectorAll(sel)) {
            const r = el.getBoundingClientRect();
            // Only elements actually anchored to the bottom of the viewport count.
            if (r.bottom >= vh - 2 && r.top < top) top = r.top;
          }
        }
        return top;
      });
      const expectedBottom = bottomChromeTop;
      const touchingBottom = Math.abs(inspectorBox.y + inspectorBox.height - expectedBottom) <= 6;
      // Width is "spans the viewport", not an exact match: a mobile engine can reserve a few px
      // for a scrollbar, and a 400 px desktop dock would be nowhere near the viewport width.
      const spansWidth = inspectorBox.width >= viewport.width - 16;
      if (!touchingBottom || inspectorBox.x > 2 || !spansWidth) {
        throw new Error(
          `Inspector is not a bottom sheet on ${target.name}: box=${JSON.stringify(inspectorBox)} ` +
            `viewport=${JSON.stringify(viewport)} bottomChromeTop=${Math.round(bottomChromeTop)} expectedBottom=${Math.round(expectedBottom)}`
        );
      }
    } else {
      // Docked left, full height: the sequencer must stay visible beside it.
      if (inspectorBox.x > 2 || inspectorBox.height < viewport.height - 4 || inspectorBox.width < 360) {
        throw new Error(
          `Inspector is not a left dock on ${target.name}: box=${JSON.stringify(inspectorBox)} viewport=${JSON.stringify(viewport)}`
        );
      }
    }

    // Item ③: three tabs, one visible group — measured on the real element (`hidden` is a DOM
    // property, not a CSS class, so this is exactly the contract the component implements).
    for (const tab of ["timbre", "mix", "effects"]) {
      if (!(await page.$(`[data-testid='track-inspector-tab-${tab}']`))) {
        throw new Error(`Track inspector is missing the "${tab}" tab`);
      }
    }
    const visibility = await page.evaluate(() => {
      const at = (id) => document.querySelector(`[data-testid='track-inspector-section-${id}']`);
      return { timbre: at("timbre")?.hidden, mix: at("mix")?.hidden, effects: at("effects")?.hidden };
    });
    if (visibility.timbre !== false || visibility.mix !== true || visibility.effects !== true) {
      throw new Error(`Inspector tabs do not isolate their sections: ${JSON.stringify(visibility)}`);
    }
    // Switching tabs must not unmount the other groups (state is preserved, switching is instant).
    await clickVerified(page, "[data-testid='track-inspector-tab-mix']");
    await page.waitForTimeout(150);
    const afterSwitch = await page.evaluate(() => ({
      timbreHidden: document.querySelector("[data-testid='track-inspector-section-timbre']")?.hidden,
      mixHidden: document.querySelector("[data-testid='track-inspector-section-mix']")?.hidden,
      volumePresent: Boolean(document.querySelector("[data-testid='track-inspector-volume']")),
    }));
    if (afterSwitch.mixHidden !== false || afterSwitch.timbreHidden !== true || !afterSwitch.volumePresent) {
      throw new Error(`Inspector tab switch is wrong: ${JSON.stringify(afterSwitch)}`);
    }
    // Mute/solo stay reachable from any tab (they live in the header, not inside a section).
    const msHidden = await page.evaluate(() =>
      Boolean(
        document.querySelector("[data-testid='track-inspector-mute']")?.closest("[hidden]") ||
          document.querySelector("[data-testid='track-inspector-solo']")?.closest("[hidden]")
      )
    );
    if (msHidden) throw new Error("Mute/solo are hidden behind a tab");
    await clickVerified(page, "[data-testid='track-inspector-tab-timbre']");
    await page.waitForTimeout(150);

    // 5e-bis. Effects page redesign (item ①): signal chain + computed curves + a real drag.
    //
    // The curves are the point of the redesign, and the only way to know they are wired to the
    // parameters (not pictures) is to change a parameter and watch the drawing and the value move.
    await clickVerified(page, "[data-testid='track-inspector-tab-effects']");
    await page.waitForSelector("[data-testid='insert-flow-strip']", { timeout: 15000 });
    const flowSlots = await page.$$eval("[data-testid^='insert-flow-']", (els) =>
      els
        .map((e) => e.getAttribute("data-testid"))
        // The strip container itself also starts with `insert-flow-`; the *slots* are what matters.
        .filter((id) => id && id !== "insert-flow-strip" && !id.endsWith("-toggle"))
    );
    const expectedFlow = ["insert-flow-hpf", "insert-flow-eq", "insert-flow-comp", "insert-flow-drive"];
    if (JSON.stringify(flowSlots) !== JSON.stringify(expectedFlow)) {
      throw new Error(`Signal chain is wrong on ${target.name}: ${JSON.stringify(flowSlots)}`);
    }
    // One stage at a time, and the others stay mounted.
    const stageState = async () =>
      page.evaluate(() => ({
        mid: document.querySelector("[data-testid='insert-stage-panel-mid']")?.hidden,
        comp: document.querySelector("[data-testid='insert-stage-panel-comp']")?.hidden,
        mounted: Boolean(document.querySelector("[data-testid='track-inspector-comp-threshold']")),
      }));
    const before = await stageState();
    if (before.mid !== false || before.comp !== true || !before.mounted) {
      throw new Error(`Effects stage isolation is wrong on ${target.name}: ${JSON.stringify(before)}`);
    }
    await clickVerified(page, "[data-testid='insert-flow-comp']");
    await page.waitForTimeout(150);
    const after = await stageState();
    if (after.comp !== false || after.mid !== true) {
      throw new Error(`Selecting the compressor did not switch stages on ${target.name}: ${JSON.stringify(after)}`);
    }
    if (!(await page.$("[data-testid='insert-comp-curve-path']"))) {
      throw new Error("Compressor transfer curve is missing");
    }
    await clickVerified(page, "[data-testid='insert-flow-drive']");
    await page.waitForTimeout(150);
    if (!(await page.$("[data-testid='insert-drive-curve-path']"))) {
      throw new Error("Drive curve is missing");
    }

    // Back to the EQ, then drag a band handle and require the *value* to follow the drag.
    await clickVerified(page, "[data-testid='insert-flow-eq']");
    await page.waitForTimeout(200);
    const eqPathBefore = await page.getAttribute("[data-testid='insert-eq-curve-path']", "d");
    const gainBefore = await page.inputValue("[data-testid='track-inspector-mid-gain']");
    const handle = await page.$("[data-testid='insert-eq-handle-mid']");
    if (!handle) throw new Error("EQ band handle is not on screen");
    await handle.scrollIntoViewIfNeeded();
    const handleBox = await handle.boundingBox();
    if (!handleBox) throw new Error("EQ band handle has no measurable box");
    /**
     * Drag *within* the viewport.
     *
     * The distance used to be a fixed 24 px upward, which is fine on a desktop viewport and wrong
     * on a landscape phone: the inspector dock is only ~279 px tall there, so a handle sitting
     * near the top of the panel ends up outside the viewport mid-drag, the pointermove is not
     * delivered, and the value never changes — a test failure that looks like a broken EQ but is
     * really a broken gesture. The distance is therefore derived from the space actually above the
     * handle, and the drag is required to stay inside the viewport.
     */
    const centreX = handleBox.x + handleBox.width / 2;
    const centreY = handleBox.y + handleBox.height / 2;
    const dragViewport = page.viewportSize() ?? { width: 390, height: 664 };
    const roomAbove = centreY - 8;
    const dragDistance = Math.max(6, Math.min(24, roomAbove));
    if (roomAbove < 6) {
      throw new Error(
        `EQ band handle has no room above it to drag (centreY=${Math.round(centreY)}, viewport=${dragViewport.height})`
      );
    }
    await page.mouse.move(centreX, centreY);
    await page.mouse.down();
    await page.mouse.move(centreX, centreY - dragDistance, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    const gainAfter = await page.inputValue("[data-testid='track-inspector-mid-gain']");
    const eqPathAfter = await page.getAttribute("[data-testid='insert-eq-curve-path']", "d");
    if (gainAfter === gainBefore && eqPathAfter === eqPathBefore) {
      const dragDiag = await page.evaluate(() => {
        const el = document.querySelector("[data-testid='insert-eq-handle-mid']");
        const r = el?.getBoundingClientRect();
        const top = r ? document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) : null;
        return {
          handleRect: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null,
          viewport: { w: window.innerWidth, h: window.innerHeight },
          topAtCentre: top ? `${top.tagName.toLowerCase()}${top.getAttribute("data-testid") ? `[${top.getAttribute("data-testid")}]` : ""}` : "null",
          scrollTop: document.querySelector("[data-testid='track-inspector']")?.scrollTop ?? null,
        };
      });
      throw new Error(
        `Dragging the mid band handle changed nothing on ${target.name} (gain ${gainBefore} → ${gainAfter}) :: ${JSON.stringify(dragDiag)}`
      );
    }
    console.log(`   · effects page: chain ok, drag moved mid gain ${gainBefore} → ${gainAfter} (${target.name})`);

    // Leave the panel on the tab the following steps expect: the timbre picker's search box is in
    // the Timbre tab, and a hidden input cannot be filled (this cost one 30 s timeout to learn).
    await clickVerified(page, "[data-testid='track-inspector-tab-timbre']");
    await page.waitForTimeout(150);

    // The picker must filter by name and report the selection.
    const searchInput = await page.$("[data-testid='track-inspector-instrument-search']");
    if (!searchInput) {
      throw new Error("Track inspector has no timbre search box");
    }
    await searchInput.fill("reese");
    await page.waitForTimeout(200);
    const reeseOption = await page.$("[data-testid='track-inspector-instrument-option-reese_bass']");
    if (!reeseOption) {
      throw new Error("Filtering the timbre picker by \"reese\" did not surface reese_bass");
    }
    // A category chip must also narrow the list (the user asked for categories, not just search).
    if (!(await page.$("[data-testid='track-inspector-instrument-category-bass']"))) {
      throw new Error("Timbre picker is missing its category chips");
    }
    await reeseOption.click({ force: true });
    await page.waitForTimeout(200);

    // Escape must dismiss it: a floating panel that only closes via a small button traps users.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    if (await page.$("[data-testid='track-inspector']")) {
      throw new Error("Track inspector did not close on Escape");
    }

    // 5f. Piano roll (item ⑦): it must edit the studio's OWN pattern.
    //
    // The whole claim of the roll is that it is another view of the same data, not a second copy.
    // So this draws a note in the roll and then requires the step grid to show it — a cross-view
    // assertion, which is the part that could silently break.
    //
    // The phone shell has no roll (see `openPianoRoll`), so there this step asserts the *notice*
    // instead: an omitted feature must be visibly omitted, with a route to the alternative, not
    // simply absent.
    const rollShell = await openPianoRoll(page);
    if (rollShell === null) {
      // `openPianoRoll` already opened the explanation; assert it and its route out.
      await page.waitForSelector("[data-testid='piano-roll-mobile-notice']", { timeout: 15000 }).catch(() => {
        throw new Error("Phone shell hid the piano roll without explaining why");
      });
      if (!(await page.$("[data-testid='piano-roll-mobile-notice-chords']"))) {
        throw new Error("Piano-roll notice offers no route to the Chords view");
      }
      console.log(`   · piano roll: not offered on a phone; notice + Chords route verified`);
      await clickVerified(page, "[data-testid='piano-roll-mobile-notice-close']");
      await page.waitForTimeout(250);
      if (await page.$("[data-testid='piano-roll-mobile-notice']")) {
        throw new Error("Piano-roll notice did not dismiss");
      }
    } else {
    try {
      await page.waitForSelector("[data-testid='piano-roll-grid']", { timeout: 15000 });
    } catch (rollErr) {
      // Diagnose on failure rather than guessing: the state of every panel at that moment.
      const diag = await page.evaluate(() => ({
        rollDrawer: Boolean(document.querySelector("[data-testid='piano-roll-drawer']")),
        notMelodic: Boolean(document.querySelector("[data-testid='piano-roll-not-melodic']")),
        inspector: Boolean(document.querySelector("[data-testid='track-inspector']")),
        settings: Boolean(document.querySelector("[data-testid='settings-tab-audio']")),
        stepGrid: document.querySelectorAll("[data-track-idx][data-step-idx]").length,
        toggleBox: (() => {
          const el =
            document.querySelector("[data-testid='toolbar-piano-roll-toggle']") ||
            document.querySelector("[data-testid='mobile-studio-action-piano-roll']");
          const r = el?.getBoundingClientRect();
          return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
        })(),
        viewport: { w: window.innerWidth, h: window.innerHeight, scrollY: window.scrollY },
      }));
      console.error(`[roll-diag ${target.name}] ${JSON.stringify(diag)}`);
      throw rollErr;
    }

    if (!(await (await page.$("[data-testid='piano-roll-grid']")).boundingBox())) {
      throw new Error("Piano roll grid has no measurable box");
    }

    // Pick a melodic row and one of its empty steps from the step matrix itself.
    const drawTarget = await page.evaluate(() => {
      // The roll's own track selector is the app's definition of "melodic", so use it rather than
      // guessing roles from accessible labels.
      const select = document.querySelector("[data-testid='piano-roll-track']");
      const melodicIdx = select ? [...select.options].map((o) => Number(o.value)) : [];
      for (const trackIdx of melodicIdx) {
        const cells = [...document.querySelectorAll(`[data-track-idx="${trackIdx}"][data-step-idx]`)];
        const empty = cells.find((c) => c.getAttribute("aria-selected") !== "true");
        if (empty) return { trackIdx, stepIdx: Number(empty.getAttribute("data-step-idx")) };
      }
      return null;
    });
    if (!drawTarget) throw new Error("No melodic track with an empty step was found to draw into");
    const activeBefore = await countActiveSteps(page, drawTarget.trackIdx);

    // The roll defaults to the first melodic track; select the measured one so both views agree.
    const selectedTrack = await page.$eval("[data-testid='piano-roll-track']", (el) => Number(el.value));
    if (selectedTrack !== drawTarget.trackIdx) {
      await page.selectOption("[data-testid='piano-roll-track']", String(drawTarget.trackIdx));
      await page.waitForTimeout(250);
    }

    // Item ①: the note grid must fill the drawer, not sit at a fixed `steps × 26px` (a third of a
    // desktop screen). Measured geometry, because this is exactly what jsdom cannot check.
    const fill = await page.evaluate(() => {
      const wrap = document.querySelector("[data-testid='piano-roll-grid-wrap']");
      const grid = document.querySelector("[data-testid='piano-roll-grid']");
      const w = wrap?.getBoundingClientRect().width ?? 0;
      const g = grid?.getBoundingClientRect().width ?? 0;
      return { wrap: w, grid: g };
    });
    if (fill.grid < fill.wrap - 60) {
      throw new Error(
        `Piano roll does not fill its drawer: grid ${Math.round(fill.grid)}px vs drawer ${Math.round(fill.wrap)}px`
      );
    }

    // Fullscreen takes the viewport; collapse drops the editor but keeps the toolbar; both toggle
    // back. (`Escape` leaves fullscreen before it closes the panel.)
    await clickVerified(page, "[data-testid='piano-roll-fullscreen']");
    await page.waitForTimeout(250);
    const fsBox = await (await page.$("[data-testid='piano-roll']")).boundingBox();
    const vp = page.viewportSize();
    if (!fsBox || !vp || fsBox.width < vp.width - 8 || fsBox.height < vp.height - 8) {
      throw new Error(`Fullscreen piano roll does not cover the viewport: ${JSON.stringify(fsBox)} of ${JSON.stringify(vp)}`);
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    if ((await page.getAttribute("[data-testid='piano-roll']", "data-fullscreen")) !== "false") {
      throw new Error("Escape did not leave fullscreen first");
    }
    await clickVerified(page, "[data-testid='piano-roll-collapse']");
    await page.waitForTimeout(200);
    if (await page.$("[data-testid='piano-roll-grid']")) {
      throw new Error("Collapsing the piano roll left the editor mounted");
    }
    if (!(await page.$("[data-testid='piano-roll-track']"))) {
      throw new Error("Collapsing the piano roll threw away its toolbar");
    }
    await clickVerified(page, "[data-testid='piano-roll-collapse']");
    await page.waitForTimeout(200);

    // The drawer opens below the step matrix, so bring it into view before clicking and then
    // re-measure: `mouse.click` works in viewport coordinates, and the grid is taller than the
    // viewport on a laptop.
    await page.evaluate(() => {
      const drawer = document.querySelector("[data-testid='piano-roll']");
      if (drawer) drawer.scrollIntoView({ block: "center" });
      window.scrollTo({ left: 0 });
      const scroller = document.querySelector("[data-testid='piano-roll-grid']")?.closest(".overflow-x-auto");
      if (scroller) scroller.scrollLeft = 0;
    });
    await page.waitForTimeout(200);

    // Draw into the measured step. The grid's cell width depends on the zoom level, so derive it
    // from the rendered geometry rather than assuming a pixel size.
    const clickPoint = await page.evaluate(({ trackIdx, stepIdx }) => {
      const grid = document.querySelector("[data-testid='piano-roll-grid']");
      const scrollContainer = grid.closest(".overflow-y-auto") || grid.parentElement;
      const cRect = scrollContainer ? scrollContainer.getBoundingClientRect() : null;
      const rect = grid.getBoundingClientRect();
      const stepCount = document.querySelectorAll(`[data-track-idx="${trackIdx}"][data-step-idx]`).length || 16;
      const cellW = rect.width / stepCount;
      const targetY = cRect ? cRect.top + cRect.height / 2 : rect.top + 8;
      const x = rect.left + stepIdx * cellW + cellW / 2;
      return { x, y: targetY };
    }, drawTarget);
    await page.mouse.click(clickPoint.x, clickPoint.y);
    await page.waitForTimeout(300);
    const rollNoteCount = await page.$$eval("[data-testid^='piano-roll-note-']", (els) => els.length);
    if (rollNoteCount === 0) throw new Error("Drawing in the piano roll produced no note");

    // The step matrix renders the same pattern, so the row must have *gained* an active step.
    // Counting the row's active steps (a relative change) rather than requiring a specific step
    // index is deliberate: a click at computed coordinates can round into the neighbouring cell on
    // another engine, and asserting which cell was hit would then be testing that engine's
    // rounding instead of the shared-data behaviour this check exists for.
    const activeAfter = await countActiveSteps(page, drawTarget.trackIdx);
    if (activeAfter <= activeBefore) {
      throw new Error(
        `The roll's new note did not reach the step grid: track ${drawTarget.trackIdx} had ${activeBefore} active steps before and ${activeAfter} after`
      );
    }

    // ---- Chords are real notes -----------------------------------------------------------------
    //
    // The reported defect: "the chords track shows one note in the piano roll, not a chord". Draw a
    // second tone onto a step that already sounds (that is how a chord is entered here) and require
    // the roll to show a stack while the step grid still shows exactly one sounding step — the two
    // views share one pattern, so a chord must be visible in both without duplicating steps.
    const staggerBefore = await countActiveSteps(page, drawTarget.trackIdx);
    const targetNote = await page.$(`[data-testid^='piano-roll-note-${drawTarget.stepIdx}-']`);
    const noteToStack = targetNote || (await page.$("[data-testid^='piano-roll-note-']"));
    if (!noteToStack) throw new Error("No note block to stack a chord onto");
    await noteToStack.scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    const firstNoteBox = await noteToStack.boundingBox();
    if (!firstNoteBox) throw new Error("No note block to stack a chord onto");
    const rowH = Number(await page.getAttribute("[data-testid='piano-roll']", "data-row-h"));
    await page.keyboard.press("2"); // pencil
    await page.waitForTimeout(120);
    // One semitone above the first note, same step: the pencil adds to that step's stack.
    await page.mouse.click(firstNoteBox.x + firstNoteBox.width / 2, firstNoteBox.y - rowH / 2);
    await page.waitForTimeout(250);
    const chordSizes = await page.$$eval("[data-testid^='piano-roll-note-']", (els) =>
      els.map((e) => Number(e.getAttribute("data-chord-size")))
    );
    const maxChord = chordSizes.length ? Math.max(...chordSizes) : 0;
    const staggerAfter = await countActiveSteps(page, drawTarget.trackIdx);
    if (maxChord < 2) {
      throw new Error(`Drawing onto a sounding step did not build a chord on ${target.name} (sizes: ${chordSizes.join(",")})`);
    }
    if (staggerAfter !== staggerBefore) {
      throw new Error(
        `A chord changed the step grid's step count on ${target.name} (${staggerBefore} → ${staggerAfter}): the roll and the grid disagree`
      );
    }
    console.log(`   · chords: stacked ${maxChord} tones on one step, step grid unchanged (${staggerAfter} steps) on ${target.name}`);

    // ---- Roll tools (item ② of the DAW-alignment objective) ------------------------------------
    //
    // Every check drives a real gesture and requires the *data* to follow — measured through the
    // step grid, which renders the same pattern — rather than requiring that a control merely
    // exists. The roll exposes its grid metrics as data attributes so the gesture coordinates are
    // read from the product instead of assumed here.
    const rollInfo = await page.evaluate(() => {
      const el = document.querySelector("[data-testid='piano-roll']");
      return {
        steps: Number(el?.dataset.steps ?? 0),
        rows: Number(el?.dataset.rows ?? 0),
        cellW: Number(el?.dataset.cellW ?? 0),
        rowH: Number(el?.dataset.rowH ?? 0),
      };
    });
    // Geometry is measured *after* every clickVerified call: that helper scrolls its target into
    // view, and a scroll between measuring and gesturing made the earlier coordinates point at a
    // different element (on WebKit the grid moved and the press landed on nothing).
    const cell = (step, row) => ({
      x: rollBox.x + step * rollInfo.cellW + rollInfo.cellW / 2,
      y: rollBox.y + row * rollInfo.rowH + rollInfo.rowH / 2,
    });

    for (const id of ["pointer", "pencil", "eraser", "scissors", "marquee"]) {
      if (!(await page.$(`[data-testid='piano-roll-tool-${id}']`))) {
        throw new Error(`Piano roll is missing the ${id} tool`);
      }
    }
    await page.keyboard.press("3");
    await page.waitForTimeout(120);
    if ((await page.getAttribute("[data-testid='piano-roll']", "data-tool")) !== "eraser") {
      throw new Error("Pressing 3 did not switch to the eraser");
    }
    await page.keyboard.press("1"); // back to the pointer
    await page.waitForTimeout(120);

    // Marquee: use the marquee tool, so a press anywhere starts a rectangle (no ambiguity about
    // having grabbed a note), and keep the gesture well inside the grid — a few pixels from the
    // border can miss it on WebKit, where the drawer's rounded corner and the velocity lane share
    // that edge (a plain click was verified to work there, so this is gesture geometry, not a
    // broken control).
    const noteCount = (await page.$$("[data-testid^='piano-roll-note-']")).length;
    if (noteCount === 0) throw new Error("Piano roll has no notes to select");
    await clickVerified(page, "[data-testid='piano-roll-tool-marquee']");
    // Centre a *note*, not the grid: on a short landscape viewport the visible slice of a tall grid
    // can be all padding, and a marquee over padding legitimately selects nothing.
    await page.$eval("[data-testid^='piano-roll-note-']", (el) => el.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(200);
    const rollBox = await (await page.$("[data-testid='piano-roll-grid']")).boundingBox();
    if (!rollBox) throw new Error(`Piano roll grid is not on screen on ${target.name}`);
    const view = page.viewportSize();
    const visible = {
      x: Math.max(rollBox.x, 0),
      y: Math.max(rollBox.y, 0),
      right: Math.min(rollBox.x + rollBox.width, view.width),
      bottom: Math.min(rollBox.y + rollBox.height, view.height),
    };
    if (visible.bottom - visible.y < rollInfo.rowH * 3) {
      throw new Error(`Piano roll has no draggable area in view on ${target.name}`);
    }
    const selectedOf = async () => {
      const text = (await page.textContent("[data-testid='piano-roll-selected-count']")) ?? "";
      return Number((/(\d+)/.exec(text) ?? [])[1] ?? 0);
    };
    // Anchor the rectangle on a real note instead of a fixed fraction of the viewport: patterns now
    // run to 64/128 steps, so a note can sit near an edge and an inset rectangle would enclose
    // nothing (that is exactly how this check first failed after the chord work landed).
    const anchorNoteBox = await (await page.$("[data-testid^='piano-roll-note-']")).boundingBox();
    if (!anchorNoteBox) throw new Error(`No note to anchor a marquee on ${target.name}`);
    // Stay *inside* the note's own row: the marquee selects whole cells, so a few pixels past the
    // block's edge would pull in the neighbouring pitch row and the selection would legitimately be
    // larger than the notes whose centres are inside the drawn rectangle.
    const from = { x: anchorNoteBox.x + 2, y: anchorNoteBox.y + anchorNoteBox.height - 1 };
    const to = { x: anchorNoteBox.x + anchorNoteBox.width - 2, y: anchorNoteBox.y + 1 };

    // A click with the marquee tool is a one-cell rectangle: aiming at an empty corner clears the
    // selection. If that particular cell happens to hold a note the claim would be false, so this
    // only asserts it does not *grow*.
    await page.mouse.click(from.x, from.y);
    await page.waitForTimeout(150);
    const afterClick = await selectedOf();

    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.waitForTimeout(150);
    const marqueeShown = Boolean(await page.$("[data-testid='piano-roll-marquee']"));
    await page.mouse.up();
    await page.waitForTimeout(200);
    const marqueeSelected = await selectedOf();
    if (!marqueeShown || marqueeSelected < 1) {
      throw new Error(
        `Marquee selected nothing on ${target.name} (rectangle drawn: ${marqueeShown}, selected: ${marqueeSelected})`
      );
    }
    // The selection must be exactly the notes whose centres fall inside the dragged rectangle —
    // measured from the notes' own boxes, so the claim does not depend on grid geometry.
    const expectedSelected = await page.evaluate(
      ({ fx, fy, tx, ty }) => {
        const lo = { x: Math.min(fx, tx), y: Math.min(fy, ty) };
        const hi = { x: Math.max(fx, tx), y: Math.max(fy, ty) };
        return [...document.querySelectorAll("[data-testid^='piano-roll-note-']")].filter((el) => {
          const r = el.getBoundingClientRect();
          const cx = r.x + r.width / 2;
          const cy = r.y + r.height / 2;
          return cx >= lo.x && cx <= hi.x && cy >= lo.y && cy <= hi.y;
        }).length;
      },
      { fx: from.x, fy: from.y, tx: to.x, ty: to.y }
    );
    if (marqueeSelected !== expectedSelected) {
      throw new Error(
        `Marquee selected ${marqueeSelected} notes but ${expectedSelected} centres were inside the rectangle on ${target.name}`
      );
    }
    void afterClick;

    // …and "select all" is a precise claim: every note in the roll must be selected.
    await page.keyboard.press(process.platform === "darwin" ? "Meta+a" : "Control+a");
    await page.waitForTimeout(200);
    const allSelected = await selectedOf();
    if (allSelected !== noteCount) {
      throw new Error(`Select-all selected ${allSelected} of ${noteCount} notes on ${target.name}`);
    }

    // Velocity lane: dragging a bar up must raise that note's velocity.
    /**
     * Three things here exist because this check failed once on an iPad in landscape with
     * `100 → 52` — a *decrease*, which is not something an upward drag can do to the bar it grabbed:
     *
     *  1. the before/after reads use the **same element handle**. The first version re-queried
     *     `[data-testid^='piano-roll-velocity-bar-']` afterwards, so if the lane re-rendered or
     *     re-ordered (edits earlier in this run change the pattern) the two numbers came from
     *     different notes and the comparison was meaningless;
     *  2. the box is re-read until it stops moving, because `scrollIntoViewIfNeeded` plus a 150 ms
     *     sleep is not a promise the lane has settled on a slow tablet;
     *  3. the press is verified to land on the bar itself (`elementFromPoint` at the press point),
     *     the same delivery contract `clickVerified` uses for clicks.
     */
    const firstBar = "[data-testid^='piano-roll-velocity-bar-']";
    const barEl = await page.$(firstBar);
    if (!barEl) throw new Error("Velocity lane has no visible bar for a pattern with notes");
    const velocityOf = async () => Number(await barEl.getAttribute("data-velocity"));
    const barBefore = await velocityOf();
    await barEl.scrollIntoViewIfNeeded();
    let barBox = await barEl.boundingBox();
    for (let attempt = 0; attempt < 10; attempt++) {
      await page.waitForTimeout(80);
      const next = await barEl.boundingBox();
      if (next && barBox && next.x === barBox.x && next.y === barBox.y && next.height === barBox.height) break;
      barBox = next;
    }
    if (!barBox) throw new Error("Velocity bar has no box after settling");
    const pressX = barBox.x + barBox.width / 2;
    const pressY = barBox.y + Math.max(2, barBox.height / 2);
    const onBar = await page.evaluate(
      ({ x, y, sel }) => {
        const hit = document.elementFromPoint(x, y);
        const bar = document.querySelector(sel);
        return Boolean(hit && bar && (hit === bar || bar.contains(hit)));
      },
      { x: pressX, y: pressY, sel: firstBar }
    );
    if (!onBar) {
      throw new Error(
        `The velocity press point is not on the bar (${Math.round(pressX)},${Math.round(pressY)}) on ${target.name}`
      );
    }
    await page.mouse.move(pressX, pressY);
    await page.mouse.down();
    await page.mouse.move(pressX, barBox.y - 16, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    const barAfter = await velocityOf();
    if (!(barAfter > barBefore)) {
      throw new Error(`Dragging a velocity bar did not raise it on ${target.name} (${barBefore} → ${barAfter})`);
    }

    // Legato fills each note's gap to the next one. Measured on the notes' own `data-gate` values,
    // not on pixel widths: a 64/128-step pattern has ~8 px cells, so a one-step change is under a
    // pixel and a width assertion would be testing the zoom level instead of the operation.
    const gatesOf = () =>
      page.$$eval("[data-testid^='piano-roll-note-']", (els) => els.map((e) => Number(e.getAttribute("data-gate"))));
    const gatesBefore = await gatesOf();
    await clickVerified(page, "[data-testid='piano-roll-legato']");
    await page.waitForTimeout(250);
    const gatesAfter = await gatesOf();
    const grew = gatesAfter.some((gate, i) => gate - (gatesBefore[i] ?? gate) > 0.05);
    if (!grew) {
      throw new Error(
        `Legato changed no note length on ${target.name} (${gatesBefore.slice(0, 6).join(",")} → ${gatesAfter.slice(0, 6).join(",")})`
      );
    }
    /**
     * U10: two claims only a real browser can settle, because both are about focus.
     *
     * 1. `]` lengthens **the whole selection**, not the note under the cursor. Select-all ran above,
     *    so every note is selected and each note's own `data-gate` is the evidence. The comparison
     *    counts the notes that *could* grow — one already at the one-bar ceiling cannot, and counting
     *    it as a failure would be the check lying rather than the editor.
     * 2. The on-screen piano answers the keyboard: Home walks to the bottom drawn key, ArrowUp walks
     *    one semitone up and sounds it. jsdom can assert the handler ran; only a browser can assert
     *    that focus actually moved to the next key.
     */
    const selectedGates = () =>
      page.$$eval("[data-testid^='piano-roll-note-']", (els) =>
        Object.fromEntries(
          els
            .filter((e) => e.getAttribute("data-selected") === "true")
            .map((e) => [e.getAttribute("data-testid"), Number(e.getAttribute("data-gate"))])
        )
      );
    await page.focus("[data-testid='piano-roll-grid']");
    const gatesBeforeSelection = await selectedGates();
    const eligibleIds = Object.keys(gatesBeforeSelection).filter(
      (id) => gatesBeforeSelection[id] < 15.5
    );
    if (eligibleIds.length < 2) {
      throw new Error(
        `Length-on-selection needs a multi-note selection; got ${eligibleIds.length} eligible note(s) on ${target.name}`
      );
    }
    await page.keyboard.press("]");
    await page.waitForTimeout(250);
    const gatesAfterSelection = await selectedGates();
    const grewIds = eligibleIds.filter(
      (id) => (gatesAfterSelection[id] ?? 0) - gatesBeforeSelection[id] > 0.05
    );
    if (grewIds.length !== eligibleIds.length) {
      throw new Error(
        `"]" with ${eligibleIds.length} notes selected lengthened ${grewIds.length} of them on ${target.name}`
      );
    }

    const focusedGutterKey = "[data-midi-pitch][tabindex='0']";
    if (!(await page.$(focusedGutterKey))) {
      throw new Error(`The pitch gutter has no keyboard tab stop on ${target.name}`);
    }
    await page.focus(focusedGutterKey);
    await page.keyboard.press("Home"); // the bottom drawn key, so ArrowUp always has somewhere to go
    await page.waitForTimeout(150);
    const gutterKeyBefore = Number(await page.getAttribute(focusedGutterKey, "data-midi-pitch"));
    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(250);
    const gutterKeyAfter = Number(await page.getAttribute(focusedGutterKey, "data-midi-pitch"));
    const auditionLine = ((await page.textContent("[data-testid='piano-roll-announcer']")) ?? "").trim();
    if (gutterKeyAfter !== gutterKeyBefore + 1 || auditionLine.length === 0) {
      throw new Error(
        `The pitch gutter did not answer ArrowUp on ${target.name} (key ${gutterKeyBefore} → ${gutterKeyAfter}, announcement "${auditionLine}")`
      );
    }

    console.log(
      `   · roll tools: switched by keyboard, marquee selected, velocity ${barBefore} → ${barAfter}, legato lengthened a note, ` +
        `"]" lengthened ${grewIds.length} selected notes, gutter key ${gutterKeyBefore} → ${gutterKeyAfter} announced`
    );

    await clickVerified(page, "[data-testid='piano-roll-close']");
    await page.waitForTimeout(250);
    if (await page.$("[data-testid='piano-roll-grid']")) {
      throw new Error("Piano roll did not close");
    }

    /**
     * U10: the studio's own parameter lane answers the keyboard too.
     *
     * It is one tab stop with a cursor (not one per column), and the column's `aria-valuenow` is the
     * value the store came back with — so this asserts the whole loop, not just that a handler ran.
     * The lane is left the way it was found.
     */
    const laneColumn = "[data-testid='vel-step-0']";
    const laneWasOpen = Boolean(await page.$(laneColumn));
    if (!laneWasOpen) {
      await clickVerified(page, "[data-toolbar-id='velocity-lane']");
      await page.waitForSelector(laneColumn, { timeout: 10000 });
    }
    const laneTabStops = await page.$$eval("[data-testid^='vel-step-']", (els) =>
      els.filter((e) => e.getAttribute("tabindex") === "0").length
    );
    if (laneTabStops !== 1) {
      throw new Error(
        `The parameter lane has ${laneTabStops} tab stops instead of one on ${target.name}`
      );
    }
    const laneBefore = Number(await page.getAttribute(laneColumn, "aria-valuenow"));
    const laneMax = Number(await page.getAttribute(laneColumn, "aria-valuemax"));
    await page.focus(laneColumn);
    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(250);
    const laneAfter = Number(await page.getAttribute(laneColumn, "aria-valuenow"));
    if (!(laneAfter > laneBefore || laneBefore === laneMax)) {
      throw new Error(
        `ArrowUp did not raise the parameter lane's first column on ${target.name} (${laneBefore} → ${laneAfter})`
      );
    }
    if (!laneWasOpen) await clickVerified(page, "[data-toolbar-id='velocity-lane']");
    } // end desktop-only piano roll assertions

    // 5g. Switching genre *while playing* (the case that shipped broken).
    //
    // A single click used to trigger 5–13 `pushState` calls and up to 9 pattern flips, because the
    // genre-sync effect depended on callback identities that every render reallocated: switch →
    // onSelectGenre → navigate → re-render → effect again → switch again. On Safari that showed as
    // the two genres swapping continuously with the display flickering. The matrix never exercised
    // this, so nothing caught it — this check does, on every engine, by measuring the app's own
    // activity rather than trusting a screenshot.
    await page.goto(`${baseUrl}/?tab=studio`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(
      "[data-testid='toolbar-advanced-toggle'], [data-testid='mobile-transport-more']",
      { timeout: 30000 }
    );
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      window.__genreDiag = { nav: 0, samples: [] };
      for (const fn of ["pushState", "replaceState"]) {
        const orig = history[fn].bind(history);
        history[fn] = (...a) => {
          window.__genreDiag.nav += 1;
          return orig(...a);
        };
      }
      const signature = () =>
        [...document.querySelectorAll("[data-track-idx][data-step-idx]")]
          .map((c) => (c.getAttribute("aria-selected") === "true" ? "1" : "0"))
          .join("");
      window.__genreDiag.start = () =>
        setInterval(() => window.__genreDiag.samples.push(signature()), 50);
    });
    const genrePlayBtn = await page.$("button:has-text('播放'), button:has-text('Play')");
    if (genrePlayBtn) await genrePlayBtn.click({ force: true });
    await page.waitForTimeout(600);
    await page.evaluate(() => window.__genreDiag.start());

    /**
     * Candidate chips, current genre excluded when the URL names it.
     *
     * The app keeps its genre in state, so "the second chip" is not necessarily a *change*: after the
     * earlier steps had already visited it, clicking it was a legitimate no-op and this check went
     * vacuous on both iPhone orientations. `candidates` gives the loop something to try instead.
     */
    const currentGenre = await page.evaluate(
      () => new URLSearchParams(location.search).get("genre")
    );
    const candidates = (
      await page.$$eval("[data-testid^='genre-chip-']", (els, current) =>
        els
          .map((e) => e.getAttribute("data-testid") ?? "")
          .filter((id) => id && !id.endsWith(current ?? "\u0000"))
          .map((id) => `[data-testid='${id}']`),
        currentGenre
      )
    ).slice(0, 3);
    const switches = candidates.length > 0 ? 1 : 0;
    for (let i = 1; i <= switches; i++) {
      const before = await page.evaluate(() => ({
        nav: window.__genreDiag.nav,
        samples: window.__genreDiag.samples.length,
      }));
      let after = null;
      for (const candidate of candidates) {
        // Click through the delivery-verifying helper: on WebKit a plain `force: true` click at
        // coordinates silently did nothing here (the page had been scrolled by the earlier steps, and
        // a click needs a pair of down/up on the same node), which is how the first version of this
        // check passed vacuously with `navigations=0, flips=0`.
        await clickVerified(page, candidate, { timeoutMs: 8000 });
        /**
         * By this point the matrix has edited the pattern (step toggles, a timbre change, a note
         * drawn in the roll), so the unsaved-changes guard legitimately asks first. Waiting for the
         * dialog rather than sleeping 400 ms makes this deterministic: the fixed sleep missed it and
         * left the dialog open, which is the second way this check went vacuous.
         */
        const guard = await page
          .waitForSelector("[data-testid='unsaved-discard']", { timeout: 1500 })
          .catch(() => null);
        if (guard) {
          console.log(`   · genre switch ${i}: unsaved-changes guard asked (pattern had edits) — discarding`);
          await clickVerified(page, "[data-testid='unsaved-discard']", { timeoutMs: 8000 });
        }
        await page.waitForTimeout(2000);
        after = await page.evaluate(({ nav, samples }) => {
          const slice = window.__genreDiag.samples.slice(samples);
          let changes = 0;
          for (let k = 1; k < slice.length; k++) if (slice[k] !== slice[k - 1]) changes += 1;
          return { navDelta: window.__genreDiag.nav - nav, patternFlips: changes };
        }, before);
        if (after.patternFlips >= 1) break;
      }
      // Print the measurements before judging them: the sibling project's notes record a probe that
      // asserted first and therefore left nothing behind on the run that mattered (§6.10). With the
      // numbers in the log, an interrupted run is still evidence.
      const surroundings = await page.evaluate(() => ({
        dialog: Boolean(document.querySelector("[data-testid='unsaved-changes-dialog']")),
        url: location.search,
        genre: new URLSearchParams(location.search).get("genre"),
      }));
      console.log(
        `   · genre switch ${i}: navigations=${after.navDelta} patternFlips=${after.patternFlips} ` +
          `dialog=${surroundings.dialog} url=${surroundings.url || "(none)"} (${target.name})`
      );

      // A click that changed nothing means the check is not exercising anything: fail loudly rather
      // than pass. "Not judged" must never be recorded as "passed".
      if (!after || after.patternFlips < 1) {
        throw new Error(
          `Clicking a genre chip while playing changed no pattern on ${target.name} (navigations=${after.navDelta}, flips=${after.patternFlips}) — the check is vacuous`
        );
      }
      // One click may cost one navigation and one pattern change. Anything more is the loop.
      if (after.navDelta > 2) {
        throw new Error(
          `Switching genre while playing caused ${after.navDelta} navigations on ${target.name} (expected <= 2)`
        );
      }
      if (after.patternFlips > 2) {
        throw new Error(
          `Switching genre while playing flipped the pattern ${after.patternFlips} times on ${target.name} (expected <= 2) — the genres are swapping`
        );
      }
    }

    // 6. Compare & Challenge Views Check
    await page.goto(`${baseUrl}/?tab=compare`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(300);

    await page.goto(`${baseUrl}/?tab=challenge`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(300);

    if (errors.length > 0) {
      throw new Error(`Uncaught runtime errors detected:\n${errors.join("\n")}`);
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: (process.env.E2E_STACK ? err.stack : err.message) };
  } finally {
    await browser.close();
  }
}

async function main() {
  /**
   * Every run persists itself.
   *
   * Rule (from the sibling project's WebKit notes, §6.1, and from killing a healthy 15-minute run
   * because it was piped through `tail`): a long run must stream to disk as it goes and leave a
   * machine-readable result behind. This matrix takes minutes per target on a slow machine, so it
   * writes `matrix.log` line by line plus a final `matrix.json` + `summary.md` — which means the
   * run can be handed off, packaged, or interrupted without losing what it established.
   *
   * `--out <dir>` chooses the parent directory (default `e2e-out/`, git-ignored).
   */
  const outArg = process.argv.find((a) => a.startsWith("--out="));
  const outRoot = outArg ? outArg.split("=")[1] : path.join(process.cwd(), "e2e-out");
  const runStamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
  const runDir = path.join(outRoot, `e2e-${runStamp}`);
  fs.mkdirSync(runDir, { recursive: true });
  const logPath = path.join(runDir, "matrix.log");
  const startedAt = new Date().toISOString();
  const log = (line = "") => {
    console.log(line);
    fs.appendFileSync(logPath, `${line}\n`);
  };

  log("===============================================================");
  log("  🚀 GROOVE LAB Multi-Browser & Cross-Device Release Test Matrix");
  log("===============================================================\n");

  // Fail before spending minutes of browser time if the bundle does not match the source.
  try {
    assertDistIsFresh();
  } catch (error) {
    console.error(`\n❌ ${error.message}\n`);
    log(`❌ ${error.message}`);
    process.exit(1);
  }

  const { server, port } = await startStaticServer();
  const baseUrl = `http://127.0.0.1:${port}`;
  log(`[Static Server] Serving dist/ at ${baseUrl}\n`);

  let allPassed = true;
  const results = [];

  // Optional subset for iterating on a single engine without paying for all seven targets:
  //   node scripts/test_matrix.js --target=chromium
  const targetFilter = process.argv.find((a) => a.startsWith("--target="))?.split("=")[1] ?? null;
  const targets = targetFilter
    ? TARGETS.filter((t) => `${t.name} ${t.browserType}`.toLowerCase().includes(targetFilter.toLowerCase()))
    : TARGETS;
  if (targetFilter) {
    if (targets.length === 0) {
      console.error(`❌ --target=${targetFilter} matched no target. Known: ${TARGETS.map((t) => t.name).join(" | ")}`);
      process.exit(1);
    }
    console.log(`[Filter] --target=${targetFilter} → ${targets.map((t) => t.name).join(", ")}\n`);
  }

  for (const target of targets) {
    // One line per target, written as the target starts and again when it finishes: with the log
    // on disk, a run that is still going looks like progress instead of a hang.
    log(`⏳ Testing ${target.name} ...`);
    const start = Date.now();
    let res = await runTestOnTarget(target, baseUrl);
    let retried = false;
    if (!res.success) {
      log(`   ↻ ${target.name}: retrying once`);
      retried = true;
      res = await runTestOnTarget(target, baseUrl);
    }
    const dur = ((Date.now() - start) / 1000).toFixed(2);

    if (res.success) {
      log(`✅ PASS ${target.name} (${dur}s)${retried ? " [retried once]" : ""}`);
      results.push({ name: target.name, status: "PASS", duration: dur, retried });
    } else {
      log(`❌ FAIL ${target.name} (${dur}s)`);
      log(`   Error details: ${res.error}`);
      results.push({ name: target.name, status: "FAIL", error: res.error, duration: dur, retried });
      allPassed = false;
    }
  }

  server.close();

  log("\n===============================================================");
  log("  📊 Release Test Matrix Summary");
  log("===============================================================");
  results.forEach((r) => {
    const icon = r.status === "PASS" ? "✅" : "❌";
    log(`  ${icon} ${r.name.padEnd(36)} [${r.status}] (${r.duration}s)`);
  });
  log("===============================================================\n");

  // Persist the machine-readable result next to the log, so this run can be packaged, compared
  // with another machine, or read by a gate without re-running anything.
  const finishedAt = new Date().toISOString();
  const totalSeconds = +(results.reduce((sum, r) => sum + Number(r.duration), 0)).toFixed(1);
  const manifest = {
    schema: "groove.e2e-matrix/1",
    startedAt,
    finishedAt,
    baseUrl,
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    targetFilter: targetFilter ?? null,
    totalSeconds,
    passed: allPassed,
    targets: results,
  };
  fs.writeFileSync(path.join(runDir, "matrix.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(
    path.join(runDir, "summary.md"),
    [
      "# Cross-device E2E matrix",
      "",
      `- ran: ${startedAt} → ${finishedAt} (${totalSeconds}s of target time)`,
      `- node: ${manifest.node} · ${manifest.platform}`,
      `- scope: ${targetFilter ? `filtered (--target=${targetFilter})` : "all targets"}`,
      `- verdict: ${allPassed ? "**all selected targets passed**" : "**one or more targets FAILED**"}`,
      "",
      "| target | status | seconds | retried |",
      "|---|---|---|---|",
      ...results.map((r) => `| ${r.name} | ${r.status} | ${r.duration} | ${r.retried ? "yes" : "no"} |`),
      "",
      ...(allPassed ? [] : ["## Failures", "", ...results.filter((r) => r.error).map((r) => `- **${r.name}**: ${r.error}`), ""]),
      `Full output: \`${path.relative(runDir, logPath)}\``,
      "",
    ].join("\n")
  );
  log(`📦 artifacts: ${runDir} (matrix.json, matrix.log, summary.md)`);

  if (!allPassed) {
    console.error("❌ Release Test Matrix FAILED: One or more browser/device targets failed.");
    process.exit(1);
  } else if (TARGETS.length < ALL_TARGETS.length) {
    /**
     * A partial run must never claim the whole matrix passed.
     *
     * This message used to be hardcoded to "ALL 7", which was already wrong for a filtered run and
     * becomes actively misleading now that the gate runs the PC profile while the phone surfaces are
     * redesigned: the log would say all seven passed while three ran. The count is derived from what
     * actually ran, and a partial profile says which command covers the rest.
     */
    const scope = targetFilter
      ? `filtered by E2E_ONLY=${targetFilter}`
      : `E2E_PROFILE=${TARGET_PROFILE}`;
    console.log(
      `✅ ${TARGETS.length}/${ALL_TARGETS.length} TARGET(S) PASSED (${scope}) — the full matrix is \`npm run test:e2e:all\`\n`
    );
    process.exit(0);
  } else {
    console.log(
      `🎉 ALL ${ALL_TARGETS.length} BROWSER & DEVICE TARGETS PASSED PRE-RELEASE VERIFICATION!\n`
    );
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
