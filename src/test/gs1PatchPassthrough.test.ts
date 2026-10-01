/**
 * The GS-1 patch pass-through: a caller's own share code reaches the rendered audio.
 *
 * ## What this file is for
 *
 * The synth project already owns the patch format (`gs1.patch.get` prints a `gs1.1.` **share code**;
 * `gs1.patch.set`/`gs1.render` accept one). This surface stores that opaque string on a lane
 * (`SequencerTrack.gs1Patch`) and resolves it in **one** place, `resolveGs1Lane`. Three claims are
 * measured here, and none of them is a flag:
 *
 *   1. a valid code **changes the audio** — measured on the vendored WASM core itself, through the
 *      repository's own 13-band timbre fingerprint, not by asserting that a field was set;
 *   2. a corrupt code is a **reported problem naming the lane**, and the lane is not silently
 *      voiced by something else;
 *   3. host creation and note planning share **one** resolution — the test says in its own words
 *      what would have to break for it to fail.
 *
 * ## The fixtures are the synth's own output, not hand-written
 *
 * `ACID_CODE` was produced by the synthesizer project's own encoder, from its own factory preset:
 *
 *   cd /home/crow/music/synth
 *   node -e "import('./mcp/lib/data.mjs').then(async ({loadData}) => {
 *     const d = await loadData();
 *     const { presetShareCode } = await import('./mcp/lib/patch.mjs');
 *     console.log(presetShareCode(d, 'acid').code);
 *   })"
 *
 * so it is the exact string `gs1.patch.get` hands a caller — a format invented here would pass a
 * test written here and fail against the tool that produces the real thing.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/** Recorded host interactions, shared with the mock below. */
const recorded = vi.hoisted(() => ({
  hosts: 0,
  /** Every `setPatch` payload, in host-creation order. */
  patches: [] as Array<Record<number, number>>,
  /** Every route write, per host: `[slot, src, dst, amount, enabled]`. */
  routes: [] as number[][],
  noteOnAt: [] as number[][],
}));

vi.mock("../audio/gs1/Gs1Host", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../audio/gs1/Gs1Host")>();
  return {
    ...actual,
    createGs1Host: async () => {
      recorded.hosts += 1;
      const host = {
        scheduledNoteLatencyFrames: 128,
        ready: Promise.resolve({ abi: GS1_EXPECTED_ABI, variant: "simd" }),
        output: { connect: () => undefined },
        noteOnAt: (note: number, velocity: number, atFrame: number, pan?: number) =>
          recorded.noteOnAt.push([note, velocity, atFrame, pan ?? 0]),
        noteOffAt: () => undefined,
        setTuningNote: () => undefined,
        setPatch: (values: Record<number, number>) => recorded.patches.push({ ...values }),
        setModRoute: (slot: number, src: number, dst: number, amount: number, enabled: boolean) =>
          recorded.routes.push([slot, src, dst, amount, enabled ? 1 : 0]),
        importSample: () => Promise.resolve({ has: true, code: 0 }),
        allNotesOff: () => undefined,
        dispose: () => undefined,
        onAnalysis: () => () => undefined,
      };
      return host;
    },
  };
});

setGs1OfflineCapability("usable");

import { GS1_EXPECTED_ABI } from "../audio/gs1/Gs1Host";
import { renderPatternOffline } from "../audio/WavExporter";
import {
  DEFAULT_GS1_ROUTING_ENABLED,
  applyGs1VoiceRoutes,
  planGs1Notes,
  resolveGs1Lane,
  setGs1RoutingEnabled,
} from "../audio/gs1/gs1Tracks";
import { decodeGs1PatchCode } from "../audio/gs1/gs1PatchCode";
import { setGs1OfflineCapability } from "../audio/gs1/gs1OfflineCapability";
import { Gs1VoicePool } from "../audio/gs1/Gs1VoicePool";
import { GS1_PATCHES, GS1_PATCH_VELOCITY_TO_CUTOFF, gs1VelocityRoute } from "../data/gs1Patches";
import { DEFAULT_PARAMS } from "../../vendor/gs1/src/audio/params";
import { fingerprintChannels, fingerprintDistance } from "./helpers/timbre";
import { installFakeOfflineAudioContext } from "./helpers/fakeAudio";
import { validatePattern } from "../../mcp/pattern";
import { TOOLS } from "../../mcp/registry";
import type { SequencerPattern } from "../types/genre";

setGs1OfflineCapability("usable");

const SR = 48000;

/** A real `gs1.patch.get` code for the synth's `acid` factory preset (see the file header). */
const ACID_CODE =
  "gs1.1.eyJzIjo0LCJ2IjpbMC43NSwxLDIsLTEyLDcsMC44LDAuNSwwLDMsLTEyLC02LDAuMiwwLjUsMCw4MDAsMC44NSwwLjU1LDAuNzUsMCwwLjAwMiwwLjE0LDAuMiwwLjEyLDAsMCw0LjYsMC4zMiwwLDAsMCwwLjQ1LDAuMSwwLDIsMC4zNSwwLjIyLDAsMTIwLDIsMCwwLDAsMCwwLDAuNSwwLjYsMC40LDAsMC4zLDAuNSwwLjQsMCwwLjQsMC42LDAuNSwwLDAuNCwwLjYsMC4wMSwwLjMsMC41LDAuMywwLDEsMC41LDAuMywwLDAuMzUsMC44LDAuMDEyLDEsMC4zNSwxLDAuMzUsMCwwLDAsMCwyLjgxLDAsMC4zNSwwLDEsMiwzLDQsNSw2LDAsMCwwLDAsMCwwLDAsMSw2MCwwLDAsMSwwLDEsMiwzLDQsNSw2LDEsMSwxLDEsMSwxLDAsMCwwLDAsMCwwLDEsMSwxLDEsMSwxLDAsMCwwLDAsMCwxLDEsMSwxLDEsMSwxLDAsMCwwLDAsMC40LDAsMC40LDAsMCwwLDAsOTAwMCwwLjI1LDAuMTUsMC41LDAsOCw0LDAuNSwxLDAsMCwyMDAsMCwxMDAwLDAuOSwwLDQwMDAsMSwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDEsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwXSwiciI6W1swLDAsMC44LDFdLFsyLDAsMC41NSwxXSxbMCwxLDAuMTgsMF0sWzMsMCwwLjQsMF1dfQ";

/** A code from the synth with a **second layer** (`p2`), hand-built as the format documents it. */
function layeredCode(): string {
  const payload = { s: 4, v: [0.75], p2: [0.5] };
  return "gs1.1." + btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function makePattern(gs1Patch?: string): SequencerPattern {
  const steps = 16;
  const track = (track_id: string, name: string, instrument: string, pitch: number) => ({
    track_id,
    name,
    instrument,
    steps: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    velocity: new Array(steps).fill(100),
    pitch: [pitch, ...new Array(steps - 1).fill(0)],
    gate: new Array(steps).fill(0.8),
    volume: 0.8,
    pan: 0,
    mute: false,
    solo: false,
  });
  const chords = track("chords", "Chords", "warm_pad", 60);
  return {
    genre_id: "chicago-house",
    bpm: 120,
    swing: 0,
    scale: "C minor",
    totalSteps: steps,
    /**
     * **One lane, on purpose.** Every assertion about `recorded.patches` below is about *this*
     * lane, and a second routed lane (a lead) would add a second host and a second `setPatch`,
     * making "the corrupt lane built nothing" unreadable. The lead's own path is covered by
     * `gs1ExportParity.test.ts`.
     */
    tracks: [gs1Patch === undefined ? chords : { ...chords, gs1Patch }] as SequencerPattern["tracks"],
  };
}

let restore: (() => void) | null = null;
afterEach(() => {
  restore?.();
  restore = null;
  setGs1RoutingEnabled(DEFAULT_GS1_ROUTING_ENABLED);
  recorded.hosts = 0;
  recorded.patches.length = 0;
  recorded.routes.length = 0;
  recorded.noteOnAt.length = 0;
});

describe("the synth's share code is the format this renderer reads", () => {
  it("decodes a code produced by the synth's own encoder", () => {
    const decoded = decodeGs1PatchCode(ACID_CODE);
    expect(decoded.ok, decoded.ok ? "" : decoded.problem).toBe(true);
    if (!decoded.ok) return;
    // Every parameter the table knows is present, defaults filled in — the same record
    // `Gs1Host.setPatch` wants.
    expect(Object.keys(decoded.patch.params).length).toBe(Object.keys(DEFAULT_PARAMS).length);
    // …and the code's own routing travels with it (this preset carries four rows).
    expect(decoded.patch.routes.length).toBe(4);
    // A value the preset really sets, so "it decoded" is not confused with "it decoded to defaults".
    expect(decoded.patch.params).not.toEqual({ ...DEFAULT_PARAMS });
  });

  it("refuses what upstream's decodePatch refuses, with a reason instead of null", () => {
    for (const bad of [
      "",
      "not a code at all",
      "gs1.1.not!base64!",
      "gs1.1." + btoa("not json").replace(/=+$/, ""),
      "gs1.1." + btoa('{"s":4}').replace(/=+$/, ""), // no `v`
      "gs1.1." + btoa('{"s":99,"v":[0.5]}').replace(/=+$/, ""), // newer schema
      "gs1.2.AAAA", // a deflated arrangement code
      layeredCode(), // a second layer this renderer cannot play
    ]) {
      const decoded = decodeGs1PatchCode(bad);
      expect(decoded.ok, `"${bad.slice(0, 24)}" should be refused`).toBe(false);
      if (!decoded.ok) expect(decoded.problem.length).toBeGreaterThan(10);
    }
  });

  it("names the lane when validate_pattern sees a code it cannot read", () => {
    const validation = validatePattern(makePattern("gs1.1.@@@not-a-code"));
    expect(validation.ok).toBe(false);
    expect(
      validation.problems.some((problem) => problem.includes('track "chords"') && problem.includes("GS-1 patch")),
      JSON.stringify(validation.problems)
    ).toBe(true);
  });
});

describe("a lane carrying a valid code renders with it, and the audio measurably changes", () => {
  it("hands the host the code's parameters — not the instrument table's patch", async () => {
    restore = installFakeOfflineAudioContext();
    setGs1RoutingEnabled(true);
    await renderPatternOffline(makePattern(ACID_CODE), { bars: 1, sampleRate: SR });

    const decoded = decodeGs1PatchCode(ACID_CODE);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(recorded.patches.length).toBeGreaterThan(0);
    // Byte-for-byte the decoded record: the lane's own sound reached `setPatch`.
    expect(recorded.patches[0]).toEqual(decoded.patch.params);
    // …and it is *not* the table's answer, which is the whole point of the override.
    expect(recorded.patches[0]).not.toEqual(GS1_PATCHES.warmPad);
  });

  it("changes the core's own output measurably — measured, not asserted by a flag", () => {
    const decoded = decodeGs1PatchCode(ACID_CODE);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;

    // What the renderer itself would wire for each case: the table patch's velocity response on
    // slot 0, against the share code's own four routes (`applyGs1VoiceRoutes`).
    const velocity = gs1VelocityRoute(GS1_PATCH_VELOCITY_TO_CUTOFF.warmPad);
    const tableRoutes = velocity ? [{ ...velocity, enabled: true }] : null;
    const table = renderThroughCore(GS1_PATCHES.warmPad, tableRoutes);
    const code = renderThroughCore(decoded.patch.params, decoded.patch.routes);
    expect(table.length).toBe(code.length);

    const tablePrint = fingerprintChannels([table], SR);
    const codePrint = fingerprintChannels([code], SR);
    const shapeDistanceDb = fingerprintDistance(tablePrint, codePrint);
    const centroidRatio = codePrint.centroidHz / tablePrint.centroidHz;

    // Both are real sounds, so the comparison is not silence against silence.
    expect(tablePrint.rmsDb).toBeGreaterThan(-40);
    expect(codePrint.rmsDb).toBeGreaterThan(-40);
    /**
     * The measured separation, with the numbers printed so a future reader can see the margin
     * rather than trust the constant. `acid` is a resonant saw at an 800 Hz cutoff (0.85
     * resonance) against `warmPad`'s detuned saws at 1.5 kHz: the fingerprint distance measured
     * **4.78 dB** and the centroid **869 → 1287 Hz (×1.48)** on the vendored core at 48 kHz, so
     * the thresholds sit under those values with room for a legitimate re-pin of the core.
     */
    console.log(
      `[gs1-patch-passthrough] fingerprint distance ${shapeDistanceDb.toFixed(2)} dB, ` +
        `centroid ${tablePrint.centroidHz.toFixed(0)} Hz → ${codePrint.centroidHz.toFixed(0)} Hz (×${centroidRatio.toFixed(2)})`
    );
    expect(shapeDistanceDb, "the two patches must differ in spectral shape").toBeGreaterThan(3);
    expect(centroidRatio, "the share code's patch must have a measurably different centroid").toBeGreaterThan(1.25);
  });
});

describe("a corrupt code is a reported problem naming the lane, never silence", () => {
  it("reports it from the render, and does not build a host around a guess", async () => {
    restore = installFakeOfflineAudioContext();
    setGs1RoutingEnabled(true);
    const problems: string[] = [];
    await renderPatternOffline(makePattern("gs1.1.this-is-not-base64!!"), {
      bars: 1,
      sampleRate: SR,
      onGs1PatchProblems: (rows) => problems.push(...rows),
    });

    expect(problems.length).toBe(1);
    expect(problems[0]).toContain("chords");
    expect(problems[0]).toMatch(/base64url|share code|patch/i);
    // The lane was not voiced by a guessed patch: nothing was pushed to a host for it.
    expect(recorded.patches.length).toBe(0);
  });
});

describe("the single resolution seam", () => {
  /**
   * **How this detects the defect it exists to prevent.** Host creation and note planning used to
   * resolve the patch twice — `WavExporter` called `gs1PatchFor` to build the host, and
   * `planGs1Notes` called `resolveRoutedPatch` again. With an override that is a lane field, an
   * override reaching only one of them renders a file that disagrees with the patch that was
   * applied ("the second sound"). The first assertion below is an **identity**, not an equality:
   * the plan is handed the very object the host was built from, so the two cannot drift. The second
   * assertion is the failure mode made visible — a plan that resolves on its own, with no code,
   * gets `warmPad`, a *different* record. If the exporter ever stopped passing its resolved voice
   * (or passed only `patchCode` to host creation), the plan would take that second path and the
   * two payloads below would stop being the same object.
   */
  it("hands note planning the very voice host creation used", () => {
    const lane = resolveGs1Lane("chords", "warm_pad", null, ACID_CODE);
    expect(lane.kind).toBe("voice");
    if (lane.kind !== "voice") return;
    const voice = lane.voice;

    const planned = planGs1Notes({
      role: "chords",
      instrument: "warm_pad",
      voice,
      notes: [{ note: 60, time: 0, duration: 0.25, velocity: 0.8 }],
      sampleRate: SR,
    });
    expect(planned).not.toBeNull();
    expect(planned!.params).toBe(voice.params);
    expect(planned!.patchKey).toBe(ACID_CODE);

    // The defect, made observable: a second, independent resolution gets the table's patch.
    const independentlyResolved = planGs1Notes({
      role: "chords",
      instrument: "warm_pad",
      notes: [{ note: 60, time: 0, duration: 0.25, velocity: 0.8 }],
      sampleRate: SR,
    });
    expect(independentlyResolved!.patch).toBe("warmPad");
    expect(independentlyResolved!.params).not.toBe(voice.params);
  });

  it("the room and the file push the same patch for a lane that carries a code", async () => {
    restore = installFakeOfflineAudioContext();
    setGs1RoutingEnabled(true);
    const notes = [{ note: 60, time: 0, duration: 0.25, velocity: 0.8 }];
    await renderPatternOffline(makePattern(ACID_CODE), { bars: 1, sampleRate: SR });
    const offlinePatch = recorded.patches[0];
    expect(offlinePatch).toBeTruthy();

    // The live pool, handed the same lane and the same code, must apply the same record.
    const livePushes: Array<Record<number, number>> = [];
    const pool = new Gs1VoicePool({ sampleRate: SR } as BaseAudioContext, {
      createHost: (async () => ({
        scheduledNoteLatencyFrames: 128,
        ready: Promise.resolve({ abi: GS1_EXPECTED_ABI, variant: "simd" }),
        output: { connect: () => undefined },
        noteOnAt: () => undefined,
        noteOffAt: () => undefined,
        setTuningNote: () => undefined,
        setPatch: (values: Record<number, number>) => livePushes.push({ ...values }),
        setModRoute: () => undefined,
        importSample: () => Promise.resolve({ has: true, code: 0 }),
        allNotesOff: () => undefined,
        dispose: () => undefined,
        onAnalysis: () => () => undefined,
      })) as never,
    });
    await pool.ensureTrack(0, "chords", "warm_pad", {} as AudioNode);
    expect(pool.tryPlay(0, "chords", "warm_pad", notes, {} as AudioNode, ACID_CODE)).toBe(true);
    expect(livePushes.length).toBe(1);
    // Same patch in the room and in the file. A lane field read by only one of the two paths is
    // exactly the "second sound" this assertion refuses.
    expect(livePushes[0]).toEqual(offlinePatch);
    pool.dispose();
  });

  it("writes a code's own routes instead of the table patch's velocity response", () => {
    const writes: number[][] = [];
    const host = { setModRoute: (slot: number, src: number, dst: number, amount: number, enabled: boolean) => writes.push([slot, src, dst, amount, enabled ? 1 : 0]) };
    const lane = resolveGs1Lane("chords", "warm_pad", null, ACID_CODE);
    expect(lane.kind).toBe("voice");
    if (lane.kind !== "voice") return;
    applyGs1VoiceRoutes(host, lane.voice);
    // All eight slots are written, so a previous patch's routing cannot linger.
    expect(writes.length).toBe(8);
    expect(writes[0]).toEqual([0, lane.voice.routes![0].src, lane.voice.routes![0].dst, lane.voice.routes![0].amount, 1]);
    // A voice with no routes falls back to the table patch's velocity response on slot 0.
    writes.length = 0;
    applyGs1VoiceRoutes(host, { velToCutoff: 1.2 });
    expect(writes.length).toBe(8);
    expect(writes[0][3]).toBeCloseTo(0.3, 5);
    expect(writes[1]).toEqual([1, 0, 0, 0, 0]);
  });
});

/**
 * The caller-facing write path: the MCP tool the owner's "can the synth's MCP be reused" question
 * ends at. It is a **pure transform** like `apply_pattern_ops` (a pattern in, a new pattern out),
 * which is why its name takes `apply_` and not a writing verb — the repository's own surface test
 * enforces that agreement between the name and the `readOnly` annotation.
 */
describe("the tool a caller uses to put a patch on a lane", () => {
  const tool = TOOLS.find((candidate) => candidate.name === "apply_gs1_patch")!;

  it("stores a valid code without mutating its input, and clears on null", async () => {
    const base = makePattern();
    const result = (await tool.handler({ pattern: base, track: "chords", patch: ACID_CODE })) as {
      pattern: SequencerPattern;
      patch: { parametersChanged: number };
      validation: { ok: boolean };
    };
    expect(result.pattern.tracks[0].gs1Patch).toBe(ACID_CODE);
    // The caller's object is never touched (the library's contract for a pattern transform).
    expect(base.tracks[0].gs1Patch).toBeUndefined();
    expect(result.patch.parametersChanged).toBeGreaterThan(0);
    expect(result.validation.ok).toBe(true);

    const cleared = (await tool.handler({ pattern: result.pattern, track: "chords", patch: null })) as {
      pattern: SequencerPattern;
    };
    expect(cleared.pattern.tracks[0].gs1Patch).toBeUndefined();
  });

  it("refuses a corrupt code with the lane named, rather than storing it", async () => {
    const response = (await tool.handler({ pattern: makePattern(), track: "chords", patch: "gs1.1.!!!" })) as {
      isError?: boolean;
    };
    expect(response.isError).toBe(true);
    expect(JSON.stringify(response)).toContain("chords");
    expect(JSON.stringify(response)).toMatch(/base64url|share code/i);
  });
});

// ---------------------------------------------------------------------------
// The core measurement: the vendored WASM synth, driven directly
// ---------------------------------------------------------------------------

function vendorRoot(): string {
  try {
    if (import.meta.url.startsWith("file:")) {
      return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../vendor/gs1");
    }
  } catch {
    /* jsdom may hand back an http URL */
  }
  return path.resolve(process.cwd(), "vendor/gs1");
}

const CORE_PATH = path.join(vendorRoot(), "src/generated/synth_core.wasm");

interface CoreExports {
  memory: WebAssembly.Memory;
  gs_init(sampleRate: number, maxVoices: number): void;
  gs_set_param(id: number, value: number): void;
  gs_set_mod_route(slot: number, src: number, dst: number, amount: number, enabled: number): void;
  gs_note_on(note: number, velocity: number): void;
  gs_all_notes_off(): void;
  gs_process(frames: number): void;
  gs_left_ptr(): number;
}

/**
 * Render A4 through the vendored core with one parameter record.
 *
 * This is the real DSP, in process, with no browser and no worklet: the same core the AudioWorklet
 * drives, called through the same block ABI `gs1Contract.test.ts` uses. Defaults are written first
 * and the patch on top, which is what the engine's AudioParams hold when a host is built.
 */
function renderThroughCore(params: Record<number, number>, routes: Array<{ src: number; dst: number; amount: number; enabled: boolean }> | null): Float32Array {
  const bytes = readFileSync(CORE_PATH);
  const ex = new WebAssembly.Instance(new WebAssembly.Module(bytes), {}).exports as unknown as CoreExports;
  ex.gs_init(SR, 16);
  for (const [id, value] of Object.entries(DEFAULT_PARAMS)) ex.gs_set_param(Number(id), value);
  for (const [id, value] of Object.entries(params)) ex.gs_set_param(Number(id), value);
  for (let slot = 0; slot < 8; slot += 1) {
    const route = routes?.[slot];
    ex.gs_set_mod_route(slot, route?.src ?? 0, route?.dst ?? 0, route?.amount ?? 0, route?.enabled ? 1 : 0);
  }
  ex.gs_all_notes_off();
  ex.gs_note_on(69, 0.9); // A4
  // ~1.07 s, long enough that the filter envelope and the reverb tail have settled and the
  // measurement is the patch's steady timbre rather than its attack.
  const blocks = 400;
  const out = new Float32Array(blocks * 128);
  for (let block = 0; block < blocks; block += 1) {
    ex.gs_process(128);
    out.set(new Float32Array(ex.memory.buffer, ex.gs_left_ptr(), 128), block * 128);
  }
  ex.gs_all_notes_off();
  return out;
}
