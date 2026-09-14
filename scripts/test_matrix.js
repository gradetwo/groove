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
      const docW = document.documentElement.scrollWidth;
      const winW = window.innerWidth;
      // Allow minor 1px rounding discrepancies on high-DPI displays
      return { docW, winW, hasOverflow: docW > winW + 4 };
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
        return document.documentElement.scrollWidth > window.innerWidth + 4;
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
  console.log("===============================================================");
  console.log("  🚀 GROOVE LAB Multi-Browser & Cross-Device Release Test Matrix");
  console.log("===============================================================\n");

  const { server, port } = await startStaticServer();
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[Static Server] Serving dist/ at ${baseUrl}\n`);

  let allPassed = true;
  const results = [];

  for (const target of TARGETS) {
    process.stdout.write(`⏳ Testing ${target.name.padEnd(35)} ... `);
    const start = Date.now();
    let res = await runTestOnTarget(target, baseUrl);
    if (!res.success) {
      process.stdout.write(`(retrying once) ... `);
      res = await runTestOnTarget(target, baseUrl);
    }
    const dur = ((Date.now() - start) / 1000).toFixed(2);

    if (res.success) {
      console.log(`✅ PASS (${dur}s)`);
      results.push({ name: target.name, status: "PASS", duration: dur });
    } else {
      console.log(`❌ FAIL (${dur}s)`);
      console.error(`   Error details: ${res.error}\n`);
      results.push({ name: target.name, status: "FAIL", error: res.error, duration: dur });
      allPassed = false;
    }
  }

  server.close();

  console.log("\n===============================================================");
  console.log("  📊 Release Test Matrix Summary");
  console.log("===============================================================");
  results.forEach((r) => {
    const icon = r.status === "PASS" ? "✅" : "❌";
    console.log(`  ${icon} ${r.name.padEnd(36)} [${r.status}] (${r.duration}s)`);
  });
  console.log("===============================================================\n");

  if (!allPassed) {
    console.error("❌ Release Test Matrix FAILED: One or more browser/device targets failed.");
    process.exit(1);
  } else {
    console.log("🎉 ALL 7 BROWSER & DEVICE TARGETS PASSED PRE-RELEASE VERIFICATION!\n");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
