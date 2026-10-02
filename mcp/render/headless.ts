/**
 * The **Node Web Audio host**: the same `renderPatternOffline`, the same worklets and the same vendored GS-1 wasm,
 * running under `node-web-audio-api` instead of Vite + Chromium.
 *
 * ## Why this is not a second renderer
 *
 * `mcp/render/worker.ts` opens with the argument that audio rendering here is genuinely a browser capability, and
 * that a renderer *rewritten* in Node would be a second sound. That argument is about a rewrite, not about a second
 * **host**: `scripts/probe_headless_parity.ts` runs the app's own `renderPatternOffline` under
 * `node-web-audio-api@2.2.0` and measures the two hosts against each other. What they do **not** yet agree on is
 * recorded in `docs/HEADLESS_CORE_PLAN.md` §8.9/§8.10 — three red sentences, 1.28 dB in band 6, 1.11 dB in band 3 and
 * 1.774 LU of loudness — and this module exists to make that gap *available and labelled*, not to hide it.
 *
 * ## The one rule this module follows
 *
 * **It never falls back.** "Silent fallback" is the failure this line of work keeps paying for: a render that quietly
 * used the other engine, or a lane that quietly went silent, is worse than an error because it looks like an answer.
 * So a missing `node-web-audio-api` throws `headlessUnavailableMessage()`, naming the package and the install command,
 * and it says in the message that the browser path was not taken.
 *
 * ## What it does to the process
 *
 * It installs the Node host's globals — `OfflineAudioContext`, `AudioWorkletNode`, `AudioWorkletProcessor` and
 * `BaseAudioContext` — once, plus a `fetch` that serves the app's **root-relative** asset URLs (`/gs1/…`) from
 * `public/`, and an `addModule` wrapper that does the same for worklet modules. Those are exactly the seams the parity
 * probe established; anything else an absolute URL is delegated to the process's own `fetch`.
 *
 * The dependency is **optional and undeclared on purpose** (`docs/HEADLESS_CORE_PLAN.md`): it is a native addon, and a
 * checkout that has not installed it must still build and run this server.
 */
import path from "node:path";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import type { SequencerPattern } from "../../src/types/genre";
import type { OfflineAudioLaneReport } from "../../src/audio/offlineAudioLanes";
// Types only: `worker.ts` loads this module dynamically, so a value import back would be a cycle.
import type { AudioLaneCatalogueRead, RenderAudioPayload, RenderOptions } from "./worker";

/** The optional package, named in one place because the message, the probe and the document all quote it. */
export const HEADLESS_PACKAGE = "node-web-audio-api";

/**
 * What a caller sees when the headless host is asked for and cannot be loaded.
 *
 * It names the package, the install command, the document — and, in its own sentence, the thing that did **not**
 * happen. A caller that asked for the Node host must not receive a Chromium render; the whole point of this entry is
 * that the two hosts are distinguishable.
 */
export function headlessUnavailableMessage(reason: unknown): string {
  const detail = reason instanceof Error ? reason.message : String(reason);
  return (
    `headless rendering needs the optional package \`${HEADLESS_PACKAGE}\`, which is not installed here (${detail}). ` +
    `Install it with \`npm i -D ${HEADLESS_PACKAGE}\`, or render without \`headless\` and pay for Vite + Chromium. ` +
    `**No browser render was started instead** — see docs/HEADLESS_CORE_PLAN.md.`
  );
}

/**
 * What the caller has to tell the host, beyond the render options.
 *
 * `publicRoot` rather than an `appRoot` lookup of its own: `appRoot()` in `worker.ts` is the single definition of where
 * this server's files are, and a second one here would be free to disagree with it.
 */
export interface HeadlessRenderContext {
  /** The app's `public/` directory: where `/gs1/workletProcessor.js` and the two wasm cores actually live. */
  publicRoot: string;
  /** The sample mirror an audio lane's bytes come from — `sampleMirrorRoot()` in `worker.ts`, passed rather than re-derived. */
  sampleRoot: string;
}

/** Whether the host's globals have been installed. The audio stack does not change between renders. */
let hostInstalled = false;

/** The process's own `fetch`, kept so the shim can delegate every URL that is not one of the app's assets. */
let originalFetch: typeof globalThis.fetch | null = null;

/**
 * Install the Node host. Idempotent, and the only place that touches process globals.
 *
 * `require` rather than a static `import`: a static specifier sends esbuild looking for the native addon at build time,
 * and the pack must build on a checkout where it is not installed. `createRequire(import.meta.url)` resolves it at the
 * moment a caller actually asks for a headless render, which is also when the error message is useful.
 */
function loadHeadlessHost(publicRoot: string): unknown {
  let wa: any;
  try {
    wa = createRequire(import.meta.url)(HEADLESS_PACKAGE);
  } catch (error) {
    throw new Error(headlessUnavailableMessage(error));
  }
  if (hostInstalled) return wa;
  hostInstalled = true;

  /**
   * The wrapper the probe established: **worklet modules are fetched by URL**, and the app asks for them at
   * `/gs1/workletProcessor.js` — a root-relative path the Node host would try to open as a filesystem path.
   */
  const RealOfflineAudioContext = wa.OfflineAudioContext;
  function HostOfflineAudioContext(this: unknown, channels: number, frames: number, sampleRate: number) {
    const context = new RealOfflineAudioContext(channels, frames, sampleRate);
    const worklet = context.audioWorklet;
    const addModule = worklet.addModule.bind(worklet);
    worklet.addModule = (url: string) =>
      addModule(url.startsWith("/") ? path.join(publicRoot, url.slice(1)) : url);
    return context;
  }
  (globalThis as any).OfflineAudioContext = HostOfflineAudioContext;
  (globalThis as any).AudioWorkletNode = wa.AudioWorkletNode;
  (globalThis as any).AudioWorkletProcessor = wa.AudioWorkletProcessor;
  (globalThis as any).BaseAudioContext = wa.BaseAudioContext;

  /**
   * The wasm cores arrive through `fetch("/gs1/synth_core.wasm")` (`src/audio/gs1/Gs1Host.ts:253`), so the shim serves
   * root-relative URLs from disk and delegates everything else. It is installed once and never restored: a render can
   * start at any moment in this server, and an absolute URL was never this shim's business.
   */
  originalFetch = originalFetch ?? globalThis.fetch;
  const delegate = originalFetch;
  (globalThis as any).fetch = async (url: unknown, init?: unknown) => {
    const target = String(url);
    if (target.startsWith("/")) {
      const bytes = readFileSync(path.join(publicRoot, target));
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      };
    }
    return (delegate as any)(url, init);
  };
  return wa;
}

/**
 * Render one pattern on the Node host and return **the same payload the browser page returns**.
 *
 * The duplication with the `page.evaluate` body in `worker.ts` is deliberate and structural: that body is serialised
 * into a browser and cannot call a Node module, so the two cannot be one function. What keeps them from drifting is
 * `RenderAudioPayload` — the shared type they must both satisfy — and the criterion that renders through this path and
 * reads the reply (`src/test/mcpHeadlessRender.test.ts`). Every option here is copied from the page's call, including
 * the solo-render shape, so a difference between the hosts stays a difference of *host* and never of *arguments*.
 */
export async function renderPatternHeadless(
  pattern: SequencerPattern,
  options: RenderOptions,
  catalogueRead: AudioLaneCatalogueRead,
  context: HeadlessRenderContext
): Promise<RenderAudioPayload> {
  loadHeadlessHost(context.publicRoot);

  /**
   * Imported **after** the globals exist, as the probe does: these modules reach for `OfflineAudioContext` when they
   * build a graph, and one of them may do it while it is being evaluated.
   */
  const [wav, mp3, loudness, metrics, catalogue] = await Promise.all([
    import("../../src/audio/WavExporter"),
    import("../../src/audio/Mp3Exporter"),
    import("../../src/test/helpers/loudness"),
    import("../../src/test/helpers/audioMetrics"),
    import("../../src/data/sampleCatalogue"),
  ]);
  const audioCatalogue = catalogueRead.text ? catalogue.catalogueFromManifestText(catalogueRead.text, context.sampleRoot).assets : [];
  const bars = Math.max(1, Math.min(64, options.bars ?? 1));

  /** The lane report, filled by the renderer rather than re-derived here — the same rule as the page's. */
  let audioLanes: OfflineAudioLaneReport = { lanes: [], events: 0, problems: [] };
  let limiterKind = "fallback";
  let gs1PatchProblems: string[] = [];
  const renderProblems: string[] = [];

  const buffer = await wav.renderPatternOffline(pattern, {
    bars,
    ...(options.sampleRate ? { sampleRate: options.sampleRate } : {}),
    ...(options.channels ? { channels: options.channels } : {}),
    ...(Number.isFinite(options.loudnessTrimDb) ? { loudnessTrimDb: options.loudnessTrimDb } : {}),
    audioLaneCatalogue: audioCatalogue,
    onAudioLanes: (report: OfflineAudioLaneReport) => {
      audioLanes = report;
    },
    onLimiterKind: (kind: string) => {
      limiterKind = kind;
    },
    onGs1PatchProblems: (problems: readonly string[]) => {
      gs1PatchProblems = [...problems];
    },
    onProblems: (problems: readonly string[]) => {
      renderProblems.push(...problems);
    },
    ...(catalogueRead.problem ? { audioLaneCatalogueProblem: catalogueRead.problem } : {}),
  });

  const channels: Float32Array[] = [];
  for (let index = 0; index < buffer.numberOfChannels; index += 1) channels.push(buffer.getChannelData(index));

  /**
   * Per-track peaks, when asked: the same isolated-render shape the page uses, including its argument set — the page
   * does not pass the sample rate to a solo render, and a second definition here would be a second behaviour.
   */
  const trackPeaksDb: Record<string, number> = {};
  if (options.trackPeaks === true) {
    for (let soloIndex = 0; soloIndex < pattern.tracks.length; soloIndex += 1) {
      const track = pattern.tracks[soloIndex]!;
      const solo = {
        ...(pattern as unknown as Record<string, unknown>),
        tracks: pattern.tracks.map((candidate, index) =>
          index === soloIndex
            ? candidate
            : {
                ...candidate,
                steps: candidate.steps.map(() => 0),
                velocity: undefined,
                ...(String(candidate.track_id).toLowerCase() === "audio" ? { sample: undefined } : {}),
              }
        ),
      };
      try {
        const soloBuffer = await wav.renderPatternOffline(solo as never, {
          bars,
          ...(audioCatalogue.length ? { audioLaneCatalogue: audioCatalogue } : {}),
        });
        const soloChannels: Float32Array[] = [];
        for (let index = 0; index < soloBuffer.numberOfChannels; index += 1) soloChannels.push(soloBuffer.getChannelData(index));
        trackPeaksDb[String(track.track_id)] = metrics.samplePeakDb(soloChannels);
      } catch {
        trackPeaksDb[String(track.track_id)] = Number.NEGATIVE_INFINITY;
      }
    }
  }

  const base64 =
    options.format === "mp3"
      ? Buffer.from(
          await (
            await mp3.encodeAudioBufferToMp3(buffer, { bitrateKbps: options.bitrateKbps ?? 192 })
          ).blob.arrayBuffer()
        ).toString("base64")
      : Buffer.from(new Uint8Array(wav.encodeAudioBufferToWav(buffer))).toString("base64");

  return {
    base64,
    durationSec: buffer.duration,
    sampleRate: buffer.sampleRate,
    channels: buffer.numberOfChannels,
    limiterKind,
    truePeakDb: loudness.truePeakDbChannels(channels),
    integratedLufs: loudness.measureLoudness(channels, buffer.sampleRate).integratedLufs,
    gs1PatchProblems,
    trackPeaksDb,
    audioLanes,
    problems: renderProblems,
  };
}
