/**
 * Can this browser's **offline** renderer actually hear the GS-1 voice?
 *
 * The question is deliberately about the offline context, because that is where the defect is: on Safari every
 * GS-1-routed lane renders silence through an `OfflineAudioContext` while the same worklet *does* run in the
 * realtime one (the live symptom there is "audible but wrong", a different defect). A realtime probe answered a
 * different question and was thrown away for it; this one renders a note the way an export does and looks at the
 * samples that come out.
 *
 * ## What it is for
 *
 * An exported stem of `chords` or `lead` on Safari is an **empty file**, and a full export keeps the drums and loses
 * all harmony and lead — because the renderer treats "a host was built for this track" as "this track is handled".
 * When this probe comes back `silent`, the exporter routes those lanes to the native engine instead: a different
 * voice, but a file with music in it, which is what the person exporting asked for.
 *
 * ## The verdicts
 *
 * `usable` and `silent` are measurements; `unmeasured` means the probe could not run (no `OfflineAudioContext`, a
 * worklet that refused to load) and changes nothing, because a probe that failed is not evidence about the engine.
 */
import { createGs1Host, type Gs1Host } from "./Gs1Host";
import type { Gs1Capability } from "./gs1Capability";

/** Peak amplitude that counts as sound when the probe's buffer is inspected. */
export const GS1_OFFLINE_PEAK_THRESHOLD = 1e-4;
/** Long enough for the attack of any patch in the library, short enough to be free. */
export const GS1_OFFLINE_PROBE_SEC = 0.25;

export interface OfflineProbeDeps {
  /** Renders one GS-1 note offline and returns the loudest sample, or throws when it cannot run at all. */
  renderPeak: () => Promise<number>;
}

/**
 * The decision, separated from the rendering so it is testable without a browser.
 *
 * `renderPeak` is injected: the real one builds an `OfflineAudioContext`, loads the worklet through `createGs1Host`,
 * plays one note and reads the rendered buffer; a test hands it a script instead.
 */
export async function probeOfflineGs1(deps: OfflineProbeDeps): Promise<Gs1Capability> {
  try {
    const peak = await deps.renderPeak();
    if (!Number.isFinite(peak)) return "unmeasured";
    return peak >= GS1_OFFLINE_PEAK_THRESHOLD ? "usable" : "silent";
  } catch {
    return "unmeasured";
  }
}

/** One verdict per page: the engine's audio stack does not change between renders, and the probe costs a wasm core. */
let cached: Gs1Capability | undefined;

export function gs1OfflineCapability(): Gs1Capability | undefined {
  return cached;
}

export function setGs1OfflineCapability(verdict: Gs1Capability): void {
  cached = verdict;
}

/** Test seam: forget the cached verdict. */
export function resetGs1OfflineCapability(): void {
  cached = undefined;
}

/** What the real probe needs from the caller's world, so the module stays free of app-wide imports. */
export interface OfflineProbeOptions {
  /** Sample rate for the probe context; the exporter's own rate keeps the comparison honest. */
  sampleRate?: number;
  /** Injected in tests; defaults to a real `OfflineAudioContext` plus this project's GS-1 host. */
  renderPeak?: () => Promise<number>;
}

/**
 * Run the probe once per page and cache it.
 *
 * The probe renders through a **throwaway** `OfflineAudioContext` with its own host, which is disposed whatever the
 * verdict: a leaked core costs the page the same WASM budget the real hosts need.
 */
export async function ensureOfflineGs1Capability(options: OfflineProbeOptions = {}): Promise<Gs1Capability> {
  if (cached) return cached;
  const renderPeak =
    options.renderPeak ??
    (async () => {
      const Ctor = (globalThis as { OfflineAudioContext?: new (channels: number, frames: number, rate: number) => OfflineAudioContext })
        .OfflineAudioContext;
      if (!Ctor) throw new Error("no OfflineAudioContext");
      const rate = options.sampleRate ?? 44100;
      const frames = Math.max(1, Math.round(rate * GS1_OFFLINE_PROBE_SEC));
      const ctx = new Ctor(1, frames, rate);
      if (typeof ctx.audioWorklet?.addModule !== "function") throw new Error("no audioWorklet on the offline context");
      let host: Gs1Host | null = null;
      try {
        host = await createGs1Host({ context: ctx });
        await host.ready;
        host.output.connect(ctx.destination);
        host.noteOn(60, 0.9);
        const rendered = await ctx.startRendering();
        const data = rendered.getChannelData(0);
        let peak = 0;
        for (let i = 0; i < data.length; i += 1) {
          const value = Math.abs(data[i]);
          if (value > peak) peak = value;
        }
        return peak;
      } finally {
        try {
          host?.dispose();
        } catch {
          /* already gone */
        }
      }
    });

  cached = await probeOfflineGs1({ renderPeak });
  return cached;
}
