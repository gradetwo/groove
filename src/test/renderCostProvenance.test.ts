/**
 * ⭐ The quoted render costs and the document they come from have to agree.
 *
 * `mcp/render/budget.json` says, in its own `provenance` field, where its numbers came from and asks
 * the reader to re-read the documents before changing one. Nothing checked that the documents still
 * contain those numbers, so the reply could quote a cost the profile no longer supports — the exact
 * drift between a script's numbers and its prose that this project keeps insisting on preventing.
 *
 * The document also has to keep naming the command that reproduces the figures, because a number
 * nobody can re-measure is a number nobody can correct.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const budget = JSON.parse(readFileSync("mcp/render/budget.json", "utf8")) as {
  measured: {
    fullRateRatio: number;
    oneBarAudioSec: number;
    oneBarWallSec: [number, number];
    eightBarAudioSec: number;
    eightBarWallSec: [number, number];
    previewAudioSec: number;
    previewWallSec: number;
  };
  provenance: string;
};
const profile = readFileSync("docs/RENDER_PROFILE.md", "utf8");

describe("render cost provenance", () => {
  it("quotes numbers the profile document actually contains", () => {
    const m = budget.measured;
    const want = [
      String(m.oneBarAudioSec),
      String(m.oneBarWallSec[0]),
      String(m.oneBarWallSec[1]),
      String(m.eightBarAudioSec),
      String(m.eightBarWallSec[0]),
      String(m.eightBarWallSec[1]),
    ];
    const missing = want.filter((n) => !profile.includes(n));
    expect(missing, `budget.json quotes costs the profile no longer states: ${missing.join(", ")}`).toEqual([]);
  });

  it("keeps the command that reproduces them", () => {
    expect(profile).toContain("profile_offline_render.mjs");
    expect(budget.provenance.length).toBeGreaterThan(40);
  });
});
