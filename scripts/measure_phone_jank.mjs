#!/usr/bin/env node
/**
 * Phone jank audit.
 *
 * The user's report: "检查和优化下手机上程序性能体验，不要有卡顿之类体验" — look at the phone's runtime
 * feel and make sure it does not stutter.
 *
 * ## Why a separate probe from `perf:check`
 *
 * `measure_live_perf.mjs` measures *load*: how many bytes, how many chunks, when the first paint lands. That
 * is the wrong instrument for "it stutters while I use it". Stutter is the main thread being busy when the
 * user does something, so this walks the phone shell the way a thumb does — cold load, scroll the library,
 * open a genre, open the player and let the record spin, then every module tab and every 探索 sub-tab — and
 * records, per step:
 *
 *   - **long tasks** (`PerformanceObserver("longtask")`): count, total and worst blocked time. >50 ms is
 *     the threshold at which a tap feels late; a single 200 ms task is a visible hitch.
 *   - **frame deltas** sampled from `requestAnimationFrame`: the worst frame and the fraction of frames
 *     over 32 ms (two frames at 60 Hz). A janky animation shows up here even when no task is "long".
 *   - **DOM size** and **image requests**, because both are cheap to measure and both are what makes a
 *     phone's rendering slow.
 *
 * The thresholds at the bottom are deliberately loose — this runs on a throttled profile of a *build*, on
 * whatever machine CI gives us, and a probe that cries wolf gets ignored. They are set to catch the
 * difference between "smooth" and "hitching", not to grade the last millisecond.
 *
 * Usage:
 *   node scripts/measure_phone_jank.mjs            # serves dist/ on an ephemeral port
 *   node scripts/measure_phone_jank.mjs --json     # machine-readable
 *   node scripts/measure_phone_jank.mjs --no-throttle
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "playwright";

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const argValue = (name, fallback) => {
  const inline = argv.find((a) => a.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index !== -1 && argv[index + 1] ? argv[index + 1] : fallback;
};

const json = flag("--json");
const throttle = !flag("--no-throttle");
/**
 * Which build to measure.
 *
 * `--dist <dir>` exists because this is a *comparison* instrument: the machine this runs on is shared,
 * and a cold/warm cache or a background build moves absolute numbers by an order of magnitude (an
 * unthrottled cold load measured 67 ms in one session and 976 ms in another, on the same code). Only an
 * A/B/A/B run against two builds in the same session says anything about a change, and that needs to
 * point the probe at an arbitrary directory.
 */
const dist = path.resolve(argValue("--dist", path.join(ROOT, "dist")));

/** The static server the matrix uses, trimmed to what a page load needs. */
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
      let file = path.join(dist, rel);
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, "index.html");
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, () => resolve({ server, port: server.address().port }));
  });
}

/** Instrumentation, installed before the app boots so Step 1 is measured too. */
const INSTRUMENT = () => {
  const state = { longTasks: [], frames: [], images: 0, imageBytes: 0 };
  window.__jank = state;
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) state.longTasks.push(Math.round(entry.duration));
    }).observe({ entryTypes: ["longtask"] });
  } catch {
    /* not every engine exposes longtask; the frame sampler still works */
  }
  let last = 0;
  const sample = (now) => {
    if (last) state.frames.push(Math.round(now - last));
    last = now;
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        state.images += 1;
        state.imageBytes += entry.transferSize || 0;
      }
    }).observe({ type: "resource", buffered: true });
  } catch {
    /* ignore */
  }
};

const reset = (page) =>
  page.evaluate(() => {
    window.__jank.longTasks.length = 0;
    window.__jank.frames.length = 0;
  });

const read = (page) =>
  page.evaluate(() => {
    const { longTasks, frames } = window.__jank;
    const sorted = [...longTasks].sort((a, b) => b - a);
    const ordered = [...frames].sort((a, b) => a - b);
    const median = ordered.length ? ordered[Math.floor(ordered.length / 2)] : 0;
    /**
     * "Jank" is a frame that is out of step with the device's *own* rhythm, not a frame over 32 ms.
     *
     * The record deliberately drops to ~30 fps when a phone cannot hold 60 (see the pacing note in
     * `VinylCanvas`), and on a 4×-throttled profile even a comfortable frame is ~40 ms — so a fixed 32 ms
     * line called a *steady* 30 fps "100 % janky", which is the opposite of what it is. What the eye
     * notices is the outlier: a frame that takes more than half again as long as the frames around it (and
     * at least 50 ms in absolute terms). That is what this counts.
     */
    const jankLine = Math.max(50, median * 1.6);
    const over32 = frames.filter((f) => f > jankLine).length;
    return {
      longTasks: longTasks.length,
      blockedMs: longTasks.reduce((sum, value) => sum + value, 0),
      worstTaskMs: sorted[0] ?? 0,
      frames: frames.length,
      medianFrameMs: median,
      worstFrameMs: frames.length ? Math.max(...frames) : 0,
      framesOver32: over32,
      jankyFramePct: frames.length ? Math.round((over32 / frames.length) * 1000) / 10 : 0,
      nodes: document.getElementsByTagName("*").length,
      images: window.__jank.images,
      imageKb: Math.round(window.__jank.imageBytes / 1024),
    };
  });

async function main() {
  if (!fs.existsSync(path.join(dist, "index.html"))) {
    console.error("❌ dist/index.html is missing — build first (`npm run build`).");
    process.exit(1);
  }
  const { server, port } = await startServer();
  const base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch();
  const context = await browser.newContext({
    ...devices["Pixel 7"],
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  await context.addInitScript(INSTRUMENT);

  const page = await context.newPage();
  const steps = [];
  const step = async (name, run) => {
    await reset(page);
    await run();
    await page.waitForTimeout(700);
    const measured = await read(page);
    steps.push({ step: name, ...measured });
    if (!json) {
      const parts = [
        `long ${measured.longTasks} (worst ${measured.worstTaskMs} ms, blocked ${measured.blockedMs} ms)`,
        `frames ${measured.frames}`,
        `median ${measured.medianFrameMs} ms`,
        `worst ${measured.worstFrameMs} ms`,
        `outliers ${measured.jankyFramePct}%`,
        `DOM ${measured.nodes}`,
      ];
      console.log(`  ${name.padEnd(26)} ${parts.join("  |  ")}`);
    }
  };

  const goto = async (url, waitFor) => {
    await page.goto(`${base}${url}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(waitFor, { timeout: 45000 });
  };

  if (throttle) {
    const client = await context.newCDPSession(page);
    await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }

  console.log(`\n📱 PHONE JANK AUDIT   ${base}${throttle ? "   (4x CPU)" : ""}\n`);

  await step("cold load → 首页", async () => {
    await goto("/m/home", '[data-testid^="mobile-genre-row-"]');
    await page.waitForTimeout(1200);
  });

  await step("scroll the library", async () => {
    for (let i = 0; i < 6; i += 1) {
      await page.evaluate(() => window.scrollBy({ top: window.innerHeight * 0.9, behavior: "instant" }));
      await page.waitForTimeout(120);
    }
  });

  await step("open a genre", async () => {
    const row = await page.$('[data-testid^="mobile-genre-row-"]');
    if (row) await row.click();
    await page.waitForSelector('[data-testid="mobile-genre-detail"]', { timeout: 45000 });
    await page.waitForTimeout(600);
  });

  await step("open the player", async () => {
    await goto("/m/home?player=1&genre=deep-house", '[data-testid="mobile-vinyl-canvas"]');
    await page.waitForTimeout(1500);
  });

  await step("player: record spinning", async () => {
    const play = await page.$('[data-testid="mobile-player-play"]');
    if (play) await play.click();
    await page.waitForTimeout(2500);
  });

  for (const [name, module, waitFor] of [
    ["即兴", "jam", '[data-testid="mobile-jam-tempo"]'],
    ["挑战", "challenge", '[data-testid^="mobile-challenge-option-"]'],
    ["探索 · 和弦", "explore", '[data-testid="mobile-explore-chords-legacy"]'],
  ]) {
    await step(`tab → ${name}`, async () => {
      await goto(`/m/${module}`, '[data-testid="mobile-module-bar"]');
      await page.waitForSelector(waitFor, { timeout: 45000 });
      await page.waitForTimeout(1200);
    });
  }

  await step("探索 · 展开和弦工作台", async () => {
    const toggle = await page.$('[data-testid="chord-builder-toggle"]');
    if (toggle) await toggle.click();
    await page.waitForSelector('[data-testid^="chord-style-"]', { timeout: 45000 });
    await page.waitForTimeout(1200);
  });

  for (const [name, waitFor] of [
    ["底鼓设计", '[data-testid="mobile-explore-kick-legacy"] canvas'],
    ["律动层", '[data-testid="tap-sync-pad"]'],
  ]) {
    await step(`探索 → ${name}`, async () => {
      const tab = await page.$(`[data-testid="mobile-explore-tab-${name === "底鼓设计" ? "kick" : "groove"}"]`);
      if (tab) await tab.click();
      await page.waitForSelector(waitFor, { timeout: 45000 });
      await page.waitForTimeout(1600);
    });
  }

  await step("tab → 更多", async () => {
    await goto("/m/more", '[data-testid="mobile-module-bar"]');
    await page.waitForTimeout(1200);
  });

  await page.close();
  await context.close();
  await browser.close();
  server.close();

  const total = {
    longTasks: steps.reduce((sum, s) => sum + s.longTasks, 0),
    blockedMs: steps.reduce((sum, s) => sum + s.blockedMs, 0),
    worstTaskMs: Math.max(...steps.map((s) => s.worstTaskMs)),
    worstFrameMs: Math.max(...steps.map((s) => s.worstFrameMs)),
    worstNodes: Math.max(...steps.map((s) => s.nodes)),
    imageKb: steps.at(-1).imageKb,
  };

  if (json) {
    console.log(JSON.stringify({ steps, total }, null, 2));
  } else {
    console.log(
      `\n  WORST: task ${total.worstTaskMs} ms   frame ${total.worstFrameMs} ms   DOM ${total.worstNodes}   images ${total.imageKb} KB` +
        `\n  BLOCKED: ${total.blockedMs} ms across ${total.longTasks} long task(s)\n`
    );
  }

  /**
   * The budgets — a regression tripwire, per step, set from measurements rather than from hope.
   *
   * Two kinds of step need two kinds of question. A **navigation** step (a load, a tab, a page) is about
   * how long the main thread was blocked before the user could act, so blocked time and the worst task are
   * the right measures. An **animation** step (the record spinning) is about rhythm: under a 4× CPU
   * throttle every painted frame legitimately becomes a ~100 ms task, and summing those calls a *smooth*
   * 30 fps "3 700 ms blocked". So the animation step is judged on the median frame, the worst frame and
   * the share of frames that are out of step with the device's own rhythm — the thing the eye notices.
   *
   * The numbers come from the interleaved A/B runs recorded in the commit that added this probe. Each has
   * roughly 50 % headroom over the measured value: enough to absorb a shared CI runner, tight enough that
   * a real regression trips it.
   */
  const NAVIGATION = { blockedMs: 2600, worstTaskMs: 1300, worstFrameMs: 1300, nodes: 4000 };
  const ANIMATION = { worstFrameMs: 1400, medianFrameMs: 160, jankyPct: 20 };
  const failures = [];
  for (const s of steps) {
    const budget = s.step.startsWith("player:") ? ANIMATION : NAVIGATION;
    if (budget.blockedMs && s.blockedMs > budget.blockedMs) {
      failures.push(`${s.step}: ${s.blockedMs} ms blocked (limit ${budget.blockedMs})`);
    }
    if (budget.worstTaskMs && s.worstTaskMs > budget.worstTaskMs) {
      failures.push(`${s.step}: worst task ${s.worstTaskMs} ms (limit ${budget.worstTaskMs})`);
    }
    if (s.worstFrameMs > budget.worstFrameMs) {
      failures.push(`${s.step}: worst frame ${s.worstFrameMs} ms (limit ${budget.worstFrameMs})`);
    }
    if (budget.medianFrameMs && s.medianFrameMs > budget.medianFrameMs) {
      failures.push(`${s.step}: median frame ${s.medianFrameMs} ms (limit ${budget.medianFrameMs})`);
    }
    if (s.jankyFramePct > (budget.jankyPct ?? 25)) {
      failures.push(`${s.step}: ${s.jankyFramePct}% out-of-step frames (limit ${budget.jankyPct ?? 25})`);
    }
    if (s.nodes > (budget.nodes ?? 4000)) failures.push(`${s.step}: ${s.nodes} DOM nodes (limit ${budget.nodes})`);
  }
  if (total.imageKb > 4000) failures.push(`library loaded ${total.imageKb} KB of images (limit 4000)`);

  if (failures.length) {
    console.error("❌ Phone jank budget exceeded:");
    for (const failure of failures) console.error(`   · ${failure}`);
    process.exit(1);
  }
  console.log("✅ phone jank budget holds");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
