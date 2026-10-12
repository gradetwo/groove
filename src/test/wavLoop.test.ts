/**
 * ⭐ **The recording's own loop, read out of a RIFF `smpl` chunk — and every way that read is refused.**
 *
 * The facts this file pins come from the libraries the mirror actually serves, measured before anything was written:
 * **136 of 136** `karoryfer-bigcat-cello/Samples/sus/*.wav` carry a 60-byte `smpl` chunk with one forward loop
 * (`A1_f_d.wav`: `54405…208385` frames of `312579`), **224 of 224** `karoryfer-string-cyborgs` samples carry one, and
 * **6 of 1830** `vsco2ce` samples do — all six `Keys/Upright Nr1/UR1_*_pp_RR*.wav`, in the `VSUpright1.sfz` program
 * that writes no loop opcode.
 *
 * ## The one convention this file exists to keep honest
 *
 * `loop_end`'s own page is explicit — *"This is inclusive - the sample specified is played as part of the loop."*
 * (<https://sfzformat.com/opcodes/loopend/>) — and the `smpl` chunk's `end` is the same field. So the frames this
 * reader returns are **the file's numbering, unconverted**, which is exactly what `loop_end` means everywhere else in
 * this codebase. `karoryfer-string-cyborgs/Samples/blackheart/C1.wav` is the case that proves the file numbering and
 * not an exclusive one: `205295` bytes of mono PCM is `205294` frames, and its loop is `0…205294` — start to the very
 * last frame. An exclusive reading would have made that `205294` frames of a `205294`-frame file, which is a different
 * answer for the last frame of every file in the library.
 *
 * ## ⭐ The red-proof is the criterion, not a claim about it
 *
 * `reads the loop points out of the first forward loop` fails if `inspectWaveLoop` stops delegating to `parseSmplLoop`
 * — measured by commenting that one call out and watching this file go red, not by asserting that it would.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createWaveLoopReader,
  inspectWaveLoop,
  parseSmplLoop,
  readWaveSustainLoop,
  readWaveSustainLoopOverHttp,
  type WaveRangeFetch,
} from "../audio/wavLoop";
import { ascii, bytesOf, dataBody, fmtBody, smplBody, u32, wave } from "./helpers/waveSmplFixture";

/** The shape bigcat really writes: the `smpl` chunk is **after** `data`, which is why a head-only read cannot see it. */
const BIGCAT_LIKE = wave([
  ["fmt ", fmtBody()],
  ["data", dataBody(312579)],
  ["smpl", smplBody([{ start: 54405, end: 208385 }])],
]);

describe("the smpl chunk, read", () => {
  it("⭐ reads the loop points out of the first forward loop", () => {
    const loop = readWaveSustainLoop(BIGCAT_LIKE);
    expect(loop).toEqual({ startFrame: 54405, endFrame: 208385 });
  });

  it("reads a 60-byte chunk the way the measured libraries write it, and ignores samplePeriod", () => {
    // C6 at 44.1 kHz: `samplePeriod` 22675 is what bigcat writes; 0 is what the VSCO upright writes, and neither is a rate.
    const withPeriod = wave([["fmt ", fmtBody()], ["data", dataBody(100)], ["smpl", smplBody([{ start: 10, end: 90 }], 22675)]]);
    const zeroPeriod = wave([["fmt ", fmtBody()], ["data", dataBody(100)], ["smpl", smplBody([{ start: 10, end: 90 }], 0)]]);
    expect(readWaveSustainLoop(withPeriod)).toEqual({ startFrame: 10, endFrame: 90 });
    expect(readWaveSustainLoop(zeroPeriod)).toEqual({ startFrame: 10, endFrame: 90 });
    // The chunk really is 60 bytes, the size every measured library writes for one loop.
    expect(smplBody([{ start: 1, end: 2 }]).length).toBe(60);
  });

  it("reads the whole-sample loop a cyborgs file writes, last frame included", () => {
    // Measured: `Samples/blackheart/C1.wav` is 0…205294 of a 205294-frame file.
    const file = wave([["fmt ", fmtBody()], ["data", dataBody(205294)], ["smpl", smplBody([{ start: 0, end: 205294 }])]]);
    expect(readWaveSustainLoop(file)).toEqual({ startFrame: 0, endFrame: 205294 });
  });

  it("finds the chunk when it comes before the data, as the freepats organ writes it", () => {
    const file = wave([["fmt ", fmtBody()], ["smpl", smplBody([{ start: 51767, end: 194072 }])], ["data", dataBody(194081)]]);
    expect(readWaveSustainLoop(file)).toEqual({ startFrame: 51767, endFrame: 194072 });
  });

  it("answers 'no loop' for the VSCO sustained strings — the files the owner's project plays", () => {
    const file = wave([["fmt ", fmtBody(2)], ["data", dataBody(200000, 2)]]);
    expect(readWaveSustainLoop(file)).toBeUndefined();
    expect(inspectWaveLoop(file).reason).toBe("the chunk list ends without a smpl chunk");
  });

  it("takes the first loop only, which is what the specification says to play", () => {
    const file = wave([["fmt ", fmtBody()], ["smpl", smplBody([{ start: 100, end: 200 }, { start: 300, end: 400 }])]]);
    expect(readWaveSustainLoop(file)).toEqual({ startFrame: 100, endFrame: 200 });
  });
});

describe("the smpl chunk, refused — a malformed file must never throw and never invent a loop", () => {
  const malformed: Array<[string, Uint8Array]> = [
    ["an empty file", new Uint8Array(0)],
    ["a file shorter than a RIFF header", ascii("RIFF")],
    ["a file that is not RIFF", bytesOf(ascii("OggS"), new Uint8Array(64))],
    ["a RIFF that is not WAVE", bytesOf(ascii("RIFF"), u32(40), ascii("AVI "), new Uint8Array(40))],
    ["a chunk size running past the end of the file", bytesOf(ascii("RIFF"), u32(40), ascii("WAVE"), ascii("smpl"), u32(0xfffffff0), new Uint8Array(8))],
    ["a smpl chunk shorter than its own header", wave([["smpl", new Uint8Array(12)]])],
    ["a smpl chunk that declares a loop but is truncated to 40 bytes", wave([["smpl", bytesOf(smplBody([{ start: 1, end: 9 }]).subarray(0, 40))]])],
    ["a smpl chunk whose loop count is absurd", wave([["smpl", bytesOf(smplBody([{ start: 1, end: 9 }]).subarray(0, 32), u32(0xfffffff0))]])],
    ["a data chunk with no declared size, so nothing after it can be found", bytesOf(ascii("RIFF"), u32(40), ascii("WAVE"), ascii("data"), u32(0), new Uint8Array(8))],
  ];

  for (const [what, file] of malformed) {
    it(`does not throw and answers no loop for ${what}`, () => {
      expect(() => readWaveSustainLoop(file)).not.toThrow();
      const inspection = inspectWaveLoop(file);
      expect(inspection.loop).toBeUndefined();
      expect(typeof inspection.reason).toBe("string");
      expect(inspection.reason!.length).toBeGreaterThan(0);
    });
  }

  it("refuses a one-sample loop rather than buzzing, naming the file's own numbers", () => {
    // Measured: `karoryfer-string-cyborgs/Samples/blackheart/singlecycle_C4.wav` writes exactly this.
    const file = wave([["fmt ", fmtBody()], ["smpl", smplBody([{ start: 210600, end: 210600 }])]]);
    expect(readWaveSustainLoop(file)).toBeUndefined();
    expect(inspectWaveLoop(file).reason).toContain("210600…210600");
    expect(inspectWaveLoop(file).reason).toContain("not a span");
  });

  it("refuses a loop that runs backwards", () => {
    const file = wave([["fmt ", fmtBody()], ["smpl", smplBody([{ start: 900, end: 100 }])]]);
    expect(readWaveSustainLoop(file)).toBeUndefined();
  });

  it("refuses a ping-pong or backward first loop instead of looping it the wrong way round", () => {
    for (const type of [1, 2]) {
      const file = wave([["fmt ", fmtBody()], ["smpl", smplBody([{ type, start: 100, end: 200 }])]]);
      expect(readWaveSustainLoop(file)).toBeUndefined();
      expect(inspectWaveLoop(file).reason).toContain(`type ${type}`);
    }
  });

  it("says a chunk with no loops is empty rather than calling it malformed", () => {
    expect(parseSmplLoop(smplBody([]))).toEqual({ reason: "the smpl chunk declares no loops" });
  });
});

describe("the smpl chunk, read over HTTP Range — without downloading the audio", () => {
  /** A server over the synthetic file that records what was actually asked for and served. */
  function rangedServer(file: Uint8Array) {
    const asked: Array<[number, number]> = [];
    let served = 0;
    const fetchRange: WaveRangeFetch = async (start, endInclusive) => {
      asked.push([start, endInclusive]);
      if (start >= file.length) return new Uint8Array(0);
      const slice = file.subarray(start, Math.min(endInclusive + 1, file.length));
      served += slice.length;
      return slice;
    };
    const nulling: WaveRangeFetch = async (start, endInclusive) => {
      asked.push([start, endInclusive]);
      return null;
    };
    return { fetchRange, nulling, asked, served: () => served };
  }

  it("⭐ finds a loop that sits after a 625 KB data body, and pulls a fraction of the file", () => {
    const server = rangedServer(BIGCAT_LIKE);
    return readWaveSustainLoopOverHttp(server.fetchRange).then((loop) => {
      expect(loop).toEqual({ startFrame: 54405, endFrame: 208385 });
      /**
       * The whole point: the audio is jumped over, not downloaded. One 64 KiB window for the header plus the tail of the
       * file where the chunk actually is — against a 625 KB sample, which is 1/10th of it.
       */
      expect(server.served()).toBeLessThan(BIGCAT_LIKE.length / 8);
      expect(server.asked[0]).toEqual([0, 65535]);
      // The second request starts exactly at the `smpl` chunk header, not at the start of the file again.
      expect(server.asked[1]![0]!).toBeGreaterThan(312579 * 2);
    });
  });

  it("finds a loop that comes before the data, in one request", async () => {
    const file = wave([["fmt ", fmtBody()], ["smpl", smplBody([{ start: 51767, end: 194072 }])], ["data", dataBody(194081)]]);
    const server = rangedServer(file);
    expect(await readWaveSustainLoopOverHttp(server.fetchRange)).toEqual({ startFrame: 51767, endFrame: 194072 });
    expect(server.asked).toHaveLength(1);
  });

  it("answers no loop when the server will not serve a range", async () => {
    const server = rangedServer(BIGCAT_LIKE);
    expect(await readWaveSustainLoopOverHttp(server.nulling)).toBeUndefined();
  });

  it("answers no loop when a truncated tail hides the chunk's body", async () => {
    // A server that returns the header window but nothing at the offset the walk asks for afterwards.
    let calls = 0;
    const shortening: WaveRangeFetch = async (start, endInclusive) => {
      calls += 1;
      if (calls === 1) return BIGCAT_LIKE.subarray(0, 65536);
      if (start < 312579 * 2) return new Uint8Array(0);
      return BIGCAT_LIKE.subarray(start, Math.min(endInclusive + 1, start + 20)); // 20 bytes of a 60-byte chunk
    };
    expect(await readWaveSustainLoopOverHttp(shortening)).toBeUndefined();
  });
});

describe("the asset reader the loader is handed", () => {
  it("reads the source address, and does not cancel the body when the range was honoured", async () => {
    const requested: Array<Record<string, unknown>> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      requested.push({ url: String(input), ...(init ?? {}) });
      const range = String((init as { headers?: Record<string, string> })?.headers?.Range ?? "");
      const match = /bytes=(\d+)-(\d+)/.exec(range)!;
      const start = Number(match[1]);
      const end = Number(match[2]);
      const slice = start >= BIGCAT_LIKE.length ? new Uint8Array(0) : BIGCAT_LIKE.subarray(start, Math.min(end + 1, BIGCAT_LIKE.length));
      return new Response(slice.slice(), { status: 206 });
    };
    const reader = createWaveLoopReader(fetchImpl);
    expect(await reader({ url: "https://example.test/a.wav" })).toEqual({ startFrame: 54405, endFrame: 208385 });
    expect(requested.length).toBe(2);
    expect(String((requested[0] as { headers: { Range: string } }).headers.Range)).toBe("bytes=0-65535");
  });

  it("refuses to read a whole file from a server that ignores the range", async () => {
    let cancelled = false;
    const fetchImpl: typeof fetch = async () => {
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(BIGCAT_LIKE);
          controller.close();
        },
        cancel() {
          cancelled = true;
        },
      });
      return new Response(body, { status: 200 });
    };
    expect(await createWaveLoopReader(fetchImpl)({ url: "https://example.test/a.wav" })).toBeUndefined();
    expect(cancelled).toBe(true);
  });

  it("tries the mirror when the source address fails, and answers no loop when both do", async () => {
    const asked: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      asked.push(url);
      if (url.includes("source")) throw new Error("no route to host");
      return new Response(new Uint8Array(0), { status: 404 });
    };
    expect(await createWaveLoopReader(fetchImpl)({ url: "https://source.test/a.wav", fallbackUrl: "https://mirror.test/a.wav" })).toBeUndefined();
    expect(asked).toEqual(["https://source.test/a.wav", "https://mirror.test/a.wav"]);
  });

  it("has no address to read and answers no loop", async () => {
    expect(await createWaveLoopReader()({})).toBeUndefined();
  });
});

/**
 * ⭐ **The reverse case, on the delivered bytes when this machine has them.**
 *
 * `VlnEns_susVib_*` are the recordings the owner's own project plays, and the whole argument that this change is a
 * no-op for it rests on their carrying no `smpl` chunk. That claim is measured on the real file here rather than
 * inferred from a synthetic one, and the assertion is skipped — not passed — when the bytes are absent, which is the
 * rule this repository already uses for a large local asset (`ownerProjectAcceptance.test.ts`).
 */
const VSCO_DIR = process.env.GROOVE_VSCO_DIR ?? "/tmp/vsco";

describe("the real recordings the owner's project plays", () => {
  it("carry no smpl chunk, so the fallback is a no-op for them", () => {
    const path = join(VSCO_DIR, "strings", "VlnEns_susVib_D3_v1.wav");
    if (!existsSync(path)) return;
    const bytes = new Uint8Array(readFileSync(path));
    expect(inspectWaveLoop(bytes)).toEqual({ reason: "the chunk list ends without a smpl chunk" });
    expect(readWaveSustainLoop(bytes)).toBeUndefined();
  });
});
