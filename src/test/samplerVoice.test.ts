/**
 * The sampler voice: one recording, played at the rate the note asks for.
 *
 * The criterion that matters is the one the missing link failed: **the rate reaches the source.** Everything upstream — parsing the SFZ, choosing the region, computing the ratio, decoding the sample — was already judged, and none of it could be heard
 * because the buffer was played at its recorded pitch.
 */
import { describe, expect, it } from "vitest";
import { startSamplerNote } from "../audio/samplerVoice";
import { FakeAudioBuffer, FakeAudioContext } from "./helpers/fakeAudio";

const buffer = new FakeAudioBuffer(1, 48000, 48000) as unknown as AudioBuffer;

describe("starting a sampler note", () => {
  it("plays the buffer at the ratio, which is what makes it a note rather than a recording", () => {
    const context = new FakeAudioContext();
    const voice = startSamplerNote({ context: context as never, destination: context.createGain() as never, buffer, ratio: 2 });
    // One octave up is a rate of exactly two, read off the node rather than inferred from the call.
    expect(context.createdBufferSources).toHaveLength(1);
    expect(context.createdBufferSources[0]!.playbackRate.value).toBe(2);
    expect(voice.ratio).toBe(2);
  });

  it("refuses a rate that is not a pitch, rather than producing a source that cannot advance", () => {
    // Zero, negative and NaN are arithmetic mistakes upstream; playing at 1 is the safe reading, and the reported ratio says so.
    for (const ratio of [0, -2, Number.NaN]) {
      const context = new FakeAudioContext();
      const voice = startSamplerNote({ context: context as never, destination: context.createGain() as never, buffer, ratio });
      expect(voice.ratio).toBe(1);
      expect(context.createdBufferSources[0]!.playbackRate.value).toBe(1);
    }
  });

  it("applies the track's level to the voice, so an audition sounds mixed rather than dry", () => {
    const context = new FakeAudioContext();
    startSamplerNote({ context: context as never, destination: context.createGain() as never, buffer, ratio: 1, gainDb: -6 });
    const gain = context.createdGains.at(-1)!;
    // −6 dB is about 0.5, and the assertion is on the audible quantity rather than on the formula.
    expect(gain.gain.value).toBeCloseTo(0.501, 2);
  });

  it("starts at the given time and for the given length, and can be stopped", () => {
    const context = new FakeAudioContext();
    const voice = startSamplerNote({ context: context as never, destination: context.createGain() as never, buffer, ratio: 1, whenSeconds: 1.5, seconds: 0.25 });
    const source = context.createdBufferSources[0]!;
    expect(source.started).toEqual([{ when: 1.5, offset: 0, duration: 0.25 }]);
    // A key release stops it, and stopping twice is not an error: a fast press-and-release reaches that state.
    voice.stop(2);
    voice.stop(2);
    expect(source.stopCalls.length).toBe(2);
  });

  it("plays the whole sample when no length is given, which is what a held key means", () => {
    const context = new FakeAudioContext();
    startSamplerNote({ context: context as never, destination: context.createGain() as never, buffer, ratio: 1 });
    expect(context.createdBufferSources[0]!.started[0]!.duration).toBeUndefined();
  });
});

/**
 * ⭐ **A release ends a note through a ramp instead of a step.**
 *
 * Without it, `seconds` reaches `source.start(when, 0, seconds)` and the Web Audio specification ends playback at that
 * instant — the waveform is truncated mid-cycle, which is a step, and a step is a click. Where two chords dovetail (the
 * previous still sounding as the next begins) that click is heard as the sustained bed breaking, which is the defect
 * this exists for. The SFZ sources for the shape are `ampeg_release` under `off_mode=normal`, and `off_mode=time` +
 * `off_time`.
 *
 * **Measured on the real recording** (`VlnEns_susVib_D3_v1.wav`, a 4.25 s note at 120 bpm, evaluated through a
 * schedule-faithful render): the largest sample-to-sample step in the note's last 60 ms falls from **3.4× the signal's
 * own median step to 0.7×**, with the note still ending at the same second.
 */
describe("the release a note can be given", () => {
  it("fades the note out rather than cutting it, and still ends it at the same instant", () => {
    const context = new FakeAudioContext();
    startSamplerNote({
      context: context as never,
      destination: context.createGain() as never,
      buffer,
      ratio: 1,
      whenSeconds: 1,
      seconds: 2,
      releaseSeconds: 0.25,
    });
    const source = context.createdBufferSources[0]!;
    const gain = context.createdGains.at(-1)!;
    /**
     * The recording is started with **no scheduled length** — that duration is what hard-cuts it — and the end is
     * scheduled instead, a hair after the ramp reaches zero so the stop lands after the fade rather than through it.
     */
    expect(source.started).toEqual([{ when: 1, offset: 0 }]);
    expect(source.stopCalls).toEqual([3.005]);
    // The ramp is scheduled to begin a quarter of a second before the note's end and reach zero exactly at it.
    expect(gain.gain.events).toEqual([
      { type: "setValueAtTime", value: 1, time: 2.75 },
      { type: "linearRampToValueAtTime", value: 0, time: 3 },
    ]);
  });

  /**
   * ⭐ **A release may never be a large fraction of the note it releases.**
   *
   * Measured on this repository's own VSCO lane fixture, whose notes are **0.125 s**: an unclamped 0.25 s release made
   * the whole note a fade, and the criterion that measures that lane's energy came back byte-identical to the cut it
   * replaced. The shape wanted is "full level, then a quick fall", so the window is at most 40% of the note.
   */
  it("shortens the release rather than the note when the note is shorter than the release", () => {
    const context = new FakeAudioContext();
    startSamplerNote({
      context: context as never,
      destination: context.createGain() as never,
      buffer,
      ratio: 1,
      whenSeconds: 0,
      seconds: 0.125,
      releaseSeconds: 0.25,
    });
    const gain = context.createdGains.at(-1)!;
    // 40% of 0.125 s is 0.05 s, so the ramp begins at 0.075 s and the note still ends at 0.125 s.
    expect(gain.gain.events).toEqual([
      { type: "setValueAtTime", value: 1, time: 0.075 },
      { type: "linearRampToValueAtTime", value: 0, time: 0.125 },
    ]);
    expect(context.createdBufferSources[0]!.stopCalls).toEqual([0.13]);
  });

  /** A note whose end is already scheduled must not be hard-cut by a later `stop` — that is the click the release removed. */
  it("does not let a key release cut into a scheduled fade", () => {
    const context = new FakeAudioContext();
    const voice = startSamplerNote({
      context: context as never,
      destination: context.createGain() as never,
      buffer,
      ratio: 1,
      whenSeconds: 1,
      seconds: 2,
      releaseSeconds: 0.25,
    });
    // The end is already scheduled, so this must not add a second `stop` inside the ramp.
    voice.stop(1.5);
    expect(context.createdBufferSources[0]!.stopCalls).toEqual([3.005]);
    // And the voice is still on its way out, so a later stop cannot resurrect it.
    expect(voice.ended).toBe(true);
  });
});
