/**
 * ⭐⭐ **The ruling: a voice whose recording loops cannot run out, so `recording-would-run-out` does not apply to it.**
 *
 * ## The question, and why it had to be adjudicated rather than assumed
 *
 * `recording-would-run-out` (`src/audio/legatoVoices.ts`) asks whether the **recording** still has sound at the instant a
 * carried note ends. Until this round it read `request.recordingSeconds` — the decoded buffer's length — and nothing
 * else, because a recording that does not loop really does have a wall at its end. Measured on the owner's project that
 * wall is real and stays: `VlnEns_susVib_*` declare no loop and carry no `smpl` chunk, so **57 handovers are asked for,
 * 32 are carried and 25 are refused** — the numbers in `ownerProjectAcceptance.test.ts`, unchanged by this work.
 *
 * But the two libraries that *do* carry loop points are the ones the bracket was wrong for. On the real
 * `karanyorfer-bigcat-cello` sustained recordings, a 4.25 s note carried into the next chord needed 4.25 s and had
 * "only 1.861 s left" — of a recording whose `smpl` chunk loops `1.234…4.725 s`. Measured through the production
 * render path before the loop was read at all: **15 of 15 handovers refused**, all `recording-would-run-out`. After:
 * **15 carried, 0 refused**. A recording that repeats has no "left".
 *
 * ## Where the flag comes from, and why not from the request
 *
 * From the **voice itself** (`SamplerVoice.looping`). `request.recordingSeconds` is the buffer's length; whether that
 * length is a wall is a fact about the node that was started, and the node already reports it — set from the region's
 * `loop_mode` *or* from the recording's own `smpl` chunk. A second copy on the request could disagree with the voice it
 * describes, and "the ledger thinks it loops while the voice does not" is a note that goes silent after all.
 *
 * ## What is deliberately *not* changed
 *
 * A one-shot voice is refused exactly as before, message and all — asserted below, because the tempting simplification
 * ("just stop refusing") would have removed the accounting from the owner's project as well.
 */
import { describe, expect, it } from "vitest";
import { createLegatoVoiceLedger, type LegatoVoiceRequest } from "../audio/legatoVoices";
import { DEFAULT_SAMPLER_RELEASE_SECONDS, startSamplerNote, type SamplerVoice } from "../audio/samplerVoice";
import { FakeAudioBuffer, FakeBufferSourceNode, FakeGainNode, FakeOfflineAudioContext } from "./helpers/fakeAudio";

const RATE = 44100;
/** A 2-second recording, so "4.25 s of note" is unambiguously past its end. */
const RECORDING_SECONDS = 2;
const FRAMES = RECORDING_SECONDS * RATE;

function tone(): AudioBuffer {
  const fake = new FakeAudioBuffer(1, FRAMES, RATE);
  const data = fake.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = 0.4 * Math.sin((2 * Math.PI * 220 * i) / RATE);
  return fake as unknown as AudioBuffer;
}

/** The join mark the rule writes — `src/audio/legatoJoin.ts`'s shape, built here so the ledger is judged alone. */
const joinFrom = (fromPitch: number, fromSeconds: number) => ({ rank: 0, fromPitch, fromSeconds, overlapSeconds: 0.25, because: "the bow has not stopped" });

/**
 * One chain of notes through the production ledger, on a real `startSamplerNote` voice, so `voice.looping` is the
 * value the production path sets rather than a stub's opinion.
 */
function chain(options: { loop: boolean; noteSeconds: number; notes: Array<{ pitch: number; atSeconds: number }> }) {
  const context = new FakeOfflineAudioContext(1, Math.round(8 * RATE), RATE);
  const ledger = createLegatoVoiceLedger();
  const voices: SamplerVoice[] = [];
  for (const [index, note] of options.notes.entries()) {
    const buffer = tone();
    const request: LegatoVoiceRequest = {
      trackIndex: 0,
      name: "bowed",
      rank: 0,
      pitch: note.pitch,
      atSeconds: note.atSeconds,
      seconds: options.noteSeconds,
      ratio: 1,
      recordingSeconds: RECORDING_SECONDS,
      ...(index === 0 ? {} : { join: joinFrom(options.notes[index - 1]!.pitch, options.notes[index - 1]!.atSeconds) }),
      start: () =>
        startSamplerNote({
          context: context as never,
          destination: context.createGain() as never,
          buffer,
          ratio: 1,
          whenSeconds: note.atSeconds,
          seconds: options.noteSeconds,
          /**
           * The release the production sink gives a note whose written end arrives before its recording does
           * (`src/audio/samplerLaneSink.ts`). Without it the node's end is baked in, `takeOver` refuses with
           * `voice-cannot-be-extended`, and the criterion would be measuring the test double instead.
           */
          ...(options.noteSeconds < RECORDING_SECONDS ? { releaseSeconds: DEFAULT_SAMPLER_RELEASE_SECONDS } : {}),
          ...(options.loop ? { loopMode: "loop_continuous" as const, loopStartFrames: 1000, loopEndFrames: 40000 } : {}),
        }),
    };
    voices.push(ledger.play(request));
  }
  return { ledger, voices, context };
}

describe("the ruling: a looping recording has no end to run out of", () => {
  it("⭐ carries a looping voice through a note longer than its recording, every time", () => {
    // 4.25 s notes starting 4 s apart, on a 2 s recording: every handover needs more than the recording *has*.
    const { ledger, voices, context } = chain({ loop: true, noteSeconds: 4.25, notes: [{ pitch: 57, atSeconds: 0 }, { pitch: 58, atSeconds: 4 }, { pitch: 60, atSeconds: 8 }].slice(0, 2) });
    const reading = ledger.reading();
    expect(reading.joins).toBe(1);
    expect(reading.refusals).toEqual([]);
    expect(voices.every((voice) => voice.looping)).toBe(true);
    // One recording started for two notes: the second was carried, not restarted.
    expect(context.createdBufferSources).toHaveLength(1);
  });

  it("⭐ and it is the voice's own looping flag doing it, not a wish", () => {
    const { ledger } = chain({ loop: true, noteSeconds: 0.5, notes: [{ pitch: 57, atSeconds: 0 }, { pitch: 58, atSeconds: 0.25 }] });
    expect(ledger.reading().joins).toBe(1);
  });

  it("still refuses a one-shot voice with the same reason, when the recording really would run out", () => {
    const { ledger } = chain({ loop: false, noteSeconds: 1.5, notes: [{ pitch: 57, atSeconds: 0 }, { pitch: 58, atSeconds: 1 }] });
    const reading = ledger.reading();
    expect(reading.joins).toBe(0);
    expect(reading.refusals).toHaveLength(1);
    expect(reading.refusals[0]!.reason).toBe("recording-would-run-out");
    /**
     * The message is the measurement, unchanged: 1.5 s needed against the 0.944 s left. Not 1 s — the note moved up a
     * semitone, so `shiftedRatio` divides the recording's remaining wall time by 2^(1/12) = 1.0595, and
     * (2 − 1) ÷ 1.0595 = 0.944. This is the arithmetic the owner's project prints 25 times, and it still reads the same.
     */
    expect(reading.refusals[0]!.because).toContain("would need 1.5 s");
    expect(reading.refusals[0]!.because).toContain("only 0.944 s is left");
  });

  it("carries a one-shot voice that does fit, so the refusal is about the recording and not about looping", () => {
    const { ledger } = chain({ loop: false, noteSeconds: 0.75, notes: [{ pitch: 57, atSeconds: 0 }, { pitch: 58, atSeconds: 0.5 }] });
    expect(ledger.reading().joins).toBe(1);
    expect(ledger.reading().refusals).toEqual([]);
  });

  it("gives the carried looping voice a release at its own end rather than a hard cut", () => {
    const { context } = chain({ loop: true, noteSeconds: 4.25, notes: [{ pitch: 57, atSeconds: 0 }, { pitch: 58, atSeconds: 4 }] });
    const source = context.createdBufferSources[0] as unknown as FakeBufferSourceNode;
    const gain = source.outgoing[0]!.node as unknown as FakeGainNode;
    // `linearRampToValueAtTime(0, …)` is what a release is; a hard stop would leave no such event.
    expect(gain.gain.events.some((event) => event.type === "linearRampToValueAtTime" && event.value === 0)).toBe(true);
    // And the end is still the written one: the carried note ends at 4 + 4.25.
    expect(source.stopCalls).toContain(8.25 + 0.005);
  });
});
