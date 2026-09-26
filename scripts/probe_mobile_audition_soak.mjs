/**
 * The mobile soak: what happens after thirty auditions in a row?
 *
 * The owner's report is "play a few seconds, tap the next track, and after a few dozen the playback stutters". That is a
 * resource question — nodes, worklet hosts, WASM instances, load — and this asks it the way the report describes: drive the
 * phone shell, start a genre, move to the next one a couple of seconds later, and read the engine's own diagnostics after
 * each step.
 *
 * The number that matters is the worklet's **load** (share of the render-quantum budget the DSP used, per host) and its
 * **violations** count, because those are what "stutter" means to the engine, plus the **host count**, which is what a leak
 * looks like from outside. A soak that ends with the same host count and the same load as it started is a soak that found
 * nothing; one that climbs is the report, reproduced.
 *
 * Usage:
 *   node scripts/probe_mobile_audition_soak.mjs [--count=30] [--hold=2000] [--out=report.json]
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

const count = Math.max(2, Number(value("count", "30")) || 30);
const holdMs = Math.max(500, Number(value("hold", "2000")) || 2000);
const out = value("out", "");
const port = Number(value("port", "6191")) || 6191;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

function startStaticServer(listenPort) {
  const dist = path.join(ROOT, "dist");
  if (!fs.existsSync(path.join(dist, "index.html"))) {
    console.error("dist/index.html not found — run `npm run build` first.");
    process.exit(1);
  }
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    let file = path.join(dist, decodeURIComponent(url.pathname));
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, "index.html");
    const body = fs.readFileSync(file);
    res.writeHead(200, {
      "content-type": MIME[path.extname(file)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(body);
  });
  return new Promise((resolve) => {
    server.listen(listenPort, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

const { chromium } = await import("playwright");
const { server } = await startStaticServer(port);
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const failures = [];
page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") failures.push(`console: ${message.text().slice(0, 160)}`);
});

/** Read the engine's own numbers, which is what "is it struggling" means here. */
const readDiagnostics = () =>
  page.evaluate(() => {
    const probe = window.__grooveProbe;
    if (!probe) return { error: "no probe surface" };
    const diagnostics = probe.engine.getGs1Diagnostics();
    const hosts = diagnostics.hosts.map((host) => {
      const analysis = host.analysis ?? {};
      return {
        trackIdx: host.trackIdx,
        role: host.role,
        instrument: host.instrument,
        ready: host.ready,
        hasHost: host.hasHost,
        load: typeof analysis.load === "number" ? Number(analysis.load.toFixed(3)) : null,
        violations: typeof analysis.violations === "number" ? analysis.violations : null,
        voices: typeof analysis.voices === "number" ? analysis.voices : null,
      };
    });
    return {
      enabled: diagnostics.enabled,
      hostCount: hosts.length,
      readyHosts: hosts.filter((host) => host.hasHost && host.ready).length,
      maxLoad: hosts.reduce((max, host) => Math.max(max, host.load ?? 0), 0),
      totalViolations: hosts.reduce((sum, host) => sum + (host.violations ?? 0), 0),
      hosts,
      // Chrome-only, and null elsewhere: a coarse memory signal, not the measurement itself.
      usedHeapMb: (() => {
        const memory = typeof performance !== "undefined" ? performance.memory : undefined;
        return memory ? Math.round((memory.usedJSHeapSize / 1048576) * 10) / 10 : null;
      })(),
    };
  });

const summary = [];
try {
  await page.goto(`http://127.0.0.1:${port}/?probe=1`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  /**
   * Put the probe flag back, because the phone shell's own routing drops it.
   *
   * `?probe=1` on the app root ends at `/m/home` with the query gone — the shell navigates to its route and the search string
   * goes with it — so the seam was never installed and this soak failed with "the surface never appeared" while the page was
   * perfectly healthy. `history.replaceState` puts it back before any engine exists, which is early enough: the flag is read
   * when the audition engine is built, on the first tap.
   */
  await page.evaluate(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("probe") !== "1") {
      url.searchParams.set("probe", "1");
      window.history.replaceState(null, "", `${url.pathname}?${url.searchParams.toString()}${url.hash}`);
    }
  });

  /**
   * The phone shell's start gate, which is also the gesture the browser's autoplay policy wants.
   *
   * Without it every tile click is intercepted by the overlay — the first run of this soak spent its timeout retrying clicks
   * against `audio-start-gate` — and, more importantly, the audio context would stay suspended and the load numbers would be
   * measuring nothing.
   */
  const gate = page.locator('[data-testid="audio-start-gate"]');
  if (await gate.count()) {
    await gate.getByRole("button").first().click();
    await page.waitForTimeout(1500);
  }

  /**
   * The genres come from the **DOM**, not a source import.
   *
   * This probe drives the built app over a static server, where `/src/...` does not exist; the home screen's own tiles carry
   * the ids (`data-testid="mobile-genre-art-<id>"`), so the list is whatever the shell is showing.
   */
  const genres = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid^="mobile-genre-art-"]'))
      .map((element) => (element.getAttribute("data-testid") ?? "").replace("mobile-genre-art-", ""))
      .filter(Boolean)
  );
  if (genres.length === 0) throw new Error("no genre tiles on the phone home screen");

  /**
   * The first audition — **and it must come before the surface is read**.
   *
   * The phone shell builds its engine lazily, on the first thing that needs audio, so at page load there is no engine and no
   * probe surface. The first run of this soak waited four seconds and then failed with "the surface never appeared", which
   * was true and unhelpful: the surface appears when a genre is tapped.
   */
  const firstTile = page.locator(`[data-testid="mobile-genre-art-${genres[0]}"]`).first();
  if (await firstTile.count()) await firstTile.click({ force: true });
  await page.waitForTimeout(holdMs);
  const surface = await page.evaluate(() => Boolean(window.__grooveProbe));
  if (!surface) {
    // Say what the page actually looks like rather than only that the surface is missing: the URL, what is on screen, and
    // whether the shell even got as far as a genre.
    const diagnosis = await page.evaluate(() => ({
      href: window.location.href,
      tiles: document.querySelectorAll('[data-testid^="mobile-genre-art-"]').length,
      gate: Boolean(document.querySelector('[data-testid="audio-start-gate"]')),
      playerBar: Boolean(document.querySelector('[data-testid^="mobile-player"], .m-playerbar, [data-testid="mobile-player-bar"]')),
      probeFlag: new URLSearchParams(window.location.search).get("probe"),
      testIds: Array.from(document.querySelectorAll("[data-testid]"))
        .map((element) => element.getAttribute("data-testid"))
        .filter((id) => id && !id.startsWith("mobile-genre-art-"))
        .slice(0, 12),
      text: document.body.innerText.slice(0, 120).replace(/\n+/g, " | "),
    }));
    throw new Error(`the probe surface never appeared after a first audition: ${JSON.stringify(diagnosis)}`);
  }

  for (let index = 0; index < count; index += 1) {
    // The first tile was tapped above to bring the engine up; the loop starts from the second genre so no step is wasted.
    const genreId = genres[(index + 1) % genres.length];
    const tile = page.locator(`[data-testid="mobile-genre-art-${genreId}"]`).first();
    if (await tile.count()) {
      await tile.click({ force: true });
    } else {
      // The tiles are the phone home screen's own hook; a shell that has not loaded them yet is worth reporting.
      failures.push(`no tile for ${genreId}`);
      await page.waitForTimeout(500);
      continue;
    }
    await page.waitForTimeout(holdMs);
    const diagnostics = await readDiagnostics();
    summary.push({ index, genreId, ...diagnostics });
    const row = summary[summary.length - 1];
    console.log(
      `${String(index + 1).padStart(2)}/${count} ${genreId.padEnd(18)} hosts ${String(row.hostCount).padStart(2)} ` +
        `ready ${String(row.readyHosts).padStart(2)}  maxLoad ${(row.maxLoad ?? 0).toFixed(3)}  ` +
        `violations ${String(row.totalViolations).padStart(3)}  heap ${row.usedHeapMb ?? "?"} MB`
    );
  }

  // Stop the last audition so the engine is idle when the numbers are read.
  const last = page.locator('[data-testid^="mobile-genre-art-"]').first();
  if (await last.count()) await last.click();
} finally {
  const report = { count, holdMs, failures: failures.slice(0, 10), summary };
  if (out) fs.writeFileSync(out, JSON.stringify(report, null, 1));
  const first = summary.find((row) => row.hostCount !== undefined);
  const lastRow = summary[summary.length - 1];
  if (first && lastRow) {
    const sawHosts = `${first.hostCount} → ${lastRow.hostCount}`;
    const sawLoad = `${(first.maxLoad ?? 0).toFixed(3)} → ${(lastRow.maxLoad ?? 0).toFixed(3)}`;
    const sawHeap = `${first.usedHeapMb ?? "?"} → ${lastRow.usedHeapMb ?? "?"} MB`;
    console.log(`\nhosts ${sawHosts} · maxLoad ${sawLoad} · heap ${sawHeap} · failures ${failures.length}`);
    const grew = (lastRow.hostCount ?? 0) > (first.hostCount ?? 0);
    const loadGrew = (lastRow.maxLoad ?? 0) > (first.maxLoad ?? 0) * 1.5 + 0.05;
    console.log(
      grew || loadGrew
        ? "❌ the soak grew: hosts or load climbed across the run — the report reproduces"
        : "✅ the soak is stable: same host count, load within noise"
    );
    if (grew || loadGrew) process.exitCode = 1;
  }
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
