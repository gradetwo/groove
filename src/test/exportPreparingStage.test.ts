import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * ⭐ **The export's silent six seconds are named** (Web functional test of v2.35.9: *"導出 MP3/WAV 要等渲染：點擊後無進度提示"*).
 *
 * Measured 2026-10-10 with `scratch/probe-export-progress.mjs`: the progress row is real (`10 % · ~58s left`), but its first
 * frame arrives **6.42 s** after the click. Long-task observation ruled out a blocked main thread (longest 352 ms, all
 * after 9.5 s), and the code shows where the time goes: `wavFileFor` awaits `audioLaneOptions(pattern)` — the catalogue and
 * the recordings — before the renderer reports anything. The headless path narrates that stage (`recordings ready: 12 of
 * 40`); the web path showed a bare ellipsis.
 */
const files = readFileSync(resolve(__dirname, "../features/arrangement/arrangementFiles.ts"), "utf8");
const entries = readFileSync(resolve(__dirname, "../components/arrangement/ArrangementFileEntriesV2.tsx"), "utf8");
const locale = readFileSync(resolve(__dirname, "../i18n/locales/common.ts"), "utf8");

describe("the export names its preparation stage", () => {
  it("⭐ reports before the audio lanes are fetched, not after", () => {
    const reportAt = files.indexOf("onProgress?.(0, 0)");
    const lanesAt = files.indexOf("await audioLaneOptions(pattern)");
    expect(reportAt, "the report exists").toBeGreaterThan(-1);
    expect(lanesAt, "the lanes are still fetched").toBeGreaterThan(-1);
    expect(reportAt, "and the report comes first, or it describes work already done").toBeLessThan(lanesAt);
  });

  it("⭐ and the interface says which stage it is, instead of a bare ellipsis", () => {
    expect(entries, "the preparing word is used").toContain("arrangement_export_preparing");
    expect(entries, "only before real progress exists").toMatch(/fraction < 0\.03[\s\S]{0,80}arrangement_export_preparing/);
  });

  it("⭐ with both languages present", () => {
    const at = locale.indexOf("arrangement_export_preparing:");
    expect(at, "the key exists").toBeGreaterThan(-1);
    const block = locale.slice(at, at + 260);
    expect(block, "English").toMatch(/Preparing instruments/);
    expect(block, "and Chinese").toMatch(/正在准备乐器/);
  });
});
