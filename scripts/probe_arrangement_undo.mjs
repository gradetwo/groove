/**
 * Does the **new arrangement** really undo and redo — in a browser, with the change landing in storage?
 *
 * The measured finding this answers was made the same way: `/new` was opened, `Ctrl+Z` was pressed, and **nothing
 * happened at all** — the arrangement was a bare `useState` with no history and the toolbar had no undo to press. A
 * jsdom criterion can show which command ran; only a browser can show that the key is wired to the page, that the
 * toolbar's `disabled` is a real property a person meets, that a **text field keeps the key**, and — the half that
 * makes an undo believable — that the undone arrangement is what comes back after a **reload**.
 *
 * Six readings, each one falsifiable:
 *
 *   1. the toolbar's Undo/Redo `disabled` in its **three states** — nothing to undo, something to undo, nothing again;
 *   2. an edit (add a track, add a note, change the arrangement's length) followed by `Ctrl+Z` → the DOM reads the
 *      **before** value, and `Ctrl+Shift+Z` → the **after** value;
 *   3. **storage**, read straight out of IndexedDB, agrees with the DOM after the undo — not merely the screen;
 *   4. **a reload inside the undo's own lifetime still shows the undone arrangement** — the criterion an undo that is
 *      only visual fails;
 *   5. `Ctrl+Z` **inside the project-name field** is left to the field: the key event is not `defaultPrevented` and the
 *      arrangement does not move, while the same press on the body does move it;
 *   6. a screenshot of `?` on `/new`, where the arrangement's undo row must now be printed.
 *
 * Runs against `dist/`, like the other probes, so it measures what ships.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const playwright = require("playwright");
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROOT = path.resolve(__dirname, "..");
const asJson = process.argv.includes("--json");
/**
 * ⭐ **Where the pictures go: out of the repository by default.**
 *
 * A probe that writes into a tracked path leaves the working tree dirty, and `scripts/push_dev.sh` refuses a dirty tree
 * on purpose — "committing is a decision about what belongs together; the push script is the wrong place to make it".
 * A picture whose bytes change on every run (the project id and the clock are in the page) would therefore block every
 * push that followed it. So a run writes to `tmp/` (ignored), with `--out=` for anywhere else; the images committed
 * under `docs/screenshots/` are the recorded evidence of one run, copied there deliberately rather than as a side
 * effect of running the probe. This was measured, not imagined: the first version wrote into `docs/screenshots/` and
 * the very next `push:dev` refused the push.
 */
const outArgument = process.argv.find((argument) => argument.startsWith("--out="));
const SHOT_DIR = path.resolve(ROOT, outArgument === undefined ? path.join("tmp", "probe-arrangement-undo") : outArgument.slice("--out=".length));
const DB_NAME = "groove_projects_db";
const STORE = "arrangements_v2";

if (!fs.existsSync(path.join(ROOT, "dist", "index.html"))) {
  console.error("❌ dist/index.html is missing — build first (`npm run build`)");
  process.exit(1);
}

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const rel = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\//, "");
  /**
   * ⭐ **A deep link has to be served the shell, not a 404.**
   *
   * `/new` is a route this application owns (`src/app/router.tsx`), and the static server in the other probes never
   * had to answer it because they all load `/`. Without this fallback the probe measures a "not found" page and reports
   * that the chooser never rendered — which is exactly what it did the first time.
   */
  const candidate = path.join(ROOT, "dist", rel);
  const file = candidate.startsWith(path.join(ROOT, "dist")) && fs.existsSync(candidate) && !fs.statSync(candidate).isDirectory() ? candidate : path.join(ROOT, "dist", "index.html");
  res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "text/html" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await playwright.chromium.launch({ args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const problems = [];
const fail = async (message) => {
  console.error(`❌ ${message}`);
  await browser.close();
  server.close();
  process.exit(1);
};

await page.addInitScript(() => {
  try {
    localStorage.setItem("groove_onboarding_completed", "true");
    localStorage.setItem("groove_audio_started", "1");
    localStorage.setItem("groove_language", "en");
    localStorage.removeItem("groove_project_v1");
    localStorage.removeItem("groove_active_arrangement_project");
  } catch {
    /* storage disabled */
  }
  /**
   * ⭐ **Was the key consumed?** Registered at load time — *before* the app mounts — so it runs **before** the app's own
   * window listener and would always read `false`; so instead the recorder is installed on demand by `recordKey`, which
   * registers it *after* the app's, and reads the flag the app left behind.
   */
  window.__grooveKeyLog = [];
});

/** Read the stored arrangement records straight out of IndexedDB — the storage half of every claim below. */
const readStorage = () =>
  page.evaluate(
    ({ dbName, store }) =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(store)) {
            db.close();
            resolve([]);
            return;
          }
          const all = db.transaction(store, "readonly").objectStore(store).getAll();
          all.onerror = () => reject(all.error);
          all.onsuccess = () => {
            db.close();
            resolve(
              all.result.map((record) => ({
                id: record.id,
                name: record.name,
                tracks: record.arrangement?.tracks?.length ?? 0,
                notes: Object.values(record.arrangement?.notesByTrack ?? {}).reduce((total, notes) => total + notes.length, 0),
                bars: record.arrangement?.bars ?? null,
                updatedAt: record.updatedAt ?? 0,
              }))
            );
          };
        };
      }),
    { dbName: DB_NAME, store: STORE }
  );

/** Everything this probe compares, in one DOM read, so two readings cannot disagree about what was measured. */
const readDom = () =>
  page.evaluate(() => {
    const picker = document.querySelector("[data-testid='arrangement-track-picker']");
    const undo = document.querySelector("[data-testid='arrangement-undo']");
    const redo = document.querySelector("[data-testid='arrangement-redo']");
    const bars = document.querySelector("[data-testid='arrangement-bars']");
    return {
      tracks: picker ? Array.from(picker.querySelectorAll("button")).map((button) => button.textContent) : null,
      notes: document.querySelectorAll("[data-testid^='roll-note-']").length,
      bars: bars ? Number(bars.value) : null,
      undoDisabled: undo ? undo.disabled : null,
      redoDisabled: redo ? redo.disabled : null,
      undoAction: undo ? undo.getAttribute("data-undo-action") : null,
      redoAction: redo ? redo.getAttribute("data-redo-action") : null,
      stored: document.querySelectorAll("[data-testid='arrangement-header-row-']").length,
    };
  });

const noteCountInModel = () =>
  page.evaluate(() => {
    const picker = document.querySelector("[data-testid='arrangement-track-picker']");
    return picker ? picker.querySelectorAll("button").length : 0;
  });

/**
 * ⭐ **Press a key and learn whether the application consumed it.**
 *
 * Two things make this measurement honest rather than merely present:
 *
 *   · the recorder is registered **after** the application has mounted, so — both being window-bubble listeners — it
 *     runs *after* the app's and `defaultPrevented` is the app's answer rather than a stale `false`. Registered at load
 *     time it would always read `false`, which is the trap this comment exists to stop the next person falling into;
 *   · the log is read **filtered by the key**, because `Control+Shift+Z` is three `keydown` events (`Control`, `Shift`,
 *     `Z`) and an unfiltered reading sees the bare modifier first. The first version of this probe did exactly that and
 *     reported that a working undo "was not consumed by the arrangement".
 */
const installKeyRecorder = async () => {
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    if (window.__grooveKeyRecorder === true) return;
    window.__grooveKeyRecorder = true;
    window.__grooveKeyLog = [];
    window.addEventListener("keydown", (event) => window.__grooveKeyLog.push({ key: event.key, prevented: event.defaultPrevented }));
  });
};

const pressOn = async (selector, key, modifiers = ["Control"]) => {
  await page.evaluate(() => {
    window.__grooveKeyLog = [];
  });
  if (selector === null) await page.keyboard.press(`${modifiers.join("+")}+${key}`);
  else {
    await page.focus(selector);
    await page.keyboard.press(`${modifiers.join("+")}+${key}`);
  }
  return page.evaluate((wanted) => window.__grooveKeyLog.filter((entry) => entry.key.toLowerCase() === wanted), key.toLowerCase());
};

const report = { readings: {}, problems };

await page.goto(`${base}/new`, { waitUntil: "domcontentloaded" });
try {
  await page.waitForSelector("[data-testid='new-project-panel-v2']", { timeout: 30000 });
} catch {
  await fail("the new-project chooser never rendered");
}

/* ── ① the chooser's name field keeps its own Ctrl+Z ─────────────────────────────────────────────────────────── */
/**
 * This is the field the task names, and it is a genuine text input. Two facts are read: **the app did not call
 * `preventDefault`** (so the browser's own undo is still the field's) and **the arrangement did not move**.
 */
await installKeyRecorder();
await page.fill("[data-testid='new-project-name']", "Undo Evidence");
report.readings.nameFieldTyped = await page.inputValue("[data-testid='new-project-name']");
const nameFieldKeys = await pressOn("[data-testid='new-project-name']", "z");
report.readings.nameFieldKeyPresses = nameFieldKeys;
report.readings.nameFieldValue = await page.inputValue("[data-testid='new-project-name']");
if (nameFieldKeys.some((entry) => entry.prevented)) {
  problems.push("Ctrl+Z inside the project-name field was consumed by the arrangement listener (defaultPrevented=true)");
}

/* ── create the project ──────────────────────────────────────────────────────────────────────────────────────── */
await page.fill("[data-testid='new-project-name']", "Undo Evidence");
await page.click("[data-testid='new-project-create']");
await page.waitForSelector("[data-testid='arrangement-view-v2']", { timeout: 20000 });
await page.waitForSelector("[data-testid='arrangement-undo']", { timeout: 10000 });

/* ── ② state one: nothing to undo ────────────────────────────────────────────────────────────────────────────── */
const stateOne = await readDom();
report.readings.stateOne = stateOne;
if (stateOne.undoDisabled !== true || stateOne.redoDisabled !== true) {
  problems.push(`a freshly created project must have nothing to undo or redo, read ${JSON.stringify(stateOne)}`);
}

/* ── ③ an edit: add a track ──────────────────────────────────────────────────────────────────────────────────── */
await page.click("[data-testid='track-add-sampler']");
const afterAddTrack = await readDom();
report.readings.afterAddTrack = afterAddTrack;
fs.mkdirSync(SHOT_DIR, { recursive: true });
await page.screenshot({ path: path.join(SHOT_DIR, "arrangement-undo-toolbar-undoable.png"), fullPage: false });
if (afterAddTrack.tracks.length !== stateOne.tracks.length + 1) problems.push("adding a track did not add a track");
if (afterAddTrack.undoDisabled !== false) problems.push("Undo is still disabled after an edit");
if (afterAddTrack.redoDisabled !== true) problems.push("Redo is enabled before anything was undone");
if (afterAddTrack.undoAction !== "add-track") problems.push(`Undo should name the action it would undo, read "${afterAddTrack.undoAction}"`);

/* ── ④ an edit: add a note on the new track ──────────────────────────────────────────────────────────────────── */
await page.click(`[data-testid='arrangement-track-picker'] >> text=sampler`);
await page.waitForSelector("[data-testid='piano-roll-v2']", { timeout: 10000 });
/**
 * ⭐ **An empty cell, found rather than guessed.** A sampler track arrives with starter notes (`defaultContentFor`), so a
 * hard-coded cell is a cell that a note may already be sitting on — which is exactly how this probe failed the first
 * time, with the note's own element "intercepting pointer events" over the cell underneath it.
 */
const emptyCell = await page.evaluate(() => {
  for (const cell of document.querySelectorAll("[data-testid^='roll-cell-']")) {
    const id = cell.getAttribute("data-testid");
    const match = /^roll-cell-(\d+)-(\d+)$/.exec(id ?? "");
    if (!match) continue;
    if (!document.querySelector(`[data-testid='roll-note-${match[1]}-${match[2]}']`)) return id;
  }
  return null;
});
if (emptyCell === null) await fail("the piano roll drew no empty cell to write into");
const notesBeforeClick = (await readDom()).notes;
await page.click(`[data-testid='${emptyCell}']`);
const afterAddNote = await readDom();
report.readings.addedNoteAt = emptyCell;
report.readings.afterAddNote = afterAddNote;
if (afterAddNote.notes !== notesBeforeClick + 1) problems.push(`adding a note should have drawn one more, ${notesBeforeClick} → ${afterAddNote.notes}`);
if (afterAddNote.undoAction !== "add-note") problems.push(`Undo should say "add-note", read "${afterAddNote.undoAction}"`);

/* ── ⑤ an edit: change the arrangement's length ─────────────────────────────────────────────────────────────── */
const barsField = page.locator("[data-testid='arrangement-bars']");
await barsField.fill("16");
await barsField.blur();
const afterLength = await readDom();
report.readings.afterLength = afterLength;
if (afterLength.bars !== 16) problems.push(`the arrangement length should be 16, read ${afterLength.bars}`);
if (afterLength.undoAction !== "bars") problems.push(`Undo should say "bars", read "${afterLength.undoAction}"`);

/* ── ⑥ Ctrl+Z steps back through the edits, newest first ────────────────────────────────────────────────────── */
/**
 * ⭐ **Newest first, which is the whole discipline of a stack.** The three edits were add-track, then add-note, then
 * change-length, so the three presses must unwind them in exactly that order — the length, the note, the track. This
 * probe asserted the reverse on its first run and was wrong, not the code: an undo that took the *oldest* action first
 * would be a queue, and Logic's own list is explicitly "the most recent editing operation … will be the first to be
 * undone".
 */
const keyPlay = [];
for (let step = 0; step < 3; step += 1) {
  const log = await pressOn(null, "z");
  await page.waitForTimeout(150);
  const dom = await readDom();
  keyPlay.push({ press: step + 1, prevented: log.map((entry) => entry.prevented), dom });
  report.readings[`afterUndo${step + 1}`] = dom;
  if (!log.some((entry) => entry.prevented)) problems.push(`Ctrl+Z number ${step + 1} was not consumed by the arrangement`);
}
if (keyPlay[0].dom.bars !== 8) problems.push(`the first Ctrl+Z must undo the newest edit (the length), read ${keyPlay[0].dom.bars} bars`);
if (keyPlay[1].dom.notes !== afterAddTrack.notes) problems.push(`the second Ctrl+Z did not take the note back off, read ${keyPlay[1].dom.notes} notes`);
if (keyPlay[2].dom.tracks.length !== stateOne.tracks.length) problems.push("the third Ctrl+Z did not remove the added track");
if (keyPlay[2].dom.undoDisabled !== true) problems.push("after undoing everything, Undo must be disabled again");
if (keyPlay[2].dom.redoDisabled !== false) problems.push("after undoing everything, Redo must be enabled");
report.readings.keyPlay = keyPlay;

/* ── ⑦ Ctrl+Shift+Z brings them back ────────────────────────────────────────────────────────────────────────── */
for (let step = 0; step < 3; step += 1) {
  await page.keyboard.press("Control+Shift+Z");
  await page.waitForTimeout(150);
}
const afterRedoAll = await readDom();
report.readings.afterRedoAll = afterRedoAll;
if (afterRedoAll.tracks.length !== afterLength.tracks.length) problems.push("redo did not put the track back");
if (afterRedoAll.bars !== 16) problems.push(`redo did not put the length back, read ${afterRedoAll.bars}`);
if (afterRedoAll.redoDisabled !== true) problems.push("after redoing everything, Redo must be disabled");

/* ── ⑧ a text field keeps the key, and the same press outside it does not ───────────────────────────────────── */
const tracksBeforeFieldPress = (await readDom()).tracks.length;
const fieldKeys = await pressOn("[data-testid='arrangement-tempo']", "z");
const afterFieldPress = await readDom();
report.readings.tempoFieldPress = { keys: fieldKeys, dom: afterFieldPress };
if (fieldKeys.some((entry) => entry.prevented)) problems.push("Ctrl+Z inside the tempo field was consumed by the arrangement listener");
if (afterFieldPress.tracks.length !== tracksBeforeFieldPress) problems.push("Ctrl+Z inside a text field moved the arrangement");
if (afterFieldPress.undoDisabled !== false) problems.push("Ctrl+Z inside a text field consumed the history");

/**
 * …and the same press with **nothing focused** does step the stack back. The blur matters: Playwright sends the key to
 * the focused element, so a "body press" that never left the field would be the same reading twice — which is exactly
 * what this probe reported on its first run.
 */
await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
const beforeBodyPress = await readDom();
const bodyKeys = await pressOn(null, "z");
await page.waitForTimeout(150);
const afterBodyPress = await readDom();
report.readings.bodyPress = { keys: bodyKeys, before: beforeBodyPress, after: afterBodyPress };
if (!bodyKeys.some((entry) => entry.prevented)) problems.push("Ctrl+Z with nothing focused was not consumed by the arrangement");
if (afterBodyPress.bars !== 8) problems.push(`Ctrl+Z on the body should have taken the length back to 8, read ${afterBodyPress.bars}`);

/* ── ⑨ the undone arrangement is what storage holds, and what a reload shows ────────────────────────────────── */
/** The arrangement as the DOM reads it right now: this is the state the reload must reproduce. */
const intended = await readDom();
report.readings.beforeReload = intended;
// Past the autosave debounce (600 ms) so the criterion judges the write rather than the timer.
await page.waitForTimeout(1200);
const stored = await readStorage();
report.readings.storageAfterUndo = stored;
const active = stored.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0];
if (!active) problems.push("nothing was stored for the arrangement at all");
else {
  if (active.tracks !== intended.tracks.length) problems.push(`storage holds ${active.tracks} tracks, the screen shows ${intended.tracks.length}`);
  if (active.bars !== intended.bars) problems.push(`storage holds ${active.bars} bars, the screen shows the undone ${intended.bars}`);
  if (active.bars === 16) problems.push("storage still holds the pre-undo length — the undo was only on screen");
}

await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector("[data-testid='arrangement-view-v2']", { timeout: 20000 });
await page.waitForSelector("[data-testid='arrangement-undo']", { timeout: 10000 });
const afterReload = await readDom();
report.readings.afterReload = afterReload;
if (afterReload.tracks.length !== intended.tracks.length) problems.push(`after a reload the arrangement has ${afterReload.tracks.length} tracks, not the undone ${intended.tracks.length}`);
if (afterReload.bars !== intended.bars) problems.push(`after a reload the arrangement is ${afterReload.bars} bars, not the undone ${intended.bars}`);
/**
 * ⭐ **And the history itself is gone**, which is the industry's own answer rather than a gap: Ableton's manual says
 * "the Undo History is not saved with a Set once it is closed and is refreshed each time the Set is opened", and
 * Cubase's "the MixConsole history is not saved with the project". A reopened document is a new baseline.
 */
if (afterReload.undoDisabled !== true) problems.push("after a reload the history should be empty — a reopened project is a new baseline");

/* ── ⑩ `?` on `/new`: the arrangement's undo row must be printed here ───────────────────────────────────────── */
await page.keyboard.press("?");
await page.waitForSelector("[role='dialog']", { timeout: 10000 });
const modal = await page.evaluate(() => {
  const dialog = document.querySelector("[role='dialog']");
  const text = dialog ? dialog.textContent ?? "" : "";
  return {
    hasArrangementUndo: /Undo arrangement edit/.test(text),
    hasArrangementRedo: /Redo arrangement edit/.test(text),
    hasStudioUndo: /Undo pattern change/.test(text),
    hasScopeNote: Boolean(document.querySelector("[data-testid='shortcut-arrangement-scope-note']")),
    text: text.replace(/\s+/g, " ").slice(0, 400),
  };
});
report.readings.shortcutsModal = modal;
if (!modal.hasArrangementUndo) problems.push("the arrangement's Ctrl+Z row is not printed on /new, where it now works");
if (modal.hasStudioUndo) problems.push("the sequencer's undo row is printed on /new, where that listener is not mounted");

fs.mkdirSync(SHOT_DIR, { recursive: true });
await page.screenshot({ path: path.join(SHOT_DIR, "arrangement-undo-shortcuts.png"), fullPage: false });
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(SHOT_DIR, "arrangement-undo-after-reload.png"), fullPage: false });
report.screenshots = ["arrangement-undo-toolbar-undoable.png", "arrangement-undo-shortcuts.png", "arrangement-undo-after-reload.png"].map((name) =>
  path.relative(ROOT, path.join(SHOT_DIR, name))
);

/* ── report ─────────────────────────────────────────────────────────────────────────────────────────────────── */
await browser.close();
server.close();

report.ok = problems.length === 0;
if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const r = report.readings;
  const line = (label, value) => console.log(`  ${label.padEnd(46)} ${value}`);
  console.log("\n=== the new arrangement's undo/redo, measured in a browser ===\n");
  line("① project-name field: Ctrl+Z consumed?", String(r.nameFieldKeyPresses.map((k) => k.prevented).join(",")));
  line("   …the field's own undo ran instead", `${JSON.stringify(r.nameFieldTyped)} → ${JSON.stringify(r.nameFieldValue)}`);
  line("② state one (fresh project)", `undo=${r.stateOne.undoDisabled} redo=${r.stateOne.redoDisabled} tracks=${r.stateOne.tracks.length}`);
  line("③ after add track", `tracks=${r.afterAddTrack.tracks.length} undo=${r.afterAddTrack.undoDisabled} redo=${r.afterAddTrack.redoDisabled} action=${r.afterAddTrack.undoAction}`);
  line("④ after add note", `notes=${r.afterAddNote.notes} action=${r.afterAddNote.undoAction}`);
  line("⑤ after change length", `bars=${r.afterLength.bars} action=${r.afterLength.undoAction}`);
  line("⑥ after Ctrl+Z ×3", `tracks=${r.afterUndo3.tracks.length} bars=${r.afterUndo3.bars} undo=${r.afterUndo3.undoDisabled} redo=${r.afterUndo3.redoDisabled}`);
  line("   order unwound (newest first)", `bars ${r.afterLength.bars}→${r.afterUndo1.bars}, notes ${r.afterUndo1.notes}→${r.afterUndo2.notes}, tracks ${r.afterUndo2.tracks.length}→${r.afterUndo3.tracks.length}`);
  line("   (consumed by the app each time)", String(r.keyPlay.map((entry) => entry.prevented.join(",")).join(" | ")));
  line("⑦ after Ctrl+Shift+Z ×3", `tracks=${r.afterRedoAll.tracks.length} bars=${r.afterRedoAll.bars} redo=${r.afterRedoAll.redoDisabled}`);
  line("⑧ Ctrl+Z inside the tempo field", `consumed=${r.tempoFieldPress.keys.map((k) => k.prevented).join(",")} tracks=${r.tempoFieldPress.dom.tracks.length}`);
  line("   Ctrl+Z with nothing focused", `consumed=${r.bodyPress.keys.map((k) => k.prevented).join(",")} bars ${r.bodyPress.before.bars}→${r.bodyPress.after.bars}`);
  line("⑨ storage after the undos", JSON.stringify(r.storageAfterUndo));
  line("   after a reload", `tracks=${r.afterReload.tracks.length} bars=${r.afterReload.bars} undo=${r.afterReload.undoDisabled}`);
  line("⑩ `?` on /new shows the arrangement row", `${r.shortcutsModal.hasArrangementUndo} (studio row printed: ${r.shortcutsModal.hasStudioUndo})`);
  console.log(`\nscreenshots: ${report.screenshots.join(", ")}`);
  if (problems.length === 0) console.log("\n✅ every reading above is what the change claims");
  else {
    console.log("\n❌ problems:");
    for (const problem of problems) console.log(`   · ${problem}`);
  }
}

process.exit(problems.length === 0 ? 0 : 1);
