/**
 * What may ship under `covers/` — and nothing else.
 *
 * The cover artwork was produced by a batch of Python scripts that lived **inside** `public/covers`, so the build copied
 * them into `dist/covers` and every deploy published them: 410 MB of `_batch_scratch`, 96 MB of `_rejected`/`_review`/
 * `_installed`, triage JSON, logs, state files and `__pycache__` — 794 MB under `dist/covers` where ~285 MB is art. The owner
 * found it by looking at `dist`.
 *
 * The tooling now lives in `tools/covers/` (outside `public/`, so it cannot be copied), and this is the gate that keeps it
 * that way: the only things allowed under a covers tree are
 *
 *   * `<genre>.jpg` at the top level,
 *   * `<skin>/<genre>.jpg` for the known skins,
 *   * `_thumbs/**` — the 256 px set the library actually draws.
 *
 * Usage:
 *   node scripts/check_covers_payload.mjs [--dir=public/covers] [--dir=dist/covers ...]
 *   (default: both `public/covers` and `dist/covers`, skipping either that does not exist)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const explicit = args.filter((a) => a.startsWith("--dir=")).map((a) => a.slice("--dir=".length));
const dirs = (explicit.length > 0 ? explicit : ["public/covers", "dist/covers"]).map((d) => path.resolve(ROOT, d));

/** The skins' own artwork directories; each holds `<genre>.jpg` only. */
const SKINS = new Set(["default", "minimal", "comic", "soviet", "sovietYears", "pixel"]);

const offenses = [];
let allowed = 0;

for (const dir of dirs) {
  if (!fs.existsSync(dir)) continue;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relative = `${path.relative(ROOT, dir)}/${entry.name}`;
    if (entry.isFile()) {
      /**
       * Artwork, plus the artwork's **attribution**.
       *
       * `CREDITS.md` records that the covers are Unsplash-licensed photographs (seeded Lorem Picsum), and attribution belongs
       * with the thing it credits — it is a few kilobytes, not payload.
       */
      if (entry.name.endsWith(".jpg") || entry.name === "CREDITS.md") allowed += 1;
      else offenses.push(`${relative} (only .jpg files — and CREDITS.md — belong at this level)`);
      continue;
    }
    if (entry.name === "_thumbs") {
      // The shared thumbnails sit at its top level (`_thumbs/<genre>.jpg`) and each skin gets a directory of its own
      // (`_thumbs/<skin>/<genre>.jpg`), which is what `make_cover_thumbs.mjs` writes and `genreCoverThumbCandidates` asks for.
      for (const child of fs.readdirSync(path.join(dir, entry.name), { withFileTypes: true })) {
        if (!child.isDirectory()) {
          if (child.name.endsWith(".jpg")) allowed += 1;
          else offenses.push(`${relative}/${child.name}`);
          continue;
        }
        for (const file of fs.readdirSync(path.join(dir, entry.name, child.name))) {
          if (file.endsWith(".jpg")) allowed += 1;
          else offenses.push(`${relative}/${child.name}/${file}`);
        }
      }
      continue;
    }
    if (SKINS.has(entry.name)) {
      for (const file of fs.readdirSync(path.join(dir, entry.name))) {
        if (file.endsWith(".jpg")) allowed += 1;
        else offenses.push(`${relative}/${file}`);
      }
      continue;
    }
    offenses.push(`${relative} (unknown directory in a covers tree)`);
  }
}

if (offenses.length > 0) {
  console.error(`❌ ${offenses.length} non-artwork item(s) under a covers tree:`);
  for (const offense of offenses.slice(0, 25)) console.error(`   - ${offense}`);
  if (offenses.length > 25) console.error(`   … and ${offenses.length - 25} more`);
  console.error(
    "\n   Cover-production tooling and scratch work belong in `tools/covers/`, which is outside `public/` and therefore\n" +
      "   never copied into `dist`. Artwork is `<genre>.jpg`, `<skin>/<genre>.jpg` and `_thumbs/**`."
  );
  process.exit(1);
}

console.log(`✅ covers payload: ${allowed} artwork file(s), nothing else`);
