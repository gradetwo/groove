/**
 * **A RIFF/WAVE file built byte by byte, for the criteria that judge the `smpl` reader.**
 *
 * Shared rather than copied because the two files that need it judge different halves of one chain — the reader itself
 * (`wavLoop.test.ts`) and the region/recording priority that consumes it (`waveLoopPlayback.test.ts`) — and a builder
 * that drifts between them would make the second fail for a reason the first knows nothing about.
 */
const RATE = 44100;

export function bytesOf(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

export function ascii(text: string): Uint8Array {
  return new Uint8Array([...text].map((character) => character.charCodeAt(0)));
}

export function u32(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]);
}

/** A chunk, padded to even length as RIFF requires. */
export function chunk(id: string, body: Uint8Array): Uint8Array {
  return bytesOf(ascii(id), u32(body.length), body, body.length % 2 === 1 ? new Uint8Array(1) : new Uint8Array(0));
}

export function fmtBody(channels = 1, sampleRate = RATE): Uint8Array {
  const bits = 16;
  const align = channels * (bits / 8);
  return bytesOf(
    new Uint8Array([1, 0]), // PCM
    new Uint8Array([channels & 0xff, channels >> 8]),
    u32(sampleRate),
    u32(sampleRate * align),
    new Uint8Array([align & 0xff, align >> 8]),
    new Uint8Array([bits, 0])
  );
}

/** A real PCM body: not silence, so a criterion that decodes it is decoding something. */
export function dataBody(frames = 1000, channels = 1): Uint8Array {
  const out = new Uint8Array(frames * channels * 2);
  for (let i = 0; i < frames * channels; i += 1) {
    const value = Math.round(16000 * Math.sin((2 * Math.PI * 440 * i) / RATE));
    out[i * 2] = value & 0xff;
    out[i * 2 + 1] = (value >> 8) & 0xff;
  }
  return out;
}

/** A `smpl` body: nine `uint32`s then one 24-byte record per loop. */
export function smplBody(loops: Array<{ type?: number; start: number; end: number }>, samplePeriod = 22675): Uint8Array {
  const header = bytesOf(
    u32(0), // manufacturer
    u32(0), // product
    u32(samplePeriod),
    u32(60), // MIDI unity note
    u32(0), // pitch fraction
    u32(0), // SMPTE format
    u32(0), // SMPTE offset
    u32(loops.length),
    u32(0) // sampler data
  );
  const records = loops.map((loop) => bytesOf(u32(1), u32(loop.type ?? 0), u32(loop.start), u32(loop.end), u32(0), u32(0)));
  return bytesOf(header, ...records);
}

export function wave(chunks: Array<[string, Uint8Array]>): Uint8Array {
  const body = bytesOf(...chunks.map(([id, content]) => chunk(id, content)));
  return bytesOf(ascii("RIFF"), u32(body.length + 4), ascii("WAVE"), body);
}
