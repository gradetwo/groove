/**
 * Does the built application actually start?
 *
 * This exists because it stopped: the commit that added the boot splash rewrote the end of `index.html` and deleted
 * `<script type="module" src="/src/main.tsx">`. Every build after it was a **dead shell** — the splash painted forever, React
 * never mounted, and nothing reported an error: no `pageerror`, no console error, no failed request. It was found by CI's
 * voice sweep timing out while waiting for a probe seam that could never install, and by nothing else, because the other probes
 * drive surfaces or open a bare document of their own rather than the app.
 *
 * So this is the cheapest possible check with the widest possible blast radius: serve `dist`, open the app, and require that
 * React has taken over. The document's own first frame is the marker — it is removed by the first commit, so its absence is
 * exactly "the application started" — plus a mounted surface and a clean console.
 *
 * Usage: node scripts/probe_boot.mjs [--port=6271]
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const value = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const port = Number(value("port", "6271")) || 6271;
const dist = path.join(ROOT, "dist");

if (!fs.existsSync(path.join(dist, "index.html"))) {
  console.error("❌ dist/index.html not found — run `npm run build` first.");
  process.exit(1);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  let file = path.join(dist, decodeURIComponent(url.pathname));
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, "index.html");
  res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
  res.end(fs.readFileSync(file));
});
await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));

const { chromium } = await import("playwright");
let exitCode = 0;
let browser;
try {
  /**
   * The HTML must name an entry module at all.
   *
   * Checked before a browser is launched, because it is the exact failure this probe was written for and it deserves a message
   * that says so rather than a timeout.
   */
  const html = fs.readFileSync(path.join(dist, "index.html"), "utf8");
  if (!/<script[^>]+type="module"[^>]*>/.test(html)) {
    throw new Error("dist/index.html has no module script — the built page cannot start the application");
  }

  browser = await chromium.launch({ args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const failures = [];
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message.slice(0, 200)}`));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console: ${message.text().slice(0, 200)}`);
  });
  page.on("requestfailed", (request) =>
    failures.push(`request failed: ${request.url().slice(0, 120)} ${request.failure()?.errorText ?? ""}`)
  );

  await page.addInitScript(() => {
    try {
      localStorage.setItem("groove_onboarding_completed", "true");
      localStorage.setItem("groove_audio_started", "1");
    } catch {
      /* storage disabled */
    }
  });

  await page.goto(`http://127.0.0.1:${port}/?tab=studio`, { waitUntil: "domcontentloaded" });
  /**
   * The first frame going away **is** the proof that React committed.
   *
   * It is written into the document and removed by the app's first render, so this waits for the application to take over
   * rather than for a particular screen — which would make the probe a test of that screen.
   */
  await page.waitForFunction(() => !document.getElementById("bs"), null, { timeout: 30000 });

  const state = await page.evaluate(() => ({
    splashGone: !document.getElementById("bs"),
    surface: Boolean(document.querySelector('[data-testid="studio-toolbar"], [data-testid="mobile-shell"]')),
    rootChildren: document.getElementById("root")?.children.length ?? 0,
    text: (document.body.innerText ?? "").slice(0, 60).replace(/\s+/g, " "),
  }));

  if (!state.splashGone || state.rootChildren === 0) {
    throw new Error(`the application never took over: ${JSON.stringify(state)}`);
  }
  if (failures.length > 0) {
    throw new Error(`the page reported ${failures.length} problem(s):\n   ${failures.slice(0, 5).join("\n   ")}`);
  }
  console.log(`✅ the built app starts: ${state.surface ? "a mounted surface" : "a mounted root"}, “${state.text}…”`);
} catch (error) {
  console.error(`❌ ${error.message}`);
  exitCode = 1;
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
process.exit(exitCode);
