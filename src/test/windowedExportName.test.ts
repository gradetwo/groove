import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * ⭐ **Two different previews must not write the same file** (third evaluation, F05).
 *
 * The evaluation exported one preview, then another, and found the second had **replaced** the first at the same path
 * (`collision-A`/`collision-B`). The name was the genre and the tempo, with the span only when the window started after
 * bar 0 — so a window that begins at bar 0, or any two requests that differ only in the music they carry, collided.
 *
 * The span half is fixed at the exporter, where the window is known; the track half is applied *before* the renderer is
 * reached, so it needs a caller-supplied name and is recorded as open work rather than claimed here.
 */
const exporter = readFileSync(resolve(__dirname, "../audio/WavExporter.ts"), "utf8");

describe("a windowed render's filename", () => {
  it("⭐ carries the window's own bars, not just the genre and the tempo", () => {
    expect(exporter, "the windowed branch exists").toContain("_master_${bpm}bpm_bars${chunk.fromBar}-${chunk.toBar}.wav");
    expect(exporter, "and is chosen whenever the render covers a window").toMatch(/const windowed = [^;]*windowBars !== undefined/);
    // ⚠️ Deliberately not asserted: that the *old* expression appears nowhere in the file. A substring check like that
    // reads its own neighbourhood (the MP3 road builds a name the same way) and would fail on prose rather than on
    // behaviour; the two assertions above are the rule.

  });
});
