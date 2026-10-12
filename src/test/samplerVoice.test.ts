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

/**
 * ⭐⭐ **Carrying a sounding voice into the next note — the mechanism behind "overlap is not legato".**
 *
 * The owner heard the strings break at chord changes and located it to one instant
 * (`docs/STRING_TECHNIQUES.md` §9): the previous chord is still sounding, and every new note starts **its own
 * attack**. A player does not do that when the bow has not stopped — the pitch moves and the bow carries on — and
 * this is the node-level shape of that: the recording is not restarted, only its rate and its end move.
 *
 * The criteria below are the three ways it could be wrong: starting a second recording anyway (which is exactly the
 * defect), moving the pitch by rebuilding the voice (a new attack by another name), or jumping the gain (a click).
 */
describe("carrying a voice into the next note", () => {
  /** The level a parameter is at, at an instant — a linear ramp evaluated the way Web Audio evaluates it. */
  function valueAt(param: { events: Array<{ type: string; value: number; time: number }> }, time: number): number {
    let value = 0;
    let last: { value: number; time: number } | undefined;
    for (const event of param.events) {
      if (event.type === "linearRampToValueAtTime") {
        if (!last) value = event.value;
        else if (time >= event.time) value = event.value;
        else if (time <= last.time) value = last.value;
        else value = last.value + ((event.value - last.value) * (time - last.time)) / (event.time - last.time);
        last = { value: event.value, time: event.time };
        continue;
      }
      if (event.time > time) break;
      value = event.value;
      last = { value: event.value, time: event.time };
    }
    return value;
  }

  it("keeps the recording playing and moves its rate and its end, instead of starting a second one", () => {
    const context = new FakeAudioContext();
    const voice = startSamplerNote({
      context: context as never,
      destination: context.createGain() as never,
      buffer,
      ratio: 1,
      whenSeconds: 0,
      seconds: 4.25,
      releaseSeconds: 0.25,
    });
    const source = context.createdBufferSources[0]!;
    // The note it was started as: a ramp in its last quarter second, ending at 4.25 s.
    expect(source.stopCalls).toEqual([4.255]);

    const carried = voice.takeOver({ ratio: 1.1224620483, atSeconds: 4, endsAtSeconds: 8.25, releaseSeconds: 0.25 });
    expect(carried).toBe(true);
    /**
     * **One recording, one `start`.** The whole point: a second `AudioBufferSourceNode` here would be the attack the
     * owner heard, whatever else was done to it.
     */
    expect(context.createdBufferSources).toHaveLength(1);
    expect(source.started).toEqual([{ when: 0, offset: 0 }]);
    // The rate is held at what it was and then moved — two events at the same instant, the later one winning.
    expect(source.playbackRate.events).toEqual([
      { type: "setValueAtTime", value: 1, time: 4 },
      { type: "setValueAtTime", value: 1.1224620483, time: 4 },
    ]);
    expect(voice.ratio).toBe(1);
    expect(voice.currentRatio).toBe(1.1224620483);
    // The end moved from the old note's to the carried note's, by the specification's own rule that the last `stop` wins.
    expect(source.stopCalls).toEqual([4.255, 8.255]);
  });

  /**
   * ⭐ **The gain does not jump, and the reason is arithmetic rather than luck.**
   *
   * At the join the voice is at its own level, and that is also exactly where the previous note's release ramp
   * begins: the measured chord overlap is 0.25 s and `MIN_RELEASE_SECONDS` was set from that same measurement. So the
   * scheduled ramp is cancelled and the level is restored to what it had reached — the same number on both sides of
   * the instant, which is what "no click" means here.
   */
  it("does not jump the level at the join, even when a release ramp is already in flight", () => {
    const context = new FakeAudioContext();
    const voice = startSamplerNote({
      context: context as never,
      destination: context.createGain() as never,
      buffer,
      ratio: 1,
      whenSeconds: 0,
      seconds: 4.25,
      releaseSeconds: 0.25,
    });
    const gain = context.createdGains.at(-1)!;
    /** The ramp begins at 4.0 s and reaches zero at 4.25 s, so at 4.2 s it is a fifth of the way down. */
    const before = valueAt(gain.gain, 4.2);
    expect(before).toBeCloseTo(0.2, 6);
    voice.takeOver({ ratio: 1, atSeconds: 4.2, endsAtSeconds: 8.25, releaseSeconds: 0.25 });
    const after = valueAt(gain.gain, 4.2);
    // The value written at the join is where the ramp had reached — 0.2, not the voice's full level and not zero.
    expect(after).toBeCloseTo(before, 6);
    // And the ramp the take-over scheduled reaches zero at the carried note's own end.
    expect(gain.gain.events.at(-1)).toEqual({ type: "linearRampToValueAtTime", value: 0, time: 8.25 });
  });

  /**
   * ⭐ **A voice whose end is fixed inside the node is refused, not half-moved.**
   *
   * A note started with `start(when, 0, seconds)` has its length in the node: the specification's `duration` is the
   * seconds of buffer content to output, so a later `stop()` cannot pass it. Refusing is the only honest answer, and
   * it is what keeps a "join" from shortening the note it was supposed to carry.
   */
  it("refuses to carry a voice whose length was scheduled inside the node", () => {
    const context = new FakeAudioContext();
    const voice = startSamplerNote({
      context: context as never,
      destination: context.createGain() as never,
      buffer,
      ratio: 1,
      whenSeconds: 0,
      seconds: 4.25,
    });
    expect(context.createdBufferSources[0]!.started).toEqual([{ when: 0, offset: 0, duration: 4.25 }]);
    expect(voice.takeOver({ ratio: 2, atSeconds: 4, endsAtSeconds: 8.25 })).toBe(false);
    // Nothing was changed: no second `stop`, and the rate is where it was.
    expect(context.createdBufferSources[0]!.stopCalls).toEqual([]);
    expect(context.createdBufferSources[0]!.playbackRate.events).toEqual([]);
    expect(voice.currentRatio).toBe(1);
  });

  /** A voice that has already been choked or has run out is not carried: its recording is not sounding, so there is nothing to continue. */
  it("refuses to carry a voice that is no longer sounding", () => {
    const context = new FakeAudioContext();
    const voice = startSamplerNote({ context: context as never, destination: context.createGain() as never, buffer, ratio: 1, whenSeconds: 0 });
    voice.fadeOut(0.05);
    expect(voice.ended).toBe(true);
    expect(voice.takeOver({ ratio: 2, atSeconds: 0.1, endsAtSeconds: 4 })).toBe(false);
  });

  /** A caller that wants a portamento can ask for one; the default is a step, because a finger change is not a slide. */
  it("slides to the new rate only when the caller asks for a glide", () => {
    const context = new FakeAudioContext();
    const voice = startSamplerNote({
      context: context as never,
      destination: context.createGain() as never,
      buffer,
      ratio: 1,
      whenSeconds: 0,
      seconds: 4.25,
      releaseSeconds: 0.25,
    });
    voice.takeOver({ ratio: 2, atSeconds: 4, endsAtSeconds: 8.25, glideSeconds: 0.05 });
    expect(context.createdBufferSources[0]!.playbackRate.events.at(-1)).toEqual({
      type: "linearRampToValueAtTime",
      value: 2,
      time: 4.05,
    });
  });
});
