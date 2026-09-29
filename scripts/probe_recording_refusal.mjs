/**
 * What the recording path does **when there is no microphone** — the half of it CI can judge.
 *
 * CI's Chromium has `MediaRecorder` and no capture device, so "a performance can be recorded" is not verifiable there; "a missing device is reported by name, with nothing created" is, and it is the half more
 * worth guarding: an exception escaping a click handler is what a user experiences as a button that does nothing, while a named refusal becomes a sentence on screen.
 *
 * It asks the **application's own module**, through vite's dev server, rather than re-implementing the path — the same reason the end-to-end probe walks the app's loader: a criterion that writes its own version
 * of the thing under test only ever tests itself.
 *
 * Shape copied from `probe_sfz_end_to_end.mjs`, **including the `server.kill` in `finally`**: without it a successful run prints its result and then hangs, which in CI looks like a step stuck `in_progress` for
 * twenty-five minutes. That mistake cost a real afternoon.
 */
// ⭐ ESM, so `import` — a `.mjs` file cannot use `require`, and this one did until the probe failed with `ERR_AMBIGUOUS_MODULE_SYNTAX` on the first line that mattered.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const ROOT = process.cwd();
const port = Number((process.argv.slice(2).find((a) => a.startsWith("--port=")) ?? "--port=3191").split("=")[1]);

if (!fs.existsSync(path.join(ROOT, "node_modules", "vite", "bin", "vite.js"))) {
  console.error("❌ No node_modules — run `npm ci` first.");
  process.exit(1);
}

const viteBin = path.join(ROOT, "node_modules/vite/bin/vite.js");
const server = spawn(process.execPath, [viteBin, "--port", String(port), "--strictPort"], {
  cwd: ROOT,
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", () => {});
server.stderr.on("data", () => {});
const base = `http://127.0.0.1:${port}`;

const log = (...parts) => console.log("  rec :", ...parts);
let browser;
let failed = false;

try {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await fetch(base, { signal: AbortSignal.timeout(1000) });
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(base, { waitUntil: "domcontentloaded" });

  // ⭐ The app's own module, served by vite as TypeScript — so this judges the real path rather than a copy of it.
  const result = await page.evaluate(async () => {
    const { captureWithBrowser } = await import("/src/audio/captureBrowser.ts");
    const { createMemoryRecordingStore } = await import("/src/audio/recordingStore.ts");
    const store = createMemoryRecordingStore();
    const supported = typeof navigator.mediaDevices?.getUserMedia === "function" && typeof MediaRecorder !== "undefined";
    const outcome = await captureWithBrowser(store, { source: "audio", recordedAt: Date.now() });
    return { supported, outcome, stored: await store.list() };
  });

  log(`MediaRecorder present: ${result.supported}`);
  log(`outcome: ok=${result.outcome.ok} refusal=${result.outcome.refusal ?? "-"}`);

  // ⭐ Every assertion here is about a failure being **reported**, because that is what a user meets.
  const named = ["no-device", "permission-denied", "unsupported", "failed"];
  if (result.outcome.ok) {
    failed = true;
    log("❌ a capture succeeded with no microphone — the stream was never requested or the refusal was ignored");
  } else if (!named.includes(result.outcome.refusal)) {
    failed = true;
    log(`❌ the refusal was not named: ${result.outcome.refusal}`);
  } else if (!result.outcome.summary || result.outcome.summary.length < 10) {
    // A refusal without a readable sentence is what a caller cannot put on screen.
    failed = true;
    log(`❌ the refusal carries no readable summary: ${JSON.stringify(result.outcome.summary)}`);
  } else if (result.stored.length !== 0) {
    // An empty take is one a user can select, and selecting it would silently replace what was on the track.
    failed = true;
    log(`❌ a take was stored despite the refusal: ${result.stored.join(", ")}`);
  } else {
    log(`✅ REFUSED BY NAME — ${result.outcome.refusal}: ${result.outcome.summary}`);
  }
} catch (error) {
  failed = true;
  log(`❌ ${error instanceof Error ? error.message : String(error)}`);
} finally {
  await browser?.close().catch(() => undefined);
  // ⭐ Killed on success too: a live vite process keeps Node alive and turns a finished measurement into a hang.
  server.kill("SIGTERM");
  process.exitCode = failed ? 1 : 0;
}
