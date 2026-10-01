/**
 * WAV Offline Exporter & Stems Renderer (P4-01 & P4-02)
 *
 * Provides bit-exact offline rendering of Groove patterns to 16-bit PCM WAV:
 * - Master stereo WAV export with master limiter
 * - Per-track stem WAV export with genre/track/BPM naming
 * - Polymeter, gate, swing, velocity, pitch and stereo panning support
 */

import { DrumPattern, Track } from "../types/genre";
import { captureRequested } from "../platform/probeHooks";
import { createZipArchive } from "../utils/zip";
import {
  DrumKitType,
  synthesizeKick,
  synthesizeSnare,
  synthesizeHiHat,
  synthesizePercussion,
  drumEnvelopeLevelAt,
  instrumentWantsPercussionVoice,
  type DrumVoiceEnvelope,
} from "./DrumKitModels";
import { playPolySynthNote, DEFAULT_SYNTH_PRESETS } from "./PolySynth";
import { resolveInstrumentPreset } from "./instrumentPresets";
import { TrackState, deriveTrackStates } from "./trackStates";
import { patternSeed, probabilityPasses, resolveRatchet, ratchetVelocityScale } from "./noteEvents";
import { polyVoiceVariation, variationSeedFrom } from "./noteVariation";
import { flattenSong } from "../data/songFlatten";
import type { Song } from "../types/song";
import { resolveKickDuckShape, scheduleKickDuck } from "./sidechain";
import { swingOffsetSeconds } from "./swing";
import {
  foldLoopTail,
  resolveRenderTailSec,
  tailFramesOf,
  RENDER_PREROLL_MAX_SEC,
} from "./renderTail";
import { ensureOfflineGs1Capability } from "./gs1/gs1OfflineCapability";
import { LOUDNESS_TRIM_MAX_DB, LOUDNESS_TRIM_MIN_DB, getGenreLoudnessTrimDb } from "../data/genreMix";
import { createSeededNoiseBuffer, noisePositionFor } from "./noise";
import {
  chordNotesForStep,
  chordVoiceGain,
  chordNoteDuration,
  soundingDuration,
  chordVoiceOnset,
} from "./chordVoicing";
import { resolveChordTreatment } from "../data/genreVoicing";
import { buildMasterGraph } from "./masterGraph";
import { stepTiming, type TempoPoint } from "../data/tempoMap";
import {
  limitBuffers,
  MASTER_LIMITER_INTERNAL_CEILING_DB,
  type MasterLimiterKind,
} from "./MasterLimiter";
import { ChannelStrip } from "./ChannelStripDsp";
import { resolveTrackInsertForGenre } from "../data/genreInsert";
import { resolveGroupBus } from "./trackBuses";
import { createGs1Host, type Gs1Host } from "./gs1/Gs1Host";
import { capPlanPolyphony, applyGs1VoiceRoutes, isGs1RoutingEnabled, planGs1Notes, patchNeedsSample, resolveGs1Lane, type Gs1Voice } from "./gs1/gs1Tracks";
import { generateTextureSample } from "./gs1/textureSample";
import { applyGenreFxToGraph, resolveGenreFx } from "../data/genreFx";
import { scheduleOfflineAudioLanes, isAudioLane, type OfflineAudioLaneReport } from "./offlineAudioLanes";
import { browserSampleLoader } from "./browserSampleGraph";
import { startSamplerNote } from "./samplerVoice";
import { SAMPLE_CATALOGUE, type SampleAsset } from "../data/sampleCatalogue";
import { bufferHasAudio, type ChannelDataBuffer } from "./renderSilence";

/**
 * **Measurement-only phase timing, and inert unless switched on.**
 *
 * `docs/RUST_DECISION.md` §五 step 2 asks where an offline render's wall clock actually goes, and the honest answer needs boundaries inside this function: an
 * `OfflineAudioContext.startRendering()` is one opaque call, so everything the graph does inside it (voice DSP, convolution, the limiter) cannot be split from
 * outside. The seams that *can* be timed are the ones in this file.
 *
 * Nothing is collected unless `globalThis.__grooveRenderTimings` is set by the caller; the flag is never set by the app. When set, each render replaces the
 * object with this render's phases under `phases`, plus the context facts a reader needs to interpret them. `performance.now()` is the only cost, and it is
 * paid whether or not anyone is listening — this is instrumentation that ships, deliberately, so the number can be reproduced with one page-headless run
 * rather than only by whoever wrote it. See `scripts/profile_offline_render.mjs`.
 */
interface RenderPhaseTimings {
  phases: Record<string, number>;
  meta?: Record<string, number | string>;
  /** `performance.now()` at the end of the most recent render, on the page's own clock — lets a driver time the gap after the promise resolved. */
  lastFinishedAt?: number;
  /**
   * Optional live progress channel: called with `(phaseName, msSincePhaseStart, msSinceRenderStart)` as each phase closes, including `phase:enter` when
   * `startRendering()` is about to be awaited. A driver that never sees `phase:enter` knows the time went into graph/scheduling work; one that sees it and then
   * waits knows the time is inside the opaque render call. Set by `scripts/profile_offline_render.mjs`; the app never sets it.
   */
  onPhase?: (name: string, ms: number, totalMs: number) => void;
}

function renderTimingSink(): RenderPhaseTimings | null {
  const sink = (globalThis as unknown as { __grooveRenderTimings?: RenderPhaseTimings }).__grooveRenderTimings;
  return sink && typeof sink === "object" && sink.phases ? sink : null;
}

export interface RenderWavOptions {
  bpm?: number;
  swing?: number;
  bars?: number;
  /**
   * **Render `bars` bars starting at this bar, instead of the first `bars` bars** — the entry point chunking needs.
   *
   * The graph is built from the offset, not rendered whole and cut: the context is only as long as the requested
   * range plus its tail, so the cost is the chunk's, which is the entire point of chunking. Everything that decides
   * *what* sounds reads the **absolute** step, so the chunk is the same music the whole render puts at those bars
   * (probability rolls, per-note variation, swing and the seeded noise read are all keyed on the absolute step
   * index; see `renderPatternOfflineOnce`).
   *
   * **A chunk is not sample-identical to the same bars of a whole render, and cannot be**: the reverb's state at the
   * boundary is fed by audio before the context starts. `preRollSec` is what closes that gap, and
   * `renderPatternChunkOffline` is the entry point that says where the boundary is — see
   * `docs/HEADLESS_CORE_PLAN.md` §②. Omitted or `0` means "start at the top", which is the existing behaviour down
   * to the float arithmetic.
   */
  fromBar?: number;
  /**
   * **Seconds of audio before `fromBar` the chunk also renders**, so the reverb (and the limiter's lookahead) are
   * already doing at the boundary what the whole render had them doing there. Defaults to the same length
   * `renderTailSec` derives from the genre's FX — i.e. one reverb impulse — and `0` removes it, which is the
   * deliberate mistake the equivalence criterion exists to catch.
   */
  preRollSec?: number;
  sampleRate?: number;
  /** 1 renders a mono analysis pass; the default is the stereo this exporter has always produced. */
  channels?: 1 | 2;
  trackStates?: TrackState[];
  stemTrackIdx?: number;
  drumKit?: DrumKitType;
  /**
   * Master loudness-match trim in dB. When omitted it is derived from the pattern's
   * `genre_id` (0 dB for custom/unknown ids), exactly like the live engine's
   * `setPattern`, so an exported master matches what the user just heard.
   */
  loudnessTrimDb?: number;
  /**
   * Absolute master makeup in dB. Omitted means the shared default
   * (`MASTER_MAKEUP_DB`), so an export is as loud as playback.
   */
  masterMakeupDb?: number;
  /** Set false to render without the mastering bus compressor (measurement tooling). */
  masterBusCompEnabled?: boolean;
  /**
   * Per-note timbre variation (P2.2/A3), on by default.
   *
   * Off renders every stab of the same note *identically*, which is what the A3 measurement needs as its control:
   * the claim is that the nudge moves a stab's colour, and the only way to show that is to render the same pattern
   * with and without it. It is also the escape hatch for anyone comparing two renders byte for byte.
   */
  noteVariation?: boolean;
  /**
   * Return a **seamless loop** rather than the render as it stands (P0.6).
   *
   * The render includes the loop's own tail — reverb and delay decay, derived from the genre's FX — which is right
   * for a file that ends and wrong for an asset that repeats. With this on, the tail is folded back over the head
   * modulo the loop length and the result is exactly the loop: playing it twice reproduces the decay the first pass
   * would have had, instead of a gap followed by a restart. Ignored when the render is shorter than the loop.
   */
  seamlessLoop?: boolean;
  /** The bus compressor's release, seconds — see `MasterGraphOptions.masterBusCompReleaseSec`. */
  masterBusCompReleaseSec?: number;
  /** The bus compressor's threshold (dB), knee (dB) and ratio — see `MasterGraphOptions`. */
  masterBusCompThresholdDb?: number;
  masterBusCompKneeDb?: number;
  masterBusCompRatio?: number;
  /**
   * Master true-peak ceiling, dBTP. The graph already accepts it for measurement tooling; forwarding it here
   * lets a probe separate "the sidechain ducked" from "the ceiling gave part of it back".
   */
  limiterCeilingDb?: number;
  /**
   * The ceiling's release ballistics, ms — measurement tooling, like `limiterCeilingDb`.
   *
   * The release is what decides whether a *dip* survives: the limiter's gain recovering while the sidechain
   * ducks the bass is the mechanism behind `duckErasedInMaster` (−4.4 dB in the sidechain, −0.4 dB in the
   * file), so separating "the duck was scheduled" from "the ceiling refilled it" needs these. Omitted, the
   * worklet keeps its shipped 80 ms / 400 ms.
   */
  limiterReleaseFastMs?: number;
  limiterReleaseSlowMs?: number;
  /**
   * Called once per render with the limiter that actually ended up in the graph.
   *
   * `createMasterLimiter` prefers an `AudioWorkletNode` and falls back to a `DynamicsCompressor`
   * when the module cannot be loaded. That fallback is silent, and it is not cosmetic: forcing it
   * measures the export **2.36 dB louder overall and 4.83 dB off in one band** (appendix G.14). A
   * renderer that quietly hands back a different file than the one just auditioned is exactly the
   * kind of claim this project does not make, so the kind is reported rather than assumed —
   * `exportMasterWav` / `exportStemsWav` carry it out to their callers.
   */
  onLimiterKind?: (kind: MasterLimiterKind) => void;
  /**
   * **The catalogue an audio lane's `sample.assetId` resolves against**, and therefore whether an offline render can mix one at all.
   *
   * The shipped catalogue is deliberately empty (see `sampleCatalogue.ts`), so omitting this leaves every audio lane unresolvable and reported — which is the
   * honest answer for a caller that has no catalogue, not a silent render. `mcp/render/worker.ts` supplies the manifest-backed one the browser session uses.
   */
  audioLaneCatalogue?: readonly SampleAsset[];
  /**
   * **Why the catalogue could not be read at all**, when the caller knows — named with the path it tried.
   *
   * Distinct from an empty catalogue: "the manifest is missing at /…/manifest.json" and "the catalogue holds no such sample" send a reader to different places, and
   * an unreadable manifest that turned into a report-free render is the silent-drop shape this reply exists to prevent.
   */
  audioLaneCatalogueProblem?: string;
  /**
   * Called once per render with which audio lanes reached the mix and which could not, each with a reason.
   *
   * A callback rather than a return value because `renderPatternOffline` resolves to an `AudioBuffer` and widening that would touch every existing caller; this is
   * the same shape `onLimiterKind` already uses, and for the same reason — a render that quietly dropped a lane has to be able to say so.
   */
  onAudioLanes?: (report: OfflineAudioLaneReport) => void;
  /**
   * Override the reverb **send** high-pass for this render, in Hz (0 disables it).
   *
   * Diagnostic: the send's low-end shaping is a global choice, so the only honest way to judge it is to render the same genre
   * twice and compare the wet band — `scripts/render_genre_wav.mjs --reverb-hpf=<hz>`. Applied **after** the genre's FX
   * profile, because that profile is written last and would otherwise overwrite it.
   */
  reverbSendHighpassHz?: number;
  /** Diagnostic: bypass the master FX rack (see `createMasterGraph`). */
  bypassFxRack?: boolean;
  /**
   * A short fade at each **section boundary** of the flattened arrangement, in milliseconds (0 disables it; 5–10 is the plan's
   * range).
   *
   * `flattenSong` returns the step index each section starts at because a section's hard mute or velocity jump is where an audio
   * boundary should be faded and the flatten is what discards that knowledge. The fade happens **here**, after rendering,
   * because this is where the samples are — the arrangement's data is not edited, which would be the wrong thing for a playback
   * concern (`docs/DAW_MCP_REFACTOR.md`, stage 3).
   */
  boundaryFadeMs?: number;
  /** The step index each section starts at, from `flattenSong`; the first is 0 and is not faded. */
  boundaries?: readonly number[];
  /** Diagnostic: the GS-1 host's output goes straight to the destination, bypassing the master graph entirely. */
  directOut?: boolean;
  /**
   * Called once per render with how many GS-1 hosts failed to load after their retries.
   *
   * `0` in every normal render. Anything else means a `chords`/`lead` track was voiced by the native
   * synth instead of GS-1, which moves the fingerprint by 0.71-3.66 dB depending on the track
   * (measured; see `GS1_HOST_LOAD_ATTEMPTS`), so the caller has to be able to say so rather than
   * ship a silently different file.
   */
  onGs1HostFailures?: (count: number) => void;
  /**
   * Called once per render with every lane whose **own GS-1 patch code** could not be used.
   *
   * A lane that carries `gs1Patch` asked for a specific sound. If that code is unreadable, the lane
   * falls back to the native engine **and this says so**, naming the lane: the alternative — the
   * `null` that `resolveGs1Patch` returns for an unrouted instrument — would make a typo change the
   * instrument in silence, which is the defect this whole surface exists to close.
   */
  onGs1PatchProblems?: (problems: readonly string[]) => void;
  /**
   * Anything about this render the caller has to know, in the same shape `mcp/arrangement.ts` uses for an
   * unresolvable lane: a plain sentence naming what happened.
   *
   * **Two different causes feed this list, and neither replaces the other.** The first is the host: a render can
   * come back with the correct frame count and **no samples in it**, and this says so when a retry recovered one
   * (`LUFS = -Infinity` used to travel out as a measurement instead, and the file was written as a successful
   * render of silence — `docs/HEADLESS_CORE_PLAN.md` §6). The second is the sample mirror: an audio lane whose
   * fetch failed on a missing CORS header used to surface as a bare "Failed to fetch", and this carries the
   * transport's own diagnosis of that (`src/audio/transportDiagnostic.ts`). A caller that sees one entry should
   * read what it says rather than assume which cause it is.
   */
  onProblems?: (problems: readonly string[]) => void;
}

/**
 * How many times a GS-1 host load is attempted before the track falls back to the native synth.
 *
 * Three, because the failure being retried is a transient fetch or module load, not a logical error:
 * a second attempt is the one most likely to succeed, and a persistent failure (no network, no
 * worklet support) is not helped by waiting longer. The point is not to make failure impossible but
 * to stop a coin-flip from silently changing what the export sounds like.
 *
 * The retry is the *second* line of defence. The first is that `fetchCore` now caches the core per
 * URL, so the fetch happens once per page instead of once per host per render — without that, this
 * constant multiplied the very traffic whose failure it exists to tolerate (600 fetches per library
 * render became 1800).
 */
const GS1_HOST_LOAD_ATTEMPTS = 3;

/**
 * Steps in one bar, for the chunk arithmetic.
 *
 * A constant rather than a lookup because that is what the renderer already is: `stepTiming` is called with the
 * default `stepsPerBar`, a tempo tick is a 16th, and a bar is sixteen of them. `scalePlanToBars` and the MIDI
 * exporters use the same 16, and a bar offset that disagreed with them would put a chunk boundary somewhere other
 * than the bar line the arrangement is written on.
 */
const STEPS_PER_BAR = 16;

export interface ExportedWav {
  blob: Blob;
  filename: string;
  durationSec: number;
  /**
   * Which master limiter the bounce actually went through.
   *
   * `"fallback"` means the true-peak limiter could not load and a `DynamicsCompressor` was used
   * instead, which measures 2.36 dB louder overall and 4.83 dB off in one band (G.14). Callers are
   * expected to tell the user rather than ship a silently degraded file.
   */
  limiterKind: MasterLimiterKind;
  /**
   * GS-1 hosts that failed to load after retrying; `0` in every normal export.
   *
   * Non-zero means one or more `chords`/`lead` tracks were voiced by the native synth instead, which
   * is audible (0.71-3.66 dB in a band, measured) and must not be reported as a clean export.
   */
  gs1HostFailures: number;
  /**
   * **True when the page this export ran in had no worklets at all** — the non-secure-origin case, not a failed load.
   *
   * `limiterKind === "fallback"` cannot tell the two apart: a secure origin whose worklet module fetch failed also reports
   * the fallback, and that one *can* be retried. This flag is the origin fact, so the caller can say the true thing:
   * open the app over https, `localhost` or `127.0.0.1`, and stop suggesting a retry that cannot help.
   */
  workletsUnavailable: boolean;
  /**
   * Lanes whose own GS-1 patch code was refused, each named (`chords: …`). Empty in every normal
   * export; non-empty means that lane was voiced by the native engine **and the export says so**.
   */
  gs1PatchProblems: string[];
  /**
   * **The bar range this file is, when it is a chunk.** Absent for a whole export.
   *
   * Named because the file's own name says it too (`…_bars4-8.wav`): a chunk handed back without its range is a file
   * whose place in the piece a caller has to remember, and a caller that merges the wrong two files has no symptom
   * until somebody listens to the seam.
   */
  fromBar?: number;
  toBar?: number;
}

export interface ExportedStem {
  blob: Blob;
  filename: string;
  trackName: string;
  trackIdx: number;
  /** GS-1 hosts that failed to load for this stem's render; `0` normally. See `ExportedWav`. */
  gs1HostFailures: number;
  /** This stem's refused patch codes, each naming the lane. See `ExportedWav`. */
  gs1PatchProblems: string[];
  /** True when this stem's render had no worklets at all (a non-secure origin). See `ExportedWav`. */
  workletsUnavailable: boolean;
}

/**
 * Encodes an AudioBuffer into 16-bit PCM stereo WAV format (RIFF)
 */
export function encodeAudioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  const leftChannel = buffer.getChannelData(0);
  const rightChannel = numChannels > 1 ? buffer.getChannelData(1) : leftChannel;
  const numSamples = leftChannel.length;
  const dataSize = numSamples * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // RIFF chunk descriptor
  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");

  // "fmt " sub-chunk
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, format, true); // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // ByteRate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  // "data" sub-chunk
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  // Interleave samples
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    // Left sample clamp & convert
    let sL = Math.max(-1, Math.min(1, leftChannel[i] || 0));
    const intL = sL < 0 ? sL * 0x8000 : sL * 0x7fff;
    view.setInt16(offset, intL, true);
    offset += 2;

    // Right sample clamp & convert — only when the buffer really is stereo.
    // F-10: writing a second channel into a mono allocation used to overflow the
    // DataView (RangeError) and lose the whole export.
    if (numChannels > 1) {
      let sR = Math.max(-1, Math.min(1, rightChannel[i] || 0));
      const intR = sR < 0 ? sR * 0x8000 : sR * 0x7fff;
      view.setInt16(offset, intR, true);
      offset += 2;
    }
  }

  return arrayBuffer;
}

function midiToFreq(midiNote: number | null | undefined, fallback = 60): number {
  const note = midiNote !== undefined && midiNote !== null && midiNote > 0 ? midiNote : fallback;
  return 440 * Math.pow(2, (note - 69) / 12);
}

/**
 * How many attempts a render gets before a silent result is treated as the answer.
 *
 * The failure this retries is the host's, not the pattern's: on `node-web-audio-api@2.2.0` a render can return a
 * buffer of the correct length with **nothing in it** (`docs/HEADLESS_CORE_PLAN.md` §6), and other renders in the
 * same process are fine, so a second attempt is the one most likely to succeed — the same reasoning as
 * `GS1_HOST_LOAD_ATTEMPTS` above. Four, not two, because the event is rare enough that a single retry leaves a
 * measurable residue, and a silent render costs nothing but time (there is no audio to keep).
 */
export const RENDER_SILENCE_ATTEMPTS = 4;

/**
 * Whether this render is allowed to produce a silent buffer, and why — the renderer's own verdict on its silence.
 *
 * A silence guard that only asked "are there samples?" would be wrong in one reachable case, and it is
 * `13da133`'s audio-lane work that makes it reachable: a pattern whose only sound is an audio lane, with a sample
 * that could not be resolved, is **supposed** to render silence — and the lane plan already states which lane and
 * why (`OfflineAudioLaneReport.problems`). Refusing that buffer would replace a named, actionable reason
 * ("no sample \"probe-impulse\" in the catalogue") with "the host returned a silent render", which is a worse
 * answer and the exact opposite of what the lane report exists for.
 *
 * So the guard has three outcomes, not two: audio; silence that something has *explained*; and silence nothing
 * explained, which is the host defect and gets retried and then refused.
 */
export interface SilenceContext {
  /** True when the render had no sound source that could have produced audio at all. */
  expectSilence: boolean;
  /** The explanation to carry in the problem text, when `expectSilence` is true. */
  reason?: string;
}

/**
 * A render, with the one failure that cannot be told from a quiet passage by any number: **no samples**.
 *
 * `renderPatternOfflineOnce` is the whole renderer; this is the thin seam that asks whether it produced any sound,
 * retries when it did not, and says so through `problems`. It is separate so the decision is testable with an
 * injected render function instead of a host that fails at random. `silenceContext` is asked **after** a silent
 * render only, so a healthy render never pays for the question — and it is a function because the answer (did every
 * audio lane fail?) is not known until the render has planned its lanes.
 */
export async function renderPatternOfflineGuarded<B extends ChannelDataBuffer>(
  renderOnce: () => Promise<B>,
  problems: string[] = [],
  attempts: number = RENDER_SILENCE_ATTEMPTS,
  getSilenceContext?: () => SilenceContext | null
): Promise<B> {
  return guardRenderAgainstSilence(
    renderOnce,
    (buffer) => bufferHasAudio(buffer),
    (buffer) => `${buffer?.length ?? 0} frames, ${buffer?.numberOfChannels ?? 0} channel(s)`,
    problems,
    attempts,
    getSilenceContext
  );
}

/**
 * The same guard, for a render whose result is not the buffer — the chunk entry point, whose `RenderedChunk` carries
 * its timeline next to its samples.
 *
 * The alternative was to make `RenderedChunk` itself answer `numberOfChannels`/`length`/`getChannelData` so it could
 * satisfy `ChannelDataBuffer`, and that would have been a lie of a useful kind: a chunk is not a buffer, and hiding
 * the timeline behind a buffer-shaped proxy is what makes a caller forget the pre-roll is in there.
 */
async function renderChunkGuarded(
  renderOnce: () => Promise<RenderedChunk>,
  problems: string[] = [],
  attempts: number = RENDER_SILENCE_ATTEMPTS,
  getSilenceContext?: () => SilenceContext | null
): Promise<RenderedChunk> {
  return guardRenderAgainstSilence(
    renderOnce,
    (chunk) => bufferHasAudio(chunk.buffer),
    (chunk) => `${chunk?.buffer.length ?? 0} frames, ${chunk?.buffer.numberOfChannels ?? 0} channel(s)`,
    problems,
    attempts,
    getSilenceContext
  );
}

/**
 * **The silence guard itself**, once, over whatever a render returns.
 *
 * `hasAudio`, `describe` and `getSilenceContext` are the three questions the decision needs, and they are asked in
 * this order on purpose: a silent render is only re-rendered after the renderer has been given the chance to explain
 * it, so an unresolvable audio lane is named once instead of rendering the same nothing four times.
 */
async function guardRenderAgainstSilence<B>(
  renderOnce: () => Promise<B>,
  hasAudio: (buffer: B) => boolean,
  describe: (buffer: B | null) => string,
  problems: string[],
  attempts: number,
  getSilenceContext?: () => SilenceContext | null
): Promise<B> {
  const limit = Math.max(1, Math.floor(attempts));
  let buffer: B | null = null;
  for (let attempt = 1; attempt <= limit; attempt += 1) {
    buffer = await renderOnce();
    if (hasAudio(buffer)) return buffer;
    /**
     * Silence that the render itself explained is the answer, not a failure.
     *
     * Asked on the first silent attempt, before any retry: a host that failed is silent for no stated reason, while
     * an unresolvable lane is silent *and* named. Retrying the latter would render the same nothing four times.
     */
    const verdict = getSilenceContext?.();
    if (verdict?.expectSilence) {
      problems.push(
        `the render is silent because it had no sound source: ${verdict.reason ?? "every lane was reported as not playable"}`
      );
      return buffer;
    }
    if (attempt < limit) {
      problems.push(
        `the audio host returned a silent render on attempt ${attempt} of ${limit} ` +
          `(correct length, no samples); retrying`
      );
    }
  }
  /**
   * Still nothing after every attempt: throw rather than return the buffer.
   *
   * This is the product decision, and it is the same one the parity probe makes when it refuses to score a silent
   * render. A buffer of zeros is not a render that can be handed back as a file — any caller that treats it as one
   * (a WAV, an MP3, an MCP reply) reports a successful render of something nobody can hear. The message carries the
   * frame count so the failure is distinguishable from "the pattern was empty": the length is right and the samples
   * are missing.
   */
  throw new Error(
    `the audio host returned a silent render ${limit} time(s) in a row ` +
      `(${describe(buffer)}, no samples above ` +
      `-120 dBFS) — refusing to present it as a successful render; see docs/HEADLESS_CORE_PLAN.md §6`
  );
}

/**
 * **Whether this context can host worklets at all** — so a render can say when it could not, instead of quietly
 * producing a different master.
 *
 * `AudioWorklet` is exposed only in a **secure context** (`docs/WORKLET_AVAILABILITY.md`): `https`, `localhost` and
 * `127.0.0.1` are potentially trustworthy, a plain-HTTP LAN address is not. Measured on the same Playwright Chromium
 * this app is driven by: `about:blank` and `http://<LAN-IP>:<port>` have `ctx.audioWorklet === undefined`, while
 * `http://127.0.0.1:<port>` has it as an object with `addModule`. On the missing side the master limiter silently
 * falls back to a `DynamicsCompressor` (no true-peak ceiling, no lookahead) and GS-1 lanes are voiced by the native
 * engine, and the measured cost of the limiter fallback alone is 2.36 dB louder overall and 4.83 dB off in one band
 * (appendix G.14).
 *
 * **This asks the context, not `limiterKind`.** A worklet-capable context whose module fetch fails also renders on
 * the fallback, and that is a different, transient fact `onLimiterKind` already reports. Keying this warning on
 * `limiterKind` would make it fire on every module-load flake — a warning that always fires, which this project
 * treats as noise. Keying it on the context makes it fire exactly when the origin cannot have worklets at all.
 */
export function offlineWorkletsAvailable(ctx: BaseAudioContext): boolean {
  const worklet = (ctx as BaseAudioContext & { audioWorklet?: AudioWorklet }).audioWorklet;
  return typeof worklet?.addModule === "function";
}

/**
 * The problem a render reports when its context had no worklets — one sentence, shared by the MCP reply and the
 * app's own export, so the two surfaces cannot describe the same render differently.
 *
 * It names the cause (the origin, not a failed load), the two things that were substituted, and where to go instead,
 * because "the true-peak limiter could not load" is the wrong story here: on a non-secure origin retrying cannot help.
 */
export const WORKLETS_UNAVAILABLE_PROBLEM =
  "the render ran without audio worklets: this context has no AudioWorklet, which a browser exposes only in a secure context (https, localhost or 127.0.0.1 — not a plain-HTTP LAN address), so the master limiter was a DynamicsCompressor with no true-peak ceiling or lookahead and GS-1 lanes were voiced by the native engine instead of the synth";

/**
 * **One chunk of a render, with the timeline that says how to put it back together.**
 *
 * The buffer is the **pre-roll plus the requested bars plus the tail**, not the requested bars alone — because the
 * pre-roll is not part of the piece. It is the audio the graph needed in order to already be in the right state at
 * the boundary, and the caller's merge is what consumes it: frames `[preRollFrames, chunkEndFrame)` are this chunk's
 * own audio, and the pre-roll overlaps the previous chunk's tail so the two can be crossfaded.
 *
 * Reporting the coordinates rather than trimming them off is deliberate. A caller that is handed a trimmed buffer
 * cannot crossfade, cannot tell a chunk that used its pre-roll from one that was cut at the boundary, and cannot
 * verify the alignment it just paid for. `usedPreRoll` is the field the equivalence criterion reads: it is `false`
 * exactly for the render that dropped the pre-roll, which is the mistake this whole entry point exists to prevent.
 */
export interface RenderedChunk {
  buffer: AudioBuffer;
  /** The bar the requested range starts at. */
  fromBar: number;
  /** The bar it stops **before**. */
  toBar: number;
  sampleRate: number;
  /** Frames of the buffer that precede the requested bar: how much of the buffer is warm-up rather than music. */
  preRollFrames: number;
  /**
   * The requested bar starts here **in the buffer's own frames** — and that is always `preRollFrames`, because the
   * buffer's first frame is the pre-roll's first frame, not the piece's. It is stated separately from
   * `preRollFrames` because the two answer different questions (`preRollFrames` is "how much warm-up",
   * `barStartFrame` is "where the music begins"), and a merge needs the second one by name.
   */
  barStartFrame: number;
  /**
   * The chunk's own audio stops here, **in the buffer's own frames**: frames after it are the tail.
   *
   * An offset, like `preRollFrames` and `barStartFrame`, and deliberately not a length. The first version returned
   * the requested range's *length*, which reads the same for the first chunk and is off by the pre-roll for every
   * later one — and it is consumed by `trimChunkFrames(preRollFrames, chunkEndFrame)`, which wants offsets.
   */
  chunkEndFrame: number;
  /** The tail the renderer added after the last step, seconds. */
  tailSec: number;
  /** Seconds from the context's start to the requested bar. */
  barStartSeconds: number;
  /** True when the caller's pre-roll actually bought audio before `fromBar`. */
  usedPreRoll: boolean;
}

/**
 * Synthesizes a pattern offline via OfflineAudioContext
 */
export async function renderPatternOffline(
  pattern: DrumPattern,
  options: RenderWavOptions = {}
): Promise<AudioBuffer> {
  return (await renderPatternOfflineInternal(pattern, options, false)) as AudioBuffer;
}

/**
 * **Renders one bar range as a chunk** — the entry point `RenderWavOptions.fromBar` describes, plus the timeline a
 * merge needs.
 *
 * `renderPatternOffline` is unchanged for every existing caller; this is the same renderer with the window it built
 * handed back instead of thrown away.
 */
export async function renderPatternChunkOffline(
  pattern: DrumPattern,
  options: RenderWavOptions = {}
): Promise<RenderedChunk> {
  return (await renderPatternOfflineInternal(pattern, options, true)) as RenderedChunk;
}

async function renderPatternOfflineInternal(
  pattern: DrumPattern,
  options: RenderWavOptions = {},
  wantChunk: boolean
): Promise<AudioBuffer | RenderedChunk> {
  const problems: string[] = [];
  /**
   * The render's own verdict on whether silence was the expected outcome.
   *
   * `null` means "no explanation", which is the host-failure reading. It is written by the audio-lane scheduling
   * inside `renderPatternOfflineOnce` when every lane was named as unplayable, and read by the guard only after a
   * render came back with no samples — see `SilenceContext`.
   */
  let verdict: SilenceContext | null = null;
  /**
   * What the context the render actually built could do, written by `renderPatternOfflineOnce` and read here.
   *
   * `null` until a context exists: a render that never got as far as one has no origin fact to report.
   */
  let workletsAvailable: boolean | null = null;
  try {
    /**
     * **Two guards over one renderer, and the duplication is the types', not the logic's.**
     *
     * `renderPatternOfflineGuarded` is generic over the buffer shape an `AudioBuffer` satisfies; a chunk is not one,
     * so the chunk path asks the same shared decision (`guardRenderAgainstSilence`) with the chunk's own "is there
     * audio" question. Written as two inlined calls rather than one shared `renderOnce` closure because TypeScript
     * infers that closure's type from its first use, which is what made the second call fail to compile.
     */
    if (wantChunk) {
      return await renderChunkGuarded(
        () =>
          renderPatternOfflineOnce(
            pattern,
            options,
            (v) => { verdict = v; },
            (available) => { workletsAvailable = available; }
          ),
        problems,
        RENDER_SILENCE_ATTEMPTS,
        () => verdict
      );
    }
    return (await renderPatternOfflineGuarded<ChannelDataBuffer>(
      () =>
        renderPatternOfflineOnce(
          pattern,
          options,
          (v) => { verdict = v; },
          (available) => { workletsAvailable = available; }
        ).then((chunk) => chunk.buffer),
      problems,
      RENDER_SILENCE_ATTEMPTS,
      () => verdict
    )) as AudioBuffer;
  } finally {
    /**
     * The origin fact comes first, because it is the reason the file is a different thing rather than a quiet one.
     * It is added here — outside the render loop — so a retried silent render cannot repeat it four times.
     */
    if (workletsAvailable === false) problems.unshift(WORKLETS_UNAVAILABLE_PROBLEM);
    /**
     * Reported on the way out either way: a recovered retry is a problem the caller should see, and a render that
     * never produced audio is one the caller will see as the thrown error — but the attempts that failed before it
     * are still worth naming, so the message and the problem list agree.
     */
    if (problems.length > 0) options.onProblems?.(problems);
  }
}

/**
 * **Where one chunk of a piece begins and ends, in steps, seconds and frames** — resolved before a context exists so
 * the arithmetic is provable without a browser.
 *
 * `fromStep` is absolute: it is the step index the whole render would have given the requested bar, so everything the
 * schedule keys on an absolute step (probability, per-note variation, swing, the seeded noise read) is unchanged.
 * `barStartSeconds` is what turns those absolute times into the chunk context's local ones.
 */
export interface ChunkRenderWindow {
  /** The absolute step the requested bar starts at (`fromBar * stepsPerBar`), or 0 for a whole render. */
  fromStep: number;
  /** Exclusive end: the absolute step the requested range stops at. */
  toStep: number;
  /** Seconds from the start of the context to the requested bar — 0 for a whole render. */
  barStartSeconds: number;
  /** Frames of audio rendered before `barStartSeconds` (0 for a whole render). */
  preRollFrames: number;
  /** `barStartSeconds` in frames; the returned buffer's frame 0. */
  barStartFrame: number;
  /** Context frames: the pre-roll, the requested range and the tail. */
  contextFrames: number;
  /** `contextFrames / sampleRate`. */
  contextSeconds: number;
}

/** The inputs `computeRenderWindow` needs — the ones the renderer has already resolved. */
export interface RenderWindowInput {
  fromBar?: number;
  bars: number;
  bpm: number;
  sampleRate: number;
  stepDur: number;
  /**
   * Steps in **one bar**. Deliberately not `patternSteps`: for a flat pattern's own length and steps-per-bar are the
   * same number, and using the flat length here made a 2-bar chunk of a 4-bar pattern 8 bars long — the whole point of
   * a `fromBar` that a probe caught before it reached a file.
   */
  stepsPerBar: number;
  tailSec: number;
  preRollSec?: number;
  timing: { starts: number[]; total: number } | null;
}

/**
 * The chunk window, or `null` when the render starts at bar 0.
 *
 * `null` rather than a window with zeros in it, deliberately: the whole-render path then keeps its own expressions
 * verbatim and byte-identity stays a property of the source rather than of arithmetic that happens to cancel. See the
 * note in `stepTiming` for the same decision made for the same reason.
 *
 * `preRollSec` defaults to the render's own tail — one reverb impulse. That is the length that makes the convolution
 * at the boundary see the whole history it saw before: the impulse is built to reach −60 dB at `decaySec` and then
 * stops, so a pre-roll shorter than it loses the loudest part of the tail and a longer one buys silence. The cap is
 * `RENDER_PREROLL_MAX_SEC`, so a caller's literal number cannot allocate an unbounded context.
 */
export function computeRenderWindow(input: RenderWindowInput): ChunkRenderWindow | null {
  const fromBar = Number.isFinite(input.fromBar) ? Math.max(0, Math.floor(input.fromBar as number)) : 0;
  if (fromBar <= 0) return null;
  const barStartStep = fromBar * input.stepsPerBar;
  const startStep = Math.min(barStartStep, Math.max(0, input.timing ? input.timing.starts.length - 1 : Infinity));
  const spanSteps = Math.round(input.stepsPerBar * Math.max(1, input.bars));
  const barStartSeconds = input.timing ? input.timing.starts[startStep]! : barStartStep * input.stepDur;
  const preRollRequested = Number.isFinite(input.preRollSec) ? Math.max(0, input.preRollSec as number) : input.tailSec;
  const preRollSec = Math.min(preRollRequested, RENDER_PREROLL_MAX_SEC);
  const contextSeconds = preRollSec + spanSteps * input.stepDur + input.tailSec;
  const preRollFrames = Math.ceil(preRollSec * input.sampleRate);
  return {
    fromStep: startStep,
    toStep: startStep + spanSteps,
    barStartSeconds,
    preRollFrames,
    /**
     * In the **buffer's** frames, which is `preRollFrames` — the buffer starts at the pre-roll, so the music cannot
     * start anywhere else. Kept as its own field so a caller reads a name rather than repeating the equality.
     */
    barStartFrame: preRollFrames,
    contextFrames: Math.ceil(contextSeconds * input.sampleRate),
    contextSeconds,
  };
}

/** The renderer itself: one context, one graph, one `startRendering()`. Wrapped by `renderPatternOffline`. */
async function renderPatternOfflineOnce(
  pattern: DrumPattern,
  options: RenderWavOptions = {},
  /** Called with this attempt's silence verdict the moment the lane plan knows it. */
  onSilenceContext?: (verdict: SilenceContext) => void,
  /**
   * Called once, as soon as the context exists, with whether it can host worklets. `renderPatternOffline` turns a
   * `false` into `WORKLETS_UNAVAILABLE_PROBLEM`; this function does not report it itself, because the guard owns
   * the problem list and a render that retries must not report the same origin fact once per attempt.
   */
  onWorkletsAvailable?: (available: boolean) => void
): Promise<RenderedChunk> {
  const sampleRate = options.sampleRate || 44100;
  // F-10: clamp render parameters — a negative bpm produced a negative
  // `lengthInSamples`, and an unbounded `bars` could allocate gigabytes.
  const bpm = Math.max(20, Math.min(300, options.bpm || pattern.bpm || 120));
  const bars = Math.max(1, Math.min(64, Math.floor(options.bars || 1)));
  const baseSwing = options.swing !== undefined
    ? (options.swing > 1 ? options.swing / 100 : options.swing)
    : (pattern.swing ? (pattern.swing > 1 ? pattern.swing / 100 : pattern.swing) : 0);
  const swing = Math.max(0, Math.min(0.75, baseSwing));
  const stepDur = 60 / bpm / 4;
  /**
   * A tempo map, if the pattern carries one (owner decision 2b) — read defensively, the way `totalSteps` already is a few lines below.
   *
   * **The no-map path is the existing code, not a generalisation that reduces to it.** `Σ (n copies of c)` and `n * c` are the same real number and not always
   * the same float, so a prefix sum used unconditionally would move the total duration and every event time in the last bits; the determinism probe resolves
   * 0.005 dB and would notice. Branching keeps byte-identity a property of the source.
   */
  const patternTempo = (pattern as { tempoTrack?: TempoPoint[] }).tempoTrack ?? [];
  const tempoAware = patternTempo.length > 0;
  const stepTimeAt = (step: number): number => (timing ? timing.starts[step]! : step * stepDur);
  const stepLengthAt = (step: number): number => (timing ? timing.lengthAt(step) : stepDur);
  const patternSteps =
    (pattern as any).totalSteps && (pattern as any).totalSteps > 0
      ? (pattern as any).totalSteps
      : pattern.tracks[0]?.steps.length || 16;
  const totalSteps = patternSteps * bars;
  // P0.6: the tail is the pattern's own reverb/delay decay, not a fixed 0.6 s. `genreFx` is resolved a few
  // lines below for the graph; resolve it here first so the render length can depend on it.
  const tailGenreFx = resolveGenreFx(pattern.genre_id);
  const tailSec = resolveRenderTailSec(tailGenreFx, bpm);
  const timing = tempoAware
    ? stepTiming(
        { bpm, tempoTrack: patternTempo },
        Math.max(totalSteps, (options.fromBar ? Math.floor(options.fromBar) * patternSteps : 0) + patternSteps * bars)
      )
    : null;
  const totalDurationSec = (timing ? timing.total : totalSteps * stepDur) + tailSec;
  /**
   * **The chunk window** — the one place "from bar N" becomes coordinates, and `null` whenever the render starts at
   * bar 0. `null` is not a special case of the window; it is the *absence* of one, so the whole-render path below
   * keeps its expressions verbatim (the same reason `stepTiming` branches instead of generalising).
   *
   * The context starts `preRollFrames` before the requested bar, is exactly as long as the requested range plus the
   * tail, and every scheduled time is shifted by `barStartSeconds`, so the returned buffer's frame 0 is the start of
   * the **pre-roll** and the requested bar lands at `preRollFrames`. Nothing is rendered and then sliced except that
   * shift — the cost is the chunk's.
   */
  const chunkWindow = computeRenderWindow({
    fromBar: options.fromBar,
    bars,
    bpm,
    sampleRate,
    stepDur,
    stepsPerBar: STEPS_PER_BAR,
    tailSec,
    preRollSec: options.preRollSec,
    timing,
  });
  const contextDurationSec = chunkWindow ? chunkWindow.contextSeconds : totalDurationSec;

  const OfflineContextClass =
    (typeof window !== "undefined" && (window.OfflineAudioContext || (window as any).webkitOfflineAudioContext)) ||
    (globalThis as any).OfflineAudioContext;

  if (!OfflineContextClass) {
    throw new Error("OfflineAudioContext is not supported in this environment");
  }

  const lengthInSamples = Math.ceil(contextDurationSec * sampleRate);
  /**
   * The step range this context actually schedules: the whole pattern for a whole render, and only the requested
   * bars for a chunk. `scheduleFrom`/`scheduleTo` are absolute every time, so the per-step decisions that index
   * themselves (probability, variation, noise position, swing) read the same step they read in a whole render.
   *
   * Without a window this is `0` and `totalSteps`, which is exactly what the loop used to say.
   */
  const scheduleFrom = chunkWindow ? chunkWindow.fromStep : 0;
  const scheduleTo = chunkWindow ? chunkWindow.toStep : totalSteps;
  /** The chunk's own scheduled length in steps; the loop and `seamlessLoop` are both shorter without a tail. */
  const scheduledSteps = scheduleTo - scheduleFrom;
  /**
   * The chunk's own length in **seconds**, ignoring the tail — what `seamlessLoop` folds over, and what
   * `chunkEndFrame` reports.
   *
   * Deliberately not `timing.starts[toStep] - barStartSeconds`: that is the chunk's length only in absolute time,
   * and `barStartSeconds` is the *step* origin too, so the subtraction cancels the bar start and returns one bar
   * (measured: `chunkEndFrame` 88200 = 2 s where the chunk renders 4 s). The scheduled span in steps times the
   * step's own length is the context's own arithmetic, from the same `stepLengthAt` the notes are placed with.
   */
  const chunkLoopSec = chunkWindow
    ? Array.from({ length: scheduledSteps }, (_, index) => stepLengthAt(scheduleFrom + index)).reduce(
        (total, length) => total + length,
        0
      )
    : totalSteps * stepDur;
  /** What a chunk render shifts every absolute schedule time by; 0 for a whole render. */
  const timelineOffsetSec = chunkWindow ? chunkWindow.barStartSeconds : 0;
  /**
   * One channel or two, and an **analysis** render may ask for one: the exporter has always produced stereo, and a mono context is a
   * different graph (panning and stereo effects collapse), so this is offered for measurement rather than for delivery. The same
   * reasoning as `sampleRate`: fewer samples, honestly rendered, rather than a stereo file relabelled.
   */
  const channelCount = options.channels === 1 ? 1 : 2;

  /**
   * The phase clock, off unless a caller asked for it. `phases` accumulates across every `renderPatternOffline` call on the page (stems are `n` calls, so the
   * same names gain `n` entries).
   */
  const timings = renderTimingSink();
  const renderStartedAt = performance.now();
  let phaseStart = renderStartedAt;
  const mark = (name: string): void => {
    if (!timings) return;
    const now = performance.now();
    timings.phases[name] = (timings.phases[name] ?? 0) + (now - phaseStart);
    timings.onPhase?.(name, now - phaseStart, now - renderStartedAt);
    phaseStart = now;
  };

  const ctx = new OfflineContextClass(channelCount, lengthInSamples, sampleRate);
  mark("context:create");
  /**
   * The origin's own answer, read off the context the render will really use — see `offlineWorkletsAvailable`.
   */
  onWorkletsAvailable?.(offlineWorkletsAvailable(ctx as BaseAudioContext));

  // Genre loudness-match trim. Applied through the shared graph below so the offline
  // renderer uses the *same* stage, in the same relative position, as playback.
  const loudnessTrimDb = Math.max(
    LOUDNESS_TRIM_MIN_DB,
    Math.min(
      LOUDNESS_TRIM_MAX_DB,
      options.loudnessTrimDb !== undefined && Number.isFinite(options.loudnessTrimDb)
        ? options.loudnessTrimDb
        : getGenreLoudnessTrimDb(pattern.genre_id)
    )
  );

  // E-17 / N-16: the bounce now renders through the SAME master graph as playback —
  // fader → FX rack → loudness trim → true-peak limiter — and, crucially, through the same reverb
  // and delay sends. Previously the exporter had neither sends nor an FX rack, so the
  // per-genre `sendA`/`sendB` values (curated for all 159 genres) and anything the user
  // dialled into FLT/DRIVE/CHORUS/LO-FI simply did not reach the file. It also used a
  // 0.85 fader against the live engine's 0.8, an unrelated ~0.5 dB offset; both now come
  // from `MASTER_FADER_DEFAULT`.
  const graph = buildMasterGraph(ctx, {
    loudnessTrimDb,
    // Diagnostic only; see the note in `createMasterGraph`'s chain wiring.
    bypassFxRack: options.bypassFxRack,
    // The graph owns the detector bus (A2): the worklet compressor's second input, tapped per lane *before* its duck
    // gain so a deliberate dip is not mistaken for a quiet passage. See `busCompDetectorInput` for why it is not
    // created here.
    busCompDetector: "internal",
    // …and the same pre-duck bus for the ceiling's detector: at the operating point the trims set, the ceiling is
    // what eats the duck (measured: file median −0.2 dB against a −4.36 dB sidechain).
    limiterDetector: "internal",
    masterMakeupDb: options.masterMakeupDb,
    masterBusCompEnabled: options.masterBusCompEnabled,
    masterBusCompReleaseSec: options.masterBusCompReleaseSec,
    masterBusCompThresholdDb: options.masterBusCompThresholdDb,
    masterBusCompKneeDb: options.masterBusCompKneeDb,
    masterBusCompRatio: options.masterBusCompRatio,
    limiterCeilingDb: options.limiterCeilingDb,
    limiterReleaseFastMs: options.limiterReleaseFastMs,
    limiterReleaseSlowMs: options.limiterReleaseSlowMs,
  });

  // N-14: the genre's master FX and bus character, applied through the same shared
  // applier the live engine uses, at the same *playing* tempo (never the metadata
  // `default_bpm`). An unknown/custom genre resolves to null and the graph keeps its
  // defaults, exactly as playback does.
  if (tailGenreFx) applyGenreFxToGraph(graph, tailGenreFx, bpm);
  if (typeof options.reverbSendHighpassHz === "number") {
    // Last, on purpose: `applyGenreFxToGraph` writes the genre's own reverb profile.
    graph.reverb.setParams({ sendHighpassHz: options.reverbSendHighpassHz });
  }
  /**
   * Echo the value the bus ended up with, for probes.
   *
   * The A/B flag (`--reverb-hpf`) exists so the send shaping can be judged rather than asserted, and the first attempt at that
   * measurement produced two byte-identical files — which is only interpretable if the effective value is visible. This is the
   * same diagnostic pattern as the GS-1 capture flag.
   */
  (globalThis as unknown as { __reverbHpfEffective?: number }).__reverbHpfEffective = graph.reverb.getParams().sendHighpassHz;
  mark("graph:master+genreFx");
  if (timings) {
    const p = graph.reverb.getParams();
    timings.meta = {
      // The IR is the convolver's whole memory footprint and its build is on this thread; a reader needs both to interpret `graph:master+genreFx`.
      reverbDecaySec: p.decaySec,
      reverbEnabled: String(p.enabled),
      reverbImpulseBuilds: graph.reverb.getImpulseBuildCount(),
      reverbImpulseFrames: graph.reverb.getImpulse()?.length ?? 0,
      sampleRate,
      channels: channelCount,
      lengthInSamples,
      totalSteps,
      bars,
      bpm,
    };
  }

  /**
   * The reverb-convolution ablation arm of `scripts/profile_offline_render.mjs`, and inert without that script.
   *
   * A `ConvolverNode` is the one stage in the offline graph whose cost is not a function of the pattern (it is a function of the impulse's length and the render's
   * length), and it is also the one stage `ReverbBus.setParams` cannot remove — so isolating it needs this. Read and applied **after** the metadata above, so the
   * record still describes the real impulse; the page sets the flag for exactly one render arm and clears it again.
   */
  const ablation = (globalThis as unknown as { __grooveRenderAblation?: string }).__grooveRenderAblation;
  if (ablation === "reverb-convolution") graph.reverb.replaceImpulseWithSilence();
  if (timings) timings.meta = { ...(timings.meta ?? {}), ablation: ablation ?? "none" };

  // V-01: the same seeded generator the live engine uses. `Math.random()` here meant an
  // export never matched the audition it was rendered from, which broke the project's
  // exporter-parity guarantee and made every render irreproducible.
  const noiseBuf = createSeededNoiseBuffer(ctx, 2);
  mark("noise:seedBuffer");

  // Pre-configure track channel strips (Gain + Stereo Panner).
  // F-03: when the caller does not supply mixer state we derive it from the pattern
  // itself (same helper the live engine uses), so a rendered master honours
  // mute / solo / volume / pan instead of silently exporting everything at 0.8 centre.
  const mixerStates: TrackState[] = options.trackStates ?? deriveTrackStates(pattern);
  const trackStrips: Array<{
    gain: GainNode;
    duckGain: GainNode;
    polarity: GainNode;
    pan: StereoPannerNode;
    /** E-10: the same pre-fader insert chain the live engine builds. */
    insert: ChannelStrip;
  }> = [];
  const numTracks = pattern.tracks.length;
  // Hoisted above the strip loop because the send taps below need to know whether the
  // track is silenced — the live engine zeroes a muted/soloed-out track's sends too.
  const anySolo = mixerStates.some((s) => s.solo);
  const silenced = (state: TrackState): boolean => Boolean(state.mute) || (anySolo && !state.solo);
  const clamp01 = (value: unknown): number =>
    Number.isFinite(value) ? Math.max(0, Math.min(1, value as number)) : 0;

  for (let t = 0; t < numTracks; t++) {
    const tState = mixerStates[t] || { mute: false, solo: false, volume: 0.8, pan: 0, sendA: 0, sendB: 0 };
    // E-10: the bounce gets the same channel strip as playback — high-pass, EQ,
    // compressor and drive — or the export would be missing the very thing that makes a
    // genre's tracks sit together. A track with no stored chain takes its role default.
    const tInsert = new ChannelStrip(
      ctx,
      pattern.tracks[t]?.insert ??
        resolveTrackInsertForGenre(pattern.tracks[t]?.track_id, pattern.genre_id)
    );

    const tDuckGain = ctx.createGain();
    tDuckGain.gain.setValueAtTime(1, 0);
    tInsert.output.connect(tDuckGain);

    // …and the pre-duck tap that feeds the compressor's detector. It sits before `tDuckGain` on purpose and carries
    // the lane's volume, so the detector sees the programme as it would be *without* a sidechain, not as it is.
    const tDetectorTap = ctx.createGain();
    tDetectorTap.gain.setValueAtTime(silenced(tState) ? 0 : Math.max(0, Math.min(2, tState.volume)), 0);
    tInsert.output.connect(tDetectorTap);
    if (graph.duckDetectorInput) tDetectorTap.connect(graph.duckDetectorInput);

    const tGain = ctx.createGain();
    tGain.gain.setValueAtTime(Math.max(0, Math.min(2, tState.volume)), 0);
    tDuckGain.connect(tGain);

    // N-01 follow-up: polarity must be honoured offline too, otherwise an inverted
    // channel would sound different in the exported master than in the console.
    const tPolarity = ctx.createGain();
    tPolarity.gain.setValueAtTime(tState.phaseInvert ? -1 : 1, 0);

    const tPan = ctx.createStereoPanner();
    tPan.pan.setValueAtTime(Math.max(-1, Math.min(1, tState.pan)), 0);

    tGain.connect(tPolarity);
    tPolarity.connect(tPan);
    // E-11: through the group bus, never straight to the fader — the same decision the live
    // engine makes, from the same function (`trackBuses.ts`), which is what keeps the two graphs
    // identical where it matters.
    const bus = resolveGroupBus(pattern.tracks[t]?.track_id, pattern.tracks[t]?.name);
    tPan.connect(bus === "drum" ? graph.drumBusInput : graph.musicBusInput);

    // Exporter parity for the send buses: the live engine taps post-pan into `sendA`
    // (reverb) and `sendB` (delay), ramped with `setTargetAtTime`. The same tap point and
    // the same ramps are used here so a genre's curated sends survive the bounce.
    const sendA = ctx.createGain();
    sendA.gain.setValueAtTime(0, 0);
    sendA.gain.setTargetAtTime(silenced(tState) ? 0 : clamp01(tState.sendA), 0, 0.01);
    tPan.connect(sendA);
    sendA.connect(graph.reverb.input);

    const sendB = ctx.createGain();
    sendB.gain.setValueAtTime(0, 0);
    sendB.gain.setTargetAtTime(silenced(tState) ? 0 : clamp01(tState.sendB), 0, 0.01);
    tPan.connect(sendB);
    sendB.connect(graph.delay.input);

    trackStrips.push({ gain: tGain, duckGain: tDuckGain, polarity: tPolarity, pan: tPan, insert: tInsert });
  }

  /**
   * P6 parity: the *same* routing decision the live engine makes, resolved before any note is
   * scheduled so the render loop stays synchronous.
   *
   * A host is created, awaited and connected here — before `startRendering()` — because the
   * scheduler below runs straight-line and must not await. The patch is pushed once, up front.
   */
  const gs1Hosts = new Map<number, Gs1Host>();
  /**
   * ⭐ **The single resolution seam, resolved once per lane.**
   *
   * Host creation and note planning both read *this* map. The plan is not allowed to re-derive the
   * patch from `(role, instrument, genre)` while the host was built from a lane's own share code:
   * that is how a written file comes to disagree with the patch that was applied — the "second
   * sound" this repository's parity gates exist to prevent. `planGs1Notes` is handed `voice` below,
   * so the two consumers share one object by construction.
   */
  const gs1Voices = new Map<number, Gs1Voice>();
  /** Every lane whose own patch code was refused, named; reported to the caller at the end. */
  const gs1PatchProblems: string[] = [];
  /** See the option of the same name: the whole master graph is skipped for this render. */
  const directOut = options.directOut === true;
  let gs1HostFailures = 0;
  /**
   * Asked of **this** kind of context, before any host is built.
   *
   * Safari renders every GS-1 lane silent inside an `OfflineAudioContext` (measured: a `chords` or `lead` stem is an
   * empty file there while the native lanes match Chromium within 0.8 dB), and because a host that exists means
   * "this track is handled", those lanes were exported as silence. The probe renders one note the same way an export
   * does; a measured silence sends every routed lane to the native engine, which is a different voice but a file
   * with music in it. `unmeasured` leaves everything as it was.
   */
  const gs1Verdict = isGs1RoutingEnabled() ? await ensureOfflineGs1Capability({ sampleRate: ctx.sampleRate }) : "unmeasured";
  mark("gs1:capabilityProbe");
  const gs1Available = isGs1RoutingEnabled() && gs1Verdict !== "silent";
  if (!gs1Available && isGs1RoutingEnabled()) {
    console.warn(
      "[render] this browser renders the GS-1 voice silent offline (probe verdict: silent) — chords/lead go to the native engine"
    );
  }
  if (gs1Available && typeof ctx.audioWorklet?.addModule === "function") {
    for (let t = 0; t < numTracks; t++) {
      /**
       * A stem render only ever plays its own track, so it must not build hosts for the others.
       *
       * Each GS-1 host instantiates a WASM core in that context's worklet scope, and the page's WASM
       * memory budget is finite and **not** reclaimable: measured with
       * `scripts/probe_gs1_memory_release.mjs`, a page builds **~124** hosts and then every further
       * `WebAssembly.instantiate` fails with `RangeError: ... Out of memory`, whatever teardown is
       * used (`dispose()`, an explicit `gc()`, and `OfflineAudioContext.close()` — which does not even
       * exist). Past that point `renderPatternOffline` voices the chords/lead tracks with the native
       * synth, so the export stops matching the audition (measured on `ambient`: chords +13.05 dB,
       * lead -16.56 dB) until the page is reloaded.
       *
       * That made the stems path cost 2 hosts per stem render — 16 per export for nothing, since 14
       * of those hosts belong to tracks the render drops on the first line of its scheduling loop.
       * Skipping them is free and takes the budget from ~7 exports per page to ~31.
       */
      if (options.stemTrackIdx !== undefined && options.stemTrackIdx !== t) continue;
      const track = pattern.tracks[t];
      /**
       * The genre decides how a lane is voiced here too, from the pattern's own `genre_id` — the same
       * answer the live engine gives, which is the parity this function exists to keep. A lane's own
       * `gs1Patch` share code wins over the table, and a code that cannot be read is **reported**
       * rather than absorbed into the same `null` an unrouted instrument produces.
       */
      const lane = track
        ? resolveGs1Lane(track.track_id, track.instrument, pattern.genre_id, track.gs1Patch)
        : ({ kind: "native" } as const);
      if (lane.kind === "problem") {
        const laneName = track?.laneId ?? track?.track_id ?? `track ${t}`;
        gs1PatchProblems.push(`${laneName}: ${lane.problem}`);
        continue;
      }
      if (lane.kind === "native") continue;
      const voice = lane.voice;
      /**
       * Bounded retry, then report — this used to be a silent single attempt.
       *
       * `createGs1Host` fetches the WASM core **over the network** and loads a worklet module, so
       * its failure is transient by nature, and a bare `catch` left that track on the native synth
       * *for that render only*. Measured on `chicago-house` (3 bars, fingerprint delta against a
       * clean render): one GS-1 host failing moves the sound by **0.71 dB** in band 6 for the
       * chords track and **3.66 dB** in band 9 for the lead — which is the magnitude, and the
       * genre-dependent spread, of the rare repeat-render outliers recorded in appendix G.14.
       *
       * In other words the export's *sound* depended on whether a fetch won a race, silently. That
       * is the same defect as the silent limiter fallback (G.14): a renderer that hands back a
       * different file than the one that was auditioned, and says nothing. The retry makes the
       * transient case not happen; the count makes the persistent case impossible to miss.
       */
      let host: Gs1Host | null = null;
      for (let attempt = 0; attempt < GS1_HOST_LOAD_ATTEMPTS && !host; attempt++) {
        try {
          /**
           * Diagnostic capture, when a probe asked for it (`globalThis.__gs1Capture`).
           *
           * The worklet then posts the core's own samples around every scheduled event and they are collected here, so a
           * caller can compare them with the rendered file at the same frames — the measurement that says which side of the
           * worklet boundary a discontinuity is on. Off in every normal render.
           */
          // The URL flag, the same one the pool reads: the exporter builds its **own** hosts (that is what the retry loop
          // above is for), so a flag only the pool honours captures nothing here — which is exactly what happened.
          const capture = captureRequested(
            typeof window === "undefined" ? "" : window.location.search
          );
          const candidate = await createGs1Host({
            context: ctx,
            ...(capture
              ? {
                  captureEvents: true,
                  onEventCapture: (event: unknown) => {
                    const sink = globalThis as unknown as { __gs1Captures?: unknown[] };
                    (sink.__gs1Captures ??= []).push(event);
                  },
                }
              : {}),
          });
          await candidate.ready;
          host = candidate;
        } catch {
          // Retried below; the last failure is counted after the loop.
        }
      }
      if (!host) {
        gs1HostFailures += 1;
        continue;
      }
      /**
       * The patch, from the seam's own voice — and the routing with it. A share code carries the
       * synth's own modulation routes, so applying the table patch's velocity response *instead*
       * would render something `gs1.render` would not for the same code. `applyGs1VoiceRoutes`
       * writes all eight slots (clearing the unused ones), so two different codes cannot inherit
       * each other's feel.
       */
      host.setPatch(voice.params);
      applyGs1VoiceRoutes(host, voice);
      gs1Voices.set(t, voice);
      /**
       * A sample patch needs its recording (P2.5). Imported **before** the host joins the graph, so the first note
       * cannot be silent while the bytes are on their way — and only when the patch actually plays a sample, so a
       * synth patch pays nothing.
       */
      if (patchNeedsSample(voice.patch)) {
        await host.importSample(generateTextureSample(ctx.sampleRate), ctx.sampleRate);
      }
      /**
       * Diagnostic: the host's output straight to the destination, bypassing the entire master graph.
       *
       * This splits the remaining question in half. The core's own buffer is smooth 46 ms around every note-off while the file
       * carries a step 15 ms after it, and six graph stages are already excluded by A/B; if the step survives *this*, then it
       * is not in the graph at all and the capture is reading the wrong thing — which is worth knowing before bisecting five
       * static nodes that a static node cannot plausibly produce.
       */
      if (directOut) host.output.connect(ctx.destination);
      else host.output.connect(trackStrips[t].insert.input);
      gs1Hosts.set(t, host);
    }
  }
  options.onGs1HostFailures?.(gs1HostFailures);
  mark("gs1:hostBuild");
  options.onGs1PatchProblems?.(gs1PatchProblems);
  if (gs1PatchProblems.length > 0) {
    console.warn(`[render] refused GS-1 patch code(s): ${gs1PatchProblems.join(" | ")}`);
  }

  const drumKit: DrumKitType = options.drumKit || "808";
  const exportSeed = patternSeed(pattern as unknown as { genre_id?: string; bpm?: number; totalSteps?: number });
  /**
   * The per-note variation seed (P2.2 / A3): the pattern's own string seed, hashed once per render.
   *
   * Deliberately the *same* seed the probability gate uses, so a note that plays at all plays with the nudge it
   * would always have had — and no `Math.random()`, because the export has to be the audition.
   */
  const variationSeed = variationSeedFrom(exportSeed);
  /** A3's control switch: off means "every stab identical", which is what the measurement compares against. */
  const noteVariationOn = options.noteVariation !== false;
  const variationFor = (trackIdx: number, step: number, noteIndex = 0) =>
    noteVariationOn ? polyVoiceVariation(variationSeed, trackIdx, step, noteIndex) : null;

  // Acoustic Enhancement: Track open hi-hat voices for offline choke group
  const openHiHatVoices: Array<{ gains: GainNode[]; stopTime: number; envelope?: DrumVoiceEnvelope }> = [];

  /**
   * Did anything in this render get asked to make a sound?
   *
   * This exists for the silence verdict, and it has to be a fact the renderer *observed* rather than an inference
   * from the pattern, because the guard's whole job is to tell "the host returned nothing" from "there was nothing
   * to return". An audible track with a step above zero dispatches a voice, so that is where it is set; a pattern
   * with no tracks, every track muted, or every step zero never sets it, and silence is then the correct answer
   * rather than a host failure. The audio-lane path sets its own half of this below.
   */
  let scheduledVoice = false;
  let plannedAudioLane = false;
  /** The reasons the lane plan named, for the silence verdict below. */
  let audioLaneProblems: string[] = [];

  const scheduleStartedAt = performance.now();
  // Step scheduling loop. `step` is **absolute** — the whole render's index for this moment — and only the time it
  // lands at is shifted into the chunk's context; see `scheduleFrom` above.
  for (let step = scheduleFrom; step < scheduleTo; step++) {
    const unswungTime = stepTimeAt(step) - timelineOffsetSec;

    pattern.tracks.forEach((track: Track, trackIdx: number) => {
      // Stem mode check: only render requested track if stemTrackIdx is specified
      if (options.stemTrackIdx !== undefined && options.stemTrackIdx !== trackIdx) {
        return;
      }

      /**
       * The mixer state is read **before** the audio-lane branch, and that order is the point: the branch used to sit above these two lines, so a muted audio lane
       * was still mixed and still reported as rendered — audible against the user's instruction and described as played. Silencing is decided once, here and in
       * `scheduleOfflineAudioLanes`, from the same `mixerStates`.
       */
      const state = mixerStates[trackIdx] || { mute: false, solo: false, volume: 0.8, pan: 0 };
      if (state.mute) return;
      if (anySolo && !state.solo) return;

      /**
       * **An audio lane is not voiced by this chain.** It has no synthesised voice, and until this returned, `track_id: "audio"` fell through to the
       * `synthesizePercussion` fallback at the bottom — so every audio lane was given a drum hit *under* the sample it was supposed to play, while the MCP reply
       * also called it skipped. The lane is mixed from its own bytes by `scheduleOfflineAudioLanes` below instead. `isAudioLane` is the one spelling of that test.
       */
      if (isAudioLane(track)) {
        return;
      }

      const trackLen = track.trackLength && track.trackLength > 0 ? track.trackLength : track.steps.length;
      const stepIdx = trackLen > 0 ? step % trackLen : step;
      const stepVal = track.steps[stepIdx] || 0;
      if (stepVal <= 0) return;
      // Past the mute/solo and step gates: this step dispatches a voice on an audible track.
      scheduledVoice = true;

      // F-03/N-04: probability gates offline rendering, but with a DETERMINISTIC roll
      // so re-exporting the same project is reproducible and every exporter agrees.
      const probability = track.probability?.[stepIdx];
      if (!probabilityPasses(probability, exportSeed, trackIdx, stepIdx)) {
        return;
      }

      // F-03/P0.5: per-track swing offset, from the shared rule both engines use.
      const trackSwingOffset = track.swing !== undefined ? track.swing / 100 : 0;
      const effSwing = Math.max(0, Math.min(0.75, swing + trackSwingOffset));
      const swingOffset = swingOffsetSeconds(step, effSwing, stepLengthAt(step));
      const stepTime = unswungTime + swingOffset;

      const velVal = track.velocity && track.velocity[stepIdx] !== undefined ? track.velocity[stepIdx] : 100;
      const normalizedVel = velVal / 127;
      const pitchVal = track.pitch && track.pitch[stepIdx] !== undefined && track.pitch[stepIdx] !== null ? track.pitch[stepIdx]! : 0;
      const gateVal = track.gate && track.gate[stepIdx] !== undefined ? track.gate[stepIdx] : 0.8;

      /**
       * A/B: bypass the channel strip (`globalThis.__noStrip`).
       *
       * The strip's compressor is a `DynamicsCompressorNode` — the browser's own, with no lookahead — and the pop this work
       * has been chasing sits ~15 ms **after** each note-off, is absent from the core's own output, and is bigger in the
       * channel the lane is panned towards. A compressor's gain moving as a note's release drops the level is the shape of
       * that, and this switch removes the strip to see it.
       */
      const trackDest =
        (globalThis as unknown as { __noStrip?: boolean }).__noStrip === true
          ? trackStrips[trackIdx].gain
          : trackStrips[trackIdx].insert.input;
      const trackId = (track.track_id || "").toLowerCase();
      const lowerName = track.name.toLowerCase();
      // Exporter parity: resolve the same per-track instrument the live engine does, so a
      // genre's declared timbre survives an offline bounce instead of falling back to the
      // fixed per-role preset. Drum voices ignore this (their dispatch is untouched).
      const synthPreset = resolveInstrumentPreset(track.instrument, trackId);

      // Ratchet
      const isHatTriplet = (trackId === "hihat" || lowerName.includes("hat")) && stepVal === 3;
      const ratchet = resolveRatchet(track.ratchet?.[stepIdx], isHatTriplet);

      const subDur = stepDur / ratchet;
      for (let r = 0; r < ratchet; r++) {
        const subTime = stepTime + r * subDur;
        const subVel = normalizedVel * ratchetVelocityScale(r, ratchet);

        // Synthesis Dispatch with physical drum kit modeling and polyphonic synth
        if (trackId === "kick" || lowerName.includes("kick")) {
          synthesizeKick(ctx, trackDest, subTime, subVel, pitchVal, drumKit, noiseBuf, noisePositionFor(trackIdx, stepIdx, r));
          // Kick-bass sidechain ducking, scheduled from the same shape the live engine uses
          // (`audio/sidechain.ts`), so an export matches what was auditioned.
          const duckShape = resolveKickDuckShape(pattern.genre_id, subVel);
          pattern.tracks.forEach((tTrack: Track, tIdx: number) => {
            const tTid = (tTrack.track_id || "").toLowerCase();
            const tName = (tTrack.name || "").toLowerCase();
            if (tTid === "bass" || tName.includes("bass")) {
              const bassStrip = trackStrips[tIdx];
              if (bassStrip?.duckGain) {
                try {
                  scheduleKickDuck(bassStrip.duckGain.gain, subTime, duckShape);
                } catch {
                  // Guard against scheduling errors
                }
              }
            }
          });
        } else if (trackId === "snare" || lowerName.includes("snare")) {
          // D8 parity with `AudioEngine`: a declared clap/rimshot is voiced by the percussion
          // library, everything else by the snare model.
          if (instrumentWantsPercussionVoice(track.instrument)) {
            synthesizePercussion(ctx, trackDest, subTime, subVel, pitchVal, drumKit, noiseBuf, noisePositionFor(trackIdx, stepIdx, r), track.instrument);
          } else {
            synthesizeSnare(ctx, trackDest, subTime, subVel, pitchVal, drumKit, noiseBuf, noisePositionFor(trackIdx, stepIdx, r));
          }
        } else if (trackId === "hihat" || trackId === "hat" || lowerName.includes("hihat") || lowerName.includes("hat")) {
          // Acoustic Enhancement: Hi-Hat Choke Group (parity with AudioEngine)
          if (stepVal === 1 || stepVal === 3) {
            for (const openHat of openHiHatVoices) {
              if (openHat.stopTime > subTime) {
                for (const gNode of openHat.gains) {
                  try {
                    const g = gNode.gain;
                    // Q1: same analytic anchor as the live engine. Reading `g.value` here
                    // anchored the fade at "now" instead of at the scheduled `subTime`, so
                    // the exported choke stepped and clicked while the live one did not.
                    const anchor = openHat.envelope
                      ? Math.max(0.0001, drumEnvelopeLevelAt(openHat.envelope, subTime))
                      : Math.max(0.0001, g.value);
                    g.cancelScheduledValues(subTime);
                    g.setValueAtTime(anchor, subTime);
                    g.exponentialRampToValueAtTime(0.0001, subTime + 0.003);
                  } catch {
                    // Guard against scheduling errors
                  }
                }
              }
            }
          }
          const hatVoice = synthesizeHiHat(ctx, trackDest, subTime, subVel, pitchVal, drumKit, stepVal, subDur, gateVal, noiseBuf, noisePositionFor(trackIdx, stepIdx, r));
          if (stepVal === 2 && hatVoice.gains.length > 0) {
            openHiHatVoices.push({ gains: hatVoice.gains, stopTime: hatVoice.stopTime, envelope: hatVoice.envelope });
            if (openHiHatVoices.length > 16) {
              openHiHatVoices.shift();
            }
          }
        } else if (trackId === "percussion" || trackId === "perc" || lowerName.includes("perc") || lowerName.includes("clap")) {
          synthesizePercussion(ctx, trackDest, subTime, subVel, pitchVal, drumKit, noiseBuf, noisePositionFor(trackIdx, stepIdx, r), track.instrument);
        } else if (trackId === "bass" || lowerName.includes("bass")) {
          const midi = pitchVal > 0 ? pitchVal : 36;
          playPolySynthNote(
            ctx,
            trackDest,
            midi,
            subTime,
            subDur * gateVal,
            subVel,
            synthPreset,
            variationFor(trackIdx, stepIdx, r)
          );
        } else if (trackId === "chords" || trackId === "chord" || lowerName.includes("chord") || lowerName.includes("pad")) {
          // E-01: identical voicing to `AudioEngine.playChord`. Exporter parity is a
          // hard rule in this project, so both sides call the same shared module and
          // apply the same per-voice gain — never re-implement it here.
          const midi = pitchVal > 0 ? pitchVal : 60;
          // Same genre-appropriate chord treatment as `AudioEngine.playChord` — voicing,
          // note length and onset spread. Resolving any of the three differently here
          // would silently break exporter parity for every rock, jazz and ambient genre.
          const treatment = resolveChordTreatment(pattern.genre_id, track.instrument);
          // The stored stack wins (see `chordNotesForStep`): a genre whose chords are expanded into
          // the pattern must render *those* notes here too, or live/export parity breaks the moment
          // a chord is stored — which is the whole reason this is one shared call.
          const notes = chordNotesForStep(track, stepIdx, midi, pattern.scale, { style: treatment.style });
          const voiceVel = subVel * chordVoiceGain(notes.length);
          /**
           * The attack-arrival rule, at the same place the engine applies it — this function exists to mirror the engine
           * and a rule applied in only one of them is how a rendered stem comes to disagree with the room.
           */
          const chordDur = soundingDuration(chordNoteDuration(subDur, gateVal, treatment), synthPreset.adsr.attack);
          // P6: if GS-1 voices this track, it takes the notes and the native voices are skipped —
          // playing both would double the harmony. The frame plan comes from the shared planner,
          // so the live engine and this renderer cannot disagree about when a note sounds.
          const chordHost = gs1Hosts.get(trackIdx);
          if (chordHost) {
            const planned = planGs1Notes({
              role: "chords",
              instrument: track.instrument,
              /**
               * The voice this host was **built with** — the same object, not a second lookup. A lane
               * can carry its own `gs1Patch`, and handing the planner the code again would be a
               * second resolution that is merely expected to agree with the first.
               */
              voice: gs1Voices.get(trackIdx),
              notes: notes.map((note, i) => ({
                note,
                time: chordVoiceOnset(subTime, i, treatment),
                duration: chordDur,
                velocity: voiceVel,
              })),
              sampleRate: ctx.sampleRate,
              latencyFrames: chordHost.scheduledNoteLatencyFrames,
            });
            if (planned) {
              const capped = capPlanPolyphony(planned);
              capped.notes.forEach((plannedNote, plannedIndex) => {
                /**
                 * GS-1's half of A3's per-note variation (ABI 9).
                 *
                 * The native path nudges a voice's second-oscillator detune and its cutoff; GS-1 has no per-note
                 * cutoff, but it has per-note **tuning**, which is the same nudge in the same unit (cents) — so the
                 * shipping voice gets it too. Until ABI 9 this was impossible: the core did not export
                 * `gs_set_tuning_note`, so a render with the pool enabled was *identical* with and without the
                 * variation, which is why the claim was measured on the native path and labelled as such.
                 *
                 * The note index comes from the *capped* plan, which is what the ear hears: voices inside one stab
                 * must not share a nudge, or the chord moves as a block.
                 */
                const variation = variationFor(trackIdx, stepIdx, plannedIndex);
                // The nudge rides with the note: sending it separately retuned whichever voice was still sounding on
                // that key (see the worklet protocol's `cents`).
                chordHost.noteOnAt(
                  plannedNote.note,
                  plannedNote.velocity,
                  plannedNote.atFrame,
                  plannedNote.pan,
                  variation ? variation.detuneCents : undefined
                );
                chordHost.noteOffAt(plannedNote.note, plannedNote.offFrame);
              });
              return;
            }
          }
          notes.forEach((note, i) => {
            playPolySynthNote(
              ctx,
              trackDest,
              note,
              chordVoiceOnset(subTime, i, treatment),
              chordDur,
              voiceVel,
              synthPreset,
              // `i` as the note index: the voices inside one stab must not all get the same nudge, or a chord would
              // move as a block and read as a pitch drift rather than as a hand on the keys.
              variationFor(trackIdx, stepIdx, i)
            );
          });
        } else if (trackId === "lead" || lowerName.includes("lead")) {
          const midi = pitchVal > 0 ? pitchVal : 72;
          const leadDur = soundingDuration(subDur * gateVal * 1.5, synthPreset.adsr.attack);
          const leadHost = gs1Hosts.get(trackIdx);
          if (leadHost) {
            const planned = planGs1Notes({
              role: "lead",
              instrument: track.instrument,
              // The voice this host was built with — see the chord block above.
              voice: gs1Voices.get(trackIdx),
              notes: [{ note: midi, time: subTime, duration: leadDur, velocity: subVel }],
              sampleRate: ctx.sampleRate,
              latencyFrames: leadHost.scheduledNoteLatencyFrames,
            });
            if (planned) {
              const plannedNote = planned.notes[0];
              // GS-1's half of A3's per-note variation — see the chord block above for why tuning is the parameter.
              const variation = variationFor(trackIdx, stepIdx, 0);
              leadHost.noteOnAt(
                plannedNote.note,
                plannedNote.velocity,
                plannedNote.atFrame,
                plannedNote.pan,
                variation ? variation.detuneCents : undefined
              );
              leadHost.noteOffAt(plannedNote.note, plannedNote.offFrame);
              return;
            }
          }
          playPolySynthNote(
            ctx,
            trackDest,
            midi,
            subTime,
            leadDur,
            subVel,
            synthPreset,
            variationFor(trackIdx, stepIdx, r)
          );
        } else if (trackId === "fx" || lowerName.includes("fx")) {
          /**
           * A **texture** instrument takes GS-1 with its recording (P2.5), the same way chords and lead do.
           *
           * The lane is an `fx` lane and the *instrument* is what says "this is a sample" (`resolveRoutedPatch`), so
           * this is the one place in the fx branch that asks. Checked first: a routed instrument has a host, and a
           * host that exists for this track is the whole answer.
           */
          const fxHost = gs1Hosts.get(trackIdx);
          if (fxHost) {
            const planned = planGs1Notes({
              role: "fx",
              instrument: track.instrument,
              // The voice this host was built with — see the chord block above.
              voice: gs1Voices.get(trackIdx),
              notes: [
                {
                  note: pitchVal > 0 ? pitchVal : 60,
                  time: subTime,
                  duration: soundingDuration(subDur * gateVal * 1.5, synthPreset.adsr.attack),
                  velocity: subVel,
                },
              ],
              sampleRate: ctx.sampleRate,
              latencyFrames: fxHost.scheduledNoteLatencyFrames,
            });
            if (planned) {
              const plannedNote = planned.notes[0];
              const variation = variationFor(trackIdx, stepIdx, 0);
              if (plannedNote) {
                fxHost.noteOnAt(
                  plannedNote.note,
                  plannedNote.velocity,
                  plannedNote.atFrame,
                  plannedNote.pan,
                  variation ? variation.detuneCents : undefined
                );
                fxHost.noteOffAt(plannedNote.note, plannedNote.offFrame);
              }
              return;
            }
          }
          // Same split as AudioEngine.playFX: `noise_sweep` keeps the shared swept riser,
          // anything else is voiced by the poly synth with the track's own preset.
          if (synthPreset === DEFAULT_SYNTH_PRESETS.noiseSweep) {
            synthFX(ctx, trackDest, subTime, subVel, pitchVal, subDur, gateVal);
          } else {
            const midi = pitchVal > 0 ? pitchVal : 72;
            playPolySynthNote(
              ctx,
              trackDest,
              midi,
              subTime,
              soundingDuration(subDur * gateVal * 1.5, synthPreset.adsr.attack),
              subVel,
              synthPreset,
              variationFor(trackIdx, stepIdx, r)
            );
          }
        } else {
          synthesizePercussion(ctx, trackDest, subTime, subVel, pitchVal, drumKit, noiseBuf, noisePositionFor(trackIdx, stepIdx, r), track.instrument);
        }
      }
    });
  }

  /**
   * ⭐ **The audio lanes, mixed into the same graph as everything else.**
   *
   * Before `startRendering`, so a lane goes through the master bus, the loudness trim and the true-peak limiter exactly as a synthesised track does — placing it
   * into the finished buffer afterwards would put it past the ceiling and make the two paths disagree about level. The destination is the **music bus**, which is
   * the routing decision the rest of the codebase already makes for an audio lane (`trackBuses.ts`: `id === "audio"` → `"music"`) and the one the live arrangement
   * player uses (`playerFromEngine.ts`).
   *
   * The report is handed out rather than swallowed: a lane whose bytes could not be fetched or decoded is a fact the caller has to be able to state.
   */
  mark("schedule:voices");
  timings && (timings.phases["meta:scheduleWall"] = (timings.phases["meta:scheduleWall"] ?? 0) + (performance.now() - scheduleStartedAt));

  if (pattern.tracks?.some((track) => isAudioLane(track))) {
    plannedAudioLane = true;
    const audioCatalogue = options.audioLaneCatalogue ?? SAMPLE_CATALOGUE;
    /**
     * The lanes this render has already silenced, taken from the **same** `mixerStates` the synthesised lanes above were filtered by — so a muted audio lane and a
     * muted synth lane are silenced by one decision, and the lane planner cannot disagree with the render about who is playing.
     */
    const silencedTrackIndexes = mixerStates.map((state, index) => (silenced(state) ? index : -1)).filter((index) => index >= 0);
    const report = await scheduleOfflineAudioLanes({
      pattern,
      catalogue: audioCatalogue,
      ...(options.audioLaneCatalogueProblem ? { catalogueProblem: options.audioLaneCatalogueProblem } : {}),
      loader: browserSampleLoader(ctx, audioCatalogue),
      sink: {
        start(buffer, event, ratio) {
          startSamplerNote({
            context: ctx,
            destination: graph.musicBusInput,
            buffer,
            ratio,
            whenSeconds: Math.max(0, event.atSeconds),
            ...(event.gainDb === 0 ? {} : { gainDb: event.gainDb }),
            ...(event.pan === undefined ? {} : { pan: event.pan }),
          });
        },
      },
      bpm,
      ...(patternTempo.length ? { tempoTrack: patternTempo } : {}),
      totalSteps,
      /**
       * The same step range and the same shift the synthesised lanes got. Passing the full pattern here would put an
       * audio lane's note at its absolute second inside a context that starts `barStartSeconds` earlier — a sample
       * playing two seconds before the bar it was written on. `timeOffsetSec` is subtracted from every planned
       * event's `atSeconds`, and step 0 of the plan is the chunk's own first step.
       */
      ...(chunkWindow
        ? {
            stepOffset: chunkWindow.fromStep,
            stepSpan: scheduledSteps,
            timeOffsetSec: timelineOffsetSec,
          }
        : {}),
      ...(options.stemTrackIdx === undefined ? {} : { stemTrackIdx: options.stemTrackIdx }),
      silencedTrackIndexes,
    });
    options.onAudioLanes?.(report);
    /**
     * A lane that resolved to a sample is a sound source; if one did, silence is *not* explained and the guard must
     * treat an empty buffer as the host's failure. See the verdict below, which is stated once for the whole render.
     */
    if (report.lanes.length > 0) scheduledVoice = true;
    audioLaneProblems = report.problems.map((problem) => problem.reason);
  }

  /**
   * **The two cases where silence is the correct render**, stated once, after everything that could make a sound
   * has been scheduled:
   *
   *   · **nothing was scheduled at all** — no audible step on any track (no tracks, all muted, or every step zero)
   *     and no audio lane that resolved. The buffer really is empty and there is nothing to retry;
   *   · **an audio lane was named as unplayable** — the lane plan already says which lane and why
   *     (`OfflineAudioLaneReport.problems`), and the reason is far more useful than "the host returned a silent
   *     render" would be.
   *
   * A host that failed while voices *were* scheduled matches neither, and that is the defect the guard exists for.
   * See `SilenceContext`.
   */
  if (!scheduledVoice) {
    onSilenceContext?.({
      expectSilence: true,
      reason:
        audioLaneProblems.length > 0
          ? `every audio lane was reported as not playable (${audioLaneProblems[0]})`
          : plannedAudioLane
            ? "the render contains only audio lanes and none of them resolved to a sample"
            : "the pattern has nothing to play: no audible step on any track and no audio lane in it",
    });
  }

  // Wait for the limiter module before rendering: an OfflineAudioContext renders in
  // one shot, so a worklet that installed after `startRendering()` would silently
  // leave the whole bounce on the compressor fallback.
  mark("audioLanes:loadDecodeSchedule");

  const limiterKind = await graph.limiter.ready;
  if (timings) timings.meta = { ...(timings.meta ?? {}), limiterKind };
  mark("limiter:ready");
  options.onLimiterKind?.(limiterKind);

  timings?.onPhase?.("phase:enter", 0, performance.now() - renderStartedAt);
  const renderWallStart = performance.now();
  const rendered = await ctx.startRendering();
  const renderWallMs = performance.now() - renderWallStart;
  mark("offline:startRendering");
  if (timings) {
    timings.phases["meta:startRenderingWall"] = (timings.phases["meta:startRenderingWall"] ?? 0) + renderWallMs;
    timings.phases["meta:renderCallCount"] = (timings.phases["meta:renderCallCount"] ?? 0) + 1;
  }

  /**
   * The section-boundary fade, applied to the rendered samples.
   *
   * A fade of `n` samples is centred on the boundary: the tail of the outgoing section ramps down and the head of the incoming
   * one ramps up, so a hard mute or velocity jump becomes a few milliseconds of transition instead of a step. Boundary 0 is
   * skipped — the start of a song has nothing before it to fade from.
   */
  if (options.boundaryFadeMs && options.boundaryFadeMs > 0 && options.boundaries?.length) {
    const stepSec = (60 / bpm) / 4;
    const half = Math.max(1, Math.round((options.boundaryFadeMs / 1000 / 2) * rendered.sampleRate));
    for (const boundary of options.boundaries) {
      if (boundary <= 0) continue;
      /**
       * A boundary is an **absolute** step (`flattenSong`'s own numbering), so a chunk only fades the boundaries
       * inside its own range, and at the frame that step lands on in this context rather than at the frame it would
       * have landed on from the top of the piece. Fading a boundary outside the range would dent a second of audio
       * in a chunk that does not contain it, and using the absolute frame would put it in the wrong place.
       */
      const boundaryFrames = chunkWindow
        ? (stepTimeAt(boundary) - timelineOffsetSec) * rendered.sampleRate
        : boundary * stepSec * rendered.sampleRate;
      const at = Math.round(boundaryFrames);
      if (at <= 0 || at >= rendered.length) continue;
      for (let channel = 0; channel < rendered.numberOfChannels; channel += 1) {
        const data = rendered.getChannelData(channel);
        const from = Math.max(0, at - half);
        const to = Math.min(rendered.length, at + half);
        for (let i = from; i < to; i += 1) {
          // A triangle: 0 at the edges, 1 at the boundary, so the two sides join rather than both being scaled down.
          const distance = Math.abs(i - at) / half;
          data[i] *= Math.max(0, Math.min(1, distance));
        }
      }
    }
  }

  /**
   * A **seamless loop** asset (P0.6's other half): the render above is the loop *plus* its tail, which is right for
   * a file and wrong for a loop — played as a loop it rings out into silence and starts again. Folding the tail over
   * the head makes it exactly the loop's length and continuous, and is the same arithmetic the audition's live loop
   * does implicitly by never stopping.
   *
   * Only offered for a loop render: a song's tail belongs at its end, and a caller that asks for both gets the tail
   * (the song is the thing that was asked for).
   */
  /**
   * The loop length keeps its original expression for a whole render, deliberately: `chunkLoopSec` is the same number
   * for a flat pattern and a different one for a tempo-mapped pattern, and `seamlessLoop` is a shipped behaviour that
   * a chunking change must not move. Only a chunk — where there was no behaviour to keep — reads the new expression.
   */
  const loopFrames = Math.max(
    1,
    Math.round((chunkWindow ? chunkLoopSec : totalSteps * stepDur) * rendered.sampleRate)
  );
  const asRequested = <T>(buffer: T): T | AudioBuffer => {
    if (!options.seamlessLoop || loopFrames >= rendered.length) return buffer as unknown as T;
    const source: Float32Array[] = [];
    for (let c = 0; c < rendered.numberOfChannels; c += 1) source.push(rendered.getChannelData(c));
    const folded = foldLoopTail(source, loopFrames, tailFramesOf(rendered.length, loopFrames));
    const loop = ctx.createBuffer(rendered.numberOfChannels, loopFrames, rendered.sampleRate);
    folded.forEach((data, c) => loop.copyToChannel(data, c));
    return loop;
  };

  /**
   * PDC, offline: the master bus is delayed by the limiter's lookahead, and that delay is a real,
   * measured number — `MASTER_LIMITER_LOOKAHEAD_MS` is 3 ms, and the fallback re-run below applies
   * the *same kernel*, so **both** paths end up delayed by it. Until this, nothing on the render
   * path read `latencySamples` at all: `getMasterLimiterLatencySeconds()` had exactly one consumer,
   * a settings screen that displayed it.
   *
   * The compensation is a trim, not a filter: drop `latencySamples` frames from the head and pad the
   * same number of silent frames at the tail, so the buffer's length and the position of every later
   * event are unchanged and only the **alignment** moves. That is the property the comb-filter test
   * describes — make the real path behave like the aligned case — and the reason this runs *before*
   * `asRequested`: the seamless-loop fold must see the corrected timeline.
   */
  const compensate = (buffer: AudioBuffer, latencySamples: number): AudioBuffer => {
    if (!Number.isFinite(latencySamples) || latencySamples <= 0) return buffer;
    const compensated = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
    for (let c = 0; c < buffer.numberOfChannels; c += 1) {
      const source = buffer.getChannelData(c);
      const target = new Float32Array(buffer.length);
      // Shift earlier by the latency; the head is what the limiter's silence was, the tail becomes silence.
      for (let i = 0; i + latencySamples < source.length; i += 1) target[i] = source[i + latencySamples];
      compensated.copyToChannel(target, c);
    }
    return compensated;
  };

  /** Set by whichever branch below finishes the render; `renderFinishedAt` is read after it for the one honest end-to-end number. */
  let result: AudioBuffer;
  let renderFinishedAt = 0;
  const finish = (buffer: AudioBuffer): AudioBuffer => {
    if (timings) {
      renderFinishedAt = performance.now();
      timings.phases["meta:totalWall"] = (timings.phases["meta:totalWall"] ?? 0) + (renderFinishedAt - renderStartedAt);
      timings.phases["meta:toFinished"] = renderFinishedAt - renderStartedAt;
      timings.lastFinishedAt = renderFinishedAt;
      timings.onPhase?.("phase:finished", 0, renderFinishedAt - renderStartedAt);
    }
    return buffer;
  };

  if (limiterKind === "worklet") {
    result = asRequested(compensate(rendered, graph.limiter.latencySamples)) as AudioBuffer;
    mark("post:buffers");
    finish(result);
  } else {
    /**
     * The fallback path has no true-peak ceiling — its own warning says so ("no true-peak ceiling,
     * no lookahead. Peak limiting is degraded") — and that let a hot arrangement render *above* the
     * contract: measured on `tropical-house`, **+1.75 dBTP** in one run and −1.30 dBTP in the next,
     * from the same code, because whether the AudioWorklet could be registered is not something the
     * caller can rely on. Every export is re-run through the **same kernel the worklet runs**
     * (`limitBuffers`), so the ceiling is a property of the renderer rather than of the platform's
     * worklet support. The compressor's own reduction still applies first; this only removes what is
     * left above the ceiling.
     */
    const channels: Float32Array[] = [];
    for (let c = 0; c < rendered.numberOfChannels; c += 1) channels.push(rendered.getChannelData(c));
    const guarded = applyOfflineCeiling(channels, rendered.sampleRate);
    const out = ctx.createBuffer(rendered.numberOfChannels, rendered.length, rendered.sampleRate);
    for (let c = 0; c < rendered.numberOfChannels; c += 1) out.copyToChannel(guarded.channels[c], c);
    /**
     * The guard delays by the same lookahead the worklet does, on purpose — it exists so a guarded render is aligned with a worklet one.
     * Trimming both by the same amount preserves that alignment and fixes the absolute position, which is the part PDC is about.
     */
    result = asRequested(compensate(out, guarded.latencySamples)) as AudioBuffer;
    mark("post:offlineCeilingFallback");
    finish(result);
  }

  /**
   * The **chunk timeline**, stated rather than implied.
   *
   * `barStartFrame` is where the requested bar landed in this context — the shift the caller has to unpick — and
   * `chunkEndFrame` is where the requested range stops before the tail begins. A merge takes the chunk's own range
   * and keeps the last piece's tail; nothing about these numbers is inferred by the caller from frame counts.
   *
   * Without a window every field is the whole render's, so a caller of `renderPatternChunkOffline` gets the same
   * answer for `fromBar: 0` that `renderPatternOffline` gives, and `usedPreRoll: false` says no pre-roll was spent.
   */
  return {
    buffer: result,
    fromBar: chunkWindow ? (options.fromBar as number) : 0,
    toBar: chunkWindow ? (options.fromBar as number) + bars : bars,
    sampleRate: result.sampleRate,
    barStartFrame: chunkWindow ? chunkWindow.barStartFrame : 0,
    preRollFrames: chunkWindow ? chunkWindow.preRollFrames : 0,
    /**
     * Where this chunk's own audio stops, in its own frames — the tail after it belongs to the merge, not to the file.
     *
     * A chunk stops where its requested range stops; a **whole** render has no merge waiting and stops at the end of
     * everything it rendered, tail included. Both were the same expression at first, which trimmed a plain
     * `{ bars: 2 }` export down to its tail-less length (measured: a 5.75 s buffer reported as `durationSec` 4) —
     * the kind of defect a chunking change can introduce in the path it is not about.
     */
    chunkEndFrame: chunkWindow
      ? Math.min(result.length, chunkWindow.preRollFrames + Math.round(chunkLoopSec * result.sampleRate))
      : result.length,
    tailSec,
    barStartSeconds: chunkWindow ? chunkWindow.barStartSeconds : 0,
    usedPreRoll: Boolean(chunkWindow && chunkWindow.preRollFrames > 0),
  };
}

/**
 * Apply the master true-peak ceiling to finished channel buffers.
 *
 * Pure and exported so the guarantee is unit-testable without an AudioContext: the offline renderer
 * calls it when the graph could not run the limiter worklet, and the test drives hot, quiet and
 * already-limited material through it.
 *
 * The kernel is the worklet's own (same class, same parameters) and it delays by its lookahead, which
 * is also what the in-graph worklet does — so a guarded render is aligned with a worklet render.
 */
export function applyOfflineCeiling(
  channels: readonly Float32Array[],
  sampleRate: number
): { channels: Float32Array[]; gainReductionDb: number; latencySamples: number } {
  const result = limitBuffers(
    channels.map((channel) => Float32Array.from(channel)),
    sampleRate,
    { ceilingDb: MASTER_LIMITER_INTERNAL_CEILING_DB }
  );
  // The delay is part of the contract, not an accident: a guarded render is aligned with a worklet one.
  return { channels: result.channels, gainReductionDb: result.gainReductionDb, latencySamples: result.latencySamples };
}

function synthFX(ctx: BaseAudioContext, dest: AudioNode, time: number, vel: number, pitchOffset: number, stepDur: number, gateVal: number): void {
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  const startF = pitchOffset > 24 ? midiToFreq(pitchOffset, 69) : 880 * Math.pow(2, pitchOffset / 12);
  osc.frequency.setValueAtTime(startF, time);
  const noteDuration = Math.max(0.1, Math.min(3.0, stepDur * gateVal * 1.2));
  osc.frequency.exponentialRampToValueAtTime(90, time + noteDuration * 0.9);

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(2000, time);
  filter.frequency.exponentialRampToValueAtTime(200, time + noteDuration * 0.9);
  filter.Q.value = 5.0;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vel * 0.5, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + noteDuration);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(dest);

  osc.start(time);
  osc.stop(time + noteDuration + 0.02);
}

/**
 * B2 — render a whole song, through the same renderer as everything else.
 *
 * There is deliberately no second renderer: the arrangement is flattened into one pattern
 * (`flattenSong`, which applies each section's clip, repeats, mutes and velocity scale) and handed to
 * `renderPatternOffline` with `bars: 1`, because the flattened pattern's `totalSteps` *is* the song. Every
 * measurement, gate, limiter path and stem exporter therefore keeps working on a song unchanged.
 *
 * `songMode` is the caller's decision (the app renders the song when the project is in song mode and the loop
 * otherwise); this function always renders the arrangement it is given.
 */
export async function renderSongOffline(
  song: Song,
  options: RenderWavOptions = {}
): Promise<AudioBuffer> {
  const flattened = flattenSong(song);
  if (!flattened.totalBars || flattened.totalSteps <= 0) {
    throw new Error(`cannot render the song: ${flattened.problems.join("; ") || "no playable bars"}`);
  }
  /**
   * A song chunk is a bar range of the flattened pattern, and `fromBar` is a bar of **that** pattern — which is what
   * `flattenSong` returns precisely so a song and a loop go through one renderer. `bars: 1` is the flattened
   * pattern's own total, so a chunk asks for `bars` bars of it instead.
   */
  return renderPatternOffline(flattened.pattern, {
    ...options,
    bars: options.fromBar ? options.bars : 1,
  });
}

/**
 * `renderSongOffline` for one bar range of the arrangement — the song's half of `renderPatternChunkOffline`.
 *
 * A long song is the case chunking exists for (the client timeout and the browser process's lifetime are both
 * functions of the whole render), so the song path needs the window as much as the loop path does, and it is the same
 * flattened pattern underneath.
 */
export async function renderSongChunkOffline(
  song: Song,
  options: RenderWavOptions = {}
): Promise<RenderedChunk> {
  const flattened = flattenSong(song);
  if (!flattened.totalBars || flattened.totalSteps <= 0) {
    throw new Error(`cannot render the song: ${flattened.problems.join("; ") || "no playable bars"}`);
  }
  return renderPatternChunkOffline(flattened.pattern, {
    ...options,
    bars: options.fromBar ? options.bars : 1,
  });
}

/**
 * **A chunk's audio, with the pre-roll and the tail dropped** — what a file wants, and what a merge wants before it
 * crosses the seam.
 *
 * `from`/`to` are frames of the chunk's own buffer and are clamped, and an all-frame range returns the buffer itself
 * rather than a copy. That identity matters: a whole render takes this path with `from = 0` and a `to` equal to its
 * own length, so an existing export hands out the very buffer it always did.
 */
export function trimChunkFrames(chunk: RenderedChunk, from: number, to: number): AudioBuffer {
  const start = Math.max(0, Math.min(chunk.buffer.length, Math.floor(from)));
  const end = Math.max(start, Math.min(chunk.buffer.length, Math.floor(to)));
  if (start === 0 && end === chunk.buffer.length) return chunk.buffer;
  /**
   * Made through the buffer's own constructor rather than `new AudioBuffer(…)`: the tests' double has no global
   * `AudioBuffer` class, and a helper that only works in a browser is a helper the offline suite cannot hold to.
   */
  const BufferClass = (chunk.buffer as unknown as { constructor: new (channels: number, length: number, sampleRate: number) => AudioBuffer }).constructor;
  const trimmed = new BufferClass(chunk.buffer.numberOfChannels, end - start, chunk.buffer.sampleRate);
  for (let channel = 0; channel < chunk.buffer.numberOfChannels; channel += 1) {
    trimmed.copyToChannel(chunk.buffer.getChannelData(channel).subarray(start, end), channel);
  }
  return trimmed;
}

/**
 * Exports Master Mix as a downloadable WAV Blob
 */
export async function exportMasterWav(
  pattern: DrumPattern,
  genreId = "groove",
  options: RenderWavOptions = {}
): Promise<ExportedWav> {
  let limiterKind: MasterLimiterKind = "fallback";
  let gs1HostFailures = 0;
  let gs1PatchProblems: string[] = [];
  /**
   * The origin's answer, read from the render rather than re-derived: `WORKLETS_UNAVAILABLE_PROBLEM` is only ever in
   * this list when the context had no `audioWorklet` (see `offlineWorkletsAvailable`).
   */
  let workletsUnavailable = false;
  const chunk = await renderPatternChunkOffline(pattern, {
    ...options,
    onLimiterKind: (kind) => {
      limiterKind = kind;
      options.onLimiterKind?.(kind);
    },
    onGs1HostFailures: (count) => {
      gs1HostFailures = count;
      options.onGs1HostFailures?.(count);
    },
    onGs1PatchProblems: (problems) => {
      gs1PatchProblems = [...problems];
      options.onGs1PatchProblems?.(problems);
    },
    onProblems: (problems) => {
      workletsUnavailable = problems.includes(WORKLETS_UNAVAILABLE_PROBLEM);
      options.onProblems?.(problems);
    },
  });
  /**
   * The file is the requested bars, **not** the pre-roll the renderer needed to be correct at the first of them: the
   * pre-roll is the previous chunk's audio, and a file that began with it would start one reverb-length early. A whole
   * render has no pre-roll and this is the identity, byte for byte — the same buffer, not a copy.
   */
  const audioBuf = trimChunkFrames(chunk, chunk.preRollFrames, chunk.chunkEndFrame);
  const wavArrayBuffer = encodeAudioBufferToWav(audioBuf);
  const blob = new Blob([wavArrayBuffer], { type: "audio/wav" });
  const bpm = options.bpm || pattern.bpm || 120;
  const sanitizedGenre = (genreId || "groove").replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
  const filename =
    options.fromBar && options.fromBar > 0
      ? `${sanitizedGenre}_master_${bpm}bpm_bars${chunk.fromBar}-${chunk.toBar}.wav`
      : `${sanitizedGenre}_master_${bpm}bpm.wav`;

  return {
    blob,
    filename,
    durationSec: audioBuf.duration,
    limiterKind,
    gs1HostFailures,
    gs1PatchProblems,
    workletsUnavailable,
    ...(options.fromBar && options.fromBar > 0
      ? { fromBar: chunk.fromBar, toBar: chunk.toBar }
      : {}),
  };
}

/**
 * Exports each track as an isolated Stem WAV (P4-02)
 */
export async function exportStemsWav(
  pattern: DrumPattern,
  genreId = "groove",
  options: RenderWavOptions = {}
): Promise<ExportedStem[]> {
  const bpm = options.bpm || pattern.bpm || 120;
  const sanitizedGenre = (genreId || "groove").replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
  const stems: ExportedStem[] = [];

  for (let i = 0; i < pattern.tracks.length; i++) {
    const track = pattern.tracks[i];
    const trackName = (track.track_id || track.name || `track_${i + 1}`).toLowerCase().replace(/[^a-z0-9_-]/gi, "_");
    let stemGs1Failures = 0;
    let stemPatchProblems: string[] = [];
    /**
     * The same origin fact as the master export: a stem render is one render per track, so every stem is asked and a
     * single non-secure origin makes them all say so. `[...problems]` is not needed — only membership is read.
     */
    let stemWorkletsUnavailable = false;
    const audioBuf = await renderPatternOffline(pattern, {
      ...options,
      stemTrackIdx: i,
      onGs1HostFailures: (count) => {
        stemGs1Failures = count;
      },
      onGs1PatchProblems: (problems) => {
        stemPatchProblems = [...problems];
      },
      onProblems: (problems) => {
        stemWorkletsUnavailable = problems.includes(WORKLETS_UNAVAILABLE_PROBLEM);
        options.onProblems?.(problems);
      },
    });
    const wavArrayBuffer = encodeAudioBufferToWav(audioBuf);
    const blob = new Blob([wavArrayBuffer], { type: "audio/wav" });
    const filename = `${sanitizedGenre}_stem_${trackName}_${bpm}bpm.wav`;

    stems.push({
      blob,
      filename,
      trackName: track.name,
      trackIdx: i,
      gs1HostFailures: stemGs1Failures,
      gs1PatchProblems: stemPatchProblems,
      workletsUnavailable: stemWorkletsUnavailable,
    });
  }

  return stems;
}

/**
 * Packages all stems into an uncompressed ZIP archive (P4-02)
 */
export async function exportStemsZip(
  pattern: DrumPattern,
  genreId = "groove",
  options: RenderWavOptions = {}
): Promise<{ blob: Blob; filename: string; gs1HostFailures: number; workletsUnavailable: boolean }> {
  const stems = await exportStemsWav(pattern, genreId, options);
  const bpm = options.bpm || pattern.bpm || 120;
  const sanitizedGenre = (genreId || "groove").replace(/[^a-z0-9_-]/gi, "_").toLowerCase();

  /**
   * **One stem at a time, and each one let go of as soon as it is packed.**
   *
   * This used to be a `Promise.all` over every stem, which materialises all of them as `Uint8Array`s at once on top of
   * the blobs the render already holds — three copies of the whole export in memory at the peak. That is how a Safari
   * tab dies: WebKit restarts the page rather than throwing, and the user sees a crash and a reload. Reading
   * sequentially costs a loop and keeps the peak at "the archive so far, plus one stem".
   */
  const zipEntries: { name: string; data: Uint8Array }[] = [];
  for (const stem of stems) {
    zipEntries.push({ name: stem.filename, data: new Uint8Array(await stem.blob.arrayBuffer()) });
  }

  const zipBlob = createZipArchive(zipEntries);
  const zipFilename = `${sanitizedGenre}_stems_${bpm}bpm.zip`;

  return {
    blob: zipBlob,
    filename: zipFilename,
    // Summed across stems: each stem renders independently, so each can lose its own GS-1 host.
    gs1HostFailures: stems.reduce((n, stem) => n + stem.gs1HostFailures, 0),
    // `some`, not a sum: the origin is one property of the page, so one stem proves it for all of them.
    workletsUnavailable: stems.some((stem) => stem.workletsUnavailable),
  };
}

/**
 * How much memory this export will need, before it is attempted.
 *
 * A stem render holds one `AudioBuffer` per track (the render is sequential) and then the encoded WAVs for all of
 * them, so the peak is roughly *one buffer + every encoded stem*. That is enough to matter: a four-minute song at
 * 44.1 kHz stereo is ~42 MB per stem as float samples and ~21 MB as 16-bit WAV, so eight stems land around 300 MB —
 * and WebKit responds to that by restarting the page rather than raising an error. The UI asks this first and warns;
 * the number is an estimate and says so.
 */
export function estimateExportMemoryBytes(
  options: { seconds: number; sampleRate: number; tracks: number; stems: boolean }
): { buffers: number; encoded: number; peak: number; megabytes: number } {
  const channels = 2;
  /** `AudioBuffer` is float32: one buffer is live at a time during a sequential stem render. */
  const oneBuffer = Math.max(0, options.seconds) * options.sampleRate * channels * 4;
  /** 16-bit PCM plus a small header, which is what `encodeAudioBufferToWav` produces. */
  const oneEncoded = Math.max(0, options.seconds) * options.sampleRate * channels * 2;
  const buffers = oneBuffer;
  const encoded = options.stems ? oneEncoded * Math.max(1, options.tracks) : oneEncoded;
  const peak = buffers + encoded;
  return { buffers, encoded, peak, megabytes: Math.round(peak / (1024 * 1024)) };
}

/** Peak this app is willing to attempt without warning the user first. Measured, not guessed — see the doc above. */
export const EXPORT_MEMORY_WARN_BYTES = 220 * 1024 * 1024;

/**
 * Triggers a client-side file download
 */
export function triggerWavDownload(blob: Blob, filename: string): void {
  if (typeof window === "undefined") return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.style.display = "none";
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}

