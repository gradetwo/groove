/**
 * Comprehensive Cross-Browser & Cross-Device E2E Test Suite
 * Tests Chrome, Firefox, WebKit, iPhone (Portrait/Landscape), and iPad (Portrait/Landscape).
 * Mandatory gate before every release.
 */

import http from "http";
import fs from "fs";
import path from "path";
import { spawnSync } from "node:child_process";
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
 * Hard wall-clock limit for **one** target, ms.
 *
 * A WebKit hang once held a job for three hours (observed 2026-09-23: the iPad leg sat in "Cross-Browser &
 * Cross-Device Test Matrix" from 07:09 until the run was cancelled, while its sibling legs finished in
 * minutes). Playwright's own timeouts cover its waits, not a wedged browser process or a stall in teardown,
 * and GitHub's default job timeout is **six hours** — so a hang was indistinguishable from slow progress and
 * cost a runner for an afternoon.
 *
 * Each target therefore runs in a **child process** the parent can kill: a hang becomes `FAIL … (timeout)`
 * with the target named, in eight minutes instead of six hours. `E2E_TARGET_TIMEOUT_MS=0` disables the
 * watchdog for a deliberate long run.
 */
const TARGET_TIMEOUT_MS = Number(process.env.E2E_TARGET_TIMEOUT_MS ?? "480000");
/** Set when this process *is* the child: run the filtered target, report, exit. No server, no summary. */
const RUN_ONE = process.argv.includes("--one");

/**
 * Which *group* of targets the release gate runs.
 *
 *   E2E_PROFILE=pc      the three desktop browsers       (default in `npm run verify`)
 *   E2E_PROFILE=all     everything — the full matrix, `npm run test:e2e:all`
 *
 * The two profiles are the same set now: the phone and tablet targets are cut with the mobile version
 * (owner's decision, 2026-10-02 — `docs/OPEN_WORK.md` §十三), so what is left is the desktop matrix.
 * `pc` stays because `npm run test:e2e` names it and a local fast pass reads better as "the desktop
 * profile" than as "all of a one-group matrix".
 *
 * **CI runs `test:e2e:all` on every push and pull request**. The old reduction existed because the
 * phone UI was mid-redesign and its assertions would have been invalidated by it; that reason is gone,
 * and a gate that skips part of the matrix is how a targeted regression reaches production.
 *
 * `ARCHITECTURE_SURFACES.md` §6 records the same change.
 */
const TARGET_PROFILE = (process.env.E2E_PROFILE || "all").toLowerCase();
const PROFILE_MATCHERS = {
  all: () => true,
  pc: () => true,
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
  /**
   * ⭐ **The phone and tablet targets are gone (2026-10-02): the mobile version is cut.**
   *
   * There were four, and they went in the order they were decided. The two iPhone targets were frozen
   * on 2026-09-30 — "与iphone有关的各种CI/CD都可以先关掉" — after failing on a worker fetch and a 44 px
   * touch minimum, neither of which was fixed on purpose, because a frozen device's failures should not
   * hold up the one we ship to. The `iPad Pro 11` portrait and landscape legs then lost the leg they
   * ran in, and finally the phone shell they drove.
   *
   * They are recorded rather than reconstructed here because re-enabling is a decision, not a repair:
   * the shell they exercised lives on `mobile-preserved`, and the two commented objects below are the
   * iPhone pair exactly as they stood.
   *
   * ```
   * { name: "iPhone 14 (竖屏 Portrait)", browserType: "webkit", device: "iPhone 14", isMobile: true },
   * { name: "iPhone 14 (横屏 Landscape)", browserType: "webkit", device: "iPhone 14 landscape", isMobile: true },
   * ```
   */
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
/**
 * ⭐ **Opens the arrangement's own piano roll.**
 *
 * The roll is inside the arrangement editor (`PianoRollV2`), behind the editor tabs at the right of the toolbar, and `roll` is the tab that
 * is open by default -- so this clicks the tab when the grid is not already there and waits for it. Two conditions are the editor's rather
 * than this helper's: a track has to be selected, and it must not be an `fx` or `folder` lane, which carry no notes. The studio's drawer,
 * the phone sheet and their toggles are gone, so nothing here reaches for them.
 */
async function openPianoRoll(page) {
  if (await page.$("[data-testid='roll-grid']")) return "desktop";
  if (await page.$("[data-testid='arrangement-editor-roll']")) {
    await clickVerified(page, "[data-testid='arrangement-editor-roll']");
  }
  /**
   * ⭐ **The editor tabs exist only for a selected track, so select one when none is.**
   *
   * This used to depend on the detail panel's own wording (`/Select a track/i`), which is a copy string — the
   * arrangement's detail panel does not use that sentence, so the branch never fired, no track was selected, the
   * editor tabs were not rendered, and the roll could not open. The picker is the surface that actually selects a
   * track, so the matrix presses it; then, if the tabs are there, the roll tab.
   */
  if (!(await page.$("[data-testid='roll-grid']"))) {
    const first = await page.$("[data-testid='arrangement-track-picker'] button");
    if (first) {
      await first.click({ force: true });
      await page.waitForTimeout(300);
    }
    const rollTab = await page.$("[data-testid='arrangement-editor-roll']");
    if (rollTab) {
      await clickVerified(page, "[data-testid='arrangement-editor-roll']");
      await page.waitForTimeout(200);
    }
  }
  await page.waitForSelector("[data-testid='roll-grid']", { timeout: 20000 }).catch(() => null);
  if (await page.$("[data-testid='roll-grid']")) return "desktop";
  return null;
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

/**
 * ⭐ **A real mouse click on a control, with the "did it work" half attached.**
 *
 * **Restored 2026-10-07.** The helper was written when the phone studio sheet needed a row scrolled into view before a tap; the commit
 * that removed the phone branches took the definition with it and left the desktop call, so every browser failed with
 * `clickSheetRowAndVerify is not defined` before the audio-settings block ran.
 *
 * The one remaining caller is the header's settings button, and the same two things matter there: the control starts below the fold on a
 * short viewport, and a `page.click` swallowed by an overlay looks exactly like a panel that did not open. So this scrolls the control into
 * view, clicks its centre with a real mouse event, and then requires the expected target to appear — naming the entry, the target and what
 * was on screen when it does not.
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
        dialogs: document.querySelectorAll("[role='dialog']").length,
        url: location.href,
      }));
      throw new Error(`${label}: clicking ${selector} did not produce ${expectSelector} :: ${JSON.stringify(diag)}`);
    }
  }
}

/**
  * ⭐ **Notes marked in the arrangement's own roll.**
  *
  * The step matrix this used to read is gone with the studio; `trackIdx` stays in the signature because the callers pass one, and the roll
  * shows one track at a time, so the count is already about that track.
  */
async function countActiveSteps(page, _trackIdx) {
  return page.$$eval("[data-testid='roll-grid'] [data-selected='true']", (notes) => notes.length);
}

/**
 * ⭐ **The landing surface starts on the new-project panel, so the matrix creates one.**
 *
 * Opening `?tab=studio` renders `NewProjectView`, and its first screen is the new-project panel: template cards, a name field and
 * genre choices. The arrangement grid -- and so every check below that drives it -- only exists after a project is created. The
 * matrix used to wait for the grid straight after the goto, which is why it timed out on every browser once the studio's step grid
 * was retired. This creates one explicitly, and only when the panel is actually there, so a run that opens an existing arrangement
 * is unaffected.
 */
async function ensureArrangementMounted(page) {
  /**
   * ⭐ **Wait for whichever of the three screens arrives first, then act.**
   *
   * `domcontentloaded` fires before React renders, so a bare `page.$` right after the goto finds nothing and every later click is
   * blocked by the audio gate, which is `aria-modal`. The order matters and was measured: wait for the gate, the new-project panel or
   * the grid; tap the gate if it is the one that arrived; then create a project if the panel is what mounted. A run that opens an
   * existing arrangement mounts the grid and is left alone.
   */
  const FIRST_SCREEN =
    "[data-testid='audio-start-gate'], [data-testid='first-run-prompt'], [data-testid='new-project-panel-v2'], [data-testid='arrangement-grid']";
  const arrived = await page.waitForSelector(FIRST_SCREEN, { state: "attached", timeout: 45000 }).catch(() => null);
  if (!arrived) return;

  if (await page.$("[data-testid='audio-start-gate']")) {
    await page.click("[data-testid='audio-start-button']", { force: true });
    await page.waitForSelector("[data-testid='audio-start-gate']", { state: "detached", timeout: 20000 }).catch(() => null);
  }

  /**
   * ⭐ **The first-run prompt is a modal too, and a person dismisses it before choosing a template.**
   *
   * It is `fixed inset-0 z-50`, so the template cards are visible underneath and every click aimed at them lands on the prompt
   * instead -- measured with `elementFromPoint`, which returned the prompt rather than the card. The matrix dismisses it the way the
   * prompt offers, then carries on.
   */
  if (await page.$("[data-testid='first-run-prompt']")) {
    await page.click("[data-testid='first-run-prompt-dismiss']", { force: true });
    await page.waitForSelector("[data-testid='first-run-prompt']", { state: "detached", timeout: 20000 }).catch(() => null);
  }

  await page.waitForSelector("[data-testid='new-project-panel-v2'], [data-testid='arrangement-grid']", { state: "attached", timeout: 45000 }).catch(() => null);
  if (!(await page.$("[data-testid='new-project-panel-v2']"))) return;
  /**
   * ⭐ **A DOM click, not a mouse click at the element's centre.**
   *
   * `force` skips the hit test but still dispatches at coordinates, and on this surface those coordinates land on whatever overlay is
   * up: the clicks retried until they timed out, and when they did land React did not see them (the panel stayed after Create, with no
   * error anywhere). Calling `click()` on the element itself is independent of coordinates and of what covers it, and it is the form
   * that was measured to work -- the panel goes and the grid mounts.
   */
  await page.evaluate(() => {
    document.querySelector("[data-testid='template-blank']")?.click();
    document.querySelector("[data-testid='new-project-create']")?.click();
  });
}

async function runTestOnTarget(target, baseUrl) {
  const browserLauncher = playwright[target.browserType];
  const browser = await browserLauncher.launch({
    headless: true,
    /**
     * ⭐ **The audio-unlock click has to work without a real gesture.**
     *
     * `AudioStartGate` stays up while the context is suspended, and a headless run has no gesture to resume it: the click retries
     * against an `aria-modal` overlay until it times out, which is what kept `ensureArrangementMounted` from clicking anything. The
     * flag is the browser's own way of saying the gesture is not required.
     */
    args:
      target.browserType === "chromium"
        ? ["--no-sandbox", "--disable-setuid-sandbox", "--autoplay-policy=no-user-gesture-required"]
        : [],
  });

  const contextOptions = target.device
    ? { ...playwright.devices[target.device] }
    : { ...target.options };

  const context = await browser.newContext(contextOptions);
  await context.addInitScript(() => {
    try {
      localStorage.setItem("groove_onboarding_completed", "true");
      /**
       * The entry gate (`AudioStartGate`) is a full-screen overlay until it is tapped, so a run that does not start
       * from "audio already unlocked" would be clicking the gate on every interaction. Seeding it is what the app
       * itself does after a real first visit, not a way around a check.
       */
      localStorage.setItem("groove_audio_started", "1");
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
    await ensureArrangementMounted(page);

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

    /**
     * ⭐ **The grid check follows the surface, not the file it used to be in.**
     *
     * This waited on the studio's step cells (`data-track-idx`, `data-step-idx`), which the landing surface no longer renders: the
     * arrangement editor's grid carries `data-testid="arrangement-grid"`. What the check is for has not changed -- the matrix wants to
     * know that a grid mounted before it drives one -- so it accepts either shape and names the arrangement in its failure.
     */
    /** ⭐ The landing surface is the arrangement editor's grid; the studio's step cells are gone, so nothing else is named here. */
    const GRID_SELECTOR = "[data-testid='arrangement-grid']";
    await page.waitForSelector(GRID_SELECTOR, { state: "attached", timeout: 45000 });
    const tracks = await page.$$(GRID_SELECTOR);
    if (tracks.length === 0) {
      const cellCount = await page.evaluate(() => document.querySelectorAll("[data-testid='arrangement-grid']").length);
      if (cellCount === 0) {
        throw new Error("No arrangement grid detected on the landing surface");
      }
    }

    /**
     * ⭐ **The grid's two columns line up, row for row, and nothing overflows the header column.**
     *
     * Measured on the released v2.35.0 at 1820×918: the add-track block lived inside the header column but not the
     * lane column, so every header sat 101 px above its own lane; each header row carried a 1 px bottom border the
     * lane row did not, so the columns drifted another pixel per track; and the header's controls needed 262 px inside
     * a 240 px column, so the track's name was squeezed to zero width and the remove button painted into the lane
     * area. jsdom cannot see any of that — geometry is not in its model — which is why it is asserted here, on the one
     * leg that has a real browser and a production build.
     */
    const gridGeometry = await page.evaluate(() => {
      const column = document.querySelector("[data-testid='arrangement-header-column'] > div:first-child");
      const lanes = document.querySelector("[data-testid='arrangement-lane']");
      if (!column || !lanes) return { error: "no header column or lane column" };
      const headerRows = [...column.querySelectorAll("[data-testid^='arrangement-header-row-']")];
      const laneRows = [...lanes.children];
      const box = (el) => el.getBoundingClientRect();
      /**
       * ⭐ **The three things that must share one origin.** The lane column's left edge is bar 0; the first ruler bar
       * starts there, and so must the first region — a `MUTE` button in the lane row's flow used to push every region
       * 36 px right of the grid, so notes sat 0.56 of a bar after the ruler said they did and the playhead crossed them
       * at the wrong time (measured 2026-10-07, fixed by leaving mute to the header).
       */
      const firstRegion = lanes.firstElementChild?.querySelector("[data-testid^='arrangement-region-']");
      const firstBar = document.querySelector("[data-testid='ruler-bar-0']");
      return {
        origin: {
          lane: Math.round(box(lanes).left),
          region: firstRegion ? Math.round(box(firstRegion).left) : null,
          bar: firstBar ? Math.round(box(firstBar).left) : null,
        },
        headerTops: headerRows.map((row) => Math.round(box(row).top)),
        headerHeights: headerRows.map((row) => Math.round(box(row).height)),
        laneTops: laneRows.map((row) => Math.round(box(row).top)),
        laneHeights: laneRows.map((row) => Math.round(box(row).height)),
        overflow: headerRows.map((row) => {
          const r = box(row);
          const inner = row.firstElementChild;
          const kids = inner ? [...inner.children].map((child) => box(child)) : [];
          return kids.length ? Math.round(Math.max(...kids.map((kid) => kid.right)) - r.right) : 0;
        }),
        nameWidths: headerRows.map((row) => {
          const id = (row.getAttribute("data-testid") ?? "").replace("arrangement-header-row-", "");
          const name = document.querySelector(`[data-testid='track-name-${id}']`);
          return name ? Math.round(box(name).width) : 0;
        }),
      };
    });
    if (gridGeometry.error) throw new Error(gridGeometry.error);
    const origin = gridGeometry.origin;
    if (origin.region === null || origin.bar === null || Math.abs(origin.region - origin.lane) > 1 || Math.abs(origin.bar - origin.lane) > 1) {
      throw new Error(
        `the lane column, the first ruler bar and the first region must share one origin on ${target.name}: ` +
          `lane ${origin.lane}, bar ${origin.bar}, region ${origin.region}`
      );
    }
    if (gridGeometry.headerTops.length !== gridGeometry.laneTops.length) {
      throw new Error(
        `the grid draws ${gridGeometry.headerTops.length} header row(s) but ${gridGeometry.laneTops.length} lane row(s) on ${target.name}`
      );
    }
    gridGeometry.headerTops.forEach((top, index) => {
      if (top !== gridGeometry.laneTops[index] || gridGeometry.headerHeights[index] !== gridGeometry.laneHeights[index]) {
        throw new Error(
          `header ${index} is at ${top}px/${gridGeometry.headerHeights[index]}px against its lane at ` +
            `${gridGeometry.laneTops[index]}px/${gridGeometry.laneHeights[index]}px on ${target.name} — the two columns must share one row height`
        );
      }
    });
    const overflowingHeaders = gridGeometry.overflow.filter((px) => px > 0);
    if (overflowingHeaders.length) {
      throw new Error(`track header content overflows its column by ${overflowingHeaders.join(", ")} px on ${target.name}`);
    }
    const namelessHeaders = gridGeometry.nameWidths.filter((width) => width < 8);
    if (namelessHeaders.length) {
      throw new Error(`a track header draws no readable name on ${target.name} (widths ${gridGeometry.nameWidths.join(", ")})`);
    }
    console.log(
      `   · grid: ${gridGeometry.headerTops.length} row(s), headers and lanes aligned, names ` +
        `${Math.min(...gridGeometry.nameWidths)}-${Math.max(...gridGeometry.nameWidths)} px (${target.name})`
    );

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
    const playBtn = await page.$("[data-testid='arrangement-play']");
    if (playBtn) {
      await playBtn.click({ force: true });
      await page.waitForTimeout(250);
      const playheadCheck = await page.evaluate(() => {
        const beam = document.querySelector("[data-testid='arrangement-playhead']");
        const activeCell = document.querySelector("[data-testid='arrangement-playhead']");
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





    /**
     * ⭐ **Sections 1.5–1.11 — the whole phone-shell leg — were removed on 2026-10-02 with the mobile
     * version.**
     *
     * They walked `/m/home`, `/m/jam`, `/m/challenge`, `/m/explore` and `/m/more` and asserted the
     * shell's tabs, rows, player and sheets. `4dffdf0` deleted the shell and the `/m/<module>` route
     * space, so every `waitForSelector('[data-testid="mobile-shell"]')` there waited 45 s for
     * something that can never mount — and because the leg had no `target.isMobile` guard (it was
     * written to run on every target on purpose, while the route was URL-only), the desktop matrix ran
     * it and the *release* matrix failed. A criterion must not express "this does not exist" as a
     * timeout, so the leg is deleted rather than skipped: the shell it exercised lives on
     * `mobile-preserved`, and bringing the phone targets back is a decision, not a repair (see the
     * note in `ALL_TARGETS`). The checks that legitimately run on a phone — 2.3 and the inspector's
     * sheet branch — already sit behind `target.isMobile` / the 1024 px breakpoint and are untouched.
     */
    // Back to the app: the checks below measure the surface under test.
    await page.goto(`${baseUrl}/?tab=studio`, { waitUntil: "domcontentloaded" });
    await ensureArrangementMounted(page);

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
     * Measured before this check existed (the phone-surface probe, since removed with the shell, 390×664): the header
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
        /** ⭐ Empty: the controls it excused belonged to the studio toolbar and the phone shell, and both are gone. */
        const ALLOWED_SMALL = new Set<string>([]);
        const selector = 'button, select, input, textarea, [role="button"], [tabindex="0"]';
        const small = [];
        const headerControls = [];
        for (const node of Array.from(document.querySelectorAll(selector))) {
          // Step cells only. The track headers live *inside* the grid container too, and skipping
          // the whole `[role="grid"]` subtree is how five tiny header controls (4×20, 14×14 …) went
          // unnoticed by the first version of this check.
          if (node.closest('[role="gridcell"]')) continue;
          // Reused *desktop* views (探索 → 和弦走向) keep their own control sizes on purpose: the user
          // asked for those modules to come along rather than be rebuilt. The phone's own chrome is
          // still held to 44 px; this exemption is scoped to the wrapper the reuse declares.
          if (node.closest('[data-legacy="desktop"]')) continue;
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

    /**
     * 5d. Skins on the big surfaces (v2.9.2).
     *
     * The six skins were the phone shell's; they are the whole app's now. The palette is generated from the
     * phone's own tokens (`scripts/desktop_skins.mjs` → `src/styles/desktopSkins.css`), so what this leg has
     * to prove is the wiring: the desktop settings panel offers them, choosing one writes `data-skin` on the
     * document root and persists it to the shared key, the *palette actually moves*, and it can be put back
     * — later legs run in the same page and would otherwise be themed by this one.
     *
     * It runs on every target and skips itself on a phone-sized one, where the shell's own picker (更多 →
     * 外观) is the surface and is covered by leg 1.11.
     */
    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-surface='desktop']", { timeout: 30000 });
    if (await page.$("[data-surface='desktop']")) {
      await page.click("[data-testid='header-settings-open']");
      await page.click("[data-testid='settings-tab-interface']");
      await page.waitForSelector("[data-testid='settings-skins']", { timeout: 20000 });
      const before = await page.evaluate(() => ({
        skin: document.documentElement.getAttribute("data-skin"),
        bg: getComputedStyle(document.documentElement).getPropertyValue("--d-bg").trim(),
      }));
      await page.click("[data-testid='settings-skin-minimal']");
      await page.waitForTimeout(300);
      const after = await page.evaluate(() => ({
        skin: document.documentElement.getAttribute("data-skin"),
        bg: getComputedStyle(document.documentElement).getPropertyValue("--d-bg").trim(),
        stored: localStorage.getItem("groove_skin_v1"),
        body: getComputedStyle(document.body).backgroundColor,
      }));
      if (after.skin !== "minimal" || after.stored !== "minimal") {
        throw new Error(`Desktop skin picker did not apply/persist: ${JSON.stringify(after)}`);
      }
      if (after.bg === before.bg) {
        throw new Error(`Desktop palette did not change with the skin (--d-bg stayed ${before.bg})`);
      }
      // The page ground has to follow the palette, not just the custom property.
      if (after.body === "rgb(10, 11, 13)" && before.bg === "10 11 13") {
        throw new Error(`Desktop page ground ignored the skin (body stayed ${after.body})`);
      }
      /**
       * Put it back before the modal closes: the rest of the matrix runs in this page.
       *
       * Dispatched rather than clicked. The skin buttons are `transition-all`, and now that the skin sheets apply
       * their `hover:` states for real (they used to be emitted without the pseudo-class and therefore did
       * nothing), Playwright's actionability check — which waits for two identical frames — spent its 30 s budget
       * on this one click while the machine was loaded by the rest of the matrix. The assertion here is about the
       * *palette*, not about whether a finger can hit it; the touch-target leg already covers that.
       */
      await page.$eval("[data-testid='settings-skin-default']", (el) => el.click());
      await page.waitForTimeout(200);
      const restored = await page.evaluate(() => document.documentElement.getAttribute("data-skin"));
      if (restored !== "default") throw new Error(`Desktop skin did not restore to default (${restored})`);
      await page.keyboard.press("Escape");
    }

    /**
     * 5e. Export MP3 downloads a real MP3 (v2.12.0).
     *
     * The report that started this was "PC and iPad have no WAV/MP3 export", and the two causes were both
     * invisible to a code review: the entry was behind the advanced-controls toggle *and* nested in another
     * control's JSX branch. A leg that only asserted the menu item exists would have passed the whole time. So
     * this clicks it and inspects the bytes: the encoder is a lazy chunk, and the only way to know it is wired,
     * fetched and producing MPEG frames is to download the file and look.
     *
     * Desktop targets only: the phone exposes the same handler as a sheet row (its own leg covers the row).
     */
    if (await page.$("[data-surface='desktop']")) {
      await page.goto(`${baseUrl}/?tab=studio`, { waitUntil: "domcontentloaded" });
    await ensureArrangementMounted(page);
      await page.waitForSelector("[data-testid='arrangement-export-menu']", { timeout: 30000 });
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 120000 }),
        (async () => {
          await page.click("[data-testid='arrangement-export-menu']");
          await page.waitForSelector("[data-testid='arrangement-export-mp3']", { timeout: 10000 });
          await page.click("[data-testid='arrangement-export-mp3']");
        })(),
      ]);
      const filename = download.suggestedFilename();
      if (!filename.endsWith(".mp3")) throw new Error(`MP3 export produced ${filename}`);
      const file = await download.path();
      const bytes = fs.readFileSync(file);
      // An MPEG audio frame sync is eleven set bits: 0xFF then the top three bits of the next byte.
      const frameSync = bytes.length > 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
      if (!frameSync) throw new Error(`MP3 export is not an MPEG stream (first bytes ${bytes[0]}, ${bytes[1]})`);
      if (bytes.length < 20 * 1024) throw new Error(`MP3 export is suspiciously small: ${bytes.length} bytes`);
      console.log(`      export: ${filename} · ${(bytes.length / 1024).toFixed(1)} KiB · MPEG frame sync ✓`);
    }

    // 5c. Audio settings panel (v2.0.17).
    //
    // The engine-level settings (GS-1 voices, master level, hearing protection, latency
    // compensation) had no UI at all until this milestone; this asserts they are reachable
    // and live at *every* viewport, not merely that the component renders in jsdom. The
    // panel must reflect engine state, so toggling and dragging have to produce real
    // observable changes rather than a static picture of the defaults.
    await page.goto(`${baseUrl}/?tab=studio`, { waitUntil: "domcontentloaded" });
    await ensureArrangementMounted(page);
    // React mounts after `domcontentloaded`, so wait for the toolbar itself before querying.
    // React mounts after `domcontentloaded`, so wait for a shell before querying.
    await page
      .waitForSelector(
        /** ⭐ The studio kept its audio settings behind the toolbar's advanced drawer; the arrangement surface puts the same panel behind
         * the header's settings button, whose own default tab is audio (`SettingsModal`'s `initialTab`). Both are accepted, so the block
         * still asserts what it always did: that the audio-settings entry point is reachable in this shell. */
        "[data-testid='header-settings-open']", {
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
    /** ⭐ One entry point now: the header's settings button, whose own default tab is audio (`initialTab = "audio"`). */
    const AUDIO_SETTINGS_ENTRY = "[data-testid='header-settings-open']";
    if (!(await page.$(AUDIO_SETTINGS_ENTRY))) {
      const diag = await page.evaluate(() => ({
        viewport: { w: window.innerWidth, h: window.innerHeight },
      }));
      throw new Error(`Audio settings panel has no entry point on this viewport :: ${JSON.stringify(diag)}`);
    }
    // A sheet row can start below the fold, so scroll it into view before clicking.
    await clickSheetRowAndVerify(
      page,
      AUDIO_SETTINGS_ENTRY,
      "[data-testid='audio-settings-gs1-toggle']",
      "audio settings"
    );
    await page.waitForSelector("[data-testid='audio-settings-gs1-toggle']", { timeout: 45000 });

    /**
     * GS-1 ships **on** by default — but the default is not the invariant, and asserting it as one is what made this test fail on two different iPhone targets
     * (74.45 s and 86.93 s) while the application was behaving correctly.
     *
     * `AudioEngine.probeLiveGs1()` **measures** whether this browser renders the GS-1 core audibly and switches it off when it does not — its own comment says
     * "measured, not guessed", and Safari's worklet is the case it was written for. The panel then renders OFF **faithfully**, through the one shared store
     * (`useGs1Setting` → `useSyncExternalStore` → `isGs1RoutingEnabled`). And the verdict races the first user gesture: before audio unlock the probe returns
     * `unmeasured`, which the code says "changes nothing" — which is why an earlier run of the same suite was green.
     *
     * So the invariant is: **GS-1 is on, or it can be turned on, and the switch is a genuine state change.** That holds in every browser, and it still fails if
     * the panel is inert.
     *
     * The stronger form — OFF is acceptable only when the page logged the measured reason — needs `page.on("console")` attached **before** the panel opens, so the
     * warning has not already been emitted. That is recorded in `docs/WORKSTREAM_STATUS.md` rather than guessed at here, because this harness cannot be run on the
     * development machine.
     */
    const gs1Toggle = await page.$("[data-testid='audio-settings-gs1-toggle']");
    const gs1Before = await gs1Toggle.getAttribute("aria-pressed");
    if (gs1Before !== "true") {
      // Off at first read: turn it on, and require that the panel actually reflects it. A runtime capability probe is allowed to change the default; an inert
      // switch is not.
      await gs1Toggle.click({ force: true });
      await page.waitForTimeout(200);
      const gs1AfterFirstClick = await gs1Toggle.getAttribute("aria-pressed");
      if (gs1AfterFirstClick !== "true") {
        throw new Error(
          `GS-1 reads ${gs1Before} and would not turn on (got ${gs1AfterFirstClick}) — the panel is inert, which is the failure this test is for`
        );
      }
      // Now it is on, so the rest of the case (which flips it off and checks the state change) starts from the documented default.
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
    /**
     * ⭐ **Give React a frame to render the new number before reading it.**
     *
     * The dispatch above is the documented way to drive a controlled input, and the panel's handler is a real one -- but the value it
     * shows is React state, so it lands in the DOM on the next render, not synchronously with the event. Reading straight afterwards
     * saw the old number and reported the fader as stuck. The assertion is unchanged: the number must still change, and a fader that
     * really is inert still fails, one poll later.
     */
    await page
      .waitForFunction(
        (before) => {
          const el = document.querySelector("[data-testid='audio-settings-master-value']");
          return Boolean(el) && el.textContent !== before;
        },
        masterBefore,
        { timeout: 5000 }
      )
      .catch(() => null);
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
      /**
       * ⭐ **Retired with the studio's two-column layout (owner's decision, 2026-10-07).**
       *
       * This measured `main.grid`: the column holding the transport group and the dossier `<aside>`, with the dossier required to sit left of
       * the editor above `lg` and above it below -- plus a bound that the editor took at least 55% of the viewport. That grid went with
       * `StudioView`, and the arrangement surface is a single column with no dossier, so there is no second column for an order to be
       * wrong about. The owner read the choice as retire rather than re-express, and it is the honest one: a bound on a layout that no
       * longer has two parts is a claim about nothing. What replaces it is the checks around it, which measure the surface that exists.
       */

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
        /**
         * ⭐ **The carrier changes; the claim does not.**
         *
         * This asserts three things a person feels: the `--app-header-h` token matches the header's real height, the transport is inside the
         * viewport once the page is scrolled, and a hit test at the transport's centre lands on the transport rather than on something
         * covering it. The studio's carrier was the toolbar group inside a `div.sticky`; the arrangement surface puts the transport in
         * `arrangement-transport` inside the arrangement view, so those are what the same three assertions are measured against.
         */
        const header = document.querySelector("header");
        /**
         * ⭐ **The carrier is the toolbar, not the status span.**
         *
         * `arrangement-transport` is a status span — "audio engine not connected yet", "planned N lane events",
         * "preparing" — and it is **empty** once the engine is connected and nothing is playing. An empty flex span has
         * zero height, so its centre is exactly the header's bottom edge and the hit test landed on `header.sticky` on
         * all three desktop browsers (measured 2026-10-07). The studio's carrier was its transport group, which held the
         * play/stop cluster and could not be empty; the arrangement's equivalent is the toolbar that holds the same
         * cluster, so that is what the claim is measured against.
         */
        const group = document.querySelector(
          "[data-testid='arrangement-toolbar'], [data-testid='toolbar-group-transport']"
        );
        const panel =
          document.querySelector("[data-testid='arrangement-view-v2']") ??
          group?.closest("div.sticky")?.parentElement;
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
      /**
       * ⭐ **Retired with the studio's sticky toolbar (owner's precedent, 2026-10-07).**
       *
       * This required the transport's top edge to sit within eight pixels of the header's bottom, which is what the studio's toolbar did: it
       * was `sticky top-[var(--app-header-h)]`, so it parked under the header for the whole scroll. The arrangement surface's transport is
       * a plain row inside the view and scrolls with the content, so a bound that says "parked" describes a layout this surface does not
       * have. The reachability assertions above it -- inside the viewport, and a hit test that lands on the transport -- are the ones that
       * still describe something a person feels, and they are unchanged.
       */
      // Put the page back where the rest of the run expects it.
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "auto" }));
    }

    /**
     * On a phone the same panel is reached from the tab bar's "More" sheet, not the header: the
     * header is a title bar there (see 2.3), and the sheet row is the identical entry point behind a
     * bigger target. Same panel, same assertions — only the way in differs.
     */
    const settingsEntry = "[data-testid='header-settings-open']";
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
    await page.waitForSelector("[data-testid='settings-tab-audio']", { timeout: 45000 });
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
    /**
     * ⭐ **Retired with the studio toolbar's GS-1 chip (owner's precedent, 2026-10-07).**
     *
     * The studio carried a GS-1 chip in its advanced drawer, and this compared it with the settings panel that had just turned the flag off.
     * The chip has one producer, `sequencer/Toolbar.tsx`, and the arrangement surface has no drawer to open, so on a desktop target the
     * guard above it was false and the helper threw before any assertion ran. The capability is covered where it now lives: the panel's own
     * criteria drive `audio-settings-gs1-toggle` and read the flag back. What is left below is the phone path, which reaches the same panel
     * through the studio sheet.
     */

    /**
     * ⭐ **The track inspector's block is retired (owner's precedent, 2026-10-07).**
     *
     * It opened the inspector from `track-header-0` and measured its dock/sheet geometry, its three tabs, the effects
     * page's signal chain and curve drag, and the timbre picker's search and category chips. The v2 arrangement surface
     * renders **no** `TrackInspector`: the component's only remaining consumers are its own unit tests
     * (`trackInspector.test.tsx`, `insertEffectsPage.test.tsx`), so `track-header-0` is not in the document on any target
     * and this block failed at its first click.
     *
     * Retired rather than re-expressed: the arrangement's detail panel (`arrangement-detail`) and its instrument mapping
     * (`import-instrument-mapping`) are different surfaces with their own criteria, and inventing a hit test for a
     * component nothing renders is the "assert a layout the app does not have" failure this file has already retired
     * twice (the parked-under-header bound, and the studio toolbar's GS-1 chip). The dead components are recorded in the
     * ledger as a cleanup, not kept here as coverage.
     */


    // 5f. Piano roll (item ⑦): it must edit the studio's OWN pattern.
    //
    // The whole claim of the roll is that it is another view of the same data, not a second copy.
    // So this draws a note in the roll and then requires the step grid to show it — a cross-view
    // assertion, which is the part that could silently break.
    //
    // The phone shell has no roll (see `openPianoRoll`), so there this step asserts the *notice*
    // instead: an omitted feature must be visibly omitted, with a route to the alternative, not
    // simply absent.
    /**
     * 5f. ★ The arrangement's roll (v2), which replaced the studio's piano-roll drawer.
     *
     * ⭐ **The block that lived here was the studio's roll**: its drawer geometry, fullscreen/collapse chrome, tool
     * strip, marquee, legato, velocity lane and announcer — and none of those surfaces exist on the arrangement. The
     * v2 roll (`PianoRollV2`) is a single panel whose claims are: it shows the selected track's notes, its length is
     * the arrangement's length, a press on an empty cell writes a note into the model, Delete removes the selected
     * one, and it states the velocity a written note gets. This leg measures those in the browser, where the geometry
     * and the pointer path are real; the keyboard, resize and marquee behaviour has its own criteria in
     * `pianoRollV2.test.tsx`.
     */
    const rollShell = await openPianoRoll(page);
    if (rollShell === null) {
      throw new Error(`The arrangement's piano roll did not open on ${target.name}`);
    }
    await page.waitForSelector("[data-testid='roll-grid']", { timeout: 45000 });
    if (!(await (await page.$("[data-testid='roll-grid']")).boundingBox())) {
      throw new Error("The arrangement's roll grid has no measurable box");
    }

    // The roll states the arrangement's own length, and its +/− move that number in the model too.
    const barsInputBefore = await page.inputValue("[data-testid='arrangement-bars']");
    await clickVerified(page, "[data-testid='roll-add-bar']");
    await page.waitForTimeout(250);
    const barsAfterAdd = {
      roll: ((await page.textContent("[data-testid='roll-bars']")) ?? "").trim(),
      arrangement: await page.inputValue("[data-testid='arrangement-bars']"),
    };
    if (
      !barsAfterAdd.roll.startsWith(String(Number(barsInputBefore) + 1)) ||
      barsAfterAdd.arrangement !== String(Number(barsInputBefore) + 1)
    ) {
      throw new Error(
        `The roll's add-bar did not change the arrangement's length on ${target.name}: ` +
          `bars ${barsInputBefore} -> roll "${barsAfterAdd.roll}", arrangement ${barsAfterAdd.arrangement}`
      );
    }
    await clickVerified(page, "[data-testid='roll-remove-bar']");
    await page.waitForTimeout(250);
    const barsRestored = await page.inputValue("[data-testid='arrangement-bars']");
    if (barsRestored !== barsInputBefore) {
      throw new Error(`The roll's remove-bar did not restore the length (${barsRestored} vs ${barsInputBefore}) on ${target.name}`);
    }

    // A press on an empty cell writes a note; the roll is a reading of `notesByTrack`, so the note appears in it.
    const emptyCell = await page.evaluate(() => {
      for (const cell of document.querySelectorAll("[data-testid^='roll-cell-']")) {
        const id = cell.getAttribute("data-testid") ?? "";
        const key = id.replace("roll-cell-", "");
        if (!document.querySelector(`[data-testid='roll-note-${key}']`)) return id;
      }
      return null;
    });
    if (!emptyCell) throw new Error("The arrangement's roll has no empty cell to write into");
    const notesBefore = (await page.$$("[data-testid^='roll-note-']")).length;
    await clickVerified(page, `[data-testid='${emptyCell}']`);
    await page.waitForTimeout(300);
    const notesAfter = (await page.$$("[data-testid^='roll-note-']")).length;
    if (notesAfter !== notesBefore + 1) {
      throw new Error(`Writing in the roll did not add one note on ${target.name} (${notesBefore} -> ${notesAfter})`);
    }
    // A written note is the selected one, so the keys act on it; Delete takes it back out and leaves the run clean.
    const written = await page.evaluate(() =>
      document.querySelector("[data-testid^='roll-note-'][data-selected='true']")?.getAttribute("data-testid") ?? null
    );
    if (!written) throw new Error("The note written in the roll is not marked selected");
    await page.keyboard.press("Delete");
    await page.waitForTimeout(300);
    const notesRestored = (await page.$$("[data-testid^='roll-note-']")).length;
    if (notesRestored !== notesBefore) {
      throw new Error(`Delete did not remove the note the roll wrote (${notesRestored} vs ${notesBefore}) on ${target.name}`);
    }

    // The velocity readout is the one a written note gets, and it must state a value rather than be blank.
    const velocityShown = ((await page.textContent("[data-testid='roll-velocity-value']")) ?? "").trim();
    if (velocityShown === "") throw new Error("The roll's velocity readout is missing");
    console.log(
      `   · roll: ${barsInputBefore} bars, wrote and removed a note, velocity ${velocityShown} (${target.name})`
    );


    // 5g. Switching genre *while playing* (the case that shipped broken).
    //
    // A single click used to trigger 5–13 `pushState` calls and up to 9 pattern flips, because the
    // genre-sync effect depended on callback identities that every render reallocated: switch →
    // onSelectGenre → navigate → re-render → effect again → switch again. On Safari that showed as
    // the two genres swapping continuously with the display flickering. The matrix never exercised
    // this, so nothing caught it — this check does, on every engine, by measuring the app's own
    // activity rather than trusting a screenshot.
    await page.goto(`${baseUrl}/?tab=studio`, { waitUntil: "domcontentloaded" });
    await ensureArrangementMounted(page);
    await page.waitForSelector(
      "[data-testid='arrangement-view-v2']",
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
      /** ⭐ The roll's own notes: where each sits, and whether it is marked. The step matrix this read is gone. */
      const signature = () =>
        [...document.querySelectorAll("[data-testid='roll-grid'] [data-selected]")]
          .map((n) => `${Math.round(n.getBoundingClientRect().left)}:${n.getAttribute("data-selected") ?? ""}`)
          .join("|");
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

  /**
   * The child: run exactly the filtered target and exit with its verdict.
   *
   * Deliberately *not* wrapped in the parent's retry/summary machinery — a child that is killed for hanging must
   * not be restarted by a retry, or the watchdog would just buy the hang another eight minutes.
   */
  if (RUN_ONE) {
    const only = targets[0];
    if (!only) {
      log(`❌ --one matched no target`);
      process.exit(1);
    }
    const result = await runTestOnTarget(only, baseUrl);
    if (!result.success) log(`   Error details: ${result.error}`);
    server.close();
    process.exit(result.success ? 0 : 1);
  }

  for (const target of targets) {
    // One line per target, written as the target starts and again when it finishes: with the log
    // on disk, a run that is still going looks like progress instead of a hang.
    log(`⏳ Testing ${target.name} ...`);
    const start = Date.now();
    /**
     * Each target runs in its own process so a wedged browser can be **killed**.
     *
     * `runTestOnTarget` closes its browser in a `finally`, which is enough for a failure and useless for a hang:
     * the `finally` only runs once the body finishes, and the body is what is stuck. A child process can be
     * killed by the OS, which is the only thing that works on a stall inside WebKit.
     */
    const child = TARGET_TIMEOUT_MS > 0
      ? spawnSync(process.execPath, [process.argv[1], `--target=${target.name}`, "--one"], {
          timeout: TARGET_TIMEOUT_MS,
          stdio: "inherit",
          env: process.env,
        })
      : null;
    const timedOut = Boolean(child && (child.signal === "SIGTERM" || child.error?.code === "ETIMEDOUT"));
    let res = timedOut
      ? {
          success: false,
          error: `target hung: killed after ${Math.round(TARGET_TIMEOUT_MS / 1000)}s with no verdict ` +
            `(set E2E_TARGET_TIMEOUT_MS=0 to disable the watchdog)`,
        }
      : child
        ? { success: child.status === 0, error: child.status === 0 ? null : `child exited with ${child.status}` }
        : await runTestOnTarget(target, baseUrl);
    let retried = false;
    // A hang is not retried: it is a property of the target, and the second attempt would hang the same way.
    if (!res.success && !timedOut) {
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
