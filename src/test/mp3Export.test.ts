/**
 * MP3 export: it must produce a real MP3, and it must not cost anything to users who never ask for one.
 *
 * Two things are easy to get wrong here and neither shows up in a screenshot:
 *
 *  1. the encoder can be imported *statically* by someone tidying imports, which quietly adds 67 KB gzipped to
 *     the first paint for every user — so that is asserted against the source;
 *  2. the output can be *almost* an MP3 (right size, right MIME type, wrong frame header, wrong sample rate),
 *     which every caller would happily download — so the bytes are checked for an MPEG frame sync and the
 *     sample-rate handling is tested directly.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encodeAudioBufferToMp3, nearestLameRate, resampleChannel, toInt16 } from "../audio/Mp3Exporter";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** A stand-in for `AudioBuffer`: the encoder touches only these four members (jsdom has no Web Audio). */
function fakeBuffer(seconds: number, sampleRate = 44100, channels = 2, hz = 440): AudioBuffer {
  const length = Math.round(seconds * sampleRate);
  const data = Array.from({ length: channels }, (_, channel) => {
    const samples = new Float32Array(length);
    for (let i = 0; i < length; i += 1) {
      samples[i] = Math.sin((2 * Math.PI * hz * i) / sampleRate) * (channel === 1 ? 0.5 : 1);
    }
    return samples;
  });
  return {
    sampleRate,
    numberOfChannels: channels,
    length,
    duration: seconds,
    getChannelData: (channel: number) => data[channel],
  } as unknown as AudioBuffer;
}

/** MPEG audio frame sync: eleven set bits, i.e. `0xFF` then the top three bits of the next byte. */
function hasFrameSync(bytes: Uint8Array): boolean {
  for (let i = 0; i < Math.min(bytes.length - 1, 4096); i += 1) {
    if (bytes[i] === 0xff && (bytes[i + 1] & 0xe0) === 0xe0) return true;
  }
  return false;
}

describe("MP3 export", () => {
  it("encodes a real MPEG stream", async () => {
    const { blob, resampled, bitrateKbps } = await encodeAudioBufferToMp3(fakeBuffer(0.5));
    expect(blob.type).toBe("audio/mpeg");
    // A half-second of stereo audio at 192 kbps is ~12 KB; anything under a kilobyte is not audio.
    expect(blob.size).toBeGreaterThan(4000);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(hasFrameSync(bytes), "no MPEG frame sync in the encoder's output").toBe(true);
    expect(resampled).toBe(false);
    expect(bitrateKbps).toBe(192);
  }, 20000);

  it("reports progress and reaches 1", async () => {
    const seen: number[] = [];
    await encodeAudioBufferToMp3(fakeBuffer(0.5), { onProgress: (fraction) => seen.push(fraction) });
    expect(seen.length).toBeGreaterThan(1);
    expect(Math.max(...seen)).toBe(1);
  }, 20000);

  it("takes a bitrate and stays proportionate", async () => {
    const low = await encodeAudioBufferToMp3(fakeBuffer(1), { bitrateKbps: 64 });
    const high = await encodeAudioBufferToMp3(fakeBuffer(1), { bitrateKbps: 320 });
    expect(low.bitrateKbps).toBe(64);
    expect(high.bitrateKbps).toBe(320);
    expect(high.blob.size).toBeGreaterThan(low.blob.size * 3);
  }, 30000);

  it("resamples only when LAME cannot take the render rate", async () => {
    expect(nearestLameRate(44100)).toBe(44100);
    expect(nearestLameRate(48000)).toBe(48000);
    expect(nearestLameRate(22050)).toBe(32000);
    const already = fakeBuffer(0.2, 44100);
    const odd = fakeBuffer(0.2, 22050);
    expect((await encodeAudioBufferToMp3(already)).resampled).toBe(false);
    expect((await encodeAudioBufferToMp3(odd)).resampled).toBe(true);
  }, 30000);

  it("clamps and resamples without inventing samples", () => {
    const clipped = toInt16(new Float32Array([-1.5, -1, 0, 1, 1.5]));
    expect(Array.from(clipped)).toEqual([-32768, -32768, 0, 32767, 32767]);
    const ramp = new Float32Array([0, 1, 2, 3]);
    const doubled = resampleChannel(ramp, 2, 4);
    expect(doubled.length).toBe(8);
    expect(doubled[0]).toBe(0);
    expect(doubled[7]).toBe(3);
    // Same rate in, same array out — no copy, no drift.
    expect(resampleChannel(ramp, 44100, 44100)).toBe(ramp);
  });

  it("keeps the encoder out of the static import graph", () => {
    /**
     * The whole reason the call lives inside the function. A static import would put 67 KB gzipped into the
     * entry bundle, and the only symptom would be a slower first paint that nobody attributes to the MP3 menu.
     */
    const source = fs.readFileSync(path.join(ROOT, "audio", "Mp3Exporter.ts"), "utf8");
    const staticImport = /^\s*import\s[^;]*["']@breezystack\/lamejs["']/m.test(source);
    expect(staticImport, "the encoder must not be imported statically").toBe(false);
    expect(source, "the encoder should be imported dynamically").toMatch(/await import\(["']@breezystack\/lamejs["']\)/);
  });

  it("ships its licence and provenance with the app", () => {
    const notices = fs.readFileSync(path.join(ROOT, "..", "public", "THIRD_PARTY_NOTICES.md"), "utf8");
    expect(notices, "the shipped notices must name the encoder").toContain("@breezystack/lamejs");
    expect(notices, "the shipped notices must name the licence").toMatch(/LGPL-3\.0/);
    expect(notices, "the LGPL text itself must ship with the app").toMatch(/GNU LESSER GENERAL PUBLIC LICENSE/);
    const installed = JSON.parse(
      fs.readFileSync(path.join(ROOT, "..", "node_modules", "@breezystack", "lamejs", "package.json"), "utf8")
    ) as { version: string; license: string };
    expect(notices, "the notices must name the installed version").toContain(installed.version);
    expect(installed.license).toBe("LGPL-3.0");
  });
});
