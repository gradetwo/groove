/**
 * **VSCO 2 CE through the offline render path** — the criterion the sampler chain never had.
 *
 * ## What this pins, and why nothing weaker would
 *
 * An independent user re-tested VSCO 2 CE end to end and found that the lane had *never produced sound*: at one commit it was "an audio lane has no
 * notes to schedule, so a MIDI render skips it"; at the next it was still silent, now with *"neither address served the SFZ — Failed to fetch"*,
 * while `curl` on both addresses returned 200. The −28.8 dB and −31.1 dB of audio she measured came from the **default instrument** track a
 * `blankKind: "sampler"` arrangement starts with — so a render that "had audio" said nothing about whether the lane had any.
 *
 * That is the shape this file refuses. Every assertion below is on a **rendered file**, and the control is the same arrangement with the lane's
 * notes removed:
 *
 *   · the lane's render is **non-silent** (energy and peak on the decoded WAV);
 *   · it differs from the control **measurably**, by the repository's own 13-band fingerprint — not by "the audio lane report said it rendered",
 *     which is exactly the report that was wrong while a default track supplied the sound;
 *   · the control's own energy is **zero**, so the difference cannot come from anywhere but the lane;
 *   · the graph built for the lane holds **no oscillator** — the synthesised fallthrough a `track_id: "audio"` used to reach;
 *   · the loader asked for the SFZ at the **mirror** when the source did not answer, and for the sample at the **exact URL its file names**,
 *     with `#` percent-encoded (VSCO's own sample names carry it: `PSBassoon_D#2_v2_rr1.wav`).
 *
 * ## The fixture is VSCO's own text, not a convenient invention
 *
 * The program below is written the way all 75 of VSCO 2 CE's files are: a `<control>` block declaring `default_path=Woodwinds\Bassoon\stac\`
 * with **backslashes and an unquoted space**, and `<region>`s whose `sample=` is a bare file name. That combination is the one the report's
 * library depends on — `resolveSamplePath`'s backslash normalisation exists for it — so an SFZ that happened to use forward slashes would test
 * everything except the part that was ever wrong.
 *
 * ## The 13-band L1 threshold
 *
 * `docs/HEADLESS_CORE_PLAN.md` measured why a per-band tolerance cannot see a silent fallback: a failed GS-1 host moves a single band by
 * 0.71–3.66 dB, which sits inside the project's existing 1 dB per-band tolerance, while the whole 13-band shape moves by ~10 dB in L1. The guard
 * is therefore the **sum of absolute per-band differences**, and its floor is 5 dB. The measured values for this fixture are in the assertion
 * messages, and the tolerance was chosen after them rather than around them.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportMasterWav } from "../audio/WavExporter";
import { createSampleLoader } from "../audio/sampleLoader";
import { browserSampleDecoder } from "../audio/browserSampleGraph";
import { FakeAudioBuffer, FakeAudioParam, FakeGainNode, FakeOfflineAudioContext } from "./helpers/fakeAudio";
import { fingerprintChannels } from "./helpers/timbre";
import { resetGs1OfflineCapability, setGs1OfflineCapability } from "../audio/gs1/gs1OfflineCapability";
import { samplePeakDb } from "./helpers/audioMetrics";
import type { SampleAsset } from "../data/sampleCatalogue";
import type { SequencerPattern, SequencerTrack } from "../types/genre";

const SAMPLE_RATE = 44100;
/**
 * The lane's decoded sample is **longer than the gap between two notes**, deliberately.
 *
 * With a sample shorter than the note spacing, a voice with no scheduled end goes quiet on its own before the next note and the
 * one thing this file is about — whether a note is *told* to stop — is invisible in the file. Muse's report measured that on a
 * 29-second sustaining instrument; this makes the same fact observable in a unit test. Four notes are half a second apart, so
 * 1.2 seconds outlasts every gap between them.
 */
const SAMPLE_FRAMES = Math.round(SAMPLE_RATE * 1.2);
/** The lane's own bytes, at a rate no pitch in the fixture shares, so a wrong `ratio` is visible as a wrong measurement rather than hidden. */
const SAMPLE_HZ = 220;
const NOTE_SECONDS = 0.5;

/**
 * The program's own text, byte-for-byte in VSCO's style: `default_path` with backslashes and an unquoted space, then regions naming bare files.
 * `pitch_keycenter` is 60 for all four below, so the expected playback ratio is `2 ** ((note − 60) / 12)` and nothing in the fixture has to
 * encode the resolver's arithmetic twice.
 */
const VSCO_SFZ = [
  "<control>",
  "",
  "default_path=Woodwinds\\Bassoon\\stac\\",
  "",
  "<global>",
  "",
  "ampeg_attack=0.001",
  "ampeg_release=0.7",
  "",
  "<group> //Begin Group for entire instrument",
  "",
  "<region>",
  "sample=PSBassoon_C2_v2_rr1.wav",
  "lokey=36",
  "hikey=59",
  "pitch_keycenter=60",
  "lovel=0",
  "hivel=127",
  "",
  "<region>",
  "sample=PSBassoon_D#2_v2_rr1.wav",
  "lokey=60",
  "hikey=72",
  "pitch_keycenter=60",
  "lovel=0",
  "hivel=127",
  "",
].join("\n");

/** The two paths the fixture's program names, resolved through `default_path` — the addresses the loader must fetch. */
const SAMPLE_PATHS = ["Woodwinds/Bassoon/stac/PSBassoon_C2_v2_rr1.wav", "Woodwinds/Bassoon/stac/PSBassoon_D#2_v2_rr1.wav"];

/**
 * A local HTTP server standing in for the mirror. It serves the same **layout** the manifest promises (`<prefix>/<path>`) and records the exact
 * request path, which is how "did the loader ask for the URL its file names" is answered without reading the loader's mind.
 */
function startMirror(): Promise<{ server: Server; root: string; requested: string[]; sfzRequests: () => number }> {
  const requested: string[] = [];
  /** The requests as the server received them, decoded — the `#` in a VSCO sample name arrives as `%23`, and the server sees what the client sent. */
  let sfzRequests = 0;
  const server = createServer((request, response) => {
    const url = request.url ?? "";
    requested.push(url);
    const decoded = decodeURIComponent(url);
    if (decoded === "/vsco2ce/BassoonStac.sfz") {
      sfzRequests += 1;
      response.writeHead(200, { "content-type": "text/plain" });
      response.end(VSCO_SFZ);
      return;
    }
    if (SAMPLE_PATHS.some((path) => decoded === `/vsco2ce/${path}`)) {
      // A real WAV body is not needed: `decodeAudioData` is the test's own decoder, and the bytes only have to be non-empty.
      response.writeHead(200, { "content-type": "audio/wav" });
      response.end(Buffer.alloc(64, 7));
      return;
    }
    response.writeHead(404);
    response.end("not found");
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, root: `http://127.0.0.1:${port}`, requested, sfzRequests: () => sfzRequests });
    });
  });
}

/**
 * A mixing `OfflineAudioContext`, as in `audioLaneRenderIntegration.test.ts`: jsdom has no Web Audio, so this sums every scheduled `BufferSource`
 * through its gain at its `start(when)`. Everything under test — the SFZ resolution, the loader, the lane scheduler, the exporter's dispatch and
 * the WAV encoder — is production code.
 */
class MixingOfflineAudioContext extends FakeOfflineAudioContext {
  /** Which asset ids were decoded, so the single-flight rule and the addressing can both be read back. */
  decodedAssets: string[] = [];
  decoder: (assetId: string) => FakeAudioBuffer = () => laneSample();

  decodeAudioData = async (): Promise<AudioBuffer> => {
    // The decoder is told which asset by `browserSampleDecoder`'s caller through `decodedAssets`; the buffer itself is the same shape for both.
    return laneSample() as unknown as AudioBuffer;
  };

  startRendering(): Promise<FakeAudioBuffer> {
    const out = new FakeAudioBuffer(this.numberOfChannels, this.length, this.sampleRate);
    for (const source of this.createdBufferSources) {
      const buffer = source.buffer as FakeAudioBuffer | null;
      if (!buffer || source.started.length === 0 || typeof buffer.getChannelData !== "function") continue;
      const when = source.started[0]!.when;
      const at = Math.max(0, Math.round(when * this.sampleRate));
      const rate = source.playbackRate.value > 0 ? source.playbackRate.value : 1;
      const edge = source.outgoing[0]?.node;
      const gainParam = edge instanceof FakeGainNode ? edge.gain : undefined;
      const data = buffer.getChannelData(0);
      /**
       * ⭐ **The mix stops where the scheduler stopped the voice, and that is the whole point of this change.**
       *
       * Until this existed the mixer laid down every source for its entire buffer and ignored `stop(when)`, so
       * the one thing a sampler's lifetime is *about* — a note that ends — could not be observed here at all.
       * A real render of three 0.9-beat notes on `vsco2co:ViolinEnsSusVib` droned through the whole bar instead
       * of stopping between them, and this criterion stayed green: it asserted the playback ratio at the point
       * of resolution and never asserted that anything stopped. The fake recorded `stoppedAt` the whole time.
       *
       * **A scheduled duration ends a voice too, and that is the shape the fix uses.** `stop(when)` was read first
       * because a note-off was expected to take that form; `start(when, offset, duration)` is the same fact to the
       * platform — it stops the source there — and the lane's notes are given their ends that way. Reading only the
       * stop calls would leave the note's end invisible in the file the user downloads, which is exactly the layer
       * this criterion exists to measure.
       */
      const explicitStops = source.stopCalls.filter((when): when is number => typeof when === "number");
      const scheduled = source.started[0]!.duration;
      const stopAt = Math.min(
        explicitStops.length > 0 ? Math.min(...explicitStops) : Number.POSITIVE_INFINITY,
        scheduled === undefined ? Number.POSITIVE_INFINITY : when + scheduled
      );
      const stopFrame = Number.isFinite(stopAt) ? Math.round(stopAt * this.sampleRate) : Number.POSITIVE_INFINITY;
      for (let channel = 0; channel < out.numberOfChannels; channel += 1) {
        const target = out.getChannelData(channel);
        const limit = Math.min(target.length, at + Math.ceil(data.length / rate), stopFrame);
        for (let i = at; i < limit; i += 1) {
          const src = (i - at) * rate;
          const lo = Math.floor(src);
          const hi = Math.min(data.length - 1, lo + 1);
          const frac = src - lo;
          // The gain is read **per frame**, because a voice may be fading out across this window.
          const gain = gainParam ? gainAt(gainParam, i / this.sampleRate) : 1;
          target[i] += (data[lo]! * (1 - frac) + data[hi]! * frac) * gain;
        }
      }
    }
    return Promise.resolve(out);
  }
}

/** The lane's bytes: a cosine, so a buffer that never started is distinguishable from one that started at frame 0. */
function laneSample(): FakeAudioBuffer {
  const buffer = new FakeAudioBuffer(1, SAMPLE_FRAMES, SAMPLE_RATE);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.cos((2 * Math.PI * i) / 37);
  return buffer;
}

/** 16-bit PCM as the exporter writes it — the assertion is on the bytes a caller would download. */
function decodeWavBytes(bytes: Uint8Array): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const id = String.fromCharCode(bytes[offset]!, bytes[offset + 1]!, bytes[offset + 2]!, bytes[offset + 3]!);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "data") {
      const frames = Math.floor(size / 2);
      const out = new Float32Array(frames);
      for (let i = 0; i < frames; i += 1) out[i] = view.getInt16(body + i * 2, true) / 32768;
      return out;
    }
    offset = body + size + (size % 2);
  }
  throw new Error("the encoded WAV has no data chunk");
}

/**
 * ⭐ **The gain a node is at, at a given time** — the piece of Web Audio this mixer used to leave out.
 *
 * It read `source.outgoing[0].node.gain.value`, which is a **constant**: `FakeAudioParam` sets `.value` to the ramp's
 * target the instant the ramp is scheduled, so a schedule of "level, then ramp to 0 over 250 ms" read back as *zero
 * for the whole note*. That was invisible while every voice was scheduled with `start(when, offset, duration)` and no
 * gain automation at all — the first thing to schedule a release made a correct voice render as silence, and the
 * renderer's own silence guard caught it.
 *
 * A ramp is a ramp, so this evaluates the schedule the way the platform does: `setValueAtTime` pins a value from its
 * time onward, and a ramp interpolates towards its target from the previous event's time. With no events it returns
 * the parameter's own value, which is what every existing assertion on this render was written against.
 */
function gainAt(param: FakeAudioParam, t: number): number {
  const events = [...param.events].sort((a, b) => a.time - b.time);
  let previous = { value: param.value, time: 0, ramp: false };
  for (const event of events) {
    if (event.time <= t) {
      previous = { value: event.value, time: event.time, ramp: event.type !== "setValueAtTime" };
      continue;
    }
    if (!previous.ramp) return previous.value;
    const span = event.time - previous.time;
    if (span <= 0) return event.value;
    return previous.value + (event.value - previous.value) * ((t - previous.time) / span);
  }
  return previous.value;
}

function energyOf(samples: Float32Array): number {
  let energy = 0;
  for (const value of samples) energy += value * value;
  return energy;
}

/**
 * Peak level, in dBFS, over one window of the render.
 *
 * The question "did the note stop" is about a *stretch of time*, not the whole file, so `samplePeakDb` cannot answer it: a
 * render that is loud at the first note and silent afterwards has the same whole-file peak as one that never stops. `-Infinity`
 * for a window with no samples in it at all, which is a silence rather than a level.
 */
function windowPeakDb(samples: Float32Array, fromSeconds: number, toSeconds: number, sampleRate = SAMPLE_RATE): number {
  const from = Math.max(0, Math.round(fromSeconds * sampleRate));
  const to = Math.min(samples.length, Math.round(toSeconds * sampleRate));
  let peak = 0;
  for (let i = from; i < to; i += 1) peak = Math.max(peak, Math.abs(samples[i]!));
  return peak === 0 ? Number.NEGATIVE_INFINITY : 20 * Math.log10(peak);
}

/** The guard metric `docs/HEADLESS_CORE_PLAN.md` chose: the sum of absolute per-band differences, not the worst band. */
function bandL1(a: Float32Array, b: Float32Array, sampleRate: number): number {
  const left = fingerprintChannels([a], sampleRate).bandDb;
  const right = fingerprintChannels([b], sampleRate).bandDb;
  return left.reduce((sum, value, index) => sum + Math.abs(value - right[index]!), 0);
}

/**
 * The arrangement: one VSCO sampler lane with four pitched notes, and a synthesised `lead` lane whose notes are the control's counterpart.
 *
 * The lane is `track_id: "audio"` with a `sample.assetId`, exactly what `compileArrangementToLanes` produces for a `sampler` track, and it
 * carries `instrument: "sampler"`. Its notes are on the grid so a synthesised fallback *would* voice them if the early return were removed.
 */
function vscoPattern(): SequencerPattern {
  const steps = new Array(16).fill(0);
  const pitch = new Array(16).fill(null);
  const laneNotes = [
    { step: 0, pitch: 48 },
    { step: 4, pitch: 55 },
    { step: 8, pitch: 62 },
    { step: 12, pitch: 67 },
  ];
  for (const { step, pitch: note } of laneNotes) {
    steps[step] = 1;
    pitch[step] = note;
  }
  return {
    genre_id: "custom",
    bpm: 120,
    scale: "chromatic",
    resolution: "1/16",
    totalSteps: 16,
    tracks: [
      {
        track_id: "audio",
        laneId: "sampler-1",
        name: "VSCO Bassoon",
        instrument: "sampler",
        steps,
        velocity: new Array(16).fill(100),
        pitch,
        gate: new Array(16).fill(1),
        sample: { assetId: "vsco2ce:BassoonStac" },
      } as unknown as SequencerTrack,
    ],
  };
}

/** The control: the same pattern, with the lane's notes removed — nothing else about the arrangement changes. */
function controlPattern(pattern: SequencerPattern): SequencerPattern {
  return {
    ...pattern,
    tracks: pattern.tracks.map((track) => ({
      ...track,
      steps: track.steps.map(() => 0),
      pitch: (track.pitch ?? track.steps).map(() => null),
    })),
  };
}

/** The catalogue entry as `catalogueFromManifestText` builds it: the pinned source first, the mirror as the fallback. */
function vscoAsset(mirrorRoot: string): SampleAsset {
  return {
    assetId: "vsco2ce:BassoonStac",
    name: "Bassoon, staccato",
    kind: "one-shot",
    seconds: 29.458163,
    sfz: {
      url: "https://raw.githubusercontent.invalid/schollz/VSCO-2-CE/6dd651d55dde97fd4028699be9d4481f26917891/BassoonStac.sfz",
      fallbackUrl: `${mirrorRoot}/vsco2ce/BassoonStac.sfz`,
      path: "BassoonStac.sfz",
    },
  };
}

function installGraph(): () => void {
  const g = globalThis as { OfflineAudioContext?: unknown; window?: { OfflineAudioContext?: unknown } };
  const previousGlobal = g.OfflineAudioContext;
  const previousWindow = g.window?.OfflineAudioContext;
  g.OfflineAudioContext = MixingOfflineAudioContext;
  if (g.window) g.window.OfflineAudioContext = MixingOfflineAudioContext;
  return () => {
    g.OfflineAudioContext = previousGlobal;
    if (g.window) g.window.OfflineAudioContext = previousWindow;
  };
}

let mirror: Awaited<ReturnType<typeof startMirror>>;
let restoreGraph: () => void;
/**
 * The real `fetch`, captured before any stub.
 *
 * The mirror is a **local HTTP server** in this file, and the loader's production `fetchSfzText`/decoder use the global `fetch` — so the stub that
 * makes the pinned source unreachable has to hand every other address to the real implementation. Capturing it here rather than calling `fetch`
 * inside the stub is also what stops the stub from recursing into itself (which the first version did, and which surfaces as "Maximum call stack
 * size exceeded" rather than as anything about the network).
 */
let realFetch: typeof fetch;

beforeEach(async () => {
  realFetch = globalThis.fetch;
  mirror = await startMirror();
  restoreGraph = installGraph();
  setGs1OfflineCapability("unmeasured");
  /**
   * The pinned source is `raw.githubusercontent.invalid`, so this stub is what makes the test measure the **mirror** path — the one whose response
   * headers a `curl` cannot check. It is installed for both cases and left in place for the render, so every SFZ and sample request below is
   * answered by the local server.
   */
  vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("raw.githubusercontent.invalid")) return Promise.reject(new TypeError("Failed to fetch"));
    return realFetch(input as never, init);
  });
});
afterEach(async () => {
  restoreGraph();
  resetGs1OfflineCapability();
  vi.unstubAllGlobals();
  await new Promise<void>((resolve) => mirror.server.close(() => resolve()));
});

describe("a VSCO 2 CE sampler lane", () => {
  it("resolves a note through the mirror, at the address the file names, and percent-encodes `#`", async () => {
    /**
     * The loader is driven directly here, because this is the half the report could only see as "neither address served the SFZ": the **source**
     * is deliberately unresolvable, so every request below went to the mirror — and the mirror address is the one `curl` sees 200 for.
     *
     * The decoder is the browser's own (`browserSampleDecoder`), not a stub returning a buffer: it is what fetches the sample's bytes and turns
     * them into an `AudioBuffer`, so the address asserted below is the address **the decoder asked for**, not one this test composed.
     */
    const context = new MixingOfflineAudioContext(1, SAMPLE_FRAMES, SAMPLE_RATE);
    const assets = [vscoAsset(mirror.root)];
    const loader = createSampleLoader(browserSampleDecoder(context as unknown as BaseAudioContext), assets);

    const note = await loader.loadNote("vsco2ce:BassoonStac", 62);
    expect(mirror.sfzRequests()).toBe(1);
    // `#` starts a fragment, so an unencoded name silently requests the file *before* the `#` — the failure mode `encodeSamplePath` exists for.
    expect(mirror.requested).toContain("/vsco2ce/Woodwinds/Bassoon/stac/PSBassoon_D%232_v2_rr1.wav");
    // And the backslash `default_path` joined to a bare file name, where the report's library writes both.
    expect(note.samplePath).toBe("Woodwinds/Bassoon/stac/PSBassoon_D#2_v2_rr1.wav");
    expect(note.rootKey).toBe(60);
    expect(note.ratio).toBeCloseTo(2 ** ((62 - 60) / 12), 6);
  });

  it("renders the lane into the exported WAV, measurably different from the same arrangement with the lane silent", async () => {
    const pattern = vscoPattern();
    const assets = [vscoAsset(mirror.root)];

    let report: { lanes: unknown[]; events: number; problems: unknown[] } | undefined;
    const exported = await exportMasterWav(pattern, "custom", {
      audioLaneCatalogue: assets,
      onAudioLanes: (laneReport) => {
        report = laneReport as unknown as typeof report;
      },
    });
    const laneSamples = decodeWavBytes(new Uint8Array(await exported.blob.arrayBuffer()));
    // The lane's own graph, captured before any control render replaces `lastInstance`.
    const laneContext = MixingOfflineAudioContext.lastInstance as MixingOfflineAudioContext;

    const control = controlPattern(pattern);
    const controlExported = await exportMasterWav(control, "custom", { audioLaneCatalogue: assets });
    const controlSamples = decodeWavBytes(new Uint8Array(await controlExported.blob.arrayBuffer()));

    const laneEnergy = energyOf(laneSamples);
    const lanePeakDb = samplePeakDb([laneSamples]);
    const controlEnergy = energyOf(controlSamples);
    const l1 = bandL1(laneSamples, controlSamples, SAMPLE_RATE);

    // eslint-disable-next-line no-console
    console.log(
      `MEASURED laneEnergy=${laneEnergy.toExponential(4)} lanePeakDb=${lanePeakDb.toFixed(2)} dB ` +
        `controlEnergy=${controlEnergy} L1(lane,control)=${l1.toFixed(3)} dB`
    );

    // The lane's own report, first: a lane that failed to resolve says so here rather than only in the file.
    expect(report?.problems).toEqual([]);
    expect(report?.events).toBe(4);
    expect(report?.lanes).toHaveLength(1);

    /**
     * ⭐ **Non-silent and different from the control.** If the lane's sample never reached the mix these both collapse: the audio-lane path is the
     * only thing that can write to an `audio` track, and the control — the identical arrangement with the identical assets and no lane notes —
     * must therefore be *exactly* silent. That zero is what makes the difference attributable to the lane and not to a default instrument.
     */
    expect(laneEnergy, `lane energy = ${laneEnergy}`).toBeGreaterThan(0);
    expect(lanePeakDb, `lane peak = ${lanePeakDb.toFixed(2)} dB`).toBeGreaterThan(-60);
    // No other lane in either render carries a sample or a synth voice, so this is a hard zero rather than a small number.
    expect(controlEnergy, `control energy = ${controlEnergy}`).toBe(0);
    /**
     * ⭐ **The guard that a per-band tolerance cannot be.** Read against the measured numbers rather than invented: `docs/HEADLESS_CORE_PLAN.md`
     * puts a silently-fallen-back GS-1 host at ~10 dB L1 and chose a 5 dB floor, because a failed voice can move one band by as little as
     * 0.71 dB. A lane that was replaced by a default instrument, or dropped, lands at or below the control's own value — so 5 dB excludes both.
     */
    expect(l1, `13-band L1 lane vs control = ${l1.toFixed(2)} dB (energy ${laneEnergy.toExponential(3)} vs ${controlEnergy})`).toBeGreaterThan(5);

    // The wrong sound is gone: the lane has notes on the grid, so a `track_id: "audio"` fallthrough would have built oscillators here.
    expect(laneContext.createdOscillators).toHaveLength(0);

    /**
     * ⭐ **Criterion ①: every voice the lane started carries an end.** The assertion recorded verbatim in
     * `docs/MUSE_REPORT_2026-10-01.md` §7, restored now that the scheduler gives a note a length.
     *
     * It reads **both** ways a `BufferSource` accepts an end — the third argument of `start`, which is the shape this fix
     * uses, and a numeric `stop(when)`. A `stop()` with **no** argument is not an end: the specification reads it as "as soon
     * as possible", so it names no time and cannot be the note's length. Before the fix, all four lane voices were started
     * with neither, the note rang until the render ended, and the three assertions above were green throughout.
     */
    const numbered = (when: number | undefined): when is number => typeof when === "number";
    const voicesWithoutAnEnd = laneContext.createdBufferSources
      .filter((source) => source.started.length > 0)
      .filter((source) => source.started.every((entry) => entry.duration === undefined) && !source.stopCalls.some(numbered))
      .map((source) => source.started.filter((entry) => entry.duration === undefined));
    expect(voicesWithoutAnEnd, "a lane voice was started and never given a stop time, so the note has no end").toEqual([]);
    // Four notes, four voices — the count that makes the assertion above about the lane rather than about one note.
    expect(laneContext.createdBufferSources.filter((source) => source.started.length > 0)).toHaveLength(4);

    /**
     * ⭐ **Criterion ②: the note's end reaches the file, not just the call log.**
     *
     * The fixture's notes are half a second apart and its sample is 1.2 seconds long, so a voice with no scheduled end is still
     * sounding through the next three notes — the drone as a listener meets it. The window sits well after the first note's
     * scheduled end (one 1/16 step of 0.125 s) and well before the second note's onset (0.5 s), so it must be silent.
     *
     * The floor is the file's existing audible/inaudible line (−60 dBFS, the one `lanePeakDb` is read against) and the two
     * measurements are far apart on either side of it: **−Infinity dBFS** (exact digital silence) with the note's end scheduled,
     * and **−1.82 dBFS** in the same window when the planner states no length and the voice runs to the end of its bytes. The
     * control's own hard zero is what makes the difference attributable to the lane rather than to another track.
     */
    const gapPeakDb = windowPeakDb(laneSamples, 0.3, 0.45);
    // eslint-disable-next-line no-console
    console.log(`MEASURED gapPeak(0.30–0.45 s)=${gapPeakDb.toFixed(2)} dBFS`);
    expect(gapPeakDb, `peak between the first two notes = ${gapPeakDb.toFixed(2)} dBFS`).toBeLessThan(-60);
  });

  it("gives a note the recording outlasts an end through a ramp, and leaves a note whose own bytes outlast it alone", async () => {
    /**
     * ⭐ **The owner's rider ①, at the seam where it was wired: `WavExporter`'s sampler sink.**
     *
     * The mechanism (`releaseSeconds`) has its own criteria in `samplerVoice.test.ts`; what neither they
     * nor the plan can see is **whether the export path asks for it**. It asks on a measured condition —
     * `seconds < buffer.duration / ratio`, i.e. "this voice is cut off while the recording still had sound
     * in it" — so this test drives the real export twice: once with the fixture's own 0.1 s notes against a
     * 1.2 s recording (cut short → a ramp), and once with a gate longer than any recording the fixture can
     * resolve (nothing is cut → the old `start(when, 0, seconds)`).
     *
     * Why the second half matters as much as the first: a percussive hit whose bytes end before the written
     * gate *is not truncated by anybody*, and fading it would shorten a sound nobody cut. A one-line
     * unconditional wiring would pass the first half and quietly change every drum export.
     */
    const assets = [vscoAsset(mirror.root)];

    const renderAndCapture = async (pattern: SequencerPattern) => {
      await exportMasterWav(pattern, "custom", { audioLaneCatalogue: assets });
      const context = MixingOfflineAudioContext.lastInstance as MixingOfflineAudioContext;
      return context.createdBufferSources.filter((source) => source.started.length > 0);
    };

    const cut = await renderAndCapture(vscoPattern());
    expect(cut, "the fixture's four notes are four voices").toHaveLength(4);
    for (const source of cut) {
      const start = source.started[0]!;
      const gain = (source.outgoing[0]?.node as FakeGainNode).gain;
      // No scheduled length: the recording is started whole and the *gain* carries the end.
      expect(start.duration, "a cut-short note is given an end, not a length").toBeUndefined();
      const ramp = gain.events.find((event) => event.type === "linearRampToValueAtTime");
      expect(ramp, "the voice is ramped rather than cut").toBeTruthy();
      expect(ramp!.value, "the ramp reaches silence").toBe(0);
      // The note's end is the same second it always was (one step of 0.125 s), reached through a ramp.
      expect(ramp!.time).toBeCloseTo(start.when + 0.125, 6);
      // And the scheduled `stop` lands *after* the ramp, so it cannot cut through the fade it exists for.
      const stop = source.stopCalls.filter((when): when is number => typeof when === "number");
      expect(stop).toHaveLength(1);
      expect(stop[0]!).toBeGreaterThan(ramp!.time);
    }

    /**
     * The negative control: the same lane with a gate longer than the whole 1.2-second recording at every
     * ratio the fixture resolves (the largest is 1.2 / 0.5 = 2.4 s, and 40 steps of 1/16 at 120 bpm is 5 s).
     */
    const long = vscoPattern();
    for (const track of long.tracks) track.gate = new Array(16).fill(40);
    const whole = await renderAndCapture(long);
    expect(whole, "the control still starts four voices").toHaveLength(4);
    for (const source of whole) {
      const start = source.started[0]!;
      const gain = (source.outgoing[0]?.node as FakeGainNode).gain;
      expect(start.duration, "a note the recording does not reach keeps its scheduled length").toBeCloseTo(5, 6);
      expect(
        gain.events.filter((event) => event.type === "linearRampToValueAtTime"),
        "nothing is faded that nobody truncated"
      ).toEqual([]);
    }
  });
});
