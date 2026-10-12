/**
 * ⭐ **The live half: the recording's own `smpl` loop reaching a voice that is playing right now.**
 *
 * The offline export path was wired in the previous round (`WavExporter` + `src/audio/wavLoop.ts`). This file judges the
 * other side of the same seam: `browserSampleDecoder` is the one place in live playback that holds a sample's **bytes**
 * — `decodeAudioData` detaches the `ArrayBuffer` it is given, so the moment between the fetch and the decode is the
 * only moment the `smpl` chunk can be read at all. Reading it there costs **zero extra requests**, which is what makes
 * this wiring better than the offline one rather than a copy of it.
 *
 * Three answers are judged, and they are the three that matter for a player:
 *
 *   1. **A live voice loops by the recording's own loop** — driven through `browserSampleSink`, the sink the
 *      audio-lane player uses, and read off the `AudioBufferSourceNode`'s `loop`/`loopStart`/`loopEnd`;
 *   2. **SFZ still wins** — a region that writes `loop_*` overrides the recording exactly as it does offline, because
 *      the priority lives in `sampleLoader` and this file only supplies the bytes;
 *   3. **A recording with no `smpl` chunk is unchanged** — no loop, the same shape, byte for byte.
 *
 * ## ⚠️ The measured side effect this wiring carries, pinned rather than hoped about
 *
 * `vsco2ce` is **not** smpl-free: measured, **6 of its 1 830** WAVs carry a whole-recording loop —
 * `Keys/Upright Nr1/UR1_{C6,C7,G6,G7}_pp_RR{1,2}.wav`, named by `VSUpright1.sfz`, which writes zero loop opcodes. The
 * last criterion below builds that file's exact shape (stereo, 16-bit, `samplePeriod = 0`, loop `0…frames−1`) and
 * asserts it **does** loop in live playback, so the consequence has a name and a red-provable test rather than being
 * something a listener discovers.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { browserSampleDecoder, browserSampleSink } from "../audio/browserSampleGraph";
import { createSampleLoader } from "../audio/sampleLoader";
import { FakeAudioBuffer, FakeBufferSourceNode, FakeOfflineAudioContext } from "./helpers/fakeAudio";
import { dataBody, fmtBody, smplBody, wave } from "./helpers/waveSmplFixture";
import type { AudioLaneEvent } from "../audio/audioLanePlan";
import type { SampleAsset } from "../data/sampleCatalogue";

const RATE = 44100;
/** The frames the criterion decodes, so the loop's seconds are arithmetic rather than a constant to trust. */
const FRAMES = 44100;

/** A WAV the decoder can be handed: the shape bigcat writes, `smpl` after the `data` body. */
const LOOPING_WAV = wave([
  ["fmt ", fmtBody()],
  ["data", dataBody(FRAMES)],
  ["smpl", smplBody([{ start: 11025, end: 33075 }])],
]);
const ONE_SHOT_WAV = wave([
  ["fmt ", fmtBody()],
  ["data", dataBody(FRAMES)],
]);

/** What `browserSampleDecoder` calls `decodeAudioData` with, recorded so "was it a real decode" is checkable. */
function context() {
  const decoded: number[] = [];
  return {
    decodeAudioData: async (bytes: ArrayBuffer) => {
      decoded.push(bytes.byteLength);
      const buffer = new FakeAudioBuffer(1, FRAMES, RATE);
      return buffer as unknown as AudioBuffer;
    },
    decoded,
  };
}

/** `FakeOfflineAudioContext` has no `decodeAudioData` on purpose; the live decoder needs one, so it is added here. */
class LiveContext extends FakeOfflineAudioContext {
  decodeAudioData = async (): Promise<AudioBuffer> => new FakeAudioBuffer(1, FRAMES, RATE) as unknown as AudioBuffer;
}

function stubFetch(bytes: Uint8Array, status = 200): { asked: string[] } {
  const asked: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    asked.push(url);
    return {
      ok: status === 200,
      status,
      arrayBuffer: async () => bytes.slice().buffer,
    } as unknown as Response;
  });
  return { asked };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/** One instrument event, the shape `planAudioLaneEvents` produces for a note. */
function noteEvent(): AudioLaneEvent {
  return { trackIndex: 0, name: "bowed", assetId: "test:bowed", atBar: 0, atStep: 0, pitch: 60, seconds: 10 } as AudioLaneEvent;
}

describe("the live decoder reads the loop out of the bytes it already has", () => {
  it("⭐ reports the recording's loop, and asks for the bytes exactly once", async () => {
    const fetched = stubFetch(LOOPING_WAV);
    const ctx = context();
    const decoded = await browserSampleDecoder(ctx as unknown as BaseAudioContext)({ assetId: "x", url: "https://source.test/x.wav" } as SampleAsset);
    expect(decoded.waveLoop).toEqual({ startFrame: 11025, endFrame: 33075 });
    // One request, and it is the same request the decode needed: reading the header cost nothing.
    expect(fetched.asked).toEqual(["https://source.test/x.wav"]);
    expect(ctx.decoded).toEqual([LOOPING_WAV.byteLength]);
  });

  it("reports no loop for a recording that has none, and still answers with a buffer", async () => {
    stubFetch(ONE_SHOT_WAV);
    const decoded = await browserSampleDecoder(context() as unknown as BaseAudioContext)({ assetId: "x", url: "https://source.test/x.wav" } as SampleAsset);
    expect(decoded.waveLoop).toBeUndefined();
    expect(decoded.buffer).toBeDefined();
  });

  it("reads the loop from the mirror's bytes when the source address does not answer", async () => {
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      asked.push(url);
      if (url.startsWith("https://source.")) return { ok: false, status: 404 } as unknown as Response;
      return { ok: true, status: 200, arrayBuffer: async () => LOOPING_WAV.slice().buffer } as unknown as Response;
    });
    const decoded = await browserSampleDecoder(context() as unknown as BaseAudioContext)({
      assetId: "x",
      url: "https://source.test/x.wav",
      fallbackUrl: "https://mirror.test/x.wav",
    } as SampleAsset);
    expect(asked).toEqual(["https://source.test/x.wav", "https://mirror.test/x.wav"]);
    // The same recording must loop the same way whichever host served it.
    expect(decoded.waveLoop).toEqual({ startFrame: 11025, endFrame: 33075 });
  });

  it("⚠️ loops the shape the six VSCO upright-piano takes have, so the side effect is pinned", async () => {
    /**
     * The measured shape of `Keys/Upright Nr1/UR1_C6_pp_RR1.wav`: stereo, 16-bit, `samplePeriod = 0` in the `smpl`
     * chunk, and a loop from frame 0 to the last frame. Nothing here is special-cased — this is the reader doing what
     * the specification says — and that is exactly why the consequence is asserted instead of assumed.
     */
    const upright = wave([
      ["fmt ", fmtBody(2)],
      ["data", dataBody(2000, 2)],
      ["smpl", smplBody([{ start: 0, end: 1999 }], 0)],
    ]);
    stubFetch(upright);
    const decoded = await browserSampleDecoder(context() as unknown as BaseAudioContext)({ assetId: "ur1", url: "https://source.test/ur1.wav" } as SampleAsset);
    expect(decoded.waveLoop).toEqual({ startFrame: 0, endFrame: 1999 });
  });
});

describe("a live voice loops by it — through the sink the player uses", () => {
    const sfz = (regionLines: readonly string[]) =>
    ["<control>", "default_path=Samples/", "<global>", "pitch_keycenter=60", "<region>", "sample=tone.wav", "lokey=60", "hikey=60", "sample=tone.wav", ...regionLines].join("\n");

  const ASSET: SampleAsset = {
    assetId: "test:bowed",
    name: "bowed",
    kind: "loop",
    seconds: 1,
    sfz: { url: "https://source.test/prog.sfz", path: "prog.sfz" },
  };

  it("⭐ loops when the region declares nothing and the recording carries a loop", async () => {
    // The loader needs the instrument asset in its catalogue; the sample itself resolves to an address.
    stubFetch(LOOPING_WAV);
    const ctx = new LiveContext(1, 16 * RATE, RATE);
    const loader = createSampleLoader(browserSampleDecoder(ctx as unknown as BaseAudioContext), [ASSET], async () => sfz(["pitch_keycenter=60"]));
    const note = await loader.loadNote("test:bowed", 60);
    expect(note.loopMode).toBe("loop_continuous");
    expect(note.loopSource).toBe("recording");
    const sink = browserSampleSink(ctx as unknown as BaseAudioContext, ctx.createGain() as unknown as AudioNode);
    sink.start(note.buffer, 0, 0, noteEvent(), note);
    const source = ctx.createdBufferSources[0] as unknown as FakeBufferSourceNode;
    expect(source.loop).toBe(true);
    expect(source.loopStart).toBeCloseTo(11025 / RATE, 9);
    expect(source.loopEnd).toBeCloseTo(33075 / RATE, 9);
    // The written note still ends where it ends: a loop sustains, it does not ring forever.
    expect(source.stopCalls).toContain(10);
  });

  it("⭐ still lets an explicit SFZ loop win over the recording, on the live path", async () => {
    stubFetch(LOOPING_WAV);
    const ctx = new LiveContext(1, 16 * RATE, RATE);
    const program = sfz(["loop_mode=loop_sustain", "loop_start=22050", "loop_end=44100"]);
    const loader = createSampleLoader(browserSampleDecoder(ctx as unknown as BaseAudioContext), [ASSET], async () => program);
    const note = await loader.loadNote("test:bowed", 60);
    expect(note.loopMode).toBe("loop_sustain");
    expect(note.loopStartFrames).toBe(22050);
    expect(note.loopEndFrames).toBe(44100);
    expect(note.loopSource).toBe("sfz");
    const sink = browserSampleSink(ctx as unknown as BaseAudioContext, ctx.createGain() as unknown as AudioNode);
    sink.start(note.buffer, 0, 0, noteEvent(), note);
    const source = ctx.createdBufferSources[0] as unknown as FakeBufferSourceNode;
    expect(source.loop).toBe(true);
    expect(source.loopStart).toBeCloseTo(0.5, 9);
    expect(source.loopEnd).toBeCloseTo(1, 9);
  });

  it("does not loop when the recording carries no loop and the region asks for none", async () => {
    stubFetch(ONE_SHOT_WAV);
    const ctx = new LiveContext(1, 16 * RATE, RATE);
    const loader = createSampleLoader(browserSampleDecoder(ctx as unknown as BaseAudioContext), [ASSET], async () => sfz(["pitch_keycenter=60"]));
    const note = await loader.loadNote("test:bowed", 60);
    expect(note.loopMode).toBeUndefined();
    expect(note.loopSource).toBeUndefined();
    const sink = browserSampleSink(ctx as unknown as BaseAudioContext, ctx.createGain() as unknown as AudioNode);
    sink.start(note.buffer, 0, 0, noteEvent(), note);
    const source = ctx.createdBufferSources[0] as unknown as FakeBufferSourceNode;
    expect(source.loop).toBe(false);
    // A live note with no loop keeps the end it always had — a scheduled length inside the node.
    expect(source.started[0]!.duration).toBe(10);
  });
});
