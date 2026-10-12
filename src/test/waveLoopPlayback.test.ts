/**
 * ⭐ **The priority between the two layers that can declare a loop — and it is the specification's, not this project's.**
 *
 * `loop_mode`'s own page: *"If `loop_mode` is not specified, each sample will play according to its predefined loop mode
 * according to the loop metadata in the audio file. That is, the player will play the sample looped using the first
 * defined loop, if available."* — with the default stated as *"**no_loop** for samples without a loop defined,
 * **loop_continuous** for samples with defined loop(s)"*. <https://sfzformat.com/opcodes/loopmode/>
 *
 * Read the other way round, the same sentence is the priority: **an opcode that is written wins; an absent one defers
 * to the recording.** So this file judges three answers, in that order:
 *
 *   1. `loop_mode`/`loop_start`/`loop_end` written ⇒ the recording's `smpl` chunk is **not consulted at all** (and the
 *      criterion asserts the reader was never called, because "not consulted" that costs a network round trip is not
 *      what the priority means);
 *   2. `loop_mode=one_shot` or `loop_mode=no_loop` ⇒ **no loop**, even though the recording carries one. `no_loop` is
 *      the value the resolver deliberately drops into "absent", so this half is decided from the SFZ text and is the
 *      one case a reader-only implementation would get wrong;
 *   3. nothing written at all ⇒ the recording decides, as **`loop_continuous`**.
 *
 * ## The reverse case is the one that keeps the change honest
 *
 * `VSCO-2-CE`'s sustained strings are the recordings the owner's own project plays, and `VlnEns_susVib_*_v1.wav` carry
 * no `smpl` chunk — so the fallback must be a **no-op** there and the region must come back exactly as it did before,
 * with no `loopMode`, no frames and no `loopSource`. A fallback that looped "anything sustained" would pass every
 * positive criterion here and fail that one.
 */
import { describe, expect, it } from "vitest";
import { createSampleLoader, type SampleWaveLoopReader } from "../audio/sampleLoader";
import { createOfflineSamplerSink } from "../audio/samplerLaneSink";
import { FakeAudioBuffer, FakeBufferSourceNode, FakeOfflineAudioContext } from "./helpers/fakeAudio";
import type { SampleAsset } from "../data/sampleCatalogue";
import type { OfflineAudioLaneEvent } from "../audio/offlineAudioLanes";
import { readWaveSustainLoop } from "../audio/wavLoop";
import { dataBody, fmtBody, smplBody, wave } from "./helpers/waveSmplFixture";

const RATE = 44100;
/** 2 s of recording, so the frames below are unambiguous at this rate. */
const FRAMES = 2 * RATE;
const PROGRAM_URL = "https://example.test/instrument.sfz";
const ASSET: SampleAsset = {
  assetId: "test:bowed",
  name: "bowed",
  kind: "loop",
  seconds: 2,
  sfz: { url: PROGRAM_URL, path: "instrument.sfz" },
};

/** The recording the region names, as a decoded buffer. */
function buffer(frames = FRAMES, sampleRate = RATE): AudioBuffer {
  const fake = new FakeAudioBuffer(1, frames, sampleRate);
  const data = fake.getChannelData(0);
  for (let i = 0; i < frames; i += 1) data[i] = 0.5 * Math.sin((2 * Math.PI * 220 * i) / sampleRate);
  return fake as unknown as AudioBuffer;
}

/** The loop the recording itself carries — `smpl`, frames inclusive, as `src/audio/wavLoop.ts` returns it. */
const RECORDING_LOOP = { startFrame: 44100, endFrame: 88200 };

function sfz(regionLines: readonly string[]): string {
  return ["<control>", "default_path=Samples/", "<global>", "pitch_keycenter=60", "<region>", "sample=tone.wav", "lokey=60", "hikey=60", ...regionLines].join("\n");
}

interface Harness {
  loader: ReturnType<typeof createSampleLoader>;
  readerCalls: Array<{ assetId: string; url?: string }>;
  decodes: () => number;
}

function harness(program: string, loop: { startFrame: number; endFrame: number } | null = RECORDING_LOOP, decoderLoop = false): Harness {
  const readerCalls: Array<{ assetId: string; url?: string }> = [];
  const readWaveLoop: SampleWaveLoopReader = async (asset) => {
    readerCalls.push({ assetId: asset.assetId, ...(asset.url === undefined ? {} : { url: asset.url }) });
    return loop ?? undefined;
  };
  const decode = async (): Promise<AudioBuffer | { buffer: AudioBuffer; waveLoop?: { startFrame: number; endFrame: number } }> =>
    decoderLoop ? { buffer: buffer(), ...(loop ? { waveLoop: loop } : {}) } : buffer();
  const loader = createSampleLoader(decode, [ASSET], async () => program, undefined, readWaveLoop);
  return { loader, readerCalls, decodes: () => loader.decodes() };
}

describe("the SFZ wins when it speaks", () => {
  it("⭐ takes the region's own loop_mode and frames, and never asks the recording", async () => {
    const { loader, readerCalls } = harness(sfz(["loop_mode=loop_sustain", "loop_start=100", "loop_end=200"]));
    const note = await loader.loadNote(ASSET.assetId, 60);
    expect(note.loopMode).toBe("loop_sustain");
    expect(note.loopStartFrames).toBe(100);
    expect(note.loopEndFrames).toBe(200);
    expect(note.loopSource).toBe("sfz");
    // The recording's 44100…88200 must not have won, and the reader must not have been consulted to find that out.
    expect(readerCalls).toEqual([]);
  });

  it("takes loop_continuous and an absent loop_end as SFZ's own default — the sample's last frame", async () => {
    const { loader, readerCalls } = harness(sfz(["loop_mode=loop_continuous"]));
    const note = await loader.loadNote(ASSET.assetId, 60);
    expect(note.loopMode).toBe("loop_continuous");
    expect(note.loopStartFrames).toBeUndefined();
    expect(note.loopEndFrames).toBeUndefined();
    expect(note.loopSource).toBe("sfz");
    expect(readerCalls).toEqual([]);
  });

  it("keeps loop_start/loop_end without loop_mode meaning no loop, exactly as before this existed", async () => {
    const { loader, readerCalls } = harness(sfz(["loop_start=100", "loop_end=200"]));
    const note = await loader.loadNote(ASSET.assetId, 60);
    // SFZ's default is no_loop, so a file that writes only the frames still writes *something* about looping.
    expect(note.loopMode).toBeUndefined();
    expect(note.loopStartFrames).toBe(100);
    expect(note.loopEndFrames).toBe(200);
    expect(note.loopSource).toBeUndefined();
    expect(readerCalls).toEqual([]);
  });
});

describe("an explicit refusal wins over the recording", () => {
  it("⭐ refuses for loop_mode=one_shot even though the recording carries a loop", async () => {
    const { loader, readerCalls } = harness(sfz(["loop_mode=one_shot"]));
    const note = await loader.loadNote(ASSET.assetId, 60);
    expect(note.oneShot).toBe(true);
    expect(note.loopMode).toBeUndefined();
    expect(note.loopSource).toBeUndefined();
    expect(readerCalls).toEqual([]);
  });

  it("⭐ refuses for loop_mode=no_loop — the value the resolver drops, read from the text instead", async () => {
    const { loader } = harness(sfz(["loop_mode=no_loop"]));
    const note = await loader.loadNote(ASSET.assetId, 60);
    /**
     * The resolver cannot answer this: its `loopMode` field carries only the two looping values, so `no_loop` arrives
     * indistinguishable from absent. The SFZ text is what tells them apart, and this assertion is what would go red if
     * `sampleLoader` stopped reading it.
     */
    expect(note.loopMode).toBeUndefined();
    expect(note.loopStartFrames).toBeUndefined();
    expect(note.loopEndFrames).toBeUndefined();
    expect(note.loopSource).toBeUndefined();
  });

  it("refuses for a loop_mode sfizz does not model rather than falling back to the recording", async () => {
    // `continuous` is the spelling sfizz answers `Unknown loop mode` to and plays once; the text still *spoke*.
    const { loader } = harness(sfz(["loop_mode=continuous"]));
    const note = await loader.loadNote(ASSET.assetId, 60);
    expect(note.loopMode).toBeUndefined();
    expect(note.loopSource).toBeUndefined();
  });
});

describe("the recording decides only when the SFZ says nothing", () => {
  it("⭐ loops a region that declares no loop opcode at all, as loop_continuous", async () => {
    const { loader, readerCalls } = harness(sfz([]));
    const note = await loader.loadNote(ASSET.assetId, 60);
    expect(note.loopMode).toBe("loop_continuous");
    expect(note.loopStartFrames).toBe(44100);
    expect(note.loopEndFrames).toBe(88200);
    expect(note.loopSource).toBe("recording");
    expect(readerCalls).toHaveLength(1);
    expect(readerCalls[0]!.url).toBe("https://example.test/Samples/tone.wav");
  });

  it("takes the loop from a decoder that could report it, without reading the asset again", async () => {
    const { loader, readerCalls } = harness(sfz([]), RECORDING_LOOP, true);
    const note = await loader.loadNote(ASSET.assetId, 60);
    expect(note.loopMode).toBe("loop_continuous");
    expect(note.loopStartFrames).toBe(44100);
    expect(note.loopSource).toBe("recording");
    // The bytes were already in the decoder's hands; a second read of the same file is the cost this avoids.
    expect(readerCalls).toEqual([]);
  });

  it("⭐ reads the header once per sample, not once per note", async () => {
    const { loader, readerCalls, decodes } = harness(sfz([]));
    for (const pitch of [60, 60, 60, 60]) await loader.loadNote(ASSET.assetId, pitch);
    expect(readerCalls).toHaveLength(1);
    expect(decodes()).toBe(1);
  });

  it("leaves a recording with no smpl chunk exactly as it was — the VSCO sustained strings", async () => {
    const { loader } = harness(sfz([]), null);
    const note = await loader.loadNote(ASSET.assetId, 60);
    expect(note.loopMode).toBeUndefined();
    expect(note.loopStartFrames).toBeUndefined();
    expect(note.loopEndFrames).toBeUndefined();
    expect(note.loopSource).toBeUndefined();
    // Everything else about the note is unchanged, so the no-op is about the loop and not about the note.
    expect(note.samplePath).toBe("Samples/tone.wav");
    expect(note.ratio).toBe(1);
  });

  it("treats a reader that throws as 'no loop' rather than failing the note", async () => {
    const loader = createSampleLoader(async () => buffer(), [ASSET], async () => sfz([]), undefined, async () => {
      throw new Error("no route to host");
    });
    const note = await loader.loadNote(ASSET.assetId, 60);
    expect(note.loopMode).toBeUndefined();
  });

  it("does not ask a reader that was never wired", async () => {
    const loader = createSampleLoader(async () => buffer(), [ASSET], async () => sfz([]));
    const note = await loader.loadNote(ASSET.assetId, 60);
    expect(note.loopMode).toBeUndefined();
    expect(note.loopSource).toBeUndefined();
  });
});

describe("the real reader, end to end — bytes, region, note, voice", () => {
  /**
   * ⭐ **The one chain that goes red if the `smpl` read itself is disabled.**
   *
   * The cases above inject a reader that already knows the answer, so they judge the **priority** and not the read. This
   * one builds a real RIFF file byte by byte — the shape bigcat writes, `smpl` **after** a 312 579-frame `data` body —
   * hands `readWaveSustainLoop` in as the loader's reader, and follows the answer all the way to the
   * `AudioBufferSourceNode`'s `loopStart`/`loopEnd`. Commenting out the line inside `inspectWaveLoop` that parses the
   * chunk makes this fail at its first assertion.
   */
  it("⭐ reads a constructed WAV's loop and loops the voice by it", async () => {
    const frames = 312579;
    const wav = wave([
      ["fmt ", fmtBody()],
      ["data", dataBody(frames)],
      ["smpl", smplBody([{ start: 54405, end: 208385 }])],
    ]);
    const loader = createSampleLoader(
      async () => buffer(frames),
      [ASSET],
      async () => sfz([]),
      undefined,
      // The real reader, over the real bytes — the network half is judged in `wavLoop.test.ts`.
      async (asset) => {
        expect(asset.url).toBe("https://example.test/Samples/tone.wav");
        return readWaveSustainLoop(wav);
      }
    );
    const note = await loader.loadNote(ASSET.assetId, 60);
    expect(note.loopMode).toBe("loop_continuous");
    expect(note.loopStartFrames).toBe(54405);
    expect(note.loopEndFrames).toBe(208385);
    expect(note.loopSource).toBe("recording");

    const context = new FakeOfflineAudioContext(1, 16 * RATE, RATE);
    const sink = createOfflineSamplerSink({ context: context as never, destination: context.createGain() as never });
    sink.start(
      note.buffer,
      { trackIndex: 0, track_id: "audio", name: "bowed", assetId: ASSET.assetId, pitch: 60, atSeconds: 0, seconds: 10, gainDb: 0 },
      note.ratio,
      note
    );
    const source = context.createdBufferSources[0] as unknown as FakeBufferSourceNode;
    expect(source.loop).toBe(true);
    expect(source.loopStart).toBeCloseTo(54405 / RATE, 9);
    expect(source.loopEnd).toBeCloseTo(208385 / RATE, 9);
    expect(source.stopCalls).toContain(10);
  });
});

describe("the loop reaches the voice", () => {
  /** One lane event, the shape the planner produces for a note. */
  const event: OfflineAudioLaneEvent = {
    trackIndex: 0,
    track_id: "audio",
    name: "bowed",
    assetId: ASSET.assetId,
    pitch: 60,
    atSeconds: 0,
    seconds: 10,
    gainDb: 0,
  };

  async function start(options: { loopMode?: "loop_continuous" | "loop_sustain"; loopStartFrames?: number; loopEndFrames?: number }) {
    const context = new FakeOfflineAudioContext(1, 16 * RATE, RATE);
    const sink = createOfflineSamplerSink({ context: context as never, destination: context.createGain() as never });
    const decoded = buffer();
    sink.start(decoded, event, 1, {
      buffer: decoded,
      ratio: 1,
      samplePath: "tone.wav",
      ...options,
    } as never);
    return context.createdBufferSources[0] as unknown as FakeBufferSourceNode;
  }

  it("⭐ sets loopStart/loopEnd from the recording's frames, converted against the buffer's own rate", async () => {
    const source = await start({ loopMode: "loop_continuous", loopStartFrames: 44100, loopEndFrames: 88200 });
    expect(source.loop).toBe(true);
    expect(source.loopStart).toBeCloseTo(1, 9);
    expect(source.loopEnd).toBeCloseTo(2, 9);
    // The note's own end is still honoured — a loop is not a licence to ring past the written note.
    expect(source.stopCalls).toContain(10);
  });

  it("leaves the recording unlooped when there is no loop at all", async () => {
    const source = await start({});
    expect(source.loop).toBe(false);
    /**
     * 10 s of note on a 2 s recording: the old behaviour, and the one the owner's project still gets. The end is a
     * `duration` scheduled inside the node rather than a `stop()`, which is exactly why a carried voice on such a
     * recording cannot be extended — see `samplerVoice.takeOver`.
     */
    expect(source.started[0]!.duration).toBe(10);
    expect(source.stopCalls).toEqual([]);
  });
});
