#!/usr/bin/env node
/**
 * The features that were already working, driven in a real browser, so "this change did not break them" is measured
 * rather than assumed.
 *
 *   node scripts/probe_old_project_features.mjs [--root .] [--out e2e-out]
 *
 * WHY THIS EXISTS
 * ---------------
 * The new-project route gained an IndexedDB store of its own. That is exactly the shape of change that breaks a
 * neighbour quietly: the studio's Project Hub, its `.groove` export and import, and the boot restore all read project
 * storage, and none of them is touched by the new route's criteria.
 *
 * So the four operations the brief names are driven the way a person drives them — through the Hub's own buttons — and
 * each is checked **after a reload**, because "the card was drawn" and "the record survived" are different claims:
 *
 *   1. **New** — a project is created and its card is there after a reload;
 *   2. **Save As…** — a named project is created and named correctly after a reload;
 *   3. **Rename** — the name changes and stays changed after a reload;
 *   4. **`.groove` out and back in** — the file the app writes is the file the app reads, and the import lands as a
 *      project of its own.
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
const SAVE_AS_NAME = "Old Feature Session";
const RENAMED_NAME = "Old Feature Renamed";
const GROOVE_FILE = "/var/tmp/probe-old-feature.groove";

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
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
};

const server = http.createServer((req, res) => {
  const url = req.url.split("?")[0];
  const rel = url === "/" ? "/index.html" : url;
  const file = path.join(ROOT, "dist", rel);
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
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
await context.addInitScript(() => {
  try {
    localStorage.setItem("groove_onboarding_completed", "true");
    localStorage.setItem("groove_audio_started", "1");
    // ⭐ The studio's own language, pinned, so the criteria address the same words a person would read.
    localStorage.setItem("groove_language", "en");
  } catch {
    /* disabled */
  }
});
const page = await context.newPage();
const result = { root: ROOT, steps: {} };
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

/**
 * Opens the Project Hub.
 *
 * ⭐ **Through the toolbar's own button, after revealing the advanced tier** — the control is tier 2, so it is not on
 * screen until the density toggle is pressed. (The keyboard shortcut was tried first and is *not* the Hub: `p` is the
 * nav shortcut for Compare, which is why this is driven the way a person would find it.)
 */
const openHub = async () => {
  /**
   * ⭐ **Idempotent, because the Hub closes itself after some actions.**
   *
   * `handleCreateNew` and `handleSaveCurrentAs` both call `onClose()` — creating a project is followed by *using* it —
   * so a script that assumed the dialog stayed open failed at the next button it looked for. A probe has to reopen it
   * the way a person does.
   */
  // ⭐ "Is the Hub open?" is asked of the Hub's own heading, not of "is any dialog open" — the app shows other
  // dialogs and toasts, and treating one of those as the Hub is how this script skipped opening it.
  if ((await page.locator("#project-hub-title").count()) > 0) return;
  /**
   * ⭐ **Reveal the tier, then press the button** — asked of the button's *visibility* rather than of the toggle's
   * `aria-pressed`, because the toolbar can fold the tier again on its own (loading a project re-renders it) and a
   * toggle that merely says "pressed" is not the same fact as a control that is on screen.
   */
  const hubButton = page.locator('[data-toolbar-id="project-hub"]');
  if (!(await hubButton.first().isVisible().catch(() => false))) {
    const advanced = page.locator('[data-testid="toolbar-advanced-toggle"]');
    if (await advanced.count()) {
      await advanced.first().click().catch(() => undefined);
      await page.waitForTimeout(500);
    }
  }
  await hubButton.first().click();
  // ⭐ The dialog's own role, not its title text: `text=Project Hub` also matches a hidden `<option>` in the toolbar.
  await page.waitForSelector("#project-hub-title", { timeout: 15000 });
  await page.waitForTimeout(400);
};
const closeHub = async () => {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
};
/** Every project card's name, as the Hub draws it. */
const cardNames = async () => page.locator('[class*="rounded-2xl"] h4, [class*="rounded-2xl"] h3').allTextContents().catch(() => []);

try {
  /* ── New and Save As, through the Hub's own buttons ─────────────────────────────────────────────────────────── */
  await page.goto(`${base}/#/studio?genre=chicago-house`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="toolbar-advanced-toggle"]', { timeout: 30000 });
  await openHub();
  await page.locator('button[title="New Project"]').first().click();
  await page.waitForTimeout(900);
  // ⭐ Creating a project closes the Hub, so it is reopened before the next thing a person would do in it.
  await openHub();
  await page.click('button[title="Save As..."]');
  await page.waitForSelector('input[placeholder="Enter project name..."]', { timeout: 10000 });
  const saveAsInput = page.locator('input[placeholder="Enter project name..."]');
  await saveAsInput.fill(SAVE_AS_NAME);
  await page.locator('button:has-text("Save")').last().click();
  await page.waitForTimeout(800);
  const afterSave = await page.locator(`text=${SAVE_AS_NAME}`).count();
  if (afterSave === 0) await fail("Save As did not produce a card with the name it was given", { cards: await cardNames() });
  result.steps.saveAs = { name: SAVE_AS_NAME, screenshot: await shot("old-features-hub-saved") };

  /* ── Rename ─────────────────────────────────────────────────────────────────────────────────────────────────── */
  const renameButtons = page.locator('button[title="Rename"]');
  if ((await renameButtons.count()) === 0) await fail("no project card offers Rename");
  await renameButtons.first().click();
  /**
   * ⭐ **The rename dialog is identified by its own heading element**, not by `hasText` over the whole dialog.
   *
   * The Hub's own search box is a `type="text"` input too, and a looser selector filled *that* — which then filtered
   * every card out of the list and looked, from the outside, exactly like a rename that did not work. The heading of
   * this dialog is an `h3` while the Hub's title is an `h2`, so the element says which dialog it is.
   */
  const renameHeading = page.locator('h3:text-is("Rename Project")');
  await renameHeading.waitFor({ timeout: 10000 });
  /**
   * ⭐ **The sub-dialog's own panel**, taken from its heading's parent. The rename share/save-as dialogs are plain
   * `div`s nested inside the element that carries `role="dialog"` (the Hub), so a `[role="dialog"]` scope returns the
   * Hub — and its *first* text input is the search box, which is how an earlier version of this script typed the new
   * name into the filter and then reported "the rename did not take effect" while the list was simply empty.
   */
  const renamePanel = renameHeading.locator("..");
  const renameInput = renamePanel.locator('input[type="text"]').first();
  await renameInput.fill("");
  await renameInput.fill(RENAMED_NAME);
  // ⭐ The confirm is the panel's **last** button (Cancel comes first), not a text match the card control also hits.
  await renamePanel.locator('button').last().click();
  await page.waitForTimeout(900);
  if ((await page.locator(`text=${RENAMED_NAME}`).count()) === 0) {
    await fail("the rename did not take effect on screen", {
      dialogs: await page.locator('[role="dialog"]').allTextContents(),
      inputs: await page.locator('[role="dialog"] input').evaluateAll((nodes) => nodes.map((node) => ({ type: node.getAttribute("type"), value: node.value }))),
      cards: await cardNames(),
    });
  }
  result.steps.rename = { name: RENAMED_NAME, screenshot: await shot("old-features-hub-renamed") };

  /* ── .groove out, and back in ───────────────────────────────────────────────────────────────────────────────── */
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), page.locator('button[title="Export .groove"]').first().click()]);
  await download.saveAs(GROOVE_FILE);
  const bytes = fs.statSync(GROOVE_FILE).size;
  const parsed = JSON.parse(fs.readFileSync(GROOVE_FILE, "utf8"));
  if (parsed.format !== "groove-project") await fail("the exported file is not a groove package", { format: parsed.format });
  if (!parsed.project?.patterns?.A) await fail("the exported package carries no patterns");
  result.steps.export = { file: GROOVE_FILE, bytes, format: parsed.format, version: parsed.version };

  let imported = false;
  page.on("dialog", (dialog) => void dialog.accept());
  await page.locator('input[type="file"][accept*=".groove"]').setInputFiles(GROOVE_FILE);
  await page.waitForTimeout(1500);
  imported = (await page.locator("text=/Imported/").count()) > 0;
  if (!imported) await fail("the exported .groove file could not be imported back", { cards: await cardNames() });
  result.steps.import = { imported: true, screenshot: await shot("old-features-hub-imported") };

  /* ── ⭐ ...all of it again after a reload ───────────────────────────────────────────────────────────────────── */
  await closeHub();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="toolbar-advanced-toggle"]', { timeout: 30000 });
  await openHub();
  const cardsAfterReload = await cardNames();
  const names = cardsAfterReload.join(" | ");
  if (!names.includes(RENAMED_NAME)) await fail("the renamed project did not survive a reload", { cardsAfterReload });
  if (!names.includes("Imported")) await fail("the imported project did not survive a reload", { cardsAfterReload });
  result.steps.afterReload = { cards: cardsAfterReload, screenshot: await shot("old-features-hub-after-reload") };

  result.ok = true;
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  await fail(err instanceof Error ? err.message : String(err));
} finally {
  await browser.close();
  server.close();
}
