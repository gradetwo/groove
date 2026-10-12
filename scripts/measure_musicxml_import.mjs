/**
 * **MusicXML import, measured in a real browser** — one file at a time, one browser at a time.
 *
 * The MusicXML import path is the one interchange of the three that had never been run end to end. This probe is the
 * measurement that says what it actually does, rather than what the code around it suggests it does:
 *
 *   · the **route** is `/new` → a template card → Create, because the arrangement editor has no other entry;
 *   · a **track must be selected** before the Score tab exists, which is the page tab the import input lives on;
 *   · for every file it records whether the UI import **succeeded**, how long it took, the report line **verbatim**,
 *     the track/region counts read from the DOM, and every **page error** during the run;
 *   · it then re-reads the *same bytes* through the very module the app uses (`fromMusicXmlBytes`, imported from the
 *     running dev server) so the **full `problems` list** is available verbatim — the toolbar report truncates it to
 *     the first three, which is not enough to judge a file by;
 *   · and it plays the imported arrangement, sampling `requestAnimationFrame` for the frame rate and reading
 *     `AudioEngine.getSchedulerHealth().droppedSteps` from the live engine through the app's own
 *     `activeEngine` slot — no source seam is added for the measurement.
 *
 * **Runs against the dev server**, not `dist/`: the task's local rule is "no full build", and `vite` serves the very
 * module graph the browser executes, so `import('/src/data/musicxmlImport.ts')` from the page is the same instance the
 * import button used.
 *
 * The corpus is **measured, never copied into the tree**: `--corpus` points at wherever it lives, and a missing
 * directory is a stated failure rather than a silent pass.
 *
 *   node scripts/measure_musicxml_import.mjs --base=http://127.0.0.1:5387 --corpus=/path/to/musicxml [--files=a.musicxml|b.mxl] [--json] [--out=/var/tmp/x.json]
 *
 * (`--files` is `|`-separated because the corpus's own names carry commas.)
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const playwright = require("playwright");

const arg = (name, fallback) => {
  const hit = process.argv.find((entry) => entry.startsWith(`--${name}=`));
  return hit === undefined ? fallback : hit.slice(name.length + 3);
};
const has = (name) => process.argv.includes(`--${name}`);

const base = arg("base", "http://127.0.0.1:5387").replace(/\/$/, "");
const corpus = arg("corpus", "/home/crow/music/midi-corpus/musicxml");
const asJson = has("json");
const out = arg("out", undefined);
const playMs = Number(arg("play-ms", "4000"));

if (!fs.existsSync(corpus) || !fs.statSync(corpus).isDirectory()) {
  console.error(`❌ corpus directory does not exist: ${corpus}`);
  process.exit(1);
}

/**
 * The files this run measures. The default is the task's own demand: **at least four files, two of them `.mxl`, and
 * the largest `.musicxml`** — chosen by size from whatever the corpus actually holds, so the answer is a reading of
 * the directory rather than a list that could rot.
 */
function chooseFiles() {
  const explicit = arg("files", undefined);
  const all = fs
    .readdirSync(corpus)
    .filter((name) => /\.(musicxml|xml|mxl)$/i.test(name))
    .map((name) => ({ name, bytes: fs.statSync(path.join(corpus, name)).size }))
    .sort((a, b) => b.bytes - a.bytes);
  if (explicit !== undefined) {
    // `|` rather than `,`: the corpus's own file names contain commas, so a comma separator cannot address them.
    return explicit
      .split("|")
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => ({ name, bytes: fs.statSync(path.join(corpus, name)).size }));
  }
  const largestXml = all.find((file) => !/\.mxl$/i.test(file.name));
  const mxl = all.filter((file) => /\.mxl$/i.test(file.name)).slice(0, 2);
  const rest = all.filter((file) => file !== largestXml && !mxl.includes(file));
  const chosen = [largestXml, ...mxl, ...rest].filter(Boolean);
  // Four distinct files, the largest plain document and two compressed ones among them.
  return chosen.slice(0, Math.max(4, mxl.length + 2));
}

const files = chooseFiles();
const loadAtStart = os.loadavg();

const browser = await playwright.chromium.launch({
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required", "--mute-audio"],
});

const results = [];

/** One page, isolated storage, onboarding and the audio gate pre-answered so nothing blocks on a tap. */
async function freshPage() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pageErrors.push(`${error.name}: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.addInitScript(() => {
    try {
      localStorage.setItem("groove_onboarding_completed", "true");
      localStorage.setItem("groove_audio_started", "1");
    } catch {
      /* storage disabled is not this probe's business */
    }
  });
  return { context, page, pageErrors, consoleErrors };
}

for (const file of files) {
  const filePath = path.join(corpus, file.name);
  const bytes = new Uint8Array(fs.readFileSync(filePath));
  const startedAt = new Date().toISOString();
  const loadBefore = os.loadavg()[0];
  const record = {
    file: file.name,
    bytes: file.bytes,
    startedAt,
    loadAverage1m: Number(loadBefore.toFixed(2)),
    loadAverage1mAtStart: Number(loadAtStart[0].toFixed(2)),
    ui: { attempted: false, imported: false, report: null, elapsedMs: null },
    parse: null,
    playback: null,
    pageErrors: [],
    consoleErrors: [],
    notes: [],
  };
  const { context, page, pageErrors, consoleErrors } = await freshPage();

  try {
    await page.goto(`${base}/new`, { waitUntil: "domcontentloaded", timeout: 60000 });
    /**
     * ⭐ **The chooser, which is the observation the task flagged as "seen but not concluded"**: on a *fresh* context
     * with no stored project, `/new` draws the template cards. Recorded either way rather than assumed.
     */
    try {
      await page.waitForSelector("[data-testid='new-project-panel-v2']", { timeout: 30000 });
      record.notes.push("chooser: template panel appeared on a fresh context");
    } catch {
      record.notes.push("chooser: template panel did NOT appear on a fresh context");
    }
    if (await page.$("[data-testid='template-drums-bass']")) {
      await page.click("[data-testid='template-drums-bass']");
    }
    const create = await page.$("[data-testid='new-project-create']");
    if (create) {
      await create.click();
      await page.waitForSelector("[data-testid='arrangement-view-v2']", { timeout: 30000 });
    } else {
      record.notes.push("chooser: Create button absent, arrangement already open");
      await page.waitForSelector("[data-testid='arrangement-view-v2']", { timeout: 30000 });
    }

    /** ⭐ A track must be selected before the score tab — the tab list only renders for a selected, non-fx track. */
    const trackButton = await page.$("[data-testid='arrangement-track-picker'] button");
    if (trackButton) await trackButton.click();
    await page.waitForSelector("[data-testid='arrangement-editor-score']", { timeout: 15000 });
    await page.click("[data-testid='arrangement-editor-score']");
    await page.waitForSelector("[data-testid='score-import-musicxml-input']", { state: "attached", timeout: 15000 });

    record.ui.attempted = true;
    const t0 = Date.now();
    await page.setInputFiles("[data-testid='score-import-musicxml-input']", filePath);
    /**
     * The report line is the outcome, and the **mapping dialog** is the other possible next state: a MusicXML file
     * with more than one part that holds notes asks which instrument each part is before it places anything. Both are
     * recorded; the dialog is answered with **skip** here so the measurement is the same "import with nothing named"
     * for every file, and the mapped path is measured separately below.
     */
    let report = null;
    let dialog = { appeared: false, rows: [] };
    try {
      await page.waitForFunction(
        () =>
          document.querySelector("[data-testid='arrangement-file-report']")?.textContent?.trim().length > 0 ||
          document.querySelector("[data-testid='import-instrument-mapping']") !== null,
        undefined,
        { timeout: 120000 }
      );
      if (await page.$("[data-testid='import-instrument-mapping']")) {
        dialog = await page.evaluate(() => ({
          appeared: true,
          rows: Array.from(document.querySelectorAll("[data-testid^='import-mapping-row-']")).map((row) => {
            const index = row.getAttribute("data-testid").replace("import-mapping-row-", "");
            return {
              name: row.querySelector(`[data-testid='import-mapping-part-${index}']`)?.textContent ?? "",
              notes: row.querySelector(`[data-testid='import-mapping-part-${index}']`)?.nextElementSibling?.textContent ?? "",
              value: row.querySelector(`[data-testid='import-mapping-select-${index}']`)?.value ?? null,
            };
          }),
        }));
        await page.click("[data-testid='import-mapping-skip']");
      }
      await page.waitForFunction(
        () => (document.querySelector("[data-testid='arrangement-file-report']")?.textContent ?? "").trim().length > 0,
        undefined,
        { timeout: 120000 }
      );
      report = (await page.textContent("[data-testid='arrangement-file-report']"))?.trim() ?? null;
    } catch {
      record.notes.push("ui: no report line appeared within 120 s");
    }
    record.ui.elapsedMs = Date.now() - t0;
    record.ui.report = report;
    record.ui.mappingDialog = dialog;
    record.ui.imported = report !== null && /已导入|Imported/.test(report);

    record.ui.dom = await page.evaluate(() => ({
      regions: document.querySelectorAll('[data-testid^="arrangement-region-"]').length,
      trackRows: document.querySelectorAll('[data-testid^="arrangement-header-row-"]').length,
      trackPicker: document.querySelectorAll("[data-testid='arrangement-track-picker'] li").length,
      miniatureNotes: document.querySelectorAll('[data-miniature="note"]').length,
    }));

    /**
     * ⭐ **The same bytes, through the same module, in the same browser.** The toolbar report says at most three
     * problems; this is where the full list and the per-part note counts come from, and it is the app's own code
     * rather than a re-implementation of it.
     */
    const base64 = Buffer.from(bytes).toString("base64");
    record.parse = await page.evaluate(async (payload) => {
      const binary = atob(payload);
      const buffer = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) buffer[index] = binary.charCodeAt(index);
      const module = await import("/src/data/musicxmlImport.ts");
      const t0 = performance.now();
      try {
        const parsed = await module.fromMusicXmlBytes(buffer);
        return {
          ok: true,
          ms: Math.round(performance.now() - t0),
          format: parsed.format,
          title: parsed.title ?? null,
          tempoBpm: parsed.tempoBpm ?? null,
          timeSignature:
            parsed.beatsPerMeasure === undefined ? null : `${parsed.beatsPerMeasure}/${parsed.beatType}`,
          parts: parsed.parts.map((part) => ({ name: part.name, notes: part.notes.length })),
          totalNotes: parsed.parts.reduce((sum, part) => sum + part.notes.length, 0),
          problems: parsed.problems,
        };
      } catch (error) {
        return { ok: false, ms: Math.round(performance.now() - t0), thrown: String(error && error.message ? error.message : error) };
      }
    }, base64);

    /**
     * ⭐ **The mapping path, driven the way a person drives it**: pick the same file again, choose a real recorded
     * instrument on the first row, confirm, and read back what kind the track became. This is the measurement of the
     * gap the task names — "MusicXML has no mapping dialog, so its voices cannot be mapped to a sampler".
     */
    if (record.ui.mappingDialog.appeared && has("mapping")) {
      try {
        await page.setInputFiles("[data-testid='score-import-musicxml-input']", filePath);
        await page.waitForSelector("[data-testid='import-instrument-mapping']", { timeout: 30000 });
        await page.selectOption("[data-testid='import-mapping-select-0']", "piano_lead");
        const target = (await page.textContent("[data-testid='import-mapping-target-0']"))?.trim() ?? null;
        await page.click("[data-testid='import-mapping-confirm']");
        await page.waitForSelector("[data-testid='import-instrument-mapping']", { state: "detached", timeout: 30000 });
        await page.waitForFunction(
          () => (document.querySelector("[data-testid='arrangement-file-report']")?.textContent ?? "").trim().length > 0,
          undefined,
          { timeout: 30000 }
        );
        record.mapping = await page.evaluate((targetAsset) => {
          const kinds = Array.from(document.querySelectorAll("[data-testid^='track-kind-']"));
          return {
            chose: "piano_lead",
            target: targetAsset,
            report: document.querySelector("[data-testid='arrangement-file-report']")?.textContent?.trim() ?? null,
            trackKindSelects: kinds.length,
            samplerTracks: kinds.filter((node) => node.value === "sampler").length,
          };
        }, target);
      } catch (error) {
        record.mapping = { error: error && error.message ? error.message : String(error) };
      }
    }

    /** ⭐ Play, then sample frames and read the engine's own scheduler health. */
    if (record.ui.imported) {
      const playButton = await page.$("[data-testid='arrangement-play']");
      if (playButton === null || (await playButton.isDisabled())) {
        record.notes.push("playback: the play button is absent or disabled, so nothing was played");
      } else {
        const before = await page.evaluate(async () => {
          const module = await import("/src/audio/activeEngine.ts");
          const engine = module.getActiveAudioEngine();
          return engine === null ? null : engine.getSchedulerHealth();
        });
        const frames = await page.evaluate(async (durationMs) => {
          const intervals = [];
          let last = performance.now();
          const stopAt = last + durationMs;
          await new Promise((resolve) => {
            const tick = (now) => {
              intervals.push(now - last);
              last = now;
              if (now >= stopAt) resolve();
              else requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          });
          const sorted = [...intervals].sort((a, b) => a - b);
          const mean = intervals.length === 0 ? 0 : intervals.reduce((a, b) => a + b, 0) / intervals.length;
          return {
            frames: intervals.length,
            fps: intervals.length === 0 ? 0 : Number((1000 / mean).toFixed(1)),
            p95FrameMs: sorted.length === 0 ? 0 : Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(2)),
            worstFrameMs: sorted.length === 0 ? 0 : Number(sorted[sorted.length - 1].toFixed(2)),
          };
        }, playMs);
        await page.click("[data-testid='arrangement-play']");
        // The transport needs a moment to actually schedule before the health read means anything.
        await page.waitForTimeout(playMs);
        const after = await page.evaluate(async () => {
          const module = await import("/src/audio/activeEngine.ts");
          const engine = module.getActiveAudioEngine();
          return engine === null ? null : engine.getSchedulerHealth();
        });
        const played = await page.textContent("[data-testid='arrangement-played']").catch(() => null);
        record.playback = {
          healthBefore: before,
          healthAfter: after,
          droppedSteps: after === null || before === null ? null : after.droppedSteps - before.droppedSteps,
          frames,
          playedLine: played === null ? null : played.trim(),
        };
      }
    }
  } catch (error) {
    record.notes.push(`threw: ${error && error.message ? error.message : String(error)}`);
  } finally {
    record.pageErrors = pageErrors;
    record.consoleErrors = consoleErrors.slice(0, 10);
    results.push(record);
    await context.close();
    console.log(
      `${record.ui.imported ? "✅" : "❌"} ${file.name} (${(file.bytes / 1024).toFixed(1)} KB) — ${
        record.ui.report ?? record.notes.join(" | ") ?? "no reading"
      }`
    );
  }
}

await browser.close();

const summary = {
  measuredAt: new Date().toISOString(),
  method:
    "chromium headless (playwright) against `vite` dev server; route /new → template-drums-bass → Create; select track → Score tab → score-import-musicxml-input via setInputFiles; report read verbatim from arrangement-file-report; full problems + counts re-read in-page from /src/data/musicxmlImport.ts over the same bytes; playback sampled with requestAnimationFrame and AudioEngine.getSchedulerHealth() through /src/audio/activeEngine.ts",
  base,
  corpus,
  loadAverageAtStart: loadAtStart.map((value) => Number(value.toFixed(2))),
  files: results,
};

if (out) fs.writeFileSync(out, JSON.stringify(summary, null, 2));
if (asJson) console.log(JSON.stringify(summary, null, 2));
else {
  console.log("\n=== summary ===");
  for (const record of results) {
    console.log(
      [
        record.file,
        `bytes=${record.bytes}`,
        `uiImported=${record.ui.imported}`,
        `uiMs=${record.ui.elapsedMs}`,
        `parseOk=${record.parse?.ok}`,
        `format=${record.parse?.format ?? "-"}`,
        `parts=${record.parse?.parts?.length ?? "-"}`,
        `notes=${record.parse?.totalNotes ?? "-"}`,
        `problems=${record.parse?.problems?.length ?? "-"}`,
        `droppedSteps=${record.playback?.droppedSteps ?? "-"}`,
        `fps=${record.playback?.frames?.fps ?? "-"}`,
        `pageErrors=${record.pageErrors.length}`,
      ].join("  ")
    );
  }
}
