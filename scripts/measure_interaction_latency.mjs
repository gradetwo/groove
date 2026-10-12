#!/usr/bin/env node
/**
 * Interaction latency probe.
 *
 * Written for a real report: "toggling the GS-1 switch, or switching a track's timbre while the
 * transport is running, often does nothing for a moment, the display lags, and it feels stuck."
 * Guessing at the cause from the source is exactly the wrong move here, because the candidates are
 * in different layers — a synchronous WASM/worklet teardown, a host rebuild per instrument change,
 * React re-rendering the whole studio on every pattern commit, or the scheduler competing with the
 * main thread. This measures them separately.
 *
 * For each interaction it reports:
 *   - **action latency**: click → the DOM actually reflecting the change (what the user waits for)
 *   - **long tasks** on the main thread during the action (count, total, worst) — >50 ms is what
 *     "stuck" feels like, and it is what starves the audio scheduler's lookahead
 *   - **long tasks during playback only**, as a baseline to compare against
 *
 * Usage:
 *   node scripts/measure_interaction_latency.mjs [--url <url>] [--json]
 *
 * Without `--url` it serves `dist/` on an ephemeral port, like the E2E matrix does.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const argValue = (flag, fallback = null) => {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
const asJson = argv.includes("--json");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

function startStaticServer() {
  const dist = path.join(ROOT, "dist");
  if (!fs.existsSync(path.join(dist, "index.html"))) {
    console.error("❌ dist/index.html not found — run `npm run build` first.");
    process.exit(1);
  }
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    let file = path.join(dist, decodeURIComponent(url.pathname));
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      // The app is a single-page application: unknown paths fall back to the shell.
      file = path.join(dist, "index.html");
    }
    const body = fs.readFileSync(file);
    res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

async function importPlaywright() {
  const mod = await import("playwright");
  return mod;
}

const fmt = (n, digits = 1) => (Number.isFinite(n) ? n.toFixed(digits) : "n/a");

async function measure(page, label, action, settle) {
  await page.evaluate(() => {
    window.__probe = { tasks: [] };
  });
  const t0 = await page.evaluate(() => performance.now());
  await action();
  // `settle` waits for the *observable* result of the action (a state flip, a rendered change).
  // Fixed sleeps would be measured as latency, which is how the first version of this probe
  // reported 8 s for a toggle that in reality settles in a few milliseconds.
  await settle();
  const t1 = await page.evaluate(() => performance.now());
  const tasks = await page.evaluate(() => window.__probe?.tasks ?? []);
  const durations = tasks.map((t) => t.duration);
  const row = {
    label,
    /** click → the DOM reflecting the change (what the user waits for). */
    latencyMs: +(t1 - t0).toFixed(1),
    longTasks: durations.length,
    totalBlockedMs: +durations.reduce((s, d) => s + d, 0).toFixed(1),
    worstTaskMs: durations.length ? +Math.max(...durations).toFixed(1) : 0,
    /** ⭐ Where each long task began, relative to the action (same clock: performance.now). */
    tasks: tasks.map((t) => ({ offsetMs: +(t.start - t0).toFixed(1), durationMs: +t.duration.toFixed(1) })),
  };
  // Stream the row as soon as it exists, *before* any later step can throw: the sibling project's
  // WebKit notes record a probe that printed after its assertions and therefore left nothing at all
  // behind on the one run that mattered (§6.10). A measurement script that dies half-way must still
  // have produced the measurements it did take.
  if (!asJson) {
    console.log(
      `${row.label.padEnd(28)} ${String(row.latencyMs).padStart(10)}  ${String(row.longTasks).padStart(9)}  ${String(
        row.totalBlockedMs
      ).padStart(11)}  ${String(row.worstTaskMs).padStart(9)}`
    );
  }
  return row;
}

async function main() {
  const { chromium } = await importPlaywright();
  const explicitUrl = argValue("--url");
  let server = null;
  let baseUrl = explicitUrl;
  if (!explicitUrl) {
    const started = await startStaticServer();
    server = started.server;
    baseUrl = `http://127.0.0.1:${started.port}`;
  }

  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  globalThis.__probePage = page; // ⭐ 失败诊断要用它（catch 在 main 之外 ✓）

  // Long-task observer, installed before the app boots.
  await page.addInitScript(() => {
    window.__probe = { tasks: [] };
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__probe.tasks.push({ start: entry.startTime, duration: entry.duration });
        }
      }).observe({ entryTypes: ["longtask"] });
    } catch {
      /* engines without longtask: the latency column still works */
    }
  });


/** ⭐ Wait for a test id and, on failure, say what it looked for and what the page actually has. */
async function waitForTestId(page, id, timeout = 15000) {
  const sel = `[data-testid='${id}']`;
  try {
    await page.waitForSelector(sel, { timeout });
  } catch (error) {
    let present = [];
    try {
      present = await page.evaluate(() =>
        Array.from(document.querySelectorAll("[data-testid]"))
          .map((el) => el.getAttribute("data-testid"))
          .filter(Boolean)
          .slice(0, 40)
      );
    } catch { /* the page may be gone; the message below still helps */ }
    throw new Error(
      `the probe waited ${timeout} ms for ${sel} and it never appeared.\n` +
      `  test ids present on the page (up to 40): ${present.join(", ") || "(none)"}\n` +
      `  if the control was renamed or moved, update this probe; the id has to exist in src/**.`
    );
  }
}

  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  await page.goto(`${baseUrl}/?tab=studio`, { waitUntil: "domcontentloaded" });
  /**
   * ⭐ **The landing surface is the new-project panel, and the arrangement mounts when a project is created.**
   *
   * From the v2.35.0 landing change onward, `?tab=studio` draws the chooser (`new-project-panel-v2`) and
   * `arrangement-view-v2` only appears after Create — so this probe, which waited for the arrangement straight after
   * the goto, could only ever time out. It did: nightly run 37606029167 (2026-10-07) failed at "Interaction latency
   * budget" with `waited 30000 ms for [data-testid='arrangement-view-v2']` while the page held the panel. The steps
   * below are the ones `test_matrix.js`'s `ensureArrangementMounted` takes, in this probe's own order: the audio gate
   * and the first-run prompt first (they sit above the panel), then the template and Create, then the arrangement.
   */
  await page
    .waitForSelector(
      "[data-testid='audio-start-gate'], [data-testid='first-run-prompt'], [data-testid='new-project-panel-v2'], [data-testid='arrangement-view-v2']",
      { timeout: 45000 }
    )
    .catch(() => {});
  // ⭐ Headless Chromium blocks autoplay until a gesture: the app sits behind a start gate, and
  // every later interaction waits on a studio that never started. Click through it first.
  await page.click("[data-testid='audio-start-button']", { timeout: 5000 }).catch(() => {});
  await page.click("[data-testid='audio-start-gate']", { timeout: 1000 }).catch(() => {});
  // ⭐ Then the first-run prompt, which sits above everything until dismissed.
  await page.click("[data-testid='first-run-prompt-dismiss']", { timeout: 3000 }).catch(() => {});
  await page.click("[data-testid='first-run-prompt-play']", { timeout: 1000 }).catch(() => {});
  // ⭐ Then the chooser, if that is what is on screen: **the samplers template**, because the timbre step below needs a
  // track that plays a catalogue instrument (the chip only exists on a sampler), and a template with music in it so the
  // transport and the roll have something to play and draw.
  await page
    .waitForSelector("[data-testid='new-project-panel-v2'], [data-testid='arrangement-view-v2']", { state: "attached", timeout: 45000 })
    .catch(() => null);
  if (await page.$("[data-testid='new-project-panel-v2']")) {
    /**
     * ⭐ **A DOM click, and the card has to be seen to be selected before Create.**
     *
     * Two measured facts, both from `test_matrix.js`: `force: true` still dispatches at coordinates, and the gate and the
     * prompt are modals that swallow them; and clicking a card and Create in the same tick creates the template the
     * *previous* render held. The first version of this block did the coordinate clicks and produced a **blank synth**
     * arrangement while asking for samplers — which the probe then reported honestly as "no instrument chip", with the
     * track kind beside it. Neither shortcut is used here.
     */
    await page.evaluate(() => document.querySelector("[data-testid='template-samplers']")?.click());
    await page
      .waitForFunction(
        () => document.querySelector("[data-testid='template-samplers']")?.getAttribute("aria-pressed") === "true",
        { timeout: 5000 }
      )
      .catch(() => null);
    await page.waitForTimeout(150);
    await page.evaluate(() => document.querySelector("[data-testid='new-project-create']")?.click());
  }
  await waitForTestId(page, "arrangement-view-v2", 30000);
  await page.waitForTimeout(1500); // let the lazy chunks and the audio graph settle

  const results = [];
  if (!asJson) {
    console.log(`\ninteraction latency probe — ${baseUrl}\n`);
    console.log("action                       settle(ms)  longTasks  blocked(ms)  worst(ms)");
  }

  // 0. Baseline: transport running, hands off.
  await page.click("button:has-text('播放'), button:has-text('Play')", { force: true }).catch(() => {});
  await page.waitForTimeout(800);
  // Not an interaction: this is the main-thread cost of the running transport itself, measured
  // over the same 1.5 s window, so the other rows can be read against a baseline.
  results.push(await measure(page, "baseline (playing, no input)", async () => {}, () => page.waitForTimeout(1500)));

  // 1. GS-1 switch, off then on, through the settings panel (the surface the user used).
  // ⭐ The panel does not always open on the first click right after boot; retry and, if it still
  // refuses, say so instead of waiting fifteen seconds for the toggle inside a panel nobody opened.
  let settingsOpened = false;
  for (let attempt = 1; attempt <= 3 && !settingsOpened; attempt += 1) {
    await page.click("[data-testid='header-settings-open']", { force: true }).catch(() => {});
    settingsOpened = await page
      .waitForSelector("[data-testid='settings-panel-audio'], [data-testid='settings-tab-audio']", { timeout: 4000 })
      .then(() => true)
      .catch(() => false);
    if (!settingsOpened && attempt < 3) await page.waitForTimeout(400);
  }
  if (!settingsOpened) throw new Error("the settings panel did not open after three attempts");
  if (process.env.PROBE_DIAG) {
    await page.waitForTimeout(600);
    const panelIds = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[data-testid]"))
        .map((el) => el.getAttribute("data-testid")).filter(Boolean)
        .filter((id) => /settings|audio|gs1|tab|modal|dialog/i.test(id))
    );
    console.error(`[diag] settings-ish test ids (${panelIds.length}): ${panelIds.join(", ")}`);
  }
  await waitForTestId(page, "audio-settings-gs1-toggle", 15000);
  const gs1 = "[data-testid='audio-settings-gs1-toggle']";
  for (const label of ["GS-1 off", "GS-1 on"]) {
    const expected = await page.getAttribute(gs1, "aria-pressed");
    const target = expected === "true" ? "false" : "true";
    results.push(
      await measure(
        page,
        label,
        async () => {
          await page.click(gs1, { force: true });
        },
        () =>
          page.waitForFunction(
            ({ sel, want }) => document.querySelector(sel)?.getAttribute("aria-pressed") === want,
            { sel: gs1, want: target },
            { timeout: 10000 }
          )
      )
    );
  }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  /**
   * 2. Timbre switching while playing, through the **header's instrument chip**.
   *
   * ⭐ **The inspector this used to drive is gone.** `track-inspector-open-0` and its search belonged to
   * `TrackInspector`, which has no production consumer any more; the probe waited thirty seconds for a control that no
   * surface renders. The v2 path is the chip: it opens the library, a row is a choice, and the choice closes the panel
   * — which is why the observable change is read on the **chip** (`aria-expanded` back to `false` and its name
   * changed), not on the row, because the row is unmounted by the very click that selects it.
   */
  const chip = await page.$("[data-testid^='instrument-open-']");
  if (chip === null) {
    /**
     * ⭐ Say *why* rather than skipping quietly: the chip needs a sampler track **and** a catalogue that has landed, so
     * the two facts are read out beside the skip. (The first version of this line said only "no chip", which is the
     * kind of message that sends the next person to look in the wrong layer.)
     */
    const why = await page.evaluate(() => ({
      kinds: [...document.querySelectorAll("[data-testid^='track-kind-']")].map((el) => `${el.getAttribute("data-testid")}=${el.value ?? el.textContent}`).slice(0, 6),
      slots: document.querySelectorAll("[data-testid^='instrument-slot-']").length,
      chooseLabels: [...document.querySelectorAll("button")].filter((el) => /choose|instrument/i.test(el.textContent ?? "")).length,
    }));
    console.log(
      `   · no instrument chip — track kinds [${why.kinds.join(", ")}], instrument slots ${why.slots}, ` +
        `choose-ish buttons ${why.chooseLabels} (a chip needs a sampler track and a loaded catalogue)`
    );
  } else {
    const chipId = (await chip.getAttribute("data-testid")) ?? "";
    const chipSel = `[data-testid='${chipId}']`;
    for (let round = 0; round < 4; round += 1) {
      /**
       * ⭐ **Open it, and if it does not open, say what the chip and the overlays were doing** — the first version of
       * this loop waited fifteen seconds and then dumped 5,260 test ids, which is a diagnostic that costs more to read
       * than the failure. A coordinate click is tried first (it is what a person does); the DOM click is the second
       * attempt because `test_matrix.js` measured that the modals here can swallow coordinates.
       */
      let opened = false;
      for (let attempt = 1; attempt <= 2 && !opened; attempt += 1) {
        if (attempt === 1) await page.click(chipSel, { force: true }).catch(() => {});
        else await page.evaluate((sel) => document.querySelector(sel)?.click(), chipSel);
        /**
         * ⭐ The signal is the chip's own `aria-expanded`, not the library's list. The first version waited for
         * `instrument-options`, and when that missed it clicked a second time — which **closed** a library that had
         * opened, leaving the honest-looking report "aria-expanded=false, no overlays" for a click that had worked.
         */
        opened = await page
          .waitForFunction((sel) => document.querySelector(sel)?.getAttribute("aria-expanded") === "true", chipSel, { timeout: 8000 })
          .then(() => true)
          .catch(() => false);
      }
      if (!opened) {
        const state = await page.evaluate((sel) => ({
          expanded: document.querySelector(sel)?.getAttribute("aria-expanded") ?? null,
          options: document.querySelectorAll("[data-testid='instrument-options']").length,
          dialogs: [...document.querySelectorAll("[role='dialog'], [role='menu']")]
            .filter((el) => el.getBoundingClientRect().height > 0)
            .map((el) => el.getAttribute("data-testid") || el.getAttribute("role")),
        }), chipSel);
        console.log(
          `   · the instrument library did not open — chip aria-expanded=${state.expanded}, options=${state.options}, ` +
            `open overlays [${state.dialogs.join(", ")}] (skipping the timbre rows)`
        );
        break;
      }
      await page.waitForSelector("[data-testid='instrument-options']", { timeout: 8000 }).catch(() => null);
      const optionIds = await page.$$eval("[data-testid^='instrument-option-']", (rows) =>
        rows.map((row) => row.getAttribute("data-testid")).filter(Boolean)
      );
      if (optionIds.length === 0) break;
      // A row that is not already chosen: choosing the instrument that is already loaded is not an interaction.
      let target = null;
      for (const id of optionIds) {
        const pressed = await page.getAttribute(`[data-testid='${id}']`, "aria-pressed");
        if (pressed === "false") { target = id; break; }
      }
      const optionSel = `[data-testid='${target ?? optionIds[0]}']`;
      const label = ((await page.textContent(optionSel)) ?? "").trim().slice(0, 28);
      const was = ((await page.textContent(chipSel)) ?? "").trim();
      results.push(
        await measure(
          page,
          `timbre → ${label}`,
          async () => {
            /**
             * ⭐ **A DOM click, because a coordinate click does not reach the row.** The list is `max-h-52
             * overflow-y-auto`: `page.click` scrolls the row into the list's viewport and then clicks its centre, and
             * with the first non-chosen row far down the list that centre lands on whatever is painted there. Measured
             * on this surface: the click did nothing at all (`aria-pressed` stayed on the previous instrument and the
             * chip's name never changed), which is the same finding `test_matrix.js` records for the template cards.
             */
            await page.evaluate((sel) => document.querySelector(sel)?.click(), optionSel);
          },
          () =>
            page.waitForFunction(
              ({ sel, before }) => {
                const el = document.querySelector(sel);
                if (el === null) return false;
                /**
                 * ⭐ **The chip's own name is the change the person sees.** Requiring the panel to close as well made
                 * this row time out on a choice that had landed: the header's chip closes the panel through
                 * `onLibraryOpenChange`, but the **same chip exists again in the row-based `TrackListV2`**, whose
                 * instance does not take that callback — so which of the two the query finds decides whether the
                 * panel closes, and neither decides whether the instrument changed.
                 */
                return (el.textContent ?? "").trim() !== before;
              },
              { sel: chipSel, before: was },
              { timeout: 10000 }
            )
        )
      );
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(200);
    }
  }

  /**
   * 3. Writing one note in the piano roll while playing — the other hot path, and the one that commits a repaint of a
   * grid rather than of a panel. The v1 step toggled a `data-selected` step cell in the studio's sequencer; this walks
   * the steps `test_matrix.js` does: select a track from the grid's picker, open the roll from the toolbar's tab, take
   * the first cell that has no note under it, and wait for the note to exist.
   */
  {
    if ((await page.$("[data-testid='roll-grid']")) === null) {
      await page.click("[data-testid='arrangement-track-picker'] button", { force: true }).catch(() => {});
      await page.click("[data-testid='arrangement-editor-roll']", { force: true }).catch(() => {});
      await page.waitForSelector("[data-testid='roll-grid']", { timeout: 20000 }).catch(() => null);
    }
    const empty = await page.evaluate(() => {
      for (const cell of document.querySelectorAll("[data-testid^='roll-cell-']")) {
        const id = cell.getAttribute("data-testid");
        if (id === null) continue;
        const key = id.replace("roll-cell-", "");
        if (document.querySelector(`[data-testid='roll-note-${key}']`) === null) return { id, noteId: `roll-note-${key}` };
      }
      return null;
    });
    if (empty === null) {
      console.log("   · no empty roll cell to write into — the note row cannot be measured here");
    } else {
      results.push(
        await measure(
          page,
          "write one note",
          async () => {
            await page.click(`[data-testid='${empty.id}']`, { force: true });
          },
          () => page.waitForSelector(`[data-testid='${empty.noteId}']`, { timeout: 10000 })
        )
      );
    }
  }

  await browser.close();
  if (server) server.close();

  const payload = { url: baseUrl, pageErrors, results };
  if (asJson) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    if (pageErrors.length) console.log(`\npage errors: ${pageErrors.slice(0, 3).join(" | ")}`);
    console.log("\n(rows are printed as they are measured, so a failure still leaves the data above)");
  }
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch(async (err) => {
    console.error(`❌ probe failed: ${err?.stack ?? err}`);
    // ⭐ 兜底诊断：把页面上真实存在的 testid 列出来，省得下一次又要靠猜（**先转储，再退出** ✓）。
    try {
      const live = globalThis.__probePage;
      const ids = live
        ? await live.evaluate(() =>
            Array.from(document.querySelectorAll("[data-testid]"))
              .map((el) => el.getAttribute("data-testid")).filter(Boolean)
          )
        : [];
      console.error(`   page test ids (${ids.length}): ${ids.join(", ") || "(none)"}`);
    } catch { /* the page may already be gone */ }
    process.exit(1);
  });
