/**
 * GS-1 host adapter (P6 / requirement 11, Phase 2).
 *
 * ## Why this file exists instead of importing `vendor/gs1/src/audio/engine.ts`
 *
 * The vendored GS-1 `AudioEngine` is a *whole application* engine: 40+ public methods, its own
 * PWA registration, its own i18n calls and its own fetch/settle helpers. Importing it into
 * Groove Lab would drag four host dependencies we do not have (`./settle`, `./wasmFetch`,
 * `@/pwa/register`, `@/i18n`) and freeze us to its entire public surface — of which the
 * integration plan deliberately wants a **nine-method narrow face**:
 *
 *     init / noteOn / noteOff / allNotesOff / setPatch / setParam / onAnalysis / onPolyphony / dispose
 *     + noteBend / setTuningNote (ABI 9)
 *
 * `init` is this module's `createGs1Host` factory. Everything else is below. Upstream is free
 * to refactor the other thirty-odd methods without touching us, and nothing in this file
 * imports app state, i18n or the service worker.
 *
 * ## What it talks to
 *
 * Straight to the vendored AudioWorklet processor (`gs1-synth-processor`), whose message
 * protocol is documented at its `handleMessage` switch: plain objects with a `type`, MIDI-style
 * `ArrayBuffer` note packets, and 224 k-rate `AudioParam`s for continuous values. The processor
 * writes **every** parameter into the WASM core on every render quantum (from the AudioParam
 * values, which default to the descriptors' defaults), so the core never depends on state left
 * over from a previous host — that is the plan's risk R2, and it is handled upstream by design.
 *
 * ## Deliberate limits
 *
 * - **`noteBend` and `setTuningNote` are exposed since ABI 9** (2026-09-24). ABI 8 did not export
 *   `gs_note_bend` / `gs_set_tuning_note` and the processor's guards for them were dead, so this adapter said so
 *   rather than lying. The upstream core now exports both — its `bends` / `tuning` tables and the per-voice read of
 *   them had existed all along; only the C entry points were missing — so the narrow face grows by two methods, which
 *   is what A3's GS-1 half was waiting for.
 * - **WASM variant choice mirrors upstream**: prefer the SIMD core, but validate the bytes and
 *   fall back to the scalar core, because a browser can advertise SIMD and still reject the
 *   build. `WebAssembly.validate` is the authority, not feature detection.
 * - **One node per host, on the caller's context.** Groove Lab already creates up to five
 *   `AudioContext`s; this adapter never creates one, so it cannot add a sixth (plan risk R6).
 */
import { PARAM_NAMES, type ParamId } from "../../../vendor/gs1/src/audio/params";

/**
 * Runtime asset URLs.
 *
 * The processor and the two cores are served as **static files from `public/gs1/`** rather than
 * imported with `?url`, for three reasons:
 *
 *  1. an `AudioWorklet` module and a `.wasm` binary are fetched by URL at runtime anyway — the
 *     bundler adds nothing except a hash, and the hashed path then has to be kept alive by a
 *     module import;
 *  2. importing them put a `.wasm` in the module graph, which some test runners cannot load
 *     (`"ESM integration proposal for Wasm" is not supported`), so a *test-selection* heuristic
 *     could fail on a change that has nothing to do with GS-1;
 *  3. it matches how this repository already ships its other worklets
 *     (`public/limiterWorklet.js`, `public/audioClockWorklet.js`).
 *
 * The copies are not hand-maintained: `scripts/sync-gs1.mjs` writes them from the vendored pin and
 * `scripts/check-gs1.mjs` asserts they are **byte-identical** to it, so they cannot drift.
 */
const DEFAULT_ASSET_BASE = "/gs1";
const workletProcessorUrl = `${DEFAULT_ASSET_BASE}/workletProcessor.js`;
const simdWasmUrl = `${DEFAULT_ASSET_BASE}/synth_core.wasm`;
const scalarWasmUrl = `${DEFAULT_ASSET_BASE}/synth_core_scalar.wasm`;

/** The processor name registered by the vendored worklet. */
export const GS1_PROCESSOR_NAME = "gs1-synth-processor";
/** ABI this adapter is written against; the vendored pin must report the same number. */
/**
 * The ABI this adapter is written for, and it **rejects** a core that reports anything else.
 *
 * It has to move with the pin in the same change: bumping the vendored core to 9 while this said 8 made every host
 * refuse to build, which the loudness freshness check caught as three genres "lost a GS-1 voice" — the check that
 * exists because a row measured with the pool switched off looks entirely normal otherwise.
 */
export const GS1_EXPECTED_ABI = 9;
/** Voices the plan measures Phase 0 at. The core's own ceiling is 32. */
export const GS1_DEFAULT_POLYPHONY = 16;

/** One analysis frame, as posted by the processor (`ANALYSIS_INTERVAL` blocks apart). */
export interface Gs1Analysis {
  /** 36 log-spaced spectrum bins, as a plain array (structured-cloned from the worklet). */
  spectrum: Float32Array | number[];
  peakL: number;
  peakR: number;
  voices: number;
  /** Non-zero means the core's allocator was violated — a hard failure, not a warning. */
  violations: number;
  truePeak: number;
  loudness: number;
  limit: number;
  /**
   * Share of the render-quantum budget the DSP used, 0..1+ (`costAvg / quantumMs`).
   * This is the number the plan's experiment E3 is about: above its own 0.35
   * `OVER_LOAD` threshold the integration is scoped down.
   */
  load: number;
}

export interface Gs1PolyphonyEvent {
  value: number;
  /** `manual` = host request echoed back; `overload` / `recover` = the load monitor. */
  reason: string;
}

/** What the core says about an imported sample. */
export interface Gs1SampleReply {
  /** Whether a sample is loaded after the call. */
  has: boolean;
  /** 0 ok · 1 too short · 4 no room in the arena · −1 the core has no sample import. */
  code: number;
}

export interface Gs1HostOptions {
  /** The context to build the node on. Never created here. */
  context: BaseAudioContext;
  /** Starting polyphony ceiling. Defaults to {@link GS1_DEFAULT_POLYPHONY}. */
  maxPolyphony?: number;
  /**
   * **Diagnostic only.** Ask the worklet to post the core's own output samples around each scheduled event.
   *
   * Used to answer "is this discontinuity in the core or in the rendered file": the caller compares the posted samples with
   * the file at the same frames. Off by default — one `postMessage` per event on the audio thread is not a thing to leave on.
   */
  captureEvents?: boolean;
  /** Receives what {@link captureEvents} asks for. */
  onEventCapture?: (capture: unknown) => void;
  /** Overrides, for tests and for a future asset-pipeline change. */
  processorUrl?: string;
  simdUrl?: string;
  scalarUrl?: string;
  /** Abort the WASM fetch after this many ms (upstream uses 20 s). */
  fetchTimeoutMs?: number;
}

export interface Gs1Host {
  readonly node: AudioWorkletNode;
  /** Where to connect the instrument. A unity gain node, so callers may re-gain it. */
  readonly output: GainNode;
  /** Resolves with the ABI the core actually reports, or rejects on a failed load. */
  readonly ready: Promise<{ abi: number; variant: "simd" | "scalar" }>;
  readonly maxPolyphony: number;
  readonly variant: "simd" | "scalar" | null;
  /**
   * Frames between a frame-addressed event's `atFrame` and the voice's first sample, as reported
   * by the worklet (one render quantum; measured, not assumed). A host that wants GS-1 notes
   * aligned with sample-accurate native voices addresses them this many frames early.
   */
  readonly scheduledNoteLatencyFrames: number;
  noteOn(note: number, velocity: number, pan?: number, cents?: number): void;
  noteOff(note: number): void;
  /**
   * Frame-addressed note events: `atFrame` is an absolute frame index in the context's timeline
   * (`Math.round(when * sampleRate)`), which is what lets a lookahead scheduler drive this
   * engine without either posting early or inheriting main-thread jitter.
   */
  noteOnAt(note: number, velocity: number, atFrame: number, pan?: number, cents?: number): void;
  noteOffAt(note: number, atFrame: number): void;
  /**
   * Bend **one** note, in semitones (MPE) — the per-note pitch A3's variation needs.
   *
   * The engine clamps to ±48 semitones. The vendored processor has handled the `noteBend` message since before this
   * adapter existed; until ABI 9 the core simply did not export the function it calls, so the branch was dead.
   */
  noteBend(note: number, semitones: number): void;
  /** Set **one** key's microtuning offset, in cents (±1200 by the engine's own clamp). */
  setTuningNote(note: number, cents: number): void;
  /**
   * Import a **sample** into the core (mono, the file's own rate).
   *
   * The first piece of P2.5's plumbing. The core has had `gs_sample_import` and the processor its `sample` /
   * `sampleClear` messages all along; this adapter simply never exposed them, and said so in its own `default:` case.
   * Nothing here decides *what* a sample is for — a caller that has one (a recording, a rendered one-shot, a test
   * fixture) can now hand it over, and the reply says whether the core took it.
   *
   * The codes come from the processor and the core: **0** ok, **1** too short, **4** the arena has no room,
   * **-1** this core has no sample import at all.
   */
  importSample(samples: Float32Array, sampleRate: number): Promise<Gs1SampleReply>;
  /** Drop the imported sample; the reply carries `has: false` once the core confirms. */
  clearSample(): Promise<Gs1SampleReply>;
  allNotesOff(): void;
  /** Write one parameter by numeric id (`Param.*` in the vendored `params.ts`). */
  setParam(id: number, value: number): void;
  /** Read back what this host last wrote, or `undefined` if never written. */
  getParam(id: number): number | undefined;
  /** Replace many parameters atomically-ish; this is the `setPatch` seam. */
  setPatch(values: Record<number, number>): void;
  /**
   * Wire (or clear) one modulation route, e.g. velocity → cutoff.
   *
   * The core reads velocity as amplitude alone; the native presets all carry a `velocityToCutoff` response, so a quiet
   * note is a *darker* note there and not here. The route is the core's own mechanism for that (`modRoute`), and the
   * only caller is a patch change — which is why it lives next to `setPatch` rather than in its own lifetime.
   */
  setModRoute(index: number, src: number, dst: number, amount: number, enabled: boolean): void;
  onAnalysis(listener: (analysis: Gs1Analysis) => void): () => void;
  onPolyphony(listener: (event: Gs1PolyphonyEvent) => void): () => void;
  /** Most recent analysis frame, for pollers (the measurement scripts use this). */
  readonly lastAnalysis: Gs1Analysis | null;
  /** Ask the load monitor for a polyphony downgrade (upstream message `downgrade`). */
  requestDowngrade(): void;
  dispose(): void;
}

/** `Object.is`-style param write that never invents a value the caller did not pass. */
function assertFiniteParam(id: number, value: number): void {
  if (!Number.isFinite(id) || !Number.isFinite(value)) {
    throw new Error(`[Gs1Host] refusing to write param ${id} = ${value}`);
  }
}

/**
 * One core fetch per URL per page, shared by every host that needs it.
 *
 * Without this, every `createGs1Host` re-fetched the multi-megabyte WASM core: a host is built per
 * routed track *per render*, so the library's timbre baseline (159 genres x 2 repeats, two routed
 * tracks each) issued roughly **600 redundant fetches** — and every one of them was a chance for the
 * 20 s abort timer to fire under contention.
 *
 * That mattered far beyond the wasted bandwidth. A fetch that fails makes `createGs1Host` reject, and
 * `renderPatternOffline` catches it and leaves that track on the native synth **for that render
 * only** — a silent change of what the export sounds like, measured at up to 3.7 dB in a band. That
 * is the shape of the rare repeat-render outliers in appendix G.14, and caching is the fix that
 * removes the opportunity rather than retrying into it: after the first successful fetch there is no
 * request left to fail.
 *
 * The promise is cached rather than the bytes so that concurrent callers share one in-flight fetch.
 * A rejection is evicted immediately — one transient failure must not become permanent.
 */
const coreLoadCache = new Map<string, Promise<{ bytes: ArrayBuffer; variant: "simd" | "scalar" }>>();

/**
 * Fetch the core, preferring SIMD but validating the bytes before trusting them.
 *
 * Returns the bytes *and* which variant they are, so the caller can report the truth rather
 * than the intent (the plan's E2 question is "does the real thing load here").
 */
async function fetchCore(
  simd: boolean,
  opts: Required<Pick<Gs1HostOptions, "simdUrl" | "scalarUrl" | "fetchTimeoutMs">>
): Promise<{ bytes: ArrayBuffer; variant: "simd" | "scalar" }> {
  const wanted: "simd" | "scalar" = simd ? "simd" : "scalar";
  const cacheKey = `${wanted}|${opts.simdUrl}|${opts.scalarUrl}|${opts.fetchTimeoutMs}`;
  const cached = coreLoadCache.get(cacheKey);
  if (cached) return cached;

  const attempt = (async (): Promise<{ bytes: ArrayBuffer; variant: "simd" | "scalar" }> => {
    const load = async (url: string): Promise<ArrayBuffer> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts.fetchTimeoutMs);
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`[Gs1Host] core fetch failed: HTTP ${response.status} for ${url}`);
        }
        return await response.arrayBuffer();
      } finally {
        clearTimeout(timer);
      }
    };

    let bytes = await load(wanted === "simd" ? opts.simdUrl : opts.scalarUrl);
    if (WebAssembly.validate(bytes)) return { bytes, variant: wanted };

    if (wanted === "simd") {
      bytes = await load(opts.scalarUrl);
      if (WebAssembly.validate(bytes)) return { bytes, variant: "scalar" };
    }
    throw new Error("[Gs1Host] neither the SIMD nor the scalar core validates in this browser");
  })();

  coreLoadCache.set(cacheKey, attempt);
  attempt.catch(() => {
    coreLoadCache.delete(cacheKey);
  });
  return attempt;
}

/**
 * Drop the cached core. Exported for tests, which must not inherit another test's fetch.
 *
 * Deliberately *not* called on a failed host build: the bytes are context-independent data, so they
 * stay valid even when a particular `AudioWorkletNode` refuses to construct.
 */
export function resetGs1CoreCache(): void {
  coreLoadCache.clear();
}

/**
 * Build a GS-1 instrument on an existing context.
 *
 * Resolves once the worklet has compiled its core and reported `ready` — callers should not
 * assume notes played before that are heard (they are dropped by the processor's `ready` gate).
 */
export async function createGs1Host(options: Gs1HostOptions): Promise<Gs1Host> {
  const {
    context,
    maxPolyphony = GS1_DEFAULT_POLYPHONY,
    // Diagnostic only (see `captureEvents` on the options): the worklet then posts the core's own samples around each
    // scheduled event, which is how "is the discontinuity in the core or in the file" gets answered.
    captureEvents = false,
    onEventCapture,
    processorUrl = workletProcessorUrl,
    simdUrl = simdWasmUrl,
    scalarUrl = scalarWasmUrl,
    fetchTimeoutMs = 20000,
  } = options;

  if (!context || typeof (context as AudioContext).audioWorklet?.addModule !== "function") {
    throw new Error("[Gs1Host] the supplied context has no AudioWorklet (needs a real AudioContext)");
  }

  const { bytes, variant } = await fetchCore(true, { simdUrl, scalarUrl, fetchTimeoutMs });
  await context.audioWorklet.addModule(processorUrl);

  const node = new AudioWorkletNode(context as BaseAudioContext, GS1_PROCESSOR_NAME, {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    processorOptions: {
      wasmBytes: bytes,
      sampleRate: context.sampleRate,
      maxPolyphony,
      ...(captureEvents ? { captureEvents: true } : {}),
    },
  });

  const output = context.createGain();
  output.gain.value = 1;
  node.connect(output);

  const analysisListeners = new Set<(a: Gs1Analysis) => void>();
  const polyphonyListeners = new Set<(e: Gs1PolyphonyEvent) => void>();
  const written = new Map<number, number>();
  let lastAnalysis: Gs1Analysis | null = null;
  let disposed = false;
  /**
   * Populated from the worklet's `ready` message. Defaults to one render quantum so a host that
   * plays a note before `ready` resolves still computes a sane frame instead of 0.
   */
  let scheduledNoteLatencyFrames = 128;

  const ready = new Promise<{ abi: number; variant: "simd" | "scalar" }>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("[Gs1Host] the worklet did not report ready within 30 s"));
    }, 30000);
    node.port.onmessage = (event: MessageEvent) => {
      const data = event.data as Record<string, unknown> & { type?: string };
      switch (data?.type) {
        case "ready": {
          clearTimeout(timer);
          if (Number.isFinite(Number(data.scheduledNoteLatencyFrames))) {
            scheduledNoteLatencyFrames = Number(data.scheduledNoteLatencyFrames);
          }
          const abi = Number(data.abi);
          if (abi !== GS1_EXPECTED_ABI) {
            reject(
              new Error(
                `[Gs1Host] ABI mismatch: the core reports ${abi}, this adapter is written for ${GS1_EXPECTED_ABI}`
              )
            );
            return;
          }
          resolve({ abi, variant });
          break;
        }
        case "eventCapture": {
          onEventCapture?.(event.data);
          break;
        }
        case "analysis": {
          const frame: Gs1Analysis = {
            spectrum: data.spectrum as Float32Array,
            peakL: Number(data.peakL) || 0,
            peakR: Number(data.peakR) || 0,
            voices: Number(data.voices) || 0,
            violations: Number(data.violations) || 0,
            truePeak: Number(data.truePeak) || 0,
            loudness: Number(data.loudness) || 0,
            limit: Number(data.limit) || 0,
            load: Number(data.load) || 0,
          };
          lastAnalysis = frame;
          for (const listener of analysisListeners) listener(frame);
          break;
        }
        case "polyphony": {
          const value = Number(data.value) || 0;
          const reason = String(data.reason ?? "unknown");
          for (const listener of polyphonyListeners) listener({ value, reason });
          break;
        }
        case "error": {
          // The processor reports load failures on the message port rather than throwing
          // inside `process` (where it could only kill the audio thread).
          clearTimeout(timer);
          reject(new Error(`[Gs1Host] worklet error: ${String(data.message)}`));
          break;
        }
        case "sample": {
          const request = Number(data.request);
          const waiters = Number.isFinite(request) ? sampleWaiters.get(request) : undefined;
          if (waiters) {
            sampleWaiters.delete(request);
            waiters({ has: Boolean(data.has), code: Number(data.code ?? 0) });
          }
          break;
        }
        default:
          // `wavetable` / `ir` replies belong to features this adapter does not expose yet; ignoring them is
          // deliberate rather than an oversight (samples are the first of the three to arrive — P2.5).
          break;
      }
    };
  });

  /**
   * Pending sample requests, keyed by the request id the processor echoes back.
   *
   * A sample import is the one message whose *result* matters: "too short" and "no room in the arena" are both
   * ordinary outcomes a caller has to see, and the core reports them on the port rather than by throwing.
   */
  const sampleWaiters = new Map<number, (reply: Gs1SampleReply) => void>();
  let nextSampleRequest = 1;

  const requestSample = (message: Record<string, unknown>): Promise<Gs1SampleReply> => {
    if (disposed) return Promise.resolve({ has: false, code: -1 });
    const request = nextSampleRequest++;
    return new Promise<Gs1SampleReply>((resolve) => {
      sampleWaiters.set(request, resolve);
      node.port.postMessage({ ...message, request });
    });
  };

  const post = (message: Record<string, unknown>) => {
    if (disposed) return;
    node.port.postMessage(message);
  };

  /**
   * Local, so `setPatch` does not depend on the object literal's `this` binding.
   *
   * The numeric id is the WASM wire format while the AudioParam is addressed by *name*, so the
   * mapping comes from the vendored `PARAM_NAMES` rather than a second hand-written table —
   * the plan's risk R4 is exactly "the parameter table written twice", and the vendored copy is
   * the one the contract gate hashes.
   */
  const setParam = (id: number, value: number) => {
    assertFiniteParam(id, value);
    const name = PARAM_NAMES[id as ParamId];
    const param = name ? node.parameters.get(name) : undefined;
    if (!param) {
      // Writing an unknown id into the core is exactly the silent-algorithm-switch hazard
      // the plan registers as risk R5, so a missing descriptor is an error here.
      throw new Error(`[Gs1Host] no AudioParam descriptor for id ${id} (${name ?? "unmapped"})`);
    }
    param.value = value;
    written.set(id, value);
  };

  return {
    node,
    output,
    ready,
    maxPolyphony,
    variant,
    get scheduledNoteLatencyFrames() {
      return scheduledNoteLatencyFrames;
    },
    noteOn(note, velocity, pan, cents) {
      const tuning = cents === undefined ? {} : { cents };
      if (pan === undefined) post({ type: "noteOn", note, velocity, ...tuning });
      else post({ type: "noteOnPan", note, velocity, pan, ...tuning });
    },
    noteOff(note) {
      post({ type: "noteOff", note });
    },
    noteOnAt(note, velocity, atFrame, pan, cents) {
      if (!Number.isFinite(atFrame)) {
        throw new Error(`[Gs1Host] refusing to schedule a note at frame ${atFrame}`);
      }
      post({
        type: "noteAt",
        note,
        velocity,
        atFrame: Math.round(atFrame),
        ...(pan === undefined ? {} : { pan }),
        // The tuning rides with the note so the worklet can apply it *at the note's frame* (see the protocol doc);
        // sending it separately retuned whichever voice was still sounding on that key.
        ...(cents === undefined || !Number.isFinite(cents) ? {} : { cents }),
      });
    },
    importSample(samples, sampleRate) {
      if (!samples || samples.length === 0) return Promise.resolve({ has: false, code: 1 });
      return requestSample({ type: "sample", samples, sampleRate });
    },
    clearSample() {
      return requestSample({ type: "sampleClear" });
    },
    noteBend(note, semitones) {
      if (!Number.isFinite(note) || !Number.isFinite(semitones)) return;
      post({ type: "noteBend", note: Math.round(note), semitones });
    },
    setTuningNote(note, cents) {
      if (!Number.isFinite(note) || !Number.isFinite(cents)) return;
      post({ type: "tuning", note: Math.round(note), cents });
    },
    noteOffAt(note, atFrame) {
      if (!Number.isFinite(atFrame)) {
        throw new Error(`[Gs1Host] refusing to schedule a note-off at frame ${atFrame}`);
      }
      post({ type: "noteOffAt", note, atFrame: Math.round(atFrame) });
    },
    allNotesOff() {
      post({ type: "allNotesOff" });
    },
    setParam,
    getParam(id) {
      return written.get(id);
    },
    setPatch(values) {
      for (const [id, value] of Object.entries(values)) setParam(Number(id), value);
    },
    setModRoute(index, src, dst, amount, enabled) {
      post({ type: "modRoute", index, src, dst, amount, enabled });
    },
    onAnalysis(listener) {
      analysisListeners.add(listener);
      return () => analysisListeners.delete(listener);
    },
    onPolyphony(listener) {
      polyphonyListeners.add(listener);
      return () => polyphonyListeners.delete(listener);
    },
    get lastAnalysis() {
      return lastAnalysis;
    },
    requestDowngrade() {
      post({ type: "downgrade" });
    },
    dispose() {
      disposed = true;
      analysisListeners.clear();
      polyphonyListeners.clear();
      node.port.onmessage = null;
      try {
        node.disconnect();
      } catch {
        /* already detached */
      }
      try {
        output.disconnect();
      } catch {
        /* already detached */
      }
    },
  };
}
