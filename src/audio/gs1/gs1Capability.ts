/**
 * Can this browser actually **hear** the GS-1 voice?
 *
 * ## Why this exists
 *
 * Safari renders every GS-1-routed lane silent. Measured with `scripts/probe_engine_parity.mjs`: on WebKit a genre's
 * `chords` and `lead` stems are empty files while the native lanes (kick, snare, hats, percussion, bass) agree with
 * Chromium to within 0.8 dB — and because the renderer treats "a host was built for this track" as "this track is
 * handled", those lanes ship as silence rather than falling back. The live path is a different failure with the same
 * cause (the same core, put through Safari's audio stack): a user reports the lead *audible but "a very strange
 * sound"*.
 *
 * The fix is not a browser sniff. It is the question the codebase already asks everywhere else: **measure it.** Play
 * one note through a throwaway host, listen to it with an analyser, and if nothing comes out, say so — then every
 * caller routes that track natively, which is what the offline renderer and the live engine both do when GS-1 is
 * switched off.
 *
 * ## Status: written, tested, **not wired** — and why
 *
 * The first wiring put this probe in front of the exporter and the live transport. It was reverted the same day,
 * because a headless WebKit run showed the realtime context answering a different question from the one that matters:
 * `chords` and `lead` stayed silent in the **offline** render while the realtime probe did not conclusively call the
 * engine silent, and one run left the snare lane empty too (that part did not reproduce, and is recorded here only so
 * nobody re-learns it the hard way). A working realtime context is not evidence about an `OfflineAudioContext`.
 *
 * **A correction, because the first version of this header claimed the opposite.** An ABI-8-versus-ABI-9 comparison
 * seemed to show the ABI 8 core rendering audibly on WebKit and the ABI 9 core silent, which would have made the ABI 9
 * re-pin the culprit. It did not: that comparison swapped only *one* of the two cores (SIMD and scalar) while the host
 * still expected ABI 9, the adapter rejected the mismatch, GS-1 was switched off entirely, and the "audible" result was
 * the **native fallback** playing instead. With both cores swapped and the expectation matched, **WebKit renders the
 * GS-1 offline path silent on ABI 8 as well** — the export defect is pre-existing and engine-level, not a regression
 * from the re-pin, and rolling the core back would have bought nothing.
 *
 * The probes stay (`probe_engine_parity.mjs`, `probe_live_voice.mjs`) and so do these cases, but the verdict belongs
 * to a probe that renders **in the context under test** — which is where the next attempt should start. The live
 * symptom is reported as *audible but wrong*, not silent, so it is a second and separate defect: the same worklet
 * does run in Safari's realtime context.
 *
 * ## The three verdicts, and why "unmeasured" is one of them
 *
 * `unmeasured` is not a failure. A context that is *suspended* (Safari will not start one without a gesture) or one
 * whose clock does not advance produces exactly the same silence as a broken worklet, and turning GS-1 off on that
 * evidence would degrade every engine, including the working ones. Only a **measured silence in a running context**
 * disables it; anything else leaves the current behaviour alone.
 */
import { createGs1Host, type Gs1Host } from "./Gs1Host";

/** What the probe concluded. `unmeasured` means "no evidence either way" — keep the current routing. */
export type Gs1Capability = "usable" | "silent" | "unmeasured";

/** Peak amplitude that counts as sound. A silent core sums to exactly 0; a real voice is orders of magnitude above. */
export const GS1_PROBE_PEAK_THRESHOLD = 1e-4;
/** How long to listen for the probe note, in milliseconds of wall clock. */
export const GS1_PROBE_WINDOW_MS = 320;

/** The slice of an analyser the probe needs, so a test can hand it a script instead of a browser. */
export interface ProbeAnalyser {
  getFloatTimeDomainData(target: Float32Array): void;
  readonly fftSize: number;
}

/**
 * The **control**: a plain oscillator through the very same analyser.
 *
 * Without it the probe cannot tell "the synth engine is silent" from "this context is not rendering audio at all",
 * and the second case is common and harmless — a headless browser with no output device, a suspended context, a
 * throttled tab. The first CI run after wiring this probe failed exactly there: WebKit and Firefox rendered silence
 * for reasons that had nothing to do with GS-1, the probe switched the engine off, and the matrix's own assertion
 * ("GS-1 defaults to on") caught it. A verdict that turns a feature off has to be able to show that sound was possible
 * in the first place.
 */
export interface ReferenceDeps {
  /** Play a short, plain tone on the given analyser's context and report the peak it produced. */
  measure: (analyser: ProbeAnalyser) => Promise<number>;
  /** Peak that counts as "this context renders audio". */
  threshold?: number;
}

export interface ProbeDeps {
  /** Create the host to test. Injected so the probe is testable without WASM or a worklet. */
  createHost: () => Promise<Gs1Host>;
  /** An analyser on the same context, already connected to the host's output. */
  analyser: ProbeAnalyser;
  /** Sleep, injected for the same reason (`setTimeout` in a page, immediate in a test). */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Play one note through a temporary host and report whether anything came out.
 *
 * The host is disposed before returning, whatever the verdict: a probe that leaks a WASM core costs the page the
 * same budget the real hosts need (the exporter's own note records that a page builds ~124 before instantiation
 * starts failing).
 */
export async function probeGs1Output(deps: ProbeDeps): Promise<Gs1Capability> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  let host: Gs1Host | null = null;
  try {
    host = await deps.createHost();
    await host.ready;
    // A short, plain note: middle C, full velocity, released inside the window.
    host.noteOn(60, 0.9);
    const frames = new Float32Array(deps.analyser.fftSize);
    let peak = 0;
    const started = Date.now();
    let read = 0;
    while (Date.now() - started < GS1_PROBE_WINDOW_MS) {
      deps.analyser.getFloatTimeDomainData(frames);
      for (let i = 0; i < frames.length; i += 1) {
        const value = Math.abs(frames[i]);
        if (value > peak) peak = value;
      }
      read += 1;
      // Release early so a long patch cannot ring past the window and be mistaken for a stuck voice.
      if (read === 2) host.noteOff(60);
      await sleep(20);
    }
    if (peak >= GS1_PROBE_PEAK_THRESHOLD) return "usable";
    return "silent";
  } catch {
    // A host that cannot even be built is not evidence about the engine's audio: the caller already has a failure
    // path for that (`GS1_HOST_LOAD_ATTEMPTS`), and this probe must not double as a second one.
    return "unmeasured";
  } finally {
    try {
      host?.dispose();
    } catch {
      /* already gone */
    }
  }
}

/**
 * The verdict for this page, cached.
 *
 * One page has one audio stack, so the answer does not change between renders — and the check costs a WASM core plus
 * a third of a second, which is worth paying exactly once. `undefined` means nobody has asked yet.
 */
let cached: Gs1Capability | undefined;

/**
 * Run the probe against a **live** context and cache the verdict.
 *
 * This is the wiring the module header said belonged in "a probe that renders in the context under test": the host is
 * built on the real `AudioContext`, fed one note, and read through an analyser on that same context. The note is
 * routed through a zero-gain node into the master so the graph is pulled — an analyser with no path to the
 * destination is not rendered at all — while staying inaudible.
 *
 * Cached per page: one page has one audio stack, and the probe costs a WASM core plus a third of a second.
 */
export async function ensureLiveGs1Capability(
  context: BaseAudioContext,
  options: { createHost?: () => Promise<Gs1Host> } = {}
): Promise<Gs1Capability> {
  if (cached) return cached;
  const createHost = options.createHost ?? (() => createGs1Host({ context }));
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  const silentSink = context.createGain();
  silentSink.gain.value = 0;
  analyser.connect(silentSink);
  silentSink.connect(context.destination);
  let host: Gs1Host | undefined;
  try {
    /**
     * The control first, and it decides everything: a context that cannot reproduce a plain oscillator cannot tell us
     * anything about the synth engine, so the verdict is `unmeasured` and the current routing is left alone.
     */
    let referencePeak = 0;
    try {
      referencePeak = await measureReferenceTone(context, analyser);
    } catch {
      // A context that cannot build the reference graph is not evidence about the engine (a test double, a partial
      // implementation) — the same rule as a host that will not build.
      cached = "unmeasured";
      return cached;
    }
    if (referencePeak < GS1_PROBE_PEAK_THRESHOLD) {
      cached = "unmeasured";
      return cached;
    }
    const verdict = await probeGs1Output({
      analyser,
      createHost: async () => {
        host = await createHost();
        host.output.connect(analyser);
        return host;
      },
    });
    cached = verdict;
    return verdict;
  } finally {
    try {
      host?.dispose();
    } catch {
      /* already gone */
    }
    try {
      analyser.disconnect();
      silentSink.disconnect();
    } catch {
      /* already gone */
    }
  }
}

/**
 * A 220 Hz triangle at a third of full scale for ~150 ms, measured through `analyser`.
 *
 * Short and unmusical on purpose: it is a reference level, not a note, and it never reaches the speakers (the
 * analyser's own output goes to a zero gain).
 */
async function measureReferenceTone(
  context: BaseAudioContext,
  analyser: ProbeAnalyser,
  windowMs = 150
): Promise<number> {
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = "triangle";
  osc.frequency.value = 220;
  gain.gain.value = 0.33;
  osc.connect(gain);
  gain.connect(analyser as unknown as AudioNode);
  const frames = new Float32Array(analyser.fftSize);
  let peak = 0;
  const read = () => {
    analyser.getFloatTimeDomainData(frames);
    for (let i = 0; i < frames.length; i += 1) {
      const value = Math.abs(frames[i]);
      if (value > peak) peak = value;
    }
  };
  try {
    osc.start();
    const started = Date.now();
    while (Date.now() - started < windowMs) {
      read();
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  } finally {
    try {
      osc.stop();
      osc.disconnect();
      gain.disconnect();
    } catch {
      /* already gone */
    }
  }
  return peak;
}

export function gs1Capability(): Gs1Capability | undefined {
  return cached;
}

export function setGs1Capability(verdict: Gs1Capability): void {
  cached = verdict;
}

/** Test seam: forget the cached verdict. */
export function resetGs1Capability(): void {
  cached = undefined;
}

/**
 * Run the probe once per page, in a **realtime** context, and cache it.
 *
 * Realtime on purpose: an `OfflineAudioContext`'s clock only advances while it is rendering, so a probe note posted
 * into one measures a frozen clock and would report silence on every engine in existence. If the context cannot be
 * started (a suspended `AudioContext` before a user gesture), the verdict stays `unmeasured`.
 */
export async function ensureGs1Capability(options?: {
  createHost?: (ctx: BaseAudioContext) => Promise<Gs1Host>;
  createContext?: () => BaseAudioContext;
}): Promise<Gs1Capability> {
  if (cached) return cached;
  const createContext =
    options?.createContext ??
    (() => {
      const Ctor = (globalThis as { AudioContext?: new () => AudioContext }).AudioContext;
      if (!Ctor) throw new Error("no AudioContext");
      return new Ctor();
    });
  const createHost = options?.createHost ?? ((ctx: BaseAudioContext) => createGs1Host({ context: ctx }));

  let ctx: BaseAudioContext | null = null;
  try {
    ctx = createContext();
    if ("state" in ctx && (ctx as AudioContext).state !== "running") {
      // Suspended: no clock, therefore no evidence. Do not touch the routing.
      cached = "unmeasured";
      return cached;
    }
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    const verdict = await probeGs1Output({
      createHost: async () => {
        const host = await createHost(ctx as BaseAudioContext);
        // A muted tap: the probe must be audible to the analyser and to nothing else.
        const mute = ctx!.createGain();
        mute.gain.value = 0;
        host.output.connect(analyser);
        host.output.connect(mute);
        mute.connect(ctx!.destination);
        return host;
      },
      analyser,
    });
    cached = verdict;
    return verdict;
  } catch {
    cached = "unmeasured";
    return cached;
  } finally {
    try {
      await (ctx as AudioContext | null)?.close?.();
    } catch {
      /* already closed */
    }
  }
}
