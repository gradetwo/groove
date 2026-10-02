#!/usr/bin/env node
/**
 * The new-project route's round trip, in a real browser, against a real build.
 *
 *   node scripts/probe_new_project_persistence.mjs [--root .] [--out e2e-out]
 *
 * WHY THIS EXISTS
 * ---------------
 * The finding this judges was measured in a browser and could not be measured anywhere else: **build three tracks,
 * refresh, and the arrangement was gone** — back to the chooser, `arrangement-region-*` count 0, and only
 * `groove_language` / `groove_audio_started` in `localStorage`. Every layer below the surface held, so no unit
 * criterion could see it: the model was right, the storage was right, and nothing joined them.
 *
 * So this probe is the join, judged the way the finding was made:
 *
 *   1. the chooser has a **name field**, and the built page's `input` count on that screen is not zero;
 *   2. creating a project, adding tracks and writing a note leaves the arrangement on screen;
 *   3. **a real reload** still shows the arrangement, with the **track count and note count equal to what they were**;
 *   4. the **top bar shows the project's name**;
 *   5. and the negative control the finding itself is: the counts are read from the DOM of a fresh page, so a build
 *      that persists nothing reports 0 and this exits non-zero.
 *
 * ⚠️ It is deliberately **not** a replacement for the unit criteria — it is the one claim they cannot make, which is
 * that the pieces are wired to each other in the artifact that ships.
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
/**
 * The name this probe gives its project. Distinctive on purpose: a criterion that passes because the app happened to
 * name a project the same thing would prove nothing.
 */
const PROJECT_NAME = "Persist Probe Session";
/** A note is written at this pitch, on the default synth track, so the count has a definite value. */
const NOTE_PITCH = 60;

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
  /**
   * ⭐ **Client routes fall back to `index.html`.** `/new` is a path this app parses itself (`parseUrlToRoute`), and a
   * static server that answered 404 for it would judge a route nobody could open — the reading would be about this
   * script rather than about the app.
   */
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
  } catch {
    /* disabled */
  }
});
const page = await context.newPage();

/**
 * ⭐ **What the store actually holds, read straight out of IndexedDB.**
 *
 * It exists because "the screen lost it" and "the record lost it" are two different defects with two different fixes,
 * and a criterion that only reads the screen cannot tell them apart. The transaction is opened here rather than
 * through the app so that a bug in the reader cannot hide a bug in the writer.
 */
const readStoredRecord = async () => {
  const stored = await page.evaluate(async () => {
    const open = () => new Promise((resolve, reject) => {
      const request = window.indexedDB.open("groove_projects_db");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const db = await open();
    if (!db.objectStoreNames.contains("arrangements_v2")) return { note: "no arrangements_v2 store" };
    const records = await new Promise((resolve, reject) => {
      const tx = db.transaction("arrangements_v2", "readonly");
      const req = tx.objectStore("arrangements_v2").getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    const first = Array.isArray(records) ? records[0] : undefined;
    if (first === undefined) return { note: "no arrangement record" };
    const byTrack = first.arrangement?.notesByTrack ?? {};
    return {
      name: first.name,
      tracks: (first.arrangement?.tracks ?? []).map((track) => track.id),
      notesPerTrack: Object.fromEntries(Object.entries(byTrack).map(([id, notes]) => [id, notes.length])),
    };
  });
  const counts = stored.notesPerTrack ?? null;
  const total = counts === null ? 0 : Object.values(counts).reduce((sum, n) => sum + n, 0);
  return { ...stored, total };
};

/** What the DOM says about the arrangement right now — the same readings the finding was made with. */
const readArrangement = async () => {
  const regions = await page.locator('[data-testid^="arrangement-region-"]').count();
  const rows = await page.locator('[data-testid^="arrangement-header-row-"]').count();
  const pickerNames = await page
    .locator('[data-testid="arrangement-track-picker"] button')
    .allTextContents()
    .catch(() => []);
  const headerName = await page
    .locator('[data-testid="header-project-name"]')
    .first()
    .textContent()
    .catch(() => null);
  const rollNotes = await page.locator('[data-testid^="roll-note-"]').count();
  const rollCells = await page.locator('[data-testid^="roll-cell-"]').count();
  const storage = await page.evaluate(() => Object.keys(window.localStorage).sort());
  const stored = await readStoredRecord();
  return { regions, rows, pickerNames, headerName, rollNotes, rollCells, storage, stored };
};

/**
 * ⭐ **Every track's notes, counted by visiting each one.**
 *
 * The panel shows one track at a time — "exactly one track is selected" is the model's rule, not a limitation here — so
 * a single reading after a reload measures how many notes the *default selection* has, which is zero. Counting each
 * track in turn is the reading that answers the actual question, and it is compared to itself before and after, so a
 * build whose starter content differs still passes while a lost note does not.
 */
const readNotesPerTrack = async () => {
  const buttons = page.locator('[data-testid="arrangement-track-picker"] button');
  const total = await buttons.count();
  const perTrack = [];
  for (let index = 0; index < total; index += 1) {
    await buttons.nth(index).click();
    const notes = await page.locator('[data-testid^="roll-note-"]').count();
    perTrack.push({ name: (await buttons.nth(index).textContent())?.trim() ?? "", notes });
  }
  return perTrack;
};

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

const result = { root: ROOT, projectName: PROJECT_NAME, steps: {} };

try {
  /* ── 1. The chooser, with a name field ─────────────────────────────────────────────────────────────────────── */
  await page.goto(`${base}/new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="new-project-panel-v2"]', { timeout: 30000 });
  const chooserInputs = await page.locator('[data-testid="new-project-panel-v2"] input, [data-testid="new-project-panel-v2"] select, [data-testid="new-project-panel-v2"] textarea').count();
  const nameField = page.locator('[data-testid="new-project-name"]');
  if ((await nameField.count()) !== 1) await fail("the chooser has no project-name field", { chooserInputs });
  const prefilled = await nameField.inputValue();
  if (prefilled.trim() === "") await fail("the name field is empty, so Create would store an unnamed project");
  result.steps.chooser = { chooserInputs, prefilled, screenshot: await shot("new-project-chooser") };

  /* ── 2. Create, then build something worth losing ─────────────────────────────────────────────────────────── */
  await nameField.fill(PROJECT_NAME);
  await page.click('[data-testid="new-project-create"]');
  await page.waitForSelector('[data-testid="arrangement-view-v2"]', { timeout: 30000 });
  // The header shows the name on the click that made the project, before any transaction has resolved.
  result.steps.created = { ...(await readArrangement()), screenshot: await shot("new-project-created") };
  if (result.steps.created.headerName?.trim() !== PROJECT_NAME) {
    await fail("the top bar does not show the project's name after creating it", result.steps.created);
  }

  // Two more tracks, so "three tracks" is a number this build had to produce rather than a template's default.
  await page.click('[data-testid="track-add-sampler"]');
  await page.click('[data-testid="track-add-drumkit"]');
  /**
   * One note, written through the roll, as a person writes it.
   *
   * ⭐ **The cell is chosen as one the panel itself says is empty**, rather than as "the first cell". Two reasons, both
   * measured:
   *
   *   - `addNote` **replaces** a note at the same pitch and grid position rather than adding a second one, so pressing a
   *     cell that already holds a note changes nothing and a probe that expected the count to grow would report the app
   *     broken;
   *   - a cell's testid carries neither of those facts — every cell is `data-note="false"` — so the empty positions are
   *     exactly the notes' own testids, subtracted from the cells'.
   *
   * ⚠️ The press is a **real pointer gesture** (`mouse.move`/`down`/`up`), not `click`: the roll writes on
   * `pointerdown` + `pointerup` in one cell, so a synthesised click writes nothing and the probe would then report
   * "nothing was lost" about a project in which nothing was ever written.
   */
  const picker = page.locator('[data-testid="arrangement-track-picker"] button');
  const writtenOn = (await picker.first().textContent())?.trim() ?? "";
  const storedBefore = await readStoredRecord();
  const { cellId, cellBox } = await page.evaluate(() => {
    const occupied = new Set(Array.from(document.querySelectorAll('[data-testid^="roll-note-"]')).map((node) => node.getAttribute("data-testid")?.replace("roll-note-", "")));
    const cell = Array.from(document.querySelectorAll('[data-testid^="roll-cell-"]')).find((node) => {
      const key = node.getAttribute("data-testid")?.replace("roll-cell-", "") ?? "";
      return !occupied.has(key);
    });
    if (!cell) return { cellId: null, cellBox: null };
    cell.scrollIntoView({ block: "center" });
    const box = cell.getBoundingClientRect();
    return { cellId: cell.getAttribute("data-testid"), cellBox: { x: box.x, y: box.y, width: box.width, height: box.height } };
  });
  if (cellId === null || cellBox === null) await fail("the roll offers no empty cell to write into", { storedBefore });
  await page.mouse.move(cellBox.x + cellBox.width / 2, cellBox.y + cellBox.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForFunction(
    (expected) =>
      new Promise((resolve) => {
        const request = window.indexedDB.open("groove_projects_db");
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("arrangements_v2", "readonly");
          const all = tx.objectStore("arrangements_v2").getAll();
          all.onsuccess = () => {
            const counts = all.result?.[0]?.arrangement?.notesByTrack ?? {};
            const total = Object.values(counts).reduce((sum, notes) => sum + notes.length, 0);
            db.close();
            resolve(total >= expected);
          };
          all.onerror = () => resolve(false);
        };
        request.onerror = () => resolve(false);
      }),
    storedBefore.total + 1,
    { timeout: 10000 }
  );
  const storedAfterWrite = await readStoredRecord();
  if (storedAfterWrite.total !== storedBefore.total + 1) {
    await fail("a pointer press and release in an empty roll cell did not add exactly one note to the project, so there is nothing to lose", {
      writtenOn,
      cellId,
      storedBefore,
      storedAfterWrite,
    });
  }
  result.written = { track: writtenOn, cell: cellId, notesBeforeWrite: storedBefore.total, notesAfterWrite: storedAfterWrite.total };

  const before = await readArrangement();
  // ⭐ Read track by track, because the panel shows one track at a time.
  const notesBefore = await readNotesPerTrack();
  /**
   * ⭐ **The fingerprint the refresh is compared against contains the note that was just written.** Without this the
   * comparison could pass on a project in which the write never existed — which is exactly what a probe that trusted
   * the DOM reported the first time it was written.
   */
  /**
   * ⚠️ **The ids in the record and the names on screen are two vocabularies** — the picker labels a track "drumkit" and
   * the header calls the same track "Drums" — so the two readings are compared as a **multiset of note counts**, which
   * is what has to agree: every track's note count on screen equals some stored track's, and the totals match. Indexing
   * one list by the other's position is the mistake that made an earlier version of this probe report a note missing
   * when the record had it.
   */
  const screenCounts = notesBefore.map((entry) => entry.notes).sort((a, b) => a - b);
  const recordCounts = Object.values(storedAfterWrite.notesPerTrack).sort((a, b) => a - b);
  const screenTotal = screenCounts.reduce((sum, n) => sum + n, 0);
  if (JSON.stringify(screenCounts) !== JSON.stringify(recordCounts) || screenTotal !== storedAfterWrite.total) {
    await fail("the record and the screen disagree about the notes that were just written", {
      notesBefore,
      record: storedAfterWrite,
      screenCounts,
      recordCounts,
    });
  }
  const tracksBefore = before.pickerNames;

  /* ── 3. ⭐ The refresh ─────────────────────────────────────────────────────────────────────────────────────── */
  await page.reload({ waitUntil: "domcontentloaded" });
  // The chooser is what a build that persists nothing returns to; waiting for either screen is how both are caught.
  await page.waitForSelector('[data-testid="arrangement-view-v2"], [data-testid="new-project-panel-v2"]', { timeout: 30000 });
  const after = await readArrangement();
  const notesAfter = await readNotesPerTrack();
  result.steps.after = { ...after, notesPerTrack: notesAfter, screenshot: await shot("new-project-after-refresh") };

  if (after.regions !== before.regions) await fail("the region count did not survive the refresh", { before, after });
  // ⭐ The record, first: this is the claim "the project came back" in its strongest form, and it cannot be affected by
  // which track the panel happens to be showing.
  if (JSON.stringify(after.stored) !== JSON.stringify(before.stored)) {
    await fail("the stored record did not survive the refresh", { before: before.stored, after: after.stored });
  }
  // ⭐ And then per track, note for note: a total that matched while the notes moved to another track would pass a sum.
  if (JSON.stringify(notesAfter) !== JSON.stringify(notesBefore)) {
    await fail("the notes did not survive the refresh, track for track", { notesBefore, notesAfter, after });
  }
  if (JSON.stringify(after.pickerNames) !== JSON.stringify(tracksBefore)) {
    await fail("the track names did not survive the refresh", { before, after });
  }
  if (after.headerName?.trim() !== PROJECT_NAME) await fail("the top bar lost the project's name across the refresh", after);
  if (!after.storage.includes("groove_active_arrangement_v2")) {
    await fail("nothing in localStorage points at the saved arrangement", after);
  }

  result.ok = true;
  result.comparison = { tracksBefore, tracksAfter: after.pickerNames, notesBefore, notesAfter, regions: after.regions };
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  await fail(err instanceof Error ? err.message : String(err));
} finally {
  await browser.close();
  server.close();
}
