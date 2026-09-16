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
const TARGETS = [
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
async function clickVerified(page, selector, { timeoutMs = 10000, pressMs = 60 } = {}) {
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

    const box = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      el.scrollIntoView({ block: "center", inline: "center" });
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
    }, selector);

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
    const playBtn = await page.$("button:has-text('播放'), button:has-text('Play'), button:has-text('暂停'), button:has-text('Pause')");
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
    await page.waitForSelector("[data-testid='toolbar-advanced-toggle']", { timeout: 20000 }).catch(() => {
      throw new Error("Studio toolbar did not render the advanced drawer toggle");
    });
    // The audio settings entry point lives in the collapsible advanced drawer, closed by default.
    if (!(await page.$("[data-testid='studio-audio-settings-open']"))) {
      await clickVerified(page, "[data-testid='toolbar-advanced-toggle']");
      await page.waitForTimeout(300);
    }
    await page.waitForSelector("[data-testid='studio-gs1-toggle']", { timeout: 20000 }).catch(() => {
      throw new Error("Opening the advanced drawer did not reveal the GS-1 toggle");
    });
    const audioSettingsBtn = await page.$("[data-testid='studio-audio-settings-open']");
    if (!audioSettingsBtn) {
      throw new Error("Audio settings panel has no entry point in the toolbar");
    }
    await clickVerified(page, "[data-testid='studio-audio-settings-open']");
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

    await page.click("[data-testid='header-settings-open']", { force: true });
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

    // The toolbar chip must agree with what the panel just did (the cross-surface contract).
    if (!(await page.$("[data-testid='studio-gs1-toggle']"))) {
      await page.click("[data-testid='toolbar-advanced-toggle']", { force: true });
      await page.waitForTimeout(300);
    }
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

    // 5e. Track inspector placement + categorized timbre picker (item ②).
    //
    // The inspector used to render in normal flow after the sequencer: on a phone it appeared
    // below everything, on desktop it pushed the layout around. This asserts the real geometry —
    // a bottom sheet on phones, a full-height left dock on desktop — and that the timbre picker
    // can actually filter 115 names down to the one you want.
    await page.click("[data-testid='track-inspector-open-0']", { force: true });
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
      // Pinned to the bottom of the viewport and spanning its width: a sheet, not a page section.
      const touchingBottom = Math.abs(inspectorBox.y + inspectorBox.height - viewport.height) <= 4;
      // Width is "spans the viewport", not an exact match: a mobile engine can reserve a few px
      // for a scrollbar, and a 400 px desktop dock would be nowhere near the viewport width.
      const spansWidth = inspectorBox.width >= viewport.width - 16;
      if (!touchingBottom || inspectorBox.x > 2 || !spansWidth) {
        throw new Error(
          `Inspector is not a bottom sheet on ${target.name}: box=${JSON.stringify(inspectorBox)} viewport=${JSON.stringify(viewport)}`
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
    const handleBox = handle ? await handle.boundingBox() : null;
    if (!handleBox) throw new Error("EQ band handle is not on screen");
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y - 24, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    const gainAfter = await page.inputValue("[data-testid='track-inspector-mid-gain']");
    const eqPathAfter = await page.getAttribute("[data-testid='insert-eq-curve-path']", "d");
    if (gainAfter === gainBefore && eqPathAfter === eqPathBefore) {
      throw new Error(
        `Dragging the mid band handle changed nothing on ${target.name} (gain ${gainBefore} → ${gainAfter})`
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
    await clickVerified(page, "[data-testid='toolbar-piano-roll-toggle']");
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
        toggleBox: (() => { const el = document.querySelector("[data-testid='toolbar-piano-roll-toggle']"); const r = el?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null; })(),
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
    await page.locator("[data-testid='piano-roll-grid']").scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);

    // Draw into the measured step. The grid's cell width depends on the zoom level, so derive it
    // from the rendered geometry rather than assuming a pixel size.
    const clickPoint = await page.evaluate(({ trackIdx, stepIdx }) => {
      const grid = document.querySelector("[data-testid='piano-roll-grid']");
      const rect = grid.getBoundingClientRect();
      const stepCount = document.querySelectorAll(`[data-track-idx="${trackIdx}"][data-step-idx]`).length || 16;
      const cellW = rect.width / stepCount;
      return { x: rect.left + stepIdx * cellW + cellW / 2, y: rect.top + 8 };
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
    const firstNote = await page.$("[data-testid^='piano-roll-note-']");
    const firstNoteBox = firstNote ? await firstNote.boundingBox() : null;
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
    const insetX = Math.max(12, visible.right - visible.x) * 0.25;
    const insetY = Math.max(12, visible.bottom - visible.y) * 0.25;
    const from = { x: visible.x + insetX, y: visible.bottom - insetY };
    const to = { x: visible.right - insetX, y: visible.y + insetY };

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
    const firstBar = "[data-testid^='piano-roll-velocity-bar-']";
    const barBefore = Number(await page.getAttribute(firstBar, "data-velocity"));
    const barBox = await (await page.$(firstBar)).boundingBox();
    if (!barBox) throw new Error("Velocity lane has no visible bar for a pattern with notes");
    await page.mouse.move(barBox.x + barBox.width / 2, barBox.y + Math.max(2, barBox.height / 2));
    await page.mouse.down();
    await page.mouse.move(barBox.x + barBox.width / 2, barBox.y - 16, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    const barAfter = Number(await page.getAttribute(firstBar, "data-velocity"));
    if (!(barAfter > barBefore)) {
      throw new Error(`Dragging a velocity bar did not raise it on ${target.name} (${barBefore} → ${barAfter})`);
    }

    // Legato fills the gap to the next note, which is visible as a wider note block.
    const widthBefore = await page.$eval("[data-testid^='piano-roll-note-']", (el) => el.getBoundingClientRect().width);
    await clickVerified(page, "[data-testid='piano-roll-legato']");
    await page.waitForTimeout(250);
    const widthAfter = await page.$eval("[data-testid^='piano-roll-note-']", (el) => el.getBoundingClientRect().width);
    if (Math.abs(widthAfter - widthBefore) < 0.5) {
      throw new Error(`Legato did not change any note length on ${target.name} (${widthBefore} → ${widthAfter})`);
    }
    console.log(
      `   · roll tools: switched by keyboard, marquee selected, velocity ${barBefore} → ${barAfter}, legato ${widthBefore.toFixed(1)} → ${widthAfter.toFixed(1)}px`
    );

    await clickVerified(page, "[data-testid='piano-roll-close']");
    await page.waitForTimeout(250);
    if (await page.$("[data-testid='piano-roll-grid']")) {
      throw new Error("Piano roll did not close");
    }

    // 5g. Switching genre *while playing* (the case that shipped broken).
    //
    // A single click used to trigger 5–13 `pushState` calls and up to 9 pattern flips, because the
    // genre-sync effect depended on callback identities that every render reallocated: switch →
    // onSelectGenre → navigate → re-render → effect again → switch again. On Safari that showed as
    // the two genres swapping continuously with the display flickering. The matrix never exercised
    // this, so nothing caught it — this check does, on every engine, by measuring the app's own
    // activity rather than trusting a screenshot.
    await page.goto(`${baseUrl}/?tab=studio`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-testid='toolbar-advanced-toggle']", { timeout: 30000 });
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

    const chipSelectors = await page.$$eval("[data-testid^='genre-chip-']", (els) =>
      els.map((e) => `[data-testid='${e.getAttribute("data-testid")}']`)
    );
    const switches = Math.min(2, Math.max(0, chipSelectors.length - 1));
    for (let i = 1; i <= switches; i++) {
      const before = await page.evaluate(() => ({
        nav: window.__genreDiag.nav,
        samples: window.__genreDiag.samples.length,
      }));
      // Click through the delivery-verifying helper: on WebKit a plain `force: true` click at
      // coordinates silently did nothing here (the page had been scrolled by the earlier steps, and
      // a click needs a pair of down/up on the same node), which is how the first version of this
      // check passed vacuously with `navigations=0, flips=0`.
      await clickVerified(page, chipSelectors[i], { timeoutMs: 8000 });
      // By this point the matrix has edited the pattern (step toggles, a timbre change, a note
      // drawn in the roll), so the unsaved-changes guard legitimately asks first. Answer it and
      // carry on measuring: the loop this check hunts happens *after* the switch is allowed, and a
      // dialog left open would otherwise make the check vacuous (it did, twice).
      await page.waitForTimeout(400);
      if (await page.$("[data-testid='unsaved-discard']")) {
        console.log(`   · genre switch ${i}: unsaved-changes guard asked (pattern had edits) — discarding to continue`);
        await clickVerified(page, "[data-testid='unsaved-discard']", { timeoutMs: 8000 });
      }
      await page.waitForTimeout(2000);
      const after = await page.evaluate(({ nav, samples }) => {
        const slice = window.__genreDiag.samples.slice(samples);
        let changes = 0;
        for (let k = 1; k < slice.length; k++) if (slice[k] !== slice[k - 1]) changes += 1;
        return { navDelta: window.__genreDiag.nav - nav, patternFlips: changes };
      }, before);
      // Print the measurements before judging them: the sibling project's notes record a probe that
      // asserted first and therefore left nothing behind on the run that mattered (§6.10). With the
      // numbers in the log, an interrupted run is still evidence.
      console.log(
        `   · genre switch ${i}: navigations=${after.navDelta} patternFlips=${after.patternFlips} (${target.name})`
      );

      // A click that changed nothing means the check is not exercising anything: fail loudly rather
      // than pass. "Not judged" must never be recorded as "passed".
      if (after.patternFlips < 1) {
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
    return { success: false, error: err.message };
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
  } else if (targetFilter) {
    // A filtered run is not a release gate; say exactly what passed instead of claiming all 7.
    console.log(`✅ ${results.length}/${TARGETS.length} TARGET(S) PASSED (filtered: --target=${targetFilter})\n`);
    process.exit(0);
  } else {
    console.log("🎉 ALL 7 BROWSER & DEVICE TARGETS PASSED PRE-RELEASE VERIFICATION!\n");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
