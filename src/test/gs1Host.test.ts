/**
 * GS-1 host adapter (P6 / requirement 11, Phase 2) — protocol and parameter contract.
 *
 * These tests run against a fake `AudioWorkletNode`, a fake context and a stubbed `fetch`, so
 * they cover the *adapter* rather than the DSP: which messages it posts, how it maps numeric
 * parameter ids onto AudioParam names, how it parses the processor's replies, and what it does
 * when the core is the wrong ABI, the fetch fails or the context has no AudioWorklet.
 *
 * The real thing is verified separately and in a real browser by
 * `scripts/measure_gs1_load.mjs` (the plan's E2/E3): SIMD core loaded, ABI 8 reported, notes
 * audible, `gs_alloc_violations() === 0`. A unit test cannot stand in for that, and these tests
 * do not pretend to.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createGs1Host,
  GS1_DEFAULT_POLYPHONY,
  GS1_EXPECTED_ABI,
  GS1_PROCESSOR_NAME,
  resetGs1CoreCache,
} from "../audio/gs1/Gs1Host";
import { Param, PARAM_NAMES, type ParamId } from "../../vendor/gs1/src/audio/params";

/** A minimal valid module: the 8-byte wasm header, which `WebAssembly.validate` accepts. */
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
  connected: unknown[] = [];
  disconnected = 0;
  connect(target: unknown) {
    this.connected.push(target);
    return target;
  }
  disconnect() {
    this.disconnected += 1;
  }
}

/** Mirrors the two things this adapter uses: `port` and `parameters`. */
class FakeAudioWorkletNode {
  static instances: FakeAudioWorkletNode[] = [];
  static lastMessageSeen: any[] = [];
  port = {
    onmessage: null as ((event: { data: unknown }) => void) | null,
    postMessage: vi.fn((message: unknown) => {
      FakeAudioWorkletNode.lastMessageSeen.push(message);
    }),
    /** Test hook: pretend the processor said something. */
    emit(data: unknown) {
      this.onmessage?.({ data });
    },
  };
  parameters: FakeAudioParamMap;
  connected: unknown[] = [];
  disconnected = 0;
  constructor(
    public readonly context: unknown,
    public readonly name: string,
    public readonly options: { processorOptions?: Record<string, unknown> } = {}
  ) {
    const names = Object.values(PARAM_NAMES) as string[];
    this.parameters = new FakeAudioParamMap(names);
    FakeAudioWorkletNode.instances.push(this);
  }
  connect(target: unknown) {
    this.connected.push(target);
    return target;
  }
  disconnect() {
    this.disconnected += 1;
  }
}

function makeContext(overrides: Record<string, unknown> = {}) {
  return {
    sampleRate: 44100,
    audioWorklet: { addModule: vi.fn(async () => undefined) },
    createGain: () => new FakeGainNode(),
    ...overrides,
  } as unknown as BaseAudioContext;
}

const okFetch = (bytes: Uint8Array = EMPTY_WASM) =>
  vi.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => bytes.buffer }));

let originalWorkletNode: unknown;
let originalFetch: unknown;

beforeEach(() => {
  /**
   * The core is cached per URL for the life of the page, which is the fix for ~600 redundant
   * fetches per library render (see `gs1CoreCache.test.ts`). That cache is process-wide, so a suite
   * that stubs `fetch` must clear it — otherwise a test inherits the previous test's *successful*
   * core and its own failing fetch is never reached, which is exactly how this line was found.
   */
  resetGs1CoreCache();
  FakeAudioWorkletNode.instances = [];
  FakeAudioWorkletNode.lastMessageSeen = [];
  originalWorkletNode = (globalThis as Record<string, unknown>).AudioWorkletNode;
  originalFetch = (globalThis as Record<string, unknown>).fetch;
  (globalThis as Record<string, unknown>).AudioWorkletNode = FakeAudioWorkletNode;
  (globalThis as Record<string, unknown>).fetch = okFetch();
});

afterEach(() => {
  (globalThis as Record<string, unknown>).AudioWorkletNode = originalWorkletNode;
  (globalThis as Record<string, unknown>).fetch = originalFetch;
  vi.restoreAllMocks();
});

/** Bring a host up and answer the processor's `ready` message. */
async function bootHost(options: Record<string, unknown> = {}) {
  const pending = createGs1Host({
    context: makeContext(),
    processorUrl: "/fake-worklet.js",
    simdUrl: "/fake-simd.wasm",
    scalarUrl: "/fake-scalar.wasm",
    ...options,
  });
  // `createGs1Host` awaits the fetch and `addModule` before constructing the node, so yield
  // until the node exists before answering.
  await vi.waitFor(() => expect(FakeAudioWorkletNode.instances.length).toBe(1));
  const node = FakeAudioWorkletNode.instances[0];
  node.port.emit({ type: "ready", abi: GS1_EXPECTED_ABI });
  const host = await pending;
  return { host, node };
}

describe("Gs1Host — construction (E2 shape)", () => {
  it("validates the core and builds the node on the caller's context", async () => {
    const context = makeContext();
    const { host, node } = await bootHost({ context });

    expect(WebAssembly.validate(EMPTY_WASM)).toBe(true);
    expect(node.name).toBe(GS1_PROCESSOR_NAME);
    expect(node.context).toBe(context);
    expect(node.options.processorOptions?.sampleRate).toBe(44100);
    expect(node.options.processorOptions?.maxPolyphony).toBe(GS1_DEFAULT_POLYPHONY);
    expect(context.audioWorklet.addModule).toHaveBeenCalledWith("/fake-worklet.js");
    // The instrument is routed through its own unity gain so callers can re-gain it.
    expect(node.connected).toHaveLength(1);
    expect(host.output).toBeTruthy();
    await expect(host.ready).resolves.toEqual({ abi: GS1_EXPECTED_ABI, variant: "simd" });
  });

  it("refuses a context with no AudioWorklet instead of building a silent node", async () => {
    await expect(
      createGs1Host({
        context: makeContext({ audioWorklet: undefined }),
        processorUrl: "/fake-worklet.js",
      })
    ).rejects.toThrow(/no AudioWorklet/);
  });

  it("falls back to the scalar core when the SIMD bytes do not validate", async () => {
    const validate = vi.spyOn(WebAssembly, "validate");
    validate.mockImplementation((bytes: BufferSource) => {
      // First call is the SIMD core, second is the scalar core.
      return (bytes as ArrayBuffer).byteLength !== EMPTY_WASM.byteLength ? false : true;
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => EMPTY_WASM.buffer,
      });
    (globalThis as Record<string, unknown>).fetch = fetchMock;

    const pending = createGs1Host({
      context: makeContext(),
      processorUrl: "/fake-worklet.js",
      simdUrl: "/simd.wasm",
      scalarUrl: "/scalar.wasm",
    });
    await vi.waitFor(() => expect(FakeAudioWorkletNode.instances.length).toBe(1));
    FakeAudioWorkletNode.instances[0].port.emit({ type: "ready", abi: GS1_EXPECTED_ABI });
    const host = await pending;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(host.variant).toBe("scalar");
    validate.mockRestore();
  });

  it("rejects when the core reports a different ABI", async () => {
    const pending = createGs1Host({
      context: makeContext(),
      processorUrl: "/fake-worklet.js",
      simdUrl: "/simd.wasm",
      scalarUrl: "/scalar.wasm",
    });
    await vi.waitFor(() => expect(FakeAudioWorkletNode.instances.length).toBe(1));
    // The factory resolves once the node exists; the ABI verdict lands on `ready`, which is
    // what a real caller awaits before playing a note.
    const host = await pending;
    FakeAudioWorkletNode.instances[0].port.emit({ type: "ready", abi: GS1_EXPECTED_ABI + 1 });
    await expect(host.ready).rejects.toThrow(/ABI mismatch/);
  });

  it("rejects when the processor reports a load error", async () => {
    const pending = createGs1Host({
      context: makeContext(),
      processorUrl: "/fake-worklet.js",
      simdUrl: "/simd.wasm",
      scalarUrl: "/scalar.wasm",
    });
    await vi.waitFor(() => expect(FakeAudioWorkletNode.instances.length).toBe(1));
    const host = await pending;
    FakeAudioWorkletNode.instances[0].port.emit({ type: "error", message: "no wasm" });
    await expect(host.ready).rejects.toThrow(/worklet error: no wasm/);
  });

  it("rejects on a failed core fetch", async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async () => ({
      ok: false,
      status: 503,
      arrayBuffer: async () => new ArrayBuffer(0),
    }));
    await expect(
      createGs1Host({
        context: makeContext(),
        processorUrl: "/fake-worklet.js",
        simdUrl: "/simd.wasm",
        scalarUrl: "/scalar.wasm",
      })
    ).rejects.toThrow(/HTTP 503/);
  });
});

describe("Gs1Host — note messages", () => {
  it("posts the documented message types", async () => {
    const { host, node } = await bootHost();
    host.noteOn(60, 0.8);
    host.noteOn(64, 0.7, -0.5);
    host.noteOff(60);
    host.allNotesOff();

    expect(node.port.postMessage.mock.calls.map((c) => (c[0] as { type: string }).type)).toEqual([
      "noteOn",
      "noteOnPan",
      "noteOff",
      "allNotesOff",
    ]);
    expect(node.port.postMessage.mock.calls[0][0]).toEqual({ type: "noteOn", note: 60, velocity: 0.8 });
    expect(node.port.postMessage.mock.calls[1][0]).toEqual({
      type: "noteOnPan",
      note: 64,
      velocity: 0.7,
      pan: -0.5,
    });
  });

  it("stops posting after dispose", async () => {
    const { host, node } = await bootHost();
    host.dispose();
    const before = node.port.postMessage.mock.calls.length;
    host.noteOn(60, 1);
    host.noteOff(60);
    host.allNotesOff();
    expect(node.port.postMessage.mock.calls.length).toBe(before);
    expect(node.disconnected).toBe(1);
  });
});

describe("Gs1Host — parameters (risk R4: one table, not two)", () => {
  it("maps a numeric id onto the vendored AudioParam name", async () => {
    const { host, node } = await bootHost();
    host.setParam(Param.OSC1_ON, 1);
    host.setParam(Param.ENV_ATTACK, 0.02);

    expect(node.parameters.get(PARAM_NAMES[Param.OSC1_ON as ParamId])?.value).toBe(1);
    expect(node.parameters.get(PARAM_NAMES[Param.ENV_ATTACK as ParamId])?.value).toBe(0.02);
    expect(host.getParam(Param.OSC1_ON)).toBe(1);
    // Nothing was inferred for a parameter the caller never wrote.
    expect(host.getParam(Param.FILTER_CUTOFF)).toBeUndefined();
  });

  it("refuses an unmapped id rather than writing into the void (risk R5)", async () => {
    const { host } = await bootHost();
    expect(() => host.setParam(99999, 1)).toThrow(/no AudioParam descriptor for id 99999/);
  });

  it("refuses a non-finite value", async () => {
    const { host } = await bootHost();
    expect(() => host.setParam(Param.OSC1_ON, Number.NaN)).toThrow(/refusing to write/);
    expect(() => host.setParam(Number.NaN, 1)).toThrow(/refusing to write/);
  });

  it("setPatch writes several parameters at once", async () => {
    const { host, node } = await bootHost();
    host.setPatch({
      [Param.OSC1_ON]: 1,
      [Param.OSC2_ON]: 0,
      [Param.FILTER_CUTOFF]: 1200,
    });
    expect(node.parameters.get(PARAM_NAMES[Param.OSC1_ON as ParamId])?.value).toBe(1);
    expect(node.parameters.get(PARAM_NAMES[Param.OSC2_ON as ParamId])?.value).toBe(0);
    expect(node.parameters.get(PARAM_NAMES[Param.FILTER_CUTOFF as ParamId])?.value).toBe(1200);
  });
});

describe("Gs1Host — analysis and polyphony replies", () => {
  it("parses an analysis frame, exposes it to pollers and to subscribers", async () => {
    const { host, node } = await bootHost();
    const seen: number[] = [];
    const unsubscribe = host.onAnalysis((a) => seen.push(a.load));

    node.port.emit({
      type: "analysis",
      spectrum: new Float32Array([1, 2, 3]),
      peakL: 0.5,
      peakR: 0.25,
      voices: 4,
      violations: 0,
      truePeak: 0.4,
      loudness: 0.1,
      limit: 1,
      load: 0.123,
    });

    expect(seen).toEqual([0.123]);
    expect(host.lastAnalysis?.load).toBe(0.123);
    expect(host.lastAnalysis?.voices).toBe(4);
    expect(host.lastAnalysis?.peakL).toBe(0.5);
    expect(Array.from(host.lastAnalysis!.spectrum as Float32Array)).toEqual([1, 2, 3]);

    unsubscribe();
    node.port.emit({ type: "analysis", load: 0.9, spectrum: [] });
    expect(seen).toEqual([0.123]);
    // Pollers still see the newest frame after unsubscribing.
    expect(host.lastAnalysis?.load).toBe(0.9);
  });

  it("defaults missing analysis fields to zero instead of NaN", async () => {
    const { host, node } = await bootHost();
    node.port.emit({ type: "analysis" });
    expect(host.lastAnalysis).toEqual({
      spectrum: undefined,
      peakL: 0,
      peakR: 0,
      voices: 0,
      violations: 0,
      truePeak: 0,
      loudness: 0,
      limit: 0,
      load: 0,
    });
  });

  it("reports polyphony events with their reason", async () => {
    const { host, node } = await bootHost();
    const events: Array<{ value: number; reason: string }> = [];
    const unsubscribe = host.onPolyphony((e) => events.push(e));
    node.port.emit({ type: "polyphony", value: 8, reason: "overload" });
    node.port.emit({ type: "polyphony", value: 16, reason: "recover" });
    unsubscribe();
    node.port.emit({ type: "polyphony", value: 32, reason: "manual" });
    expect(events).toEqual([
      { value: 8, reason: "overload" },
      { value: 16, reason: "recover" },
    ]);
  });

  it("ignores message types it does not model, without throwing", async () => {
    const { host, node } = await bootHost();
    expect(() => node.port.emit({ type: "wavetable", request: 1, has: false, code: 0 })).not.toThrow();
    expect(() => node.port.emit({ type: "sample", request: 1 })).not.toThrow();
    expect(host.lastAnalysis).toBeNull();
  });
});

/**
 * ABI 9's two new entry points, through the adapter that exposes them.
 *
 * A3's GS-1 half was blocked on these: the engine's per-note `bends` / `tuning` tables and the per-voice read of them
 * had existed since the MPE work, the vendored processor has handled the `noteBend` / `tuning` messages all along, and
 * the only missing piece was the core exporting the two C functions. Now it does, so the host must actually post.
 */
describe("Gs1Host · per-note pitch (ABI 9)", () => {
  it("posts noteBend and tuning, and refuses nonsense instead of forwarding it", async () => {
    const { host, node } = await bootHost();
    host.noteBend(60, -0.12);
    host.setTuningNote(60, 12);
    expect(node.port.postMessage.mock.calls.map((call) => call[0])).toEqual([
      { type: "noteBend", note: 60, semitones: -0.12 },
      { type: "tuning", note: 60, cents: 12 },
    ]);

    node.port.postMessage.mockClear();
    host.noteBend(Number.NaN, 1);
    host.setTuningNote(60, Number.POSITIVE_INFINITY);
    expect(node.port.postMessage, "a non-finite value is dropped rather than sent to the audio thread").not.toHaveBeenCalled();
  });
});

/**
 * P2.5's first piece: the adapter can hand the core a **sample**.
 *
 * The core has had `gs_sample_import` and the processor its `sample` / `sampleClear` messages all along; the adapter's
 * `default:` case said out loud that it exposed none of them. With the licensing question set aside, the plumbing comes
 * first — *what* a sample is for (a vocal chop, a found sound, a rendered one-shot) is a caller's decision, and the
 * reply is what tells the caller whether the core took it.
 */
describe("Gs1Host · sample import (P2.5's plumbing)", () => {
  it("posts the sample with a request id and resolves the core's reply", async () => {
    const { host, node } = await bootHost();
    const samples = new Float32Array([0, 0.5, -0.5, 1]);
    const pending = host.importSample(samples, 48000);
    const posted = node.port.postMessage.mock.calls.at(-1)![0] as { type: string; request: number; sampleRate: number };
    expect(posted.type).toBe("sample");
    expect(posted.sampleRate).toBe(48000);
    expect(Number.isFinite(posted.request), "the request id is what the reply is matched on").toBe(true);

    node.port.emit({ type: "sample", request: posted.request, has: true, code: 0 });
    await expect(pending).resolves.toEqual({ has: true, code: 0 });
  });

  it("reports the core's own failure codes rather than swallowing them", async () => {
    const { host, node } = await bootHost();
    const pending = host.importSample(new Float32Array([1, 0, 0]), 44100);
    const request = (node.port.postMessage.mock.calls.at(-1)![0] as { request: number }).request;
    // 4 is the core's "the arena has no room" — an ordinary outcome, not an exception.
    node.port.emit({ type: "sample", request, has: false, code: 4 });
    await expect(pending).resolves.toEqual({ has: false, code: 4 });
  });

  it("answers an empty import without bothering the audio thread, and clears through the port", async () => {
    const { host, node } = await bootHost();
    await expect(host.importSample(new Float32Array(0), 44100)).resolves.toEqual({ has: false, code: 1 });

    const clearing = host.clearSample();
    const request = (node.port.postMessage.mock.calls.at(-1)![0] as { type: string; request: number }).request;
    expect((node.port.postMessage.mock.calls.at(-1)![0] as { type: string }).type).toBe("sampleClear");
    node.port.emit({ type: "sample", request, has: false, code: 0 });
    await expect(clearing).resolves.toEqual({ has: false, code: 0 });
  });
});
