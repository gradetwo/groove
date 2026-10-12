/**
 * Build the 256 px thumbnails the library actually draws.
 *
 * `public/covers/<skin>/<genre>.jpg` is 1024x1024 and 130-626 KB, and a genre tile is 56 px: every tile in the library used
 * to decode a megapixel to draw a thumbnail, which is tens of megabytes and hundreds of megapixels of main-thread decode for
 * one screenful while the transport is running. `public/covers/_thumbs/**` is 256x256 (13 MB for every skin plus the shared
 * set, about 12 KB each) and `genreCoverThumbCandidates` prefers it, falling back to the original and then to the shared one.
 *
 * Like the covers themselves, the output is a **deploy-time asset drop**, not source: it is ignored by `.gitignore` and copied
 * into `dist/` by the build. Re-run this after adding artwork.
 *
 * Usage:
 *   node scripts/make_cover_thumbs.mjs [--size=256] [--force]
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COVERS = path.join(ROOT, "public", "covers");
const THUMBS = path.join(COVERS, "_thumbs");
const args = process.argv.slice(2);
const value = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const size = Number(value("size", "256")) || 256;
const force = args.includes("--force");
const skins = ["default", "minimal", "comic", "soviet", "sovietYears", "pixel"];

if (!fs.existsSync(COVERS)) {
  console.error("public/covers is not present — the artwork is a deploy-time asset drop.");
  process.exit(1);
}

let built = 0;
let skipped = 0;
const one = (from, to) => {
  if (!force && fs.existsSync(to)) {
    skipped += 1;
    return;
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  execFileSync(
    "ffmpeg",
    [
      "-loglevel", "error", "-y",
      "-i", from,
      "-vf", `scale=${size}:${size}:force_original_aspect_ratio=increase,crop=${size}:${size}`,
      "-q:v", "6",
      to,
    ],
    { stdio: "inherit" }
  );
  built += 1;
};

for (const skin of skins) {
  const dir = path.join(COVERS, skin);
  if (!fs.existsSync(dir)) continue;
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".jpg"))) {
    one(path.join(dir, file), path.join(THUMBS, skin, file));
  }
}
for (const file of fs.readdirSync(COVERS).filter((name) => name.endsWith(".jpg"))) {
  one(path.join(COVERS, file), path.join(THUMBS, file));
}

console.log(`cover thumbs: ${built} built, ${skipped} already present, ${size}px, at public/covers/_thumbs`);
