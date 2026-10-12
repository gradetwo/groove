/**
 * ⭐ **The loop a recording carries inside itself** — the RIFF `smpl` chunk, read and nothing else.
 *
 * ## Why this exists, and what the specification actually says
 *
 * The sampler in this project looped a region **only** when the SFZ text wrote `loop_*`. Measured on the libraries the
 * mirror serves, that leaves most of a bowed string library's sustain on the floor: **136 of 136** `karoryfer-bigcat-cello`
 * `Samples/sus/*.wav` carry a `smpl` chunk with a forward loop (`Samples/sus/A1_f_d.wav`: frames `54405…208385` of
 * `312579`, i.e. `1.234…4.725 s` of a 7.087 s recording), and so do **224 of 224** `karoryfer-string-cyborgs` samples.
 * The library's own program writes **no loop opcode at all** — `Programs/01- Bowed (velocity layer).sfz` has zero
 * `loop*=` lines — so today those loop points are read by nobody and the recording plays once and stops.
 *
 * That is not a missing feature, it is a **missing fallback the SFZ format defines**:
 *
 *   · `loop_mode`'s own page: *"If `loop_mode` is not specified, each sample will play according to its predefined loop
 *     mode according to the loop metadata in the audio file. That is, the player will play the sample looped using the
 *     first defined loop, if available. If no loops are defined (which is usually the case with most files), the wave
 *     will play unlooped."* — with the default stated as *"**no_loop** for samples without a loop defined,
 *     **loop_continuous** for samples with defined loop(s)"*. <https://sfzformat.com/opcodes/loopmode/>
 *   · `loop_start`: *"If `loop_start` is not specified and the sample has a loop defined, the SFZ player will use the
 *     start point of the first loop defined in the file."* <https://sfzformat.com/opcodes/loopstart/>
 *   · `loop_end`: *"If `loop_end` is not specified and the sample has a loop defined, the SFZ player will use the end
 *     point of the first loop defined in the file."* <https://sfzformat.com/opcodes/loopend/>
 *
 * So the priority this module feeds is the specification's own: **an explicit SFZ opcode wins; an absent one defers to
 * the recording.** The SFZ half of that decision is made by `sampleLoader` (which can see both), and the recording half
 * is here.
 *
 * ## What it reads, and what it deliberately does not
 *
 * A `smpl` chunk is nine `uint32`s and then, per loop, six more (`cuePointID`, `type`, `start`, `end`, `fraction`,
 * `playCount`). The measured libraries all write **one** loop of **type 0** (forward) in a **60-byte** chunk, and this
 * reader answers exactly that and no more:
 *
 *   · **the first loop only** — the specification's "the first defined loop", and 0 of the 1 830+ measured files has
 *     more than one;
 *   · **type 0 (forward) only** — `AudioBufferSourceNode` loops forward; a ping-pong (`type 1`) or backward (`type 2`)
 *     loop has no forward equivalent, so a file whose first loop is one of those is left unlooped rather than looped
 *     the wrong way round. This is a refusal, not a conversion;
 *   · **a positive span only** — `start === end` is a one-sample loop (a buzz, not a sustain). One real file does this
 *     (`karoryfer-string-cyborgs/Samples/blackheart/singlecycle_C4.wav`, `210600…210600`) and it is refused here.
 *   · **`samplePeriod` is ignored.** `Keys/Upright Nr1/UR1_C6_pp_RR1.wav` writes `samplePeriod = 0`, so it is not a
 *     usable rate; frames are the honest unit, and `samplerVoice` converts them against the **decoded buffer's** own
 *     `sampleRate`, which is the only rate that is true after `decodeAudioData`.
 *
 * ## ⚠️ `end` is inclusive — the one convention this file must not get wrong
 *
 * `loop_end`'s page is explicit: *"This is inclusive - the sample specified is played as part of the loop."*
 * <https://sfzformat.com/opcodes/loopend/> — and the `smpl` chunk's `end` is the same field in the same numbering. So
 * the frames returned here are **the file's own numbering, exactly as written**, which is also what
 * `ResolvedInstrumentNote.loopStartFrames`/`loopEndFrames` mean. Nothing is converted, because a second convention in
 * the middle of the chain is how an off-by-one becomes unfindable; `samplerVoice` performs the single conversion it
 * already performed for SFZ's own `loop_end` (a frame count divided by the decoded buffer's rate).
 *
 * ## Stability, and the two ways the bytes arrive
 *
 * **{@link inspectWaveLoop} takes bytes and never throws.** A truncated RIFF header, a chunk size larger than the file,
 * a `smpl` chunk shorter than its own header, a loop count that promises records the file does not contain, a file
 * that is not RIFF at all — each is a named `reason` and no loop, never an exception into a note resolution.
 *
 * **{@link readWaveSustainLoopOverHttp} walks the chunk list over HTTP `Range` requests and never loads the audio.**
 * That matters because the `smpl` chunk is **not** in the header of the files this project actually plays: bigcat writes
 * `fmt, data, cue, LIST, SyLp, smpl` — the chunk that carries the loop is **after** a 600 KB–1 MB `data` body, so a
 * head-only read cannot see it and a whole-file read is exactly what this workstream forbids. The walker therefore
 * reads an 8-byte chunk header, jumps over the body **arithmetically**, and asks for the next header where it actually
 * is. On bigcat that is two small requests per sample instead of a 600 KB download.
 *
 * The mirror answers both halves of that: `curl -D- -H 'Range: bytes=0-99'` returns `HTTP/2 206` with
 * `content-range: bytes 0-99/388276`, and a CORS preflight is answered with `access-control-allow-headers: range`.
 */

/** A loop as the recording wrote it: frames of the source sample, `endFrame` inclusive — SFZ's own convention. */
export interface WaveLoopPoints {
  startFrame: number;
  endFrame: number;
}

/** What the reader found, or why there is no loop. `reason` is present exactly when `loop` is not. */
export interface WaveLoopInspection {
  loop?: WaveLoopPoints;
  reason?: string;
}

/** Where a recording's bytes can be asked for. Both addresses are tried, source first — the loader's own two-address rule. */
export interface WaveLoopSource {
  url?: string;
  fallbackUrl?: string;
}

const RIFF_HEADER_BYTES = 12;
const CHUNK_HEADER_BYTES = 8;
const SMPL_HEADER_BYTES = 36;
const SMPL_LOOP_BYTES = 24;
/** A chunk list longer than this is not a wave file, it is a loop of grief. */
const MAX_CHUNKS = 512;
/** More loops than this in one `smpl` chunk is a malformed count, not a claim to read. */
const MAX_LOOPS = 4096;
/** How much of the chunk list one HTTP request asks for. */
const RANGE_WINDOW_BYTES = 65536;

/** The four ASCII bytes at `offset`, or `""` when they are not there. */
function fourCC(bytes: Uint8Array, offset: number): string {
  if (offset + 4 > bytes.length) return "";
  return String.fromCharCode(bytes[offset]!, bytes[offset + 1]!, bytes[offset + 2]!, bytes[offset + 3]!);
}

function uint32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 24)) >>> 0
  );
}

function isRiffWave(bytes: Uint8Array): boolean {
  return bytes.length >= RIFF_HEADER_BYTES && fourCC(bytes, 0) === "RIFF" && fourCC(bytes, 8) === "WAVE";
}

/**
 * **The `smpl` body, as one loop or one reason.**
 *
 * `count === 0` is not a defect — a file may carry the chunk with nothing in it — but it is also not a loop, and the
 * distinction is kept in the wording rather than collapsed into "malformed".
 */
export function parseSmplLoop(body: Uint8Array): WaveLoopInspection {
  if (body.length < SMPL_HEADER_BYTES) {
    return { reason: `the smpl chunk is ${body.length} byte(s), short of its own ${SMPL_HEADER_BYTES}-byte header` };
  }
  const count = uint32(body, 28);
  if (count === 0) return { reason: "the smpl chunk declares no loops" };
  if (count > MAX_LOOPS) return { reason: `the smpl chunk declares ${count} loops, which is a malformed count rather than a claim to read` };
  if (SMPL_HEADER_BYTES + SMPL_LOOP_BYTES > body.length) {
    return { reason: `the smpl chunk declares ${count} loop(s) but is only ${body.length} byte(s), so the first record is truncated` };
  }
  const type = uint32(body, SMPL_HEADER_BYTES + 4);
  if (type !== 0) {
    return {
      reason: `the first loop is type ${type}, which is not forward; a ping-pong or backward loop has no forward equivalent, so the recording is left unlooped rather than looped the wrong way round`,
    };
  }
  const startFrame = uint32(body, SMPL_HEADER_BYTES + 8);
  const endFrame = uint32(body, SMPL_HEADER_BYTES + 12);
  /**
   * `end` is inclusive, so `end === start` is a **one-sample** loop. That is refused deliberately: one real file writes
   * it (`karoryfer-string-cyborgs/Samples/blackheart/singlecycle_C4.wav`, `210600…210600`) and repeating a single
   * sample is a buzz, not a sustain — the same "wrong but audible" shape `samplerVoice` already refuses when a loop end
   * is not past its start.
   */
  if (endFrame <= startFrame) {
    return { reason: `the first loop is ${startFrame}…${endFrame} frames, which is not a span` };
  }
  return { loop: { startFrame, endFrame } };
}

/**
 * **The loop in a RIFF/WAVE byte range, read without copying the audio.**
 *
 * `bytes` must begin at the file's first byte. Chunk bodies are jumped over by their declared size, so the only bytes
 * ever indexed are the 4-byte ids, the 4-byte sizes and the `smpl` body itself — a 600 KB `data` chunk costs nothing.
 * A `smpl` chunk that is not wholly inside `bytes` is reported as truncated rather than parsed from a partial record.
 */
export function inspectWaveLoop(bytes: Uint8Array): WaveLoopInspection {
  if (bytes.length < RIFF_HEADER_BYTES) return { reason: `only ${bytes.length} byte(s) were available, fewer than a RIFF header` };
  if (!isRiffWave(bytes)) return { reason: "the file is not RIFF/WAVE" };
  let offset = RIFF_HEADER_BYTES;
  for (let seen = 0; seen < MAX_CHUNKS; seen += 1) {
    if (offset + CHUNK_HEADER_BYTES > bytes.length) return { reason: "the chunk list ends without a smpl chunk" };
    const id = fourCC(bytes, offset);
    const size = uint32(bytes, offset + 4);
    if (id === "smpl") {
      const from = offset + CHUNK_HEADER_BYTES;
      if (from + size > bytes.length) {
        return { reason: `the smpl chunk declares ${size} byte(s) and only ${bytes.length - from} were available` };
      }
      return parseSmplLoop(bytes.subarray(from, from + size));
    }
    /**
     * A `data` chunk whose size is 0 is a **streamed** writer's, and nothing can be said about what follows it — the
     * same reading `scripts/lib/wav.mjs` takes. Stopping is honest; guessing an offset is not.
     */
    if (id === "data" && size === 0) return { reason: "the data chunk declares no size, so nothing after it can be located" };
    offset += CHUNK_HEADER_BYTES + size + (size % 2);
  }
  return { reason: `the chunk list is longer than ${MAX_CHUNKS} chunks without a smpl chunk` };
}

/** {@link inspectWaveLoop}, as the loop alone — the shape a decoder or a criterion wants. */
export function readWaveSustainLoop(bytes: Uint8Array): WaveLoopPoints | undefined {
  return inspectWaveLoop(bytes).loop;
}

/** One `Range` request. Resolves to `null` when the server did not answer with a range, which is not an error but a refusal. */
export type WaveRangeFetch = (start: number, endInclusive: number) => Promise<Uint8Array | null>;

/**
 * **The chunk list, walked over HTTP `Range` requests.**
 *
 * Each request asks for a window at an offset the walker computed, so a chunk body is never downloaded. The walk ends
 * at the first request that answers with nothing (end of file) — and a server that ignores `Range` (answering `200`
 * with the whole file instead of `206`) ends it immediately, because reading the whole file to find a header is the
 * exact cost this reader exists to avoid.
 */
export async function readWaveSustainLoopOverHttp(fetchRange: WaveRangeFetch): Promise<WaveLoopPoints | undefined> {
  let window = await fetchRange(0, RANGE_WINDOW_BYTES - 1);
  if (!window || window.length < RIFF_HEADER_BYTES) return undefined;
  if (!isRiffWave(window)) return undefined;
  let base = 0;
  let offset = RIFF_HEADER_BYTES;
  for (let seen = 0; seen < MAX_CHUNKS; seen += 1) {
    if (offset + CHUNK_HEADER_BYTES > base + window.length) {
      const next = await fetchRange(offset, offset + RANGE_WINDOW_BYTES - 1);
      if (!next || next.length === 0) return undefined;
      window = next;
      base = offset;
    }
    const at = offset - base;
    if (at + CHUNK_HEADER_BYTES > window.length) return undefined;
    const id = fourCC(window, at);
    const size = uint32(window, at + 4);
    if (id === "smpl") {
      const from = at + CHUNK_HEADER_BYTES;
      if (from + size > window.length) {
        const body = await fetchRange(offset + CHUNK_HEADER_BYTES, offset + CHUNK_HEADER_BYTES + size - 1);
        if (!body || body.length < size) return undefined;
        return parseSmplLoop(body.subarray(0, size)).loop;
      }
      return parseSmplLoop(window.subarray(from, from + size)).loop;
    }
    if (id === "data" && size === 0) return undefined;
    offset += CHUNK_HEADER_BYTES + size + (size % 2);
  }
  return undefined;
}

/**
 * ⭐ **The reader `sampleLoader` is handed: one asset, one address, one loop.**
 *
 * The two-address rule is `browserSampleDecoder`'s, for the same reason: a program may be served by the source host and
 * its bytes by the mirror, and a fallback that exists in one half of the loader and not the other is how a library
 * "loads its SFZ from the mirror and then fails to load a single note from it". A failure on both — a network error, a
 * `404`, a server that will not answer a `Range` — is **no loop, not an exception**: the note plays exactly as it did
 * before this module existed, which is the safe direction.
 */
export function createWaveLoopReader(fetchImpl: typeof fetch = fetch): (source: WaveLoopSource) => Promise<WaveLoopPoints | undefined> {
  const fromUrl = async (url: string): Promise<WaveLoopPoints | undefined> => {
    const fetchRange: WaveRangeFetch = async (start, endInclusive) => {
      const response = await fetchImpl(url, { headers: { Range: `bytes=${start}-${endInclusive}` } });
      if (response.status !== 206) {
        /**
         * `200` means the server sent the whole file and ignored the range. The body is **cancelled rather than read**,
         * because reading it is the download this reader exists to avoid; and the walk is abandoned with no loop.
         */
        try {
          await response.body?.cancel();
        } catch {
          // A body that cannot be cancelled is still a body nobody is going to read.
        }
        return null;
      }
      return new Uint8Array(await response.arrayBuffer());
    };
    return readWaveSustainLoopOverHttp(fetchRange);
  };
  return async (source) => {
    for (const url of [source.url, source.fallbackUrl]) {
      if (!url) continue;
      try {
        const loop = await fromUrl(url);
        if (loop) return loop;
      } catch {
        // The next address, or no loop. A recording whose header cannot be read is a one-shot, which is the old behaviour.
      }
    }
    return undefined;
  };
}
