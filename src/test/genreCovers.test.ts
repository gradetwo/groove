/**
 * Every genre has a cover image on disk.
 *
 * The covers are real photographs fetched from Lorem Picsum (Unsplash-licensed; see
 * `public/covers/CREDITS.md`), one per genre, seeded by the genre id so the pairing is stable. This
 * test is the gate for the asset set: it fails if a genre loses its cover (a broken image in the
 * library) or if a cover is suspiciously small (a truncated download).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ALL_GENRES } from "../data/genres";

const COVERS_DIR = path.join(process.cwd(), "public", "covers");

describe("genre covers", () => {
  it("ships one JPEG per genre", () => {
    expect(fs.existsSync(COVERS_DIR), "public/covers").toBe(true);
    const missing = ALL_GENRES.filter((genre) => !fs.existsSync(path.join(COVERS_DIR, `${genre.id}.jpg`)));
    expect(missing.map((genre) => genre.id)).toEqual([]);
  });

  it("has no truncated or empty cover", () => {
    const tooSmall = ALL_GENRES.filter((genre) => {
      const file = path.join(COVERS_DIR, `${genre.id}.jpg`);
      if (!fs.existsSync(file)) return true;
      const { size } = fs.statSync(file);
      // A real 320x320 JPEG is tens of KB; anything under 2 KB is an error page or a partial write.
      return size < 2048;
    });
    expect(tooSmall.map((genre) => genre.id)).toEqual([]);
  });

  it("leaves no orphan cover behind", () => {
    const ids = new Set(ALL_GENRES.map((genre) => `${genre.id}.jpg`));
    const orphans = fs.readdirSync(COVERS_DIR).filter((name) => name.endsWith(".jpg") && !ids.has(name));
    expect(orphans).toEqual([]);
  });

  it("records where the images come from", () => {
    const credits = fs.readFileSync(path.join(COVERS_DIR, "CREDITS.md"), "utf8");
    expect(credits).toMatch(/picsum/i);
    expect(credits).toMatch(/Unsplash/i);
  });
});
