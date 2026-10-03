#!/usr/bin/env node
/**
 * R2 — **the autosave "refresh inside the debounce window loses the edit" window, measured in a real browser.**
 *
 *   node scripts/probe_autosave_flush.mjs [--root .] [--out e2e-out] [--delays=100,500,900]
 *
 * WHY THIS EXISTS
 * ---------------
 * `AUTOSAVE_DEBOUNCE_MS` is 600, and the store's own comment claimed `pagehide` flushed whatever was still pending,
 * "so a refresh inside the debounce window does not lose the gesture". The owner measured the opposite in a browser:
 * change the tempo, refresh within the window, and the change is **not on screen and not in storage**. No unit
 * criterion could see it, because every layer below the surface holds — the model is right, the storage is right, and
 * the join between them is where the write never happens.
 *
 * WHAT IS JUDGED, AND IN WHAT ORDER
 * ---------------------------------
 * For each delay in `--delays`, against the real built app:
 *
 *   1. create a named project and wait for it to be stored (so the pointer and the record exist);
 *   2. read the stored tempo — the "before" reading;
 *   3. change the tempo in the DOM to a value this run will recognise;
 *   4. wait exactly `delay` ms (less than the debounce, or past it for the positive control);
 *   5. snapshot the instrumentation, then **reload the page** — this is the unload the criterion is about;
 *   6. after the reload, read the tempo **from the DOM the app drew** and **from IndexedDB directly**.
 *
 * The judgment is `stored tempo === the tempo that was typed`. A delay shorter than the debounce only survives if the
 * unload path can still write, which is exactly the property under test. The 900 ms delay is the positive control: the
 * debounce has already fired, so it must survive on any build — a run where 900 also failed would mean the probe is
 * broken rather than the app.
 *
 * THE INSTRUMENTATION (and why it survives the reload)
 * ---------------------------------------------------
 * ⭐ `IDBObjectStore.prototype.put`, `IDBFactory.prototype.open`, `IDBFactory.prototype.databases()`, `pagehide` and
 * `visibilitychange` are all patched **at document start**, and each hit is appended to `sessionStorage`
 * **synchronously**. `sessionStorage` outlives a reload in the same tab, so the log read after the reload still holds
 * the writes and the events that happened in the dying document — which a plain in-memory array (reset by the reload)
 * could not show. That log is how the verdict stops being "it was lost" and becomes "which call was never issued".
 *
 * ⚠️ The probe's own storage reads use **one long-lived connection**, for the reason `probe_new_project_persistence`
 * records: a connection opened and closed per poll made that probe's own readings disagree with each other.
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
const DELAYS = argOf("delays", "100,500,900")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isFinite(value) && value >= 0);
const PROJECT_NAME = "Autosave Flush Probe";
/** The tempo the app starts a fresh project at — the reading a lost edit falls back to. */
const BASE_BPM = 120;

if (!fs.existsSync(path.join(ROOT, "dist", "index.html"))) {
  console.error(`❌ No built app under ${ROOT}/dist — build it first.`);
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
  // `/new` is a route the app parses itself, so the server must answer it with the shell rather than a 404.
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

  /** Appends one event to a log that **survives the reload** — the whole reason `sessionStorage` is used. */
  const record = (kind, detail) => {
    try {
      const list = JSON.parse(sessionStorage.getItem("__probeEvents") || "[]");
      list.push({ kind, detail, at: Math.round(performance.now()), wall: Date.now() });
      sessionStorage.setItem("__probeEvents", JSON.stringify(list));
    } catch {
      /* quota / disabled */
    }
  };
  window.__probeRecord = record;

  /** A short, loggable description of a store call's argument — never the whole arrangement. */
  const describe = (value) => {
    if (value === null || typeof value !== "object") return value ?? null;
    const record_ = value;
    return {
      id: record_.id ?? null,
      name: record_.name ?? null,
      bpm: record_.arrangement?.bpm ?? null,
      keys: Object.keys(record_).slice(0, 8),
    };
  };

  const patch = (proto, name, kind) => {
    const original = proto[name];
    if (typeof original !== "function") return;
    proto[name] = function patched(...args) {
      try {
        record(kind, {
          target: this && this.name !== undefined ? this.name : null,
          arg: kind.startsWith("idb.") ? args[0] ?? null : describe(args[0]),
          version: kind === "idb.open" ? args[1] ?? null : undefined,
        });
      } catch {
        /* logging must never change the app's behaviour */
      }
      return original.apply(this, args);
    };
  };
  patch(IDBObjectStore.prototype, "put", "put");
  patch(IDBObjectStore.prototype, "add", "add");
  patch(IDBFactory.prototype, "open", "idb.open");
  if (typeof IDBFactory.prototype.databases === "function") patch(IDBFactory.prototype, "databases", "idb.databases");

  window.addEventListener("pagehide", (event) => record("pagehide", { persisted: event.persisted }));
  window.addEventListener("beforeunload", () => record("beforeunload", {}));
  document.addEventListener("visibilitychange", () => record("visibilitychange", { state: document.visibilityState }));

  /**
   * ⭐ **One connection, used for every reading.** Opened lazily, so it is created after the app has made the database,
   * and every read is a fresh readonly transaction on it — which is what makes the readings see the app's commits in
   * the order they happened.
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
      const record_ = all.find((entry) => entry.id === pointer?.id) ?? all[0];
      return {
        pointerId: pointer?.id ?? null,
        recordCount: all.length,
        record: record_ === undefined ? null : { id: record_.id, name: record_.name, bpm: record_.arrangement?.bpm ?? null },
        allBpms: all.map((entry) => ({ id: entry.id, bpm: entry.arrangement?.bpm ?? null })),
      };
    },
  };
});
const page = await context.newPage();

const result = { root: ROOT, projectName: PROJECT_NAME, delays: DELAYS, runs: [] };
const fail = async (message, detail) => {
  console.error(`❌ ${message}`);
  if (detail !== undefined) console.error(JSON.stringify(detail, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
  server.close();
  process.exit(1);
};

/** The stored record, read through the probe's one long-lived connection. */
const readStored = () => page.evaluate(() => window.__probeStore.read());
/** The tempo the DOM is showing, which is what a person would read. */
const readDomTempo = () => page.locator('[data-testid="arrangement-tempo"]').inputValue();
const readEvents = () =>
  page.evaluate(() => {
    const events = JSON.parse(sessionStorage.getItem("__probeEvents") || "[]");
    return {
      load: {
        timeOrigin: Math.round(performance.timeOrigin),
        navigationType: performance.getEntriesByType("navigation")[0]?.type ?? null,
      },
      puts: events.filter((entry) => entry.kind === "put" || entry.kind === "add"),
      opens: events.filter((entry) => entry.kind === "idb.open" || entry.kind === "idb.databases"),
      lifecycle: events.filter((entry) => ["pagehide", "beforeunload", "visibilitychange"].includes(entry.kind)),
      all: events,
    };
  });
const clearEvents = () =>
  page.evaluate(() => {
    sessionStorage.setItem("__probeEvents", "[]");
  });

try {
  /* ── Create a named project, and wait until it is stored ──────────────────────────────────────────────────── */
  await page.goto(`${base}/new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="new-project-panel-v2"], [data-testid="arrangement-view-v2"]', { timeout: 30000 });
  if ((await page.locator('[data-testid="new-project-panel-v2"]').count()) > 0) {
    await page.locator('[data-testid="new-project-name"]').fill(PROJECT_NAME);
    await page.click('[data-testid="new-project-create"]');
  }
  await page.waitForSelector('[data-testid="arrangement-view-v2"]', { timeout: 30000 });
  await page.waitForSelector('[data-testid="arrangement-tempo"]', { timeout: 15000 });
  // The create write and the first report are debounced; give the store longer than the debounce to settle.
  await page.waitForTimeout(1500);
  const created = await readStored();
  if (created.record === null) await fail("no arrangement record was stored after Create", created);
  result.created = created;

  /* ── The window, one delay at a time ──────────────────────────────────────────────────────────────────────── */
  for (let index = 0; index < DELAYS.length; index += 1) {
    const delay = DELAYS[index];
    /** Distinctive per run, so a value that "survived" because it was already there cannot pass. */
    const typed = BASE_BPM + 7 + index;
    const before = { stored: await readStored(), dom: await readDomTempo() };

    await clearEvents();
    await page.locator('[data-testid="arrangement-tempo"]').fill(String(typed));
    const domAtEdit = await readDomTempo();
    const setWall = Date.now();

    // ⚠️ **A pause, not a poll**: the delay is the measurement, so it is waited exactly and nothing touches the page.
    await page.waitForTimeout(delay);

    // Snapshot before the reload: the dying document's events are read from its own sessionStorage after the reload.
    const domBeforeReload = await readDomTempo();
    const reloadWall = Date.now();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="arrangement-view-v2"]', { timeout: 30000 });
    await page.waitForSelector('[data-testid="arrangement-tempo"]', { timeout: 15000 });

    const domAfter = await readDomTempo();
    const storedAfter = await readStored();
    const events = await readEvents();
    // A late commit is still worth seeing: read once more after the store has had time to finish anything in flight.
    await page.waitForTimeout(1000);
    const storedSettled = await readStored();

    const run = {
      delayMs: delay,
      typedBpm: typed,
      timing: {
        setWall,
        reloadWall,
        msBetweenEditAndReload: reloadWall - setWall,
        domAtEdit,
        domBeforeReload,
        domAfter,
      },
      before,
      after: { dom: domAfter, stored: storedAfter, storedSettled },
      /**
       * ⭐ **The verdict is the durable half, not the drawing.** A value that is only on screen after the reload would
       * be a rendering of something that is not stored, which the next refresh would lose.
       */
      storedBpm: storedSettled.record?.bpm ?? null,
      kept: (storedSettled.record?.bpm ?? null) === typed,
      events: {
        puts: events.puts,
        opens: events.opens,
        lifecycle: events.lifecycle,
        load: events.load,
      },
    };
    result.runs.push(run);

    const putSummary = run.events.puts.map((entry) => `${entry.detail?.arg?.id ?? "?"}@bpm=${entry.detail?.arg?.bpm ?? "?"}`);
    console.log(
      `delay=${delay}ms typed=${typed} domAfter=${domAfter} storedBpm=${run.storedBpm} → ${run.kept ? "KEPT" : "LOST"}` +
        ` | puts during window: [${putSummary.join(", ")}]` +
        ` | lifecycle: [${run.events.lifecycle.map((entry) => entry.kind).join(", ")}]` +
        ` | idb.open: ${run.events.opens.filter((entry) => entry.kind === "idb.open").length}`
    );
  }

  /* ── The judgment ─────────────────────────────────────────────────────────────────────────────────────────── */
  const lost = result.runs.filter((run) => !run.kept);
  result.ok = lost.length === 0;
  result.verdict = result.ok
    ? `every delay survived: ${result.runs.map((run) => `${run.delayMs}ms`).join(", ")}`
    : `lost inside the window: ${lost.map((run) => `${run.delayMs}ms (typed ${run.typedBpm}, stored ${run.storedBpm})`).join(", ")}`;

  await page.screenshot({ path: path.join(OUT, "autosave-flush-after.png") });
  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    console.error(`\n❌ autosave flush criterion RED — ${result.verdict}`);
    await browser.close();
    server.close();
    process.exit(1);
  }
  console.log(`\n✅ autosave flush criterion GREEN — ${result.verdict}`);
} catch (err) {
  await fail(err instanceof Error ? err.message : String(err));
} finally {
  await browser.close();
  server.close();
}
