/**
 * Per-parameter GS-1 writes: the value reaches the **engine**, nothing else moves, and the render
 * changes.
 *
 * ## What this file is for
 *
 * `apply_gs1_patch` used to take one opaque `gs1.1.` share code and nothing else — 0 of the engine's
 * 224 parameters, 0 routes. The code cannot be edited in place: the tool writes pattern data, is
 * `readOnly`, and the engine decodes the string at render time, so a per-parameter change needs
 * either a **re-encoded code** (vendor the synth's encoder — a second copy of a format this
 * repository only reads) or an **override layer applied where the lane is resolved** through the
 * engine's own `setParam`/`setModRoute` (route ②, `docs/GS1_PATCH_SURFACE.md` §9). This is route ②,
 * and the four criteria below are the ones the contract names for it:
 *
 *   1. `setParam` then **`getParam` reads the value back** — on a **real `Gs1Host`**, so the value
 *      demonstrably reaches the engine (the host's own record *and* the `AudioParam` the worklet
 *      reads) rather than only the artifact;
 *   2. **every other one of the 224 parameters is unmoved** — read before the override, read after,
 *      compare all of them, and name the ones that moved;
 *   3. **the rendered audio changes**, for a level and for a filter parameter, measured on the
 *      vendored WASM core with the values the real host put on its `AudioParam`s;
 *   4. the tool the caller uses stores the overrides beside the code, refuses what cannot be read,
 *      and the **read side** (`get_gs1_patch`) says what the lane now plays in named parameters.
 *
 * ## How each criterion is asked in both directions
 *
 * A criterion that cannot fail is not one. The deliberate breakages, each a one-line edit, were run
 * and are what the failing halves in the report quote verbatim:
 *
 *   * **criterion 1 and 3** — delete the `applyGs1ParamOverrides(host, voice.overrides);` line from
 *     `applyGs1Voice` (`src/audio/gs1/gs1Tracks.ts`): the override never lands, so the read-back and
 *     the audio both go back to the base code.
 *   * **criterion 2** — replace that call with
 *     `host.setPatch({ ...DEFAULT_PARAMS, ...mergeGs1Overrides(voice.params, voice.overrides) })`.
 *     The override still lands (criterion 1 stays green) but it is written through a record built
 *     from the **default** patch, so every parameter the code set jumps back to its default — which
 *     is exactly the defect "the other parameters do not move" exists to catch.
 *
 * The instrumentation is a real `Gs1Host` over a fake `AudioWorkletNode` (the harness
 * `gs1Host.test.ts` established: the adapter is what is under test, not the DSP), and the *audio*
 * measurement is the real vendored core, in process, driven block by block.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { ACID_SHARE_CODE } from "./fixtures/gs1_share_code.mjs";
import {
  createGs1Host,
  GS1_DEFAULT_POLYPHONY,
  GS1_EXPECTED_ABI,
  GS1_PROCESSOR_NAME,
  resetGs1CoreCache,
} from "../audio/gs1/Gs1Host";
import {
  DEFAULT_GS1_ROUTING_ENABLED,
  applyGs1Voice,
  applyGs1VoiceRoutes,
  planGs1Notes,
  resolveGs1Lane,
  setGs1RoutingEnabled,
} from "../audio/gs1/gs1Tracks";
import { decodeGs1PatchCode } from "../audio/gs1/gs1PatchCode";
import {
  gs1ParameterReadings,
  gs1RouteReadings,
  resolveGs1PatchOverrides,
} from "../audio/gs1/gs1ParamOverrides";
import { DEFAULT_PARAMS, PARAM_NAMES, PARAM_SPECS, Param, type ParamId } from "../../vendor/gs1/src/audio/params";
import { fingerprintChannels, fingerprintDistance } from "./helpers/timbre";
import { validatePattern } from "../../mcp/pattern";
import { clearMcpArrangements, createMcpArrangement, getMcpArrangement, getMcpTrack } from "../../mcp/arrangement";
import { compileArrangementToPattern } from "../data/arrangementCompile";
import { TOOLS } from "../../mcp/registry";
import type { SequencerPattern } from "../types/genre";

const SR = 48000;
const PARAM_IDS: number[] = Object.keys(DEFAULT_PARAMS)
  .map(Number)
  .sort((a, b) => a - b);

// ---------------------------------------------------------------------------
// A real Gs1Host over a fake AudioWorkletNode (the gs1Host.test.ts harness)
// ---------------------------------------------------------------------------

const EMPTY_WASM = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

class FakeAudioParam {
  value = 0;
  constructor(public readonly name: string) {}
}

class FakeAudioParamMap {
  private readonly params = new Map<string, FakeAudioParam>();
  constructor(names: string[]) {
    for (const name of names) this.params.set(name, new FakeAudioParam(name));
  }
  get(name: string): FakeAudioParam | undefined {
    return this.params.get(name);
  }
}

class FakeGainNode {
  gain = { value: 1 };
  connect(target: unknown) {
    return target;
  }
  disconnect() {
    return undefined;
  }
}

class FakeAudioWorkletNode {
  static instances: FakeAudioWorkletNode[] = [];
  static lastMessageSeen: Array<Record<string, unknown>> = [];
  port = {
    onmessage: null as ((event: { data: unknown }) => void) | null,
    postMessage: (message: Record<string, unknown>) => {
      FakeAudioWorkletNode.lastMessageSeen.push(message);
    },
    emit(data: unknown) {
      this.onmessage?.({ data });
    },
  };
  parameters: FakeAudioParamMap;
  constructor(
    public readonly context: unknown,
    public readonly name: string,
    public readonly options: { processorOptions?: Record<string, unknown> } = {}
  ) {
    this.parameters = new FakeAudioParamMap(Object.values(PARAM_NAMES) as string[]);
    FakeAudioWorkletNode.instances.push(this);
  }
  connect(target: unknown) {
    return target;
  }
  disconnect() {
    return undefined;
  }
}

function makeContext() {
  return {
    sampleRate: 44100,
    audioWorklet: { addModule: vi.fn(async () => undefined) },
    createGain: () => new FakeGainNode(),
  } as unknown as BaseAudioContext;
}

const okFetch = () =>
  vi.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => EMPTY_WASM.buffer }));

let originalWorkletNode: unknown;
let originalFetch: unknown;
const liveHosts: Array<{ dispose: () => void }> = [];

beforeEach(() => {
  // The core is cached per URL for the life of the page; a suite that stubs `fetch` must clear it.
  resetGs1CoreCache();
  FakeAudioWorkletNode.instances = [];
  FakeAudioWorkletNode.lastMessageSeen = [];
  originalWorkletNode = (globalThis as Record<string, unknown>).AudioWorkletNode;
  originalFetch = (globalThis as Record<string, unknown>).fetch;
  (globalThis as Record<string, unknown>).AudioWorkletNode = FakeAudioWorkletNode;
  (globalThis as Record<string, unknown>).fetch = okFetch();
});

afterEach(() => {
  for (const host of liveHosts.splice(0)) host.dispose();
  (globalThis as Record<string, unknown>).AudioWorkletNode = originalWorkletNode;
  (globalThis as Record<string, unknown>).fetch = originalFetch;
  setGs1RoutingEnabled(DEFAULT_GS1_ROUTING_ENABLED);
  vi.restoreAllMocks();
});

/** Bring a real host up and answer the processor's `ready` message. */
async function bootHost() {
  // Which node is *this* host's: hosts share the fake-node global, so counting before the call is the
  // only way to answer the right one (answering the previous host leaves this one waiting 30 s).
  const before = FakeAudioWorkletNode.instances.length;
  const pending = createGs1Host({
    context: makeContext(),
    processorUrl: "/fake-worklet.js",
    simdUrl: "/fake-simd.wasm",
    scalarUrl: "/fake-scalar.wasm",
  });
  await vi.waitFor(() => expect(FakeAudioWorkletNode.instances.length).toBeGreaterThan(before));
  const node = FakeAudioWorkletNode.instances[FakeAudioWorkletNode.instances.length - 1];
  node.port.emit({ type: "ready", abi: GS1_EXPECTED_ABI });
  const host = await pending;
  await host.ready;
  liveHosts.push(host);
  return { host, node };
}

/** What the host itself last wrote — `Gs1Host.getParam`, i.e. the read-back under test. */
function hostParams(host: { getParam: (id: number) => number | undefined }): Record<number, number | undefined> {
  const out: Record<number, number | undefined> = {};
  for (const id of PARAM_IDS) out[id] = host.getParam(id);
  return out;
}

/** What the **engine** holds: the `AudioParam` the worklet reads each block, by parameter id. */
function engineParams(node: FakeAudioWorkletNode): Record<number, number> {
  const out: Record<number, number> = {};
  for (const id of PARAM_IDS) {
    const name = PARAM_NAMES[id as ParamId];
    const param = name === undefined ? undefined : node.parameters.get(name);
    out[id] = param?.value ?? Number.NaN;
  }
  return out;
}

/** The ids whose value differs between two records, in ascending order (a loop: no spread). */
function movedIds(
  before: Record<number, number | undefined>,
  after: Record<number, number | undefined>
): number[] {
  const moved: number[] = [];
  for (const id of PARAM_IDS) if (before[id] !== after[id]) moved.push(id);
  return moved;
}

function voiceFor(overrides?: unknown) {
  const lane = resolveGs1Lane("chords", "warm_pad", null, ACID_SHARE_CODE, overrides);
  expect(lane.kind, lane.kind === "problem" ? lane.problem : "").toBe("voice");
  if (lane.kind !== "voice") throw new Error("unreachable");
  return lane.voice;
}

// ---------------------------------------------------------------------------
// Criterion 1 — the value reaches the engine, and the engine reads it back
// ---------------------------------------------------------------------------

describe("a per-parameter write reaches the engine, and the engine reads it back", () => {
  it("setParam then getParam returns the override — on a real host, and on the AudioParam it wrote", async () => {
    const { host, node } = await bootHost();
    const decoded = decodeGs1PatchCode(ACID_SHARE_CODE);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;

    // BEFORE: the base code, through the product's own application point.
    applyGs1Voice(host, voiceFor());
    const before = host.getParam(Param.FILTER_CUTOFF);
    expect(before).toBe(decoded.patch.params[Param.FILTER_CUTOFF]);

    // AFTER: the same lane, with one parameter overridden, through the same call.
    applyGs1Voice(host, voiceFor({ parameters: { FILTER_CUTOFF: 700 } }));

    // The read-back is the host's own answer…
    expect(host.getParam(Param.FILTER_CUTOFF)).toBe(700);
    // …and the engine's: the AudioParam the worklet reads each block carries it too.
    const paramName = PARAM_NAMES[Param.FILTER_CUTOFF as ParamId];
    expect(node.parameters.get(paramName)?.value).toBe(700);
    console.log(
      `[gs1-param-writes] FILTER_CUTOFF ${String(before)} -> ${String(host.getParam(Param.FILTER_CUTOFF))} ` +
        `(AudioParam "${paramName}" = ${String(node.parameters.get(paramName)?.value)})`
    );
  });

  it("names a parameter by enum name or by id, and refuses names the engine does not have", () => {
    const byName = resolveGs1PatchOverrides({ parameters: { FILTER_CUTOFF: 700 } });
    const byId = resolveGs1PatchOverrides({ parameters: { "14": 700 } });
    const lower = resolveGs1PatchOverrides({ parameters: { filter_cutoff: 700 } });
    expect(byName.ok && byId.ok && lower.ok).toBe(true);
    if (!byName.ok || !byId.ok || !lower.ok) return;
    expect(byName.overrides.parameters[0].id).toBe(Param.FILTER_CUTOFF);
    // The id spelling and the name spelling resolve to the same write (only the echoed key differs).
    expect(byId.overrides.parameters.map(({ id, value }) => ({ id, value }))).toEqual(
      byName.overrides.parameters.map(({ id, value }) => ({ id, value }))
    );
    expect(lower.overrides.parameters[0].id).toBe(Param.FILTER_CUTOFF);
    // The synth's own AudioParam spelling is accepted too (`PARAM_NAMES`), not just the enum name.
    const audioParam = resolveGs1PatchOverrides({ parameters: { filterCutoff: 700 } });
    expect(audioParam.ok).toBe(true);
    if (audioParam.ok) expect(audioParam.overrides.parameters[0].id).toBe(Param.FILTER_CUTOFF);

    const missing = resolveGs1PatchOverrides({ parameters: { FILTER_CUTOF: 700 } });
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.problem).toMatch(/not a GS-1 parameter/);
      // A near miss is named, so a caller is not left counting ids.
      expect(missing.problem).toMatch(/FILTER_CUTOFF/);
    }
    const nonFinite = resolveGs1PatchOverrides({ parameters: { FILTER_CUTOFF: "700" } });
    expect(nonFinite.ok).toBe(false);
  });

  it("accepts a value PARAM_SPECS would reject, because the engine serves a wider range", () => {
    // The measurement behind "do not range-check against PARAM_SPECS" (docs/GS1_PATCH_SURFACE.md §4):
    // the spec declares ±24 for OSC2_PITCH while the worklet serves ±48, so `phonk`'s own factory
    // preset — osc2Pitch = 31 — would be refused by a check written against the spec table.
    const spec = PARAM_SPECS.find((row) => row.id === Param.OSC2_PITCH);
    expect(spec?.max).toBe(24);
    const phonk = resolveGs1PatchOverrides({ parameters: { OSC2_PITCH: 31 } });
    expect(phonk.ok).toBe(true);
    if (phonk.ok) expect(phonk.overrides.parameters[0].value).toBe(31);
  });

  it("names a modulation source by what the engine does with it, measured on the core", () => {
    /**
     * The name→index table has to be the **engine's** wire order, not the vendored `MOD_SOURCES`
     * array: the array is the synth UI's display order and puts `lfo2` at 1 and `velocity` at 4,
     * while the core's `ModSrc::from_u32` puts `env` at 1 and `velocity` at 3. A table written from
     * `MOD_SOURCES.indexOf` would send **Lfo2** when the caller asked for **velocity** — so this is
     * measured rather than asserted. Base cutoff 200 Hz keeps positive cutoff modulation in range.
     */
    const lowCutoff = { ...DEFAULT_PARAMS, [Param.FILTER_CUTOFF]: 200 };
    const route = (src: number) => [{ src, dst: 0, amount: 1, enabled: true }];
    const centroid = (buf: Float32Array) => fingerprintChannels([buf], SR).centroidHz;
    const velocityLike = (src: number) =>
      centroid(renderThroughCore(lowCutoff, route(src), 0.9)) / centroid(renderThroughCore(lowCutoff, route(src), 0.2));

    const resolved = resolveGs1PatchOverrides({ routes: [{ src: "velocity", dst: "cutoff", amount: 1 }] });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const named = resolved.overrides.routes[0];
    console.log(
      `[gs1-param-writes] "velocity" -> src ${named.src}; measured brightness ratio src 3 = ${velocityLike(3).toFixed(3)}, src 4 = ${velocityLike(4).toFixed(3)}`
    );
    expect(named.src).toBe(3);
    expect(named.dst).toBe(0);
    // The index the name resolved to is the one that actually responds to velocity…
    expect(velocityLike(named.src), `src ${named.src} must behave like velocity`).toBeGreaterThan(1.2);
    // …and the index the UI table would have chosen does not, so a wrong table cannot pass.
    expect(velocityLike(4), "the UI table's index for velocity is not a velocity source").toBeLessThan(1.1);

    // `dst` names come from `MOD_DESTS`, which agrees with `ModDst::from_u32`: 2 = volume, measured.
    const toVolume = resolveGs1PatchOverrides({ routes: [{ src: "env", dst: "volume", amount: 1 }] });
    expect(toVolume.ok).toBe(true);
    if (!toVolume.ok) return;
    expect(toVolume.overrides.routes[0]).toEqual({ index: 0, src: 1, dst: 2, amount: 1, enabled: true });
    const unrouted = rmsDb(renderThroughCore(lowCutoff));
    const enveloped = rmsDb(renderThroughCore(lowCutoff, route(1).map((row) => ({ ...row, dst: 2 }))));
    console.log(`[gs1-param-writes] "env" -> dst 2: RMS ${unrouted.toFixed(2)} dB -> ${enveloped.toFixed(2)} dB`);
    expect(enveloped - unrouted, "dst 2 must modulate the level").toBeGreaterThan(1);
  });

  it("writes a modulation row through the engine's own setModRoute", async () => {
    const { host } = await bootHost();
    const lane = resolveGs1Lane("chords", "warm_pad", null, ACID_SHARE_CODE, {
      routes: [{ src: "velocity", dst: "cutoff", amount: 0.5 }],
    });
    expect(lane.kind).toBe("voice");
    if (lane.kind !== "voice") return;
    // The lane's own rows layer on the code's four, in slot 0 — named by what the engine does with
    // the index it is sent (`WIRE_MOD_SOURCES`), not by the synth UI's display order.
    expect(gs1RouteReadings(lane.voice.routes)[0]).toEqual({
      index: 0,
      source: "velocity",
      sourceIndex: 3,
      destination: "cutoff",
      destinationIndex: 0,
      amount: 0.5,
      enabled: true,
    });

    // …and the *real* host posts the engine's own `modRoute` message for it.
    applyGs1VoiceRoutes(host, lane.voice);
    const modRoutes = FakeAudioWorkletNode.lastMessageSeen.filter((message) => message.type === "modRoute");
    expect(modRoutes.length).toBe(8);
    expect(modRoutes[0]).toEqual({ type: "modRoute", index: 0, src: 3, dst: 0, amount: 0.5, enabled: true });
  });
});

// ---------------------------------------------------------------------------
// Criterion 2 — nothing else moves
// ---------------------------------------------------------------------------

describe("the other parameters do not move", () => {
  it("starts from the code itself, then moves exactly the overridden one", async () => {
    /**
     * **Both halves matter, and the first one was added because the red run found its absence.**
     * Comparing "before" with "after" alone is insensitive to a defect that corrupts *both* — an
     * implementation that writes `{...DEFAULT_PARAMS, override}` passes a before/after comparison
     * while every parameter the code set has silently jumped to its default. So "before" is first
     * anchored to the decoded code, parameter by parameter, on both the host's record and the
     * engine's AudioParams; only then is "after" compared with it.
     */
    const decoded = decodeGs1PatchCode(ACID_SHARE_CODE);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;

    const { host, node } = await bootHost();
    applyGs1Voice(host, voiceFor());
    const beforeHost = hostParams(host);
    const beforeEngine = engineParams(node);
    expect(Object.keys(beforeHost).length).toBe(224);
    expect(Object.keys(beforeEngine).length).toBe(224);

    const notTheCode: number[] = [];
    for (const id of PARAM_IDS) {
      if (beforeHost[id] !== decoded.patch.params[id]) notTheCode.push(id);
      if (beforeEngine[id] !== decoded.patch.params[id]) notTheCode.push(-id);
    }
    // The base really is the code (positive) and the engine really holds it (negative), or the
    // comparison below would be measuring the wrong baseline.
    expect(notTheCode).toEqual([]);

    applyGs1Voice(host, voiceFor({ parameters: { FILTER_CUTOFF: 700 } }));
    const afterHost = hostParams(host);
    const afterEngine = engineParams(node);

    const movedHost = movedIds(beforeHost, afterHost);
    const movedEngine = movedIds(beforeEngine, afterEngine);
    console.log(
      `[gs1-param-writes] all 224 compared: base matches the code, host-side moved ${JSON.stringify(movedHost)}, ` +
        `engine-side moved ${JSON.stringify(movedEngine)}`
    );
    // A loop over every id, not a sampled assertion: the failure message lists the movers.
    expect(movedHost).toEqual([Param.FILTER_CUTOFF]);
    expect(movedEngine).toEqual([Param.FILTER_CUTOFF]);
  });

  it("keeps every parameter untouched when a lane has no overrides at all", async () => {
    const { host, node } = await bootHost();
    const decoded = decodeGs1PatchCode(ACID_SHARE_CODE);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    applyGs1Voice(host, voiceFor());
    // Byte-for-byte the base code on both the host's record and the engine's AudioParams.
    const hostValues = hostParams(host);
    const engineValues = engineParams(node);
    const mismatches: number[] = [];
    for (const id of PARAM_IDS) {
      if (hostValues[id] !== decoded.patch.params[id]) mismatches.push(id);
      if (engineValues[id] !== decoded.patch.params[id]) mismatches.push(-id);
    }
    expect(mismatches).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Criterion 3 — the render changes, measured
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
 * The real DSP, in process: the same core the AudioWorklet drives, through the same block ABI.
 *
 * `routes` is the engine's own wire form (what `gs_set_mod_route` decodes), and `params` is the full
 * 224-value record — which is what the host wrote to its `AudioParam`s for a code voice.
 */
function renderThroughCore(
  params: Record<number, number>,
  routes: Array<{ src: number; dst: number; amount: number; enabled: boolean }> | null = null,
  velocity = 0.9
): Float32Array {
  const bytes = readFileSync(CORE_PATH);
  const ex = new WebAssembly.Instance(new WebAssembly.Module(bytes), {}).exports as unknown as CoreExports;
  ex.gs_init(SR, 16);
  // The host wrote all 224 AudioParams (this is a code voice), so these are the engine's values.
  for (const id of PARAM_IDS) ex.gs_set_param(id, params[id]);
  for (let slot = 0; slot < 8; slot += 1) {
    const route = routes?.[slot];
    ex.gs_set_mod_route(slot, route?.src ?? 0, route?.dst ?? 0, route?.amount ?? 0, route?.enabled ? 1 : 0);
  }
  ex.gs_all_notes_off();
  ex.gs_note_on(69, velocity); // A4
  const blocks = 400; // ~1.07 s: past the attack, into the steady timbre
  const out = new Float32Array(blocks * 128);
  for (let block = 0; block < blocks; block += 1) {
    ex.gs_process(128);
    out.set(new Float32Array(ex.memory.buffer, ex.gs_left_ptr(), 128), block * 128);
  }
  ex.gs_all_notes_off();
  return out;
}

/** Level in dBFS, by a loop — `Math.max(...samples)` overflows the stack on a long buffer. */
function rmsDb(samples: Float32Array): number {
  let sum = 0;
  for (let index = 0; index < samples.length; index += 1) sum += samples[index] * samples[index];
  return 20 * Math.log10(Math.sqrt(sum / samples.length));
}

describe("the rendered audio changes", () => {
  it("a level, a pitch and a filter override each move a real core render", async () => {
    /**
     * The chain under test: resolveGs1Lane → applyGs1Voice → Gs1Host.setParam → AudioParam.value →
     * the core. The values fed to the core are read off the **host's own AudioParams**, not invented,
     * so a name that resolved to the wrong id could not pass.
     *
     * The three parameters were chosen from a measurement of what this patch does, not from a guess
     * (the same probe that produced the printed numbers): on `acid`, `FILTER_CUTOFF 800 → 18000` moves
     * the centroid **down** (1252 → 594 Hz) because the patch's 0.85 resonance sits on the old cutoff,
     * so a filter claim written as "the centroid rises" would be false. `FILTER_TYPE` lp → hp and
     * `OSC1_PITCH` −12 → +12 are directional and large, which is why those two are the criteria.
     */
    const { host, node } = await bootHost();
    applyGs1Voice(host, voiceFor());
    const base = renderThroughCore(engineParams(node));

    const levelHost = await bootHost();
    applyGs1Voice(levelHost.host, voiceFor({ parameters: { MASTER_VOLUME: 0.15 } }));
    const level = renderThroughCore(engineParams(levelHost.node));

    const pitchHost = await bootHost();
    applyGs1Voice(pitchHost.host, voiceFor({ parameters: { OSC1_PITCH: 12 } }));
    const pitch = renderThroughCore(engineParams(pitchHost.node));

    const filterHost = await bootHost();
    // `FILTER_TYPE` has no `PARAM_SPECS` entry at all — one of the 140 parameters with a name and a
    // default but no declared range, which the override layer writes just as readily.
    applyGs1Voice(filterHost.host, voiceFor({ parameters: { FILTER_TYPE: 1 } }));
    const filter = renderThroughCore(engineParams(filterHost.node));

    const basePrint = fingerprintChannels([base], SR);
    const levelDb = rmsDb(level);
    const baseDb = rmsDb(base);
    const pitchPrint = fingerprintChannels([pitch], SR);
    const filterPrint = fingerprintChannels([filter], SR);
    const pitchRatio = pitchPrint.centroidHz / basePrint.centroidHz;
    const filterRatio = filterPrint.centroidHz / basePrint.centroidHz;
    console.log(
      `[gs1-param-writes] MASTER_VOLUME 0.75 -> 0.15: RMS ${baseDb.toFixed(2)} dB -> ${levelDb.toFixed(2)} dB ` +
        `(${(levelDb - baseDb).toFixed(2)} dB); OSC1_PITCH -12 -> +12: centroid ${basePrint.centroidHz.toFixed(0)} -> ` +
        `${pitchPrint.centroidHz.toFixed(0)} Hz (x${pitchRatio.toFixed(2)}), distance ${fingerprintDistance(basePrint, pitchPrint).toFixed(2)} dB; ` +
        `FILTER_TYPE lp -> hp: centroid ${filterPrint.centroidHz.toFixed(0)} Hz (x${filterRatio.toFixed(2)}), ` +
        `distance ${fingerprintDistance(basePrint, filterPrint).toFixed(2)} dB`
    );

    // The base is a real sound: the comparison is not silence against silence.
    expect(baseDb).toBeGreaterThan(-40);
    expect(rmsDb(pitch)).toBeGreaterThan(-40);
    expect(rmsDb(filter)).toBeGreaterThan(-40);
    // A **level** override must be a level change of the ratio asked for (0.15/0.75 = -13.98 dB), not
    // merely "different": an analytic expectation, so a wrong parameter id cannot pass.
    const expectedDropDb = 20 * Math.log10(0.15 / 0.75);
    expect(Math.abs(levelDb - baseDb - expectedDropDb), "the level override's size").toBeLessThan(2);
    // A **pitch** override of one octave, on an oscillator the patch had dropped an octave.
    expect(pitchRatio, "the pitch override must move the spectrum up").toBeGreaterThan(1.5);
    expect(fingerprintDistance(basePrint, pitchPrint)).toBeGreaterThan(3);
    // A **filter** override: lowpass to highpass at the same cutoff.
    expect(filterRatio, "the filter override must change the spectrum").toBeGreaterThan(2);
    expect(fingerprintDistance(basePrint, filterPrint)).toBeGreaterThan(3);
  }, 60000);
});

// ---------------------------------------------------------------------------
// Criterion 4 — the tool surface: store it, refuse what cannot be read, read it back
// ---------------------------------------------------------------------------

function makePattern(): SequencerPattern {
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
  return {
    genre_id: "chicago-house",
    bpm: 120,
    swing: 0,
    scale: "C minor",
    totalSteps: steps,
    tracks: [track("chords", "Chords", "warm_pad", 60)] as SequencerPattern["tracks"],
  };
}

describe("apply_gs1_patch: the overrides are stored beside the code, and refused when unreadable", () => {
  const apply = TOOLS.find((tool) => tool.name === "apply_gs1_patch")!;
  const read = TOOLS.find((tool) => tool.name === "get_gs1_patch")!;

  /**
   * ⭐ **A genre-seeded arrangement, because that is where a GS-1 lane actually comes from.** Its `chords` track is
   * projected from the genre's own v1 lane, so `fromTrackId` and `instrument` are the ones the GS-1 table is keyed by;
   * a blank arrangement's `synth` track takes its kind's role and is not GS-1's unless a share code names it.
   */
  function seeded(): { arrangementId: string; trackId: string } {
    const summary = createMcpArrangement({ genreId: "chicago-house" });
    return { arrangementId: summary.arrangementId, trackId: "chords" };
  }

  beforeEach(() => {
    clearMcpArrangements();
  });

  it("stores parameters and routes on the track the arrangement names", async () => {
    const { arrangementId, trackId } = seeded();
    const result = (await apply.handler({
      arrangementId,
      trackId,
      patch: ACID_SHARE_CODE,
      parameters: { FILTER_CUTOFF: 700, osc2Pitch: 31 },
      routes: [{ index: 0, src: "aftertouch", dst: "res", amount: 0.25 }],
    })) as {
      arrangementId: string;
      trackId: string;
      patch: { shareCode: string; parametersChanged: number; routes: number };
      overrides: { parameters: Array<{ name: string; value: number; display: string }> };
    };

    const stored = getMcpTrack(arrangementId, trackId)!;
    expect(stored.gs1Patch).toBe(ACID_SHARE_CODE);
    expect(stored.gs1PatchOverrides).toEqual({
      parameters: { FILTER_CUTOFF: 700, osc2Pitch: 31 },
      routes: [{ index: 0, src: "aftertouch", dst: "res", amount: 0.25 }],
    });
    // The reply names what it changed, so a caller can read the track back without guessing an id.
    expect(result.arrangementId).toBe(arrangementId);
    expect(result.trackId).toBe(trackId);
    // The reply shows the effective layer, in names, not just "ok".
    expect(result.overrides.parameters.map((row) => [row.name, row.value])).toEqual([
      ["OSC2_PITCH", 31],
      ["FILTER_CUTOFF", 700],
    ]);
    expect(result.overrides.parameters.find((row) => row.name === "FILTER_CUTOFF")?.display).toBe("700 Hz");
  });

  it("refuses an unknown parameter, names the track, and stores nothing", async () => {
    const { arrangementId, trackId } = seeded();
    const response = (await apply.handler({
      arrangementId,
      trackId,
      patch: ACID_SHARE_CODE,
      parameters: { FILTER_CUTOF: 700 },
    })) as { isError?: boolean };
    expect(response.isError).toBe(true);
    expect(JSON.stringify(response)).toContain("(chords)");
    expect(JSON.stringify(response)).toMatch(/not a GS-1 parameter/);
    expect(JSON.stringify(response)).toMatch(/FILTER_CUTOFF/);
    // Validation happens before the write, so a refused call leaves no undo step and no half-applied sound.
    expect(getMcpTrack(arrangementId, trackId)!.gs1Patch).toBeUndefined();
    expect(getMcpTrack(arrangementId, trackId)!.gs1PatchOverrides).toBeUndefined();
  });

  it("clears the code and the overrides together, and clears one half on request", async () => {
    const { arrangementId, trackId } = seeded();
    await apply.handler({
      arrangementId,
      trackId,
      patch: ACID_SHARE_CODE,
      parameters: { FILTER_CUTOFF: 700 },
    });
    expect(getMcpTrack(arrangementId, trackId)!.gs1PatchOverrides).toBeDefined();

    // `parameters: {}` clears the parameter half only.
    await apply.handler({ arrangementId, trackId, parameters: {} });
    expect(getMcpTrack(arrangementId, trackId)!.gs1Patch).toBe(ACID_SHARE_CODE);
    expect(getMcpTrack(arrangementId, trackId)!.gs1PatchOverrides).toBeUndefined();

    // `patch: null` clears the track's whole GS-1 sound.
    await apply.handler({ arrangementId, trackId, patch: null });
    expect(getMcpTrack(arrangementId, trackId)!.gs1Patch).toBeUndefined();
    expect(getMcpTrack(arrangementId, trackId)!.gs1PatchOverrides).toBeUndefined();

    // …and refuses to be combined with overrides, rather than picking one meaning.
    const contradictory = (await apply.handler({
      arrangementId,
      trackId,
      patch: null,
      parameters: { FILTER_CUTOFF: 700 },
    })) as { isError?: boolean };
    expect(contradictory.isError).toBe(true);
  });

  it("overrides the instrument table's patch when there is no share code", async () => {
    const { arrangementId, trackId } = seeded();
    const result = (await apply.handler({
      arrangementId,
      trackId,
      parameters: { FILTER_CUTOFF: 500 },
    })) as { detail: string; patch: { shareCode: string | null } };
    const stored = getMcpTrack(arrangementId, trackId)!;
    expect(stored.gs1Patch).toBeUndefined();
    expect(stored.gs1PatchOverrides).toEqual({ parameters: { FILTER_CUTOFF: 500 } });
    expect(result.patch.shareCode).toBeNull();
    expect(result.detail).toMatch(/instrument table/);
  });

  it("get_gs1_patch says what the track plays, in named parameters", async () => {
    const { arrangementId, trackId } = seeded();
    await apply.handler({
      arrangementId,
      trackId,
      patch: ACID_SHARE_CODE,
      parameters: { FILTER_CUTOFF: 700 },
      routes: [{ src: "velocity", dst: "cutoff", amount: 0.5 }],
    });

    const report = (await read.handler({ arrangementId, trackId })) as {
      patch: { kind: string; shareCode: string | null; parametersChanged: number; parametersAtDefault: number };
      parameters: Array<{ id: number; name: string; label?: string; display: string; from: string; value: number }>;
      routes: Array<{ index: number; source: string; destination: string; amount: number }>;
      overrides: { parameters: Array<{ name: string }> } | null;
    };
    expect(report.patch.shareCode).toBe(ACID_SHARE_CODE);
    expect(report.patch.kind).toBe("its own share code");
    // Not 224 numbers: only what differs from the synth's default patch.
    expect(report.parameters.length).toBeLessThan(224);
    expect(report.patch.parametersChanged).toBe(report.parameters.length);
    expect(report.patch.parametersChanged + report.patch.parametersAtDefault).toBe(224);
    const cutoff = report.parameters.find((row) => row.id === Param.FILTER_CUTOFF);
    expect(cutoff?.display).toBe("700 Hz");
    expect(cutoff?.from).toBe("override");
    expect(cutoff?.label).toBe("CUTOFF");
    expect(report.overrides?.parameters.map((row) => row.name)).toEqual(["FILTER_CUTOFF"]);
    expect(report.routes[0]).toEqual({
      index: 0,
      source: "velocity",
      sourceIndex: 3,
      destination: "cutoff",
      destinationIndex: 0,
      amount: 0.5,
      enabled: true,
    });
  });

  it("reads a share code the caller passes, and says plainly when a track is not GS-1", async () => {
    const direct = (await read.handler({ patch: ACID_SHARE_CODE })) as {
      patch: { kind: string; parametersChanged: number };
      routes: unknown[];
    };
    expect(direct.patch.kind).toBe("this share code");
    expect(direct.patch.parametersChanged).toBeGreaterThan(0);
    expect(direct.routes.length).toBe(4);

    /**
     * ⭐ **A blank `synth` track is the honest "not GS-1" case now.** Its compiled role is `lead` and its instrument is
     * `"synth"`, which the GS-1 table does not carry, so the answer says so rather than guessing a patch.
     */
    const blank = createMcpArrangement({ blankKind: "synth" });
    const report = (await read.handler({ arrangementId: blank.arrangementId, trackId: blank.tracks[0]!.id })) as {
      voiced: boolean;
      detail: string;
    };
    expect(report.voiced).toBe(false);
    expect(report.detail).toMatch(/not voiced by GS-1/);

    const bad = (await read.handler({ patch: "gs1.1.!!!" })) as { isError?: boolean };
    expect(bad.isError).toBe(true);
  });

  it("validate_pattern reports an unreadable override naming the lane", () => {
    const pattern = makePattern();
    pattern.tracks[0].gs1PatchOverrides = { parameters: { NO_SUCH_PARAM: 1 } };
    const validation = validatePattern(pattern);
    expect(validation.ok).toBe(false);
    expect(
      validation.problems.some((problem) => problem.includes('track "chords"') && problem.includes("NO_SUCH_PARAM")),
      JSON.stringify(validation.problems)
    ).toBe(true);

    // …and a route on a lane GS-1 never schedules is a problem too, not a silent no-op.
    const kickish = makePattern();
    kickish.tracks = [{ ...kickish.tracks[0], track_id: "kick" as const }] as SequencerPattern["tracks"];
    kickish.tracks[0].gs1PatchOverrides = { parameters: { FILTER_CUTOFF: 700 } };
    const second = validatePattern(kickish);
    expect(second.problems.some((problem) => problem.includes("would never sound")), JSON.stringify(second.problems)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The overrides travel with the resolved voice (the single-seam property)
// ---------------------------------------------------------------------------

describe("the resolved voice carries the overrides, so no consumer can miss them", () => {
  it("hands note planning the same override layer the host was given", () => {
    const voice = voiceFor({ parameters: { FILTER_CUTOFF: 700 } });
    const planned = planGs1Notes({
      role: "chords",
      instrument: "warm_pad",
      voice,
      notes: [{ note: 60, time: 0, duration: 0.25, velocity: 0.8 }],
      sampleRate: SR,
    });
    expect(planned).not.toBeNull();
    // Identity, not equality: the planner was handed the very voice the host was built from.
    expect(planned!.params).toBe(voice.params);
    expect(planned!.overrides).toBe(voice.overrides);
    // And the identity used for a live patch swap changes with the overrides, so a changed override
    // is re-applied rather than mistaken for the same sound (Gs1VoicePool.tryPlay).
    expect(planned!.patchKey).not.toBe(ACID_SHARE_CODE);
    const plain = planGs1Notes({
      role: "chords",
      instrument: "warm_pad",
      voice: voiceFor(),
      notes: [{ note: 60, time: 0, duration: 0.25, velocity: 0.8 }],
      sampleRate: SR,
    });
    expect(plain!.patchKey).toBe(ACID_SHARE_CODE);
  });

  it("reports the effective values in a creator's terms", () => {
    const overrides = resolveGs1PatchOverrides({ parameters: { FILTER_CUTOFF: 700, MASTER_VOLUME: 0.2 } });
    expect(overrides.ok).toBe(true);
    if (!overrides.ok) return;
    const readings = gs1ParameterReadings({}, overrides.overrides, "share code", false);
    expect(readings.map((row) => [row.name, row.display])).toEqual([
      ["MASTER_VOLUME", "20 %"],
      ["FILTER_CUTOFF", "700 Hz"],
    ]);
  });
});

// ---------------------------------------------------------------------------
// The artifact and the audio agree
// ---------------------------------------------------------------------------

describe("what the artifact states is what the render uses", () => {
  const apply = TOOLS.find((tool) => tool.name === "apply_gs1_patch")!;

  it("carries a track's own patch through the compile into a real core render", async () => {
    /**
     * The criterion a model change like this one has to pass, in the terms `pitches` learned the hard way: a value
     * that lives where the renderer does not read it makes the artifact state one sound and the audio play another.
     * So this goes the whole way — the **tool writes the arrangement**, `compileArrangementToPattern` carries the
     * field onto the lane, then `resolveGs1Lane`, `applyGs1Voice`, the real host's `AudioParam`s, and a render of the
     * vendored core — and it is asked in both directions: the field present, and the same lane with the field removed.
     *
     * ⭐ The compile step is what this migration added. Without it the tool would store a patch that no reader of the
     * compiled pattern ever sees, which is exactly the failure this criterion exists to catch.
     */
    clearMcpArrangements();
    const summary = createMcpArrangement({ genreId: "chicago-house" });
    const arrangementId = summary.arrangementId;
    await apply.handler({
      arrangementId,
      trackId: "chords",
      patch: ACID_SHARE_CODE,
      parameters: { FILTER_TYPE: 1 },
    });
    const track = getMcpTrack(arrangementId, "chords")!;
    expect(track.gs1PatchOverrides).toEqual({ parameters: { FILTER_TYPE: 1 } });

    const arrangement = getMcpArrangement(arrangementId)!;
    const compiled = compileArrangementToPattern(arrangement, arrangement.notesByTrack);
    const lane = compiled.tracks.find((row) => row.track_id === "chords")!;
    // The compile is the bridge: a field the arrangement holds must be a field the renderer reads.
    expect(lane.gs1Patch).toBe(ACID_SHARE_CODE);
    expect(lane.gs1PatchOverrides).toEqual({ parameters: { FILTER_TYPE: 1 } });

    const stated = resolveGs1Lane(lane.track_id, lane.instrument, compiled.genre_id, lane.gs1Patch, lane.gs1PatchOverrides);
    const plain = resolveGs1Lane(lane.track_id, lane.instrument, compiled.genre_id, lane.gs1Patch, undefined);
    expect(stated.kind).toBe("voice");
    expect(plain.kind).toBe("voice");
    if (stated.kind !== "voice" || plain.kind !== "voice") return;

    const statedHost = await bootHost();
    applyGs1Voice(statedHost.host, stated.voice);
    const statedParams = engineParams(statedHost.node);
    const plainHost = await bootHost();
    applyGs1Voice(plainHost.host, plain.voice);
    const plainParams = engineParams(plainHost.node);

    // The engine holds what the field says — `FILTER_TYPE` is 0 (lowpass) in the code and 1 here —
    // and nothing else moved, so the artifact is not stating more than it does.
    expect(plainParams[Param.FILTER_TYPE]).toBe(0);
    expect(statedParams[Param.FILTER_TYPE]).toBe(1);
    expect(movedIds(plainParams, statedParams)).toEqual([Param.FILTER_TYPE]);

    const unstatedAudio = renderThroughCore(plainParams);
    const statedAudio = renderThroughCore(statedParams);
    const distance = fingerprintDistance(fingerprintChannels([unstatedAudio], SR), fingerprintChannels([statedAudio], SR));
    console.log(
      `[gs1-param-writes] track field { FILTER_TYPE: 1 } -> compiled lane -> AudioParam ${String(statedParams[Param.FILTER_TYPE])} -> ` +
        `render centroid ${fingerprintChannels([unstatedAudio], SR).centroidHz.toFixed(0)} -> ` +
        `${fingerprintChannels([statedAudio], SR).centroidHz.toFixed(0)} Hz, fingerprint distance ${distance.toFixed(2)} dB`
    );
    expect(rmsDb(statedAudio)).toBeGreaterThan(-40);
    expect(distance, "the field the artifact carries must move the audio").toBeGreaterThan(3);
  }, 60000);
});

// ---------------------------------------------------------------------------
// One answer for the lane and for its code
// ---------------------------------------------------------------------------

describe("the seam resolves one answer for a lane and for its code", () => {
  it("agrees with the decoded code on every parameter the code sets, except the overridden one", () => {
    // The read tool resolves through `resolveGs1Lane`, the same seam the renderer uses, so a lane's
    // readings and the code's must agree on every parameter the code itself sets.
    const lane = resolveGs1Lane("chords", "warm_pad", null, ACID_SHARE_CODE, { parameters: { FILTER_CUTOFF: 700 } });
    expect(lane.kind).toBe("voice");
    if (lane.kind !== "voice") return;
    const decoded = decodeGs1PatchCode(ACID_SHARE_CODE);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    const withOverride = new Map(
      gs1ParameterReadings(lane.voice.params, lane.voice.overrides, "share code", true).map((row) => [row.id, row.value])
    );
    for (const [id, value] of Object.entries(decoded.patch.params)) {
      if (Number(id) === Param.FILTER_CUTOFF) continue;
      expect(withOverride.get(Number(id)), `parameter ${id}`).toBe(value);
    }
    expect(withOverride.get(Param.FILTER_CUTOFF)).toBe(700);
  });
});

// A note the harness itself needs: the fake node's name is asserted so a future rename of the
// processor cannot silently make this file test a different object.
describe("the harness is the real adapter", () => {
  it("builds the processor the app ships", async () => {
    const { node } = await bootHost();
    expect(node.name).toBe(GS1_PROCESSOR_NAME);
    expect(GS1_DEFAULT_POLYPHONY).toBeGreaterThan(0);
    expect(Object.values(PARAM_NAMES).length).toBe(224);
  });
});
