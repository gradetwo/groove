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
import { TOOLS } from "../../mcp/registry";
import { addMcpNote, addMcpTrack, clearMcpArrangements, createMcpArrangement } from "../../mcp/arrangement";
import { clearMcpSongs, createMcpSong } from "../../mcp/song";
import { findGenre } from "../../mcp/library";
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

/**
 * **The same Node host, reached through a tool rather than through the worker.**
 *
 * The case above proves the engine; this one proves the *song* path into it — `render_song` flattens an arrangement and
 * hands the single pattern to `renderAudio`, so it is the owner's first-priority entry and the one whose reply shape is
 * a spread rather than a curated one. `src/test/mcpHeadlessRouting.test.ts` holds the same route with the Node host
 * mocked; this holds it with the browser forbidden and a real render, which is the only way to see `engine` come back
 * from a finished file. It skips loudly with the other case when the optional package is absent.
 */
describe.skipIf(!headlessInstalled)("render_song on the Node Web Audio host", () => {
  let out = "";

  beforeEach(() => {
    clearMcpSongs();
    out = mkdtempSync(path.join(os.tmpdir(), "groove-headless-song-"));
    process.env.GROOVE_MCP_NO_BROWSER = "1";
    process.env.GROOVE_MCP_OUT = out;
  });

  afterEach(() => {
    clearMcpSongs();
    rmSync(out, { recursive: true, force: true });
    delete process.env.GROOVE_MCP_NO_BROWSER;
    delete process.env.GROOVE_MCP_OUT;
  });

  it("bounces a song with the browser forbidden, and names the engine in the tool's own reply", async () => {
    const { songId } = createMcpSong({ genreId: "chicago-house", genre: findGenre("chicago-house") ?? null });
    const tool = TOOLS.find((candidate) => candidate.name === "render_song");
    expect(tool, "render_song is not declared").toBeTruthy();

    const reply = (await tool!.handler({ songId, sampleRate: 8000, channels: 1, headless: true })) as Record<string, unknown>;

    expect(reply.engine).toBe("node-web-audio-api");
    expect(reply.songId).toBe(songId);
    expect(statSync(String(reply.path)).size).toBeGreaterThan(1000);
    expect(readFileSync(String(reply.path)).toString("ascii", 0, 4)).toBe("RIFF");
    expect(reply.sampleRate).toBe(8000);
    expect(Number(reply.truePeakDb)).toBeGreaterThan(-40);
  }, 180_000);
});

/**
 * **The three tools that used to answer "no Node path".**
 *
 * `docs/HEADLESS_CORE_PLAN.md` §9.6 recorded three exclusions: `normalize_loudness` because it renders more than once,
 * `render_instrument_note` because its page body was called a path with no Node implementation, and
 * `render_arrangement_stems` because its per-track page call carried a `stemTrackIdx` the Node module did not accept.
 * Each of those was an argument about *wiring*; these cases hold the wiring, with the browser forbidden so a fallback
 * would be an error rather than a slower render.
 */
describe.skipIf(!headlessInstalled)("normalize_loudness on the Node Web Audio host", () => {
  let out = "";

  beforeEach(() => {
    clearMcpSongs();
    out = mkdtempSync(path.join(os.tmpdir(), "groove-headless-normalize-"));
    process.env.GROOVE_MCP_NO_BROWSER = "1";
    process.env.GROOVE_MCP_OUT = out;
  });

  afterEach(() => {
    clearMcpSongs();
    rmSync(out, { recursive: true, force: true });
    delete process.env.GROOVE_MCP_NO_BROWSER;
    delete process.env.GROOVE_MCP_OUT;
  });

  it("measures and renders on the Node host, and says so in the reply", async () => {
    const { songId } = createMcpSong({ genreId: "chicago-house", genre: findGenre("chicago-house") ?? null });
    const tool = TOOLS.find((candidate) => candidate.name === "normalize_loudness");
    expect(tool, "normalize_loudness is not declared").toBeTruthy();

    // The default `passes: 1` is the measured path: one render, its reading, and the trim the loop would apply next.
    const reply = (await tool!.handler({ songId, targetLufs: -14, passes: 1, sampleRate: 8000, channels: 1, headless: true })) as Record<string, unknown>;

    expect(reply.engine, "the loudness loop must name the host every pass used").toBe("node-web-audio-api");
    const before = reply.before as Record<string, unknown>;
    expect(statSync(String(before.path)).size).toBeGreaterThan(1000);
    expect(readFileSync(String(before.path)).toString("ascii", 0, 4)).toBe("RIFF");
    expect(Number(before.integratedLufs), "a real reading, not a placeholder").toBeLessThan(0);
    expect(Number.isFinite(Number(before.truePeakDb))).toBe(true);
    expect(reply.passes).toBe(1);
  }, 180_000);
});

describe.skipIf(!headlessInstalled)("render_instrument_note on the Node Web Audio host", () => {
  let out = "";

  beforeEach(() => {
    out = mkdtempSync(path.join(os.tmpdir(), "groove-headless-note-"));
    process.env.GROOVE_MCP_NO_BROWSER = "1";
    process.env.GROOVE_MCP_OUT = out;
  });

  afterEach(() => {
    rmSync(out, { recursive: true, force: true });
    delete process.env.GROOVE_MCP_NO_BROWSER;
    delete process.env.GROOVE_MCP_OUT;
  });

  it("resolves and renders one note with the browser forbidden, through the same loader", async (context) => {
    const tool = TOOLS.find((candidate) => candidate.name === "render_instrument_note");
    expect(tool, "render_instrument_note is not declared").toBeTruthy();

    let reply: Record<string, unknown>;
    try {
      reply = (await tool!.handler({ assetId: "vsco2ce:ViolinEnsSusVib", midi: 60, seconds: 0.5, sampleRate: 8000, headless: true })) as Record<string, unknown>;
    } catch (error) {
      /**
       * The one external dependency of this case is the sample mirror, not the engine. An unreachable mirror makes the
       * loader refuse the note, which is a *result* on this tool and not a failed engine — so the case skips loudly
       * rather than turning a network outage into a red criterion. The engine half is held by the mocked routing
       * criterion and by the other two real renders here, neither of which needs the network.
       */
      if (/fetch|network|ENOTFOUND|ECONNREFUSED|HTTP \d|neither address/i.test((error as Error).message)) {
        console.warn(`SKIP  render_instrument_note real render: sample mirror unreachable — ${(error as Error).message}`);
        context.skip();
        return;
      }
      throw error;
    }

    expect(reply.engine).toBe("node-web-audio-api");
    expect(reply.assetId).toBe("vsco2ce:ViolinEnsSusVib");
    // The resolved half is the whole point of the tool, and it is the same `loadNote` the browser path uses.
    const resolved = reply.resolved as Record<string, unknown>;
    expect(String(resolved.samplePath), "the same sample the browser path resolves to").toContain("VlnEns_susVib_B2_v2.wav");
    expect(Number(resolved.rootKey)).toBe(59);
    // 2^(1/12): the ratio this sample is played at for midi 60, which is the claim `docs/PITCH_TRUTH.md` publishes.
    expect(Number(resolved.ratio)).toBeCloseTo(1.0594630943592953, 10);
    expect(statSync(String(reply.path)).size).toBeGreaterThan(1000);
    expect(readFileSync(String(reply.path)).toString("ascii", 0, 4)).toBe("RIFF");
    expect(reply.silent).toBe(false);
  }, 180_000);
});

/**
 * **`get_pitch_report`'s source half on the Node host.**
 *
 * It goes through the same `auditionInstrumentNote` entry with `resolveOnly`, so it is the same loader on the same host
 * with the render skipped: the `engine` here names the resolver, and no audio exists. The mirror is the only external
 * dependency, so this skips on the same condition the note case does rather than turning an outage into a red criterion.
 */
describe.skipIf(!headlessInstalled)("get_pitch_report's source half on the Node Web Audio host", () => {
  let out = "";

  beforeEach(() => {
    out = mkdtempSync(path.join(os.tmpdir(), "groove-headless-pitch-"));
    process.env.GROOVE_MCP_NO_BROWSER = "1";
    process.env.GROOVE_MCP_OUT = out;
  });

  afterEach(() => {
    rmSync(out, { recursive: true, force: true });
    delete process.env.GROOVE_MCP_NO_BROWSER;
    delete process.env.GROOVE_MCP_OUT;
  });

  it("resolves the source on the Node host with the browser forbidden, and renders nothing", async (context) => {
    const tool = TOOLS.find((candidate) => candidate.name === "get_pitch_report");
    expect(tool, "get_pitch_report is not declared").toBeTruthy();

    const reply = (await tool!.handler({ midi: [60], assetId: "vsco2ce:ViolinEnsSusVib", headless: true })) as Record<string, unknown>;
    const problems = (reply.sourceProblems as string[] | undefined) ?? [];
    if (problems.some((problem) => /fetch|network|ENOTFOUND|ECONNREFUSED|HTTP \d|neither address/i.test(problem))) {
      console.warn(`SKIP  get_pitch_report real resolution: sample mirror unreachable — ${problems.join(" | ")}`);
      context.skip();
      return;
    }

    expect(problems, "the mirror answered, so nothing should have failed").toHaveLength(0);
    expect(reply.engine).toBe("node-web-audio-api");
    const notes = reply.notes as Array<Record<string, unknown>>;
    const source = notes[0]?.source as Record<string, unknown>;
    expect(String(source?.samplePath)).toContain("VlnEns_susVib_B2_v2.wav");
    expect(Number(source?.rootKey)).toBe(59);
    // The arithmetic half is unchanged by which host resolved the other half.
    expect(Number(notes[0]?.frequencyHz)).toBeCloseTo(261.625565, 4);
  }, 180_000);
});

describe.skipIf(!headlessInstalled)("render_arrangement_stems on the Node Web Audio host", () => {
  let out = "";

  beforeEach(() => {
    clearMcpArrangements();
    out = mkdtempSync(path.join(os.tmpdir(), "groove-headless-stems-"));
    process.env.GROOVE_MCP_NO_BROWSER = "1";
    process.env.GROOVE_MCP_OUT = out;
  });

  afterEach(() => {
    clearMcpArrangements();
    rmSync(out, { recursive: true, force: true });
    delete process.env.GROOVE_MCP_NO_BROWSER;
    delete process.env.GROOVE_MCP_OUT;
  });

  it("writes one file per track on the Node host, each measured from its own buffer", async () => {
    const { arrangementId, tracks } = createMcpArrangement({ blankKind: "drumkit", songId: "stem-probe" });
    addMcpNote(arrangementId, { trackId: tracks[0]!.id, pitch: 36, startBeats: 0, lengthBeats: 0.5, velocity: 110 });
    const second = addMcpTrack(arrangementId, tracks[0]!.kind, "Second");
    const secondId = second.summary.tracks[second.summary.tracks.length - 1]!.id;
    addMcpNote(arrangementId, { trackId: secondId, pitch: 38, startBeats: 1, lengthBeats: 0.5, velocity: 90 });

    const tool = TOOLS.find((candidate) => candidate.name === "render_arrangement_stems");
    expect(tool, "render_arrangement_stems is not declared").toBeTruthy();

    const reply = (await tool!.handler({ arrangementId, sampleRate: 8000, channels: 1, headless: true })) as Record<string, unknown>;

    expect(reply.engine).toBe("node-web-audio-api");
    const stems = reply.stems as Array<Record<string, unknown>>;
    expect(stems, "one file per track, not one for the mix").toHaveLength(2);
    for (const stem of stems) {
      expect(statSync(String(stem.path)).size).toBeGreaterThan(1000);
      expect(readFileSync(String(stem.path)).toString("ascii", 0, 4)).toBe("RIFF");
      expect(Number(stem.durationSec)).toBeGreaterThan(0);
      expect(Number.isFinite(Number(stem.truePeakDb))).toBe(true);
      expect(stem.silent).toBe(false);
    }
  }, 180_000);
});
