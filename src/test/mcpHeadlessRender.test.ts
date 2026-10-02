/**
 * **The headless MCP entry, rendered for real — and rendered with the browser forbidden.**
 *
 * `src/test/mcpHeadlessRouting.test.ts` holds *which* engine a call reaches; this file holds that the Node engine
 * actually produces a file. The environment does the anti-fallback work: `GROOVE_MCP_NO_BROWSER=1` would refuse a
 * browser render outright, so a pass here is not "headless was preferred" — it is "headless was the only path left".
 *
 * **Optional dependency, like the probes.** `node-web-audio-api` is deliberately undeclared
 * (`docs/HEADLESS_CORE_PLAN.md`), so this describes as skipped on a checkout that has not installed it, loudly, the
 * same way `scripts/probe_headless_parity.ts` does: a criterion that fails for a missing optional package teaches
 * people to ignore criteria.
 *
 * The fixture is the parity probe's own three-lane pattern — two native voices and one GS-1-routed one — because that
 * is the fixture the divergence numbers in the tool description were measured on, and because it is the one that makes
 * the Node host load a real worklet and both wasm cores out of `public/`.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { HEADLESS_PACKAGE } from "../../mcp/render/headless";
import { renderAudio } from "../../mcp/render/worker";
import type { SequencerPattern } from "../types/genre";

/** Whether the optional host is installed; asked synchronously so `describe.skipIf` can decide. */
const headlessInstalled = ((): boolean => {
  try {
    createRequire(import.meta.url)(HEADLESS_PACKAGE);
    return true;
  } catch {
    return false;
  }
})();

if (!headlessInstalled) {
  console.warn(
    "SKIP  the headless render criterion is skipped: `node-web-audio-api` is not installed.\n" +
      "   install it to run it:  npm i -D node-web-audio-api\n" +
      "   (deliberately not a declared dependency yet — see docs/HEADLESS_CORE_PLAN.md)"
  );
}

/** One bar, three lanes: two native (kick, bass) and one GS-1-routed (`chords`), so a pass exercises the worklets. */
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
    {
      track_id: "bass",
      name: "Bass",
      instrument: "bass",
      steps: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
      velocity: new Array(STEPS).fill(95),
      pitch: [36, 36, 36, 36, 38, 38, 38, 38, 36, 36, 36, 36, 41, 41, 41, 41],
      gate: new Array(STEPS).fill(0.7),
      volume: 0.85,
      pan: 0,
      mute: false,
      solo: false,
    },
    {
      track_id: "chords",
      name: "Chords",
      instrument: "warm_pad",
      steps: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      velocity: new Array(STEPS).fill(90),
      pitch: [60, 60, 60, 60, 62, 62, 62, 62, 64, 64, 64, 64, 67, 67, 67, 67],
      gate: new Array(STEPS).fill(0.9),
      volume: 0.8,
      pan: 0,
      mute: false,
      solo: false,
    },
  ],
};

describe.skipIf(!headlessInstalled)("render_audio on the Node Web Audio host", () => {
  let out = "";

  beforeEach(() => {
    out = mkdtempSync(path.join(os.tmpdir(), "groove-headless-"));
  });

  afterEach(() => {
    rmSync(out, { recursive: true, force: true });
    delete process.env.GROOVE_MCP_NO_BROWSER;
    delete process.env.GROOVE_MCP_OUT;
  });

  it("writes a real WAV with the browser forbidden, and names the engine that produced it", async () => {
    // ⭐ The browser cannot answer here. A silent fallback would not be slow — it would be an error.
    process.env.GROOVE_MCP_NO_BROWSER = "1";
    process.env.GROOVE_MCP_OUT = out;

    const result = await renderAudio(pattern, {
      format: "wav",
      bars: 1,
      // The analysis levers, so a real render of a real engine stays a second rather than half a minute.
      sampleRate: 8000,
      channels: 1,
      headless: true,
      genreId: "headless-probe",
    });

    // What host, in the reply rather than in a log.
    expect(result.engine).toBe("node-web-audio-api");
    // A file, with a RIFF header and audio in it — "a render happened" measured from the bytes.
    expect(statSync(result.path).size).toBeGreaterThan(1000);
    expect(readFileSync(result.path).toString("ascii", 0, 4)).toBe("RIFF");
    expect(result.sampleRate).toBe(8000);
    expect(result.channels).toBe(1);
    expect(result.durationSec).toBeGreaterThan(0.5);
    expect(Number.isFinite(result.truePeakDb), "silence has no true peak").toBe(true);
    expect(Number.isFinite(result.integratedLufs), "silence has no loudness").toBe(true);
    // A whole-bar render of three lanes is not a −60 dBFS whisper; this is the "not silence" assertion.
    expect(result.truePeakDb).toBeGreaterThan(-40);
  }, 180_000);
});
