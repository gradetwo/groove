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
