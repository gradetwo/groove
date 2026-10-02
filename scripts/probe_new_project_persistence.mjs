#!/usr/bin/env node
/**
 * The new-project route's round trip, in a real browser, against a real build.
 *
 *   node scripts/probe_new_project_persistence.mjs [--root .] [--out e2e-out]
 *
 * WHY THIS EXISTS
 * ---------------
 * The finding this judges was measured in a browser and could not be measured anywhere else: **build tracks, write a
 * note, refresh, and the arrangement was gone** — back to the chooser, `arrangement-region-*` count 0, and only
 * `groove_language` / `groove_audio_started` in `localStorage`. Every layer below the surface held, so no unit criterion
 * could see it: the model was right, the storage was right, and nothing joined them.
 *
 * What is judged, in the order a person would do it:
 *
 *   1. the chooser has a **project-name field**, and it is already filled in;
 *   2. creating a project names it, and the **top bar** shows that name;
 *   3. two tracks are added — each one waited for on screen **and** in storage, so a step that silently did nothing is
 *      named rather than averaged away;
 *   4. one note is written into a cell **the panel itself says is empty** (a cell that already holds a note is replaced,
 *      not duplicated, so "the first cell" is not a safe choice), and the write is proved to have reached storage;
 *   5. **the page is reloaded**;
 *   6. the tracks, the notes track by track, the stored record and the top bar's name all still say what they said.
 *
 * ⚠️ Storage is read through **one long-lived IndexedDB connection**, opened once by this script. A first version opened
 * and closed a connection on every poll, and that churn made this probe's own readings disagree with each other — a poll
 * would see three tracks and the read after it two. A probe whose measurements contradict themselves cannot be evidence
 * about the app, so the reading was fixed before the app was suspected further.
 */
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const playwright = require("playwright");

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const found = argv.find((entry) => entry.startsWith(`--${name}=`));
  return found === undefined ? fallback : found.slice(name.length + 3);
};
const ROOT = path.resolve(argOf("root", process.cwd()));
const OUT = path.resolve(ROOT, argOf("out", "e2e-out"));
/** Distinctive on purpose: a criterion that passes because the app happened to use the same name would prove nothing. */
const PROJECT_NAME = "Persist Probe Session";
/**
 * ⭐ **`--legacy` runs the same script against a build from before this change, and it is a negative control.**
 *
 * On that build the probe is *expected to fail the way the owner reported*: no name field on the chooser, and a reload
 * that lands back on the chooser with no regions. Asserting that is what makes the passing run mean something — a check
 * that cannot fail proves nothing, and this one is run against both builds.
 */
const LEGACY = argv.includes("--legacy");
/** The pre-change chooser's add-track buttons are labelled, and there are two rows of them; the header row is the one in the grid. */
const LEGACY_ADD_LABELS = { sampler: "Sampler", drumkit: "Drum kit", synth: "Synth", fx: "FX", folder: "Folder" };

if (!fs.existsSync(path.join(ROOT, "dist", "index.html"))) {
  console.error(`❌ No built app under ${ROOT}/dist — run \`npm run build\` first.`);
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
};

const server = http.createServer((req, res) => {
  const url = req.url.split("?")[0];
  const rel = url === "/" ? "/index.html" : url;
  const file = path.join(ROOT, "dist", rel);
  // ⭐ `/new` is a route this app parses itself, so the server must answer it with the shell rather than a 404.
  if (!file.startsWith(path.join(ROOT, "dist")) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(200, { "content-type": "text/html" });
    fs.createReadStream(path.join(ROOT, "dist", "index.html")).pipe(res);
    return;
  }
  res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await playwright.chromium.launch({ args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => {
  try {
    localStorage.setItem("groove_onboarding_completed", "true");
    // The entry gate is a real tap in a real session; in a probe it would swallow the first click on the chooser.
    localStorage.setItem("groove_audio_started", "1");
    localStorage.setItem("groove_language", "en");
  } catch {
    /* disabled */
  }
  /**
   * ⭐ **One connection, used for every reading.** It is opened lazily, so it is created after the app has created the
   * database, and every read is a fresh readonly transaction on it — which is what makes the readings see the app's
   * commits in the order they happened.
   */
  window.__probeStore = {
    db: null,
    async connect() {
      if (this.db !== null) return this.db;
      this.db = await new Promise((resolve, reject) => {
        const request = window.indexedDB.open("groove_projects_db", 2);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return this.db;
    },
    async read() {
      const db = await this.connect();
      if (!db.objectStoreNames.contains("arrangements_v2")) return { note: "no arrangements_v2 store" };
      const records = await new Promise((resolve, reject) => {
        const tx = db.transaction("arrangements_v2", "readonly");
        const request = tx.objectStore("arrangements_v2").getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const pointer = JSON.parse(window.localStorage.getItem("groove_active_arrangement_v2") ?? "null");
      const all = Array.isArray(records) ? records : [];
      // ⭐ The record the app says is open, not "the first one": an id carries a timestamp, so "first" is not "current".
      const record = all.find((entry) => entry.id === pointer?.id) ?? all[0];
      if (record === undefined) return { note: "no arrangement record", recordCount: all.length };
      const byTrack = record.arrangement?.notesByTrack ?? {};
      return {
        name: record.name,
        id: record.id,
        pointerId: pointer?.id ?? null,
        recordCount: all.length,
        tracks: (record.arrangement?.tracks ?? []).map((track) => track.id),
        notesPerTrack: Object.fromEntries(Object.entries(byTrack).map(([id, notes]) => [id, notes.length])),
      };
    },
  };
});
const page = await context.newPage();

const result = { root: ROOT, projectName: PROJECT_NAME, steps: {} };
const fail = async (message, detail) => {
  console.error(`❌ ${message}`);
  if (detail !== undefined) console.error(JSON.stringify(detail, null, 2));
  await browser.close();
  server.close();
  process.exit(1);
};
const shot = async (name) => {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  return path.relative(process.cwd(), file);
};
/** The stored record, plus its note total — one reading of the app's own durable state. */
const readStored = async () => {
  const stored = await page.evaluate(() => window.__probeStore.read());
  const counts = stored.notesPerTrack ?? null;
  const total = counts === null ? 0 : Object.values(counts).reduce((sum, n) => sum + n, 0);
  return { ...stored, total };
};
/** What the DOM says, which is the reading the finding itself was made with. */
const readScreen = async () => ({
  regions: await page.locator('[data-testid^="arrangement-region-"]').count(),
  headerName: await page.locator('[data-testid="header-project-name"]').first().textContent().catch(() => null),
  trackNames: (await page.locator('[data-testid="arrangement-track-picker"] button').allTextContents()).map((name) => name.trim()),
  localStorageKeys: await page.evaluate(() => Object.keys(window.localStorage).sort()),
});
/** Every track's notes, counted by visiting each one: the panel shows one track at a time. */
const readNotesPerTrack = async () => {
  const buttons = page.locator('[data-testid="arrangement-track-picker"] button');
  const total = await buttons.count();
  const perTrack = [];
  for (let index = 0; index < total; index += 1) {
    await buttons.nth(index).click();
    perTrack.push({
      name: ((await buttons.nth(index).textContent()) ?? "").trim(),
      notes: await page.locator('[data-testid^="roll-note-"]').count(),
    });
  }
  return perTrack;
};

try {
  /* ── 1. The chooser, with a name field ─────────────────────────────────────────────────────────────────────── */
  await page.goto(`${base}/new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="new-project-panel-v2"]', { timeout: 30000 });
  const chooserInputs = await page
    .locator('[data-testid="new-project-panel-v2"] input, [data-testid="new-project-panel-v2"] select, [data-testid="new-project-panel-v2"] textarea')
    .count();
  const nameField = page.locator('[data-testid="new-project-name"]');
  const hasNameField = (await nameField.count()) === 1;
  if (!LEGACY && !hasNameField) await fail("the chooser has no project-name field", { chooserInputs });
  if (LEGACY && hasNameField) await fail("--legacy was run against a build that already has the name field");
  const prefilled = hasNameField ? await nameField.inputValue() : null;
  if (!LEGACY && (prefilled ?? "").trim() === "") await fail("the name field is empty, so Create would store an unnamed project");
  result.steps.chooser = { chooserInputs, hasNameField, prefilled, screenshot: await shot("new-project-chooser") };

  /* ── 2. Create, named ──────────────────────────────────────────────────────────────────────────────────────── */
  if (!LEGACY) await nameField.fill(PROJECT_NAME);
  await page.click('[data-testid="new-project-create"]');
  await page.waitForSelector('[data-testid="arrangement-view-v2"]', { timeout: 30000 });
  const created = await readScreen();
  result.steps.created = { ...created, screenshot: await shot("new-project-created") };
  if (!LEGACY && created.headerName?.trim() !== PROJECT_NAME) await fail("the top bar does not name the project that was just created", created);

  /* ── 3. Two more tracks, each waited for on screen and in storage ──────────────────────────────────────────── */
  const addTrack = async (kind, expectedTracks) => {
    const headerButton = page.locator(`[data-testid="track-add-${kind}"]`);
    if ((await headerButton.count()) > 0) await headerButton.click();
    else await page.locator(`[data-testid="track-list-add"] button:has-text("${LEGACY_ADD_LABELS[kind]}")`).first().click();
    try {
      await page.waitForFunction((n) => document.querySelectorAll('[data-testid^="arrangement-region-"]').length >= n, expectedTracks, { timeout: 5000 });
    } catch {
      await fail(`adding a ${kind} track did not put a region on screen`, { expectedTracks, screen: await readScreen() });
    }
    /**
     * ⚠️ **A pause, not a polling loop.** Waiters that hammered IndexedDB from a second connection made this probe's own
     * readings disagree with each other (a poll saw three tracks, the read after it one), so the measurement is taken
     * once, after longer than the store's debounce. The app is judged by what a person would see: do the thing, pause,
     * then look.
     */
    await page.waitForTimeout(1500);
    const stored = await readStored();
    // ⭐ On the pre-change build nothing is stored at all, and that is the finding rather than a failure of this step.
    if (!LEGACY && (stored.tracks ?? []).length < expectedTracks) {
      await fail(`adding a ${kind} track never reached storage`, { expectedTracks, stored, screen: await readScreen() });
    }
  };
  await addTrack("sampler", 2);
  await addTrack("drumkit", 3);

  /* ── 4. One note, in a cell the panel says is empty, proved to have been stored ─────────────────────────────── */
  const storedBeforeWrite = await readStored();
  // ⭐ On the pre-change build there is no arrangement store at all, so this reading is `{note}` and says so.
  if (!LEGACY && (storedBeforeWrite.tracks ?? []).length !== 3) {
    await fail("the stored record does not hold the three tracks that were added", { storedBeforeWrite, screen: await readScreen() });
  }
  const target = await page.evaluate(() => {
    const occupied = new Set(
      Array.from(document.querySelectorAll('[data-testid^="roll-note-"]')).map((node) => node.getAttribute("data-testid")?.replace("roll-note-", ""))
    );
    const cell = Array.from(document.querySelectorAll('[data-testid^="roll-cell-"]')).find((node) => {
      const key = node.getAttribute("data-testid")?.replace("roll-cell-", "") ?? "";
      return !occupied.has(key);
    });
    if (!cell) return null;
    cell.scrollIntoView({ block: "center" });
    const box = cell.getBoundingClientRect();
    return { id: cell.getAttribute("data-testid"), box: { x: box.x, y: box.y, width: box.width, height: box.height } };
  });
  if (target === null) await fail("the roll offers no empty cell to write into", storedBeforeWrite);
  /**
   * ⚠️ **A real pointer gesture, not a click**: the roll writes on `pointerdown` + `pointerup` in one cell, so a
   * synthesised click writes nothing and the probe would report "nothing was lost" about a project with nothing new.
   */
  await page.mouse.move(target.box.x + target.box.width / 2, target.box.y + target.box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  // ⚠️ The same pause-not-poll rule as above: one look, after the debounce.
  await page.waitForTimeout(1500);
  const storedAfterWrite = await readStored();
  if (!LEGACY && storedAfterWrite.total < storedBeforeWrite.total + 1) {
    await fail("the note that was written never reached storage", { cell: target.id, storedBeforeWrite, storedAfterWrite });
  }
  result.written = { cell: target.id, notesBefore: storedBeforeWrite.total, notesAfter: storedAfterWrite.total };

  /* ── 5. ⭐ The refresh ─────────────────────────────────────────────────────────────────────────────────────── */
  const before = { screen: await readScreen(), notes: await readNotesPerTrack(), stored: await readStored() };
  result.steps.before = { ...before.screen, notesPerTrack: before.notes, stored: before.stored, screenshot: await shot("new-project-before-refresh") };

  await page.reload({ waitUntil: "domcontentloaded" });
  // A build that persists nothing comes back to the chooser; waiting for either screen is how both are caught.
  await page.waitForSelector('[data-testid="arrangement-view-v2"], [data-testid="new-project-panel-v2"]', { timeout: 30000 });
  if (LEGACY) {
    /**
     * ⭐ **The negative control, asserted rather than hoped for.** On the pre-change build the reload lands on the
     * chooser and there is no arrangement at all — the finding this whole change answers, reproduced by the same
     * script that passes on the new build.
     */
    const screen = await readScreen();
    const chooserShown = (await page.locator('[data-testid="new-project-panel-v2"]').count()) > 0;
    result.steps.after = { ...screen, chooserShown, screenshot: await shot("new-project-after-refresh-before-change") };
    if (!chooserShown) await fail("--legacy ran against a build that restored the project, so it is not the pre-change build");
    if (screen.regions !== 0) await fail("--legacy expected no regions after the reload", screen);
    result.ok = true;
    result.defectReproduced = { chooserShown, regions: screen.regions, trackNames: screen.trackNames, headerName: screen.headerName, localStorageKeys: screen.localStorageKeys };
    console.log(JSON.stringify(result, null, 2));
    await browser.close();
    server.close();
    process.exit(0);
  }
  await page.waitForSelector('[data-testid^="arrangement-region-"]', { timeout: 15000 });

  const after = { screen: await readScreen(), notes: await readNotesPerTrack(), stored: await readStored() };
  result.steps.after = { ...after.screen, notesPerTrack: after.notes, stored: after.stored, screenshot: await shot("new-project-after-refresh") };

  if (after.screen.regions !== before.screen.regions) await fail("the region count did not survive the refresh", { before: before.screen, after: after.screen });
  if (JSON.stringify(after.stored) !== JSON.stringify(before.stored)) await fail("the stored record did not survive the refresh", { before: before.stored, after: after.stored });
  if (JSON.stringify(after.notes) !== JSON.stringify(before.notes)) await fail("the notes did not survive the refresh, track for track", { before: before.notes, after: after.notes });
  if (JSON.stringify(after.screen.trackNames) !== JSON.stringify(before.screen.trackNames)) {
    await fail("the track names did not survive the refresh", { before: before.screen, after: after.screen });
  }
  if (after.screen.headerName?.trim() !== PROJECT_NAME) await fail("the top bar lost the project's name across the refresh", after.screen);
  if (!after.screen.localStorageKeys.includes("groove_active_arrangement_v2")) await fail("nothing in localStorage points at the saved arrangement", after.screen);

  result.ok = true;
  result.comparison = {
    regions: after.screen.regions,
    trackNames: after.screen.trackNames,
    notesBefore: before.notes,
    notesAfter: after.notes,
    headerName: after.screen.headerName,
  };
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  await fail(err instanceof Error ? err.message : String(err));
} finally {
  await browser.close();
  server.close();
}
