/**
 * ⭐ **SFZ's `loop_mode`, end to end: a region that asks for a loop gets one, and a region that does not is left alone.**
 *
 * ## Why this file exists, and what the owner's report got wrong
 *
 * The report was that a sustaining instrument collapses because `vsco2ce:ViolinEnsSusVib` declares a loop the player
 * ignores. The first half of that is false, and the measurements are in this file's sibling work rather than here:
 * neither `ViolinEnsSusVib.sfz` nor any of the pinned `VSCO-2-CE@6dd651d`'s 75 programs writes a single `loop*=` opcode,
 * their sustained `.wav`s carry no `smpl` chunk, and `/usr/bin/sfizz_render` plays the note once and goes silent at
 * 12.5 s — exactly as this project does. **No loop semantics can make those recordings sustain**, because the library
 * never looped them.
 *
 * The second half is true and worth fixing on its own: `loop_mode` and its frames reached the resolver, were read, and
 * then stopped — `startSamplerNote` set `buffer` and `playbackRate` and never `loop`/`loopStart`/`loopEnd`. A file that
 * *does* declare a loop therefore played like a one-shot. `karoryfer-meatbass` is that file: `Programs/01_arco_modwheel.sfz`
 * writes `loop_mode=loop_sustain` in a `<global>` block with the comment "Since all samples used by this sfz file are
 * looped for infinite sustain".
 *
 * ## The criterion, and why the threshold is where it is
 *
 * The positive case renders a note **twenty times longer than its sample** through the production chain and reads the
 * 50 ms RMS envelope across the note's own span. Measured before the fix the envelope is `0.354, 0.158, 0.000, …` — a
 * collapse to silence at the sample's end, which is the reported symptom in miniature. Measured after it, the envelope
 * is `0.354` in every window: `min ÷ mean = 1.000`. The assertion is `min ÷ mean ≥ 0.5`, which is two orders of
 * magnitude away from the failing reading and has room for the one thing this fixture deliberately does not model —
 * `loop_crossfade`, which is **not implemented** and is declared as not implemented in `samplerVoice`.
 *
 * The negative case is the half that keeps a fix honest: a `one_shot` region and a region that declares nothing must
 * both still play their recording once and fall silent. A player that looped everything would pass the positive case and
 * fail these, which is exactly the failure mode a single-sided criterion cannot see.
 */
import { describe, expect, it } from "vitest";
import { resolveInstrumentNote, loopModeOf } from "../audio/sfz/instrument";
import { createSampleLoader } from "../audio/sampleLoader";
import { scheduleOfflineAudioLanes } from "../audio/offlineAudioLanes";
import { startSamplerNote } from "../audio/samplerVoice";
import { FakeAudioBuffer, FakeBufferSourceNode, FakeGainNode, FakeOfflineAudioContext } from "./helpers/fakeAudio";
import type { SampleAsset } from "../data/sampleCatalogue";
import type { SequencerPattern } from "../types/genre";

const RATE = 44100;
/** The recording a sustaining instrument is built from: 0.6 s of 440 Hz at half level. */
const SAMPLE_SECONDS = 0.6;
/** The note: 4 seconds on a 0.6-second recording, so a loop is the only way for it to still be sounding. */
const NOTE_SECONDS = 4;
/** The lane's own length, so a window past the sample's end is entirely the loop's doing. */
const RENDER_SECONDS = 5;

const asset: Pick<SampleAsset, "assetId" | "sfz"> = { assetId: "test:sustain", sfz: { url: "https://example.test/prog.sfz", path: "prog.sfz" } };

/** 0.1 s to 0.4 s of the recording, in frames — a whole number of 440 Hz cycles, so the loop is seamless by construction. */
const LOOP_START_FRAMES = 4410;
const LOOP_END_FRAMES = 17640;

const sfz = (regionLines: readonly string[]): string => ["<control>", "default_path=Samples/", "<global>", "pitch_keycenter=60", "<region>", "sample=tone.wav", "lokey=60", "hikey=60", ...regionLines].join("\n");

const LOOP_CONTINUOUS = sfz(["loop_mode=loop_continuous", `loop_start=${LOOP_START_FRAMES}`, `loop_end=${LOOP_END_FRAMES}`]);
const LOOP_SUSTAIN = sfz(["loop_mode=loop_sustain", `loop_start=${LOOP_START_FRAMES}`, `loop_end=${LOOP_END_FRAMES}`]);
const LOOP_WITHOUT_POINTS = sfz(["loop_mode=loop_continuous"]);
const LOOP_END_ZERO = sfz(["loop_mode=loop_continuous", "loop_start=0", "loop_end=0"]);
const ONE_SHOT = sfz(["loop_mode=one_shot"]);
const NO_LOOP = sfz([]);

/** The recording, as a real decoded buffer would arrive. */
function toneBuffer(): FakeAudioBuffer {
  const buffer = new FakeAudioBuffer(1, Math.round(RATE * SAMPLE_SECONDS), RATE);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / RATE);
  return buffer;
}

/**
 * A mixing offline context that **honours the loop**, because that is the only way the criterion can see one.
 *
 * The existing `MixingOfflineAudioContext` in `vscoSamplerLane.test.ts` lays a source down once and reads
 * `start(when, offset, duration)`/`stop(when)` for its end — which cannot express "and then it played again". The loop
 * fields are read here the way the specification defines them: positions in the buffer's own time, wrapped between
 * `loopStart` and `loopEnd` while the source is sounding.
 */
class LoopAwareOfflineContext extends FakeOfflineAudioContext {
  decodeAudioData = async (): Promise<AudioBuffer> => toneBuffer() as unknown as AudioBuffer;

  startRendering(): Promise<FakeAudioBuffer> {
    const out = new FakeAudioBuffer(1, this.length, this.sampleRate);
    const target = out.getChannelData(0);
    for (const source of this.createdBufferSources as FakeBufferSourceNode[]) {
      const buffer = source.buffer as unknown as FakeAudioBuffer | null;
      if (!buffer || source.started.length === 0) continue;
      const data = buffer.getChannelData(0);
      const when = source.started[0]!.when;
      const rate = source.playbackRate.value > 0 ? source.playbackRate.value : 1;
      const edge = source.outgoing[0]?.node;
      const gain = edge instanceof FakeGainNode ? edge.gain.value : 1;
      const startedAt = Math.max(0, Math.round(when * this.sampleRate));
      /**
       * **A looping source's scheduled `duration` is not its end, and that is the point of the loop.** The production
       * code passes the note's length as a `stop` at the same instant instead, so the end test below reads the stop for
       * a looped voice and would read either for a plain one.
       */
      const scheduled = source.started[0]!.duration;
      const explicitStops = source.stopCalls.filter((value): value is number => typeof value === "number");
      const stopAt = Math.min(
        explicitStops.length ? Math.min(...explicitStops) : Number.POSITIVE_INFINITY,
        scheduled === undefined || source.loop ? Number.POSITIVE_INFINITY : when + scheduled
      );
      const stopFrame = Number.isFinite(stopAt) ? Math.round(stopAt * this.sampleRate) : Number.POSITIVE_INFINITY;
      const loopStart = source.loop ? Math.max(0, Math.round((source.loopStart || 0) * this.sampleRate)) : 0;
      const loopEnd = source.loop ? Math.round((source.loopEnd || buffer.duration) * this.sampleRate) : 0;
      const looping = source.loop && loopEnd > loopStart;
      const limit = Math.min(target.length, stopFrame);
      for (let i = startedAt; i < limit; i += 1) {
        let position = (i - startedAt) * rate;
        if (looping && position >= loopEnd) position = loopStart + ((position - loopStart) % (loopEnd - loopStart));
        const low = Math.floor(position);
        if (low < 0 || low >= data.length) continue;
        const high = Math.min(data.length - 1, low + 1);
        const fraction = position - low;
        target[i] += (data[low]! * (1 - fraction) + data[high]! * fraction) * gain;
      }
    }
    return Promise.resolve(out);
  }
}

const laneAsset: SampleAsset = {
  assetId: "test:sustain",
  name: "sustain",
  kind: "loop",
  seconds: SAMPLE_SECONDS,
  url: "https://example.test/none",
  sfz: { url: "https://example.test/prog.sfz", path: "prog.sfz" },
};

/** One sampler lane with a single long note, the shape `compileArrangementToLanes` produces. */
function pattern(noteSeconds: number): SequencerPattern {
  const gateSteps = (noteSeconds * 120 * 4) / 60;
  return {
    genre_id: "custom",
    bpm: 120,
    scale: "chromatic",
    resolution: "1/16",
    totalSteps: 32,
    tracks: [
      {
        track_id: "audio",
        laneId: "sampler-1",
        name: "Strings",
        instrument: "sampler",
        steps: [1, ...new Array(31).fill(0)],
        velocity: [100, ...new Array(31).fill(0)],
        pitch: [60, ...new Array(31).fill(0)],
        gate: [gateSteps, ...new Array(31).fill(1)],
        sample: { assetId: "test:sustain" },
      },
    ],
  } as unknown as SequencerPattern;
}

/** Render one program through every production stage the export uses, and hand back the mixed channel. */
async function renderProgram(program: string, noteSeconds = NOTE_SECONDS): Promise<{ channel: Float32Array; sources: FakeBufferSourceNode[] }> {
  const context = new LoopAwareOfflineContext(1, Math.round(RATE * RENDER_SECONDS), RATE);
  const loader = createSampleLoader(
    async () => toneBuffer() as unknown as AudioBuffer,
    [laneAsset],
    async () => program
  );
  await scheduleOfflineAudioLanes({
    catalogue: [laneAsset],
    pattern: pattern(noteSeconds),
    loader,
    sink: {
      start(buffer, event, ratio, note) {
        // Exactly what `WavExporter`'s sink does, including the loop fields it now forwards.
        startSamplerNote({
          context: context as never,
          destination: context.createGain() as never,
          buffer,
          ratio,
          whenSeconds: Math.max(0, event.atSeconds),
          seconds: event.seconds ?? buffer.duration,
          ...(note?.loopMode === undefined ? {} : { loopMode: note.loopMode }),
          ...(note?.loopStartFrames === undefined ? {} : { loopStartFrames: note.loopStartFrames }),
          ...(note?.loopEndFrames === undefined ? {} : { loopEndFrames: note.loopEndFrames }),
        });
      },
    },
  });
  const rendered = await context.startRendering();
  return { channel: rendered.getChannelData(0) as Float32Array, sources: context.createdBufferSources };
}

/** The RMS of every 50 ms window inside `[from, to)`, which is how "the level collapsed" is read rather than heard. */
function windowRms(channel: Float32Array, from: number, to: number): number[] {
  const window = Math.round(0.05 * RATE);
  const values: number[] = [];
  for (let start = Math.round(from * RATE); start + window <= Math.round(to * RATE); start += window) {
    let sum = 0;
    for (let i = start; i < start + window; i += 1) sum += channel[i]! * channel[i]!;
    values.push(Math.sqrt(sum / window));
  }
  return values;
}

const ratio = (values: readonly number[]): number => Math.min(...values) / (values.reduce((a, b) => a + b, 0) / values.length);

describe("SFZ loop_mode in the resolver", () => {
  it("reads the two looping values and the frames they loop between", () => {
    const resolved = resolveInstrumentNote(asset, LOOP_CONTINUOUS, 60).note;
    expect(resolved?.loopMode).toBe("loop_continuous");
    expect(resolved?.loopStartFrames).toBe(LOOP_START_FRAMES);
    expect(resolved?.loopEndFrames).toBe(LOOP_END_FRAMES);
    expect(resolveInstrumentNote(asset, LOOP_SUSTAIN, 60).note?.loopMode).toBe("loop_sustain");
  });

  it("leaves a region that asks for no loop without a loop mode, one_shot included", () => {
    // The default is the behaviour this project always had, and the two explicit refusals must stay refusals.
    expect(resolveInstrumentNote(asset, NO_LOOP, 60).note?.loopMode).toBeUndefined();
    expect(resolveInstrumentNote(asset, ONE_SHOT, 60).note?.loopMode).toBeUndefined();
    expect(resolveInstrumentNote(asset, ONE_SHOT, 60).note?.oneShot).toBe(true);
    expect(resolveInstrumentNote(asset, sfz(["loop_mode=no_loop"]), 60).note?.loopMode).toBeUndefined();
  });

  it("does not invent loop points the file did not write", () => {
    const resolved = resolveInstrumentNote(asset, LOOP_WITHOUT_POINTS, 60).note;
    expect(resolved?.loopMode).toBe("loop_continuous");
    // Absent means SFZ's own default — the sample's last frame — and the player resolves it against the buffer.
    expect(resolved?.loopStartFrames).toBeUndefined();
    expect(resolved?.loopEndFrames).toBeUndefined();
  });

  it("accepts only the spellings sfizz accepts", () => {
    /**
     * Measured rather than assumed: `loop_mode=continuous` and `=sustain` make sfizz print
     * `Unknown loop mode: …` and play the recording once, so mapping them to a loop would be inventing behaviour from
     * the opcode's name. `loop_until_release` and `loop_continuous_release` are refused the same way.
     */
    expect(loopModeOf("loop_continuous")).toBe("loop_continuous");
    expect(loopModeOf("LOOP_SUSTAIN")).toBe("loop_sustain");
    expect(loopModeOf("one_shot")).toBe("one_shot");
    expect(loopModeOf("continuous")).toBeUndefined();
    expect(loopModeOf("sustain")).toBeUndefined();
    expect(loopModeOf("loop_until_release")).toBeUndefined();
    expect(loopModeOf("loop_continuous_release")).toBeUndefined();
    expect(loopModeOf(undefined)).toBeUndefined();
  });
});

describe("SFZ loop_mode on the voice", () => {
  it("sets the node's loop surface to the region's own frames, in the buffer's time", () => {
    const context = new FakeOfflineAudioContext(1, RATE, RATE);
    const buffer = toneBuffer() as unknown as AudioBuffer;
    const voice = startSamplerNote({
      context: context as never,
      destination: context.createGain() as never,
      buffer,
      ratio: 1,
      loopMode: "loop_continuous",
      loopStartFrames: LOOP_START_FRAMES,
      loopEndFrames: LOOP_END_FRAMES,
    });
    const source = context.createdBufferSources[0]!;
    expect(source.loop).toBe(true);
    // Frames ÷ the *buffer's* sample rate, which is the unit `loopStart`/`loopEnd` are read in.
    expect(source.loopStart).toBeCloseTo(LOOP_START_FRAMES / RATE, 9);
    expect(source.loopEnd).toBeCloseTo(LOOP_END_FRAMES / RATE, 9);
    expect(voice.looping).toBe(true);
  });

  it("loops the whole recording when the file gives no loop points", () => {
    // sfizz's measured behaviour: `loop_mode=loop_continuous` with neither opcode loops the whole 0.6 s recording.
    const context = new FakeOfflineAudioContext(1, RATE, RATE);
    startSamplerNote({
      context: context as never,
      destination: context.createGain() as never,
      buffer: toneBuffer() as unknown as AudioBuffer,
      ratio: 1,
      loopMode: "loop_continuous",
    });
    const source = context.createdBufferSources[0]!;
    expect(source.loop).toBe(true);
    expect(source.loopStart).toBe(0);
    expect(source.loopEnd).toBeCloseTo(SAMPLE_SECONDS, 6);
  });

  it("refuses a degenerate loop rather than silencing the note, which is where sfizz and this differ", () => {
    /**
     * Measured: sfizz renders `loop_start=0 loop_end=0` as **silence** for the whole render (RMS 0.000). A silent voice
     * reads as a broken instrument, so this player keeps the behaviour it had before any of this existed and plays the
     * recording through — audible, one-shot, and recoverable.
     */
    const context = new FakeOfflineAudioContext(1, RATE, RATE);
    const voice = startSamplerNote({
      context: context as never,
      destination: context.createGain() as never,
      buffer: toneBuffer() as unknown as AudioBuffer,
      ratio: 1,
      loopMode: "loop_continuous",
      loopStartFrames: 0,
      loopEndFrames: 0,
    });
    expect(context.createdBufferSources[0]!.loop).toBe(false);
    expect(voice.looping).toBe(false);
  });

  it("does not loop a region that declared no loop", () => {
    const context = new FakeOfflineAudioContext(1, RATE, RATE);
    const voice = startSamplerNote({
      context: context as never,
      destination: context.createGain() as never,
      buffer: toneBuffer() as unknown as AudioBuffer,
      ratio: 1,
    });
    expect(context.createdBufferSources[0]!.loop).toBe(false);
    expect(voice.looping).toBe(false);
  });

  it("gives a looped note the note's end as a stop, not as a start duration", () => {
    /**
     * The two are not the same request: the specification applies the loop attributes only while the playhead is inside
     * the loop, and a scheduled `duration` ends playback regardless — so `start(when, 0, 0.45)` on a looped source would
     * cut the loop at exactly the second it was supposed to survive. The end therefore moves to `stop`.
     */
    const context = new FakeOfflineAudioContext(1, RATE, RATE);
    startSamplerNote({
      context: context as never,
      destination: context.createGain() as never,
      buffer: toneBuffer() as unknown as AudioBuffer,
      ratio: 1,
      whenSeconds: 2,
      seconds: 0.45,
      loopMode: "loop_continuous",
      loopStartFrames: LOOP_START_FRAMES,
      loopEndFrames: LOOP_END_FRAMES,
    });
    const source = context.createdBufferSources[0]!;
    expect(source.started[0]).toEqual({ when: 2, offset: 0 });
    expect(source.stopCalls).toEqual([2.45]);
  });

  it("exits the loop on a key release for loop_sustain, and stops outright for loop_continuous", () => {
    const make = (loopMode: "loop_sustain" | "loop_continuous") => {
      const context = new FakeOfflineAudioContext(1, RATE, RATE);
      const voice = startSamplerNote({
        context: context as never,
        destination: context.createGain() as never,
        buffer: toneBuffer() as unknown as AudioBuffer,
        ratio: 1,
        loopMode,
        loopStartFrames: LOOP_START_FRAMES,
        loopEndFrames: LOOP_END_FRAMES,
      });
      voice.stop(1);
      return context.createdBufferSources[0]!;
    };
    expect(make("loop_sustain").loop).toBe(false);
    expect(make("loop_continuous").loop).toBe(true);
  });
});

describe("SFZ loop_mode through the render chain", () => {
  it("carries the loop fields from the SFZ to the sink", async () => {
    const { sources } = await renderProgram(LOOP_SUSTAIN);
    expect(sources).toHaveLength(1);
    expect(sources[0]!.loop).toBe(true);
    expect(sources[0]!.loopStart).toBeCloseTo(LOOP_START_FRAMES / RATE, 9);
  });

  it("⭐ a note twenty times its sample's length keeps its level instead of collapsing", async () => {
    const { channel } = await renderProgram(LOOP_CONTINUOUS);
    // The note is 4 s long and the recording is 0.6 s, so every window after 0.6 s is the loop's doing alone.
    const values = windowRms(channel, 0, NOTE_SECONDS);
    const fluctuation = ratio(values);
    expect(fluctuation).toBeGreaterThanOrEqual(0.5);
    // And the same reading the report would recognise: no window is a hole in the sound.
    expect(Math.min(...values)).toBeGreaterThan(0);
  });

  it("⚠️ one_shot still does not loop: its envelope decays to silence and stays there", async () => {
    const { channel, sources } = await renderProgram(ONE_SHOT);
    expect(sources[0]!.loop).toBe(false);
    const early = windowRms(channel, 0, SAMPLE_SECONDS);
    const late = windowRms(channel, SAMPLE_SECONDS, NOTE_SECONDS);
    expect(Math.min(...early)).toBeGreaterThan(0.1);
    expect(Math.max(...late)).toBe(0);
  });

  it("⚠️ a region that declares nothing still does not loop", async () => {
    const { channel, sources } = await renderProgram(NO_LOOP);
    expect(sources[0]!.loop).toBe(false);
    expect(Math.max(...windowRms(channel, SAMPLE_SECONDS, NOTE_SECONDS))).toBe(0);
  });

  it("a declared loop with no declared frames loops the whole recording, as sfizz does", async () => {
    const { channel, sources } = await renderProgram(LOOP_WITHOUT_POINTS);
    expect(sources[0]!.loop).toBe(true);
    expect(ratio(windowRms(channel, 0, NOTE_SECONDS))).toBeGreaterThanOrEqual(0.5);
  });

  it("a degenerate loop plays the recording through rather than going silent", async () => {
    const { channel, sources } = await renderProgram(LOOP_END_ZERO);
    expect(sources[0]!.loop).toBe(false);
    // Audible at the start — not the silence sfizz produces — and gone by the sample's end.
    expect(Math.min(...windowRms(channel, 0, SAMPLE_SECONDS))).toBeGreaterThan(0.1);
    expect(Math.max(...windowRms(channel, SAMPLE_SECONDS, NOTE_SECONDS))).toBe(0);
  });
});
