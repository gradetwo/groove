/**
 * **The default render path when there is no browser: a fast refusal in this repository's own words.**
 *
 * `headless: true` has had `headlessUnavailableMessage()` since it was added: a missing `node-web-audio-api` throws
 * a sentence that names the package, the install command and the thing that did **not** happen. The *default* path —
 * the one every tool description says needs Vite + Chromium — had no such sentence. Measured on this checkout by
 * pointing `PLAYWRIGHT_BROWSERS_PATH` at a directory that does not exist, the render failed in **1.2 s** (so the
 * "fast" half was already true) with Playwright's raw block:
 *
 *     browserType.launch: Executable doesn't exist at /nonexistent-playwright/…
 *     ║ Please run the following command to download new browsers:
 *     ║     pnpm exec playwright install
 *
 * — advice for a pnpm checkout, in a repository whose own CI, `DEPLOY.md` and README all install with
 * `npx playwright install --with-deps chromium`, and which never mentions the one alternative that needs no browser
 * at all.
 *
 * So this criterion holds the whole shape rather than the sentence alone: it drives the **real** start path (a real
 * Vite child, a real `chromium.launch()` that really fails), and asserts that the refusal is quick, names the two
 * executable next steps, and keeps the engines distinct. The reverse is to delete the `browserUnavailableMessage()`
 * wrap in `ensurePage`: the raw Playwright block comes back, so the install-command assertion and the "no pnpm"
 * assertion both go red.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { browserUnavailableMessage, renderAudio, stopRenderer } from "../../mcp/render/worker";
import type { SequencerPattern } from "../types/genre";

/**
 * One bar of one lane: enough for the worker to reach `ensurePage`, and deliberately nothing that needs the network.
 * The failure under test happens **before** any audio exists, which is the point — the caller learns nothing was
 * rendered rather than waiting to find out.
 */
const STEPS = 16;
const pattern: SequencerPattern = {
  genre_id: "chicago-house",
  bpm: 120,
  swing: 0,
  scale: "C minor",
  totalSteps: STEPS,
  tracks: [
    {
      track_id: "kick",
      name: "Kick",
      instrument: "drum",
      steps: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      velocity: new Array(STEPS).fill(110),
      pitch: new Array(STEPS).fill(0),
      gate: new Array(STEPS).fill(0.8),
      volume: 0.9,
      pan: 0,
      mute: false,
      solo: false,
    },
  ],
};

describe("the default (browser) render path with no browser installed", () => {
  const savedBrowsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH;
  const savedNoBrowser = process.env.GROOVE_MCP_NO_BROWSER;

  beforeEach(() => {
    // A path no browser was ever downloaded to. Playwright reads this at `launch()`, not at import.
    process.env.PLAYWRIGHT_BROWSERS_PATH = "/nonexistent-playwright-for-the-mcp-criterion";
    // `GROOVE_MCP_NO_BROWSER` refuses earlier with a different message; this criterion is about the launch itself.
    delete process.env.GROOVE_MCP_NO_BROWSER;
  });

  afterEach(async () => {
    if (savedBrowsersPath === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH;
    else process.env.PLAYWRIGHT_BROWSERS_PATH = savedBrowsersPath;
    if (savedNoBrowser !== undefined) process.env.GROOVE_MCP_NO_BROWSER = savedNoBrowser;
    // A failed start leaves a Vite child behind otherwise, and the next file in this run would inherit nothing useful.
    await stopRenderer();
  });

  it("refuses in seconds, names the install command and the Node-host alternative, and substitutes neither engine", async () => {
    const startedAt = Date.now();
    let message = "";
    try {
      await renderAudio(pattern, { format: "wav", bars: 1 });
    } catch (error) {
      message = (error as Error).message;
    }
    const elapsedMs = Date.now() - startedAt;

    // A refusal rather than a hang: the whole defect this criterion exists for is a caller with no way to tell a
    // slow render from a dead one.
    expect(message, "the default path must refuse rather than hang or return a silent render").not.toBe("");
    expect(elapsedMs, `the refusal took ${elapsedMs} ms; a missing browser must be reported, not waited on`).toBeLessThan(60_000);

    // The command this repository actually documents, and the package-level fallback.
    expect(message).toContain("npx playwright install --with-deps chromium");
    expect(message).toContain("npm ci");
    // The next step that needs no browser at all — and the flag that selects it, named as a flag.
    expect(message).toContain("headless: true");
    // Playwright's own advice is for a pnpm checkout; this repository installs with npm and must not pass it on.
    expect(message, "Playwright's own pnpm advice must not be the advice a caller receives").not.toMatch(/pnpm exec/);
    // And the anti-fallback sentence, in the same voice `headlessUnavailableMessage()` uses.
    expect(message).toContain("No headless render was started instead");
  }, 120_000);

  it("has a sentence that names the browser, the install command and the flag, for a reason other than a missing executable", () => {
    // The pure half: a launch can fail for reasons whose message says nothing about this repository either
    // (a refused sandbox, a missing shared library, no `playwright` package at all).
    const message = browserUnavailableMessage(new Error("Target closed"));
    expect(message).toContain("Vite + Chromium");
    expect(message).toContain("npx playwright install --with-deps chromium");
    expect(message).toContain("npm ci");
    expect(message).toContain("headless: true");
    expect(message).toContain("No headless render was started instead");
    expect(message).toContain("Target closed");
  });
});
